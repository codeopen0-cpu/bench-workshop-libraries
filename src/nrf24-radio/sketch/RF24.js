// RF24.h (TMRh20's library), the parts most sketches use:
//   RF24 radio(CE_PIN, CSN_PIN);  radio.begin();  radio.setPALevel(RF24_PA_LOW);
//   const byte address[6] = "00001";  radio.openWritingPipe(address);  radio.stopListening();
//   radio.write(&value, sizeof(value))  (true: the other end got it)
//   radio.openReadingPipe(1, address);  radio.startListening();  if (radio.available()) radio.read(&value, sizeof(value));
// What's sent are the bytes of what you hand it: an int is 2 bytes, a long or float 4, a char array its
// characters (as on an Arduino UNO).
const RF24_PA_MIN = 0, RF24_PA_LOW = 1, RF24_PA_HIGH = 2, RF24_PA_MAX = 3;
const RF24_1MBPS = 0, RF24_2MBPS = 1, RF24_250KBPS = 2;
const RF24_CRC_DISABLED = 0, RF24_CRC_8 = 1, RF24_CRC_16 = 2;

/** the bytes of a value handed to write(): a number, a text, an array, a "&x" */
const _rfBytes = (x, len) => {
  const out = [];
  const num = (v, type, size) => {
    const b = new DataView(new ArrayBuffer(8));
    if (type === 'f' || (size === 4 && !Number.isInteger(Number(v)) && type !== 'i' && type !== 'u')) { b.setFloat32(0, Number(v), true); return [0, 1, 2, 3].map((i) => b.getUint8(i)); }
    if (size === 1) return [Number(v) & 255];
    if (size === 2) { b.setInt16(0, Number(v) | 0, true); return [b.getUint8(0), b.getUint8(1)]; }
    b.setInt32(0, Number(v) | 0, true); return [0, 1, 2, 3].map((i) => b.getUint8(i));
  };
  let v = x, type = '';
  if (isRef(x)) { v = x.value; type = x.type; }
  if (typeof v === 'string') for (const ch of v) out.push(ch.charCodeAt(0) & 255);
  else if (v && typeof v === 'object' && typeof v.length === 'number') {
    const size = v.length ? Math.max(1, Math.floor(len / v.length)) : 1;
    for (let i = 0; i < v.length; i++) out.push(...(typeof v[i] === 'string' ? [v[i].charCodeAt(0) & 255] : num(v[i], '', size)));
  } else if (typeof v === 'boolean' || type === 'b') out.push(v ? 1 : 0);
  else out.push(...num(v ?? 0, type, Math.min(4, len)));
  while (out.length < len) out.push(0);
  return out.slice(0, len);
};
/** put received bytes into what read() was handed */
const _rfInto = (x, bytes, len) => {
  const dv = new DataView(new Uint8Array(bytes.concat(new Array(8).fill(0))).buffer);
  if (isRef(x)) {
    const t = x.type, cur = x.value;
    if (t === 's' || typeof cur === 'string') { let s = ''; for (const b of bytes) { if (!b) break; s += String.fromCharCode(b); } x.value = s; return; }
    if (t === 'b') { x.value = !!bytes[0]; return; }
    if (t === 'f') { x.value = dv.getFloat32(0, true); return; }
    if (len === 1) x.value = bytes[0];
    else if (len === 2) x.value = t === 'u' ? dv.getUint16(0, true) : dv.getInt16(0, true);
    else x.value = t === 'u' ? dv.getUint32(0, true) : dv.getInt32(0, true);
    return;
  }
  if (x && typeof x === 'object' && typeof x.length === 'number') {
    const size = x.length ? Math.max(1, Math.floor(len / x.length)) : 1;
    for (let i = 0; i < x.length; i++) {
      const o = i * size;
      x[i] = size === 1 ? bytes[o] ?? 0 : size === 2 ? dv.getInt16(o, true) : dv.getInt32(o, true);
    }
  }
};
/** an address: "00001" / "1Node" (its characters, as written), or a number (0xF0F0F0F0E1) */
const _rfAddr = (a, w = 5) => {
  if (typeof a === 'string') return Array.from(a.slice(0, w), (c) => c.charCodeAt(0) & 255);
  if (a && typeof a === 'object' && typeof a.length === 'number') return Array.from(a).slice(0, w).map((c) => (typeof c === 'string' ? c.charCodeAt(0) : Number(c)) & 255);
  let n = Number(a); const out = [];
  for (let i = 0; i < w; i++) { out.push(n % 256); n = Math.floor(n / 256); }
  return out;
};

