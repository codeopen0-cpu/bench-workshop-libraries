// Infrared: the remote flashes a code (NEC: address, its inverse, command, its inverse) and every
// receiver that can see it turns the flashes into its signal pin. Here the remote puts its codes in
// the room (shared by the parts of this library) and each receiver sends them down its S wire.

const KEYS = { 'CH-': 0x45, CH: 0x46, 'CH+': 0x47, '|<<': 0x44, '>>|': 0x40, '>||': 0x43, '-': 0x07, '+': 0x15, EQ: 0x09, '0': 0x16, '100+': 0x19, '200+': 0x0d, '1': 0x0c, '2': 0x18, '3': 0x5e, '4': 0x08, '5': 0x1c, '6': 0x5a, '7': 0x42, '8': 0x52, '9': 0x4a };
const room = []; // [{ time, data }] codes in the air (a held key repeats: data [] = "still held")

bench.device('ir-remote', (part) => {
  const keys = part.control('keys');
  const screen = part.screen('keys');
  const order = ['CH-', 'CH', 'CH+', '|<<', '>>|', '>||', '-', '+', 'EQ', '0', '100+', '200+', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let held = null, nextRepeat = 0, sent = 0, last = '';
  return {
    step(io) {
      for (const k of keys.take()) {
        const cmd = KEYS[k];
        if (cmd === undefined) continue;
        room.push({ time: io.time, data: [0x00, 0xff, cmd, (~cmd) & 255] });
        held = k;
        last = `${k} (0x${cmd.toString(16).toUpperCase().padStart(2, '0')})`;
        nextRepeat = io.time + 0.108; // NEC: a repeat code every 108 ms while held
        sent++;
      }
      const down = keys.down;
      if (held && !down.includes(held)) held = null;
      if (held && io.time >= nextRepeat) {
        room.push({ time: io.time, data: [] });
        nextRepeat += 0.108;
      }
      while (room.length && room[0].time < io.time - 1) room.shift();
      order.forEach((k, i) => screen.set(i % 3, Math.floor(i / 3), down.includes(k) ? 1 : 0));
    },
    status() { return [sent ? `sent ${sent} codes, the last ${last}` : 'press its keys in the run panel']; },
  };
});

bench.device('ir-receiver', (part) => {
  let seen = -1, powered = false, got = 0;
  return {
    step(io) {
      const v = io.supply('+', '-');
      powered = v >= 2.7;
      if (!powered) { io.release('S'); return; }
      io.drive('S', v, 1); // its output rests high
      for (const c of room) {
        if (c.time <= seen) continue;
        io.send('S', 'ir', c.data);
        if (c.data.length) got++;
      }
      if (room.length) seen = room[room.length - 1].time;
      io.draw(0.0015);
    },
    status() { return [powered ? `${got} codes received` : 'no power (+ needs 3.3-5 V)']; },
  };
});
