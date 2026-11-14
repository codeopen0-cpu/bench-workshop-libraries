// LiquidCrystal_I2C for sketches: the usual functions (init/begin, backlight, clear, setCursor, print...)
// driving an HD44780 through a PCF8574 backpack the way the Arduino library does. Each command goes
// out as one I2C transfer (the PCF8574 takes a stream of bytes, setting its outputs on each one).
const LCD_RS = 0x01, LCD_EN = 0x04, LCD_BL = 0x08;

class LiquidCrystal_I2C {
  constructor(addr, cols = 16, rows = 2) {
    this.addr = addr;
    this.cols = cols;
    this.rows = rows;
    this.bl = LCD_BL;
    this.ctrl = 0x04; // display on, cursor off, blink off
    this.mode = 0x02; // left to right
  }
  send(bytes) {
    Wire.beginTransmission(this.addr);
    for (const b of bytes) Wire.write(b);
    return Wire.endTransmission();
  }
  nibbles(value, rs) {
    const out = [];
    for (const n of [value & 0xf0, (value << 4) & 0xf0]) out.push(n | rs | this.bl | LCD_EN, n | rs | this.bl);
    return out;
  }
  command(c) { this.send(this.nibbles(c, 0)); }
  init() { this.begin(this.cols, this.rows); }
  begin(cols = this.cols, rows = this.rows) {
    this.cols = cols;
    this.rows = rows;
    Wire.begin();
    delay(50);
    this.send([this.bl]);
    // the HD44780's wake-up: three times "8-bit mode", then "4-bit mode"
    for (const n of [0x30, 0x30, 0x30, 0x20]) {
      this.send([n | this.bl | LCD_EN, n | this.bl]);
      delay(5);
    }
    this.command(0x20 | (rows > 1 ? 0x08 : 0)); // 4-bit, lines, 5x8 dots
    this.display();
    this.clear();
    this.command(0x04 | this.mode);
    this.home();
  }
  clear() { this.command(0x01); delay(2); }
  home() { this.command(0x02); delay(2); }
  setCursor(col, row) {
    const offsets = [0x00, 0x40, 0x14, 0x54];
    this.command(0x80 | (col + offsets[Math.min(row, this.rows - 1, 3)]));
  }
  display() { this.ctrl |= 0x04; this.command(0x08 | this.ctrl); }
  noDisplay() { this.ctrl &= ~0x04; this.command(0x08 | this.ctrl); }
  cursor() { this.ctrl |= 0x02; this.command(0x08 | this.ctrl); }
  noCursor() { this.ctrl &= ~0x02; this.command(0x08 | this.ctrl); }
  blink() { this.ctrl |= 0x01; this.command(0x08 | this.ctrl); }
  noBlink() { this.ctrl &= ~0x01; this.command(0x08 | this.ctrl); }
  scrollDisplayLeft() { this.command(0x18); }
  scrollDisplayRight() { this.command(0x1c); }
  backlight() { this.bl = LCD_BL; this.send([this.bl]); }
  noBacklight() { this.bl = 0; this.send([0]); }
  setBacklight(on) { on ? this.backlight() : this.noBacklight(); }
  createChar(location, charmap) {
    this.command(0x40 | ((location & 7) << 3));
    this.send(charmap.slice(0, 8).flatMap((b) => this.nibbles(b, LCD_RS)));
  }
  write(b) { this.send(this.nibbles(Number(b) & 0xff, LCD_RS)); return 1; }
  print(x, f) {
    let s;
    if (typeof x === 'number' && f !== undefined) s = f === 16 ? x.toString(16).toUpperCase() : f === 2 ? x.toString(2) : x.toFixed(f);
    else if (typeof x === 'number' && !Number.isInteger(x)) s = x.toFixed(2);
    else s = String(x);
    const bytes = [];
    for (const ch of s) bytes.push(...this.nibbles(ch.charCodeAt(0) & 0xff, LCD_RS));
    if (bytes.length) this.send(bytes);
    return s.length;
  }
  println(x, f) { return this.print(x, f); }
  printf(fmt, ...a) {
    return this.print(fmt.replace(/%(-?\d*)(?:\.(\d+))?([dfsxXc%])/g, (_m, w, p, t) => {
      if (t === '%') return '%';
      const v = a.shift();
      let s = t === 'f' ? Number(v).toFixed(p ? Number(p) : 2) : t === 'x' ? Number(v).toString(16) : t === 'X' ? Number(v).toString(16).toUpperCase() : t === 'c' ? String.fromCharCode(v) : t === 'd' ? String(Math.trunc(v)) : String(v);
      const width = Math.abs(Number(w || 0));
      if (s.length < width) s = w.startsWith('-') ? s.padEnd(width) : s.padStart(width, w.startsWith('0') ? '0' : ' ');
      return s;
    }));
  }
}
