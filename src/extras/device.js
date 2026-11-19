// A servo gripper, a fingerprint sensor, the DFPlayer Mini and a 7-segment digit.

// ------------------------------------------------------------------------------------------ gripper
// Its servo's pulse sets how far the jaws close: 1000 us (0 deg) wide open, 1500 us (90) shut.
bench.device('gripper', (part) => {
  const L = part.motor('jawL'), R = part.motor('jawR');
  let v = 0, pulse = 0;
  return {
    step(io) {
      v = io.supply('V+', 'GND');
      const p = io.pwm('SIG');
      pulse = p && p.hz >= 30 && p.hz <= 400 ? (p.duty / p.hz) * 1e6 : 0;
      if (v < 4 || !pulse) { L.limp(); R.limp(); io.draw(v >= 4 ? 0.005 : 0); return; }
      const shut = Math.max(0, Math.min(1, (pulse - 1000) / 500)); // 0 open .. 1 shut
      const a = -40 + 45 * shut; // (jaw angle: -40 open, +5 pressing past shut)
      L.to(a, v);
      R.to(-a, v);
      io.draw(L.stalled || R.stalled ? 0.6 : Math.abs(L.speed) > 5 ? 0.25 : 0.01);
    },
    status: () => [v < 4 ? 'no power (4.8-6 V on V+)' : !pulse ? 'no signal (limp)' : `${Math.round(Math.max(0, Math.min(1, (pulse - 1000) / 500)) * 100)} % shut${L.stalled || R.stalled ? ', gripping something' : ''}`],
  };
});

