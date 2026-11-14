// HD44780 16x2 character LCD behind a PCF8574 I2C backpack. Every byte written to the PCF8574 sets
// its 8 outputs: P0 = RS, P1 = RW, P2 = E, P3 = backlight, P4-P7 = the LCD's D4-D7. The LCD takes
// D4-D7 when E falls. It starts in 8-bit mode (each E pulse = one whole command, only the top four
// bits seen) until a "function set" switches it to 4-bit mode (two E pulses per byte, high half first).
bench.device('lcd1602', (part) => {
  const screen = part.screen('lcd');
  const addr = Number(part.params.addr ?? 0x27);
  const ddram = new Array(128).fill(0x20);
  let ac = 0, inc = true, displayOn = false, shift = 0, fourBit = false, half = null, port = 0, powered = false, writes = 0, cgram = false;

  const reset = () => {
    ddram.fill(0x20);
    ac = 0; inc = true; displayOn = false; shift = 0; fourBit = false; half = null; port = 0; cgram = false;
  };
  const command = (c) => {
    if (c & 0x80) { ac = c & 0x7f; cgram = false; }
    else if (c & 0x40) cgram = true; // custom characters: kept out of the picture
    else if (c & 0x20) { fourBit = !(c & 0x10); half = null; }
    else if (c & 0x10) { if (!(c & 0x08)) ac = (ac + ((c & 0x04) ? 1 : -1)) & 0x7f; else shift += (c & 0x04) ? 1 : -1; }
    else if (c & 0x08) displayOn = !!(c & 0x04);
    else if (c & 0x04) inc = !!(c & 0x02);
    else if (c & 0x02) { ac = 0; shift = 0; }
    else if (c & 0x01) { ddram.fill(0x20); ac = 0; shift = 0; inc = true; }
  };
  const data = (d) => {
    if (cgram) return;
    ddram[ac] = d;
    ac = (ac + (inc ? 1 : -1)) & 0x7f;
  };
  const latch = (byte) => {
    const rs = byte & 1, nibble = byte >> 4;
    if (!fourBit) {
      const v = nibble << 4;
      return rs ? data(v) : command(v);
    }
    if (half === null) { half = nibble; return; }
    const v = (half << 4) | nibble;
    half = null;
    rs ? data(v) : command(v);
  };
  const line = (start) => {
    let s = '';
    for (let c = 0; c < 16; c++) {
      const code = ddram[(start + ((c + shift) % 40 + 40) % 40) & 0x7f];
      s += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : code < 8 ? '█' : '?';
    }
    return s;
  };

  return {
    i2c: {
      address: () => (powered ? addr : -1),
      write(bytes) {
        for (const b of bytes) {
          writes++;
          if ((port & 0x04) && !(b & 0x04)) latch(port); // E falls: the LCD takes D4-D7 (as they were while E was high)
          port = b & 0xff;
        }
        return true;
      },
      read(n) { return new Array(n).fill(port); },
    },
    step(io) {
      const now = io.supply('VCC', 'GND') >= 2.7;
      if (now !== powered) { powered = now; if (!now) reset(); }
      screen.light(powered && !!(port & 0x08));
      screen.print(0, 0, powered && displayOn ? line(0x00) : ' '.repeat(16));
      screen.print(0, 1, powered && displayOn ? line(0x40) : ' '.repeat(16));
    },
    status() {
      if (!powered) return ['no power'];
      return [`I2C 0x${addr.toString(16).toUpperCase()}, ${displayOn ? 'display on' : 'display off'}, backlight ${port & 0x08 ? 'on' : 'off'}, ${writes} bytes`];
    },
  };
});
