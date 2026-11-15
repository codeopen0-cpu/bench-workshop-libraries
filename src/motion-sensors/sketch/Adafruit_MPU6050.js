// Adafruit_MPU6050.h for the app's MPU-6050 module (I2C 0x68):
//   Adafruit_MPU6050 mpu;  mpu.begin();  sensors_event_t a, g, temp;  mpu.getEvent(&a, &g, &temp);
//   a.acceleration.x (m/s2), g.gyro.x (rad/s), temp.temperature (C)
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
const MPU6050_RANGE_2_G = 0, MPU6050_RANGE_4_G = 1, MPU6050_RANGE_8_G = 2, MPU6050_RANGE_16_G = 3;
const MPU6050_RANGE_250_DEG = 0, MPU6050_RANGE_500_DEG = 1, MPU6050_RANGE_1000_DEG = 2, MPU6050_RANGE_2000_DEG = 3;
const MPU6050_BAND_260_HZ = 0, MPU6050_BAND_184_HZ = 1, MPU6050_BAND_94_HZ = 2, MPU6050_BAND_44_HZ = 3, MPU6050_BAND_21_HZ = 4, MPU6050_BAND_10_HZ = 5, MPU6050_BAND_5_HZ = 6;

class Adafruit_MPU6050 {
  constructor() { this.addr = 0x68; this.arange = 0; this.grange = 0; this.band = 0; }
  _w(reg, v) { Wire.beginTransmission(this.addr); Wire.write(reg); Wire.write(v); return Wire.endTransmission() === 0; }
  _r(reg, n) {
    Wire.beginTransmission(this.addr); Wire.write(reg);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.addr, n) < n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  begin(addr = 0x68) {
    this.addr = addr;
    const id = this._r(0x75, 1);
    if (!id || id[0] !== 0x68) return false;
    this._w(0x6b, 0x00); // wake up
    this.setAccelerometerRange(this.arange);
    this.setGyroRange(this.grange);
    return true;
  }
  setAccelerometerRange(r) { this.arange = r & 3; this._w(0x1c, this.arange << 3); }
  getAccelerometerRange() { return this.arange; }
  setGyroRange(r) { this.grange = r & 3; this._w(0x1b, this.grange << 3); }
  getGyroRange() { return this.grange; }
  setFilterBandwidth(b) { this.band = b; this._w(0x1a, b & 7); }
  getFilterBandwidth() { return this.band; }
  setSampleRateDivisor() {}
  enableSleep(on) { this._w(0x6b, on ? 0x40 : 0); }
  /** fills a (m/s2), g (rad/s) and temp (C) */
  getEvent(a, g, temp) {
    const d = this._r(0x3b, 14);
    if (!d) return false;
    const s = (i) => { const v = (d[i] << 8) | d[i + 1]; return v >= 32768 ? v - 65536 : v; };
    const aLsb = 16384 / (1 << this.arange), gLsb = 131 / (1 << this.grange);
    const t = millis();
    if (a) { a.acceleration.x = (s(0) / aLsb) * SENSORS_GRAVITY_STANDARD; a.acceleration.y = (s(2) / aLsb) * SENSORS_GRAVITY_STANDARD; a.acceleration.z = (s(4) / aLsb) * SENSORS_GRAVITY_STANDARD; a.timestamp = t; }
    if (temp) { temp.temperature = s(6) / 340 + 36.53; temp.timestamp = t; }
    if (g) { g.gyro.x = ((s(8) / gLsb) * PI) / 180; g.gyro.y = ((s(10) / gLsb) * PI) / 180; g.gyro.z = ((s(12) / gLsb) * PI) / 180; g.timestamp = t; }
    return true;
  }
}
