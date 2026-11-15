// Colour TFT screens (Adafruit_ST7735.h, Adafruit_ILI9341.h, Adafruit_ST7789.h) and the Adafruit_GFX
// drawing they share: fillScreen(), drawPixel(), drawLine(), drawRect(), fillRect(), drawCircle(),
// fillCircle(), drawRoundRect(), drawTriangle(), setCursor(), setTextColor(c, bg), setTextSize(),
// print(), setRotation(), color565(r, g, b).
//   Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);  tft.initR(INITR_BLACKTAB);
//   Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC);  tft.begin();
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


// ---------------------------------------------------------------------------------------------
// The TFT drivers. Like the real libraries they talk to the controller chip over SPI: commands with
// DC LOW, their data with DC HIGH (CASET / RASET set a window, RAMWR fills it with RGB565 pixels).
// To be quick they draw each call (a rectangle, a line, a line of text) on the board first and send
// the changed area at once, instead of pixel by pixel.
const ST77XX_BLACK = 0x0000, ST77XX_WHITE = 0xffff, ST77XX_RED = 0xf800, ST77XX_GREEN = 0x07e0, ST77XX_BLUE = 0x001f;
const ST77XX_CYAN = 0x07ff, ST77XX_MAGENTA = 0xf81f, ST77XX_YELLOW = 0xffe0, ST77XX_ORANGE = 0xfc00;
const ST7735_BLACK = ST77XX_BLACK, ST7735_WHITE = ST77XX_WHITE, ST7735_RED = ST77XX_RED, ST7735_GREEN = ST77XX_GREEN, ST7735_BLUE = ST77XX_BLUE;
const ST7735_CYAN = ST77XX_CYAN, ST7735_MAGENTA = ST77XX_MAGENTA, ST7735_YELLOW = ST77XX_YELLOW, ST7735_ORANGE = ST77XX_ORANGE;
const ILI9341_BLACK = 0x0000, ILI9341_NAVY = 0x000f, ILI9341_DARKGREEN = 0x03e0, ILI9341_DARKCYAN = 0x03ef, ILI9341_MAROON = 0x7800;
const ILI9341_PURPLE = 0x780f, ILI9341_OLIVE = 0x7be0, ILI9341_LIGHTGREY = 0xc618, ILI9341_DARKGREY = 0x7bef, ILI9341_BLUE = 0x001f;
const ILI9341_GREEN = 0x07e0, ILI9341_CYAN = 0x07ff, ILI9341_RED = 0xf800, ILI9341_MAGENTA = 0xf81f, ILI9341_YELLOW = 0xffe0;
const ILI9341_WHITE = 0xffff, ILI9341_ORANGE = 0xfd20, ILI9341_GREENYELLOW = 0xafe5, ILI9341_PINK = 0xfc18;
const INITR_GREENTAB = 0x00, INITR_REDTAB = 0x01, INITR_BLACKTAB = 0x02, INITR_144GREENTAB = 0x01, INITR_MINI160x80 = 0x04;

