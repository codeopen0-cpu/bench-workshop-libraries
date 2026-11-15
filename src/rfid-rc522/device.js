// RC522 reader and MIFARE Classic 1K tags.
// Tags say where they are (a shared list: all parts of this library run in one thread); the reader
// talks to the nearest one within reach of its coil. The reader's registers are the real chip's (the
// ones MFRC522.h uses); its SPI: a byte (reg << 1) | 0x80 to read, (reg << 1) to write, then data.
const tags = new Map(); // uid number -> { pos, mem, name, halted, state, auth }
const crcA = (bytes) => {
  let crc = 0x6363;
  for (let b of bytes) {
    b = (b ^ (crc & 0xff)) & 0xff;
    b = (b ^ (b << 4)) & 0xff;
    crc = ((crc >> 8) ^ (b << 8) ^ (b << 3) ^ (b >> 4)) & 0xffff;
  }
  return [crc & 0xff, crc >> 8];
};
const newMemory = (uid) => {
  const mem = new Array(1024).fill(0);
  const u = [(uid >>> 24) & 255, (uid >>> 16) & 255, (uid >>> 8) & 255, uid & 255];
  mem.splice(0, 8, ...u, u[0] ^ u[1] ^ u[2] ^ u[3], 0x08, 0x04, 0x00);
  for (let s = 0; s < 16; s++) mem.splice(s * 64 + 48, 16, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x07, 0x80, 0x69, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
  return { u, mem };
};

bench.device('tag', (part) => {
  const id = (Number(part.params.uid ?? 0) >>> 0) || 1;
  const t = { ...newMemory(id), pos: null, name: part.name, halted: false, state: 'idle', auth: -1, virtual: false };
  tags.set(id, t);
  return {
    step() { t.pos = part.motion().pos; },
    status() {
      return [`ID ${t.u.map((b) => b.toString(16).padStart(2, '0')).join(' ')}${t.state === 'active' ? ': being read' : ''}`];
    },
  };
});

bench.device('rc522', (part) => {
  const hold = part.control('hold');
  const regs = new Array(64).fill(0);
  let fifo = [], powered = false, near = null, held = null, reads = 0, lastTagName = '', pendingWrite = null;
  // two cards from the run panel, if no real ones are on the bench to hold up
  const panel = { 'Card 1': { ...newMemory(0x11223344), pos: null, name: 'Card 1 (run panel)', halted: false, state: 'idle', auth: -1 },
                  'Card 2': { ...newMemory(0x55667788), pos: null, name: 'Card 2 (run panel)', halted: false, state: 'idle', auth: -1 } };
  const reset = () => {
    regs.fill(0);
    regs[0x37] = 0x92; // VersionReg: v2.0
    regs[0x0a] = 0; regs[0x14] = 0x80; regs[0x01] = 0x20;
    fifo = [];
  };
  reset();
  const irq = (bits) => { regs[0x04] |= bits; };
  const answer = (bytes, lastBits = 0) => {
    fifo = bytes.slice(0, 64);
    regs[0x0a] = fifo.length;
    regs[0x0c] = (regs[0x0c] & ~7) | (lastBits & 7);
    regs[0x06] = 0;
    irq(0x30); // RxIRq, IdleIRq
  };
  const timeout = () => { regs[0x06] = 0; irq(0x01); }; // TimerIRq only: nobody answered (the command never finishes)
  const block = (tag, n) => tag.mem.slice(n * 16, n * 16 + 16);
  // a frame to the tag in the field (ISO 14443-A and MIFARE commands)
  const transceive = () => {
    const data = fifo.slice();
    fifo = [];
    regs[0x0a] = 0;
    const antenna = (regs[0x14] & 3) === 3;
    const tag = antenna ? near : null;
    if (!tag) return timeout();
    const bits = regs[0x0d] & 7;
    if (bits === 7 && (data[0] === 0x26 || data[0] === 0x52)) { // REQA / WUPA
      if (tag.halted && data[0] === 0x26) return timeout();
      tag.halted = false; tag.state = 'ready'; tag.auth = -1;
      return answer([0x04, 0x00]);
    }
    if (data[0] === 0x93 && data[1] === 0x20 && tag.state !== 'idle') return answer([...tag.u, tag.u[0] ^ tag.u[1] ^ tag.u[2] ^ tag.u[3]]);
    if (data[0] === 0x93 && data[1] === 0x70 && tag.state !== 'idle') {
      if (data.slice(2, 6).join() !== tag.u.join()) return timeout();
      tag.state = 'active';
      return answer([0x08, ...crcA([0x08])]);
    }
    if (data[0] === 0x50 && data[1] === 0x00) { tag.halted = true; tag.state = 'idle'; tag.auth = -1; return timeout(); } // HLTA: no answer
    if (tag.state !== 'active') return timeout();
    if (pendingWrite !== null) { // the 16 bytes after a WRITE command
      const n = pendingWrite;
      pendingWrite = null;
      if (data.length >= 16 && n > 0) for (let i = 0; i < 16; i++) tag.mem[n * 16 + i] = data[i] & 255;
      return answer([0x0a], 4);
    }
    const sector = (n) => Math.floor(n / 4);
    if (data[0] === 0x30) { // READ
      if (tag.auth !== sector(data[1])) return answer([0x04], 4); // NAK: not authenticated
      const b = block(tag, data[1] & 63);
      return answer([...b, ...crcA(b)]);
    }
    if (data[0] === 0xa0) { // WRITE (then 16 bytes)
      if (tag.auth !== sector(data[1]) || data[1] === 0) return answer([0x04], 4);
      pendingWrite = data[1] & 63;
      return answer([0x0a], 4);
    }
    return timeout();
  };
  const command = (c) => {
    regs[0x01] = c;
    if (c === 0x0f) { reset(); return; } // SoftReset
    if (c === 0x03) { // CalcCRC over the FIFO
      const [l, h] = crcA(fifo);
      regs[0x22] = l; regs[0x21] = h;
      regs[0x05] |= 0x04;
      return;
    }
    if (c === 0x0e) { // MFAuthent: [0x60 | 0x61, block, key x6, uid x4]
      const d = fifo.slice();
      fifo = []; regs[0x0a] = 0;
      const tag = near;
      if (!tag || tag.state !== 'active') return timeout();
      const trailer = Math.floor(d[1] / 4) * 4 + 3;
      const key = d[0] === 0x61 ? tag.mem.slice(trailer * 16 + 10, trailer * 16 + 16) : tag.mem.slice(trailer * 16, trailer * 16 + 6);
      if (d.slice(2, 8).join() === key.join() && d.slice(8, 12).join() === tag.u.join()) {
        tag.auth = Math.floor(d[1] / 4);
        regs[0x08] |= 0x08; // MFCrypto1On
        irq(0x10);
      } else timeout();
    }
  };
  const write = (reg, v) => {
    if (reg === 0x09) { if (fifo.length < 64) fifo.push(v); regs[0x0a] = fifo.length; return; }
    if (reg === 0x0a) { if (v & 0x80) { fifo = []; regs[0x0a] = 0; } return; }
    if (reg === 0x04) { regs[0x04] = v & 0x80 ? regs[0x04] | (v & 0x7f) : regs[0x04] & ~(v & 0x7f); return; } // ComIrqReg: bit 7 says set or clear
    if (reg === 0x05) { regs[0x05] = v & 0x80 ? regs[0x05] | (v & 0x7f) : regs[0x05] & ~(v & 0x7f); return; }
    if (reg === 0x01) { command(v & 0x0f); return; }
    regs[reg] = v;
    if (reg === 0x0d && (v & 0x80) && (regs[0x01] & 0x0f) === 0x0c) { regs[0x0d] &= 0x7f; transceive(); }
  };
  const read = (reg) => {
    if (reg === 0x09) { const b = fifo.shift() ?? 0; regs[0x0a] = fifo.length; return b; }
    return regs[reg];
  };
  return {
    spi: {
      // each transfer is one transaction (as MFRC522.h sends them): an address byte, then data
      transfer(bytes) {
        if (!powered) return bytes.map(() => 0);
        const out = [0];
        const a = bytes[0] ?? 0;
        const reg = (a >> 1) & 0x3f;
        if (a & 0x80) {
          // a read: each following byte's answer is the register named by the byte before it
          for (let i = 1; i < bytes.length; i++) {
            out.push(read(((bytes[i - 1] >> 1) & 0x3f)));
          }
          reads++;
        } else {
          for (let i = 1; i < bytes.length; i++) { write(reg, bytes[i]); out.push(0); }
        }
        return out;
      },
    },
    step(io) {
      const v = io.supply('3.3V', 'GND');
      const on = v >= 2.5 && io.level('RST') !== 0;
      if (on && !powered) reset();
      powered = on;
      // the tag held up: from the run panel, else the nearest real one within 4 cm of the coil
      for (const k of hold.take()) held = k === 'Take away' ? null : k;
      let best = null;
      if (held) best = panel[held];
      else {
        const m = part.motion();
        // (the coil: the board's middle, 0.9 cm towards the far end; a tag lying on it is 0.1-1 cm above)
        let bd = 4.5;
        for (const t of tags.values()) {
          if (!t.pos) continue;
          const d = Math.hypot(t.pos[0] - m.pos[0], t.pos[1] - m.pos[1], t.pos[2] - m.pos[2] - 0.9);
          if (d < bd) { bd = d; best = t; }
        }
      }
      if (best !== near) {
        if (near) { near.state = 'idle'; near.halted = false; near.auth = -1; }
        near = best;
        if (near) lastTagName = near.name;
      }
      io.drive('IRQ', powered ? (regs[0x04] & regs[0x02] & 0x7f ? 0 : v) : 0, 1);
      io.draw(powered ? 0.013 : 0);
    },
    status() {
      if (!powered) return ['no power (3.3V, RST high)'];
      const ant = (regs[0x14] & 3) === 3;
      return [`${near ? `a tag in its field: ${lastTagName}` : 'no tag near'}${ant ? '' : ' (antenna off: rfid.PCD_Init())'}`, `${reads} register reads`];
    },
  };
});
