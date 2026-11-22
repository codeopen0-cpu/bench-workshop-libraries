// An ArduCAM Mini 2MP: an OV2640 sensor (I2C 0x30: its settings) behind an ArduChip (SPI: capture,
// a 384 KB frame buffer, burst reads). Written from the datasheet and the register interface.
//
// The picture is really what the part sees on the bench, rendered at 160 x 120 (the app's most for a
// camera) and scaled to the size the sensor is set to. JPEG mode makes real baseline JPEG bytes,
// BMP mode RGB565 (high byte first), as the module puts them in its buffer.
//
// Not modelled: focus, exposure time, rolling shutter, the sensor's other ~200 tuning registers.

// The tables of the JPEG standard (T.81, Annex K): quantisers in zigzag order, and Huffman tables
// as [how many codes of each length 1..16, their symbols].
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19,
  26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56,
  57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31,
  39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const QUANT_LUMA = [
  16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24,
  22, 22, 24, 49, 35, 37, 29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72,
  92, 78, 64, 68, 87, 69, 55, 56, 80, 109, 81, 87, 95, 98, 103, 104, 103, 62,
  77, 113, 121, 112, 100, 120, 92, 101, 103, 99,
];
const QUANT_CHROMA = [
  17, 18, 18, 24, 21, 24, 47, 26, 26, 47, 99, 66, 56, 66, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];
const DC_LUMA = [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
]];
const AC_LUMA = [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125], [
  1, 2, 3, 0, 4, 17, 5, 18, 33, 49, 65, 6, 19, 81, 97, 7, 34, 113,
  20, 50, 129, 145, 161, 8, 35, 66, 177, 193, 21, 82, 209, 240, 36, 51, 98, 114,
  130, 9, 10, 22, 23, 24, 25, 26, 37, 38, 39, 40, 41, 42, 52, 53, 54, 55,
  56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89,
  90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 131,
  132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163,
  164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195,
  196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226,
  227, 228, 229, 230, 231, 232, 233, 234, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250,
]];
const DC_CHROMA = [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
]];
const AC_CHROMA = [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119], [
  0, 1, 2, 3, 17, 4, 5, 33, 49, 6, 18, 65, 81, 7, 97, 113, 19, 34,
  50, 129, 8, 20, 66, 145, 161, 177, 193, 9, 35, 51, 82, 240, 21, 98, 114, 209,
  10, 22, 36, 52, 225, 37, 241, 23, 24, 25, 26, 38, 39, 40, 41, 42, 53, 54,
  55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88,
  89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122,
  130, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154,
  162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186,
  194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218,
  226, 227, 228, 229, 230, 231, 232, 233, 234, 242, 243, 244, 245, 246, 247, 248, 249, 250,
]];

// ------------------------------------------------------------------------------ a baseline JPEG
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

// each Huffman symbol's code and its length
function huffman([counts, symbols]) {
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) {
      code[symbols[k]] = c++;
      size[symbols[k++]] = len;
    }
    c <<= 1;
  }
  return { code, size };
}
const HUFF = { dcY: huffman(DC_LUMA), acY: huffman(AC_LUMA), dcC: huffman(DC_CHROMA), acC: huffman(AC_CHROMA) };

// the forward DCT (Arai, Agui, Nakajima), rows then columns, in place
function dct(d) {
  for (let pass = 0; pass < 2; pass++) {
    const s = pass ? 8 : 1;
    for (let n = 0; n < 8; n++) {
      const o = pass ? n : n * 8;
      const t0 = d[o] + d[o + 7 * s], t7 = d[o] - d[o + 7 * s];
      const t1 = d[o + s] + d[o + 6 * s], t6 = d[o + s] - d[o + 6 * s];
      const t2 = d[o + 2 * s] + d[o + 5 * s], t5 = d[o + 2 * s] - d[o + 5 * s];
      const t3 = d[o + 3 * s] + d[o + 4 * s], t4 = d[o + 3 * s] - d[o + 4 * s];
      let a = t0 + t3, b = t1 + t2;
      const c = t1 - t2, e = t0 - t3;
      d[o] = a + b;
      d[o + 4 * s] = a - b;
      const z1 = (c + e) * 0.707106781;
      d[o + 2 * s] = e + z1;
      d[o + 6 * s] = e - z1;
      a = t4 + t5;
      b = t5 + t6;
      const f = t6 + t7;
      const z5 = (a - f) * 0.382683433;
      const z2 = 0.5411961 * a + z5, z4 = 1.306562965 * f + z5, z3 = b * 0.707106781;
      const z11 = t7 + z3, z13 = t7 - z3;
      d[o + 5 * s] = z13 + z2;
      d[o + 3 * s] = z13 - z2;
      d[o + s] = z11 + z4;
      d[o + 7 * s] = z11 - z4;
    }
  }
}

