// Keypad.h (Mark Stanley & Alexander Brevig's library), the usual parts: getKey(), getKeys(),
// waitForKey(), getState(), isPressed(), setDebounceTime(), setHoldTime(), addEventListener().
// It scans like the real one: one column driven low at a time, rows read with pull-ups.
const NO_KEY = 0; // (C's '\0': "if (key)" is false for it)
const IDLE = 0, PRESSED = 1, HOLD = 2, RELEASED = 3;
/** the keymap as one list (the C++ macro just hands over the array) */
function makeKeymap(k) { return Array.isArray(k[0]) ? k.flat() : k; }

class Keypad {
  constructor(map, rowPins, colPins, rows, cols) {
    this.map = makeKeymap(map);
    this.rowPins = Array.from(rowPins).slice(0, rows);
    this.colPins = Array.from(colPins).slice(0, cols);
    this.rows = rows;
    this.cols = cols;
    this.debounce = 10;
    this.holdTime = 500;
    this.lastScan = -1e9;
    this.state = IDLE;
    this.key = NO_KEY;
    this.pressedAt = 0;
    this.listener = null;
    this.down = new Set();
    this.keyStates = new Map(); // char -> state (for getKeys / isPressed)
    for (const r of this.rowPins) pinMode(r, INPUT_PULLUP);
    for (const c of this.colPins) pinMode(c, INPUT_PULLUP);
  }
  begin(map) { this.map = makeKeymap(map); }
  setDebounceTime(ms) { this.debounce = Math.max(1, ms); }
  setHoldTime(ms) { this.holdTime = ms; }
  addEventListener(fn) { this.listener = fn; }
  /** which keys are down now: drive each column low in turn, read the rows */
  scan() {
    const now = new Set();
    for (const r of this.rowPins) pinMode(r, INPUT_PULLUP);
    for (let c = 0; c < this.cols; c++) {
      const cp = this.colPins[c];
      pinMode(cp, OUTPUT);
      digitalWrite(cp, LOW);
      delay(5); // (the simulation needs a step to see the column go low: a real one needs microseconds)
      for (let r = 0; r < this.rows; r++) if (digitalRead(this.rowPins[r]) === LOW) now.add(this.map[r * this.cols + c]);
      digitalWrite(cp, HIGH);
      pinMode(cp, INPUT_PULLUP); // (resting: held high, not left floating)
    }
    return now;
  }
  /** the key just pressed, or NO_KEY */
  getKey() {
    if (millis() - this.lastScan < this.debounce) return NO_KEY;
    this.lastScan = millis();
    const now = this.scan();
    let pressed = NO_KEY;
    for (const k of now) if (!this.down.has(k)) { pressed = k; this.setState(k, PRESSED); }
    for (const k of this.down) if (!now.has(k)) this.setState(k, RELEASED);
    for (const k of now) if (this.down.has(k) && this.keyStates.get(k) === PRESSED && millis() - this.pressedAt > this.holdTime) this.setState(k, HOLD);
    if (pressed !== NO_KEY) this.pressedAt = millis();
    this.down = now;
    if (!now.size && this.state === RELEASED) this.state = IDLE;
    return pressed;
  }
  setState(k, s) {
    this.keyStates.set(k, s);
    this.key = k;
    this.state = s;
    if (s === RELEASED) this.keyStates.set(k, IDLE);
    if (this.listener) this.listener(k);
  }
  getKeys() { this.getKey(); return this.down.size > 0; }
  isPressed(k) { return this.down.has(k); }
  getState() { return this.state; }
  keyStateChanged() { return true; }
  waitForKey() {
    for (;;) {
      const k = this.getKey();
      if (k !== NO_KEY) return k;
      delay(1);
    }
  }
}
