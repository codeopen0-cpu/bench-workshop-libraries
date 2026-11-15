// Adafruit_TCS34725.h: Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);
//   tcs.begin();  uint16_t r, g, b, c;  tcs.getRawData(&r, &g, &b, &c);  float R, G, B;  tcs.getRGB(&R, &G, &B);
//   tcs.calculateColorTemperature_dn40(r, g, b, c);  tcs.calculateLux(r, g, b);  tcs.setInterrupt(true) (LED off)
const TCS34725_INTEGRATIONTIME_2_4MS = 0xff, TCS34725_INTEGRATIONTIME_24MS = 0xf6, TCS34725_INTEGRATIONTIME_50MS = 0xeb;
const TCS34725_INTEGRATIONTIME_101MS = 0xd5, TCS34725_INTEGRATIONTIME_154MS = 0xc0, TCS34725_INTEGRATIONTIME_614MS = 0x00;
const TCS34725_GAIN_1X = 0, TCS34725_GAIN_4X = 1, TCS34725_GAIN_16X = 2, TCS34725_GAIN_60X = 3;

class Adafruit_TCS34725 {
  constructor(it = TCS34725_INTEGRATIONTIME_2_4MS, gain = TCS34725_GAIN_1X) { this.it = it; this.gain = gain; this.addr = 0x29; this.ok = false; }
  _w(reg, v) { Wire.beginTransmission(this.addr); Wire.write(0x80 | reg); Wire.write(v); return Wire.endTransmission() === 0; }
  _r(reg, n) {
    Wire.beginTransmission(this.addr); Wire.write(0x80 | reg);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.addr, n) < n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  begin(addr = 0x29) {
    this.addr = addr;
    const id = this._r(0x12, 1);
    if (!id || (id[0] !== 0x44 && id[0] !== 0x4d && id[0] !== 0x10)) return false;
    this.ok = true;
    this.setIntegrationTime(this.it);
    this.setGain(this.gain);
    this.enable();
    return true;
  }
  enable() { this._w(0x00, 0x01); delay(3); this._w(0x00, 0x03); delay(Math.ceil((256 - this.it) * 2.4)); }
  disable() { this._w(0x00, 0x00); }
  setIntegrationTime(it) { this.it = it; this._w(0x01, it); }
  setGain(g) { this.gain = g; this._w(0x0f, g); }
  /** fills r, g, b, c (handed over: getRawData(&r, &g, &b, &c)); returns them too */
  getRawData(r, g, b, c) {
    if (!this.ok) return [0, 0, 0, 0];
    const d = this._r(0x14, 8) ?? new Array(8).fill(0);
    const v = [0, 2, 4, 6].map((i) => d[i] | (d[i + 1] << 8));
    setRef(c, v[0]); setRef(r, v[1]); setRef(g, v[2]); setRef(b, v[3]);
    delay(Math.ceil((256 - this.it) * 2.4)); // (as the real one: it waits for a fresh reading)
    return [v[1], v[2], v[3], v[0]];
  }
  getRawDataOneShot(r, g, b, c) { return this.getRawData(r, g, b, c); }
  /** red, green, blue as 0-255 (scaled by the clear channel), into floats handed over */
  getRGB(r, g, b) {
    const [R, G, B, C] = this.getRawData(null, null, null, null);
    const k = C ? 255 / C : 0;
    setRef(r, R * k); setRef(g, G * k); setRef(b, B * k);
  }
  calculateColorTemperature(r, g, b) {
    const X = -0.14282 * r + 1.54924 * g + -0.95641 * b, Y = -0.32466 * r + 1.57837 * g + -0.73191 * b, Z = -0.68202 * r + 0.77073 * g + 0.56332 * b;
    const xc = X / (X + Y + Z), yc = Y / (X + Y + Z);
    const n = (xc - 0.332) / (0.1858 - yc);
    return Math.round(449.0 * n ** 3 + 3525.0 * n ** 2 + 6823.3 * n + 5520.33);
  }
  calculateColorTemperature_dn40(r, g, b, c) {
    if (!c) return 0;
    const ir = r + g + b > c ? (r + g + b - c) / 2 : 0;
    const r2 = r - ir, b2 = b - ir;
    if (r2 === 0) return 0;
    return Math.round((3810 * b2) / r2 + 1391);
  }
  calculateLux(r, g, b) { return Math.round(-0.32466 * r + 1.57837 * g + -0.73191 * b); }
  /** true: LED off (on the Adafruit board the INT pin drives it; here: wire LED to a pin instead) */
  setInterrupt() {}
  clearInterrupt() {}
}
