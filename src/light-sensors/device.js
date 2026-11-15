// Light and colour sensors. part.light(id).lux is the light reaching an eye (the room's light, shaded
// by whatever is over it, plus lit LEDs and screens in view); the colour sensor looks with a camera.

// LDR module: the LDR (about 10k at 10 lux, falling as the light grows) over a 10k resistor; the
// comparator's DO goes HIGH when AO is above the pot's level (darker than the setting).
bench.device('ldr', (part) => {
  const eye = part.light('eye');
  const darkBelow = Number(part.params.threshold ?? 60);
  const rOf = (lux) => Math.min(1e6, 10000 * Math.pow(Math.max(lux, 0.01) / 10, -0.75));
  let powered = false, lux = 0, ao = 0, dark = false;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 2.5;
      lux = eye.lux;
      const r = rOf(lux);
      ao = (v * r) / (r + 10000);
      const ref = (v * rOf(darkBelow)) / (rOf(darkBelow) + 10000);
      dark = ao > ref;
      if (!powered) { io.release('AO'); io.release('DO'); io.draw(0); return; }
      io.drive('AO', ao, 1);
      io.drive('DO', dark ? v : 0, 1);
      io.draw(0.0012 + v / (r + 10000) + (dark ? 0 : 0.002)); // (its DO LED is lit when bright)
    },
    status() {
      if (!powered) return ['no power'];
      return [`${lux} lux: AO ${ao.toFixed(2)} V, DO ${dark ? 'HIGH (dark)' : 'LOW (bright)'}`];
    },
  };
});

// BH1750: commands 0x00 power down, 0x01 power on, 0x07 reset, 0x10/0x11 continuous high res,
// 0x13 continuous low res, 0x20/0x21/0x23 one shot. A read gives 2 bytes: lux * 1.2 (high res).
bench.device('bh1750', (part) => {
  const eye = part.light('eye');
  let powered = false, on = false, mode = 0, lux = 0, reads = 0, addr = 0x23, value = 0, readyAt = 0, now = 0;
  return {
    i2c: {
      address: () => (powered ? addr : -1),
      write(bytes) {
        for (const b of bytes) {
          if (b === 0x00) on = false;
          else if (b === 0x01) on = true;
          else if (b === 0x07) value = 0;
          else if ((b & 0xf0) === 0x10 || (b & 0xf0) === 0x20) { mode = b; on = true; readyAt = now + ((b & 3) === 3 ? 0.016 : 0.12); }
        }
        return true;
      },
      read(n) {
        reads++;
        if (on && now >= readyAt) {
          const low = (mode & 3) === 3;
          value = Math.min(65535, Math.round(low ? lux * 1.2 / 4 : lux * 1.2) * (low ? 4 : 1));
          if ((mode & 0xf0) === 0x20) on = false; // (one shot: sleeps after)
          if (on) readyAt = now + ((mode & 3) === 3 ? 0.016 : 0.12);
        }
        return [value >> 8, value & 255].slice(0, n);
      },
    },
    step(io) {
      now = io.time;
      powered = io.supply('VCC', 'GND') >= 2.4;
      addr = io.level('ADDR') === 1 ? 0x5c : 0x23;
      lux = eye.lux;
      io.draw(powered ? (on ? 0.00012 : 0.000001) : 0);
    },
    status() {
      if (!powered) return ['no power'];
      return [`${lux} lux reaching it${on ? '' : ' (powered down: lightMeter.begin())'}`, `I2C 0x${addr.toString(16)}, ${reads} reads`];
    },
  };
});

// TCS34725: registers with the command bit (0x80): 0x00 ENABLE (bit 0 power, bit 1 measure),
// 0x01 ATIME, 0x0F CONTROL (gain), 0x12 ID = 0x44, 0x13 STATUS (bit 0 valid), 0x14-0x1B C, R, G, B
// (16-bit, low byte first). Its eye is a little camera looking out of its face.
bench.device('tcs34725', (part) => {
  const eye = part.camera('eye');
  const regs = new Array(32).fill(0);
  regs[0x12] = 0x44;
  regs[0x01] = 0xff;
  let powered = false, ptr = 0, reads = 0, led = true, rgb = [0, 0, 0], seen = false;
  const GAINS = [1, 4, 16, 60];
  return {
    i2c: {
      address: () => (powered ? 0x29 : -1),
      write(bytes) {
        if (!bytes.length) return true;
        const cmd = bytes[0];
        ptr = cmd & 0x1f;
        for (let i = 1; i < bytes.length; i++) regs[(ptr + i - 1) & 31] = bytes[i];
        return true;
      },
      read(n) {
        reads++;
        const out = [];
        for (let i = 0; i < n; i++) out.push(regs[(ptr + i) & 31]);
        return out;
      },
    },
    step(io) {
      const v = io.supply('VIN', 'GND');
      powered = v >= 2.7;
      led = io.level('LED') !== 0;
      const measuring = powered && (regs[0x00] & 3) === 3;
      eye.want(measuring ? 10 : 0);
      const f = eye.frame;
      if (f) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < f.width * f.height; i++) { r += f.data[i * 4]; g += f.data[i * 4 + 1]; b += f.data[i * 4 + 2]; }
        const k = f.width * f.height * 255;
        rgb = [r / k, g / k, b / k];
        seen = true;
      }
      if (measuring) {
        const cycles = 256 - regs[0x01];
        const full = Math.min(65535, cycles * 1024);
        const gain = GAINS[regs[0x0f] & 3];
        // its LED lights what's in front of it; without it, only the room does (dimmer)
        const lit = led ? 0.5 : 0.18;
        const ch = rgb.map((x) => Math.min(65535, Math.round(Math.pow(x, 2.2) * full * gain * lit * 0.25)));
        const c = Math.min(65535, ch[0] + ch[1] + ch[2]);
        [c, ch[0], ch[1], ch[2]].forEach((val, i) => { regs[0x14 + i * 2] = val & 255; regs[0x15 + i * 2] = val >> 8; });
        regs[0x13] |= 1;
      }
      io.draw(powered ? ((regs[0x00] & 1 ? 0.0002 : 0.000003) + (led ? 0.004 : 0)) : 0);
    },
    status() {
      if (!powered) return ['no power'];
      if ((regs[0x00] & 3) !== 3) return ['asleep (tcs.begin() wakes it)'];
      if (!seen) return ['looking...'];
      return [`sees r ${Math.round(rgb[0] * 255)} g ${Math.round(rgb[1] * 255)} b ${Math.round(rgb[2] * 255)}${led ? ', LED on' : ''}`, `${reads} reads`];
    },
  };
});
