// Adafruit_SSD1306 (and the Adafruit_GFX drawing it inherits), for SSD1306 OLEDs on I2C:
//   Adafruit_SSD1306 display(128, 64, &Wire, -1); display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
//   clearDisplay(), drawPixel(), drawLine(), drawRect(), fillRect(), drawCircle(), fillCircle(),
//   drawRoundRect(), drawTriangle(), drawBitmap(), setTextSize(), setTextColor(), setCursor(),
//   print(), println(), display() (sends the picture), invertDisplay(), setRotation(), dim().
// Like the real one it draws into a buffer on the board; display() sends the buffer over I2C
// (the real SSD1306 commands and data, which the part decodes).
const SSD1306_BLACK = 0, SSD1306_WHITE = 1, SSD1306_INVERSE = 2;
const BLACK = 0, WHITE = 1, INVERSE = 2;
const SSD1306_SWITCHCAPVCC = 0x02, SSD1306_EXTERNALVCC = 0x01;

// the classic 5x7 font, ASCII 32-126: five columns per character, bit 0 = the top row
const FONT5X7 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5f, 0x00, 0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x14, 0x7f, 0x14, 0x7f, 0x14, 0x24, 0x2a, 0x7f, 0x2a, 0x12, 0x23, 0x13, 0x08, 0x64, 0x62, 0x36, 0x49, 0x55, 0x22, 0x50, 0x00, 0x05, 0x03, 0x00, 0x00,
  0x00, 0x1c, 0x22, 0x41, 0x00, 0x00, 0x41, 0x22, 0x1c, 0x00, 0x08, 0x2a, 0x1c, 0x2a, 0x08, 0x08, 0x08, 0x3e, 0x08, 0x08, 0x00, 0x50, 0x30, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x60, 0x60, 0x00, 0x00, 0x20, 0x10, 0x08, 0x04, 0x02,
  0x3e, 0x51, 0x49, 0x45, 0x3e, 0x00, 0x42, 0x7f, 0x40, 0x00, 0x42, 0x61, 0x51, 0x49, 0x46, 0x21, 0x41, 0x45, 0x4b, 0x31, 0x18, 0x14, 0x12, 0x7f, 0x10, 0x27, 0x45, 0x45, 0x45, 0x39, 0x3c, 0x4a, 0x49, 0x49, 0x30, 0x01, 0x71, 0x09, 0x05, 0x03,
  0x36, 0x49, 0x49, 0x49, 0x36, 0x06, 0x49, 0x49, 0x29, 0x1e, 0x00, 0x36, 0x36, 0x00, 0x00, 0x00, 0x56, 0x36, 0x00, 0x00, 0x08, 0x14, 0x22, 0x41, 0x00, 0x14, 0x14, 0x14, 0x14, 0x14, 0x00, 0x41, 0x22, 0x14, 0x08, 0x02, 0x01, 0x51, 0x09, 0x06,
  0x32, 0x49, 0x79, 0x41, 0x3e, 0x7e, 0x11, 0x11, 0x11, 0x7e, 0x7f, 0x49, 0x49, 0x49, 0x36, 0x3e, 0x41, 0x41, 0x41, 0x22, 0x7f, 0x41, 0x41, 0x22, 0x1c, 0x7f, 0x49, 0x49, 0x49, 0x41, 0x7f, 0x09, 0x09, 0x09, 0x01, 0x3e, 0x41, 0x49, 0x49, 0x7a,
  0x7f, 0x08, 0x08, 0x08, 0x7f, 0x00, 0x41, 0x7f, 0x41, 0x00, 0x20, 0x40, 0x41, 0x3f, 0x01, 0x7f, 0x08, 0x14, 0x22, 0x41, 0x7f, 0x40, 0x40, 0x40, 0x40, 0x7f, 0x02, 0x0c, 0x02, 0x7f, 0x7f, 0x04, 0x08, 0x10, 0x7f, 0x3e, 0x41, 0x41, 0x41, 0x3e,
  0x7f, 0x09, 0x09, 0x09, 0x06, 0x3e, 0x41, 0x51, 0x21, 0x5e, 0x7f, 0x09, 0x19, 0x29, 0x46, 0x46, 0x49, 0x49, 0x49, 0x31, 0x01, 0x01, 0x7f, 0x01, 0x01, 0x3f, 0x40, 0x40, 0x40, 0x3f, 0x1f, 0x20, 0x40, 0x20, 0x1f, 0x3f, 0x40, 0x38, 0x40, 0x3f,
  0x63, 0x14, 0x08, 0x14, 0x63, 0x07, 0x08, 0x70, 0x08, 0x07, 0x61, 0x51, 0x49, 0x45, 0x43, 0x00, 0x7f, 0x41, 0x41, 0x00, 0x02, 0x04, 0x08, 0x10, 0x20, 0x00, 0x41, 0x41, 0x7f, 0x00, 0x04, 0x02, 0x01, 0x02, 0x04, 0x40, 0x40, 0x40, 0x40, 0x40,
  0x00, 0x01, 0x02, 0x04, 0x00, 0x20, 0x54, 0x54, 0x54, 0x78, 0x7f, 0x48, 0x44, 0x44, 0x38, 0x38, 0x44, 0x44, 0x44, 0x20, 0x38, 0x44, 0x44, 0x48, 0x7f, 0x38, 0x54, 0x54, 0x54, 0x18, 0x08, 0x7e, 0x09, 0x01, 0x02, 0x0c, 0x52, 0x52, 0x52, 0x3e,
  0x7f, 0x08, 0x04, 0x04, 0x78, 0x00, 0x44, 0x7d, 0x40, 0x00, 0x20, 0x40, 0x44, 0x3d, 0x00, 0x7f, 0x10, 0x28, 0x44, 0x00, 0x00, 0x41, 0x7f, 0x40, 0x00, 0x7c, 0x04, 0x18, 0x04, 0x78, 0x7c, 0x08, 0x04, 0x04, 0x78, 0x38, 0x44, 0x44, 0x44, 0x38,
  0x7c, 0x14, 0x14, 0x14, 0x08, 0x08, 0x14, 0x14, 0x18, 0x7c, 0x7c, 0x08, 0x04, 0x04, 0x08, 0x48, 0x54, 0x54, 0x54, 0x20, 0x04, 0x3f, 0x44, 0x40, 0x20, 0x3c, 0x40, 0x40, 0x20, 0x7c, 0x1c, 0x20, 0x40, 0x20, 0x1c, 0x3c, 0x40, 0x30, 0x40, 0x3c,
  0x44, 0x28, 0x10, 0x28, 0x44, 0x0c, 0x50, 0x50, 0x50, 0x3c, 0x44, 0x64, 0x54, 0x4c, 0x44, 0x00, 0x08, 0x36, 0x41, 0x00, 0x00, 0x00, 0x7f, 0x00, 0x00, 0x00, 0x41, 0x36, 0x08, 0x00, 0x08, 0x04, 0x08, 0x10, 0x08,
];
const DEGREE = [0x00, 0x06, 0x09, 0x09, 0x06]; // (char)247 / (char)176: a degree sign

