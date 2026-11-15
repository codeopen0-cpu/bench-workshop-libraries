// Servos beyond 180 degrees. The PWM ones read the pulse width on SIG (io.pwm: duty / frequency);
// the smart ones speak their real serial protocols on DATA.

/** the pulse on a servo's signal wire, in microseconds (0: none) */
const pulseOf = (io) => {
  const p = io.pwm('SIG');
  if (!p || p.hz < 30 || p.hz > 400) return 0;
  const us = (p.duty / p.hz) * 1e6;
  return us >= 400 && us <= 2700 ? us : 0;
};
const supplied = (io) => io.supply('V+', 'GND');

// A continuous-rotation servo: the position sensor is gone, so the pulse sets SPEED: 1500 us (write(90))
// stops it, 1000 / 2000 us are full speed each way. Real ones stop a little off 1500 (the trim).
bench.device('cr-servo', (part) => {
  const horn = part.motor('horn');
  const trim = Number(part.params.trim ?? 0);
  let us = 0, v = 0, power = 0;
  return {
    step(io) {
      v = supplied(io);
      us = pulseOf(io);
      if (v < 3.5 || !us) { horn.power(0, 0); power = 0; io.draw(v >= 3.5 ? 0.006 : 0); return; }
      const off = us - 1500 - trim;
      power = Math.abs(off) < 25 ? 0 : Math.max(-1, Math.min(1, -off / 500)); // (25 us dead band)
      horn.power(power, v);
      io.draw(power ? 0.12 + 0.5 * Math.abs(power) * (horn.stalled ? 2 : 0.4) : 0.008);
    },
    status() {
      if (v < 3.5) return ['no power'];
      if (!us) return ['no signal: stopped'];
      return [`pulse ${Math.round(us)} us: ${power ? `${Math.round(Math.abs(power) * 100)} % ${power > 0 ? 'anticlockwise' : 'clockwise'}` : 'stopped'}`, `${Math.round(horn.speed / 6)} rpm`];
    },
  };
});

// A positional servo with more travel: 500-2500 us spread over its whole range (270 or 360 deg).
bench.device('pwm-servo', (part) => {
  const horn = part.motor('horn');
  const half = Number(part.params.range ?? 270) / 2;
  let us = 0, v = 0, want = 0;
  return {
    step(io) {
      v = supplied(io);
      us = pulseOf(io);
      if (v < 3.5 || !us) { horn.limp(); io.draw(v >= 3.5 ? 0.006 : 0); return; }
      want = Math.max(-half, Math.min(half, ((us - 1500) / 1000) * half));
      horn.to(want, v);
      io.draw(Math.abs(horn.speed) > 5 || horn.stalled ? (horn.stalled ? 2.5 : 0.5) : 0.015);
    },
    status() {
      if (v < 3.5) return ['no power'];
      if (!us) return ['no signal (limp)'];
      return [`pulse ${Math.round(us)} us: to ${Math.round(want)} deg, at ${Math.round(horn.angle)} deg${horn.stalled ? ' (stalled)' : ''}`];
    },
  };
});

// A sail winch servo: 600-2400 us over three and a half turns (-630 .. +630 deg), held there.
bench.device('winch-servo', (part) => {
  const horn = part.motor('horn');
  let us = 0, v = 0, want = 0;
  return {
    step(io) {
      v = supplied(io);
      us = pulseOf(io);
      if (v < 3.5 || !us) { horn.limp(); io.draw(v >= 3.5 ? 0.006 : 0); return; }
      want = Math.max(-630, Math.min(630, ((us - 1500) / 900) * 630));
      horn.to(want, v);
      io.draw(Math.abs(horn.speed) > 5 || horn.stalled ? (horn.stalled ? 2.2 : 0.6) : 0.02);
    },
    status() {
      if (v < 3.5) return ['no power'];
      if (!us) return ['no signal (limp)'];
      return [`pulse ${Math.round(us)} us: to ${Math.round(want)} deg (${(want / 360).toFixed(2)} turns), at ${Math.round(horn.angle)} deg${horn.stalled ? ' (stalled)' : ''}`];
    },
  };
});

