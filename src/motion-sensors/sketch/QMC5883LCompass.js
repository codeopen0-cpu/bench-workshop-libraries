// QMC5883LCompass.h (MPrograms' library): QMC5883LCompass compass;  compass.init();
//   compass.read();  compass.getX() / getY() / getZ();  compass.getAzimuth() (degrees, -180..180 as the
//   real one gives it: 0 north, 90 east);  compass.getBearing(az) (0-15);  compass.getDirection(buf, az)
class QMC5883LCompass {
  constructor() { this.addr = 0x0d; this.v = [0, 0, 0]; this.decl = 0; this.cal = null; }
  _w(reg, v) { Wire.beginTransmission(this.addr); Wire.write(reg); Wire.write(v); return Wire.endTransmission() === 0; }
  init() {
    this._w(0x0b, 0x01); // set/reset period
    this._w(0x09, 0x1d); // as the real init(): continuous, 200 Hz, 8 G range, oversampling 512
  }
  setADDR(a) { this.addr = a; }
  setMode(mode, odr, rng, osr) { this._w(0x09, (mode | odr | rng | osr) & 255); }
  setMagneticDeclination(deg, min = 0) { this.decl = deg + min / 60; }
  setCalibration() {}
  setCalibrationOffsets() {}
  setCalibrationScales() {}
  setSmoothing() {}
  read() {
    Wire.beginTransmission(this.addr); Wire.write(0x00);
    if (Wire.endTransmission() !== 0) return;
    if (Wire.requestFrom(this.addr, 6) < 6) return;
    const d = [];
    for (let i = 0; i < 6; i++) d.push(Wire.read());
    this.v = [0, 2, 4].map((i) => { const x = d[i] | (d[i + 1] << 8); return x >= 32768 ? x - 65536 : x; });
  }
  getX() { return this.v[0]; }
  getY() { return this.v[1]; }
  getZ() { return this.v[2]; }
  getAzimuth() {
    let a = (Math.atan2(this.v[1], this.v[0]) * 180) / Math.PI + this.decl;
    if (a > 180) a -= 360;
    return Math.round(a);
  }
  /** 0-15: N, NNE, NE ... */
  getBearing(az) { return Math.round((((az % 360) + 360) % 360) / 22.5) % 16; }
  /** the 3-letter direction ("NNE") into a char[3] buffer handed over (or returned) */
  getDirection(buf, az) {
    const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const s = names[this.getBearing(az)].padEnd(3, ' ');
    if (isRef(buf)) setRef(buf, s);
    else if (buf && typeof buf === 'object') for (let i = 0; i < 3; i++) buf[i] = s[i];
    return s;
  }
}
