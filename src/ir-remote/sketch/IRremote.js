// IRremote (Armin Joachimsmeyer & co), NEC codes, both ways sketches use it:
//   new: IrReceiver.begin(pin, ENABLE_LED_FEEDBACK); if (IrReceiver.decode()) { IrReceiver.decodedIRData.command;
//        IrReceiver.printIRResultShort(&Serial); IrReceiver.resume(); }
//   old: IRrecv irrecv(pin); decode_results results; irrecv.enableIRIn(); if (irrecv.decode(&results)) { results.value; irrecv.resume(); }
const ENABLE_LED_FEEDBACK = true, DISABLE_LED_FEEDBACK = false, USE_DEFAULT_FEEDBACK_LED_PIN = 0;
const IRDATA_FLAGS_IS_REPEAT = 0x01;
const UNKNOWN = 0, NEC = 8;
const hex = (n, w = 2) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
const rev8 = (b) => { let r = 0; for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i); return r; };

class IRReceiverClass {
  constructor() {
    this.pin = -1;
    this.queue = [];
    this.lastCode = null;
    this.decodedIRData = { protocol: UNKNOWN, address: 0, command: 0, flags: 0, decodedRawData: 0, numberOfBits: 0 };
  }
  begin(pin, feedback = false) {
    this.pin = pin;
    pinMode(pin, INPUT);
    if (feedback && typeof LED_BUILTIN === 'number') pinMode(LED_BUILTIN, OUTPUT);
    this.feedback = !!feedback && typeof LED_BUILTIN === 'number';
  }
  start() {}
  stop() {}
  enableIRIn() {}
  available() { this.pull(); return this.queue.length > 0; }
  pull() {
    if (this.pin < 0) return;
    for (const m of linkReceive(this.pin, 'ir')) this.queue.push(m.data);
    if (this.queue.length > 16) this.queue.splice(0, this.queue.length - 16);
  }
  /** a code arrived? its address and command are in decodedIRData */
  decode() {
    this.pull();
    if (!this.queue.length) return false;
    const d = this.queue.shift();
    if (this.feedback) { digitalWrite(LED_BUILTIN, HIGH); }
    if (!d.length) {
      // a repeat (the key is still held): the last code again, flagged
      if (!this.lastCode) return false;
      this.decodedIRData = { ...this.decodedIRData, flags: IRDATA_FLAGS_IS_REPEAT };
      return true;
    }
    const [addr, naddr, cmd] = d;
    const address = ((naddr ^ 0xff) === addr) ? addr : addr | (naddr << 8);
    this.lastCode = d;
    this.decodedIRData = {
      protocol: NEC, address, command: cmd, flags: 0, numberOfBits: 32,
      decodedRawData: ((d[3] << 24) | (d[2] << 16) | (d[1] << 8) | d[0]) >>> 0,
    };
    return true;
  }
  resume() { if (this.feedback) digitalWrite(LED_BUILTIN, LOW); }
  printIRResultShort(out) {
    const d = this.decodedIRData;
    out.println(`Protocol=${d.protocol === NEC ? 'NEC' : 'UNKNOWN'} Address=${hex(d.address)} Command=${hex(d.command)}${d.flags & IRDATA_FLAGS_IS_REPEAT ? ' Repeat' : ` Raw-Data=${hex(d.decodedRawData, 8)} 32 bits LSB first`}`);
  }
  printIRSendUsage() {}
}
const IrReceiver = new IRReceiverClass();

/** the old way: results.value is the 32 bits MSB first (0xFFA25D for CH-), 0xFFFFFFFF for a repeat */
class decode_results {
  constructor() { this.value = 0; this.bits = 0; this.decode_type = UNKNOWN; this.address = 0; this.command = 0; }
}
class IRrecv {
  constructor(pin) { this.r = new IRReceiverClass(); this.pin = pin; }
  enableIRIn() { this.r.begin(this.pin); }
  begin(pin = this.pin) { this.r.begin(pin); }
  decode(results) {
    if (!this.r.decode()) return false;
    const d = this.r.decodedIRData;
    if (results) {
      results.decode_type = NEC;
      results.bits = 32;
      results.address = d.address;
      results.command = d.command;
      if (d.flags & IRDATA_FLAGS_IS_REPEAT) results.value = 0xffffffff;
      else {
        const raw = d.decodedRawData;
        results.value = ((rev8(raw & 255) << 24) | (rev8((raw >> 8) & 255) << 16) | (rev8((raw >> 16) & 255) << 8) | rev8((raw >>> 24) & 255)) >>> 0;
      }
    }
    return true;
  }
  resume() { this.r.resume(); }
}
