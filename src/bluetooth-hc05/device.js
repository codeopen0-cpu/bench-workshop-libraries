// HC-05: a serial port on one side, Bluetooth (here: the phone in the run panel) on the other.
bench.device('hc05', (part) => {
  const connected = part.control('connected');
  const phone = part.control('phone');
  const led = part.screen('led');
  const baud = Number(part.params.baud ?? 9600);
  let powered = false, got = '', sent = 0, garbled = 0, rxVolts = 0, blink = 0;
  return {
    packets(list) {
      for (const p of list) {
        if (p.pin !== 'RXD' || p.proto !== 'uart' || !powered) continue;
        if (!connected.on) continue; // (nobody to send it to)
        if (p.baud && Math.abs(p.baud - baud) > baud * 0.03) {
          // the board talks at another speed: what the phone gets is garbage
          garbled += p.data.length;
          got += p.data.map(() => '?').join('');
        } else got += String.fromCharCode(...p.data);
        if (got.length > 400) got = got.slice(-400);
      }
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 3.4;
      rxVolts = io.v('RXD') ?? 0;
      if (!powered) {
        for (const p of ['TXD', 'STATE']) io.release(p);
        led.set(0, 0, 0);
        io.draw(0);
        return;
      }
      io.drive('TXD', 3.3, 1); // a serial line rests high
      io.drive('STATE', connected.on ? 3.3 : 0, 1);
      for (const line of phone.take()) {
        if (!connected.on) continue;
        const bytes = Array.from(line + '\n', (ch) => ch.charCodeAt(0) & 255);
        io.send('TXD', 'uart', bytes, baud);
        sent += bytes.length;
        part.log(`phone sent "${line}"`);
      }
      // its LED: fast blinking while waiting for a phone, two short blinks every 2 s when paired
      blink = io.time % (connected.on ? 2 : 0.25);
      led.set(0, 0, connected.on ? (blink < 0.1 || (blink > 0.25 && blink < 0.35) ? 1 : 0) : blink < 0.125 ? 1 : 0);
      io.draw(connected.on ? 0.035 : 0.04);
    },
    status() {
      if (!powered) return ['no power (VCC 3.6-6 V)'];
      const lines = got.split(/\r?\n/).filter(Boolean);
      return [
        connected.on ? `phone connected, ${baud} baud` : 'waiting for a phone',
        `the phone got: ${lines.slice(-3).join(' | ') || '(nothing yet)'}`,
        ...(garbled ? [`${garbled} bytes arrived garbled: the board isn't at ${baud} baud`] : []),
        ...(rxVolts > 3.8 ? [`RXD gets ${rxVolts.toFixed(1)} V: it takes 3.3 V (use a divider from a 5 V board)`] : []),
      ];
    },
  };
});
