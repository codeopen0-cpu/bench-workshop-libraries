// SD.h: SD.begin(CS);  File f = SD.open("log.txt", FILE_WRITE);  f.println(x);  f.close();
//   File f = SD.open("log.txt");  while (f.available()) Serial.write(f.read());  f.close();
//   SD.exists(name), SD.remove(name), SD.mkdir(name);  f.size(), f.position(), f.seek(n), f.peek(),
//   f.readStringUntil('\n'), f.name();  File root = SD.open("/"); root.openNextFile()
// FILE_WRITE adds to the end of the file (as Arduino's does). It talks to the module over SPI.
const FILE_READ = 1, FILE_WRITE = 0x13, O_READ = 1, O_WRITE = 2, O_APPEND = 4, O_CREAT = 0x10;

const _sd = { cs: -1, ok: false };
const _sdCall = (op, name = '', data = []) => {
  const nb = Array.from(String(name).slice(0, 60), (c) => c.charCodeAt(0) & 255);
  const body = [nb.length, ...nb, ...data];
  digitalWrite(_sd.cs, LOW);
  SPI.transfer([0xb5, op, body.length & 255, body.length >> 8, ...body]);
  digitalWrite(_sd.cs, HIGH);
  digitalWrite(_sd.cs, LOW);
  const r = SPI.transfer([0xb6, ...new Array(410).fill(0xff)]);
  digitalWrite(_sd.cs, HIGH);
  const len = r[1] | (r[2] << 8);
  if (r[1] === 0xff && r[2] === 0xff) return null; // (nothing answered: no card module on the bus)
  return r.slice(3, 3 + len);
};
const _u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];

class File {
  constructor(name = '', write = false, dir = false) {
    this._name = name; this._write = write; this._dir = dir; this._pos = 0; this._open = !!name || dir; this._buf = []; this._list = null;
    this._cache = []; this._cacheAt = -1; this._size = -1;
  }
  /** the byte at the read position, from a 256-byte window read ahead (one SPI exchange per window) */
  _byte(at) {
    if (this._cacheAt < 0 || at < this._cacheAt || at >= this._cacheAt + this._cache.length) {
      const r = _sdCall(5, this._name, [..._u32(at), ..._u32(256)]);
      this._cache = r && r[0] ? r.slice(1) : [];
      this._cacheAt = at;
    }
    const i = at - this._cacheAt;
    return i < this._cache.length ? this._cache[i] : -1;
  }
  name() { return this._name.split('/').pop(); }
  isDirectory() { return this._dir; }
  size() {
    this.flush();
    if (this._size < 0) { const r = _sdCall(4, this._name); this._size = r && r[0] ? (r[1] | (r[2] << 8) | (r[3] << 16) | (r[4] << 24)) >>> 0 : 0; }
    return this._size;
  }
  position() { return this._pos; }
  seek(n) { this._pos = Math.max(0, n); return true; }
  available() { return this._open && !this._write ? Math.max(0, this.size() - this._pos) : 0; }
  read(buf, n) {
    if (buf !== undefined && typeof buf === 'object') {
      let k = 0;
      for (; k < n; k++) { const b = this._byte(this._pos); if (b < 0) break; buf[k] = b; this._pos++; }
      return k;
    }
    const b = this._byte(this._pos);
    if (b >= 0) this._pos++;
    return b;
  }
  peek() { return this._byte(this._pos); }
  readStringUntil(end) {
    let s = '';
    for (;;) {
      const b = this._byte(this._pos);
      if (b < 0) return s;
      this._pos++;
      const ch = String.fromCharCode(b);
      if (ch === end) return s;
      s += ch;
    }
  }
  readString() { return this.readStringUntil('\u0000'); }
  write(x, n) {
    if (!this._write) return 0;
    const bytes = typeof x === 'string' ? Array.from(x, (c) => c.charCodeAt(0) & 255) : x && typeof x === 'object' ? Array.from(x).slice(0, n ?? x.length).map((b) => Number(b) & 255) : [Number(x) & 255];
    this._buf.push(...bytes);
    if (this._buf.length >= 256) this.flush();
    return bytes.length;
  }
  print(x = '', f) {
    let s;
    if (typeof x === 'number' && f !== undefined) s = f === 16 ? Math.trunc(x).toString(16).toUpperCase() : f === 2 ? Math.trunc(x).toString(2) : f === 10 ? String(Math.trunc(x)) : x.toFixed(f);
    else if (typeof x === 'number' && !Number.isInteger(x)) s = x.toFixed(2);
    else s = String(x);
    return this.write(s);
  }
  println(x = '', f) { return this.print(x, f) + this.write('\r\n'); }
  flush() {
    while (this._buf.length) {
      const chunk = this._buf.splice(0, 300);
      _sdCall(6, this._name, chunk);
      this._pos += chunk.length;
      this._size = -1;
      this._cacheAt = -1;
    }
  }
  close() { this.flush(); this._open = false; }
  openNextFile() {
    if (!this._dir) return null;
    if (!this._list) { const r = _sdCall(8, this._name); this._list = r && r[0] ? String.fromCharCode(...r.slice(1)).split('\n').filter(Boolean) : []; }
    const n = this._list.shift();
    return n ? new File((this._name ? this._name + '/' : '') + n, false) : null;
  }
  rewindDirectory() { this._list = null; }
  valueOf() { return this._open; }
}

const SD = {
  begin(cs = SS) {
    _sd.cs = cs;
    pinMode(cs, OUTPUT);
    digitalWrite(cs, HIGH);
    SPI.begin();
    const r = _sdCall(1);
    _sd.ok = !!r && r[0] === 1;
    return _sd.ok;
  },
  exists(name) { const r = _sdCall(2, name); return !!r && r[0] === 1; },
  remove(name) { const r = _sdCall(3, name); return !!r && r[0] === 1; },
  mkdir(name) { const r = _sdCall(9, name); return !!r && r[0] === 1; },
  rmdir(name) { return this.remove(name); },
  /** a File, or null if it can't (no card, or reading one that isn't there): check it with if (f) */
  open(name, mode = FILE_READ) {
    if (!_sd.ok) return null;
    const n = String(name).replace(/^\/+/, '');
    if (n === '') return new File('', false, true);
    const write = (mode & O_WRITE) !== 0;
    if (!write && !this.exists(n)) return null;
    const f = new File(n, write);
    if (write) {
      if (!(mode & O_APPEND) && (mode & O_CREAT) && mode !== FILE_WRITE) _sdCall(7, n);
      _sdCall(6, n, []);
      f._pos = f.size();
    }
    return f;
  },
};
