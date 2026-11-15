// Dynamixel2Arduino.h (ROBOTIS), Protocol 2.0, for the XL430:
//   Dynamixel2Arduino dxl(Serial1, DXL_DIR_PIN);   (the direction pin: -1 for none)
//   dxl.begin(57600);  dxl.setPortProtocolVersion(2.0);  dxl.ping(1);
//   dxl.torqueOff(1);  dxl.setOperatingMode(1, OP_POSITION);  dxl.torqueOn(1);
//   dxl.setGoalPosition(1, 90.0, UNIT_DEGREE);  dxl.getPresentPosition(1, UNIT_DEGREE);
//   dxl.setOperatingMode(1, OP_VELOCITY);  dxl.setGoalVelocity(1, 30, UNIT_RPM);
//   dxl.ledOn(1);  dxl.readControlTableItem(PRESENT_INPUT_VOLTAGE, 1);  dxl.writeControlTableItem(PROFILE_VELOCITY, 1, 50);
const OP_VELOCITY = 1, OP_POSITION = 3, OP_EXTENDED_POSITION = 4, OP_CURRENT = 0, OP_CURRENT_BASED_POSITION = 5, OP_PWM = 16;
const UNIT_RAW = 0, UNIT_PERCENT = 1, UNIT_RPM = 2, UNIT_DEGREE = 3, UNIT_MILLI_AMPERE = 4;
// control table items: [address, size] on the XL430
const MODEL_NUMBER = 1, ID = 2, BAUD_RATE = 3, OPERATING_MODE = 4, TORQUE_ENABLE = 5, LED = 6, GOAL_VELOCITY = 7, PROFILE_ACCELERATION = 8;
const PROFILE_VELOCITY = 9, GOAL_POSITION = 10, MOVING = 11, PRESENT_LOAD = 12, PRESENT_VELOCITY = 13, PRESENT_POSITION = 14;
const PRESENT_INPUT_VOLTAGE = 15, PRESENT_TEMPERATURE = 16;
const _DXL_ITEMS = {
  1: [0, 2], 2: [7, 1], 3: [8, 1], 4: [11, 1], 5: [64, 1], 6: [65, 1], 7: [104, 4], 8: [108, 4], 9: [112, 4], 10: [116, 4],
  11: [122, 1], 12: [126, 2], 13: [128, 4], 14: [132, 4], 15: [144, 2], 16: [146, 1],
};
const _DXL_CRC = (() => {
  const t = [];
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t.push(c);
  }
  return t;
})();
const _dxlCrc = (bytes) => {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ _DXL_CRC[((crc >> 8) ^ b) & 0xff]) & 0xffff;
  return crc;
};