class RF24 {
  constructor(ce, csn) { this.ce = ce; this.csn = csn; this.size = 32; this.dyn = false; this.pipe0 = null; this.listening = false; this.ok = false; }
  _x(bytes) { digitalWrite(this.csn, LOW); const r = SPI.transfer(bytes.slice()); digitalWrite(this.csn, HIGH); return r; }
  _w(reg, v) { return this._x([0x20 | reg, ...(Array.isArray(v) ? v : [v & 255])])[0]; }
  _r(reg, n = 1) { const r = this._x([reg & 0x1f, ...new Array(n).fill(0xff)]); return n === 1 ? r[1] : r.slice(1); }
  get_status() { return this._x([0xff])[0]; }
  begin() {
    pinMode(this.ce, OUTPUT); pinMode(this.csn, OUTPUT);
    digitalWrite(this.ce, LOW); digitalWrite(this.csn, HIGH);
    SPI.begin();
    delay(5);
    this._w(0x04, 0x5f); // SETUP_RETR: 1500 us, 15 tries
    this.setDataRate(RF24_1MBPS);
    this._w(0x1d, 0); this._w(0x1c, 0); this._w(0x01, 0x3f); this._w(0x02, 0x03);
    this.setPayloadSize(32);
    this._w(0x03, 0x03);
    this.setChannel(76);
    this._w(0x07, 0x70);
    this._x([0xe2]); this._x([0xe1]);
    this._w(0x00, 0x0c); // CRC 16
    this.powerUp();
    this._w(0x00, this._r(0x00) & ~0x01); // transmit mode
    this.ok = this.isChipConnected();
    return this.ok;
  }
  isChipConnected() { const aw = this._r(0x03); return aw >= 1 && aw <= 3; }
  failureDetected = false;
  powerUp() { const c = this._r(0x00); if (!(c & 0x02)) { this._w(0x00, c | 0x02); delay(5); } }
  powerDown() { digitalWrite(this.ce, LOW); this._w(0x00, this._r(0x00) & ~0x02); }
  setChannel(ch) { this._w(0x05, Math.max(0, Math.min(125, ch))); }
  getChannel() { return this._r(0x05); }
  setPALevel(level) { this._w(0x06, (this._r(0x06) & 0xf8) | ((level & 3) << 1)); }
  getPALevel() { return (this._r(0x06) >> 1) & 3; }
  setDataRate(rate) {
    let v = this._r(0x06) & ~0x28;
    if (rate === RF24_250KBPS) v |= 0x20; else if (rate === RF24_2MBPS) v |= 0x08;
    this._w(0x06, v);
    return true;
  }
  getDataRate() { const v = this._r(0x06); return v & 0x20 ? RF24_250KBPS : v & 0x08 ? RF24_2MBPS : RF24_1MBPS; }
  setCRCLength(l) { let c = this._r(0x00) & ~0x0c; if (l === RF24_CRC_8) c |= 0x08; else if (l === RF24_CRC_16) c |= 0x0c; this._w(0x00, c); }
  disableCRC() { this._w(0x00, this._r(0x00) & ~0x08); }
  setPayloadSize(n) { this.size = Math.max(1, Math.min(32, n)); for (let p = 0; p < 6; p++) this._w(0x11 + p, this.size); }
  getPayloadSize() { return this.size; }
  setAddressWidth(w) { this._w(0x03, Math.max(1, Math.min(3, w - 2))); }
  setRetries(delayX, count) { this._w(0x04, ((delayX & 15) << 4) | (count & 15)); }
  setAutoAck(a, b) {
    if (b === undefined) this._w(0x01, a ? 0x3f : 0);
    else { let v = this._r(0x01); v = b ? v | (1 << a) : v & ~(1 << a); this._w(0x01, v); }
  }
  enableDynamicPayloads() { this._w(0x1d, this._r(0x1d) | 0x04); this._w(0x1c, 0x3f); this.dyn = true; }
  disableDynamicPayloads() { this._w(0x1d, this._r(0x1d) & ~0x04); this._w(0x1c, 0); this.dyn = false; }
  enableAckPayload() {}
  getDynamicPayloadSize() { return this._x([0x60, 0xff])[1]; }
  openWritingPipe(address) {
    const a = _rfAddr(address);
    this._w(0x0a, a); this._w(0x10, a); // (pipe 0 hears the acknowledgement)
    this.pipe0 = a;
  }
  openReadingPipe(pipe, address) {
    const a = _rfAddr(address);
    if (pipe === 0) { this.pipe0 = a; this._w(0x0a, a); }
    else if (pipe === 1) this._w(0x0b, a);
    else this._w(0x0a + pipe, a[0]);
    if (!this.dyn) this._w(0x11 + pipe, this.size);
    this._w(0x02, this._r(0x02) | (1 << pipe));
  }
  closeReadingPipe(pipe) { this._w(0x02, this._r(0x02) & ~(1 << pipe)); }
  startListening() {
    this.powerUp();
    this._w(0x00, this._r(0x00) | 0x01);
    this._w(0x07, 0x70);
    digitalWrite(this.ce, HIGH);
    if (this.pipe0) this._w(0x0a, this.pipe0);
    this.listening = true;
  }
  stopListening() {
    digitalWrite(this.ce, LOW);
    delayMicroseconds(100);
    this._w(0x00, this._r(0x00) & ~0x01);
    this._w(0x02, this._r(0x02) | 0x01);
    this.listening = false;
  }
  /** a message waiting? (available(&pipe) also says which pipe it came on) */
  available(pipe) {
    const fifo = this._r(0x17);
    if (fifo & 0x01) return false;
    if (pipe !== undefined) setRef(pipe, (this.get_status() >> 1) & 7);
    return true;
  }
  read(buf, len) {
    const n = this.dyn ? this.getDynamicPayloadSize() : this.size;
    const r = this._x([0x61, ...new Array(n).fill(0xff)]).slice(1);
    this._w(0x07, 0x40);
    _rfInto(buf, r.slice(0, len), len);
  }
  /** send it and wait for the acknowledgement: true = the other end got it */
  write(buf, len, multicast = false) {
    const data = _rfBytes(buf, Math.min(32, len));
    const payload = this.dyn ? data : data.concat(new Array(Math.max(0, this.size - data.length)).fill(0)).slice(0, this.size);
    this._w(0x07, 0x70);
    this._x([multicast ? 0xb0 : 0xa0, ...payload]);
    digitalWrite(this.ce, HIGH);
    delayMicroseconds(15);
    const until = millis() + 95;
    let st = 0;
    for (;;) {
      st = this.get_status();
      if (st & 0x30) break;
      if (millis() > until) { this.failureDetected = true; break; }
      delay(1);
    }
    digitalWrite(this.ce, LOW);
    this._w(0x07, 0x70);
    if (st & 0x10) { this._x([0xe1]); return false; }
    return !!(st & 0x20);
  }
  writeFast(buf, len) { return this.write(buf, len); }
  txStandBy() { return true; }
  flush_tx() { this._x([0xe1]); }
  flush_rx() { this._x([0xe2]); }
  testCarrier() { return false; }
  testRPD() { return false; }
  printDetails() {
    Serial.print('STATUS = 0x'); Serial.println(this.get_status(), HEX);
    Serial.print('RF_CH = '); Serial.println(this.getChannel());
    Serial.print('Data rate = '); Serial.println(['1 Mbps', '2 Mbps', '250 kbps'][this.getDataRate()]);
    Serial.print('Payload size = '); Serial.println(this.size);
  }
  printPrettyDetails() { this.printDetails(); }
}
