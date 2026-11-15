// Motion sensors: they read part.motion(), how the part they're on moves and turns (the app works it
// out from the physics). Axes as on the boards: x along the board, y away from the pins (the part's
// -z), z up (the part's +y).
const chip = (m) => ({ x: m.accel[0], y: -m.accel[2], z: m.accel[1] });
/** a world direction in the part's own frame (rotate by the inverse of its orientation) */
const rotInv = ([x, y, z, w], [vx, vy, vz]) => {
  // rotate by the conjugate (-x, -y, -z, w): v + 2w(u x v) + 2u x (u x v), u = (-x, -y, -z)
  const ux = -x, uy = -y, uz = -z;
  const tx = 2 * (uy * vz - uz * vy), ty = 2 * (uz * vx - ux * vz), tz = 2 * (ux * vy - uy * vx);
  return [vx + w * tx + (uy * tz - uz * ty), vy + w * ty + (uz * tx - ux * tz), vz + w * tz + (ux * ty - uy * tx)];
};

// Tilt switch: a ball in a tube. Upright (pins down) it rests on the contacts: DO LOW.
bench.device('tilt', (part) => {
  let powered = false, closed = true;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 2.5;
      const m = part.motion();
      // (closed while "up" is within ~45 degrees of the part's own up: up[1] = cos(tilt))
      closed = m.up[1] > 0.7;
      if (!powered) { io.release('DO'); io.draw(0); return; }
      io.drive('DO', closed ? 0 : v, 1);
      io.draw(closed ? 0.0005 : 0.0001);
    },
    status() {
      if (!powered) return ['no power'];
      return [closed ? 'upright: switch closed (DO LOW)' : 'tilted: switch open (DO HIGH)'];
    },
  };
});

// QMC5883L: registers 0x00-0x05 X, Y, Z (16-bit, low byte first), 0x06 status (bit 0: new data),
// 0x09 control (bits 0-1 mode: 01 = continuous; bits 4-5 range: 00 = 2 G, 12000 LSB/G),
// 0x0B set/reset period, 0x0D chip id 0xFF.
// The Earth's field on the bench: 0.2 gauss towards north (-z) and 0.45 gauss down.
bench.device('qmc5883l', (part) => {
  const regs = new Array(256).fill(0);
  regs[0x0d] = 0xff;
  let powered = false, ptr = 0, reads = 0, heading = 0;
  // the Earth's field (world: north -z, down -y) as the chip feels it: turned into the part's frame
  const field = (m) => {
    const [qx, qy, qz, qw] = m.quat;
    const v = rotInv([qx, qy, qz, qw], [0, -0.45, -0.2]);
    return { x: v[0], y: -v[2], z: v[1] }; // (chip axes: x, y away from the pins, z up)
  };
  return {
    i2c: {
      address: () => (powered ? 0x0d : -1),
      write(bytes) {
        if (!bytes.length) return true;
        ptr = bytes[0];
        for (let i = 1; i < bytes.length; i++) regs[(ptr + i - 1) & 255] = bytes[i];
        return true;
      },
      read(n) {
        reads++;
        const out = [];
        for (let i = 0; i < n; i++) out.push(regs[(ptr + i) & 255]);
        if (ptr <= 0x05 && ptr + n > 0x05) regs[0x06] &= ~1; // (reading the data clears "new data")
        return out;
      },
    },
    step(io) {
      powered = io.supply('VCC', 'GND') >= 2.2;
      if (!powered) { io.release('DRDY'); io.draw(0); return; }
      const m = part.motion();
      heading = m.heading;
      const continuous = (regs[0x09] & 3) === 1;
      if (continuous) {
        const lsb = (regs[0x09] & 0x30) ? 3000 : 12000;
        const b = field(m);
        const s16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x * lsb))) & 0xffff;
        [b.x, b.y, b.z].forEach((v, i) => { const w = s16(v); regs[i * 2] = w & 255; regs[i * 2 + 1] = w >> 8; });
        regs[0x06] |= 1;
      }
      io.drive('DRDY', regs[0x06] & 1 ? io.supply('VCC', 'GND') : 0, 1);
      io.draw(continuous ? 0.0026 : 0.00003);
    },
    status() {
      if (!powered) return ['no power'];
      if ((regs[0x09] & 3) !== 1) return ['standby (the program hasn\'t started it: compass.init())', `${reads} reads`];
      return [`facing ${Math.round(heading) % 360} deg (its arrow: 0 north, 90 east)`, `${reads} reads`];
    },
  };
});

// ADXL345: 0x00 device id 0xE5, 0x2D POWER_CTL (bit 3 measure), 0x31 DATA_FORMAT (bits 0-1 range,
// bit 3 full resolution), 0x32-0x37 X, Y, Z (16-bit, low byte first). Full resolution: 256 LSB/g.
bench.device('adxl345', (part) => {
  const regs = new Array(64).fill(0);
  regs[0x00] = 0xe5;
  regs[0x2c] = 0x0a;
  let powered = false, ptr = 0, reads = 0, g = { x: 0, y: 0, z: 1 };
  return {
    i2c: {
      address: () => (powered ? 0x53 : -1),
      write(bytes) {
        if (!bytes.length) return true;
        ptr = bytes[0] & 63;
        for (let i = 1; i < bytes.length; i++) regs[(ptr + i - 1) & 63] = bytes[i];
        return true;
      },
      read(n) {
        reads++;
        const out = [];
        for (let i = 0; i < n; i++) out.push(regs[(ptr + i) & 63]);
        return out;
      },
    },
    step(io) {
      powered = io.supply('VCC', 'GND') >= 2;
      if (!powered) { io.draw(0); return; }
      g = chip(part.motion());
      const measuring = regs[0x2d] & 0x08;
      const range = regs[0x31] & 3, full = regs[0x31] & 0x08;
      const lsb = full ? 256 : 256 / (1 << range);
      const lim = full ? 4096 * (1 << range) / 4 : 512;
      [g.x, g.y, g.z].forEach((v, i) => {
        const w = measuring ? Math.max(-lim, Math.min(lim - 1, Math.round(v * lsb))) & 0xffff : 0;
        regs[0x32 + i * 2] = w & 255;
        regs[0x33 + i * 2] = w >> 8;
      });
      io.draw(measuring ? 0.00014 : 0.0000001);
    },
    status() {
      if (!powered) return ['no power'];
      if (!(regs[0x2d] & 0x08)) return ['standby (POWER_CTL measure bit not set: accel.begin())'];
      return [`x ${g.x.toFixed(2)} g, y ${g.y.toFixed(2)} g, z ${g.z.toFixed(2)} g`, `${reads} reads`];
    },
  };
});