class Dynamixel2Arduino {
  constructor(port, dirPin = -1) {
    this.port = port; this.dir = dirPin; this.proto = 2.0; this.timeout = 30; this.lastErr = 0;
  }
  begin(baud = 57600) {
    this.port.begin(baud);
    if (this.dir >= 0) { pinMode(this.dir, OUTPUT); digitalWrite(this.dir, LOW); }
    return true;
  }
  setPortProtocolVersion(v) { this.proto = v; return true; }
  getPortProtocolVersion() { return this.proto; }
  _send(id, ins, params) {
    // byte stuffing: FF FF FD inside the parameters gets an extra FD
    const stuffed = [];
    const head = [0xff, 0xff, 0xfd, 0x00, id & 255, 0, 0, ins];
    for (let i = 0; i < params.length; i++) {
      stuffed.push(params[i] & 255);
      const all = [...head, ...stuffed];
      const n = all.length;
      if (n >= 3 && all[n - 3] === 0xff && all[n - 2] === 0xff && all[n - 1] === 0xfd) stuffed.push(0xfd);
    }
    const len = stuffed.length + 3;
    head[5] = len & 255; head[6] = len >> 8;
    const pkt = [...head, ...stuffed];
    const crc = _dxlCrc(pkt);
    while (this.port.available() > 0) this.port.read();
    if (this.dir >= 0) digitalWrite(this.dir, HIGH);
    this.port.write([...pkt, crc & 255, crc >> 8]);
    this.port.flush();
    if (this.dir >= 0) digitalWrite(this.dir, LOW);
  }
  /** the status packet's parameters (after its error byte), or null */
  _status(id) {
    const buf = [];
    const until = millis() + this.timeout;
    for (;;) {
      while (this.port.available() > 0) buf.push(this.port.read());
      const s = buf.findIndex((b, i) => b === 0xff && buf[i + 1] === 0xff && buf[i + 2] === 0xfd && buf[i + 3] === 0x00 && buf[i + 4] === (id & 255));
      if (s >= 0 && buf.length >= s + 7) {
        const len = buf[s + 5] | (buf[s + 6] << 8);
        if (buf.length >= s + 7 + len) {
          const pkt = buf.slice(s, s + 7 + len);
          const crc = _dxlCrc(pkt.slice(0, -2));
          if ((crc & 255) !== pkt[pkt.length - 2] || (crc >> 8) !== pkt[pkt.length - 1]) return null;
          this.lastErr = pkt[8];
          const raw = pkt.slice(9, -2), out = [];
          for (let i = 0; i < raw.length; i++) {
            out.push(raw[i]);
            if (i >= 2 && raw[i - 2] === 0xff && raw[i - 1] === 0xff && raw[i] === 0xfd && raw[i + 1] === 0xfd) i++;
          }
          return this.lastErr & 0x7f ? null : out;
        }
      }
      if (millis() >= until) return null;
      delay(1);
    }
  }
  _write(id, addr, size, value) {
    const data = [];
    for (let i = 0; i < size; i++) data.push((value >> (8 * i)) & 255);
    this._send(id, 0x03, [addr & 255, addr >> 8, ...data]);
    return id === 0xfe ? true : this._status(id) !== null;
  }
  _read(id, addr, size) {
    this._send(id, 0x02, [addr & 255, addr >> 8, size & 255, size >> 8]);
    const r = this._status(id);
    if (!r || r.length < size) return null;
    let v = 0;
    for (let i = 0; i < size; i++) v |= r[i] << (8 * i);
    if (size === 4) v |= 0; else if (size === 2 && v & 0x8000) v -= 0x10000;
    return v;
  }
  ping(id) { this._send(id, 0x01, []); return this._status(id) !== null; }
  getModelNumber(id) { return this._read(id, 0, 2) ?? 0; }
  writeControlTableItem(item, id, value) { const [a, n] = _DXL_ITEMS[item] ?? [item, 1]; return this._write(id, a, n, Math.round(value)); }
  readControlTableItem(item, id) { const [a, n] = _DXL_ITEMS[item] ?? [item, 1]; return this._read(id, a, n) ?? 0; }
  torqueOn(id) { return this._write(id, 64, 1, 1); }
  torqueOff(id) { return this._write(id, 64, 1, 0); }
  getTorqueEnableStat(id) { return this._read(id, 64, 1) === 1; }
  ledOn(id) { return this._write(id, 65, 1, 1); }
  ledOff(id) { return this._write(id, 65, 1, 0); }
  /** the mode can only change with the torque off (as the real one: this turns it off first) */
  setOperatingMode(id, mode) { this.torqueOff(id); return this._write(id, 11, 1, mode); }
  setID(id, newId) { this.torqueOff(id); return this._write(id, 7, 1, newId); }
  setGoalPosition(id, value, unit = UNIT_RAW) {
    const raw = unit === UNIT_DEGREE ? value / 0.088 : unit === UNIT_PERCENT ? (value / 100) * 4095 : value;
    return this._write(id, 116, 4, Math.round(raw));
  }
  getPresentPosition(id, unit = UNIT_RAW) {
    const r = this._read(id, 132, 4);
    if (r === null) return 0;
    return unit === UNIT_DEGREE ? r * 0.088 : unit === UNIT_PERCENT ? (r / 4095) * 100 : r;
  }
  setGoalVelocity(id, value, unit = UNIT_RAW) {
    const raw = unit === UNIT_RPM ? value / 0.229 : unit === UNIT_PERCENT ? (value / 100) * 265 : value;
    return this._write(id, 104, 4, Math.round(raw));
  }
  getPresentVelocity(id, unit = UNIT_RAW) {
    const r = this._read(id, 128, 4);
    if (r === null) return 0;
    return unit === UNIT_RPM ? r * 0.229 : unit === UNIT_PERCENT ? (r / 265) * 100 : r;
  }
  getPresentCurrent(id) { const l = this._read(id, 126, 2); return l === null ? 0 : l * 2.69; }
  getLastLibErrCode() { return this.lastErr; }
}
