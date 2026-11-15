// LiquidCrystal for sketches: Arduino's LiquidCrystal library (the constructors and functions of the
// real one), talking to an HD44780 over its pins the same way: set RS and the data pins, pulse E.
// Runs inside the program's thread, where pinMode, digitalWrite, delay... are in scope.
// (The real library waits microseconds between pulses; the simulated LCD doesn't need them, so
// they're left out except after clear/home, which take 2 ms on a real one.)
class LiquidCrystal {
  // LiquidCrystal(rs, enable, d4, d5, d6, d7)            4-bit
  // LiquidCrystal(rs, rw, enable, d4, d5, d6, d7)        4-bit with RW on a pin
  // LiquidCrystal(rs, enable, d0, d1, ..., d7)           8-bit
  // LiquidCrystal(rs, rw, enable, d0, d1, ..., d7)       8-bit with RW
  constructor(...p) {
    if (p.length === 6) [this.rs, this.rw, this.en, this.data] = [p[0], -1, p[1], p.slice(2)];
    else if (p.length === 7) [this.rs, this.rw, this.en, this.data] = [p[0], p[1], p[2], p.slice(3)];
    else if (p.length === 10) [this.rs, this.rw, this.en, this.data] = [p[0], -1, p[1], p.slice(2)];
    else if (p.length === 11) [this.rs, this.rw, this.en, this.data] = [p[0], p[1], p[2], p.slice(3)];
    else throw new Error('LiquidCrystal(rs, enable, d4, d5, d6, d7): wrong number of pins');
    this.eightBit = this.data.length === 8;
    this.ctrl = 0x04; // display on, cursor off, blink off
    this.mode = 0x02; // left to right, no autoscroll
    this.offsets = [0x00, 0x40, 0x10, 0x50];
    this.cols = 16;
    this.rows = 2;
  }
  pulse() {
    digitalWrite(this.en, LOW);
    digitalWrite(this.en, HIGH);
    digitalWrite(this.en, LOW); // the LCD takes the data as E falls
  }
  bits(value, n) {
    for (let i = 0; i < n; i++) digitalWrite(this.data[i], (value >> i) & 1);
    this.pulse();
  }
  send(value, rs) {
    digitalWrite(this.rs, rs);
    if (this.rw >= 0) digitalWrite(this.rw, LOW);
    if (this.eightBit) this.bits(value, 8);
    else {
      this.bits(value >> 4, 4);
      this.bits(value & 0x0f, 4);
    }
  }
  command(c) { this.send(c, LOW); }
  begin(cols = 16, rows = 2) {
    this.cols = cols;
    this.rows = rows;
    this.offsets = [0x00, 0x40, 0x00 + cols, 0x40 + cols];
    pinMode(this.rs, OUTPUT);
    if (this.rw >= 0) pinMode(this.rw, OUTPUT);
    pinMode(this.en, OUTPUT);
    for (const d of this.data) pinMode(d, OUTPUT);
    delay(50); // power-up time
    digitalWrite(this.rs, LOW);
    digitalWrite(this.en, LOW);
    if (this.rw >= 0) digitalWrite(this.rw, LOW);
    const lines = rows > 1 ? 0x08 : 0;
    if (!this.eightBit) {
      // the datasheet's way into 4-bit mode, from whatever state it's in
      this.bits(0x03, 4); delay(5);
      this.bits(0x03, 4); delay(1);
      this.bits(0x03, 4);
      this.bits(0x02, 4);
      this.command(0x20 | lines);
    } else {
      this.command(0x30 | lines); delay(5);
      this.command(0x30 | lines);
      this.command(0x30 | lines);
    }
    this.display();
    this.clear();
    this.command(0x04 | this.mode);
  }
  clear() { this.command(0x01); delay(2); }
  home() { this.command(0x02); delay(2); }
  setCursor(col, row) {
    const r = Math.max(0, Math.min(row, this.rows - 1, 3));
    this.command(0x80 | (col + this.offsets[r]));
  }
  noDisplay() { this.ctrl &= ~0x04; this.command(0x08 | this.ctrl); }
  display() { this.ctrl |= 0x04; this.command(0x08 | this.ctrl); }
  noCursor() { this.ctrl &= ~0x02; this.command(0x08 | this.ctrl); }
  cursor() { this.ctrl |= 0x02; this.command(0x08 | this.ctrl); }
  noBlink() { this.ctrl &= ~0x01; this.command(0x08 | this.ctrl); }
  blink() { this.ctrl |= 0x01; this.command(0x08 | this.ctrl); }
  scrollDisplayLeft() { this.command(0x18); }
  scrollDisplayRight() { this.command(0x1c); }
  leftToRight() { this.mode |= 0x02; this.command(0x04 | this.mode); }
  rightToLeft() { this.mode &= ~0x02; this.command(0x04 | this.mode); }
  autoscroll() { this.mode |= 0x01; this.command(0x04 | this.mode); }
  noAutoscroll() { this.mode &= ~0x01; this.command(0x04 | this.mode); }
  createChar(location, charmap) {
    this.command(0x40 | ((location & 7) << 3));
    for (let i = 0; i < 8; i++) this.send(charmap[i] ?? 0, HIGH);
  }
  write(b) { this.send(Number(b) & 0xff, HIGH); return 1; }
  print(x, f) {
    let s;
    if (typeof x === 'number' && f !== undefined) s = f === 16 ? x.toString(16).toUpperCase() : f === 2 ? x.toString(2) : x.toFixed(f);
    else if (typeof x === 'number' && !Number.isInteger(x)) s = x.toFixed(2);
    else s = String(x);
    for (const ch of s) this.write(ch.charCodeAt(0));
    return s.length;
  }
  println(x, f) { return this.print(x, f); }
}
