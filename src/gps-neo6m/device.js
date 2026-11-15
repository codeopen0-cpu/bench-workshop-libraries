// NEO-6M: once a second, $GPRMC and $GPGGA (and $GPVTG) on TX at 9600 baud, from where the part is
// on the bench (x east, -z north, cm; the bench's origin at the latitude and longitude set).
// Without a fix (the first seconds) the sentences say so.
const nmea = (body) => {
  let x = 0;
  for (const ch of body) x ^= ch.charCodeAt(0);
  return `$${body}*${x.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
};
const dm = (deg, isLat) => {
  const a = Math.abs(deg), d = Math.floor(a), m = (a - d) * 60;
  return `${String(d).padStart(isLat ? 2 : 3, '0')}${m.toFixed(5).padStart(8, '0')},${isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W'}`;
};
const two = (n) => String(n).padStart(2, '0');

bench.device('neo6m', (part) => {
  const lat0 = Number(part.params.lat ?? 51.5007), lon0 = Number(part.params.lon ?? -0.1246), alt0 = Number(part.params.alt ?? 12);
  const fixAfter = Number(part.params.fix ?? 4);
  const t0 = Date.now(); // (its clock: UTC from this PC, moving with the simulation)
  let powered = false, since = -1, next = 0, fix = false, lat = lat0, lon = lon0, alt = alt0, knots = 0, course = 0, sent = 0;
  return {
    step(io) {
      const v = io.supply('VCC', 'GND');
      const on = v >= 2.7;
      if (on && !powered) { since = io.time; next = io.time + 1; }
      powered = on;
      if (!powered) { io.release('TX'); io.draw(0); fix = false; return; }
      io.drive('TX', v, 1); // (a serial line rests high)
      const m = part.motion();
      fix = io.time - since >= fixAfter;
      const north = -m.pos[2] / 100, east = m.pos[0] / 100; // m
      lat = lat0 + north / 111320;
      lon = lon0 + east / (111320 * Math.cos((lat0 * Math.PI) / 180));
      alt = alt0 + m.pos[1] / 100;
      const vh = Math.hypot(m.vel[0], m.vel[2]) / 100; // m/s
      knots = vh * 1.943844;
      if (vh > 0.05) course = ((Math.atan2(m.vel[0], -m.vel[2]) * 180) / Math.PI + 360) % 360;
      io.draw(fix ? 0.045 : 0.05);
      if (io.time < next) return;
      next += 1;
      const d = new Date(t0 + io.time * 1000);
      const hms = `${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}.00`;
      const date = `${two(d.getUTCDate())}${two(d.getUTCMonth() + 1)}${two(d.getUTCFullYear() % 100)}`;
      const L = fix ? dm(lat, true) : ',', G = fix ? dm(lon, false) : ',';
      let text = '';
      text += nmea(`GPRMC,${hms},${fix ? 'A' : 'V'},${L},${G},${fix ? knots.toFixed(3) : ''},${fix ? course.toFixed(2) : ''},${date},,,${fix ? 'A' : 'N'}`);
      text += nmea(`GPVTG,${fix ? course.toFixed(2) : ''},T,,M,${fix ? knots.toFixed(3) : ''},N,${fix ? (knots * 1.852).toFixed(3) : ''},K,${fix ? 'A' : 'N'}`);
      text += nmea(`GPGGA,${hms},${L},${G},${fix ? 1 : 0},${fix ? '08' : '00'},${fix ? '0.92' : '99.99'},${fix ? alt.toFixed(1) : ''},M,${fix ? '47.0' : ''},M,,`);
      io.send('TX', 'uart', Array.from(text, (ch) => ch.charCodeAt(0)), 9600);
      sent++;
    },
    status() {
      if (!powered) return ['no power'];
      if (!fix) return [`searching for satellites... (about ${Math.max(1, Math.ceil(fixAfter - sent))} s)`];
      return [`fix: ${lat.toFixed(6)}, ${lon.toFixed(6)}, ${alt.toFixed(1)} m, ${(knots * 1.852).toFixed(1)} km/h`, `${sent} reports sent`];
    },
  };
});
