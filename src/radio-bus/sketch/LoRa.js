// LoRa.h (Sandeep Mistry's library), the parts most sketches use:
//   LoRa.setPins(ss, reset, dio0);  if (!LoRa.begin(433E6)) { ... }
//   LoRa.beginPacket(); LoRa.print("hello"); LoRa.write(b); LoRa.endPacket();
//   int n = LoRa.parsePacket(); while (LoRa.available()) char c = LoRa.read(); LoRa.readString();
//   LoRa.packetRssi(); LoRa.packetSnr(); LoRa.setSpreadingFactor(7..12); LoRa.setSignalBandwidth(125E3);
//   LoRa.setSyncWord(0x12); LoRa.setTxPower(17); LoRa.idle(); LoRa.sleep();
// (It talks to the radio over SPI; endPacket() waits the packet's real air time.)
class LoRaClass {
  constructor() { this.ss = typeof SS === 'number' ? SS : 10; this.rst = -1; this.dio0 = -1; this.tx = []; this.rxb = []; this.rssi = -120; this.snr = 0; this.sf = 7; this.bw = 7; this.sync = 0x12; this.ok = false; }
  _x(bytes) { digitalWrite(this.ss, LOW); const r = SPI.transfer(bytes.slice()); digitalWrite(this.ss, HIGH); return r; }
  setPins(ss = 10, reset = 9, dio0 = 2) { this.ss = ss; this.rst = reset; this.dio0 = dio0; }
  setSPIFrequency() {}
  begin(freq) {
    pinMode(this.ss, OUTPUT); digitalWrite(this.ss, HIGH);
    if (this.rst >= 0) { pinMode(this.rst, OUTPUT); digitalWrite(this.rst, LOW); delay(10); digitalWrite(this.rst, HIGH); delay(10); }
    SPI.begin();
    if (this._x([0xb0, 0])[1] !== 0x12) return 0; // (no radio answers: wiring, or no 3.3 V)
    const f = Math.round(Number(freq)) >>> 0;
    this._x([0xb1, (f >>> 24) & 255, (f >>> 16) & 255, (f >>> 8) & 255, f & 255]);
    this._cfg();
    this.ok = true;
    return 1;
  }
  end() { this.ok = false; }
  _cfg() { this._x([0xb2, this.sf, this.bw, this.sync]); }
  setSpreadingFactor(sf) { this.sf = Math.max(6, Math.min(12, sf | 0)); this._cfg(); }
  setSignalBandwidth(bw) { const list = [7.8e3, 10.4e3, 15.6e3, 20.8e3, 31.25e3, 41.7e3, 62.5e3, 125e3, 250e3, 500e3]; let i = list.findIndex((b) => bw <= b); if (i < 0) i = 9; this.bw = i; this._cfg(); }
  setSyncWord(sw) { this.sync = sw & 255; this._cfg(); }
  setFrequency(freq) { const f = Math.round(Number(freq)) >>> 0; this._x([0xb1, (f >>> 24) & 255, (f >>> 16) & 255, (f >>> 8) & 255, f & 255]); }
  setTxPower() {} setCodingRate4() {} setPreambleLength() {} enableCrc() {} disableCrc() {} idle() {} sleep() {} receive() {}
  onReceive() { warn('LoRa.onReceive: on the bench, call LoRa.parsePacket() in loop() instead (callbacks aren\'t supported)'); }
  beginPacket() { this.tx = []; return 1; }
  write(b, n) {
    if (typeof b === 'object' && b && typeof b.length === 'number') { const k = n ?? b.length; for (let i = 0; i < k; i++) this.tx.push((typeof b[i] === 'string' ? b[i].charCodeAt(0) : b[i]) & 255); return k; }
    this.tx.push(Number(b) & 255); return 1;
  }
  print(x, fmt) {
    const s = typeof x === 'number' && fmt !== undefined ? (fmt === 16 ? x.toString(16).toUpperCase() : x.toFixed(fmt)) : typeof x === 'number' && !Number.isInteger(x) ? x.toFixed(2) : String(x);
    for (const ch of s) this.tx.push(ch.charCodeAt(0) & 255);
    return s.length;
  }
  println(x = '') { const n = this.print(x); this.tx.push(13, 10); return n + 2; }
  endPacket() {
    if (!this.ok) return 0;
    const data = this.tx.slice(0, 255);
    const r = this._x([0xb3, data.length, ...data]);
    delay(r[1] * 10); // (the real air time: sending waits for it)
    this.tx = [];
    return 1;
  }
  parsePacket() {
    if (!this.ok) return 0;
    const n = this._x([0xb4, 0])[1];
    if (!n) return 0;
    this.rxb = this._x([0xb5, ...new Array(n).fill(0)]).slice(1, 1 + n);
    const q = this._x([0xb6, 0, 0]);
    this.rssi = q[1] - 164;
    this.snr = (q[2] > 127 ? q[2] - 256 : q[2]) / 4;
    return n;
  }
  available() { return this.rxb.length; }
  read() { return this.rxb.length ? this.rxb.shift() : -1; }
  peek() { return this.rxb.length ? this.rxb[0] : -1; }
  readString() { let s = ''; while (this.rxb.length) s += String.fromCharCode(this.rxb.shift()); return s; }
  packetRssi() { return this.rssi; }
  packetSnr() { return this.snr; }
  rssi() { return -110; }
}
const LoRa = new LoRaClass();
