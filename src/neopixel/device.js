// WS2812B LEDs. A real strip takes a fast train of bits on DIN: each LED keeps the first 24 bits
// (green, red, blue) and passes the rest on to the next. Here that train arrives as one message
// ('pixels': G, R, B bytes for LED 0, 1, 2...); what's left over goes out of DOUT to the next strip.
bench.device('ws2812', (part) => {
  const screen = part.screen('leds');
  const n = screen.cols * screen.rows;
  const zigzag = !!part.params.zigzag;
  const leds = new Array(n).fill(null).map(() => [0, 0, 0]);
  let powered = false, frames = 0, amps = 0, lastLen = 0, rest = null;

  // how bright an LED looks: even a dim one glows clearly, so show low values a bit brighter
  const look = (v) => Math.round(255 * Math.pow(v / 255, 0.5));
  const draw = () => {
    for (let i = 0; i < n; i++) {
      let x = i % screen.cols, y = Math.floor(i / screen.cols);
      if (zigzag && y % 2 === 1) x = screen.cols - 1 - x;
      const [r, g, b] = powered ? leds[i] : [0, 0, 0];
      screen.set(x, y, r || g || b ? `rgb(${look(r)},${look(g)},${look(b)})` : 0);
    }
  };
  return {
    packets(list) {
      for (const p of list) {
        if (p.pin !== 'DIN' || p.proto !== 'pixels' || !powered) continue;
        const d = p.data;
        lastLen = d.length;
        for (let i = 0; i < n && i * 3 + 2 < d.length; i++) leds[i] = [d[i * 3 + 1], d[i * 3], d[i * 3 + 2]]; // (G, R, B on the wire)
        frames++;
        if (d.length > n * 3) rest = d.slice(n * 3);
      }
    },
    step(io) {
      const now = io.supply('5V', 'GND') >= 3.5;
      if (now !== powered) {
        powered = now;
        if (!now) for (const l of leds) l.fill(0); // (they forget their colours without power)
      }
      if (rest) {
        io.send('DOUT', 'pixels', rest);
        rest = null;
      }
      // each colour of each LED takes up to 20 mA at full brightness, plus about 1 mA for its chip
      let sum = 0;
      for (const [r, g, b] of leds) sum += r + g + b;
      amps = powered ? (sum / 255) * 0.02 + n * 0.001 : 0;
      io.draw(amps);
      draw();
    },
    status() {
      if (!powered) return ['no power (5V)'];
      const lit = leds.filter(([r, g, b]) => r || g || b).length;
      return [`${lit} of ${n} lit, ${frames} updates, ${(amps * 1000).toFixed(0)} mA`, ...(lastLen && lastLen < n * 3 ? [`the last update set only ${Math.floor(lastLen / 3)} LEDs`] : [])];
    },
  };
});
