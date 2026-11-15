// TinyGPSPlus.h (Mikal Hart's TinyGPS++): TinyGPSPlus gps;  while (Serial1.available()) gps.encode(Serial1.read());
//   gps.location.isValid(), isUpdated(), lat(), lng(), age();  gps.date.year() month() day();
//   gps.time.hour() minute() second() centisecond();  gps.speed.kmph() mps() knots() mph();  gps.course.deg();
//   gps.altitude.meters();  gps.satellites.value();  gps.hdop.hdop();  gps.charsProcessed();
//   TinyGPSPlus::distanceBetween(lat1, lng1, lat2, lng2) (m), courseTo(...) (deg), cardinal(deg)
class _GpsVal {
  constructor() { this.valid = false; this.updated = false; this.v = 0; this.at = 0; }
  set(v) { this.v = v; this.valid = true; this.updated = true; this.at = millis(); }
  isValid() { return this.valid; }
  isUpdated() { const u = this.updated; this.updated = false; return u; }
  age() { return this.valid ? millis() - this.at : 0xffffffff; }
  value() { this.updated = false; return this.v; }
}
class TinyGPSPlus {
  constructor() {
    this.buf = '';
    this.chars = 0; this.passed = 0; this.failed = 0; this.fixes = 0;
    const loc = new _GpsVal();
    loc.v = { lat: 0, lng: 0 };
    loc.lat = () => { loc.updated = false; return loc.v.lat; };
    loc.lng = () => { loc.updated = false; return loc.v.lng; };
    this.location = loc;
    const date = new _GpsVal();
    date.year = () => 2000 + (date.v % 100); date.month = () => Math.floor(date.v / 100) % 100; date.day = () => Math.floor(date.v / 10000);
    this.date = date;
    const time = new _GpsVal();
    time.hour = () => Math.floor(time.v / 1000000); time.minute = () => Math.floor(time.v / 10000) % 100; time.second = () => Math.floor(time.v / 100) % 100; time.centisecond = () => time.v % 100;
    this.time = time;
    const speed = new _GpsVal();
    speed.knots = () => speed.v; speed.kmph = () => speed.v * 1.852; speed.mps = () => speed.v * 0.514444; speed.mph = () => speed.v * 1.15078;
    this.speed = speed;
    const course = new _GpsVal();
    course.deg = () => course.v;
    this.course = course;
    const alt = new _GpsVal();
    alt.meters = () => alt.v; alt.feet = () => alt.v * 3.28084; alt.kilometers = () => alt.v / 1000;
    this.altitude = alt;
    this.satellites = new _GpsVal();
    const hdop = new _GpsVal();
    hdop.hdop = () => hdop.v;
    this.hdop = hdop;
  }
  charsProcessed() { return this.chars; }
  sentencesWithFix() { return this.fixes; }
  failedChecksum() { return this.failed; }
  passedChecksum() { return this.passed; }
  /** feed one character; true when it finished a sentence that made sense */
  encode(c) {
    this.chars++;
    const ch = typeof c === 'number' ? String.fromCharCode(c) : String(c);
    if (ch === '$') { this.buf = '$'; return false; }
    if (ch === '\n' || ch === '\r') {
      const s = this.buf;
      this.buf = '';
      return s.length > 6 ? this._sentence(s) : false;
    }
    if (this.buf.length < 120) this.buf += ch;
    return false;
  }
  _sentence(s) {
    const star = s.indexOf('*');
    if (star < 0) return false;
    const body = s.slice(1, star);
    let x = 0;
    for (const ch of body) x ^= ch.charCodeAt(0);
    if (x !== parseInt(s.slice(star + 1, star + 3), 16)) { this.failed++; return false; }
    this.passed++;
    const f = body.split(',');
    const coord = (v, h, isLat) => {
      if (!v) return null;
      const d = Math.floor(Number(v) / 100), m = Number(v) - d * 100;
      const deg = d + m / 60;
      return h === 'S' || h === 'W' ? -deg : deg;
    };
    const type = f[0].slice(2);
    if (type === 'RMC') {
      if (f[1]) this.time.set(Math.round(Number(f[1]) * 100));
      if (f[9]) this.date.set(Number(f[9]));
      if (f[2] === 'A') {
        this.location.set({ lat: coord(f[3], f[4], true), lng: coord(f[5], f[6], false) });
        if (f[7]) this.speed.set(Number(f[7]));
        if (f[8]) this.course.set(Number(f[8]));
        this.fixes++;
      }
      return true;
    }
    if (type === 'GGA') {
      if (f[1]) this.time.set(Math.round(Number(f[1]) * 100));
      this.satellites.set(Number(f[7] || 0));
      this.hdop.set(Number(f[8] || 99.99));
      if (Number(f[6]) > 0) {
        this.location.set({ lat: coord(f[2], f[3], true), lng: coord(f[4], f[5], false) });
        if (f[9]) this.altitude.set(Number(f[9]));
        this.fixes++;
      }
      return true;
    }
    return type === 'VTG' || type === 'GSA' || type === 'GSV';
  }
}
TinyGPSPlus.distanceBetween = (lat1, lng1, lat2, lng2) => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6372795 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
TinyGPSPlus.courseTo = (lat1, lng1, lat2, lng2) => {
  const r = Math.PI / 180, dLng = (lng2 - lng1) * r;
  const y = Math.sin(dLng) * Math.cos(lat2 * r), x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLng);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};
TinyGPSPlus.cardinal = (deg) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
