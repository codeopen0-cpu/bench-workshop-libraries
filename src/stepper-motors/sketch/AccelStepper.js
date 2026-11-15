// AccelStepper (the popular library by Mike McCauley), the parts most sketches use: moveTo / move,
// run() in loop() (speeds up and slows down), runSpeed() with setSpeed(), runToPosition(),
// currentPosition(), distanceToGo(), stop(). Interfaces: DRIVER (STEP + DIR pins, an A4988),
// FULL4WIRE and HALF4WIRE (4 pins, a ULN2003), FULL2WIRE.
class AccelStepper {
  constructor(iface = 4, p1 = 2, p2 = 3, p3 = 4, p4 = 5, enable = true) {
    this.iface = iface;
    this.pins = [p1, p2, p3, p4];
    this._pos = 0;
    this._target = 0;
    this._speed = 0; // steps/s, with direction
    this._maxSpeed = 1;
    this._accel = 1;
    this._interval = 0; // us between steps; 0 = stopped
    this._last = 0;
    this._minPulse = 1;
    this._enablePin = 255;
    this._inv = [false, false, false];
    if (enable) this.enableOutputs();
  }
  pinCount() {
    return this.iface === 1 ? 2 : this.iface === 2 ? 2 : this.iface === 3 ? 3 : 4;
  }
  enableOutputs() {
    const n = this.pinCount();
    for (let i = 0; i < n; i++) pinMode(this.pins[i], OUTPUT);
    if (this._enablePin !== 255) {
      pinMode(this._enablePin, OUTPUT);
      digitalWrite(this._enablePin, this._inv[2] ? LOW : HIGH);
    }
  }
  disableOutputs() {
    if (this.iface !== 1) for (let i = 0; i < this.pinCount(); i++) digitalWrite(this.pins[i], LOW);
    if (this._enablePin !== 255) digitalWrite(this._enablePin, this._inv[2] ? HIGH : LOW);
  }
  setEnablePin(p = 255) {
    this._enablePin = p;
    if (p !== 255) {
      pinMode(p, OUTPUT);
      digitalWrite(p, this._inv[2] ? LOW : HIGH);
    }
  }
  setPinsInverted(dir = false, step = false, en = false) { this._inv = [dir, step, en]; }
  setMinPulseWidth(us) { this._minPulse = us; }

  moveTo(abs) {
    if (this._target !== abs) {
      this._target = abs;
      this.computeNewSpeed();
    }
  }
  move(rel) { this.moveTo(this._pos + rel); }
  distanceToGo() { return this._target - this._pos; }
  targetPosition() { return this._target; }
  currentPosition() { return this._pos; }
  setCurrentPosition(p) {
    this._target = this._pos = p;
    this._speed = 0;
    this._interval = 0;
  }
  setMaxSpeed(s) {
    this._maxSpeed = Math.abs(s);
    this.computeNewSpeed();
  }
  maxSpeed() { return this._maxSpeed; }
  setAcceleration(a) {
    if (a !== 0) this._accel = Math.abs(a);
    this.computeNewSpeed();
  }
  acceleration() { return this._accel; }
  /** constant speed for runSpeed() (steps/s; minus = backwards) */
  setSpeed(s) {
    s = Math.max(-this._maxSpeed, Math.min(this._maxSpeed, s));
    this._speed = s;
    this._interval = s === 0 ? 0 : Math.abs(1e6 / s);
  }
  speed() { return this._speed; }
  isRunning() { return !(this._speed === 0 && this._target === this._pos); }

  /** one step if it's time for one; true if it stepped. (Steps due earlier in this simulation step
   *  all happen, so fast motors keep their speed.) */
  runSpeed() {
    if (!this._interval) return false;
    const t = micros();
    if (t - this._last < this._interval) return false;
    this._last += this._interval;
    if (t - this._last > this._interval * 50) this._last = t;
    this._pos += this._speed > 0 ? 1 : -1;
    this.step(this._pos);
    return true;
  }
  /** call as often as you can: steps toward the target, speeding up and slowing down */
  run() {
    if (this.runSpeed()) this.computeNewSpeed();
    return this._speed !== 0 || this.distanceToGo() !== 0;
  }
  runSpeedToPosition() {
    if (this._target === this._pos) return false;
    if (this._target > this._pos) this._speed = Math.abs(this._speed);
    else this._speed = -Math.abs(this._speed);
    return this.runSpeed();
  }
  /** blocks until it gets there */
  runToPosition() {
    while (this.run()) if (micros() - this._last < this._interval) delayMicroseconds(1);
  }
  runToNewPosition(p) {
    this.moveTo(p);
    this.runToPosition();
  }
  /** slow down to a stop as soon as it can */
  stop() {
    if (this._speed !== 0) {
      const toStop = Math.ceil((this._speed * this._speed) / (2 * this._accel));
      this.move(this._speed > 0 ? toStop : -toStop);
    }
  }

  computeNewSpeed() {
    const d = this.distanceToGo();
    const toStop = (this._speed * this._speed) / (2 * this._accel);
    // its slowest: the speed of the very first step (as AccelStepper times it)
    const v0 = Math.min(this._maxSpeed, 1 / (0.676 * Math.sqrt(2 / this._accel)));
    if (d === 0 && (toStop <= 1 || Math.abs(this._speed) <= v0 * 1.05)) {
      this._speed = 0;
      this._interval = 0;
      return;
    }
    const want = d > 0 ? 1 : d < 0 ? -1 : -Math.sign(this._speed);
    let v = this._speed;
    if (v === 0) {
      v = want * v0;
      this._last = micros();
    } else {
      const dt = this._interval / 1e6;
      if (Math.sign(v) !== want || toStop >= Math.abs(d)) v -= Math.sign(v) * this._accel * dt; // slow down
      else v += Math.sign(v) * this._accel * dt; // speed up
      if (Math.abs(v) > this._maxSpeed) v = Math.sign(v) * this._maxSpeed;
      if (Math.abs(v) < v0) v = want * v0; // (at its slowest it can turn round at once)
    }
    this._speed = v;
    this._interval = v === 0 ? 0 : Math.abs(1e6 / v);
  }

  step(pos) {
    const p = this.pins;
    if (this.iface === 1) { // DRIVER: DIR, then a pulse on STEP
      digitalWrite(p[1], (this._speed > 0) !== this._inv[0] ? HIGH : LOW);
      digitalWrite(p[0], this._inv[1] ? LOW : HIGH);
      digitalWrite(p[0], this._inv[1] ? HIGH : LOW);
      return;
    }
    if (this.iface === 2) {
      const s = [[0, 1], [1, 1], [1, 0], [0, 0]][pos & 3];
      digitalWrite(p[0], s[0]);
      digitalWrite(p[1], s[1]);
      return;
    }
    if (this.iface === 8) { // HALF4WIRE
      const s = [[1, 0, 0, 0], [1, 0, 1, 0], [0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 1], [0, 0, 0, 1], [1, 0, 0, 1]][pos & 7];
      for (let i = 0; i < 4; i++) digitalWrite(p[i], s[i]);
      return;
    }
    const s = [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1]][pos & 3]; // FULL4WIRE
    for (let i = 0; i < 4; i++) digitalWrite(p[i], s[i]);
  }
}
AccelStepper.FUNCTION = 0;
AccelStepper.DRIVER = 1;
AccelStepper.FULL2WIRE = 2;
AccelStepper.FULL3WIRE = 3;
AccelStepper.HALF3WIRE = 6;
AccelStepper.FULL4WIRE = 4;
AccelStepper.HALF4WIRE = 8;
