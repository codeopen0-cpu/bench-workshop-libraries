// Colour TFTs (ST7735 128x160, ILI9341 240x320): the controller's commands over SPI, DC telling
// commands (LOW) from their data (HIGH). CASET / RASET set a window; RAMWR's data fills it with RGB565
// pixels, left to right, top to bottom. MADCTL turns and mirrors how the window lands on the glass.
const tft = (W, H) => (part) => {
  const screen = part.screen('tft');
  let powered = false, on = false, asleep = true, cmd = -1, args = [], x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1, cx = 0, cy = 0, mad = 0, inv = false, pending = -1, pixels = 0, hi = -1;
  const reset = () => {
    on = false; asleep = true; cmd = -1; args = []; mad = 0; inv = false; hi = -1;
    x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1;
    screen.fill(0);
  };
  // a pixel of the window (column c, row r) onto the glass
  const put = (c, r, rgb565) => {
    const mv = mad & 0x20, mx = mad & 0x40, my = mad & 0x80;
    const lw = mv ? H : W, lh = mv ? W : H;
    if (c >= lw || r >= lh) return;
    let a = mx ? lw - 1 - c : c, b = my ? lh - 1 - r : r;
    const px = mv ? b : a, py = mv ? a : b;
    let red = (rgb565 >> 11) & 31, green = (rgb565 >> 5) & 63, blue = rgb565 & 31;
    if (!(mad & 0x08)) { const t = red; red = blue; blue = t; } // (the glass is BGR: the BGR bit says so, else colours swap)
    let rgb = (((red * 527 + 23) >> 6) << 16) | (((green * 259 + 33) >> 6) << 8) | ((blue * 527 + 23) >> 6);
    if (inv) rgb ^= 0xffffff;
    screen.set(px, py, rgb);
    pixels++;
  };
  const data = (b) => {
    if (cmd === 0x2c) {
      if (hi < 0) { hi = b; return; }
      const v = (hi << 8) | b;
      hi = -1;
      put(cx, cy, v);
      if (++cx > x1) { cx = x0; if (++cy > y1) cy = y0; }
      return;
    }
    args.push(b);
    if (cmd === 0x2a && args.length === 4) { x0 = (args[0] << 8) | args[1]; x1 = (args[2] << 8) | args[3]; }
    else if (cmd === 0x2b && args.length === 4) { y0 = (args[0] << 8) | args[1]; y1 = (args[2] << 8) | args[3]; }
    else if (cmd === 0x36 && args.length === 1) mad = b;
  };
  const command = (c) => {
    cmd = c; args = []; hi = -1;
    if (c === 0x01) reset();
    else if (c === 0x11) asleep = false;
    else if (c === 0x10) asleep = true;
    else if (c === 0x29) on = true;
    else if (c === 0x28) on = false;
    else if (c === 0x20) inv = false;
    else if (c === 0x21) inv = true;
    else if (c === 0x2c) { cx = x0; cy = y0; }
  };
  return {
    spi: {
      transfer(bytes, pins) {
        if (!powered) return;
        if ((pins.DC ?? pins.A0) === 0) for (const b of bytes) command(b);
        else for (const b of bytes) data(b);
      },
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      const now = v >= 2.8 && io.level('RESET') !== 0;
      if (now && !powered) reset();
      if (!now && powered) screen.fill(0);
      powered = now;
      // (its backlight: LED pin HIGH, or unwired)
      screen.light(powered && on && !asleep && io.level('LED') !== 0);
      io.draw(powered ? 0.02 + (io.level('LED') !== 0 ? 0.04 : 0) : 0);
    },
    status() {
      if (!powered) return ['no power (VCC, RST high)'];
      return [`${on && !asleep ? 'on' : asleep ? 'asleep (not started: tft.initR() / tft.begin())' : 'display off'}${inv ? ', inverted' : ''}`, `${pixels} pixels drawn`];
    },
  };
};
bench.device('st7735', tft(128, 160));
bench.device('ili9341', tft(240, 320));
