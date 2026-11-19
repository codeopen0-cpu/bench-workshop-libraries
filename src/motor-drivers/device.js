// Motor drivers and movers. The drivers put out the motor's average voltage (a board's PWM duty times
// their supply), which is what a motor's speed follows.

/** a control pin's level as a share of the time it's HIGH (PWM), or 0 / 1 */
const duty = (io, pin) => {
  const p = io.pwm(pin);
  if (p && p.hz > 0) return Math.max(0, Math.min(1, p.duty));
  return io.level(pin) === 1 ? 1 : 0;
};

// TB6612FNG: two H-bridges. IN1/IN2 pick the way (or brake / coast), PWM the speed, STBY wakes it.
bench.device('tb6612', (part) => {
  let vm = 0, logic = false, awake = false;
  const ch = { A: 'stop', B: 'stop' };
  const channel = (io, n, in1, in2, pwm, o1, o2) => {
    const a = io.level(in1) === 1, b = io.level(in2) === 1, d = duty(io, pwm);
    if (!logic || !awake || vm < 2.5) { io.release(o1); io.release(o2); ch[n] = 'off'; return; }
    if (a && b) { io.drive(o1, 0, 2); io.drive(o2, 0, 2); ch[n] = 'brake'; return; }
    if (!a && !b) { io.release(o1); io.release(o2); ch[n] = 'coast'; return; }
    // (PWM LOW = short brake: the motor sees the average)
    const v = vm * d;
    io.drive(a ? o1 : o2, v, 2);
    io.drive(a ? o2 : o1, 0, 2);
    ch[n] = `${a ? 'forward' : 'back'} ${Math.round(d * 100)} %`;
  };
  return {
    step(io) {
      vm = io.supply('VM', 'GND');
      logic = io.supply('VCC', 'GND') >= 2.7;
      awake = io.level('STBY') === 1;
      channel(io, 'A', 'AIN1', 'AIN2', 'PWMA', 'AO1', 'AO2');
      channel(io, 'B', 'BIN1', 'BIN2', 'PWMB', 'BO1', 'BO2');
      io.draw(logic ? 0.002 : 0);
    },
    status() {
      if (!logic) return ['no logic power (VCC)'];
      if (!awake) return ['asleep: STBY must be HIGH'];
      if (vm < 2.5) return ['no motor power (VM)'];
      return [`motor A: ${ch.A}`, `motor B: ${ch.B}`, `VM ${vm.toFixed(1)} V`];
    },
  };
});

// BTS7960: two half bridges; RPWM drives M+ up, LPWM drives M- up, both enables must be HIGH.
bench.device('bts7960', (part) => {
  let vb = 0, state = 'off';
  return {
    step(io) {
      vb = io.supply('B+', 'B-');
      const logic = io.supply('VCC', 'GND') >= 3;
      const en = io.level('R_EN') === 1 && io.level('L_EN') === 1;
      if (!logic || !en || vb < 5.5) {
        io.release('M+'); io.release('M-');
        state = !logic ? 'no logic power (VCC)' : !en ? 'off: R_EN and L_EN must be HIGH' : 'no motor power (B+ / B-)';
      } else {
        const r = duty(io, 'RPWM'), l = duty(io, 'LPWM');
        io.drive('M+', vb * r, 2);
        io.drive('M-', vb * l, 2);
        state = r && l ? `both sides on (${Math.round(r * 100)} % / ${Math.round(l * 100)} %): it brakes` : r ? `one way, ${Math.round(r * 100)} %` : l ? `the other way, ${Math.round(l * 100)} %` : 'stopped';
      }
      io.drive('R_IS', 0, 1);
      io.drive('L_IS', 0, 1);
      io.draw(logic ? 0.01 : 0);
    },
    status: () => [state, `${vb.toFixed(1)} V`],
  };
});

// A vibration motor: its off-centre weight spins with the voltage it gets.
bench.device('vibration', (part) => {
  const w = part.motor('weight');
  let v = 0;
  return {
    step(io) {
      v = io.supply('+', '-');
      if (Math.abs(v) < 0.4) w.limp();
      else w.power(Math.sign(v), Math.abs(v));
      io.draw(Math.abs(v) < 0.4 ? 0 : 0.08 * Math.min(1.5, Math.abs(v) / 3));
    },
    status: () => [Math.abs(v) < 0.4 ? 'off' : `buzzing (${v.toFixed(1)} V, ${Math.round(Math.abs(w.speed) / 6)} rpm)`],
  };
});

// A push-pull solenoid: powered, the coil pulls the plunger in; off, the spring pushes it out.
bench.device('solenoid', (part) => {
  const plunger = part.motor('plunger');
  let v = 0;
  return {
    step(io) {
      v = Math.abs(io.supply('+', '-'));
      if (v >= 3) plunger.to(-1.0, v);
      else plunger.to(0, 3); // (the spring: weaker than the coil)
      io.draw(v >= 3 ? v / 20 : 0); // (a 20 ohm coil)
    },
    status: () => [v >= 3 ? `pulled in (${v.toFixed(1)} V, ${(v / 20).toFixed(2)} A)` : 'out (spring)', `plunger at ${plunger.angle.toFixed(2)} cm`],
  };
});

// A linear actuator: a DC motor on a screw; it stops at the ends of its travel by itself.
bench.device('actuator', (part) => {
  const rod = part.motor('rod');
  let v = 0, atEnd = false;
  return {
    step(io) {
      v = io.supply('M+', 'M-');
      atEnd = (v > 0 && rod.angle >= 9.95) || (v < 0 && rod.angle <= 0.05);
      if (Math.abs(v) < 0.5 || atEnd) rod.power(0, 12);
      else rod.power(Math.sign(v), Math.abs(v));
      io.draw(Math.abs(v) < 0.5 || atEnd ? 0 : 1.2 * Math.min(1.5, Math.abs(v) / 12));
    },
    status: () => [Math.abs(v) < 0.5 ? 'stopped' : atEnd ? `at its ${v > 0 ? 'outer' : 'inner'} end (its end switch stopped it)` : v > 0 ? 'pushing out' : 'pulling in', `rod out ${rod.angle.toFixed(1)} cm of 10`],
  };
});
