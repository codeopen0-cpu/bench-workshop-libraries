// DHT.h (Adafruit's DHT sensor library): DHT dht(pin, DHT22); dht.begin(); readTemperature(),
// readHumidity(), computeHeatIndex(), convertCtoF(). Like the real one it reads the sensor at most
// every 2 s (giving the last reading in between) and gives NAN when the sensor doesn't answer.
const DHT11 = 11, DHT12 = 12, DHT21 = 21, DHT22 = 22, AM2301 = 21;

class DHT {
  constructor(pin, type = DHT22) {
    this.pin = pin;
    this.type = type;
    this.last = -1e9;
    this.ok = false;
    this.data = [0, 0, 0, 0, 0];
  }
  begin() {
    pinMode(this.pin, INPUT_PULLUP);
    this.last = millis() - 2000;
  }
  /** ask the sensor (the board pulls the wire low, then listens): true if it answered */
  read(force = false) {
    if (!force && millis() - this.last < 2000) return this.ok;
    this.last = millis();
    linkReceive(this.pin, 'data'); // (anything old on the wire)
    linkSend(this.pin, 'data', [1, this.type]);
    const until = millis() + 40;
    while (millis() < until) {
      const got = linkReceive(this.pin, 'data');
      if (got.length) {
        const d = got[got.length - 1].data;
        this.ok = d.length === 5 && ((d[0] + d[1] + d[2] + d[3]) & 255) === d[4];
        if (this.ok) this.data = d;
        return this.ok;
      }
      delay(1);
    }
    this.ok = false; // nobody answered: is it wired, and powered?
    return false;
  }
  readTemperature(fahrenheit = false, force = false) {
    if (!this.read(force)) return NAN;
    const d = this.data;
    let t;
    if (this.type === DHT11 || this.type === DHT12) t = d[2] + (d[3] & 0x0f) * 0.1;
    else {
      t = (((d[2] & 0x7f) << 8) | d[3]) * 0.1;
      if (d[2] & 0x80) t = -t;
    }
    return fahrenheit ? this.convertCtoF(t) : t;
  }
  readHumidity(force = false) {
    if (!this.read(force)) return NAN;
    const d = this.data;
    if (this.type === DHT11 || this.type === DHT12) return d[0] + d[1] * 0.1;
    return ((d[0] << 8) | d[1]) * 0.1;
  }
  convertCtoF(c) { return c * 1.8 + 32; }
  convertFtoC(f) { return (f - 32) * 0.55555; }
  /** how hot it feels (NOAA's formula, as the real library) */
  computeHeatIndex(t, h, fahrenheit = true) {
    const T = fahrenheit ? t : this.convertCtoF(t);
    let hi = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + h * 0.094);
    if (hi > 79) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * h - 0.22475541 * T * h - 0.00683783 * T * T - 0.05481717 * h * h + 0.00122874 * T * T * h + 0.00085282 * T * h * h - 0.00000199 * T * T * h * h;
      if (h < 13 && T >= 80 && T <= 112) hi -= ((13 - h) * 0.25) * Math.sqrt((17 - Math.abs(T - 95)) * 0.05882);
      else if (h > 85 && T >= 80 && T <= 87) hi += ((h - 85) * 0.1) * ((87 - T) * 0.2);
    }
    return fahrenheit ? hi : this.convertFtoC(hi);
  }
}
