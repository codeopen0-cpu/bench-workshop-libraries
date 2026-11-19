// DFRobotDFPlayerMini.h, the parts most sketches use:
//   SoftwareSerial mySerial(10, 11);  DFRobotDFPlayerMini myDFPlayer;
//   mySerial.begin(9600);  if (!myDFPlayer.begin(mySerial)) { ... }
//   myDFPlayer.volume(20);  myDFPlayer.play(1);  next(); previous(); pause(); start(); stop(); loop(n);
//   if (myDFPlayer.available()) { myDFPlayer.readType(); myDFPlayer.read(); }
// It sends the player's real 10-byte frames: 7E FF 06 cmd 00 hi lo chk chk EF.
const DFPlayerCardInserted = 2, DFPlayerCardRemoved = 3, DFPlayerCardOnline = 4, DFPlayerPlayFinished = 5, DFPlayerError = 6, TimeOut = 0, WrongStack = 1;
const DFPLAYER_EQ_NORMAL = 0, DFPLAYER_EQ_POP = 1, DFPLAYER_EQ_ROCK = 2, DFPLAYER_EQ_JAZZ = 3, DFPLAYER_EQ_CLASSIC = 4, DFPLAYER_EQ_BASS = 5, DFPLAYER_DEVICE_SD = 2;
class DFRobotDFPlayerMini {
  constructor() { this.s = null; this.rx = []; this.type = -1; this.param = 0; }
  _send(cmd, param = 0) {
    if (!this.s) return;
    const b = [0xff, 0x06, cmd, 0x00, (param >> 8) & 255, param & 255];
    let sum = 0; for (const x of b) sum += x;
    const chk = (-sum) & 0xffff;
    for (const x of [0x7e, ...b, chk >> 8, chk & 255, 0xef]) this.s.write(x);
    delay(20); // (it needs a moment between commands)
  }
  _poll() {
    while (this.s && this.s.available()) this.rx.push(this.s.read());
    const i = this.rx.indexOf(0x7e);
    if (i < 0) { this.rx = []; return false; }
    if (i) this.rx = this.rx.slice(i);
    if (this.rx.length < 10) return false;
    const f = this.rx.slice(0, 10);
    this.rx = this.rx.slice(10);
    const cmd = f[3], param = (f[5] << 8) | f[6];
    this.type = cmd === 0x3d ? DFPlayerPlayFinished : cmd === 0x3f ? DFPlayerCardOnline : cmd === 0x40 ? DFPlayerError : cmd === 0x3a ? DFPlayerCardInserted : cmd === 0x3b ? DFPlayerCardRemoved : -1;
    this.param = param;
    this.last = { cmd, param };
    return true;
  }
  begin(stream, isACK = true, doReset = true) {
    this.s = isRef(stream) ? stream.value : stream;
    if (doReset) this._send(0x0c);
    // it answers when it has read its card (about a second): wait for that
    const t = millis();
    while (millis() - t < 2000) { if (this._poll() && this.last.cmd === 0x3f) return true; delay(10); }
    return false;
  }
  available() { return this._poll(); }
  readType() { return this.type; }
  read() { return this.param; }
  _ask(cmd) { this._send(cmd); const t = millis(); while (millis() - t < 300) { if (this._poll() && this.last.cmd === cmd) return this.param; delay(5); } return -1; }
  play(n = 1) { this._send(0x03, n); }
  playMp3Folder(n) { this._send(0x12, n); }
  playFolder(folder, n) { this._send(0x0f, ((folder & 255) << 8) | (n & 255)); }
  next() { this._send(0x01); } previous() { this._send(0x02); }
  volume(v) { this._send(0x06, Math.max(0, Math.min(30, v | 0))); }
  volumeUp() { this._send(0x04); } volumeDown() { this._send(0x05); }
  pause() { this._send(0x0e); } start() { this._send(0x0d); } stop() { this._send(0x16); }
  loop(n) { this._send(0x08, n); }
  EQ() {} outputDevice() {} setTimeOut() {} reset() { this._send(0x0c); }
  readVolume() { return this._ask(0x43); }
  readState() { return this._ask(0x42); }
  readCurrentFileNumber() { return this._ask(0x4c); }
  readFileCounts() { return this._ask(0x48); }
}
