// A TT gear motor (driven by the volts across M+ and M-) with a slotted disc on its shaft. The
// optical sensor's OUT is high while a slot lets its light through: 20 slots, 40 changes a turn.
bench.device('tt-encoder', (part) => {
  const shaft = part.motor('shaft');
  let volts = 0, encV = 0, out = 0, edges = 0;
  // average volts on a pin (PWM counts by its duty)
  const avg = (io, pin) => {
    const v = io.v(pin) ?? 0, p = io.pwm(pin);
    return p ? v * p.duty : v;
  };
  return {
    step(io) {
      volts = avg(io, 'M+') - avg(io, 'M-');
      if (Math.abs(volts) < 0.3) shaft.power(0, 6);
      else shaft.power(Math.sign(volts), Math.abs(volts));
      // the encoder
      encV = io.supply('VCC', 'GND');
      const slot = ((Math.floor(shaft.angle / 9) % 2) + 2) % 2;
      if (slot !== out) { out = slot; edges++; }
      if (encV >= 2.8) io.drive('OUT', out ? encV : 0, 1);
      else io.release('OUT');
      io.draw((encV >= 2.8 ? 0.01 : 0) + Math.min(1, Math.abs(volts) / 6) * 0.15 + (Math.abs(volts) > 0.3 && Math.abs(shaft.speed) < 10 ? 0.5 : 0));
    },
    status() {
      const rpm = Math.round(shaft.speed / 6);
      return [`${volts.toFixed(1)} V, ${rpm} rpm`, encV >= 2.8 ? `encoder ${edges} changes` : 'encoder: no power (VCC)'];
    },
  };
});
