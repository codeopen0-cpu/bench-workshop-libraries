// Adafruit_BME280.h, the usual parts: begin(address), readTemperature(), readHumidity(),
// readPressure() (Pa), readAltitude(seaLevel hPa), sensorID(). (This sensor's registers are
// simplified in Bench Workshop: see the part's description.)
class Adafruit_BME280 {
  constructor() { this.addr = 0x77; }
  begin(addr = 0x77) {
    this.addr = addr;
    Wire.begin();
    const id = this.reg(0xd0, 1);
    return !!id && id[0] === 0x60;
  }
  sensorID() { const id = this.reg(0xd0, 1); return id ? id[0] : 0; }
  reg(r, n) {
    Wire.beginTransmission(this.addr);
    Wire.write(r);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.addr, n) !== n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  readTemperature() {
    const d = this.reg(0xfa, 2);
    if (!d) return NAN;
    let t = (d[0] << 8) | d[1];
    if (t & 0x8000) t -= 0x10000;
    return t / 100;
  }
  readHumidity() {
    const d = this.reg(0xfc, 2);
    return d ? ((d[0] << 8) | d[1]) / 100 : NAN;
  }
  readPressure() {
    const d = this.reg(0xf7, 3);
    return d ? (d[0] << 16) | (d[1] << 8) | d[2] : NAN; // (Pa)
  }
  /** metres above where the pressure would be seaLevel hPa */
  readAltitude(seaLevel = 1013.25) {
    const p = this.readPressure() / 100;
    return 44330 * (1 - Math.pow(p / seaLevel, 0.1903));
  }
  seaLevelForAltitude(altitude, pressure) { return pressure / Math.pow(1 - altitude / 44330, 5.255); }
  setSampling() {}
  takeForcedMeasurement() { return true; }
}
