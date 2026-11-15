// Adafruit_ADXL345_U.h: Adafruit_ADXL345_Unified accel(12345);  accel.begin();
//   accel.setRange(ADXL345_RANGE_16_G);  sensors_event_t e;  accel.getEvent(&e);  e.acceleration.x (m/s2)
class sensors_event_t {
  constructor() {
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.gyro = { x: 0, y: 0, z: 0 };
    this.magnetic = { x: 0, y: 0, z: 0 };
    this.temperature = 0;
    this.timestamp = 0;
  }
}
const SENSORS_GRAVITY_STANDARD = 9.80665;
const ADXL345_RANGE_2_G = 0, ADXL345_RANGE_4_G = 1, ADXL345_RANGE_8_G = 2, ADXL345_RANGE_16_G = 3;

class Adafruit_ADXL345_Unified {
  constructor(id = -1) { this.id = id; this.addr = 0x53; this.range = ADXL345_RANGE_2_G; }
  _w(reg, v) { Wire.beginTransmission(this.addr); Wire.write(reg); Wire.write(v); return Wire.endTransmission() === 0; }
  _r(reg, n) {
    Wire.beginTransmission(this.addr); Wire.write(reg);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.addr, n) < n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  begin(addr = 0x53) {
    this.addr = addr;
    const id = this._r(0x00, 1);
    if (!id || id[0] !== 0xe5) return false;
    this._w(0x2d, 0x08); // measure
    this.setRange(this.range);
    return true;
  }
  setRange(r) { this.range = r & 3; this._w(0x31, 0x08 | this.range); } // (full resolution: 4 mg per step)
  getRange() { return this.range; }
  setDataRate() {}
  getDeviceID() { const id = this._r(0x00, 1); return id ? id[0] : 0; }
  _xyz() {
    const d = this._r(0x32, 6);
    if (!d) return [0, 0, 0];
    return [0, 2, 4].map((i) => { const v = d[i] | (d[i + 1] << 8); return v >= 32768 ? v - 65536 : v; });
  }
  getX() { return this._xyz()[0]; }
  getY() { return this._xyz()[1]; }
  getZ() { return this._xyz()[2]; }
  getEvent(e) {
    const [x, y, z] = this._xyz();
    const k = 0.004 * SENSORS_GRAVITY_STANDARD; // (full resolution: 4 mg per step at any range)
    e.acceleration.x = x * k; e.acceleration.y = y * k; e.acceleration.z = z * k;
    e.timestamp = millis();
    return true;
  }
}
