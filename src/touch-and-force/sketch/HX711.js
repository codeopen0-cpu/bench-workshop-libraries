// HX711.h (bogde's library): HX711 scale;  scale.begin(DT_PIN, SCK_PIN);  scale.tare();
//   scale.set_scale(420);  scale.get_units(5) (grams, with that scale);  scale.read() (raw 24 bits).
// Here the 24 clock pulses go as one message on SCK and the answer comes back on DT (a real HX711
// is clocked bit by bit; the simulation passes the bits together).
class HX711 {
  constructor() { this.dt = -1; this.sck = -1; this.gain = 128; this.OFFSET = 0; this.SCALE = 1; }
  begin(dout, sck, gain = 128) {
    this.dt = dout; this.sck = sck;
    pinMode(dout, INPUT);
    pinMode(sck, OUTPUT);
    digitalWrite(sck, LOW);
    this.set_gain(gain);
  }
  set_gain(g = 128) { this.gain = g === 64 ? 64 : g === 32 ? 32 : 128; }
  is_ready() { return digitalRead(this.dt) === LOW; }
  wait_ready(ms = 0) { while (!this.is_ready()) delay(ms || 1); }
  wait_ready_timeout(timeout = 1000, ms = 1) {
    const until = millis() + timeout;
    while (millis() < until) { if (this.is_ready()) return true; delay(ms); }
    return false;
  }
  /** one raw reading (a signed 24-bit number); 0 if the HX711 doesn't answer */
  read() {
    if (!this.wait_ready_timeout(1000)) return 0;
    linkReceive(this.dt, 'data'); // (anything old)
    linkSend(this.sck, 'data', [this.gain === 64 ? 27 : this.gain === 32 ? 26 : 25]);
    const until = millis() + 50;
    while (millis() < until) {
      const got = linkReceive(this.dt, 'data');
      if (got.length) {
        const d = got[got.length - 1].data;
        let v = (d[0] << 16) | (d[1] << 8) | d[2];
        if (v & 0x800000) v -= 0x1000000;
        return v;
      }
      delay(1);
    }
    return 0;
  }
  read_average(times = 10) {
    let sum = 0;
    for (let i = 0; i < times; i++) sum += this.read();
    return sum / Math.max(1, times);
  }
  get_value(times = 1) { return this.read_average(times) - this.OFFSET; }
  get_units(times = 1) { return this.get_value(times) / this.SCALE; }
  tare(times = 10) { this.OFFSET = this.read_average(times); }
  set_scale(s = 1) { this.SCALE = s || 1; }
  get_scale() { return this.SCALE; }
  set_offset(o = 0) { this.OFFSET = o; }
  get_offset() { return this.OFFSET; }
  power_down() { linkSend(this.sck, 'data', [64]); }
  power_up() { linkSend(this.sck, 'data', [0]); }
}
