// VL53L0X.h (Pololu's library), the parts sketches use: init(), setTimeout(), startContinuous(),
// readRangeContinuousMillimeters(), readRangeSingleMillimeters(), timeoutOccurred(), setAddress().
// It reads the sensor's real result registers (0x13 ready, 0x1E-0x1F the range in mm).
class VL53L0X {
  constructor() {
    this.address = 0x29;
    this.timeout = 0;
    this.didTimeout = false;
    this.continuous = false;
  }
  setBus() {}
  setAddress(a) { this.writeReg(0x8a, a & 0x7f); this.address = a & 0x7f; }
  getAddress() { return this.address; }
  setTimeout(ms) { this.timeout = ms; }
  getTimeout() { return this.timeout; }
  timeoutOccurred() { const t = this.didTimeout; this.didTimeout = false; return t; }
  writeReg(r, v) {
    Wire.beginTransmission(this.address);
    Wire.write(r);
    Wire.write(v);
    return Wire.endTransmission();
  }
  readRegs(r, n) {
    Wire.beginTransmission(this.address);
    Wire.write(r);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.address, n) !== n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  /** true if a VL53L0X answers (model id 0xEE) */
  init(io2v8 = true) {
    const id = this.readRegs(0xc0, 1);
    return !!id && id[0] === 0xee;
  }
  setMeasurementTimingBudget() { return true; }
  setSignalRateLimit() { return true; }
  startContinuous(period = 0) { this.writeReg(0x00, period ? 0x04 : 0x02); this.continuous = true; }
  stopContinuous() { this.writeReg(0x00, 0x01); this.continuous = false; }
  readRangeContinuousMillimeters() {
    const start = millis();
    for (;;) {
      const st = this.readRegs(0x13, 1);
      if (st && (st[0] & 0x07)) break;
      if (!st || (this.timeout && millis() - start > this.timeout)) { this.didTimeout = true; return 65535; }
      delay(1);
    }
    const r = this.readRegs(0x1e, 2);
    this.writeReg(0x0b, 0x01); // clear "ready"
    if (!r) { this.didTimeout = true; return 65535; }
    return (r[0] << 8) | r[1];
  }
  readRangeSingleMillimeters() {
    this.writeReg(0x00, 0x01);
    delay(20); // (a reading takes about 30 ms on a real one)
    return this.readRangeContinuousMillimeters();
  }
}