// ------------------------------------------------------------------------------------------ fingerprint
// The R307 / AS608 protocol: packets EF 01, address FF FF FF FF, type, length, data, checksum.
bench.device('fingerprint', (part) => {
  const keys = part.control('finger');
  const NAMES = ["Alice's", "Bob's", "Carol's"];
  let powered = false, finger = -1, fingerUntil = -1, now = 0, image = -1;
  const buf = [-1, -1, -1]; // char buffers 1 and 2 (index 1, 2): whose finger they hold
  const lib = new Map(); // id -> whose finger
  let rx = [], out = [], log = '';
  const reply = (code, data = []) => {
    const len = data.length + 3;
    const body = [0x07, len >> 8, len & 255, code, ...data];
    let sum = 0;
    for (const b of body) sum += b;
    out.push([0xef, 0x01, 0xff, 0xff, 0xff, 0xff, ...body, (sum >> 8) & 255, sum & 255]);
  };
  const command = (ins, d) => {
    switch (ins) {
      case 0x13: reply(0x00); log = 'password checked'; break; // VfyPwd
      case 0x01: // GenImg: a picture of the finger on it, if there is one
        if (finger >= 0) { image = finger; reply(0x00); log = 'took a picture'; } else reply(0x02);
        break;
      case 0x02: // Img2Tz: the picture's features into buffer 1 or 2
        if (image < 0) reply(0x15); else { buf[d[0] === 2 ? 2 : 1] = image; reply(0x00); }
        break;
      case 0x05: // RegModel: buffers 1 and 2 the same finger?
        if (buf[1] >= 0 && buf[1] === buf[2]) reply(0x00); else reply(0x0a);
        break;
      case 0x06: { // Store: buffer -> an id
        const id = (d[1] << 8) | d[2];
        if (id >= 162) { reply(0x0b); break; }
        lib.set(id, buf[d[0] === 2 ? 2 : 1]); reply(0x00); log = `stored ${NAMES[buf[1]] ?? 'a'} finger as #${id}`;
        break;
      }
      case 0x1b: case 0x04: { // search the library for buffer's finger
        const who = buf[d[0] === 2 ? 2 : 1];
        const hit = [...lib.entries()].find(([, f]) => f === who && who >= 0);
        if (hit) { const score = 80 + Math.round(Math.random() * 120); reply(0x00, [hit[0] >> 8, hit[0] & 255, score >> 8, score & 255]); log = `found #${hit[0]}`; }
        else { reply(0x09); log = 'no match'; }
        break;
      }
      case 0x1d: reply(0x00, [lib.size >> 8, lib.size & 255]); break; // TemplateNum
      case 0x0d: lib.clear(); reply(0x00); log = 'library emptied'; break;
      case 0x0c: { const id = (d[0] << 8) | d[1], n = Math.max(1, (d[2] << 8) | d[3]); for (let i = 0; i < n; i++) lib.delete(id + i); reply(0x00); break; }
      case 0x0f: reply(0x00, [0, 0, 0, 0, 0, 162, 0, 3, 0xff, 0xff, 0xff, 0xff, 0, 2, 0, 6]); break; // ReadSysPara: capacity 162
      default: reply(0x00); // (LED control and the rest: fine)
    }
  };
  return {
    step(io) {
      now = io.time;
      powered = io.supply('VCC', 'GND') >= 3.0;
      for (const k of keys.take()) { const i = NAMES.indexOf(k); if (i >= 0) { finger = i; fingerUntil = now + 2; } }
      if (now > fingerUntil) finger = -1;
      for (const p of out) io.send('TX', 'uart', p, 57600);
      out = [];
      io.drive('TX', powered ? io.supply('VCC', 'GND') : 0, 1);
      io.draw(powered ? (finger >= 0 ? 0.065 : 0.03) : 0);
    },
    packets(list) {
      if (!powered) return;
      for (const p of list) {
        if (p.pin !== 'RX' || p.proto !== 'uart') continue;
        if (Math.abs(p.baud - 57600) > 600) { log = `heard ${p.baud} baud: it talks at 57600`; continue; }
        rx.push(...p.data);
        // whole packets: EF 01 + 4 address + type + 2 length + (length) bytes
        while (rx.length) {
          const s = rx.indexOf(0xef);
          if (s < 0) { rx = []; break; }
          if (s) rx = rx.slice(s);
          if (rx.length < 9) break;
          const len = (rx[7] << 8) | rx[8];
          if (rx.length < 9 + len) break;
          const pkt = rx.slice(0, 9 + len);
          rx = rx.slice(9 + len);
          if (pkt[1] !== 0x01 || pkt[6] !== 0x01) continue;
          command(pkt[9], pkt.slice(10, 9 + len - 2));
        }
      }
    },
    status: () => [powered ? (finger >= 0 ? `${NAMES[finger]} finger on it` : 'no finger') : 'no power', `${lib.size} fingers stored${log ? `; ${log}` : ''}`],
  };
});

