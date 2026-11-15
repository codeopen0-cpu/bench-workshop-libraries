// 74HC595: on each rising edge of SHCP the bits move up one (Q0 <- DS, Q7S <- the old bit 7); on a
// rising edge of STCP the shifted bits are copied to the outputs. It listens to every pin change in
// order (edges), so shiftOut() at full speed works.
bench.device('hc595', (part) => {
  let shift = 0, latch = 0, powered = false, v = 0, ds = 0, sh = 0, st = 0, mr = 1, bytes = 0;
  const outs = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'];
  return {
    edges(list) {
      for (const [pin, lv] of list) {
        if (pin === 'DS') ds = lv;
        else if (pin === 'MR') { mr = lv; if (!lv) shift = 0; }
        else if (pin === 'SHCP') {
          if (lv && !sh && mr) { shift = ((shift << 1) | ds) & 0xff; bytes++; }
          sh = lv;
        } else if (pin === 'STCP') {
          if (lv && !st) latch = shift;
          st = lv;
        }
      }
    },
    step(io) {
      v = io.supply('VCC', 'GND');
      powered = v >= 2;
      // the levels now (in case a pin is held, not toggled: no edges came)
      ds = io.level('DS') ?? ds;
      mr = io.level('MR') ?? 1;
      if (!mr) shift = 0;
      sh = io.level('SHCP') ?? sh;
      st = io.level('STCP') ?? st;
      const enabled = powered && io.level('OE') !== 1;
      outs.forEach((q, i) => (enabled ? io.drive(q, (latch >> i) & 1 ? v : 0, 1) : io.release(q)));
      if (powered) io.drive('Q7S', (shift >> 7) & 1 ? v : 0, 1); else io.release('Q7S');
      io.draw(powered ? 0.0001 : 0);
    },
    status() {
      if (!powered) return ['no power'];
      return [`Q7..Q0 = ${latch.toString(2).padStart(8, '0')}`, `${Math.floor(bytes / 8)} bytes shifted in`];
    },
  };
});
