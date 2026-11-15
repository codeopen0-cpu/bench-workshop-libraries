// Adafruit_VL53L0X.h, the usual parts: begin(), rangingTest(&measure, false) filling
// measure.RangeMilliMeter and measure.RangeStatus (4 = out of range), readRange().
class VL53L0X_RangingMeasurementData_t {
  constructor() { this.RangeMilliMeter = 0; this.RangeStatus = 4; }
}
class Adafruit_VL53L0X {
  constructor() { this.address = 0x29; }
  regs(r, n) {
    Wire.beginTransmission(this.address);
    Wire.write(r);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.address, n) !== n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  begin(addr = 0x29) {
    this.address = addr;
    Wire.begin();
    const id = this.regs(0xc0, 1);
    return !!id && id[0] === 0xee;
  }
  rangingTest(m, debug = false) {
    Wire.beginTransmission(this.address);
    Wire.write(0x00);
    Wire.write(0x01);
    Wire.endTransmission();
    delay(20);
    const r = this.regs(0x1e, 2);
    const mm = r ? (r[0] << 8) | r[1] : 8190;
    if (m) {
      m.RangeMilliMeter = mm;
      m.RangeStatus = mm >= 8190 ? 4 : 0;
    }
    return 0;
  }
  readRange() {
    const m = new VL53L0X_RangingMeasurementData_t();
    this.rangingTest(m);
    return m.RangeMilliMeter;
  }
  readRangeStatus() { return this.readRange() >= 8190 ? 4 : 0; }
}