// bytes that grow as needed
class Bytes {
  constructor(n) {
    this.buf = new Uint8Array(n);
    this.n = 0;
  }
  add(b) {
    if (this.n === this.buf.length) {
      const bigger = new Uint8Array(this.n * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    this.buf[this.n++] = b;
  }
  all(list) {
    for (const b of list) this.add(b);
  }
  word(v) {
    this.add(v >> 8);
    this.add(v & 255);
  }
  done() {
    return this.buf.slice(0, this.n);
  }
}

// w x h planes of Y, Cb and Cr (0-255) as a 4:2:2 JPEG; qs is the sensor's quality register
function jpeg(w, h, Y, Cb, Cr, qs) {
  const scale = qs * 8;
  const quant = (base) => base.map((v) => Math.max(1, Math.min(255, Math.round((v * scale) / 100))));
  const qY = quant(QUANT_LUMA), qC = quant(QUANT_CHROMA);
  const divide = (q) => {
    const d = new Float32Array(64);
    for (let k = 0; k < 64; k++) {
      const n = ZIGZAG[k];
      d[k] = 1 / (q[k] * AAN[n >> 3] * AAN[n & 7] * 8);
    }
    return d;
  };
  const dY = divide(qY), dC = divide(qC);

  const out = new Bytes(Math.max(8192, (w * h) >> 4));
  out.all([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  out.all([0xff, 0xdb, 0, 132, 0]);
  out.all(qY);
  out.add(1);
  out.all(qC);
  out.all([0xff, 0xc0, 0, 17, 8]);
  out.word(h);
  out.word(w);
  out.all([3, 1, 0x21, 0, 2, 0x11, 1, 3, 0x11, 1]);
  for (const [id, table] of [[0x00, DC_LUMA], [0x10, AC_LUMA], [0x01, DC_CHROMA], [0x11, AC_CHROMA]]) {
    out.all([0xff, 0xc4]);
    out.word(19 + table[1].length);
    out.add(id);
    out.all(table[0]);
    out.all(table[1]);
  }
  out.all([0xff, 0xda, 0, 12, 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

  let bits = 0, held = 0;
  const put = (v, n) => {
    bits = (bits << n) | v;
    held += n;
    while (held >= 8) {
      held -= 8;
      const b = (bits >>> held) & 255;
      out.add(b);
      if (b === 255) out.add(0);
    }
    bits &= (1 << held) - 1;
  };
  const number = (table, high, v) => {
    const n = 32 - Math.clz32(v < 0 ? -v : v);
    const sym = high | n;
    put(table.code[sym], table.size[sym]);
    if (n) put(v < 0 ? v + (1 << n) - 1 : v, n);
  };
  const d = new Float32Array(64);
  const block = (div, dc, ac, last) => {
    dct(d);
    const first = Math.round(d[0] * div[0]);
    number(dc, 0, first - last);
    let zeros = 0;
    for (let k = 1; k < 64; k++) {
      const v = Math.max(-1023, Math.min(1023, Math.round(d[ZIGZAG[k]] * div[k])));
      if (!v) {
        zeros++;
        continue;
      }
      while (zeros > 15) {
        put(ac.code[0xf0], ac.size[0xf0]);
        zeros -= 16;
      }
      number(ac, zeros << 4, v);
      zeros = 0;
    }
    if (zeros) put(ac.code[0], ac.size[0]);
    return first;
  };

  let lastY = 0, lastB = 0, lastR = 0;
  const right = w - 1;
  for (let my = 0; my < h; my += 8) {
    for (let mx = 0; mx < w; mx += 16) {
      for (let half = 0; half < 16; half += 8) {
        for (let y = 0; y < 8; y++) {
          const row = Math.min(h - 1, my + y) * w;
          for (let x = 0; x < 8; x++) d[y * 8 + x] = Y[row + Math.min(right, mx + half + x)] - 128;
        }
        lastY = block(dY, HUFF.dcY, HUFF.acY, lastY);
      }
      for (const plane of [Cb, Cr]) {
        for (let y = 0; y < 8; y++) {
          const row = Math.min(h - 1, my + y) * w;
          for (let x = 0; x < 8; x++) {
            const at = mx + x * 2;
            d[y * 8 + x] = (plane[row + Math.min(right, at)] + plane[row + Math.min(right, at + 1)]) / 2 - 128;
          }
        }
        if (plane === Cb) lastB = block(dC, HUFF.dcC, HUFF.acC, lastB);
        else lastR = block(dC, HUFF.dcC, HUFF.acC, lastR);
      }
    }
  }
  if (held) put((1 << (8 - held)) - 1, 8 - held); // the last byte is filled with ones
  out.all([0xff, 0xd9]);
  return out.done();
}

// ------------------------------------------------------------------------------ the picture
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const BARS = [[255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0], [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0]];

// the sensor's image processor (its DSP): what it saw as Y, Cb, Cr, with its settings applied
function develop(frame, dsp, sensor, sde) {
  const { width: w, height: h, data } = frame;
  const Y = new Uint8ClampedArray(w * h), B = new Uint8ClampedArray(w * h), R = new Uint8ClampedArray(w * h);
  const auto = !(dsp[0xc7] & 0x40); // white balance: auto, or the gains written to 0xcc-0xce
  const gr = auto ? 1 : dsp[0xcc] / 0x5a, gb = auto ? 1 : dsp[0xce] / 0x5a;
  const fx = sde[0];
  const tone = !!(fx & 0x04);
  // 0x0a ends 6 after a contrast setting and 0 after a brightness one
  const contrast = tone && sde[10] & 2 ? sde[8] / 0x20 : 1;
  const bright = tone && !(sde[10] & 2) ? (sde[9] - 0x20) * 1.6 : 0;
  const sat = fx & 0x02 ? sde[3] / 0x48 : 1;
  const tint = !!(fx & 0x18), negative = !!(fx & 0x40);
  const flipX = !!(sensor[0x04] & 0x80), flipY = !!(sensor[0x04] & 0x40);
  const bars = !!(sensor[0x12] & 0x02);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r, g, b;
      if (bars) [r, g, b] = BARS[Math.floor((x * 8) / w)];
      else {
        const i = ((flipY ? h - 1 - y : y) * w + (flipX ? w - 1 - x : x)) * 4;
        r = clamp(data[i] * gr);
        g = data[i + 1];
        b = clamp(data[i + 2] * gb);
      }
      let l = 0.299 * r + 0.587 * g + 0.114 * b;
      let cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
      let cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
      l = (l - 128) * contrast + 128 + bright;
      cb *= sat;
      cr *= sat;
      if (tint) {
        cb = sde[5] - 128;
        cr = sde[6] - 128;
      }
      if (negative) {
        l = 255 - l;
        cb = -cb;
        cr = -cr;
      }
      const k = y * w + x;
      Y[k] = l;
      B[k] = cb + 128;
      R[k] = cr + 128;
    }
  }
  return { w, h, Y, B, R };
}

// scaled to the output size: smooth, and cropped (not squashed) when the shape differs
function scaled(src, W, H) {
  const zoom = Math.max(W / src.w, H / src.h);
  const left = (src.w - W / zoom) / 2, up = (src.h - H / zoom) / 2;
  const xi = new Int32Array(W), xj = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const p = Math.max(0, Math.min(src.w - 1, left + (x + 0.5) / zoom - 0.5));
    xi[x] = p;
    xj[x] = Math.min(src.w - 1, xi[x] + 1);
    xf[x] = p - xi[x];
  }
  const one = (from) => {
    const out = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) {
      const p = Math.max(0, Math.min(src.h - 1, up + (y + 0.5) / zoom - 0.5));
      const i = p | 0, f = p - i;
      const a = i * src.w, b = Math.min(src.h - 1, i + 1) * src.w, row = y * W;
      for (let x = 0; x < W; x++) {
        const m = xi[x], n = xj[x], g = xf[x];
        const over = from[a + m] + (from[a + n] - from[a + m]) * g;
        const under = from[b + m] + (from[b + n] - from[b + m]) * g;
        out[row + x] = over + (under - over) * f;
      }
    }
    return out;
  };
  return { Y: one(src.Y), B: one(src.B), R: one(src.R) };
}

const red = (y, r) => clamp(y + 1.402 * (r - 128));
const green = (y, b, r) => clamp(y - 0.344136 * (b - 128) - 0.714136 * (r - 128));
const blue = (y, b) => clamp(y + 1.772 * (b - 128));

function rgb565({ Y, B, R }) {
  const out = new Uint8Array(Y.length * 2);
  for (let i = 0; i < Y.length; i++) {
    const v = ((red(Y[i], R[i]) >> 3) << 11) | ((green(Y[i], B[i], R[i]) >> 2) << 5) | (blue(Y[i], B[i]) >> 3);
    out[i * 2] = v >> 8;
    out[i * 2 + 1] = v & 255;
  }
  return out;
}

function forScreen({ Y, B, R }) {
  const out = new Array(Y.length);
  for (let i = 0; i < Y.length; i++) out[i] = (red(Y[i], R[i]) << 16) | (green(Y[i], B[i], R[i]) << 8) | blue(Y[i], B[i]);
  return out;
}

// ------------------------------------------------------------------------------ the module
const FIFO_MAX = 0x5ffff; // 384 KB
const BURST = 0x3c, SINGLE = 0x3d;
// The sketch library starts each of its transactions with this, because CS going high isn't seen
// here in step with the bytes: it is how a burst that stopped half way is known to be over.
const START = [0xa5, 0x5a, 0xc5, 0x3a];

bench.device('arducam-mini-2mp', (part) => {
  const eye = part.camera('eye'), screen = part.screen('preview');
  const showing = part.params.preview !== false;
  const chip = new Uint8Array(128);
  const dsp = new Uint8Array(256), sensor = new Uint8Array(256), sde = new Uint8Array(16);
  let bank = 0, reg = 0, sdeAt = 0;
  let powered = false, now = 0, csWired = true;
  let fifo = new Uint8Array(0), at = 0, done = false, overflow = false;
  let mode = 'idle', addr = 0; // where the SPI transaction is
  let wanted = null; // a capture that was started: { since, last, count, shots }
  let last = null, shots = 0;

  function sensorReset() {
    dsp.fill(0);
    sensor.fill(0);
    sde.fill(0);
    dsp[0x44] = 0x0c; // quality
    dsp[0x5a] = 0x90; // 1600 x 1200
    dsp[0x5b] = 0x2c;
    dsp[0x5c] = 0x05;
    dsp[0xcc] = 0x5a;
    dsp[0xce] = 0x5a;
    sensor[0x0a] = 0x26; // PID
    sensor[0x0b] = 0x42; // VER
    sensor[0x1c] = 0x7f;
    sensor[0x1d] = 0xa2;
    bank = reg = sdeAt = 0;
  }
  function chipReset() {
    chip.fill(0);
    chip[0x06] = 0x05; // sensor powered and out of reset
    chip[0x40] = 0x40;
    fifo = new Uint8Array(0);
    at = 0;
    done = overflow = false;
    mode = 'idle';
    wanted = null;
  }
  sensorReset();
  chipReset();

  const standby = () => !!(chip[0x06] & 0x02);
  const outWidth = () => (dsp[0x5a] | ((dsp[0x5c] & 3) << 8)) * 4;
  const outHeight = () => (dsp[0x5b] | ((dsp[0x5c] & 4) << 6)) * 4;
  const isJpeg = () => !!(dsp[0xda] & 0x10);

  function writeSensor(r, v) {
    if (r === 0xff) bank = v & 1;
    else if (bank) {
      if (r === 0x12 && v & 0x80) {
        sensorReset();
        bank = 1; // (the bank in use stays)
      } else if (r !== 0x0a && r !== 0x0b && r !== 0x1c && r !== 0x1d) sensor[r] = v;
    } else if (r === 0x7c) sdeAt = v & 15;
    else if (r === 0x7d) {
      sde[sdeAt] = v;
      sdeAt = (sdeAt + 1) & 15;
    } else dsp[r] = v;
  }

  function start() {
    fifo = new Uint8Array(0);
    at = 0;
    done = overflow = false;
    wanted = { since: now, last: -1, count: (chip[0x01] & 7) + 1, shots: [] };
  }

  function writeChip(a, v) {
    if (a === 0x07 && v & 0x80) {
      chipReset();
      return;
    }
    if (a === 0x04) {
      if (v & 0x01) done = false;
      if (v & 0x10) at = 0;
      if (v & 0x20 && !wanted) fifo = new Uint8Array(0);
      if (v & 0x02) start();
      return;
    }
    if (a !== 0x40 && a < 0x41) chip[a] = v;
  }

  function readChip(a) {
    if (a === 0x41) return (done ? 0x08 : 0) | (Math.floor(now * 30) & 1);
    if (a === 0x42) return fifo.length & 255;
    if (a === 0x43) return (fifo.length >> 8) & 255;
    if (a === 0x44) return fifo.length >> 16;
    return chip[a];
  }

  function clocked(b) {
    if (mode === 'burst') {
      if (at < fifo.length) return fifo[at++];
      if (b === 0 || b === 0xff) return 0; // read past the end
      mode = 'idle';
    }
    if (mode === 'write') {
      mode = 'idle';
      writeChip(addr, b);
      return 0;
    }
    if (mode === 'read') {
      mode = 'idle';
      return addr === SINGLE ? (at < fifo.length ? fifo[at++] : 0) : readChip(addr);
    }
    if (b === BURST) mode = 'burst';
    else {
      addr = b & 0x7f;
      mode = b & 0x80 ? 'write' : 'read';
    }
    return 0;
  }

  function develop1(frame) {
    const W = outWidth(), H = outHeight(), asJpeg = isJpeg();
    if (W < 8 || H < 8 || W > 1600 || H > 1200) {
      part.log(`capture failed: the sensor's registers ask for ${W} x ${H} (call InitCAM() first)`);
      return new Uint8Array(0);
    }
    const base = develop(frame, dsp, sensor, sde);
    const full = scaled(base, W, H);
    let bytes;
    if (asJpeg) {
      const made = jpeg(W, H, full.Y, full.B, full.R, Math.max(2, Math.min(63, dsp[0x44])));
      // the module's count runs a little past the end marker: zeros to a multiple of 8
      bytes = new Uint8Array(Math.ceil((made.length + 1) / 8) * 8);
      bytes.set(made);
    } else bytes = rgb565(full);
    last = { W, H, kind: asJpeg ? 'JPEG' : 'RGB565', bytes: bytes.length };
    if (showing) screen.pixels(0, 0, base.w, base.h, forScreen(base));
    return bytes;
  }

  function finish() {
    const total = wanted.shots.reduce((n, s) => n + s.length, 0);
    overflow = total > FIFO_MAX;
    fifo = new Uint8Array(Math.min(FIFO_MAX, total));
    let p = 0;
    for (const s of wanted.shots) {
      const piece = s.subarray(0, fifo.length - p);
      fifo.set(piece, p);
      p += piece.length;
    }
    at = 0;
    done = true;
    shots += wanted.shots.length;
    const took = Math.round((now - wanted.since) * 1000);
    if (last) part.log(`captured ${wanted.shots.length} x ${last.W} x ${last.H} ${last.kind}: ${total} bytes in ${took} ms${overflow ? `, cut off at ${FIFO_MAX} (buffer full)` : ''}`);
    wanted = null;
  }

  return {
    step(io) {
      now = io.time;
      const on = io.supply('VCC', 'GND') >= 3;
      if (on !== powered) {
        powered = on;
        sensorReset();
        chipReset();
        screen.fill(0);
        last = null;
      }
      screen.light(powered && showing);
      csWired = io.level('CS') !== null;
      if (!powered) {
        eye.want(0);
        return;
      }
      io.draw(standby() ? 0.02 : 0.07);
      const looking = !!wanted && !standby();
      eye.want(looking ? 15 : 0);
      if (!looking) return;
      const f = eye.frame;
      // a picture taken after the capture was asked for (the sensor waits for its next frame)
      if (!f || f.time < wanted.since + 0.03 || f.time <= wanted.last) return;
      wanted.last = f.time;
      wanted.shots.push(develop1(f));
      if (wanted.shots.length < wanted.count) return;
      finish();
      eye.want(0);
    },

    i2c: {
      address: 0x30,
      write(bytes) {
        if (!powered || standby()) return false;
        if (bytes.length) reg = bytes[0];
        if (bytes.length > 1) writeSensor(reg, bytes[1]);
        return true;
      },
      read(n) {
        if (!powered || standby()) return null;
        const v = reg === 0xff ? bank : bank ? sensor[reg] : dsp[reg];
        return new Array(n).fill(v);
      },
    },

    spi: {
      transfer(bytes) {
        if (!powered) return bytes.map(() => 0xff);
        const out = new Array(bytes.length).fill(0);
        let i = 0;
        if (bytes.length >= START.length && START.every((b, k) => bytes[k] === b)) {
          mode = 'idle';
          i = START.length;
        }
        for (; i < bytes.length; i++) out[i] = clocked(bytes[i]);
        return out;
      },
    },

    status() {
      if (!powered) return ['no power (VCC 3.3-5 V and GND)'];
      if (standby()) return ['low power (GPIO PWDN is set): the sensor is off, 20 mA'];
      const lines = [`set to ${outWidth()} x ${outHeight()} ${isJpeg() ? 'JPEG' : 'RGB565'}`];
      if (!csWired) lines.push('CS is floating: wire it to the pin the sketch gives ArduCAM');
      if (wanted) lines.push('capturing...');
      else if (last) lines.push(`picture ${shots}: ${last.W} x ${last.H} ${last.kind}, ${fifo.length} bytes, ${at} read`);
      else lines.push('no picture yet (start_capture)');
      if (overflow) lines.push('too big for its 384 KB buffer: use JPEG or a smaller size');
      return lines;
    },
  };
});
