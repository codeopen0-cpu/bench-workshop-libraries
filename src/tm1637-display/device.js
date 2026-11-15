// TM1637: a two-wire chip (not I2C, though it looks like it). A transfer starts when DIO falls while
// CLK is high and ends when DIO rises while CLK is high; in between, each byte goes out least
// significant bit first, a bit taken on each rising CLK, then a ninth clock for the chip's ACK.
// Commands: 0x40 "data, auto increment" (0x44: fixed address), 0xC0 + n "start at digit n" followed
// by the digits' segments, 0x80-0x8F display control (0x08 = on, 0-7 = brightness).
bench.device('tm1637', (part) => {
  const screen = part.screen('digits');
  const segs = [0, 0, 0, 0, 0, 0];
  let clk = 1, dio = 1, inFrame = false, bits = 0, byte = 0, frameBytes = [];
  let on = false, bright = 7, autoInc = true, powered = false, frames = 0, dirty = true;

  const takeFrame = (f) => {
    if (!f.length) return;
    frames++;
    const c = f[0];
    if ((c & 0xc0) === 0x40) autoInc = (c & 0x04) === 0;
    else if ((c & 0xc0) === 0xc0) {
      let a = c & 0x07;
      for (const s of f.slice(1)) { if (a < 6) segs[a] = s; if (autoInc) a++; }
    } else if ((c & 0xc0) === 0x80) { on = (c & 0x08) !== 0; bright = c & 0x07; }
    dirty = true;
  };
  const edge = (pin, lv) => {
    if (pin === 'CLK') {
      if (lv && !clk && inFrame) {
        if (bits < 8) { byte |= (dio ? 1 : 0) << bits; bits++; }
        else { frameBytes.push(byte); byte = 0; bits = 0; } // (the ninth clock: the ACK)
      }
      clk = lv;
    } else if (pin === 'DIO') {
      if (clk && dio && !lv) { inFrame = true; bits = 0; byte = 0; frameBytes = []; } // start
      else if (clk && !dio && lv && inFrame) { inFrame = false; if (bits === 8) frameBytes.push(byte); takeFrame(frameBytes); } // stop
      dio = lv;
    }
  };

  // the screen: 4 digits (6 x 11 dots each) and a colon
  const X = [0, 8, 18, 26];
  const SEGS = {
    a: [[1, 0], [2, 0], [3, 0], [4, 0]], b: [[5, 1], [5, 2], [5, 3], [5, 4]], c: [[5, 6], [5, 7], [5, 8], [5, 9]],
    d: [[1, 10], [2, 10], [3, 10], [4, 10]], e: [[0, 6], [0, 7], [0, 8], [0, 9]], f: [[0, 1], [0, 2], [0, 3], [0, 4]], g: [[1, 5], [2, 5], [3, 5], [4, 5]],
  };
  const draw = () => {
    const lit = powered && on;
    const k = 0.35 + 0.65 * ((bright + 1) / 8);
    const onCol = `rgb(${Math.round(255 * k)},${Math.round(42 * k)},${Math.round(26 * k)})`, offCol = '#2a0d0c', bg = '#121214';
    screen.fill(bg);
    for (let d = 0; d < 4; d++) {
      const s = segs[d];
      'abcdefg'.split('').forEach((name, i) => {
        for (const [x, y] of SEGS[name]) screen.set(X[d] + x, y + 1, lit && (s >> i) & 1 ? onCol : offCol);
      });
    }
    const colon = lit && (segs[1] & 0x80);
    screen.set(16, 4, colon ? onCol : offCol);
    screen.set(16, 8, colon ? onCol : offCol);
  };
  return {
    edges(events) {
      for (const [pin, lv] of events) edge(pin, lv);
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      const now = v >= 3;
      if (now !== powered) {
        powered = now;
        if (!now) { segs.fill(0); on = false; }
        dirty = true;
      }
      if (powered) { io.drive('CLK', v, 0); io.drive('DIO', v, 0); } // (its pull-ups)
      // (levels now, for boards that change pins without reporting every change)
      const c = io.level('CLK'), d = io.level('DIO');
      if (c !== null && c !== clk) edge('CLK', c);
      if (d !== null && d !== dio) edge('DIO', d);
      if (dirty) { draw(); dirty = false; }
      let litSegs = 0;
      for (const s of segs.slice(0, 4)) for (let i = 0; i < 8; i++) litSegs += (s >> i) & 1;
      io.draw(powered ? 0.003 + (on ? litSegs * 0.002 * ((bright + 1) / 8) : 0) : 0);
    },
    status() {
      if (!powered) return ['no power'];
      return [on ? `on, brightness ${bright}, ${frames} transfers` : 'off (send it a brightness: setBrightness)'];
    },
  };
});
