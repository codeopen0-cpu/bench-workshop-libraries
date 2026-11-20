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

// PMW3901: an optical flow sensor. A tiny camera (35 x 35 pixels, 42 degrees) looks at the surface
// in front of its lens and counts how far the picture slides between readings: the sensor's own
// motion over the floor, in counts (about 500 a radian of view angle). The farther the floor, the
// fewer counts for the same move (counts = 500 x distance moved / height); tilting also slides the
// picture (a flight controller takes that off with its gyro). It needs the floor at least 8 cm away.
// SPI registers (Bitcraze_PMW3901 reads them as the real one): 0x00 product id 0x49, 0x5F its
// inverse 0xB6, 0x02 motion (reading it latches the counts into 0x03-0x06: delta X, delta Y, 16-bit
// low byte first), 0x07 surface quality, 0x3A = 0x5A resets it. The picture's x is the arrow on the
// board, y points away from the pins (the part's -z); the lens is on top (+y): mount it facing the floor.
bench.device('pmw3901', (part) => {
  const eye = part.ranger('eye');
  const regs = new Array(128).fill(0);
  const reset = () => { regs.fill(0); regs[0x00] = 0x49; regs[0x01] = 0x00; regs[0x5f] = 0xb6; };
  reset();
  let powered = false, accX = 0, accY = 0, last = null, quality = 0, reads = 0, height = null;
  // a direction in the part's frame, turned into the world (by its orientation q)
  const rot = ([x, y, z, w], [vx, vy, vz]) => {
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const s16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff;
  return {
    spi: {
      // pairs of bytes: [register (bit 7 set = write), value]; answers [0, value] for reads
      transfer(bytes) {
        const out = new Array(bytes.length).fill(0);
        if (!powered) return out.fill(0xff);
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          const a = bytes[i] & 0x7f;
          if (bytes[i] & 0x80) {
            regs[a] = bytes[i + 1] & 255;
            if (a === 0x3a && bytes[i + 1] === 0x5a) { reset(); accX = 0; accY = 0; }
            continue;
          }
          if (a === 0x02) {
            // reading "motion" takes the counts since the last time
            const x = s16(accX), y = s16(accY);
            regs[0x03] = x & 255; regs[0x04] = x >> 8; regs[0x05] = y & 255; regs[0x06] = y >> 8;
            regs[0x02] = (Math.round(accX) || Math.round(accY) ? 0x80 : 0) | 0x01;
            regs[0x07] = quality;
            accX -= Math.round(accX); accY -= Math.round(accY);
            reads++;
          }
          out[i + 1] = regs[a];
        }
        return out;
      },
    },
    step(io) {
      powered = io.supply('VCC', 'GND') >= 2.7;
      if (!powered) { io.draw(0); last = null; return; }
      io.draw(0.009);
      const m = part.motion();
      if (!m.ready) return;
      const d = eye.distance;
      const ex = rot(m.quat, [1, 0, 0]), ey = rot(m.quat, [0, 1, 0]), ez = rot(m.quat, [0, 0, 1]);
      const o = [m.pos[0] + ey[0] * 0.56, m.pos[1] + ey[1] * 0.56, m.pos[2] + ey[2] * 0.56]; // (the lens)
      height = d;
      const sees = d !== null && d >= 8;
      quality = sees ? Math.max(20, Math.min(160, Math.round(160 - d / 4))) : 0;
      if (sees && last) {
        // where the spot it saw last step is in its view now: that's how far the picture slid
        const rel = [last[0] - o[0], last[1] - o[1], last[2] - o[2]];
        const f = dot(rel, ey);
        if (f > 1) {
          accX -= 500 * Math.atan2(dot(rel, ex), f); // (the spot slides back as the sensor moves along +x)
          accY += 500 * Math.atan2(dot(rel, ez), f); // (its y is the part's -z)
        }
      }
      last = sees ? [o[0] + ey[0] * d, o[1] + ey[1] * d, o[2] + ey[2] * d] : null;
    },
    status() {
      if (!powered) return ['no power'];
      return [height === null ? 'sees no surface (nothing within 4 m)' : height < 8 ? `too close to the surface (${height.toFixed(1)} cm: it needs 8 cm)` : `surface ${height.toFixed(1)} cm away, quality ${quality}`, `${reads} readings`];
    },
  };
});
