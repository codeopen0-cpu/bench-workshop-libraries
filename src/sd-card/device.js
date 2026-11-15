// SD card module. A real card speaks the SD protocol over SPI; this one speaks a short request /
// answer protocol of its own (the included SD.h knows it): a request [0xB5, op, length (2 bytes),
// bytes...], then [0xB6, 0xFF...] to clock its answer out ([length (2 bytes), bytes...]).
// ops: 1 card? 2 exists 3 remove 4 size 5 read(at, n) 6 append 7 truncate 8 list 9 mkdir
const MAX_FILE = 256 * 1024, MAX_FILES = 64;

bench.device('sd', (part) => {
  const card = part.params.card !== false;
  const files = new Map(); // name -> bytes
  let powered = false, answer = [], ops = 0;
  const text = (b) => String.fromCharCode(...b);
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const rd32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  const norm = (n) => n.replace(/^\/+/, '').toLowerCase();
  const total = () => [...files.values()].reduce((s, f) => s + f.length, 0);
  const handle = (op, b) => {
    ops++;
    if (!card) return [0];
    if (op === 1) return [1];
    // the name comes first: its length, then its characters
    const nl = b[0] ?? 0, name = norm(text(b.slice(1, 1 + nl))), rest = b.slice(1 + nl);
    if (op === 2) return [files.has(name) || [...files.keys()].some((k) => k.startsWith(name + '/')) || name === '' ? 1 : 0];
    if (op === 3) return [files.delete(name) ? 1 : 0];
    if (op === 4) return files.has(name) ? [1, ...u32(files.get(name).length)] : [0];
    if (op === 5) {
      const f = files.get(name);
      if (!f) return [0];
      const at = rd32(rest, 0), n = Math.min(rd32(rest, 4), 400);
      return [1, ...f.slice(at, at + n)];
    }
    if (op === 6) {
      let f = files.get(name);
      if (!f) { if (files.size >= MAX_FILES) return [0]; f = []; files.set(name, f); }
      if (f.length + rest.length > MAX_FILE) return [0];
      f.push(...rest);
      return [1];
    }
    if (op === 7) { files.set(name, []); return [1]; }
    if (op === 8) {
      const names = [...files.keys()].filter((k) => k.startsWith(name ? name + '/' : '')).map((k) => k.slice(name ? name.length + 1 : 0)).join('\n');
      return [1, ...Array.from(names.slice(0, 390), (c) => c.charCodeAt(0))];
    }
    if (op === 9) return [1];
    return [0];
  };
  return {
    spi: {
      transfer(bytes) {
        if (!powered) return bytes.map(() => 0xff);
        if (bytes[0] === 0xb5) {
          const len = (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8);
          const r = handle(bytes[1], bytes.slice(4, 4 + len));
          answer = [r.length & 255, r.length >> 8, ...r];
          return bytes.map(() => 0xff);
        }
        if (bytes[0] === 0xb6) {
          const out = [0xff, ...answer.slice(0, bytes.length - 1)];
          while (out.length < bytes.length) out.push(0xff);
          return out;
        }
        return bytes.map(() => 0xff);
      },
    },
    step(io) {
      powered = io.supply('VCC', 'GND') >= 3.2;
      io.draw(powered ? (ops ? 0.03 : 0.005) : 0);
    },
    status() {
      if (!powered) return ['no power'];
      if (!card) return ['no card in it'];
      const list = [...files].map(([n, f]) => `${n} (${f.length} bytes)`);
      return [list.length ? `${files.size} file(s), ${total()} bytes` : 'empty card', ...list.slice(0, 6)];
    },
  };
});
