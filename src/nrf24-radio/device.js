// nRF24L01+: the chip's own registers and SPI commands (as RF24.h uses them). All radios of this
// library run in one thread, so a sent packet reaches the others straight away: the one listening on
// the same channel and data rate, with a matching address, takes it into its receive queue (3 deep)
// and, with auto-ack, the sender hears TX_DS; else it retries and gives up with MAX_RT.
const radios = new Set();
const ADDR5 = new Set([0x0a, 0x0b, 0x10]);

bench.device('nrf24', (part) => {
  const r = {
    regs: new Array(0x20).fill(0),
    addr: { 0x0a: [0xe7, 0xe7, 0xe7, 0xe7, 0xe7], 0x0b: [0xc2, 0xc2, 0xc2, 0xc2, 0xc2], 0x10: [0xe7, 0xe7, 0xe7, 0xe7, 0xe7] },
    rx: [], tx: [], powered: false, ce: false, ceRose: false, pos: [0, 0, 0], sent: 0, got: 0, lost: 0, name: part.name,
  };
  const R = r.regs;
  const reset = () => {
    R.fill(0);
    R[0x00] = 0x08; R[0x01] = 0x3f; R[0x02] = 0x03; R[0x03] = 0x03; R[0x04] = 0x03; R[0x05] = 0x02; R[0x06] = 0x0e; R[0x07] = 0x0e;
    R[0x0c] = 0xc3; R[0x0d] = 0xc4; R[0x0e] = 0xc5; R[0x0f] = 0xc6;
    r.addr = { 0x0a: [0xe7, 0xe7, 0xe7, 0xe7, 0xe7], 0x0b: [0xc2, 0xc2, 0xc2, 0xc2, 0xc2], 0x10: [0xe7, 0xe7, 0xe7, 0xe7, 0xe7] };
    r.rx = []; r.tx = [];
  };
  reset();
  radios.add(r);
  const status = () => {
    const pipe = r.rx.length ? r.rx[0].pipe : 7;
    return (R[0x07] & 0x70) | (pipe << 1) | (r.tx.length >= 3 ? 1 : 0);
  };
  const fifoStatus = () => (r.tx.length >= 3 ? 0x20 : 0) | (r.tx.length ? 0 : 0x10) | (r.rx.length >= 3 ? 0x02 : 0) | (r.rx.length ? 0 : 0x01);
  const regRead = (a) => (a === 0x07 ? status() : a === 0x17 ? fifoStatus() : R[a]);
  const rate = (x) => (x.regs[0x06] & 0x20 ? 250 : x.regs[0x06] & 0x08 ? 2000 : 1000);
  const pipeAddr = (x, p) => (p === 0 ? x.addr[0x0a] : p === 1 ? x.addr[0x0b] : [x.regs[0x0a + p], ...x.addr[0x0b].slice(1)]);
  const awBytes = (x) => (x.regs[0x03] & 3) + 2;
  // one packet out of the TX queue, through the air
  const transmit = () => {
    const pkt = r.tx[0];
    const aw = awBytes(r);
    const to = r.addr[0x10].slice(0, aw).join();
    let taken = null;
    for (const o of radios) {
      if (o === r || !o.powered || !(o.regs[0x00] & 0x02) || !(o.regs[0x00] & 0x01) || !o.ce) continue;
      if (o.regs[0x05] !== R[0x05] || rate(o) !== rate(r) || awBytes(o) !== aw) continue;
      if (Math.hypot(o.pos[0] - r.pos[0], o.pos[1] - r.pos[1], o.pos[2] - r.pos[2]) > 10000) continue; // (100 m)
      for (let p = 0; p < 6; p++) {
        if (!(o.regs[0x02] & (1 << p)) || pipeAddr(o, p).slice(0, aw).join() !== to) continue;
        if (o.rx.length >= 3) { taken = 'full'; break; }
        const dyn = (o.regs[0x1d] & 0x04) && (o.regs[0x1c] & (1 << p));
        const w = dyn ? pkt.data.length : o.regs[0x11 + p] & 63;
        const data = pkt.data.slice(0, w);
        while (data.length < w) data.push(0);
        o.rx.push({ pipe: p, data });
        o.regs[0x07] |= 0x40; // RX_DR
        o.got++;
        taken = 'ok';
        break;
      }
      if (taken) break;
    }
    const autoAck = R[0x01] & 0x01 && !pkt.noAck;
    if (taken === 'ok' || !autoAck) {
      r.tx.shift();
      R[0x07] |= 0x20; // TX_DS
      r.sent++;
    } else {
      R[0x07] |= 0x10; // MAX_RT: the packet stays in the queue (flush it, or try again)
      R[0x08] = ((R[0x08] & 0xf0) + 0x10) & 0xf0 | (R[0x04] & 0x0f);
      r.lost++;
    }
  };
  return {
    spi: {
      transfer(bytes) {
        if (!r.powered) return bytes.map(() => 0);
        const c = bytes[0] ?? 0xff;
        const out = [status()];
        const rest = bytes.slice(1);
        if (c < 0x20) { // R_REGISTER
          const a = c & 0x1f;
          const v = ADDR5.has(a) ? r.addr[a] : [regRead(a)];
          rest.forEach((_, i) => out.push(v[i] ?? 0));
        } else if (c < 0x40) { // W_REGISTER
          const a = c & 0x1f;
          if (ADDR5.has(a)) { r.addr[a] = [...rest.slice(0, 5), ...r.addr[a].slice(rest.length)].slice(0, 5); }
          else if (a === 0x07) R[0x07] &= ~(rest[0] & 0x70); // writing 1 clears a flag
          else if (rest.length) R[a] = rest[0] & 255;
          rest.forEach(() => out.push(0));
        } else if (c === 0x61) { // R_RX_PAYLOAD
          const p = r.rx.shift();
          rest.forEach((_, i) => out.push(p?.data[i] ?? 0));
          if (!r.rx.length) R[0x07] &= ~0x40;
        } else if (c === 0x60) { // R_RX_PL_WID
          out.push(r.rx[0]?.data.length ?? 0);
        } else if (c === 0xa0 || c === 0xb0) { // W_TX_PAYLOAD (no ack)
          if (r.tx.length < 3) r.tx.push({ data: rest.slice(0, 32), noAck: c === 0xb0 });
          rest.forEach(() => out.push(0));
        } else if (c === 0xe1) r.tx = [];
        else if (c === 0xe2) { r.rx = []; R[0x07] &= ~0x40; }
        else if (c === 0xe3) { /* REUSE_TX_PL */ }
        else rest.forEach(() => out.push(0)); // NOP, ACTIVATE...
        while (out.length < bytes.length) out.push(0);
        return out;
      },
    },
    edges(list) {
      for (const [pin, lv] of list) if (pin === 'CE') { if (lv && !r.ce) r.ceRose = true; r.ce = !!lv; }
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      const on = v >= 1.9;
      if (on && !r.powered) reset();
      r.powered = on;
      r.ce = io.level('CE') === 1;
      r.pos = part.motion().pos;
      if (!on) { io.release('IRQ'); io.release('MISO'); io.draw(0); return; }
      const ptx = (R[0x00] & 0x02) && !(R[0x00] & 0x01);
      if (ptx && (r.ce || r.ceRose) && r.tx.length && !(R[0x07] & 0x10)) transmit();
      r.ceRose = false;
      const irq = R[0x07] & 0x70 & ~(R[0x00] & 0x70);
      io.drive('IRQ', irq ? 0 : v, 1);
      io.draw(!(R[0x00] & 0x02) ? 0.0000009 : (R[0x00] & 0x01) && r.ce ? 0.0135 : 0.0003);
    },
    status() {
      if (!r.powered) return ['no power (3.3 V)'];
      const mode = !(R[0x00] & 0x02) ? 'powered down' : R[0x00] & 0x01 ? (r.ce ? 'listening' : 'receive mode, CE low') : 'transmit mode';
      return [`${mode}, channel ${R[0x05]}, ${rate(r) >= 1000 ? `${rate(r) / 1000} Mbps` : '250 kbps'}`, `${r.sent} sent, ${r.got} received, ${r.lost} unanswered`];
    },
    dispose() { radios.delete(r); },
  };
});
