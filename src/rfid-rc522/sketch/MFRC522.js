// MFRC522.h (miguelbalboa's library), the parts most sketches use:
//   MFRC522 rfid(SS_PIN, RST_PIN);  SPI.begin();  rfid.PCD_Init();  rfid.PCD_DumpVersionToSerial();
//   if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) { rfid.uid.uidByte[i], rfid.uid.size }
//   rfid.PICC_GetType(rfid.uid.sak), rfid.PICC_GetTypeName(type), rfid.PICC_HaltA(), rfid.PCD_StopCrypto1()
//   MFRC522::MIFARE_Key key;  key.keyByte[i] = 0xFF;
//   rfid.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, block, &key, &(rfid.uid)) == MFRC522::STATUS_OK
//   rfid.MIFARE_Read(block, buffer, &size) (size >= 18), rfid.MIFARE_Write(block, buffer, 16)
// It talks to the chip's registers over SPI as the real library does: one transfer per register access.
class MFRC522 {
  constructor(ss = 10, rst = 9) {
    this.ss = ss; this.rst = rst;
    this.uid = { size: 0, uidByte: new Array(10).fill(0), sak: 0 };
  }
  // ---- registers
  _x(bytes) {
    digitalWrite(this.ss, LOW);
    const r = SPI.transfer(bytes.slice());
    digitalWrite(this.ss, HIGH);
    return r;
  }
  PCD_WriteRegister(reg, v) {
    if (Array.isArray(v) || (v && typeof v === 'object')) { const n = arguments[2] ?? v.length; this._x([(reg << 1) & 0x7e, ...Array.from(v).slice(0, n)]); return; }
    this._x([(reg << 1) & 0x7e, v & 255]);
  }
  PCD_ReadRegister(reg, n) {
    if (n === undefined) return this._x([0x80 | ((reg << 1) & 0x7e), 0])[1];
    const a = 0x80 | ((reg << 1) & 0x7e);
    const r = this._x([...new Array(n).fill(a), 0]);
    return r.slice(1);
  }
  PCD_SetRegisterBitMask(reg, mask) { this.PCD_WriteRegister(reg, this.PCD_ReadRegister(reg) | mask); }
  PCD_ClearRegisterBitMask(reg, mask) { this.PCD_WriteRegister(reg, this.PCD_ReadRegister(reg) & ~mask & 255); }
  // ---- the chip
  PCD_Init(ss, rst) {
    if (ss !== undefined) this.ss = ss;
    if (rst !== undefined) this.rst = rst;
    pinMode(this.ss, OUTPUT);
    digitalWrite(this.ss, HIGH);
    if (this.rst >= 0 && this.rst !== 255) { pinMode(this.rst, OUTPUT); digitalWrite(this.rst, LOW); delay(1); digitalWrite(this.rst, HIGH); delay(50); }
    else this.PCD_Reset();
    this.PCD_WriteRegister(0x12, 0x00); // TxModeReg
    this.PCD_WriteRegister(0x13, 0x00); // RxModeReg
    this.PCD_WriteRegister(0x24, 0x26); // ModWidthReg
    this.PCD_WriteRegister(0x2a, 0x80); // TModeReg: timer starts on its own
    this.PCD_WriteRegister(0x2b, 0xa9); // TPrescaler
    this.PCD_WriteRegister(0x2c, 0x03); this.PCD_WriteRegister(0x2d, 0xe8); // 25 ms timeout
    this.PCD_WriteRegister(0x15, 0x40); // TxASKReg: 100 % ASK
    this.PCD_WriteRegister(0x11, 0x3d); // ModeReg: CRC preset 0x6363
    this.PCD_AntennaOn();
  }
  PCD_Reset() { this.PCD_WriteRegister(0x01, 0x0f); delay(50); }
  PCD_AntennaOn() { const v = this.PCD_ReadRegister(0x14); if ((v & 3) !== 3) this.PCD_WriteRegister(0x14, v | 3); }
  PCD_AntennaOff() { this.PCD_ClearRegisterBitMask(0x14, 0x03); }
  PCD_SetAntennaGain() {}
  PCD_GetAntennaGain() { return 0x40; }
  PCD_PerformSelfTest() { return this.PCD_ReadRegister(0x37) === 0x92 || this.PCD_ReadRegister(0x37) === 0x91; }
  PCD_DumpVersionToSerial() {
    const v = this.PCD_ReadRegister(0x37);
    Serial.print('Firmware Version: 0x');
    Serial.print(v, HEX);
    if (v === 0x92) Serial.println(' = v2.0');
    else if (v === 0x91) Serial.println(' = v1.0');
    else Serial.println(' = (unknown)');
    if (v === 0x00 || v === 0xff) Serial.println('WARNING: Communication failure, is the MFRC522 properly connected?');
  }
  PCD_CalculateCRC(data, len, result) {
    this.PCD_WriteRegister(0x01, 0x00); // Idle
    this.PCD_WriteRegister(0x05, 0x04); // clear CRCIRq
    this.PCD_WriteRegister(0x0a, 0x80); // flush
    this.PCD_WriteRegister(0x09, Array.from(data).slice(0, len));
    this.PCD_WriteRegister(0x01, 0x03); // CalcCRC
    for (let i = 0; i < 50; i++) {
      if (this.PCD_ReadRegister(0x05) & 0x04) {
        this.PCD_WriteRegister(0x01, 0x00);
        result[0] = this.PCD_ReadRegister(0x22);
        result[1] = this.PCD_ReadRegister(0x21);
        return MFRC522.STATUS_OK;
      }
    }
    return MFRC522.STATUS_TIMEOUT;
  }
  /** send bytes to the tag and get its answer (the real library's PCD_CommunicateWithPICC) */
  _talk(command, waitIRq, send, back, validBits = 0, checkCRC = false) {
    this.PCD_WriteRegister(0x01, 0x00);
    this.PCD_WriteRegister(0x04, 0x7f);
    this.PCD_WriteRegister(0x0a, 0x80);
    this.PCD_WriteRegister(0x09, send);
    this.PCD_WriteRegister(0x0d, validBits & 7);
    this.PCD_WriteRegister(0x01, command);
    if (command === 0x0c) this.PCD_SetRegisterBitMask(0x0d, 0x80);
    const until = millis() + 36;
    let n = 0;
    for (;;) {
      n = this.PCD_ReadRegister(0x04);
      if (n & waitIRq) break;
      if (n & 0x01) return { status: MFRC522.STATUS_TIMEOUT };
      if (millis() > until) return { status: MFRC522.STATUS_TIMEOUT };
    }
    const err = this.PCD_ReadRegister(0x06);
    if (err & 0x13) return { status: MFRC522.STATUS_ERROR };
    let data = [], bits = 0;
    if (back) {
      const len = this.PCD_ReadRegister(0x0a);
      if (len) data = this.PCD_ReadRegister(0x09, len);
      bits = this.PCD_ReadRegister(0x0c) & 7;
    }
    if (err & 0x08) return { status: MFRC522.STATUS_COLLISION };
    if (back && checkCRC) {
      if (data.length === 1 && bits === 4) return { status: MFRC522.STATUS_MIFARE_NACK };
      if (data.length < 2) return { status: MFRC522.STATUS_CRC_WRONG };
      const c = [0, 0];
      if (this.PCD_CalculateCRC(data, data.length - 2, c) !== MFRC522.STATUS_OK) return { status: MFRC522.STATUS_TIMEOUT };
      if (data[data.length - 2] !== c[0] || data[data.length - 1] !== c[1]) return { status: MFRC522.STATUS_CRC_WRONG };
    }
    return { status: MFRC522.STATUS_OK, data, bits };
  }
  // ---- tags
  PICC_RequestA(buffer, size) { return this._reqa(0x26, buffer); }
  PICC_WakeupA(buffer, size) { return this._reqa(0x52, buffer); }
  _reqa(cmd, buffer) {
    this.PCD_ClearRegisterBitMask(0x0e, 0x80);
    const r = this._talk(0x0c, 0x30, [cmd], true, 7);
    if (r.status !== MFRC522.STATUS_OK) return r.status;
    if (r.data.length !== 2 || r.bits !== 0) return MFRC522.STATUS_ERROR;
    if (buffer && typeof buffer === 'object' && !isRef(buffer)) { buffer[0] = r.data[0]; buffer[1] = r.data[1]; }
    return MFRC522.STATUS_OK;
  }
  PICC_IsNewCardPresent() {
    this.PCD_WriteRegister(0x12, 0x00); this.PCD_WriteRegister(0x13, 0x00); this.PCD_WriteRegister(0x24, 0x26);
    const s = this.PICC_RequestA([0, 0]);
    return s === MFRC522.STATUS_OK || s === MFRC522.STATUS_COLLISION;
  }
  PICC_Select(uid) {
    const u = uid ?? this.uid;
    let r = this._talk(0x0c, 0x30, [0x93, 0x20], true);
    if (r.status !== MFRC522.STATUS_OK) return r.status;
    if (r.data.length < 5 || (r.data[0] ^ r.data[1] ^ r.data[2] ^ r.data[3]) !== r.data[4]) return MFRC522.STATUS_ERROR;
    const id = r.data.slice(0, 4);
    const frame = [0x93, 0x70, ...id, r.data[4]];
    const c = [0, 0];
    this.PCD_CalculateCRC(frame, 7, c);
    r = this._talk(0x0c, 0x30, [...frame, c[0], c[1]], true, 0, true);
    if (r.status !== MFRC522.STATUS_OK) return r.status;
    u.size = 4;
    for (let i = 0; i < 4; i++) u.uidByte[i] = id[i];
    u.sak = r.data[0];
    return MFRC522.STATUS_OK;
  }
  PICC_ReadCardSerial() { return this.PICC_Select(this.uid) === MFRC522.STATUS_OK; }
  PICC_HaltA() {
    const c = [0, 0];
    this.PCD_CalculateCRC([0x50, 0x00], 2, c);
    const r = this._talk(0x0c, 0x30, [0x50, 0x00, c[0], c[1]], false);
    return r.status === MFRC522.STATUS_TIMEOUT ? MFRC522.STATUS_OK : MFRC522.STATUS_ERROR; // (silence means it halted)
  }
  PCD_Authenticate(cmd, block, key, uid) {
    const u = uid ?? this.uid;
    const k = key?.keyByte ?? [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    const r = this._talk(0x0e, 0x10, [cmd, block, ...Array.from(k).slice(0, 6), ...u.uidByte.slice(0, 4)], false);
    return r.status;
  }
  PCD_StopCrypto1() { this.PCD_ClearRegisterBitMask(0x08, 0x08); }
  /** 16 bytes (and 2 of CRC) into buffer; size: handed over, at least 18 */
  MIFARE_Read(block, buffer, size) {
    if (Number(size) < 18) return MFRC522.STATUS_NO_ROOM;
    const c = [0, 0];
    this.PCD_CalculateCRC([0x30, block], 2, c);
    const r = this._talk(0x0c, 0x30, [0x30, block, c[0], c[1]], true, 0, true);
    if (r.status !== MFRC522.STATUS_OK) return r.status;
    for (let i = 0; i < r.data.length && i < 18; i++) buffer[i] = r.data[i];
    setRef(size, r.data.length);
    return MFRC522.STATUS_OK;
  }
  MIFARE_Write(block, buffer, size = 16) {
    if (Number(size) < 16) return MFRC522.STATUS_INVALID;
    const c = [0, 0];
    this.PCD_CalculateCRC([0xa0, block], 2, c);
    let r = this._talk(0x0c, 0x30, [0xa0, block, c[0], c[1]], true);
    if (r.status !== MFRC522.STATUS_OK) return r.status;
    if (r.data[0] !== 0x0a) return MFRC522.STATUS_MIFARE_NACK;
    const data = Array.from(buffer).slice(0, 16).map((x) => Number(x) & 255);
    this.PCD_CalculateCRC(data, 16, c);
    r = this._talk(0x0c, 0x30, [...data, c[0], c[1]], true);
    if (r.status !== MFRC522.STATUS_OK) return r.status;
    return r.data[0] === 0x0a ? MFRC522.STATUS_OK : MFRC522.STATUS_MIFARE_NACK;
  }
  PICC_GetType(sak) {
    const s = sak & 0x7f;
    return s === 0x08 ? MFRC522.PICC_TYPE_MIFARE_1K : s === 0x18 ? MFRC522.PICC_TYPE_MIFARE_4K : s === 0x09 ? MFRC522.PICC_TYPE_MIFARE_MINI : s === 0x00 ? MFRC522.PICC_TYPE_MIFARE_UL : MFRC522.PICC_TYPE_UNKNOWN;
  }
  static PICC_GetTypeName(t) {
    return { 3: 'MIFARE Mini, 320 bytes', 4: 'MIFARE 1KB', 5: 'MIFARE 4KB', 6: 'MIFARE Ultralight or Ultralight C' }[t] ?? 'Unknown type';
  }
  PICC_GetTypeName(t) { return MFRC522.PICC_GetTypeName(t); }
  static GetStatusCodeName(s) {
    return { 0: 'Success.', 1: 'Error in communication.', 2: 'Collision detected.', 3: 'Timeout in communication.', 4: 'A buffer is not big enough.', 5: 'Internal error in the code. Should not happen.', 6: 'Invalid argument.', 7: 'The CRC_A does not match.', 255: 'A MIFARE PICC responded with NAK.' }[s] ?? 'Unknown error';
  }
  GetStatusCodeName(s) { return MFRC522.GetStatusCodeName(s); }
  PICC_DumpDetailsToSerial(uid) {
    const u = uid ?? this.uid;
    Serial.print('Card UID:');
    for (let i = 0; i < u.size; i++) { Serial.print(u.uidByte[i] < 0x10 ? ' 0' : ' '); Serial.print(u.uidByte[i], HEX); }
    Serial.println();
    Serial.print('PICC type: ');
    Serial.println(this.PICC_GetTypeName(this.PICC_GetType(u.sak)));
  }
  PICC_DumpToSerial(uid) { this.PICC_DumpDetailsToSerial(uid); this.PICC_HaltA(); }
}
MFRC522.STATUS_OK = 0; MFRC522.STATUS_ERROR = 1; MFRC522.STATUS_COLLISION = 2; MFRC522.STATUS_TIMEOUT = 3;
MFRC522.STATUS_NO_ROOM = 4; MFRC522.STATUS_INTERNAL_ERROR = 5; MFRC522.STATUS_INVALID = 6; MFRC522.STATUS_CRC_WRONG = 7; MFRC522.STATUS_MIFARE_NACK = 0xff;
MFRC522.PICC_CMD_MF_AUTH_KEY_A = 0x60; MFRC522.PICC_CMD_MF_AUTH_KEY_B = 0x61;
MFRC522.PICC_TYPE_UNKNOWN = 0; MFRC522.PICC_TYPE_MIFARE_MINI = 3; MFRC522.PICC_TYPE_MIFARE_1K = 4; MFRC522.PICC_TYPE_MIFARE_4K = 5; MFRC522.PICC_TYPE_MIFARE_UL = 6;
MFRC522.MIFARE_Key = class { constructor() { this.keyByte = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]; } };
MFRC522.Uid = class { constructor() { this.size = 0; this.uidByte = new Array(10).fill(0); this.sak = 0; } };
MFRC522.StatusCode = class {};
MFRC522.PICC_Type = class {};
