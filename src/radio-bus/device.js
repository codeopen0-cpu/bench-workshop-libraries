// LoRa radios, CAN bus modules, RS485 transceivers.
// LoRa and CAN talk to their sketch libraries (LoRa.h, mcp_can.h) over SPI with a few commands of
// their own (the libraries hide them: sketches use the usual calls).

// ------------------------------------------------------------------------------------------ LoRa
// Every LoRa radio on the bench: a packet goes to every other one tuned the same way, after its air
// time (how long the packet takes to send at its spreading factor and bandwidth).
const loras = new Set();
const BW = [7800, 10400, 15600, 20800, 31250, 41700, 62500, 125000, 250000, 500000];
const airtimeMs = (sf, bw, len) => {
  const tsym = (2 ** sf) / bw * 1000;
  const low = tsym > 16 ? 1 : 0;
  const payload = 8 + Math.max(Math.ceil((8 * len - 4 * sf + 28 + 16) / (4 * (sf - 2 * low))) * 5, 0);
  return (12.25 + payload) * tsym;
};
bench.device('lora', (part) => {
  const r = { powered: false, freq: 0, sf: 7, bw: 125000, sync: 0x12, inbox: [], current: null, sent: 0, got: 0, missed: 0, busyUntil: 0, now: 0 };
  loras.add(r);
  const send = (data) => {
    const t = airtimeMs(r.sf, r.bw, data.length);
    r.busyUntil = r.now + t / 1000;
    r.sent++;
    for (const o of loras) {
      if (o === r || !o.powered) continue;
      // tuned the same way: it hears it; a different spreading factor or sync word: it doesn't
      if (Math.abs(o.freq - r.freq) > 50000 || o.sf !== r.sf || o.bw !== r.bw || o.sync !== r.sync) { o.missed++; continue; }
      if (o.inbox.length < 8) o.inbox.push({ data, at: r.now + t / 1000, rssi: -48 - Math.round(Math.random() * 6), snr: 9 });
    }
    return t;
  };
  return {
    spi: {
      transfer(bytes) {
        if (!r.powered) return bytes.map(() => 0);
        const c = bytes[0];
        const out = new Array(bytes.length).fill(0);
        if (c === 0xb0) out[1] = 0x12; // the chip's version: "it's there"
        else if (c === 0xb1) r.freq = ((bytes[1] << 24) >>> 0) + (bytes[2] << 16) + (bytes[3] << 8) + bytes[4];
        else if (c === 0xb2) { r.sf = Math.max(6, Math.min(12, bytes[1])); r.bw = BW[bytes[2]] ?? 125000; r.sync = bytes[3]; }
        else if (c === 0xb3) { const n = bytes[1]; const t = send(bytes.slice(2, 2 + n)); out[1] = Math.min(255, Math.ceil(t / 10)); } // (its air time, in 10 ms)
        else if (c === 0xb4) { // the next packet that has arrived
          const i = r.inbox.findIndex((p) => p.at <= r.now);
          r.current = i >= 0 ? r.inbox.splice(i, 1)[0] : null;
          if (r.current) r.got++;
          out[1] = r.current ? r.current.data.length : 0;
        } else if (c === 0xb5) { const d = r.current?.data ?? []; for (let i = 1; i < bytes.length; i++) out[i] = d[i - 1] ?? 0; }
        else if (c === 0xb6) { out[1] = (r.current?.rssi ?? -120) + 164; out[2] = ((r.current?.snr ?? 0) * 4) & 255; }
        return out;
      },
    },
    step(io) {
      r.now = io.time;
      r.powered = io.supply('VCC', 'GND') >= 2.4 && io.level('RST') !== 0;
      // DIO0: HIGH while a received packet waits (as "RxDone")
      io.drive('DIO0', r.powered && r.inbox.some((p) => p.at <= r.now) ? io.supply('VCC', 'GND') : 0, 1);
      io.draw(!r.powered ? 0 : r.now < r.busyUntil ? 0.12 : 0.011); // (sending: ~120 mA; listening: ~11 mA)
    },
    status() {
      if (!r.powered) return ['no power (3.3 V)'];
      if (!r.freq) return ['powered: waiting for LoRa.begin()'];
      return [`${(r.freq / 1e6).toFixed(1)} MHz, SF${r.sf}, ${r.bw / 1000} kHz${r.now < r.busyUntil ? ', sending...' : ''}`, `${r.sent} sent, ${r.got} received${r.missed ? `, ${r.missed} not heard (other settings)` : ''}`];
    },
  };
});

