// DS3231: registers 0x00 seconds, 0x01 minutes, 0x02 hours (24 h), 0x03 day of week (1-7),
// 0x04 date, 0x05 month (bit 7: century), 0x06 year (00-99), all in BCD; 0x0E control (bits 3-4 square
// wave rate, bit 2 INTCN), 0x0F status (bit 7: the clock stopped: lost power), 0x11-0x12 temperature
// (whole degrees, then quarters in the top two bits).
const bcd = (n) => ((Math.floor(n / 10) << 4) | (n % 10)) & 255;
const unbcd = (b) => (b >> 4) * 10 + (b & 15);

bench.device('ds3231', (part) => {
  const temp = part.control('temp');
  const cell = part.params.cell !== false;
  // the time it keeps: seconds since 1970 (as local time) at simulation time `at`
  let base = Math.floor(Date.now() / 1000) - new Date().getTimezoneOffset() * 60 + Number(part.params.offset ?? 0) * 60;
  let at = 0, now = 0;
  const regs = new Array(19).fill(0);
  regs[0x0e] = 0x1c;
  regs[0x0f] = cell ? 0x00 : 0x80; // (no cell: it "lost power" and has to be set)
  let powered = false, ptr = 0, reads = 0, sets = 0, setTo = null;
  const secondsNow = () => base + Math.floor(now - at);
  const fill = () => {
    const d = new Date(secondsNow() * 1000);
    regs[0] = bcd(d.getUTCSeconds()); regs[1] = bcd(d.getUTCMinutes()); regs[2] = bcd(d.getUTCHours());
    regs[3] = d.getUTCDay() + 1; regs[4] = bcd(d.getUTCDate()); regs[5] = bcd(d.getUTCMonth() + 1) | (d.getUTCFullYear() >= 2100 ? 0x80 : 0);
    regs[6] = bcd(d.getUTCFullYear() % 100);
    const t = Math.round(temp.value * 4);
    regs[0x11] = (Math.floor(t / 4)) & 255; regs[0x12] = (t & 3) << 6;
  };
  return {
    i2c: {
      address: () => (powered ? 0x68 : -1),
      write(bytes) {
        if (!bytes.length) return true;
        ptr = bytes[0] % 19;
        let timeSet = false;
        for (let i = 1; i < bytes.length; i++) {
          const r = (ptr + i - 1) % 19;
          regs[r] = bytes[i];
          if (r <= 6) timeSet = true;
          // (writing the status with bit 7 clear clears "lost power")
        }
        if (timeSet) {
          // the program set the time: from now on it counts from what was written
          const y = 2000 + unbcd(regs[6]) + (regs[5] & 0x80 ? 100 : 0);
          base = Date.UTC(y, unbcd(regs[5] & 0x1f) - 1, unbcd(regs[4]), unbcd(regs[2] & 0x3f), unbcd(regs[1]), unbcd(regs[0] & 0x7f)) / 1000;
          at = now;
          regs[0x0f] &= 0x7f;
          sets++;
          setTo = new Date(base * 1000).toISOString().replace('T', ' ').slice(0, 19);
        }
        return true;
      },
      read(n) {
        reads++;
        fill();
        const out = [];
        for (let i = 0; i < n; i++) out.push(regs[(ptr + i) % 19]);
        ptr = (ptr + n) % 19;
        return out;
      },
    },
    step(io) {
      now = io.time;
      const v = io.supply('VCC', 'GND');
      powered = v >= 2.3;
      // (on its coin cell it keeps time even unpowered; without one it stops, and says so)
      if (!powered && !cell) { base = secondsNow(); at = now; regs[0x0f] |= 0x80; }
      if (!powered) { io.release('SQW'); io.draw(0); return; }
      const sqwOn = !(regs[0x0e] & 0x04);
      if (sqwOn) io.drive('SQW', (now % 1) < 0.5 ? v : 0, 1);
      else io.drive('SQW', v, 0); // (INTCN: open drain, idle high through its pull-up)
      io.draw(0.0002);
    },
    status() {
      if (!powered) return [cell ? 'no power (keeping time on its coin cell)' : 'no power'];
      const d = new Date(secondsNow() * 1000).toISOString().replace('T', ' ').slice(0, 19);
      return [`${d}${regs[0x0f] & 0x80 ? ' (lost power: not set)' : ''}, ${temp.value} C`, `${reads} reads${sets ? `, set to ${setTo}` : ''}`];
    },
  };
});
