// BH1750.h (claws' library): BH1750 lightMeter;  lightMeter.begin();  lightMeter.readLightLevel() (lux).
//   Modes: BH1750::CONTINUOUS_HIGH_RES_MODE (the default), CONTINUOUS_LOW_RES_MODE, ONE_TIME_HIGH_RES_MODE ...
class BH1750 {
  constructor(addr = 0x23) { this.addr = addr; this.mode = BH1750.CONTINUOUS_HIGH_RES_MODE; this.last = -1; }
  _cmd(c) { Wire.beginTransmission(this.addr); Wire.write(c); return Wire.endTransmission() === 0; }
  begin(mode = BH1750.CONTINUOUS_HIGH_RES_MODE, addr, _wire) {
    if (addr) this.addr = addr;
    if (!this._cmd(0x01)) return false;
    return this.configure(mode);
  }
  configure(mode) {
    this.mode = mode;
    const ok = this._cmd(mode);
    delay((mode & 3) === 3 ? 24 : 180); // (the first measurement)
    return ok;
  }
  setMTreg() { return true; }
  measurementReady() { return true; }
  readLightLevel() {
    if ((this.mode & 0xf0) === 0x20) { this._cmd(this.mode); delay((this.mode & 3) === 3 ? 24 : 180); }
    if (Wire.requestFrom(this.addr, 2) < 2) return -1;
    const v = (Wire.read() << 8) | Wire.read();
    this.last = v / 1.2;
    return this.last;
  }
}
BH1750.UNCONFIGURED = 0;
BH1750.CONTINUOUS_HIGH_RES_MODE = 0x10;
BH1750.CONTINUOUS_HIGH_RES_MODE_2 = 0x11;
BH1750.CONTINUOUS_LOW_RES_MODE = 0x13;
BH1750.ONE_TIME_HIGH_RES_MODE = 0x20;
BH1750.ONE_TIME_HIGH_RES_MODE_2 = 0x21;
BH1750.ONE_TIME_LOW_RES_MODE = 0x23;