// ------------------------------------------------------------------------------------------ CAN
// A frame goes out on CANH as a message; every module on that wire takes it, if it runs at the same
// speed (at another speed it hears noise). Frame bytes: speed (kbps / 5), ext, id (4), len, data.
bench.device('mcp2515', (part) => {
  let powered = false, speed = 0, mode = 0, sent = 0, got = 0, garbled = 0;
  const rx = [];
  let outbox = [];
  const crystal = Number(part.params.crystal) || 8;
  return {
    spi: {
      transfer(bytes) {
        if (!powered) return bytes.map(() => 0);
        const c = bytes[0];
        const out = new Array(bytes.length).fill(0);
        if (c === 0xc0) { // begin: speed (kbps / 5), the crystal the sketch says, mode
          const asked = bytes[1] * 5, said = bytes[2];
          // a sketch that names the wrong crystal runs at the wrong speed (half or double)
          speed = said && said !== crystal ? asked * (crystal / said) : asked;
          out[1] = 0x55;
        } else if (c === 0xc4) mode = bytes[1];
        else if (c === 0xc1) {
          if (mode === 0x40) rx.push({ id: bytes.slice(2, 6), ext: bytes[1], data: bytes.slice(7, 7 + bytes[6]) }); // loopback
          else outbox.push([Math.round(speed / 5) & 255, ...bytes.slice(1, 7 + bytes[6])]);
          sent++;
        } else if (c === 0xc2) out[1] = rx.length;
        else if (c === 0xc3) {
          const f = rx.shift();
          if (f) { out[1] = f.ext; f.id.forEach((b, i) => (out[2 + i] = b)); out[6] = f.data.length; f.data.forEach((b, i) => (out[7 + i] = b)); }
        }
        return out;
      },
    },
    step(io) {
      powered = io.supply('VCC', 'GND') >= 4.2;
      for (const f of outbox) io.send('CANH', 'data', f);
      outbox = [];
      io.drive('INT', powered && rx.length ? 0 : io.supply('VCC', 'GND'), 1);
      io.draw(powered ? 0.012 + (sent ? 0.01 : 0) : 0);
    },
    packets(list) {
      for (const p of list) {
        if (p.pin !== 'CANH' || p.proto !== 'data' || !powered || mode === 0x40) continue;
        const [sp, ext, a, b, c, d, len, ...data] = p.data;
        if (Math.abs(sp * 5 - speed) > 1) { garbled++; continue; } // (a different speed: noise, ignored)
        if (rx.length < 16) { rx.push({ ext, id: [a, b, c, d], data: data.slice(0, len) }); got++; }
      }
    },
    status: () => [!powered ? 'no power (5 V)' : !speed ? 'waiting for CAN0.begin()' : `${speed} kbps${mode === 0x40 ? ' (loopback)' : ''}`, `${sent} sent, ${got} received${garbled ? `, ${garbled} at another speed (ignored)` : ''}`],
  };
});

// ------------------------------------------------------------------------------------------ RS485
// DE HIGH: what the board sends on DI goes out on A/B; RE LOW: what comes in on A/B goes to RO.
bench.device('max485', (part) => {
  let powered = false, de = false, re = false, sent = 0, got = 0, garbled = 0;
  let pending = [];
  return {
    step(io) {
      powered = io.supply('VCC', 'GND') >= 4.2;
      de = io.level('DE') === 1;
      re = io.level('RE') === 0;
      for (const [pin, data, baud] of pending) io.send(pin, 'uart', data, baud);
      pending = [];
      if (!re) io.drive('RO', io.supply('VCC', 'GND'), 0); else io.release('RO');
      io.draw(powered ? (de ? 0.06 : 0.0005) : 0);
    },
    packets(list) {
      if (!powered) return;
      for (const p of list) {
        if (p.proto !== 'uart') continue;
        if (p.pin === 'DI' && de) { pending.push(['A', p.data, p.baud]); sent += p.data.length; if (re) pending.push(['RO', p.data, p.baud]); }
        else if ((p.pin === 'A' || p.pin === 'B') && re) {
          // wired A to B (swapped): the line's levels are upside down, the bytes come out wrong
          const data = p.pin === 'A' ? p.data : p.data.map((b) => ~b & 255);
          if (p.pin === 'B') garbled += data.length; else got += data.length;
          pending.push(['RO', data, p.baud]);
        }
      }
    },
    status: () => [!powered ? 'no power (5 V)' : `${de ? 'sending' : 'not sending'}, ${re ? 'receiving' : 'not receiving'}`, `${sent} bytes out, ${got} in${garbled ? `, ${garbled} garbled (A and B swapped?)` : ''}`],
  };
});
