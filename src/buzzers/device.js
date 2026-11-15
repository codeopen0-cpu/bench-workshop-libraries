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

// Sound sensor (KY-038): a microphone and an amplifier. It hears what parts on the bench play
// (part.hear(): 0..1 loudness, closer is louder). AO sits at VCC/2 in quiet and swings with the sound
// (here: its average swing, rising with loudness); DO is HIGH while louder than the pot's setting.
bench.device('sound-sensor', (part) => {
  const ear = part.hear();
  const threshold = Number(part.params.threshold ?? 20) / 100;
  let powered = false, level = 0, loud = false, hz = 0, peaks = 0;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 2.5;
      level = ear.level;
      hz = ear.hz;
      const now = level > threshold;
      if (now && !loud) peaks++;
      loud = now;
      if (!powered) { io.release('AO'); io.release('DO'); io.draw(0); return; }
      io.drive('AO', v * Math.min(1, 0.5 + level * 0.5), 1);
      io.drive('DO', loud ? v : 0, 1);
      io.draw(0.004 + (loud ? 0.002 : 0));
    },
    status() {
      if (!powered) return ['no power'];
      return [level > 0.002 ? `hears ${Math.round(level * 100)} %${hz ? ` (${hz} Hz)` : ''}${loud ? ': DO HIGH' : ''}` : 'quiet', `${peaks} loud moments`];
    },
  };
});
