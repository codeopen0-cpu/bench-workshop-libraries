// Bitcraze_PMW3901.h (Bitcraze's library for the PMW3901 optical flow sensor):
//   Bitcraze_PMW3901 flow(CS_PIN);  SPI.begin();  if (!flow.begin()) { ...not found... }
//   int16_t deltaX, deltaY;  flow.readMotionCount(&deltaX, &deltaY);   (counts since the last call)
//   flow.setLed(true)  (the Flow deck's LEDs: nothing to see here)
// It talks to the chip's registers over SPI as the real library does (one register a transfer).
class Bitcraze_PMW3901 {
  constructor(cs = 10) { this.cs = cs; }
  _x(bytes) {
    digitalWrite(this.cs, LOW);
    const r = SPI.transfer(bytes.slice());
    digitalWrite(this.cs, HIGH);
    return r;
  }
  registerWrite(reg, value) { this._x([(reg | 0x80) & 255, value & 255]); }
  registerRead(reg) { return this._x([reg & 0x7f, 0])[1]; }
  /** true if the chip answers with its id */
  begin() {
    pinMode(this.cs, OUTPUT);
    digitalWrite(this.cs, HIGH);
    SPI.begin();
    delay(1);
    this.registerWrite(0x3a, 0x5a); // power-up reset
    delay(5);
    const id = this.registerRead(0x00), inv = this.registerRead(0x5f);
    if (id !== 0x49 || inv !== 0xb6) return false;
    // (the real library reads the motion registers once and writes its long list of tuning
    //  registers here; the counts start from now)
    this.registerRead(0x02); this.registerRead(0x03); this.registerRead(0x04); this.registerRead(0x05); this.registerRead(0x06);
    delay(1);
    return true;
  }
  /** the counts since the last call into the two variables: readMotionCount(&deltaX, &deltaY) */
  readMotionCount(dx, dy) {
    this.registerRead(0x02);
    const x = this.registerRead(0x03) | (this.registerRead(0x04) << 8);
    const y = this.registerRead(0x05) | (this.registerRead(0x06) << 8);
    setRef(dx, x >= 32768 ? x - 65536 : x);
    setRef(dy, y >= 32768 ? y - 65536 : y);
  }
  /** surface quality (0: it sees nothing it can track) */
  readQuality() { return this.registerRead(0x07); }
  enableFrameBuffer() {}
  setLed() {}
}
