// Arduino's Stepper library: Stepper motor(stepsPerTurn, pin1, pin2[, pin3, pin4]); setSpeed(rpm);
// step(n) turns n steps (minus = back) and returns when done. The steps are timed as on a real
// board (several can fall within one simulation step; the motor sees every one).
class Stepper {
  constructor(steps, p1, p2, p3, p4) {
    this.steps = steps;
    this.pins = [p1, p2, p3, p4].filter((p) => p !== undefined);
    this.stepNumber = 0;
    this.stepDelay = 60 * 1000 * 1000 / steps / 1; // us between steps (setSpeed changes it)
    for (const p of this.pins) pinMode(p, OUTPUT);
  }
  setSpeed(rpm) {
    if (rpm > 0) this.stepDelay = 60 * 1000 * 1000 / this.steps / rpm;
  }
  step(n) {
    let left = Math.abs(n);
    const up = n > 0;
    let last = micros();
    while (left > 0) {
      const t = micros();
      if (t - last >= this.stepDelay) {
        last += this.stepDelay;
        if (t - last > this.stepDelay * 50) last = t; // (fell far behind: don't rush to catch up)
        if (up) this.stepNumber = (this.stepNumber + 1) % this.steps;
        else this.stepNumber = (this.stepNumber - 1 + this.steps) % this.steps;
        left--;
        this.stepMotor(this.stepNumber % 4);
      } else delayMicroseconds(Math.max(1, this.stepDelay - (t - last)));
    }
  }
  stepMotor(s) {
    const p = this.pins;
    if (p.length === 2) {
      const seq = [[0, 1], [1, 1], [1, 0], [0, 0]][s];
      digitalWrite(p[0], seq[0]);
      digitalWrite(p[1], seq[1]);
      return;
    }
    const seq = [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1]][s];
    for (let i = 0; i < 4; i++) digitalWrite(p[i], seq[i]);
  }
  version() { return 5; }
}
