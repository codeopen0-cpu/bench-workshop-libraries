// SCServo.h (Feetech's library) for STS servos (the STS3215):
//   SMS_STS st;  Serial1.begin(1000000);  st.pSerial = &Serial1;
//   st.WritePosEx(1, 2048, 2400, 50);   go to position 2048 (0-4095 = one turn) at 2400 steps/s, acceleration 50
//   st.ReadPos(1), st.ReadSpeed(1), st.ReadLoad(1), st.ReadVoltage(1) (0.1 V), st.ReadTemper(1), st.ReadMove(1)
//   st.WheelMode(1);  st.WriteSpe(1, 2000, 50);   spin as a wheel (steps/s, minus = backwards)
//   st.EnableTorque(1, 0);  st.Ping(1);  st.FeedBack(1) then ReadPos(-1)...
// Packets: FF FF id len instr params checksum; replies come back on the same wire.
class SMS_STS {
  constructor(serial) {
    this.pSerial = serial ?? null;
    this.Error = 0;
    this.IOTimeOut = 20; // ms
    this.fb = null;
  }
  _port() {
    if (!this.pSerial) throw new Error('SMS_STS: set its serial port first: st.pSerial = &Serial1;');
    return this.pSerial;
  }
  _send(id, ins, params) {
    const body = [id & 255, params.length + 2, ins, ...params.map((b) => b & 255)];
    const chk = ~body.reduce((s, b) => s + b, 0) & 255;
    const port = this._port();
    while (port.available() > 0) port.read(); // (anything old)
    port.write([0xff, 0xff, ...body, chk]);
    port.flush();
  }
  /** a reply's parameters, or null (nobody answered in time / it was garbled) */
  _reply(id) {
    const port = this._port();
    const buf = [];
    const until = millis() + this.IOTimeOut;
    for (;;) {
      while (port.available() > 0) buf.push(port.read());
      const s = buf.findIndex((b, i) => b === 0xff && buf[i + 1] === 0xff && buf[i + 2] === (id & 255));
      if (s >= 0 && buf.length >= s + 4 && buf.length >= s + 4 + buf[s + 3]) {
        const len = buf[s + 3];
        const pkt = buf.slice(s + 2, s + 4 + len);
        const chk = ~pkt.slice(0, -1).reduce((a, b) => a + b, 0) & 255;
        if (chk !== pkt[pkt.length - 1]) return null;
        this.Error = pkt[2];
        return pkt.slice(3, -1);
      }
      if (millis() >= until) return null;
      delay(1);
    }
  }
  _write(id, addr, data) {
    this._send(id, 0x03, [addr, ...data]);
    if (id === 0xfe) return 1;
    return this._reply(id) ? 1 : 0;
  }
  _read(id, addr, n) {
    this._send(id, 0x02, [addr, n]);
    return this._reply(id);
  }
  _word(x) { return [x & 255, (x >> 8) & 255]; }
  _signed(x) { return x < 0 ? (-x & 0x7fff) | 0x8000 : x & 0x7fff; }
  _unsigned(w) { return w & 0x8000 ? -(w & 0x7fff) : w; }
  Ping(id) { this._send(id, 0x01, []); const r = this._reply(id); return r ? id : -1; }
  writeByte(id, addr, v) { return this._write(id, addr, [v]); }
  writeWord(id, addr, v) { return this._write(id, addr, this._word(v)); }
  readByte(id, addr) { const r = this._read(id, addr, 1); return r ? r[0] : -1; }
  readWord(id, addr) { const r = this._read(id, addr, 2); return r ? r[0] | (r[1] << 8) : -1; }
  EnableTorque(id, en) { return this.writeByte(id, 40, en ? 1 : 0); }
  unLockEprom(id) { return this.writeByte(id, 55, 0); }
  LockEprom(id) { return this.writeByte(id, 55, 1); }
  /** go to a position (0-4095 a turn) at a speed (steps/s, 0 = as fast as it can) and acceleration */
  WritePosEx(id, pos, speed = 0, acc = 0) {
    return this._write(id, 41, [acc, ...this._word(this._signed(pos)), 0, 0, ...this._word(speed)]);
  }
  RegWritePosEx(id, pos, speed = 0, acc = 0) { return this.WritePosEx(id, pos, speed, acc); }
  RegWriteAction() { return 1; }
  /** several at once: ids, how many, their positions, speeds, accelerations (arrays) */
  SyncWritePosEx(ids, n, pos, speed, acc) {
    const params = [41, 7];
    for (let i = 0; i < n; i++) params.push(ids[i], acc ? acc[i] : 0, ...this._word(this._signed(pos[i])), 0, 0, ...this._word(speed ? speed[i] : 0));
    this._send(0xfe, 0x83, params);
  }
  /** wheel mode: it spins (WriteSpe sets how fast) instead of going to positions */
  WheelMode(id) { return this.writeByte(id, 33, 1); }
  PosMode(id) { return this.writeByte(id, 33, 0); }
  WriteSpe(id, speed, acc = 0) { return this._write(id, 41, [acc]) && this._write(id, 46, this._word(this._signed(speed))); }
  /** read its state once; then ReadPos(-1) etc. give it without asking again */
  FeedBack(id) { this.fb = this._read(id, 56, 15); return this.fb ? this.fb.length : -1; }
  _fbWord(id, off, addr) {
    if (id === -1) return this.fb ? this.fb[off] | (this.fb[off + 1] << 8) : -1;
    const r = this._read(id, addr, 2);
    return r ? r[0] | (r[1] << 8) : -1;
  }
  _fbByte(id, off, addr) {
    if (id === -1) return this.fb ? this.fb[off] : -1;
    const r = this._read(id, addr, 1);
    return r ? r[0] : -1;
  }
  ReadPos(id) { const w = this._fbWord(id, 0, 56); return w < 0 ? -1 : this._unsigned(w); }
  ReadSpeed(id) { const w = this._fbWord(id, 2, 58); return w < 0 ? -1 : this._unsigned(w); }
  ReadLoad(id) { const w = this._fbWord(id, 4, 60); return w < 0 ? -1 : this._unsigned(w); }
  ReadVoltage(id) { return this._fbByte(id, 6, 62); }
  ReadTemper(id) { return this._fbByte(id, 7, 63); }
  ReadMove(id) { return this._fbByte(id, 10, 66); }
  ReadCurrent(id) { const l = this.ReadLoad(id); return l < 0 ? -1 : Math.round(Math.abs(l) * 2.5); }
  ReadMode(id) { return this.readByte(id, 33); }
  getErr() { return this.Error; }
}
// (the older SCS servos speak the same protocol)
class SCSCL extends SMS_STS {}
