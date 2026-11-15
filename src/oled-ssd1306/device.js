// SSD1306 OLED controller on I2C. Every transfer starts with a control byte: 0x00 = commands follow,
// 0x40 = picture data follows, 0x80 / 0xC0 = one command / one data byte, then another control
// byte. The picture memory is 8 pages of 8 rows; each data byte is a column of 8 pixels in a page
// (bit 0 at the top). It only lights up after "display on" (0xAF) with its charge pump on (0x8D 0x14).
bench.device('ssd1306', (part) => {
  const screen = part.screen('oled');
  const W = screen.cols, H = screen.rows, PAGES = H / 8;
  const colour = part.params.colour ?? 'white';
  const addr = Number(part.params.addr ?? 0x3c);
  const ram = new Array(128 * 8).fill(0);
  let on = false, pump = false, invert = false, allOn = false, contrast = 0xcf, remap = false, comDec = false;
  let mode = 2, col = 0, page = 0, colStart = 0, colEnd = 127, pageStart = 0, pageEnd = 7;
  let pending = null; // a command waiting for its argument bytes: [command, args so far, how many]
  let powered = false, dirty = true, bytes = 0, frames = 0;

  const ARGS = { 0x81: 1, 0x20: 1, 0x21: 2, 0x22: 2, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1, 0x8d: 1, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0xa3: 2 };
  const command = (c, a) => {
    switch (c) {
      case 0xae: on = false; break;
      case 0xaf: on = true; break;
      case 0x8d: pump = (a[0] & 0x04) !== 0; break;
      case 0xa6: invert = false; break;
      case 0xa7: invert = true; break;
      case 0xa4: allOn = false; break;
      case 0xa5: allOn = true; break;
      case 0x81: contrast = a[0]; break;
      case 0xa0: remap = false; break;
      case 0xa1: remap = true; break;
      case 0xc0: comDec = false; break;
      case 0xc8: comDec = true; break;
      case 0x20: mode = a[0] & 3; break;
      case 0x21: colStart = a[0] & 127; colEnd = a[1] & 127; col = colStart; break;
      case 0x22: pageStart = a[0] & 7; pageEnd = a[1] & 7; page = pageStart; break;
      default:
        if (c >= 0xb0 && c <= 0xb7) page = c & 7; // page mode: which page
        else if (c <= 0x0f) col = (col & 0xf0) | c; // page mode: column, low half
        else if (c >= 0x10 && c <= 0x1f) col = (col & 0x0f) | ((c & 0x0f) << 4);
    }
    dirty = true;
  };
  const commandByte = (b) => {
    if (pending) {
      pending[1].push(b);
      if (pending[1].length >= pending[2]) { command(pending[0], pending[1]); pending = null; }
      return;
    }
    const n = ARGS[b];
    if (n) pending = [b, [], n];
    else command(b, []);
  };
  const dataByte = (b) => {
    ram[page * 128 + col] = b;
    bytes++;
    dirty = true;
    if (mode === 0) { // horizontal: along the columns, then the next page
      if (++col > colEnd) { col = colStart; if (++page > pageEnd) page = pageStart; }
    } else if (mode === 1) { // vertical: down the pages, then the next column
      if (++page > pageEnd) { page = pageStart; if (++col > colEnd) col = colStart; }
    } else col = (col + 1) & 127; // page mode
  };
  const draw = () => {
    const lit = powered && on && pump;
    const level = 0.45 + 0.55 * (contrast / 255);
    const tint = (y) => {
      const base = colour === 'blue' ? [90, 200, 255] : colour === 'yellow-blue' ? (y < 16 ? [255, 220, 60] : [90, 200, 255]) : [235, 245, 255];
      return `rgb(${Math.round(base[0] * level)},${Math.round(base[1] * level)},${Math.round(base[2] * level)})`;
    };
    for (let y = 0; y < H; y++) {
      const c = tint(y);
      const row = comDec ? y : H - 1 - y; // (what the default commands give: the picture the right way up)
      for (let x = 0; x < W; x++) {
        const cx = remap ? x : 127 - x;
        let px = allOn ? 1 : (ram[(row >> 3) * 128 + cx] >> (row & 7)) & 1;
        if (invert) px ^= 1;
        screen.set(x, y, lit && px ? c : 0);
      }
    }
  };

  return {
    i2c: {
      address: () => (powered ? addr : -1),
      write(data) {
        let i = 0;
        while (i < data.length) {
          const ctrl = data[i++];
          const isData = (ctrl & 0x40) !== 0;
          if (ctrl & 0x80) { // Co: one byte, then another control byte
            if (i < data.length) (isData ? dataByte : commandByte)(data[i++]);
          } else { // the rest are all commands, or all data
            for (; i < data.length; i++) (isData ? dataByte : commandByte)(data[i]);
          }
        }
        if (isFinite(data.length) && data.length > 100) frames++;
        return true;
      },
      read(n) { return new Array(n).fill(on ? 0x03 : 0x43); }, // (status byte)
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      const now = v >= 2.8;
      if (now !== powered) {
        powered = now;
        if (!now) { on = false; pump = false; ram.fill(0); } // (it forgets everything without power)
        dirty = true;
      }
      if (dirty) { draw(); dirty = false; }
      let litPx = 0;
      if (powered && on && pump) for (const b of ram) { let x = b; while (x) { litPx += x & 1; x >>= 1; } }
      io.draw(powered ? 0.0005 + (litPx / (W * H)) * 0.02 : 0);
    },
    status() {
      if (!powered) return ['no power (VCC 3.3-5 V)'];
      if (!on) return [`I2C 0x${addr.toString(16)}: display off (no "begin" yet?)`];
      if (!pump) return ['display on but its charge pump is off: nothing shows (begin with SSD1306_SWITCHCAPVCC)'];
      return [`I2C 0x${addr.toString(16)}, on${invert ? ', inverted' : ''}, ${bytes} picture bytes`];
    },
  };
});