// ---------------------------------------------------------------------------------- smart servos
// Both keep a goal and move there at their speed; their horn is a multi-turn joint (any angle).
// Position 2048 is the middle (where the horn starts): 4096 counts a turn.
const DEG = 360 / 4096;

// Feetech STS3215 (the SCS/STS protocol): FF FF id len instr params checksum, at 1,000,000 baud.
// Memory: 5 ID, 33 mode (0 position, 1 wheel), 40 torque on, 41 acceleration, 42 goal position,
// 44 goal time, 46 goal speed, 56 present position, 58 present speed, 60 load, 62 voltage (0.1 V),
// 63 temperature, 66 moving. 16-bit values low byte first; speeds and wheel speed: bit 15 = backwards.
bench.device('sts-servo', (part) => {
  const horn = part.motor('horn');
  const mem = new Array(80).fill(0);
  const id = () => mem[5];
  mem[5] = Number(part.params.id ?? 1) & 0xff;
  mem[3] = 9; mem[4] = 0; // model
  mem[6] = 0; // baud: 1,000,000
  mem[11] = 4095 & 255; mem[12] = 4095 >> 8; // max angle limit
  mem[40] = 1; // torque on
  mem[63] = 32;
  mem[42] = 2048 & 255; mem[43] = 2048 >> 8; // (the goal starts where it is: the middle)
  // (in position mode it counts within one turn, 0-4095: "base" is where that turn starts, in the
  //  horn's own degrees; spinning as a wheel moves it on, and position mode picks up from that turn)
  let rx = [], v = 0, goalDeg = 0, cmdDeg = 0, vel = 0, lastT = 0, got = 0, replies = [], baudOk = true, base = 0, lastMode = 0;
  const w16 = (a) => mem[a] | (mem[a + 1] << 8);
  const sgn = (x) => (x & 0x8000 ? -(x & 0x7fff) : x);
  const set16 = (a, x) => { mem[a] = x & 255; mem[a + 1] = (x >> 8) & 255; };
  const chk = (bytes) => ~bytes.reduce((s, b) => s + b, 0) & 0xff;
  const reply = (err, params = []) => {
    const body = [id(), params.length + 2, err, ...params];
    replies.push([0xff, 0xff, ...body, chk(body)]);
  };
  const handle = (pkt) => {
    const [tid, len, ins, ...rest] = pkt;
    const params = rest.slice(0, len - 2);
    got++;
    const forMe = tid === id() || tid === 0xfe;
    if (ins === 0x01) { if (tid === id()) reply(0); return; }
    if (ins === 0x02 && tid === id()) { const [a, n] = params; reply(0, mem.slice(a, a + n)); return; }
    if (ins === 0x03 && forMe) {
      const a = params[0];
      for (let i = 1; i < params.length; i++) if (a + i - 1 < 80 && a + i - 1 !== 56) mem[a + i - 1] = params[i] & 255;
      if (tid === id()) reply(0);
      return;
    }
    if (ins === 0x83) { // SYNC WRITE: addr, len per servo, then [id, data...] for each
      const [a, n] = params;
      for (let i = 2; i + n < params.length + 1; i += n + 1)
        if (params[i] === id()) {
          for (let k = 0; k < n; k++) mem[a + k] = params[i + 1 + k];
        }
    }
  };
  return {
    packets(list) {
      for (const p of list) {
        if (p.pin !== 'DATA' && p.pin !== 'DATA2') continue;
        if (p.proto !== 'uart') continue;
        baudOk = !p.baud || Math.abs(p.baud - 1000000) < 30000;
        if (!baudOk) continue;
        rx.push(...p.data);
      }
      // whole packets: FF FF id len ...
      for (let guard = 0; guard < 64; guard++) { // (whole packets, a few at most)
        const s = rx.findIndex((b, i) => b === 0xff && rx[i + 1] === 0xff && rx[i + 2] !== 0xff);
        if (s < 0) { if (rx.length > 512) rx = []; break; }
        if (rx.length < s + 4) break;
        const len = rx[s + 3];
        if (rx.length < s + 4 + len) break;
        const pkt = rx.slice(s + 2, s + 4 + len);
        rx = rx.slice(s + 4 + len);
        if (chk(pkt.slice(0, -1)) === pkt[pkt.length - 1]) handle(pkt.slice(0, -1));
      }
    },
    step(io) {
      v = Math.max(supplied(io), io.supply('V+2', 'GND2'));
      const dt = io.time - lastT;
      lastT = io.time;
      if (v < 4) { horn.limp(); rx = []; replies = []; io.draw(0); return; }
      for (const r of replies) io.send('DATA', 'uart', r, 1000000);
      replies = [];
      const torque = mem[40] & 1;
      const wheel = mem[33] === 1;
      if (!wheel && lastMode === 1) base = 360 * Math.floor((horn.angle + 180) / 360); // (back to positions: within this turn)
      lastMode = mem[33];
      goalDeg = base + (sgn(w16(42)) - 2048) * DEG;
      const top = 45 * 6 * (v / 7.4); // deg/s at this voltage
      const spd = Math.min(top, (sgn(w16(46)) ? Math.abs(sgn(w16(46))) * DEG : top) || top);
      const acc = mem[41] ? mem[41] * 100 * DEG : 1e9; // (deg/s^2: 100 counts/s^2 a step of ACC)
      if (wheel) {
        const want = Math.max(-top, Math.min(top, sgn(w16(46)) * DEG));
        vel += Math.max(-acc * dt, Math.min(acc * dt, want - vel));
        cmdDeg += vel * dt;
      } else {
        const d = goalDeg - cmdDeg;
        const stop = Math.sqrt(2 * acc * Math.abs(d));
        const wantV = Math.sign(d) * Math.min(spd, stop);
        vel += Math.max(-acc * dt, Math.min(acc * dt, wantV - vel));
        if (Math.abs(d) < Math.abs(vel * dt) || Math.abs(d) < 0.05) { cmdDeg = goalDeg; vel = 0; } else cmdDeg += vel * dt;
      }
      if (torque) horn.to(cmdDeg, v); else { horn.limp(); cmdDeg = horn.angle; vel = 0; }
      // what it reports
      const pos = Math.round((horn.angle - (wheel ? 0 : base)) / DEG) + 2048;
      set16(56, wheel ? ((pos % 4096) + 4096) % 4096 : Math.max(0, Math.min(4095, pos)));
      const sp = Math.round(horn.speed / DEG);
      set16(58, sp < 0 ? 0x8000 | Math.min(0x7fff, -sp) : Math.min(0x7fff, sp));
      set16(60, horn.stalled ? 1000 : Math.min(1000, Math.round(Math.abs(cmdDeg - horn.angle) * 20)));
      mem[62] = Math.round(v * 10);
      mem[66] = Math.abs(goalDeg - horn.angle) > 1 || Math.abs(horn.speed) > 3 ? 1 : 0;
      io.draw(torque ? (horn.stalled ? 2.7 : 0.18 + Math.abs(horn.speed) / 600) : 0.05);
    },
    status() {
      if (v < 4) return ['no power (6-8.4 V)'];
      if (!baudOk) return ['messages at the wrong speed: it talks at 1,000,000 baud'];
      return [`ID ${id()}, ${mem[33] === 1 ? `wheel mode, ${Math.round(sgn(w16(46)))} steps/s` : `to ${Math.round(goalDeg)} deg`}, at ${Math.round(horn.angle)} deg${mem[40] & 1 ? '' : ' (torque off)'}`, `${got} messages`];
    },
  };
});

