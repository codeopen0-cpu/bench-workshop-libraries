// Adafruit_Fingerprint.h, the parts most sketches use:
//   SoftwareSerial mySerial(2, 3);  Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);
//   finger.begin(57600);  if (finger.verifyPassword()) ...
//   enrol: getImage() == FINGERPRINT_OK; image2Tz(1); (lift, place again) getImage(); image2Tz(2); createModel(); storeModel(id);
//   find:  getImage(); image2Tz(); fingerFastSearch() == FINGERPRINT_OK -> finger.fingerID, finger.confidence
//   getTemplateCount() -> finger.templateCount;  emptyDatabase();  deleteModel(id);  LEDcontrol(...)
// It speaks the sensor's real packets (EF 01, address, type, length, data, checksum).
const FINGERPRINT_OK = 0x00, FINGERPRINT_PACKETRECIEVEERR = 0x01, FINGERPRINT_NOFINGER = 0x02, FINGERPRINT_IMAGEFAIL = 0x03, FINGERPRINT_IMAGEMESS = 0x06;
const FINGERPRINT_FEATUREFAIL = 0x07, FINGERPRINT_NOMATCH = 0x08, FINGERPRINT_NOTFOUND = 0x09, FINGERPRINT_ENROLLMISMATCH = 0x0a, FINGERPRINT_BADLOCATION = 0x0b;
const FINGERPRINT_DBREADFAIL = 0x0c, FINGERPRINT_FLASHERR = 0x18, FINGERPRINT_INVALIDIMAGE = 0x15, FINGERPRINT_TIMEOUT = 0xff, FINGERPRINT_BADPACKET = 0xfe;
const FINGERPRINT_LED_BREATHING = 1, FINGERPRINT_LED_FLASHING = 2, FINGERPRINT_LED_ON = 3, FINGERPRINT_LED_OFF = 4, FINGERPRINT_LED_RED = 1, FINGERPRINT_LED_BLUE = 2, FINGERPRINT_LED_PURPLE = 3;
class Adafruit_Fingerprint {
  constructor(serial) { this.s = isRef(serial) ? serial.value : serial; this.fingerID = 0; this.confidence = 0; this.templateCount = 0; this.capacity = 162; this.status_reg = 0; this.system_id = 0; this.security_level = 3; this.device_addr = 0xffffffff; this.packet_len = 128; this.baud_rate = 57600; }
  begin(baud = 57600) { delay(100); this.s.begin(baud); }
  _cmd(data) {
    const len = data.length + 2;
    const body = [0x01, len >> 8, len & 255, ...data];
    let sum = 0; for (const b of body) sum += b;
    while (this.s.available()) this.s.read(); // (anything stale)
    for (const b of [0xef, 0x01, 0xff, 0xff, 0xff, 0xff, ...body, (sum >> 8) & 255, sum & 255]) this.s.write(b);
    // its answer: EF 01, address, type 07, length, code, data, checksum
    const got = [];
    const t = millis();
    while (millis() - t < 1000) {
      while (this.s.available()) got.push(this.s.read());
      const i = got.indexOf(0xef);
      if (i >= 0 && got.length - i >= 9) {
        const n = (got[i + 7] << 8) | got[i + 8];
        if (got.length - i >= 9 + n) return got.slice(i + 9, i + 9 + n - 2);
      }
      delay(2);
    }
    return null;
  }
  _code(data) { const r = this._cmd(data); return r ? r[0] : FINGERPRINT_TIMEOUT; }
  verifyPassword() { return this._code([0x13, 0, 0, 0, 0]) === FINGERPRINT_OK; }
  getImage() { return this._code([0x01]); }
  image2Tz(slot = 1) { return this._code([0x02, slot]); }
  createModel() { return this._code([0x05]); }
  storeModel(id, slot = 1) { return this._code([0x06, slot, (id >> 8) & 255, id & 255]); }
  loadModel(id) { return this._code([0x07, 1, (id >> 8) & 255, id & 255]); }
  deleteModel(id) { return this._code([0x0c, (id >> 8) & 255, id & 255, 0, 1]); }
  emptyDatabase() { return this._code([0x0d]); }
  _search(ins, slot) {
    const r = this._cmd([ins, slot, 0, 0, 0, 0xa3]);
    if (!r) return FINGERPRINT_TIMEOUT;
    if (r[0] === FINGERPRINT_OK) { this.fingerID = (r[1] << 8) | r[2]; this.confidence = (r[3] << 8) | r[4]; }
    return r[0];
  }
  fingerFastSearch() { return this._search(0x1b, 1); }
  fingerSearch(slot = 1) { return this._search(0x04, slot); }
  getTemplateCount() { const r = this._cmd([0x1d]); if (r && r[0] === 0) this.templateCount = (r[1] << 8) | r[2]; return r ? r[0] : FINGERPRINT_TIMEOUT; }
  getParameters() { const r = this._cmd([0x0f]); if (r && r[0] === 0) this.capacity = (r[5] << 8) | r[6]; return r ? r[0] : FINGERPRINT_TIMEOUT; }
  LEDcontrol() { return this._code([0x35, 0, 0, 0, 0]); }
  setPassword() { return FINGERPRINT_OK; }
}
