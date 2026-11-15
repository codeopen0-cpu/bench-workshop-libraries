// Climate sensors. The DHTs talk on one wire: the board pulls it low to ask, and the sensor answers
// with 40 bits (humidity, temperature, a checksum). Here the ask and the answer are messages on that
// wire ('data'); the bytes are the real ones. The BME280 answers on I2C.

/** a DHT's 5-byte answer */
function dhtFrame(type, t, h) {
  let b;
  if (type === 11) {
    const ti = Math.round(Math.max(0, Math.min(50, t))), hi = Math.round(Math.max(20, Math.min(90, h)));
    b = [hi, 0, ti, 0];
  } else {
    const hv = Math.round(Math.max(0, Math.min(100, h)) * 10);
    const tv = Math.round(Math.abs(Math.max(-40, Math.min(80, t))) * 10);
    b = [hv >> 8, hv & 255, ((tv >> 8) & 0x7f) | (t < 0 ? 0x80 : 0), tv & 255];
  }
  return [...b, (b[0] + b[1] + b[2] + b[3]) & 255];
}

const dht = (type) => (part) => {
  const temp = part.control('temp'), hum = part.control('hum');
  let powered = false, asked = 0, answered = 0, wantAnswer = false, lastAsk = -10, tooSoon = 0;
  return {
    packets(list) {
      for (const p of list) if (p.pin === 'DATA' && p.proto === 'data' && p.data[0] === 1) wantAnswer = true;
    },
    step(io) {
      const v = io.supply('VCC', 'GND');
      powered = v >= 3;
      if (powered) io.drive('DATA', v, 0); // (the module's pull-up)
      else io.release('DATA');
      if (wantAnswer) {
        wantAnswer = false;
        asked++;
        // read more often than it can measure: a real one gives its last reading (or nothing)
        if (io.time - lastAsk < (type === 11 ? 1 : 2)) tooSoon++;
        lastAsk = io.time;
        if (powered) {
          io.send('DATA', 'data', dhtFrame(type, temp.value, hum.value));
          answered++;
        }
      }
      io.draw(powered ? (asked ? 0.0015 : 0.00005) : 0);
    },
    status() {
      if (!powered) return ['no power (VCC needs 3.3-5 V)'];
      return [`${temp.value.toFixed(type === 11 ? 0 : 1)} C, ${hum.value.toFixed(type === 11 ? 0 : 1)} %`, `asked ${asked} times${tooSoon ? ` (${tooSoon} too soon after the last)` : ''}`];
    },
  };
};
bench.device('dht11', dht(11));
bench.device('dht22', dht(22));

// BME280 (simplified registers, as the included Adafruit_BME280.h reads them):
//   0xD0 chip id = 0x60; 0xF7-0xF9 pressure (Pa, 24 bits); 0xFA-0xFB temperature (hundredths of
//   a degree, signed 16 bits); 0xFC-0xFD humidity (hundredths of a percent)
bench.device('bme280', (part) => {
  const temp = part.control('temp'), hum = part.control('hum'), pres = part.control('pres');
  const addr = Number(part.params.addr ?? 0x76);
  let powered = false, reg = 0, reads = 0;
  const regs = () => {
    const r = new Array(256).fill(0);
    r[0xd0] = 0x60;
    const p = Math.round(pres.value * 100), t = Math.round(temp.value * 100) & 0xffff, h = Math.round(hum.value * 100);
    r[0xf7] = (p >> 16) & 255; r[0xf8] = (p >> 8) & 255; r[0xf9] = p & 255;
    r[0xfa] = t >> 8; r[0xfb] = t & 255;
    r[0xfc] = h >> 8; r[0xfd] = h & 255;
    return r;
  };
  return {
    i2c: {
      address: () => (powered ? addr : -1),
      write(bytes) { if (bytes.length) reg = bytes[0]; return true; },
      read(n) {
        reads++;
        const r = regs();
        const out = [];
        for (let i = 0; i < n; i++) out.push(r[(reg + i) & 255]);
        return out;
      },
    },
    step(io) {
      powered = io.supply('VIN', 'GND') >= 1.7;
      io.draw(powered ? 0.0004 : 0);
    },
    status() {
      if (!powered) return ['no power'];
      return [`${temp.value.toFixed(1)} C, ${hum.value.toFixed(1)} %, ${pres.value.toFixed(1)} hPa`, `I2C 0x${addr.toString(16)}, ${reads} reads`];
    },
  };
});