class Adafruit_GFX {
  constructor(w, h) {
    this.WIDTH = w;
    this.HEIGHT = h;
    this._width = w;
    this._height = h;
    this.rotation = 0;
    this.cursor_x = 0;
    this.cursor_y = 0;
    this.textsize_x = 1;
    this.textsize_y = 1;
    this.textcolor = 1;
    this.textbgcolor = 1;
    this.wrap = true;
  }
  width() { return this._width; }
  height() { return this._height; }
  getRotation() { return this.rotation; }
  setRotation(r) {
    this.rotation = r & 3;
    const swap = this.rotation & 1;
    this._width = swap ? this.HEIGHT : this.WIDTH;
    this._height = swap ? this.WIDTH : this.HEIGHT;
  }
  setCursor(x, y) { this.cursor_x = Math.trunc(x); this.cursor_y = Math.trunc(y); }
  getCursorX() { return this.cursor_x; }
  getCursorY() { return this.cursor_y; }
  setTextSize(sx, sy) { this.textsize_x = Math.max(1, sx | 0); this.textsize_y = Math.max(1, (sy ?? sx) | 0); }
  setTextColor(c, bg) { this.textcolor = c; this.textbgcolor = bg === undefined ? c : bg; }
  setTextWrap(w) { this.wrap = !!w; }
  cp437() {}
  setFont() {}
  fillScreen(c) { this.fillRect(0, 0, this._width, this._height, c); }
  writePixel(x, y, c) { this.drawPixel(x, y, c); }
  drawFastVLine(x, y, h, c) { for (let i = 0; i < h; i++) this.drawPixel(x, y + i, c); }
  drawFastHLine(x, y, w, c) { for (let i = 0; i < w; i++) this.drawPixel(x + i, y, c); }
  fillRect(x, y, w, h, c) { for (let i = 0; i < w; i++) this.drawFastVLine(x + i, y, h, c); }
  drawRect(x, y, w, h, c) {
    this.drawFastHLine(x, y, w, c);
    this.drawFastHLine(x, y + h - 1, w, c);
    this.drawFastVLine(x, y, h, c);
    this.drawFastVLine(x + w - 1, y, h, c);
  }
  drawLine(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.drawPixel(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  drawCircle(x0, y0, r, c) {
    let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
    this.drawPixel(x0, y0 + r, c); this.drawPixel(x0, y0 - r, c); this.drawPixel(x0 + r, y0, c); this.drawPixel(x0 - r, y0, c);
    while (x < y) {
      if (f >= 0) { y--; ddy += 2; f += ddy; }
      x++; ddx += 2; f += ddx;
      for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) this.drawPixel(x0 + a, y0 + b, c);
    }
  }
  fillCircle(x0, y0, r, c) {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      this.drawFastHLine(x0 - w, y0 + y, 2 * w + 1, c);
    }
  }
  drawRoundRect(x, y, w, h, r, c) {
    this.drawFastHLine(x + r, y, w - 2 * r, c);
    this.drawFastHLine(x + r, y + h - 1, w - 2 * r, c);
    this.drawFastVLine(x, y + r, h - 2 * r, c);
    this.drawFastVLine(x + w - 1, y + r, h - 2 * r, c);
    for (let a = 0; a <= 90; a += 3) {
      const dx = Math.round(r - r * Math.cos((a * Math.PI) / 180)), dy = Math.round(r - r * Math.sin((a * Math.PI) / 180));
      this.drawPixel(x + dx, y + dy, c); this.drawPixel(x + w - 1 - dx, y + dy, c);
      this.drawPixel(x + dx, y + h - 1 - dy, c); this.drawPixel(x + w - 1 - dx, y + h - 1 - dy, c);
    }
  }
  fillRoundRect(x, y, w, h, r, c) {
    for (let j = 0; j < h; j++) {
      const d = j < r ? r - j : j >= h - r ? j - (h - 1 - r) : 0;
      const inset = d ? Math.round(r - Math.sqrt(Math.max(0, r * r - d * d))) : 0;
      this.drawFastHLine(x + inset, y + j, w - 2 * inset, c);
    }
  }
  drawTriangle(x0, y0, x1, y1, x2, y2, c) {
    this.drawLine(x0, y0, x1, y1, c);
    this.drawLine(x1, y1, x2, y2, c);
    this.drawLine(x2, y2, x0, y0, c);
  }
  fillTriangle(x0, y0, x1, y1, x2, y2, c) {
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
    const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (const [ax, ay, bx, by] of edges) if ((y >= Math.min(ay, by)) && (y <= Math.max(ay, by)) && ay !== by) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      if (xs.length >= 2) { const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs)); this.drawFastHLine(a, y, b - a + 1, c); }
    }
  }
  /** a bitmap: rows of bytes, the leftmost pixel in the top bit (as the Adafruit examples' arrays) */
  drawBitmap(x, y, bmp, w, h, c, bg) {
    const bw = Math.floor((w + 7) / 8);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const on = (bmp[j * bw + (i >> 3)] << (i & 7)) & 0x80;
        if (on) this.drawPixel(x + i, y + j, c);
        else if (bg !== undefined) this.drawPixel(x + i, y + j, bg);
      }
  }
  drawChar(x, y, ch, c, bg, sx, sy = sx) {
    const code = typeof ch === 'string' ? ch.charCodeAt(0) : ch;
    const g = code === 247 || code === 176 ? DEGREE : code >= 32 && code <= 126 ? FONT5X7.slice((code - 32) * 5, (code - 32) * 5 + 5) : [0x7f, 0x41, 0x41, 0x41, 0x7f];
    for (let i = 0; i < 6; i++) {
      const col = i < 5 ? g[i] : 0;
      for (let j = 0; j < 8; j++) {
        const on = (col >> j) & 1;
        if (on) this.fillRect(x + i * sx, y + j * sy, sx, sy, c);
        else if (bg !== c) this.fillRect(x + i * sx, y + j * sy, sx, sy, bg);
      }
    }
  }
  write(ch) {
    const code = typeof ch === 'string' ? ch.charCodeAt(0) : ch;
    if (code === 10) { this.cursor_x = 0; this.cursor_y += this.textsize_y * 8; return 1; }
    if (code === 13) return 1;
    if (this.wrap && this.cursor_x + this.textsize_x * 6 > this._width) { this.cursor_x = 0; this.cursor_y += this.textsize_y * 8; }
    this.drawChar(this.cursor_x, this.cursor_y, code, this.textcolor, this.textbgcolor, this.textsize_x, this.textsize_y);
    this.cursor_x += this.textsize_x * 6;
    return 1;
  }
  print(x = '', f) {
    let s;
    if (typeof x === 'number' && f !== undefined) s = f === 16 ? Math.trunc(x).toString(16).toUpperCase() : f === 2 ? Math.trunc(x).toString(2) : f === 8 ? Math.trunc(x).toString(8) : f === 10 ? String(Math.trunc(x)) : x.toFixed(f);
    else if (typeof x === 'number' && !Number.isInteger(x)) s = x.toFixed(2);
    else s = String(x);
    for (const ch of s) this.write(ch.charCodeAt(0) > 255 ? 63 : ch.charCodeAt(0));
    return s.length;
  }
  println(x = '', f) { const n = this.print(x, f); this.write(10); return n + 1; }
  printf(fmt, ...a) {
    this.print(String(fmt).replace(/%(-?\d*)(?:\.(\d+))?([dfsxXcu%])/g, (_m, w, p, t) => {
      if (t === '%') return '%';
      const v = a.shift();
      let s = t === 'f' ? Number(v).toFixed(p ? Number(p) : 6) : t === 'x' ? Number(v).toString(16) : t === 'X' ? Number(v).toString(16).toUpperCase() : t === 'c' ? String.fromCharCode(v) : t === 'd' || t === 'u' ? String(Math.trunc(v)) : String(v);
      const width = Math.abs(Number(w || 0));
      if (s.length < width) s = w.startsWith('-') ? s.padEnd(width) : s.padStart(width, w.startsWith('0') ? '0' : ' ');
      return s;
    }));
  }
}

