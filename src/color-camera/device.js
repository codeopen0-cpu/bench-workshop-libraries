// A colour-tracking camera: it looks at the bench through its "eye" camera, finds the pixels of the
// colour it's tracking, and reports where they are over I2C, like a Pixy or HuskyLens.
//
// How it sees: part.camera('eye') gives pictures (80 x 60 RGBA) of the bench from its lens, 15 a
// second. For each picture: every pixel whose hue is close to the target's (and that is colourful and
// bright enough to tell) counts as "found"; their middle is the target's position.
//
// I2C (address 0x54): write [0x00] then read 6 bytes: found (0/1), x (0-255, left to right),
// y (0-255, top to bottom), width, height (0-255), size (how much of the picture it fills, 0-255).
// Write [0x10, r, g, b] to track another colour.
bench.device('blobcam', (part) => {
  const eye = part.camera('eye');
  const view = part.screen('view');
  const addr = Number(part.params.addr ?? 0x54);
  let powered = false, pointer = 0, frames = 0, lastFrame = -1;
  let target = hsv(255, 0, 0); // red to start with
  const found = { yes: 0, x: 128, y: 128, w: 0, h: 0, size: 0 };

  function hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx / 255 };
  }
  const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

  /** look at a new picture: where is the colour? and draw it on the back screen */
  function analyse(f) {
    let n = 0, sx = 0, sy = 0, x0 = f.width, y0 = f.height, x1 = -1, y1 = -1;
    const hit = new Uint8Array(f.width * f.height);
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        const i = (y * f.width + x) * 4;
        const c = hsv(f.data[i], f.data[i + 1], f.data[i + 2]);
        if (c.s > 0.45 && c.v > 0.2 && hueGap(c.h, target.h) < 22) {
          hit[y * f.width + x] = 1;
          n++; sx += x; sy += y;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    const min = Math.max(3, (f.width * f.height) / 1500); // a few pixels of noise isn't a find
    found.yes = n >= min ? 1 : 0;
    if (found.yes) {
      found.x = Math.round(((sx / n) / (f.width - 1)) * 255);
      found.y = Math.round(((sy / n) / (f.height - 1)) * 255);
      found.w = Math.round(((x1 - x0 + 1) / f.width) * 255);
      found.h = Math.round(((y1 - y0 + 1) / f.height) * 255);
      found.size = Math.min(255, Math.round((n / (f.width * f.height)) * 255 * 4));
    } else found.size = 0;
    // the back screen: what it sees (32 x 24), what it found brighter, and a cross on the target
    const cx = found.yes ? Math.round((found.x / 255) * (view.cols - 1)) : -1, cy = found.yes ? Math.round((found.y / 255) * (view.rows - 1)) : -1;
    for (let sy2 = 0; sy2 < view.rows; sy2++)
      for (let sx2 = 0; sx2 < view.cols; sx2++) {
        const px = Math.floor(((sx2 + 0.5) / view.cols) * f.width), py = Math.floor(((sy2 + 0.5) / view.rows) * f.height);
        const [r, g, b] = f.get(px, py);
        const isHit = hit[py * f.width + px];
        const k = isHit ? 1 : 0.55;
        let col = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
        if ((sx2 === cx && Math.abs(sy2 - cy) <= 2) || (sy2 === cy && Math.abs(sx2 - cx) <= 2)) col = '#ffffff';
        view.set(sx2, sy2, col);
      }
  }

  return {
    i2c: {
      address: () => (powered ? addr : -1),
      write(bytes) {
        if (!bytes.length) return true;
        pointer = bytes[0];
        if (bytes[0] === 0x10 && bytes.length >= 4) {
          target = hsv(bytes[1], bytes[2], bytes[3]);
          part.log(`tracking hue ${Math.round(target.h)}`);
        }
        return true;
      },
      read(n) {
        const regs = [found.yes, found.x, found.y, found.w, found.h, found.size];
        const out = [];
        for (let i = 0; i < n; i++) out.push(regs[pointer + i] ?? 0);
        return out;
      },
    },
    step(io) {
      const now = io.supply('VCC', 'GND') >= 3.0;
      if (now !== powered) {
        powered = now;
        eye.want(powered ? 15 : 0); // pictures only while it has power (15 a second: the most a camera gets)
        view.light(powered);
        if (!powered) view.fill(0);
      }
      const f = eye.frame;
      if (powered && f && f.time !== lastFrame) {
        lastFrame = f.time;
        frames++;
        analyse(f);
      }
    },
    status() {
      if (!powered) return ['no power (VCC 3.3-5 V)'];
      if (!frames) return ['starting its camera...'];
      return [found.yes ? `sees it at x ${found.x}, y ${found.y} (filling ${Math.round((found.size / 255) * 25)}% of the view)` : 'nothing of that colour in view', `${frames} pictures`];
    },
  };
});