// ------------------------------------------------------------------------------------------ DFPlayer Mini
// Frames: 7E FF 06 command feedback param-high param-low checksum-high checksum-low EF.
bench.device('dfplayer', (part) => {
  const snd = part.sound();
  const led = part.screen('led');
  let powered = false, since = 0, now = 0, ready = false, vol = 15, track = 0, playing = false, paused = false, started = 0, rx = [], out = [], loop = false, plays = 0;
  const TRACKS = 9;
  const frame = (cmd, param) => {
    const b = [0xff, 0x06, cmd, 0x00, (param >> 8) & 255, param & 255];
    let sum = 0;
    for (const x of b) sum += x;
    const chk = (-sum) & 0xffff;
    return [0x7e, ...b, chk >> 8, chk & 255, 0xef];
  };
  /** each track a tune of its own: notes from its number (about 6 seconds) */
  const note = (t, n) => {
    const scale = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659];
    let x = (n * 7919 + Math.floor(t * 4) * 104729) % 9973;
    return scale[x % scale.length] * (n % 2 ? 1 : 0.5);
  };
  const play = (n) => { track = Math.max(1, ((n - 1) % TRACKS) + 1); playing = true; paused = false; started = now; plays++; };
  const command = (cmd, param) => {
    if (cmd === 0x03 || cmd === 0x12 || cmd === 0x0f) play(cmd === 0x0f ? param & 255 : param);
    else if (cmd === 0x01) play(track + 1);
    else if (cmd === 0x02) play(track > 1 ? track - 1 : TRACKS);
    else if (cmd === 0x06) vol = Math.max(0, Math.min(30, param));
    else if (cmd === 0x04) vol = Math.min(30, vol + 1);
    else if (cmd === 0x05) vol = Math.max(0, vol - 1);
    else if (cmd === 0x0e) paused = true;
    else if (cmd === 0x0d) { if (track) { playing = true; paused = false; } }
    else if (cmd === 0x16) { playing = false; paused = false; }
    else if (cmd === 0x08) { loop = true; play(param); }
    else if (cmd === 0x0c) { ready = false; since = now - 0.5; playing = false; }
    else if (cmd === 0x48) out.push(frame(0x48, TRACKS)); // number of files
    else if (cmd === 0x43) out.push(frame(0x43, vol));
    else if (cmd === 0x42) out.push(frame(0x42, playing && !paused ? 1 : 0));
    else if (cmd === 0x4c) out.push(frame(0x4c, track));
  };
  return {
    step(io) {
      now = io.time;
      const was = powered;
      powered = io.supply('VCC', 'GND') >= 3.2;
      if (powered && !was) { since = now; ready = false; }
      if (!powered) { snd.stop(); led.set(0, 0, 0); io.release('BUSY'); return; }
      if (!ready && now - since > 0.8) { ready = true; out.push(frame(0x3f, 0x02)); } // (its SD card found)
      if (playing && !paused && now - started > 6) {
        out.push(frame(0x3d, track)); // (that track finished)
        if (loop) started = now; else playing = false;
      }
      for (const f of out) io.send('TX', 'uart', f, 9600);
      out = [];
      const sounding = playing && !paused && vol > 0;
      if (sounding) snd.tone(note(now - started, track), (vol / 30) * 0.6, 'square');
      else snd.stop();
      led.set(0, 0, sounding ? 1 : 0);
      io.drive('BUSY', sounding ? 0 : io.supply('VCC', 'GND'), 1);
      io.drive('TX', io.supply('VCC', 'GND'), 0);
      io.draw(0.02 + (sounding ? 0.1 * (vol / 30) : 0));
    },
    packets(list) {
      if (!powered) return;
      for (const p of list) {
        if (p.pin !== 'RX' || p.proto !== 'uart') continue;
        rx.push(...p.data);
        while (rx.length) {
          const s = rx.indexOf(0x7e);
          if (s < 0) { rx = []; break; }
          if (s) rx = rx.slice(s);
          if (rx.length < 10) break;
          const f = rx.slice(0, 10);
          rx = rx.slice(10);
          if (f[9] !== 0xef || !ready) continue;
          command(f[3], (f[5] << 8) | f[6]);
        }
      }
    },
    status: () => [!powered ? 'no power' : !ready ? 'starting (reading its SD card)...' : playing ? `${paused ? 'paused' : 'playing'} ${String(track).padStart(4, '0')}.mp3, volume ${vol}` : `stopped, volume ${vol}`, `${plays} plays`],
  };
});

// ------------------------------------------------------------------------------------------ 7-segment
bench.device('seg7', (part) => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
  const segs = Object.fromEntries(ids.map((id) => [id, part.screen(id)]));
  const anode = part.params.kind === 'anode';
  let lit = '';
  return {
    step(io) {
      const com = io.v('COM');
      lit = '';
      let n = 0;
      for (const id of ids) {
        const v = io.v(id);
        // a red LED lights from about 1.8 V across it, the right way round
        const on = com !== null && v !== null && (anode ? com - v : v - com) > 1.7;
        segs[id].set(0, 0, on ? 1 : 0);
        if (on) { lit += id; n++; }
      }
      io.draw(n * 0.012);
    },
    status: () => [lit ? `lit: ${lit}` : 'dark'],
  };
});
