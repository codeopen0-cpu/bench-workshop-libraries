// Sensors of the world around a project. What they sense comes from the run panel's controls; what
// they put out is what the real modules do (their output voltages, their comparators, warm-up).

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** a little noise, as on every real analog sensor (a few mV) */
const noise = (v) => v * (1 + (Math.random() - 0.5) * 0.004);

bench.device('soil', (part) => {
  const wet = part.control('wet');
  let out = 0, vcc = 0;
  return {
    step(io) {
      vcc = io.supply('VCC', 'GND');
      if (vcc < 3) { io.release('AOUT'); io.draw(0); return; }
      // (capacitive v1.2: ~2.4 V in dry soil, ~1.2 V soaked, on its own 3.3 V regulator)
      out = noise(2.45 - 1.25 * (wet.value / 100));
      io.drive('AOUT', Math.min(vcc, out), 1);
      io.draw(0.005);
    },
    status: () => [vcc < 3 ? 'no power' : `${Math.round(wet.value)} % wet: AOUT ${out.toFixed(2)} V`],
  };
});

bench.device('water', (part) => {
  const depth = part.control('depth');
  let out = 0, vcc = 0;
  return {
    step(io) {
      vcc = io.supply('+', '-');
      if (vcc < 3) { io.release('S'); io.draw(0); return; }
      const d = clamp(depth.value / 4, 0, 1);
      out = noise(vcc * 0.82 * Math.sqrt(d)); // (rises fast once wet, then levels off)
      io.drive('S', out, 1);
      io.draw(0.02 * d + 0.001);
    },
    status: () => [vcc < 3 ? 'no power' : depth.value > 0 ? `${depth.value.toFixed(1)} cm of water: S ${out.toFixed(2)} V` : 'dry: S 0 V'],
  };
});

bench.device('mq2', (part) => {
  const ppm = part.control('ppm');
  const threshold = Number(part.params.threshold) || 1000;
  let warm = 0, ao = 0, vcc = 0, tripped = false;
  return {
    step(io) {
      vcc = io.supply('VCC', 'GND');
      const dt = 1 / 240;
      if (vcc < 4) { warm = Math.max(0, warm - dt / 20); io.release('AO'); io.release('DO'); io.draw(0); return; }
      warm = Math.min(1, warm + dt / 20); // (about 20 s to warm up)
      // its resistance falls with gas (log-like): ~0.4 V in clean air, ~3.5 V at 10 000 ppm; cold, it
      // reads high and drifts down while it warms
      const g = ppm.value > 0 ? Math.log10(Math.max(1, ppm.value / 100)) / 2 : 0;
      const settled = 0.4 + 3.1 * clamp(g, 0, 1);
      ao = noise(vcc / 5 * (settled * warm + 2.8 * (1 - warm)));
      io.drive('AO', ao, 1);
      const sensed = warm > 0.9 ? ppm.value : 0;
      tripped = sensed >= threshold;
      io.drive('DO', tripped ? 0 : vcc, 1);
      io.draw(0.15);
    },
    status: () => [vcc < 4 ? 'no power (needs 5 V for its heater)' : warm < 1 ? `warming up (${Math.round(warm * 100)} %): readings not right yet` : `${Math.round(ppm.value)} ppm: AO ${ao.toFixed(2)} V, DO ${tripped ? 'LOW (gas!)' : 'HIGH'}`],
  };
});

bench.device('flame', (part) => {
  const flame = part.control('flame');
  let ao = 0, vcc = 0, seen = false;
  return {
    step(io) {
      vcc = io.supply('VCC', 'GND');
      if (vcc < 3) { io.release('AO'); io.release('DO'); io.draw(0); return; }
      const f = clamp(flame.value / 100, 0, 1);
      ao = noise(vcc * (0.95 - 0.85 * f)); // (more IR: the photodiode conducts, the output falls)
      seen = f > 0.3;
      io.drive('AO', ao, 1);
      io.drive('DO', seen ? 0 : vcc, 1);
      io.draw(0.004 + (seen ? 0.004 : 0));
    },
    status: () => [vcc < 3 ? 'no power' : `${seen ? 'flame seen: DO LOW' : 'no flame: DO HIGH'}, AO ${ao.toFixed(2)} V`],
  };
});

bench.device('hall', (part) => {
  const field = part.control('field');
  let ao = 0, vcc = 0, near = false;
  return {
    step(io) {
      vcc = io.supply('VCC', 'GND');
      if (vcc < 3) { io.release('AO'); io.release('DO'); io.draw(0); return; }
      const b = field.value; // mT
      ao = clamp(vcc / 2 + 0.014 * (vcc / 5) * b, 0.1, vcc - 0.1);
      // (an A3144 switches on a south pole past ~20 mT and off again under ~15: a little hysteresis)
      near = near ? b > 15 : b > 20;
      io.drive('AO', noise(ao), 1);
      io.drive('DO', near ? 0 : vcc, 1);
      io.draw(0.006);
    },
    status: () => [vcc < 3 ? 'no power' : `${Math.round(field.value)} mT: AO ${ao.toFixed(2)} V, DO ${near ? 'LOW (magnet)' : 'HIGH'}`],
  };
});

bench.device('pulse', (part) => {
  const finger = part.control('finger');
  const bpm = part.control('bpm');
  let phase = 0, s = 0, vcc = 0, beats = 0;
  return {
    step(io) {
      vcc = io.supply('+', '-');
      if (vcc < 3) { io.release('S'); io.draw(0); return; }
      const dt = 1 / 240;
      if (!finger.on) {
        s = vcc / 2 + (Math.random() - 0.5) * 0.02 * vcc; // (no finger: just the light in the room)
      } else {
        const before = phase;
        phase = (phase + (dt * bpm.value) / 60) % 1;
        if (phase < before) beats++;
        // a heartbeat's light wave: a sharp rise, a small notch, a slow fall
        const p = phase;
        const wave = Math.exp(-(((p - 0.12) / 0.05) ** 2)) * 1.0 + Math.exp(-(((p - 0.32) / 0.07) ** 2)) * 0.35;
        s = vcc / 2 + vcc * 0.28 * (wave - 0.25) + (Math.random() - 0.5) * 0.004 * vcc;
      }
      io.drive('S', clamp(s, 0, vcc), 1);
      io.draw(0.004);
    },
    status: () => [vcc < 3 ? 'no power' : finger.on ? `finger on: ${Math.round(bpm.value)} bpm, ${beats} beats` : 'no finger: nothing to see'],
  };
});
