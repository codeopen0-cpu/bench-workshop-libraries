// Sensors that look at the bench: a camera for the line sensor's reflection and the PIR's view,
// a distance beam for the obstacle and laser sensors.

/** how light a picture is: 0 (black) .. 1 (white), on average */
function lightness(frame) {
  let sum = 0;
  const n = frame.width * frame.height;
  for (let i = 0; i < n; i++) sum += 0.299 * frame.data[i * 4] + 0.587 * frame.data[i * 4 + 1] + 0.114 * frame.data[i * 4 + 2];
  return sum / n / 255;
}

// TCRT5000: an IR LED shining down and a phototransistor seeing how much comes back. Light floors
// reflect a lot (DO low, the module's LED lit), dark lines little (DO high).
bench.device('tcrt5000', (part) => {
  const eye = part.camera('eye');
  const threshold = Number(part.params.threshold ?? 70) / 100;
  let dark = 0, powered = false, isDark = false, seen = false;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 3;
      eye.want(powered ? 60 : 0); // (a real one answers in microseconds: as often as the app allows)
      const f = eye.frame;
      if (f) { dark = 1 - lightness(f); seen = true; }
      if (!powered) { io.release('DO'); io.release('AO'); io.draw(0); return; }
      isDark = dark > threshold;
      io.drive('DO', isDark ? v : 0, 1);
      io.drive('AO', v * Math.max(0, Math.min(1, dark)), 1);
      io.draw(0.02);
    },
    status() {
      if (!powered) return ['no power'];
      if (!seen) return ['looking...'];
      return [`${isDark ? 'dark (DO high)' : 'light (DO low)'}, ${Math.round(dark * 100)} % dark`];
    },
  };
});

// FC-51: OUT low while something reflects its IR back from within its range.
bench.device('fc51', (part) => {
  const beam = part.ranger('beam');
  const range = Number(part.params.range ?? 10);
  let powered = false, near = false;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 3;
      if (!powered) { io.release('OUT'); io.draw(0); return; }
      const d = beam.distance;
      near = d !== null && d <= range;
      io.drive('OUT', near ? 0 : v, 1);
      io.draw(0.025);
    },
    status() {
      if (!powered) return ['no power'];
      const d = beam.distance;
      return [`${near ? 'something there (OUT low)' : 'clear (OUT high)'}${d !== null ? `, nearest ${d.toFixed(1)} cm` : ''}`];
    },
  };
});

// VL53L0X: a laser and a timer: how long its light takes to come back. On I2C at 0x29. The
// registers a driver uses for a reading: 0xC0 model id (0xEE), 0x00 start, 0x13 interrupt status
// (bit 0-2: a reading is ready), 0x0B clear interrupt, 0x14 range status, 0x1E-0x1F range (mm).
bench.device('vl53l0x', (part) => {
  const beam = part.ranger('beam');
  let powered = false, reg = 0, mm = 8190, readings = 0, addr = 0x29;
  return {
    i2c: {
      address: () => (powered ? addr : -1),
      write(bytes) {
        if (!bytes.length) return true;
        reg = bytes[0];
        if (bytes.length > 1) {
          if (reg === 0x8a) addr = bytes[1] & 0x7f; // (I2C_SLAVE_DEVICE_ADDRESS: the address can be changed)
        }
        return true;
      },
      read(n) {
        const r = new Array(256).fill(0);
        r[0xc0] = 0xee; r[0xc1] = 0xaa; r[0xc2] = 0x10;
        r[0x13] = 0x04; // a reading is ready
        r[0x14] = mm >= 8190 ? 0x00 : 0x58;
        r[0x1e] = (mm >> 8) & 255; r[0x1f] = mm & 255;
        if (reg === 0x1e) readings++;
        const out = [];
        for (let i = 0; i < n; i++) out.push(r[(reg + i) & 255]);
        return out;
      },
    },
    step(io) {
      powered = io.supply('VIN', 'GND') >= 2.6;
      const d = beam.distance; // cm
      mm = d === null || d > 200 ? 8190 : Math.max(30, Math.round(d * 10));
      io.draw(powered ? 0.019 : 0);
    },
    status() {
      if (!powered) return ['no power'];
      return [`${mm >= 8190 ? 'nothing in range' : `${mm} mm`}, I2C 0x${addr.toString(16)}, ${readings} readings`];
    },
  };
});

// HC-SR501: it sees changes in the infrared in front of it (warm things moving). Here: changes in
// what its camera sees. OUT stays high for the hold time after the last movement.
bench.device('pir', (part) => {
  const eye = part.camera('eye');
  const hold = Number(part.params.hold ?? 3);
  let prev = null, powered = false, since = 0, until = -1, high = false, triggers = 0, lastTime = -1;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      if (v >= 4.5 && !powered) since = io.time;
      powered = v >= 4.5;
      eye.want(powered ? 8 : 0);
      if (!powered) { io.release('OUT'); prev = null; high = false; io.draw(0); return; }
      const f = eye.frame;
      if (f && f.time !== lastTime) {
        lastTime = f.time;
        if (prev && io.time - since > 2) {
          // how many of its pixels changed noticeably since the last picture
          let changed = 0;
          for (let i = 0; i < f.data.length; i += 4) {
            const d = Math.abs(f.data[i] - prev[i]) + Math.abs(f.data[i + 1] - prev[i + 1]) + Math.abs(f.data[i + 2] - prev[i + 2]);
            if (d > 40) changed++;
          }
          if (changed >= 2) {
            if (!high) triggers++;
            until = io.time + hold;
          }
        }
        prev = f.data.slice();
      }
      high = io.time < until;
      io.drive('OUT', high ? 3.3 : 0, 1);
      io.draw(0.00006);
    },
    status() {
      if (!powered) return ['no power (VCC 5-12 V)'];
      return [high ? 'movement! (OUT high)' : 'all still (OUT low)', `${triggers} times`];
    },
  };
});
