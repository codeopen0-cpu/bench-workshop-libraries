// Colour TFTs (ST7735 128x160, ILI9341 240x320): the controller's commands over SPI, DC telling
// commands (LOW) from their data (HIGH). CASET / RASET set a window; RAMWR's data fills it with RGB565
// pixels, left to right, top to bottom. MADCTL turns and mirrors how the window lands on the glass.
const tft = (W, H, names = { reset: 'RESET', led: 'LED' }, round = false) => (part) => {
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
    if (round) { const dx = c - W / 2 + 0.5, dy = r - H / 2 + 0.5; if (dx * dx + dy * dy > (W / 2) * (W / 2)) return; } // (a round panel: no glass in the corners)
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
      const now = v >= 2.8 && io.level(names.reset) !== 0;
      if (now && !powered) reset();
      if (!now && powered) screen.fill(0);
      powered = now;
      // (its backlight: LED pin HIGH, or unwired)
      screen.light(powered && on && !asleep && io.level(names.led) !== 0);
      io.draw(powered ? 0.02 + (io.level(names.led) !== 0 ? 0.04 : 0) : 0);
    },
    status() {
      if (!powered) return ['no power (VCC, RST high)'];
      return [`${on && !asleep ? 'on' : asleep ? 'asleep (not started: tft.initR() / tft.begin())' : 'display off'}${inv ? ', inverted' : ''}`, `${pixels} pixels drawn`];
    },
  };
};
bench.device('st7735', tft(128, 160));
bench.device('ili9341', tft(240, 320));
bench.device('st7789-240', tft(240, 240, { reset: 'RES', led: 'BLK' }));
bench.device('gc9a01', tft(240, 240, { reset: 'RST', led: 'BL' }, true));

// E-paper (SSD1680, 2.13", 250 x 122, black and white): its picture is ink, not light. Command 0x24
// fills its memory (a bit a pixel, 1 = black; rows of 32 bytes), 0x20 shows it: the panel flashes
// for about 2 seconds while BUSY is HIGH, then keeps the picture, even with the power off.
bench.device('ssd1680', (part) => {
  const W = 250, H = 122, ROW = 32;
  const screen = part.screen('epd');
  const ram = new Uint8Array(ROW * H);
  let powered = false, cmd = -1, at = 0, refreshUntil = -1, refreshes = 0, now = 0, shownOnce = false;
  const show = (invertAll = null) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let black = (ram[y * ROW + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (invertAll === 'black') black = 1;
        else if (invertAll === 'white') black = 0;
        else if (invertAll === 'invert') black ^= 1;
        screen.set(x, y, black ? 0x161616 : 0xe8e8e2);
      }
  };
  if (!shownOnce) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) screen.set(x, y, 0xe8e8e2); shownOnce = true; }
  return {
    spi: {
      transfer(bytes, pins) {
        if (!powered) return;
        if (pins.DC === 0) {
          for (const b of bytes) {
            cmd = b;
            if (b === 0x24) at = 0;
            else if (b === 0x12) at = 0; // (soft reset: the memory stays as it is)
            else if (b === 0x20) { refreshUntil = now + 2.0; refreshes++; }
          }
        } else if (cmd === 0x24) for (const b of bytes) { if (at < ram.length) ram[at++] = b; }
      },
    },
    step(io) {
      now = io.time;
      powered = io.supply('VCC', 'GND') >= 2.2;
      const busy = powered && now < refreshUntil;
      io.drive('BUSY', busy ? io.supply('VCC', 'GND') : 0, 1);
      if (refreshUntil > 0) {
        const left = refreshUntil - now;
        if (left <= 0) { show(); refreshUntil = -1; }
        else { const phase = Math.floor((2.0 - left) / 0.25); show(phase % 3 === 0 ? 'black' : phase % 3 === 1 ? 'white' : 'invert'); }
      }
      screen.light(true); // (it's ink: always "lit" by the room)
      io.draw(busy ? 0.008 : powered ? 0.00001 : 0);
    },
    status: () => [powered ? (now < refreshUntil ? 'refreshing (BUSY HIGH)...' : 'showing its picture') : 'no power: still showing its last picture (it is e-paper)', `${refreshes} refreshes`],
  };
});
