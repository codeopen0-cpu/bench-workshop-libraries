// Joystick: two potentiometers (the stick tilts them) and a push switch to GND.
bench.device('joystick', (part) => {
  const x = part.control('x'), y = part.control('y'), press = part.control('press');
  let v = 0;
  return {
    step(io) {
      v = io.supply('+5V', 'GND');
      const gnd = io.v('GND') ?? 0;
      if (v < 1) { io.release('VRx'); io.release('VRy'); io.connect('SW', 'GND', press.down); return; }
      // a pot's wiper: between GND and +5V
      io.drive('VRx', gnd + (v * (x.value + 100)) / 200, 1);
      io.drive('VRy', gnd + (v * (y.value + 100)) / 200, 1);
      io.connect('SW', 'GND', press.down);
      io.draw(0.0005);
    },
    status() {
      if (v < 1) return ['no power (+5V)'];
      return [`x ${x.value}, y ${y.value}${press.down ? ', pushed' : ''}`];
    },
  };
});

// Rotary encoder: two switches (CLK and DT) on a notched wheel, both open (high) at each notch. One
// click: both go low and come back high; clockwise, CLK leads and DT follows; anticlockwise, DT leads.
// (So at each change of CLK, DT different from CLK means clockwise.) The module pulls both up.
bench.device('encoder-knob', (part) => {
  const left = part.control('left'), right = part.control('right'), press = part.control('press');
  const knob = part.motor('knob');
  let clk = 1, dt = 1, queue = [], next = 0, count = 0, v = 0;
  const click = (cw) => {
    const [a, b] = cw ? ['CLK', 'DT'] : ['DT', 'CLK'];
    queue.push([a, 0], [b, 0], [a, 1], [b, 1]);
    count += cw ? 1 : -1;
  };
  return {
    step(io) {
      v = io.supply('+', 'GND');
      for (let i = right.presses(); i > 0; i--) click(true);
      for (let i = left.presses(); i > 0; i--) click(false);
      // one change at a time, as a hand turns it
      if (queue.length && io.time >= next) {
        const [pin, lv] = queue.shift();
        if (pin === 'CLK') clk = lv;
        else dt = lv;
        next = io.time + 0.025; // (each state lasts a few frames: a program reading it in loop() sees every one)
      }
      if (v >= 2.5) {
        // pulled up by the module, switched to GND by the wheel
        io.drive('CLK', clk ? v : 0, clk ? 0 : 1);
        io.drive('DT', dt ? v : 0, dt ? 0 : 1);
      } else { io.release('CLK'); io.release('DT'); }
      io.connect('SW', 'GND', press.down);
      knob.to(count * 18, 5); // (20 clicks a turn)
    },
    status() {
      return [v >= 2.5 ? `${count} clicks from the start${press.down ? ', pushed' : ''}` : 'no power (+)'];
    },
  };
});
