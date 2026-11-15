// Buzzers. An active one has its own oscillator: DC on its + makes it beep at its own pitch. A
// passive one is just a little speaker: it sounds at whatever frequency its + is switched at
// (tone() is PWM at that frequency), and a steady level only clicks once.

bench.device('active-buzzer', (part) => {
  const snd = part.sound();
  let on = false, volts = 0;
  return {
    step(io) {
      volts = io.supply('+', '-');
      const p = io.pwm('+');
      // driven by tone(): its oscillator gets chopped, which sounds rough (as a real one does)
      const level = p ? p.duty : 1;
      on = volts > 2.5 && level > 0.05;
      if (on) snd.tone(2300, Math.min(1, (volts / 5) * (p ? 0.6 : 0.8)), p ? 'sawtooth' : 'square');
      else snd.stop();
      io.draw(on ? 0.025 : 0);
    },
    status() {
      return [on ? `beeping (${volts.toFixed(1)} V)` : volts > 0.5 ? `quiet (${volts.toFixed(1)} V is too little)` : 'quiet'];
    },
  };
});

bench.device('passive-buzzer', (part) => {
  const snd = part.sound();
  let hz = 0, volts = 0, clickUntil = -1, lastLevel = 0;
  return {
    step(io) {
      const p = io.pwm('+');
      volts = (io.v('+') ?? 0) - (io.v('-') ?? 0);
      const level = io.level('+') ?? 0;
      if (p && p.hz >= 20 && volts > 0.5) {
        hz = p.hz;
        snd.tone(hz, Math.min(1, volts / 5) * Math.min(1, p.duty * 2), 'square');
      } else {
        hz = 0;
        // a steady level only moves its disc once: a click
        if (level !== lastLevel) clickUntil = io.time + 0.01;
        if (io.time < clickUntil) snd.tone(180, 0.3, 'square');
        else snd.stop();
      }
      lastLevel = level;
      io.draw(hz ? 0.015 : 0);
    },
    status() {
      return [hz ? `playing ${Math.round(hz)} Hz` : 'quiet (it needs tone(pin, frequency))'];
    },
  };
});
