// RTClib.h (Adafruit's): RTC_DS3231 rtc;  rtc.begin();  DateTime now = rtc.now();
//   now.year(), month(), day(), hour(), minute(), second(), dayOfTheWeek() (0 = Sunday), unixtime();
//   rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));  rtc.lostPower();  rtc.getTemperature();
//   DateTime(2026, 11, 15, 19, 30, 0);  now + TimeSpan(1, 0, 0, 0) (a day later)
const F = (s) => s;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _built = new Date();
const __DATE__ = `${MONTHS[_built.getMonth()]} ${String(_built.getDate()).padStart(2, ' ')} ${_built.getFullYear()}`;
const __TIME__ = [_built.getHours(), _built.getMinutes(), _built.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
const DS3231_OFF = 0x1c, DS3231_SquareWave1Hz = 0x00;
const _bcd = (n) => ((Math.floor(n / 10) << 4) | (n % 10)) & 255;
const _unbcd = (b) => (b >> 4) * 10 + (b & 15);

class TimeSpan {
  constructor(days = 0, hours = 0, minutes = 0, seconds = 0) {
    this.secs = arguments.length === 1 ? days : days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }
  days() { return Math.trunc(this.secs / 86400); }
  hours() { return Math.trunc(this.secs / 3600) % 24; }
  minutes() { return Math.trunc(this.secs / 60) % 60; }
  seconds() { return this.secs % 60; }
  totalseconds() { return this.secs; }
}

class DateTime {
  /** DateTime(unixtime) / DateTime(y, m, d, h, mi, s) / DateTime("Nov 15 2026", "19:30:00") / DateTime(other) */
  constructor(a = 946684800, m, d = 1, h = 0, mi = 0, s = 0) {
    if (a instanceof DateTime) this.t = a.t;
    else if (typeof a === 'string') {
      const [mon, day, year] = a.trim().split(/\s+/);
      const [hh, mm, ss] = String(m ?? '00:00:00').split(':').map(Number);
      this.t = Date.UTC(Number(year), Math.max(0, MONTHS.indexOf(mon)), Number(day), hh, mm, ss) / 1000;
    } else if (m === undefined) this.t = Number(a);
    else this.t = Date.UTC(a < 100 ? 2000 + a : a, m - 1, d, h, mi, s) / 1000;
  }
  _d() { return new Date(this.t * 1000); }
  year() { return this._d().getUTCFullYear(); }
  month() { return this._d().getUTCMonth() + 1; }
  day() { return this._d().getUTCDate(); }
  hour() { return this._d().getUTCHours(); }
  twelveHour() { const h = this.hour() % 12; return h === 0 ? 12 : h; }
  isPM() { return this.hour() >= 12; }
  minute() { return this._d().getUTCMinutes(); }
  second() { return this._d().getUTCSeconds(); }
  dayOfTheWeek() { return this._d().getUTCDay(); }
  unixtime() { return this.t; }
  secondstime() { return this.t - 946684800; }
  isValid() { return Number.isFinite(this.t); }
  /** "YYYY-MM-DDThh:mm:ss" (or the buffer's own pattern: "hh:mm:ss", "DD/MM/YYYY") */
  timestamp(opt = 0) {
    const iso = this._d().toISOString().slice(0, 19);
    return opt === 1 ? iso.slice(11) : opt === 2 ? iso.slice(0, 10) : iso;
  }
  toString(fmt) {
    if (typeof fmt !== 'string') return this.timestamp();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return fmt.replace('YYYY', p(this.year(), 4)).replace('YY', p(this.year() % 100)).replace('MM', p(this.month())).replace('DD', p(this.day()))
      .replace('hh', p(this.hour())).replace('mm', p(this.minute())).replace('ss', p(this.second())).replace('DDD', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][this.dayOfTheWeek()]);
  }
  add(span) { return new DateTime(this.t + (span instanceof TimeSpan ? span.secs : Number(span))); }
  sub(x) { return x instanceof DateTime ? new TimeSpan(this.t - x.t) : new DateTime(this.t - (x instanceof TimeSpan ? x.secs : Number(x))); }
}
DateTime.TIMESTAMP_FULL = 0;
DateTime.TIMESTAMP_TIME = 1;
DateTime.TIMESTAMP_DATE = 2;

class RTC_DS3231 {
  constructor() { this.addr = 0x68; }
  _r(reg, n) {
    Wire.beginTransmission(this.addr); Wire.write(reg);
    if (Wire.endTransmission() !== 0) return null;
    if (Wire.requestFrom(this.addr, n) < n) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(Wire.read());
    return out;
  }
  _w(reg, bytes) { Wire.beginTransmission(this.addr); Wire.write(reg); for (const b of bytes) Wire.write(b); return Wire.endTransmission() === 0; }
  begin() { Wire.begin(); return this._r(0x0f, 1) !== null; }
  lostPower() { const s = this._r(0x0f, 1); return !!s && !!(s[0] & 0x80); }
  now() {
    const r = this._r(0x00, 7);
    if (!r) return new DateTime(0);
    return new DateTime(2000 + _unbcd(r[6]) + (r[5] & 0x80 ? 100 : 0), _unbcd(r[5] & 0x1f), _unbcd(r[4]), _unbcd(r[2] & 0x3f), _unbcd(r[1]), _unbcd(r[0] & 0x7f));
  }
  adjust(dt) {
    const d = dt instanceof DateTime ? dt : new DateTime(dt);
    this._w(0x00, [_bcd(d.second()), _bcd(d.minute()), _bcd(d.hour()), d.dayOfTheWeek() + 1, _bcd(d.day()), _bcd(d.month()) | (d.year() >= 2100 ? 0x80 : 0), _bcd(d.year() % 100)]);
    const s = this._r(0x0f, 1);
    if (s) this._w(0x0f, [s[0] & 0x7f]);
  }
  getTemperature() { const r = this._r(0x11, 2); return r ? (r[0] >= 128 ? r[0] - 256 : r[0]) + (r[1] >> 6) * 0.25 : NAN; }
  writeSqwPinMode(mode) { this._w(0x0e, [mode]); }
  readSqwPinMode() { const r = this._r(0x0e, 1); return r ? r[0] & 0x1c : 0; }
}
class RTC_DS1307 extends RTC_DS3231 {
  isrunning() { return !this.lostPower(); }
}
