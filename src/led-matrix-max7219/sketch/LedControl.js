// LedControl for sketches: the same functions as the Arduino library (Eberhard Fahle's LedControl),
// talking to MAX7219s over three pins the same way (shiftOut, MSB first, LOAD/CS framing).
// Runs inside the program's thread: it sees pinMode, digitalWrite, shiftOut... like a sketch does.
const OP_NOOP = 0, OP_DECODEMODE = 9, OP_INTENSITY = 10, OP_SCANLIMIT = 11, OP_SHUTDOWN = 12, OP_DISPLAYTEST = 15;
const CHAR_TABLE = {
  '0': 0x7e, '1': 0x30, '2': 0x6d, '3': 0x79, '4': 0x33, '5': 0x5b, '6': 0x5f, '7': 0x70, '8': 0x7f, '9': 0x7b,
  a: 0x77, b: 0x1f, c: 0x0d, d: 0x3d, e: 0x4f, f: 0x47, h: 0x37, l: 0x0e, p: 0x67, '-': 0x01, '_': 0x08, ' ': 0x00,
};

class LedControl {
  constructor(dataPin, clkPin, csPin, numDevices = 1) {
    this.mosi = dataPin;
    this.clk = clkPin;
    this.cs = csPin;
    this.max = Math.max(1, Math.min(8, numDevices));
    this.status = new Array(64).fill(0);
    pinMode(this.mosi, OUTPUT);
    pinMode(this.clk, OUTPUT);
    pinMode(this.cs, OUTPUT);
    digitalWrite(this.cs, HIGH);
    for (let i = 0; i < this.max; i++) {
      this.spiTransfer(i, OP_DISPLAYTEST, 0);
      this.setScanLimit(i, 7);
      this.spiTransfer(i, OP_DECODEMODE, 0);
      this.clearDisplay(i);
      this.shutdown(i, true); // starts switched off, like the real chip
    }
  }
  getDeviceCount() { return this.max; }
  shutdown(addr, b) { if (this.ok(addr)) this.spiTransfer(addr, OP_SHUTDOWN, b ? 0 : 1); }
  setScanLimit(addr, limit) { if (this.ok(addr) && limit >= 0 && limit < 8) this.spiTransfer(addr, OP_SCANLIMIT, limit); }
  setIntensity(addr, intensity) { if (this.ok(addr) && intensity >= 0 && intensity < 16) this.spiTransfer(addr, OP_INTENSITY, intensity); }
  clearDisplay(addr) {
    if (!this.ok(addr)) return;
    for (let i = 0; i < 8; i++) {
      this.status[addr * 8 + i] = 0;
      this.spiTransfer(addr, i + 1, 0);
    }
  }
  setLed(addr, row, column, state) {
    if (!this.ok(addr) || row < 0 || row > 7 || column < 0 || column > 7) return;
    const val = 0x80 >> column;
    const i = addr * 8 + row;
    this.status[i] = state ? this.status[i] | val : this.status[i] & ~val;
    this.spiTransfer(addr, row + 1, this.status[i]);
  }
  setRow(addr, row, value) {
    if (!this.ok(addr) || row < 0 || row > 7) return;
    this.status[addr * 8 + row] = value & 0xff;
    this.spiTransfer(addr, row + 1, value & 0xff);
  }
  setColumn(addr, col, value) {
    if (!this.ok(addr) || col < 0 || col > 7) return;
    for (let row = 0; row < 8; row++) this.setLed(addr, row, col, (value >> (7 - row)) & 1);
  }
  setDigit(addr, digit, value, dp) {
    if (!this.ok(addr) || digit < 0 || digit > 7 || value > 15) return;
    let v = CHAR_TABLE[value.toString(16)] ?? 0;
    if (dp) v |= 0x80;
    this.status[addr * 8 + digit] = v;
    this.spiTransfer(addr, digit + 1, v);
  }
  setChar(addr, digit, value, dp) {
    if (!this.ok(addr) || digit < 0 || digit > 7) return;
    let v = CHAR_TABLE[String(typeof value === 'number' ? String.fromCharCode(value) : value).toLowerCase()] ?? 0;
    if (dp) v |= 0x80;
    this.status[addr * 8 + digit] = v;
    this.spiTransfer(addr, digit + 1, v);
  }
  ok(addr) { return addr >= 0 && addr < this.max; }
  spiTransfer(addr, opcode, data) {
    // one 16-bit word per chip in the chain; the chip at `addr` gets this one, the others a no-op
    const words = new Array(this.max * 2).fill(0);
    words[addr * 2 + 1] = opcode;
    words[addr * 2] = data;
    digitalWrite(this.cs, LOW);
    for (let i = this.max * 2; i > 0; i--) shiftOut(this.mosi, this.clk, MSBFIRST, words[i - 1]);
    digitalWrite(this.cs, HIGH);
  }
}
void OP_NOOP;
