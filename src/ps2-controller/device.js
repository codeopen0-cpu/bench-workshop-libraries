// A PS2 wireless pad's receiver. The board asks with a message on ATT ([0x42, ...]); it answers on DAT
// with the pad's real data bytes: buttons (two bytes, a bit each, 0 = pressed), then the sticks RX, RY,
// LX, LY (0..255, 128 in the middle).
const BITS = { Select: 0x0001, L3: 0x0002, R3: 0x0004, Start: 0x0008, Up: 0x0010, Right: 0x0020, Down: 0x0040, Left: 0x0080, L2: 0x0100, R2: 0x0200, L1: 0x0400, R1: 0x0800, Triangle: 0x1000, Circle: 0x2000, Cross: 0x4000, Square: 0x8000 };
bench.device('ps2', (part) => {
  const on = part.control('on'), keys = part.control('buttons');
  const lx = part.control('lx'), ly = part.control('ly'), rx = part.control('rx'), ry = part.control('ry');
  const led = part.screen('led');
  let powered = false, asks = 0, pending = 0, held = '';
  return {
    step(io) {
      powered = io.supply('VCC', 'GND') >= 2.8;
      const linked = powered && on.on;
      led.set(0, 0, linked ? 1 : 0);
      if (pending && linked) {
        let b = 0;
        const down = keys.down;
        for (const k of down) b |= BITS[k] ?? 0;
        held = [...down].join(' ');
        const lo = ~b & 255, hi = (~b >> 8) & 255;
        for (let i = 0; i < pending; i++) io.send('DAT', 'data', [lo, hi, rx.value | 0, ry.value | 0, lx.value | 0, ly.value | 0]);
      }
      pending = 0;
      io.draw(powered ? 0.02 : 0);
    },
    packets(list) {
      for (const p of list) if (p.pin === 'ATT' && p.proto === 'data' && p.data[0] === 0x42) { pending = Math.min(4, pending + 1); asks++; }
    },
    status: () => [!powered ? 'no power' : !on.on ? 'pad switched off (no answer)' : `pad linked${held ? `: ${held}` : ''}`, `sticks L ${lx.value | 0},${ly.value | 0} R ${rx.value | 0},${ry.value | 0}`, `${asks} reads`],
  };
});