// Dynamixel XL430-W250 (Protocol 2.0): FF FF FD 00 id lenL lenH instr params crcL crcH, bytes
// FF FF FD inside stuffed with an extra FD; at 57,600 baud. Control table (RAM): 64 torque enable,
// 65 LED, 104 goal velocity (0.229 rpm), 112 profile velocity, 116 goal position, 122 moving,
// 126 present load, 128 present velocity, 132 present position, 144 input voltage (0.1 V), 146
// temperature; EEPROM: 0 model (1060), 7 ID, 8 baud (1 = 57,600), 11 operating mode (1 velocity,
// 3 position, 4 extended position, 16 PWM). Torque is off at power-up.
const CRC_TABLE = (() => {
  const t = [];
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t.push(c);
  }
  return t;
})();
const crc16 = (bytes) => {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >> 8) ^ b) & 0xff]) & 0xffff;
  return crc;
};
const BAUDS = [9600, 57600, 115200, 1000000, 2000000, 3000000, 4000000, 4500000];

bench.device('xl430', (part) => {
  const horn = part.motor('horn');
  const mem = new Array(160).fill(0);
  mem[0] = 1060 & 255; mem[1] = 1060 >> 8; mem[6] = 46;
  mem[7] = Number(part.params.id ?? 1) & 0xff;
  mem[8] = 1; mem[11] = 3; mem[146] = 30;
  mem[116] = 2048 & 255; mem[117] = 2048 >> 8; // (the goal starts where it is)
  let rx = [], v = 0, goalDeg = 0, cmdDeg = 0, vel = 0, lastT = 0, got = 0, replies = [], baudOk = true, base = 0, lastMode = 3;
  const id = () => mem[7];
  const r32 = (a) => (mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16) | (mem[a + 3] << 24));
  const set32 = (a, x) => { for (let i = 0; i < 4; i++) mem[a + i] = (x >> (8 * i)) & 255; };
  const stuff = (b) => {
    const out = [];
    for (let i = 0; i < b.length; i++) {
      out.push(b[i]);
      if (i >= 2 && b[i - 2] === 0xff && b[i - 1] === 0xff && b[i] === 0xfd) out.push(0xfd);
    }
    return out;
  };
  const reply = (err, params = []) => {
    const body = stuff([id(), 0, 0, 0x55, err, ...params]);
    const len = body.length - 3 + 2; // instr .. crc
    body[1] = len & 255; body[2] = len >> 8;
    const pkt = [0xff, 0xff, 0xfd, 0x00, ...body];
    const c = crc16(pkt);
    replies.push([...pkt, c & 255, c >> 8]);
  };
  const goalFromMem = () => {
    const raw = r32(116);
    const mode = mem[11];
    const pos = mode === 4 ? raw : Math.max(0, Math.min(4095, raw));
    goalDeg = (mode === 4 ? 0 : base) + (pos - 2048) * DEG;
  };
  const handle = (tid, ins, params) => {
    got++;
    const forMe = tid === id() || tid === 0xfe;
    if (!forMe) return;
    if (ins === 0x01) { reply(0, [1060 & 255, 1060 >> 8, 46]); return; }
    if (ins === 0x02 && tid === id()) {
      const a = params[0] | (params[1] << 8), n = params[2] | (params[3] << 8);
      reply(0, mem.slice(a, a + n));
      return;
    }
    if (ins === 0x03 || ins === 0x04) {
      const a = params[0] | (params[1] << 8), data = params.slice(2);
      const torque = mem[64] & 1;
      // (EEPROM: only with torque off; the mode, ID, baud live there)
      if (a < 64 && torque) { if (tid === id()) reply(0x07); return; }
      for (let i = 0; i < data.length; i++) if (a + i < 122) mem[a + i] = data[i]; // (from 122 on: read-only)
      if (a <= 119 && a + data.length > 116) goalFromMem();
      if (a <= 64 && a + data.length > 64 && (mem[64] & 1)) cmdDeg = horn.angle; // (torque on: it holds where it is)
      if (tid === id()) reply(0);
      return;
    }
    if (ins === 0x08) { mem[64] = 0; mem[11] = 3; mem[7] = 1; if (tid === id()) reply(0); return; } // factory reset
  };
  return {
    packets(list) {
      for (const p of list) {
        if ((p.pin !== 'DATA' && p.pin !== 'DATA2') || p.proto !== 'uart') continue;
        const baud = BAUDS[mem[8]] ?? 57600;
        baudOk = !p.baud || Math.abs(p.baud - baud) < baud * 0.03;
        if (!baudOk) continue;
        rx.push(...p.data);
      }
      for (let guard = 0; guard < 64; guard++) { // (whole packets, a few at most)
        const s = rx.findIndex((b, i) => b === 0xff && rx[i + 1] === 0xff && rx[i + 2] === 0xfd && rx[i + 3] === 0x00);
        if (s < 0) { if (rx.length > 1024) rx = []; break; }
        if (rx.length < s + 7) break;
        const len = rx[s + 5] | (rx[s + 6] << 8);
        if (rx.length < s + 7 + len) break;
        const pkt = rx.slice(s, s + 7 + len);
        rx = rx.slice(s + 7 + len);
        const c = crc16(pkt.slice(0, -2));
        if ((c & 255) !== pkt[pkt.length - 2] || (c >> 8) !== pkt[pkt.length - 1]) continue;
        // unstuff the instruction's parameters
        const raw = pkt.slice(8, -2), params = [];
        for (let i = 0; i < raw.length; i++) {
          params.push(raw[i]);
          if (i >= 2 && raw[i - 2] === 0xff && raw[i - 1] === 0xff && raw[i] === 0xfd && raw[i + 1] === 0xfd) i++;
        }
        handle(pkt[4], pkt[7], params);
      }
    },
    step(io) {
      v = Math.max(supplied(io), io.supply('V+2', 'GND2'));
      const dt = io.time - lastT;
      lastT = io.time;
      if (v < 5.5) { horn.limp(); rx = []; replies = []; io.draw(0); mem[64] = 0; return; }
      for (const r of replies) io.send('DATA', 'uart', r, BAUDS[mem[8]] ?? 57600);
      replies = [];
      const torque = mem[64] & 1;
      const mode = mem[11];
      if (mode === 3 && lastMode !== 3) { base = 360 * Math.floor((horn.angle + 180) / 360); goalFromMem(); } // (position mode: one turn, the one it's in)
      lastMode = mode;
      const top = 57 * 6 * (v / 12);
      const prof = r32(112);
      const spd = prof > 0 ? Math.min(top, prof * 0.229 * 6) : top;
      if (mode === 1) {
        const want = Math.max(-top, Math.min(top, r32(104) * 0.229 * 6));
        vel += Math.max(-2000 * dt, Math.min(2000 * dt, want - vel));
        cmdDeg += vel * dt;
      } else {
        const d = goalDeg - cmdDeg;
        const wantV = Math.sign(d) * Math.min(spd, Math.sqrt(2 * 3000 * Math.abs(d)));
        vel += Math.max(-3000 * dt, Math.min(3000 * dt, wantV - vel));
        if (Math.abs(d) < Math.abs(vel * dt) || Math.abs(d) < 0.05) { cmdDeg = goalDeg; vel = 0; } else cmdDeg += vel * dt;
      }
      if (torque) horn.to(cmdDeg, v); else { horn.limp(); cmdDeg = horn.angle; vel = 0; }
      const pos = Math.round((horn.angle - (mode === 3 ? base : 0)) / DEG) + 2048;
      set32(132, mode === 4 || mode === 1 ? pos : Math.max(0, Math.min(4095, pos)));
      set32(128, Math.round(horn.speed / 6 / 0.229));
      const load = horn.stalled ? 1000 : Math.min(1000, Math.round(Math.abs(cmdDeg - horn.angle) * 20));
      mem[126] = load & 255; mem[127] = (load >> 8) & 255;
      mem[144] = Math.round(v * 10) & 255; mem[145] = Math.round(v * 10) >> 8;
      mem[122] = Math.abs(horn.speed) > 3 ? 1 : 0;
      io.draw(torque ? (horn.stalled ? 1.4 : 0.06 + Math.abs(horn.speed) / 900) : 0.05);
    },
    status() {
      if (v < 5.5) return ['no power (6.5-12 V)'];
      if (!baudOk) return [`messages at the wrong speed: it talks at ${BAUDS[mem[8]] ?? 57600} baud`];
      const mode = { 1: 'velocity', 3: 'position', 4: 'extended position', 16: 'PWM' }[mem[11]] ?? `mode ${mem[11]}`;
      return [`ID ${id()}, ${mode}, ${mem[64] & 1 ? (mem[11] === 1 ? `${Math.round(r32(104) * 0.229)} rpm` : `to ${Math.round(goalDeg)} deg`) : 'torque OFF (dxl.torqueOn(id))'}, at ${Math.round(horn.angle)} deg${mem[65] ? ', LED on' : ''}`, `${got} messages`];
    },
  };
});
