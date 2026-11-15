// MPU6050.h (the i2cdevlib / Electronic Cats style) for the app's MPU-6050 module (I2C 0x68):
//   MPU6050 mpu;  mpu.initialize();  mpu.testConnection();
//   int16_t ax, ay, az, gx, gy, gz;  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);  (raw: 16384 = 1 g, 131 = 1 deg/s)
const MPU6050_ACCEL_FS_2 = 0, MPU6050_ACCEL_FS_4 = 1, MPU6050_ACCEL_FS_8 = 2, MPU6050_ACCEL_FS_16 = 3;
const MPU6050_GYRO_FS_250 = 0, MPU6050_GYRO_FS_500 = 1, MPU6050_GYRO_FS_1000 = 2, MPU6050_GYRO_FS_2000 = 3;

class MPU6050 {
  constructor(addr = 0x68) { this.addr = addr; }
  _w(reg, v) { Wire.beginTransmission(this.addr); Wire.write(reg); Wire.write(v); return Wire.endTransmission() === 0; }
  _r(reg, n) {
    Wire.beginTransmission(this.addr); Wire.write(reg);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.addr, n) < n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  initialize() { this._w(0x6b, 0x00); this._w(0x1b, 0); this._w(0x1c, 0); }
  testConnection() { const id = this._r(0x75, 1); return !!id && id[0] === 0x68; }
  getDeviceID() { const id = this._r(0x75, 1); return id ? id[0] >> 1 : 0; }
  setFullScaleAccelRange(r) { this._w(0x1c, (r & 3) << 3); }
  setFullScaleGyroRange(r) { this._w(0x1b, (r & 3) << 3); }
  setDLPFMode(m) { this._w(0x1a, m & 7); }
  setSleepEnabled(on) { this._w(0x6b, on ? 0x40 : 0); }
  _raw() {
    const d = this._r(0x3b, 14);
    if (!d) return [0, 0, 0, 0, 0, 0, 0];
    const out = [];
    for (let i = 0; i < 14; i += 2) { const v = (d[i] << 8) | d[i + 1]; out.push(v >= 32768 ? v - 65536 : v); }
    return out;
  }
  /** all six at once into the variables handed over: getMotion6(&ax, &ay, &az, &gx, &gy, &gz) */
  getMotion6(ax, ay, az, gx, gy, gz) {
    const r = this._raw();
    setRef(ax, r[0]); setRef(ay, r[1]); setRef(az, r[2]); setRef(gx, r[4]); setRef(gy, r[5]); setRef(gz, r[6]);
  }
  getAcceleration(ax, ay, az) { const r = this._raw(); setRef(ax, r[0]); setRef(ay, r[1]); setRef(az, r[2]); }
  getRotation(gx, gy, gz) { const r = this._raw(); setRef(gx, r[4]); setRef(gy, r[5]); setRef(gz, r[6]); }
  getAccelerationX() { return this._raw()[0]; }
  getAccelerationY() { return this._raw()[1]; }
  getAccelerationZ() { return this._raw()[2]; }
  getRotationX() { return this._raw()[4]; }
  getRotationY() { return this._raw()[5]; }
  getRotationZ() { return this._raw()[6]; }
  getTemperature() { return this._raw()[3]; }
}
