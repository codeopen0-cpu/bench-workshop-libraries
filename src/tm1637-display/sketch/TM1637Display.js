// TM1637Display.h (Avishay Orpaz's library): setBrightness(), setSegments(), clear(),
// showNumberDec(), showNumberDecEx(), showNumberHexEx(), encodeDigit(). It talks to the chip the way
// the real one does: start, bytes least significant bit first with a clock for each bit, stop.
const SEG_A = 0x01, SEG_B = 0x02, SEG_C = 0x04, SEG_D = 0x08, SEG_E = 0x10, SEG_F = 0x20, SEG_G = 0x40, SEG_DP = 0x80;
const TM_DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];

class TM1637Display {
  constructor(clk, dio, bitDelay = 100) {
    this.clk = clk;
    this.dio = dio;
    this.brightness = 0x0f;
    pinMode(clk, OUTPUT);
    pinMode(dio, OUTPUT);
    digitalWrite(clk, HIGH);
    digitalWrite(dio, HIGH);
  }
  setBrightness(b, on = true) { this.brightness = (b & 0x07) | (on ? 0x08 : 0x00); }
  start() {
    digitalWrite(this.dio, HIGH);
    digitalWrite(this.clk, HIGH);
    digitalWrite(this.dio, LOW);
  }
  stop() {
    digitalWrite(this.clk, LOW);
    digitalWrite(this.dio, LOW);
    digitalWrite(this.clk, HIGH);
    digitalWrite(this.dio, HIGH);
  }
  writeByte(b) {
    for (let i = 0; i < 8; i++) {
      digitalWrite(this.clk, LOW);
      digitalWrite(this.dio, (b >> i) & 1);
      digitalWrite(this.clk, HIGH);
    }
    // the ninth clock: the chip answers (ACK)
    digitalWrite(this.clk, LOW);
    digitalWrite(this.dio, HIGH);
    digitalWrite(this.clk, HIGH);
    digitalWrite(this.clk, LOW);
    return true;
  }
  setSegments(segments, length = 4, pos = 0) {
    this.start();
    this.writeByte(0x40); // data, auto increment
    this.stop();
    this.start();
    this.writeByte(0xc0 + (pos & 0x03));
    for (let k = 0; k < length; k++) this.writeByte(segments[k] ?? 0);
    this.stop();
    this.start();
    this.writeByte(0x80 + (this.brightness & 0x0f));
    this.stop();
  }
  clear() { this.setSegments([0, 0, 0, 0]); }
  encodeDigit(d) { return TM_DIGITS[d & 0x0f]; }
  showNumberDec(num, leadingZero = false, length = 4, pos = 0) {
    this.showNumberDecEx(num, 0, leadingZero, length, pos);
  }
  showNumberDecEx(num, dots = 0, leadingZero = false, length = 4, pos = 0) {
    this.showNumberBaseEx(num < 0 ? -10 : 10, num < 0 ? -num : num, dots, leadingZero, length, pos);
  }
  showNumberHexEx(num, dots = 0, leadingZero = false, length = 4, pos = 0) {
    this.showNumberBaseEx(16, num, dots, leadingZero, length, pos);
  }
  showNumberBaseEx(base, num, dots, leadingZero, length, pos) {
    const negative = base < 0;
    if (negative) base = -base;
    num = Math.trunc(num);
    const digits = [0, 0, 0, 0];
    if (num === 0 && !leadingZero) {
      for (let i = 0; i < length - 1; i++) digits[i] = 0;
      digits[length - 1] = TM_DIGITS[0];
    } else {
      for (let i = length - 1; i >= 0; --i) {
        const d = num % base;
        if (d === 0 && num === 0 && !leadingZero) digits[i] = 0;
        else digits[i] = TM_DIGITS[d];
        if (d === 0 && num === 0 && negative) { digits[i] = SEG_G; break; }
        num = Math.floor(num / base);
      }
    }
    if (dots) for (let i = 0; i < length; i++) { if (dots & 0x80) digits[i] |= 0x80; dots <<= 1; }
    this.setSegments(digits, length, pos);
  }
}