class Adafruit_SPITFT extends Adafruit_GFX {
  constructor(w, h, cs, dc, a, b, c) {
    super(w, h);
    this.cs = cs; this.dc = dc;
    // (cs, dc, rst) for hardware SPI; (cs, dc, mosi, sclk, rst) for software SPI: the same here
    this.rst = c !== undefined ? c : a !== undefined && b === undefined ? a : -1;
    this.fb = new Uint16Array(w * h);
    this.fbw = w;
    this.dirty = null;
    this.depth = 0;
    this.textcolor = 0xffff; this.textbgcolor = 0xffff;
    // each drawing call sends what it changed when it's done (calls inside calls wait for the outer one)
    for (const m of ['fillScreen', 'fillRect', 'drawRect', 'drawLine', 'drawFastHLine', 'drawFastVLine', 'drawPixel', 'drawCircle', 'fillCircle', 'drawRoundRect', 'fillRoundRect', 'drawTriangle', 'fillTriangle', 'drawBitmap', 'drawRGBBitmap', 'drawChar', 'write', 'print', 'println', 'printf']) {
      const f = this[m];
      this[m] = (...args) => {
        this.depth++;
        try { return f.apply(this, args); } finally { if (--this.depth === 0) this._flush(); }
      };
    }
  }
  _send(cmd, data) {
    digitalWrite(this.cs, LOW);
    digitalWrite(this.dc, LOW);
    SPI.writeBytes([cmd]);
    digitalWrite(this.dc, HIGH);
    if (data && data.length) SPI.writeBytes(data);
    digitalWrite(this.cs, HIGH);
  }
  _start() {
    pinMode(this.cs, OUTPUT); pinMode(this.dc, OUTPUT);
    digitalWrite(this.cs, HIGH);
    if (this.rst >= 0) { pinMode(this.rst, OUTPUT); digitalWrite(this.rst, HIGH); delay(5); digitalWrite(this.rst, LOW); delay(5); digitalWrite(this.rst, HIGH); delay(20); }
    SPI.begin();
    this._send(0x01); delay(50);      // SWRESET
    this._send(0x11); delay(50);      // SLPOUT
    this._send(0x3a, [0x55]);         // COLMOD: 16 bits a pixel
    this.setRotation(0);
    this._send(0x29);                 // DISPON
  }
  setRotation(r) {
    super.setRotation(r);
    const MAD = [0x00, 0x60, 0xc0, 0xa0][this.rotation]; // (MY MX MV: how the window maps onto the glass)
    this._send(0x36, [MAD | 0x08]);   // (+ BGR order, as these panels are)
    this.fbw = this._width;
    this.fb = new Uint16Array(this._width * this._height);
  }
  drawPixel(x, y, c) {
    x = Math.trunc(x); y = Math.trunc(y);
    if (x < 0 || y < 0 || x >= this._width || y >= this._height) return;
    this.fb[y * this.fbw + x] = c & 0xffff;
    const d = this.dirty;
    if (!d) this.dirty = [x, y, x, y];
    else { if (x < d[0]) d[0] = x; if (y < d[1]) d[1] = y; if (x > d[2]) d[2] = x; if (y > d[3]) d[3] = y; }
  }
  fillRect(x, y, w, h, c) {
    x = Math.trunc(x); y = Math.trunc(y); w = Math.trunc(w); h = Math.trunc(h);
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this._width, x + w), y1 = Math.min(this._height, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    for (let j = y0; j < y1; j++) this.fb.fill(c & 0xffff, j * this.fbw + x0, j * this.fbw + x1);
    const d = this.dirty;
    if (!d) this.dirty = [x0, y0, x1 - 1, y1 - 1];
    else { d[0] = Math.min(d[0], x0); d[1] = Math.min(d[1], y0); d[2] = Math.max(d[2], x1 - 1); d[3] = Math.max(d[3], y1 - 1); }
  }
  drawFastHLine(x, y, w, c) { this.fillRect(x, y, w, 1, c); }
  drawFastVLine(x, y, h, c) { this.fillRect(x, y, 1, h, c); }
  fillScreen(c) { this.fillRect(0, 0, this._width, this._height, c); }
  /** a 16-bit colour from red, green, blue (0-255) */
  color565(r, g, b) { return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3); }
  drawRGBBitmap(x, y, bmp, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.drawPixel(x + i, y + j, bmp[j * w + i]); }
  invertDisplay(on) { this._send(on ? 0x21 : 0x20); }
  enableDisplay(on) { this._send(on ? 0x29 : 0x28); }
  enableSleep(on) { this._send(on ? 0x10 : 0x11); }
  setAddrWindow(x, y, w, h) {
    this._send(0x2a, [x >> 8, x & 255, (x + w - 1) >> 8, (x + w - 1) & 255]);
    this._send(0x2b, [y >> 8, y & 255, (y + h - 1) >> 8, (y + h - 1) & 255]);
  }
  startWrite() {}
  endWrite() {}
  /** the changed area, sent: a window, then its pixels (two bytes each, high byte first) */
  _flush() {
    const d = this.dirty;
    if (!d) return;
    this.dirty = null;
    const [x0, y0, x1, y1] = d;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    this.setAddrWindow(x0, y0, w, h);
    const px = new Array(w * h * 2);
    let k = 0;
    for (let j = y0; j <= y1; j++)
      for (let i = x0; i <= x1; i++) { const c = this.fb[j * this.fbw + i]; px[k++] = c >> 8; px[k++] = c & 255; }
    digitalWrite(this.cs, LOW);
    digitalWrite(this.dc, LOW);
    SPI.writeBytes([0x2c]);
    digitalWrite(this.dc, HIGH);
    SPI.writeBytes(px);
    digitalWrite(this.cs, HIGH);
  }
}

class Adafruit_ST7735 extends Adafruit_SPITFT {
  constructor(cs, dc, a, b, c) { super(128, 160, cs, dc, a, b, c); }
  initR(tab = INITR_BLACKTAB) { if (tab === INITR_MINI160x80) { this.WIDTH = 80; this.HEIGHT = 160; } this._start(); }
  initB() { this._start(); }
}
class Adafruit_ST7789 extends Adafruit_SPITFT {
  constructor(cs, dc, a, b, c) { super(240, 320, cs, dc, a, b, c); }
  init(w = 240, h = 320) { this.WIDTH = w; this.HEIGHT = h; this._start(); }
}
class Adafruit_ILI9341 extends Adafruit_SPITFT {
  constructor(cs, dc, a, b, c) { super(240, 320, cs, dc, a, b, c); }
  begin() { this._start(); }
  readcommand8() { return 0; }
}
