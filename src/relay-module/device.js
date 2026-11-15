// A relay module: IN drives a transistor that powers the relay's coil; the coil pulls the switch
// over (COM to NO) and a spring pulls it back (COM to NC). The two sides share no wires.
bench.device('relay', (part) => {
  const led = part.screen('led');
  const snd = part.sound();
  const activeLow = part.params.trigger !== 'high';
  let on = false, powered = false, clickUntil = -1, clicks = 0;
  return {
    step(io) {
      const vcc = io.supply('VCC', 'GND');
      powered = vcc >= 3.8;
      if (powered) io.drive('IN', vcc, 0); // (its pull-up resistor: weaker than any pin)
      else io.release('IN');
      const lvl = io.level('IN');
      // IN has a pull-up on the module: unwired means HIGH
      const asked = powered && (activeLow ? lvl === 0 : lvl === 1);
      if (asked !== on) {
        on = asked;
        clicks++;
        clickUntil = io.time + 0.012;
      }
      io.connect('COM', 'NO', on);
      io.connect('COM', 'NC', !on);
      if (io.time < clickUntil) snd.tone(on ? 140 : 110, 0.5, 'square');
      else snd.stop();
      led.set(0, 0, on ? 1 : 0);
      io.draw(on ? 0.07 : powered ? 0.002 : 0);
    },
    status() {
      if (!powered) return ['no power (VCC needs 5 V): stays off, COM joined to NC'];
      return [on ? 'on: COM joined to NO' : 'off: COM joined to NC', `${clicks} clicks`];
    },
  };
});
