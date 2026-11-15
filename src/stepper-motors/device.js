// Stepper motors. A stepper's shaft goes where its coils' magnetic field points: each step moves the
// field (and the shaft) one notch. These devices follow every pin change the board makes (several
// steps can happen within one simulation step) and tell the shaft where it should be; if the load is
// too much or the steps come faster than it can follow, the motor itself (in the app) skips them.

// ---------------------------------------------------------------------------- 28BYJ-48 + ULN2003
// Four coils around the rotor: IN1 at 0 deg, IN2 at 90, IN3 at 180, IN4 at 270 (electrical). The
// field points at the sum of the coils that are on; one full electrical turn is 4 full steps, and
// with its 64:1 gearbox one turn of the shaft is 512 electrical turns (2048 full steps).
bench.device('uln2003', (part) => {
  const shaft = part.motor('shaft');
  const coil = { IN1: 0, IN2: 0, IN3: 0, IN4: 0 };
  let field = null; // electrical angle (deg), or null when no coil is on
  let elec = 0; // electrical degrees turned, counted over any number of turns
  let volts = 0, missed = 0, steps = 0;

  const fieldNow = () => {
    const x = coil.IN1 - coil.IN3, y = coil.IN2 - coil.IN4;
    if (!x && !y) return null;
    return (Math.atan2(y, x) * 180) / Math.PI;
  };
  const update = () => {
    const f = fieldNow();
    if (f === null) return;
    if (field !== null) {
      let d = f - field;
      while (d > 180) d -= 360;
      while (d <= -180) d += 360;
      if (Math.abs(d) > 135) missed++; // (half a turn at once: it can't tell which way, so it doesn't move)
      else {
        elec += d;
        if (Math.abs(d) > 1) steps++;
      }
    }
    field = f;
  };
  return {
    edges(events) {
      for (const [pin, lv] of events) {
        if (!(pin in coil)) continue;
        coil[pin] = lv;
        update();
      }
    },
    step(io) {
      volts = io.supply('+', '-');
      // (the levels now: catches boards that change pins without reporting each change)
      for (const p of ['IN1', 'IN2', 'IN3', 'IN4']) {
        const lv = io.level(p) ?? 0;
        if (lv !== coil[p]) { coil[p] = lv; update(); }
      }
      const on = coil.IN1 + coil.IN2 + coil.IN3 + coil.IN4;
      if (volts < 3.5) shaft.limp();
      else shaft.to(elec / 512, volts); // output degrees
      io.draw(volts >= 3.5 ? on * 0.12 : 0);
    },
    status() {
      if (volts < 3.5) return ['no power (+ needs 5 V)'];
      const on = ['IN1', 'IN2', 'IN3', 'IN4'].filter((p) => coil[p]).join('+') || 'no coil on';
      return [`${shaft.angle.toFixed(1)} deg (${Math.round(elec / 90)} full steps asked)${shaft.stalled ? ', skipping!' : ''}`, on,...(missed ? [`${missed} steps it couldn't follow (two coils across from each other)`] : [])];
    },
  };
});

// ---------------------------------------------------------------------------- NEMA 17 + A4988
// Every rising edge on STEP is one (micro)step, in the direction DIR says at that moment.
bench.device('a4988', (part) => {
  const shaft = part.motor('shaft');
  const micro = Number(part.params.micro ?? 1) || 1;
  const perTurn = 200 * micro;
  let pos = 0, dir = 0, stepLv = 0, vmot = 0, vdd = 0, enabled = true, burnt = false;
  return {
    edges(events) {
      for (const [pin, lv] of events) {
        if (pin === 'DIR') dir = lv;
        else if (pin === 'STEP') {
          if (lv && !stepLv && enabled) pos += dir ? 1 : -1;
          stepLv = lv;
        }
      }
    },
    step(io) {
      vmot = io.supply('VMOT', 'GND');
      vdd = io.supply('VDD', 'GND2');
      if (vmot > 36) burnt = true;
      enabled = (io.level('EN') ?? 0) === 0;
      dir = io.level('DIR') ?? dir;
      const s = io.level('STEP') ?? 0;
      if (s && !stepLv && enabled) pos += dir ? 1 : -1; // (a step the edges didn't show)
      stepLv = s;
      const ok = !burnt && vmot >= 8 && vdd >= 2.7 && enabled;
      if (ok) shaft.to((pos * 360) / perTurn, vmot);
      else shaft.limp();
      io.draw(ok ? 0.6 : 0);
    },
    status() {
      if (burnt) return ['burnt out: VMOT is at most 35 V'];
      if (vmot < 8) return [`no motor power (VMOT ${vmot.toFixed(1)} V, needs 8-35 V)`];
      if (vdd < 2.7) return ['no logic power (VDD needs 3-5.5 V)'];
      if (!enabled) return ['off (EN is high)'];
      return [`${pos} steps (${(pos / perTurn).toFixed(2)} turns), at ${shaft.angle.toFixed(1)} deg${shaft.stalled ? ', skipping!' : ''}`];
    },
  };
});
