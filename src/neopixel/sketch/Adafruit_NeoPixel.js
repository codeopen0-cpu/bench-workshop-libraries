// Adafruit_NeoPixel for sketches: Adafruit_NeoPixel strip(count, pin, NEO_GRB + NEO_KHZ800);
// begin(), setPixelColor(i, r, g, b) or (i, color), show(), clear(), fill(), setBrightness(),
// Color(r, g, b), ColorHSV(hue, sat, val), gamma32(), numPixels(). show() sends every LED's colour
// along the data wire as one message (what a real strip gets as a fast stream of bits).
const NEO_RGB = 0x06, NEO_RBG = 0x09, NEO_GRB = 0x52, NEO_GBR = 0xa1, NEO_BRG = 0x58, NEO_BGR = 0xa4, NEO_KHZ800 = 0x0000, NEO_KHZ400 = 0x0100;

class Adafruit_NeoPixel {
  constructor(n = 0, pin = -1, type = NEO_GRB + NEO_KHZ800) {
    this.n = n;
    this.pin = pin;
    this.type = type;
    this.pixels = new Array(n * 3).fill(0); // r, g, b per LED (as set)
    this.brightness = 0; // 0 = full (as the real library stores it)
    this.begun = false;
  }
  begin() {
    if (this.pin >= 0) {
      pinMode(this.pin, OUTPUT);
      digitalWrite(this.pin, LOW);
    }
    this.begun = true;
  }
  updateLength(n) { this.n = n; this.pixels = new Array(n * 3).fill(0); }
  setPin(p) { this.pin = p; if (this.begun) this.begin(); }
  numPixels() { return this.n; }
  static Color(r, g, b, w) { return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255); }
  Color(r, g, b, w) { return Adafruit_NeoPixel.Color(r, g, b, w); }
  setPixelColor(i, r, g, b) {
    if (i < 0 || i >= this.n) return;
    if (g === undefined) { const c = r >>> 0; b = c & 255; g = (c >> 8) & 255; r = (c >> 16) & 255; }
    this.pixels[i * 3] = r & 255;
    this.pixels[i * 3 + 1] = g & 255;
    this.pixels[i * 3 + 2] = b & 255;
  }
  getPixelColor(i) {
    if (i < 0 || i >= this.n) return 0;
    return Adafruit_NeoPixel.Color(this.pixels[i * 3], this.pixels[i * 3 + 1], this.pixels[i * 3 + 2]);
  }
  fill(c = 0, first = 0, count = 0) {
    const end = count ? Math.min(this.n, first + count) : this.n;
    for (let i = first; i < end; i++) this.setPixelColor(i, c);
  }
  clear() { this.pixels.fill(0); }
  setBrightness(b) { this.brightness = ((b & 255) + 1) & 255; }
  getBrightness() { return (this.brightness - 1) & 255; }
  canShow() { return true; }
  show() {
    if (this.pin < 0) return;
    // the bytes in wire order (GRB for the usual LEDs), scaled by the brightness
    const order = this.type & 0xff;
    const rOff = (order >> 4) & 3, gOff = (order >> 2) & 3, bOff = order & 3;
    const out = new Array(this.n * 3).fill(0);
    for (let i = 0; i < this.n; i++) {
      let r = this.pixels[i * 3], g = this.pixels[i * 3 + 1], b = this.pixels[i * 3 + 2];
      if (this.brightness) {
        r = (r * this.brightness) >> 8;
        g = (g * this.brightness) >> 8;
        b = (b * this.brightness) >> 8;
      }
      out[i * 3 + rOff] = r;
      out[i * 3 + gOff] = g;
      out[i * 3 + bOff] = b;
    }
    linkSend(this.pin, 'pixels', out);
  }
  static ColorHSV(hue = 0, sat = 255, val = 255) {
    hue = ((hue % 65536) + 65536) % 65536;
    hue = Math.floor((hue * 1530 + 32768) / 65536);
    let r, g, b;
    if (hue < 510) { b = 0; if (hue < 255) { r = 255; g = hue; } else { r = 510 - hue; g = 255; } }
    else if (hue < 1020) { r = 0; if (hue < 765) { g = 255; b = hue - 510; } else { g = 1020 - hue; b = 255; } }
    else if (hue < 1530) { g = 0; if (hue < 1275) { r = hue - 1020; b = 255; } else { r = 255; b = 1530 - hue; } }
    else { r = 255; g = 0; b = 0; }
    const v1 = 1 + val, s1 = 1 + sat, s2 = 255 - sat;
    return Adafruit_NeoPixel.Color(((((r * s1) >> 8) + s2) * v1) >> 8, ((((g * s1) >> 8) + s2) * v1) >> 8, ((((b * s1) >> 8) + s2) * v1) >> 8);
  }
  ColorHSV(h, s, v) { return Adafruit_NeoPixel.ColorHSV(h, s, v); }
  static gamma8(x) { return Math.round(Math.pow((x & 255) / 255, 2.6) * 255); }
  static gamma32(c) {
    return Adafruit_NeoPixel.Color(Adafruit_NeoPixel.gamma8(c >> 16), Adafruit_NeoPixel.gamma8(c >> 8), Adafruit_NeoPixel.gamma8(c));
  }
  gamma32(c) { return Adafruit_NeoPixel.gamma32(c); }
  rainbow(first = 0, reps = 1, sat = 255, bright = 255, gammify = true) {
    for (let i = 0; i < this.n; i++) {
      const c = Adafruit_NeoPixel.ColorHSV(first + Math.floor((i * reps * 65536) / this.n), sat, bright);
      this.setPixelColor(i, gammify ? Adafruit_NeoPixel.gamma32(c) : c);
    }
  }
}