class Adafruit_SSD1306 extends Adafruit_GFX {
  constructor(w = 128, h = 64, wire, reset = -1) {
    super(w, h);
    this.buffer = new Array((w * h) / 8).fill(0);
    this.addr = 0x3c;
    this.vccstate = SSD1306_SWITCHCAPVCC;
    this.contrast = 0xcf;
  }
  /** start it; false if no display answers at that address */
  begin(vcs = SSD1306_SWITCHCAPVCC, addr = 0x3c) {
    this.vccstate = vcs;
    this.addr = addr;
    Wire.begin();
    const h = this.HEIGHT;
    const ok = this.commands([
      0xae, 0xd5, 0x80, 0xa8, h - 1, 0xd3, 0x00, 0x40,
      0x8d, vcs === SSD1306_EXTERNALVCC ? 0x10 : 0x14,
      0x20, 0x00, 0xa1, 0xc8, 0xda, h === 32 ? 0x02 : 0x12,
      0x81, this.contrast, 0xd9, vcs === SSD1306_EXTERNALVCC ? 0x22 : 0xf1, 0xdb, 0x40,
      0xa4, 0xa6, 0x2e, 0xaf,
    ]);
    return ok;
  }
  commands(list) {
    Wire.beginTransmission(this.addr);
    Wire.write(0x00); // "commands follow"
    for (const c of list) Wire.write(c & 255);
    return Wire.endTransmission() === 0;
  }
  ssd1306_command(c) { this.commands([c]); }
  drawPixel(x, y, c) {
    x = Math.trunc(x); y = Math.trunc(y);
    if (x < 0 || y < 0 || x >= this._width || y >= this._height) return;
    switch (this.rotation) {
      case 1: [x, y] = [this.WIDTH - 1 - y, x]; break;
      case 2: x = this.WIDTH - 1 - x; y = this.HEIGHT - 1 - y; break;
      case 3: [x, y] = [y, this.HEIGHT - 1 - x]; break;
    }
    const i = x + (y >> 3) * this.WIDTH, bit = 1 << (y & 7);
    if (c === SSD1306_WHITE) this.buffer[i] |= bit;
    else if (c === SSD1306_BLACK) this.buffer[i] &= ~bit;
    else if (c === SSD1306_INVERSE) this.buffer[i] ^= bit;
  }
  getPixel(x, y) {
    if (x < 0 || y < 0 || x >= this.WIDTH || y >= this.HEIGHT) return false;
    return !!(this.buffer[x + (y >> 3) * this.WIDTH] & (1 << (y & 7)));
  }
  clearDisplay() { this.buffer.fill(0); }
  getBuffer() { return this.buffer; }
  /** send the picture: the column and page window, then every byte of the buffer */
  display() {
    this.commands([0x22, 0, (this.HEIGHT >> 3) - 1, 0x21, 0, this.WIDTH - 1]);
    const n = this.buffer.length;
    for (let i = 0; i < n; i += 256) {
      Wire.beginTransmission(this.addr);
      Wire.write(0x40); // "data follow"
      Wire.write(this.buffer.slice(i, i + 256));
      Wire.endTransmission();
    }
  }
  invertDisplay(i) { this.ssd1306_command(i ? 0xa7 : 0xa6); }
  dim(d) { this.commands([0x81, d ? 0 : this.contrast]); }
  startscrollright(a, b) { this.commands([0x26, 0, a, 0, b, 0, 0xff, 0x2f]); }
  startscrollleft(a, b) { this.commands([0x27, 0, a, 0, b, 0, 0xff, 0x2f]); }
  stopscroll() { this.ssd1306_command(0x2e); }
}
