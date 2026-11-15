// Touch, force and weight: each reads part.touch(id), what the physics says presses on a solid piece
// of its shape (force in newtons, and whether the pushing ball touches it).

// TTP223: a capacitive pad. A finger (the ball) or anything resting on it counts as a touch.
bench.device('ttp223', (part) => {
  const pad = part.touch('pad');
  const btn = part.control('touch');
  const toggle = part.params.mode === 'toggle';
  let powered = false, touched = false, out = false, count = 0;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 2;
      const now = pad.hand || pad.touching || btn.down;
      if (now && !touched) { count++; if (toggle) out = !out; }
      touched = now;
      if (!toggle) out = touched;
      if (!powered) { io.release('SIG'); io.draw(0); return; }
      io.drive('SIG', out ? v : 0, 1);
      io.draw(out ? 0.002 : 0.0015);
    },
    status() {
      if (!powered) return ['no power'];
      return [`${touched ? 'touched' : 'not touched'}: SIG ${out ? 'HIGH' : 'LOW'}`, `${count} touches`];
    },
  };
});

// FSR 402 with a 10k resistor to GND: AO = VCC * 10k / (10k + R), R falls as the force grows
// (about 30k at 1 N, 3k at 10 N; open circuit when nothing presses).
bench.device('fsr', (part) => {
  const pad = part.touch('pad');
  const hand = part.control('press');
  let powered = false, force = 0, ao = 0;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 2;
      // (the ball touching it presses with about 2 N: it's a fingertip)
      force = Math.max(pad.force, pad.hand ? 2 : 0, hand.value);
      const r = force > 0.02 ? 30000 / Math.pow(force, 0.95) : 1e7;
      ao = powered ? (v * 10000) / (10000 + r) : 0;
      if (!powered) { io.release('AO'); io.draw(0); return; }
      io.drive('AO', ao, 1);
      io.draw(v / (10000 + r));
    },
    status() {
      if (!powered) return ['no power'];
      return [`${force.toFixed(2)} N pressing: AO ${ao.toFixed(2)} V`];
    },
  };
});

// Limit switch / bumper: COM-NO closed while its roller (or bar) is pushed with 0.5 N or more.
bench.device('limit', (part) => {
  let surface = null;
  try { surface = part.touch('roller'); } catch { surface = part.touch('bar'); }
  let btn = null;
  try { btn = part.control('press'); } catch { /* the bumper has no button */ }
  let pressed = false, presses = 0, force = 0;
  return {
    step(io) {
      force = surface.force;
      const now = force >= 0.5 || surface.hand || !!btn?.down;
      if (now && !pressed) presses++;
      pressed = now;
      io.connect('COM', 'NO', pressed);
      io.connect('COM', 'NC', !pressed);
    },
    status() {
      return [`${pressed ? 'pressed: COM-NO closed' : 'not pressed: COM-NC closed'}`, `${presses} presses${force > 0.01 ? `, ${force.toFixed(2)} N on it` : ''}`];
    },
  };
});

// Slide potentiometer: W between GND (knob at -3 cm) and VCC (+3 cm). The run panel's slider moves
// the knob there; then it lets go, so the ball or a drag can move it too.
bench.device('slidepot', (part) => {
  const knob = part.motor('knob');
  const set = part.control('set');
  let lastSet = set.value, holdUntil = 0.5, powered = false, frac = 0.5;
  return {
    step(io) {
      if (set.value !== lastSet) { lastSet = set.value; holdUntil = io.time + 0.6; }
      if (io.time < holdUntil) knob.to(((lastSet / 100) * 6 - 3), 5);
      else knob.limp();
      frac = Math.max(0, Math.min(1, (knob.position + 3) / 6));
      const v = io.supply('VCC', 'GND');
      powered = v > 0.1;
      if (!powered) { io.release('W'); return; }
      io.drive('W', (io.v('GND') ?? 0) + v * frac, 1);
      io.draw(v / 10000);
    },
    status() {
      return [`knob at ${Math.round(frac * 100)} %${powered ? '' : ' (no power on VCC/GND)'}`];
    },
  };
});

// HX711 + load cell. DT is LOW when a reading is ready (10 a second). The included HX711.h asks
// for it with a message on SCK (the 24 clock pulses, as one message) and gets the 3 bytes back on DT.
bench.device('hx711', (part) => {
  const pan = part.touch('pan');
  const cap = Number(part.params.capacity ?? 5) * 1000; // g
  const PER_GRAM = 420 * (5000 / cap); // (a smaller cell gives more counts per gram)
  const ZERO = 8400; // the empty pan's reading (the pan's own weight, the cell's offset)
  let powered = false, ready = false, nextAt = 0, grams = 0, reads = 0, gain = 128, down = false, raw = ZERO, reply = null;
  const measure = () => {
    let g = grams * PER_GRAM;
    if (gain === 64) g /= 2;
    raw = Math.round(ZERO + g + (Math.random() - 0.5) * 60);
    return Math.max(-0x800000, Math.min(0x7fffff, raw));
  };
  return {
    packets(list) {
      for (const p of list) {
        if (p.pin !== 'SCK' || p.proto !== 'data' || !powered) continue;
        const pulses = p.data[0] ?? 25;
        if (pulses >= 60) { down = true; continue; } // (SCK held high: power down)
        down = false;
        if (pulses < 25) continue; // (SCK low again: powered up, nothing asked yet)
        if (!ready) continue; // (not ready: a real one would give garbage)
        gain = pulses === 26 ? 32 : pulses === 27 ? 64 : 128;
        const v = measure() & 0xffffff;
        reply = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
        ready = false;
        reads++;
      }
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 2.6;
      // what presses on the pan, as grams (above its capacity, the cell's reading tops out)
      grams = Math.min(cap * 1.1, pan.force / 0.00980665);
      if (!powered || down) { io.release('DT'); io.draw(down ? 0.000001 : 0); ready = false; return; }
      if (io.time >= nextAt && !ready) { ready = true; nextAt = io.time + 0.1; }
      if (reply) { io.send('DT', 'data', reply); reply = null; }
      io.drive('DT', ready ? 0 : v, 1);
      io.draw(0.0015);
    },
    status() {
      if (!powered) return ['no power'];
      if (down) return ['powered down (scale.power_down())'];
      return [`${grams.toFixed(1)} g on the pan${grams > cap ? ' (over its capacity!)' : ''}`, `${reads} readings`];
    },
  };
});
