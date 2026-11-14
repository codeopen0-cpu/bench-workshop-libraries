// MAX7219 LED driver with an 8x8 matrix. It listens to every edge on DIN/CLK/CS: data is clocked
// in on CLK rising edges (16 bits, MSB first) and taken when CS (LOAD) rises: the top byte's low
// nibble is the register, the low byte its value. Registers: 1-8 = rows, 0x09 decode mode,
// 0x0A intensity, 0x0B scan limit, 0x0C shutdown (1 = on), 0x0F display test.
bench.device('max7219', (part) => {
  const leds = part.screen('leds');
  const rows = new Array(8).fill(0);
  let shutdown = true, test = false, intensity = 7, scanLimit = 7;
  let word = 0, bits = 0;
  const level = { DIN: 0, CLK: 0, CS: 1 };
  let powered = false, latches = 0;

  const reset = () => {
    rows.fill(0);
    shutdown = true; // a MAX7219 starts up switched off
    test = false;
    intensity = 7;
    scanLimit = 7;
    word = bits = 0;
  };
  const latch = () => {
    latches++;
    const reg = (word >> 8) & 0x0f, val = word & 0xff;
    if (reg >= 1 && reg <= 8) rows[reg - 1] = val;
    else if (reg === 0x0a) intensity = val & 0x0f;
    else if (reg === 0x0b) scanLimit = val & 0x07;
    else if (reg === 0x0c) shutdown = !(val & 1);
    else if (reg === 0x0f) test = !!(val & 1);
  };
  const draw = () => {
    const k = 0.6 + (0.4 * intensity) / 15;
    const on = `rgb(${Math.round(255 * k)}, ${Math.round(58 * k)}, ${Math.round(42 * k)})`;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const lit = powered && (test || (!shutdown && r <= scanLimit && (rows[r] >> (7 - c)) & 1));
        leds.set(c, r, lit ? on : 0);
      }
  };

  return {
    edges(events) {
      if (!powered) return;
      for (const [pin, v] of events) {
        if (pin === 'CS') {
          if (!v && level.CS) { word = 0; bits = 0; } // LOAD falls: a new word
          if (v && !level.CS && bits >= 16) latch(); // LOAD rises: take the last 16 bits
        } else if (pin === 'CLK' && v && !level.CLK && !level.CS) {
          word = ((word << 1) | level.DIN) & 0xffff;
          bits++;
        }
        if (pin in level) level[pin] = v;
      }
    },
    step(io) {
      const vcc = io.supply('VCC', 'GND');
      const now = vcc >= 4;
      if (now !== powered) {
        powered = now;
        if (!now) reset();
      }
      for (const p of ['DIN', 'CLK', 'CS']) {
        const l = io.level(p);
        if (l !== null && l !== level[p] && !(p === 'CS')) level[p] = l; // (edges keep these current; this catches slow changes)
      }
      const cs = io.level('CS');
      if (cs !== null) level.CS = cs;
      draw();
    },
    status() {
      if (!powered) return ['no power (VCC needs 4-5.5 V)'];
      if (test) return ['display test: all on'];
      if (shutdown) return ['shut down (the program must send shutdown(0, false))'];
      return [`on, brightness ${intensity}/15, ${latches} writes`];
    },
  };
});
