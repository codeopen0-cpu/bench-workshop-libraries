// HD44780 character LCD, wired in parallel. How it works (and how this file copies it):
//  - The board puts RS (0 = command, 1 = character) and the data pins at some levels, then pulses E.
//    The LCD takes the data when E goes from HIGH to LOW. So this file listens to every pin change in
//    order (edges), keeps the level of each pin, and acts on each falling E.
//  - It starts in 8-bit mode (all of D0-D7 read at once). A "function set" command with DL = 0 puts
//    it in 4-bit mode: then each byte comes as two E pulses on D4-D7, high half first. (Sketches send
//    0x3, 0x3, 0x3, 0x2 at start-up to get there from any state; that works here too.)
//  - Characters go into its memory (DDRAM): line 1 at 0x00-0x27, line 2 at 0x40-0x67; the screen shows
//    16 of each, from the shift position.
//  - Real-life details that make or break a real one: V0 sets the contrast (near 0 V = dark text;
//    left unwired = nothing visible), RW must be LOW to write, the backlight is a separate LED (A, K).
bench.device('hd44780', (part) => {
  const screen = part.screen('text');
  const ddram = new Array(128).fill(0x20);
  let ac = 0, inc = true, displayOn = false, shift = 0, fourBit = false, half = null, cgram = false;
  let powered = false, writes = 0, contrast = 0, lit = false, rwHigh = false;
  const level = { RS: 0, RW: 0, E: 0, D0: 1, D1: 1, D2: 1, D3: 1, D4: 0, D5: 0, D6: 0, D7: 0 };

  const reset = () => {
    ddram.fill(0x20);
    ac = 0; inc = true; displayOn = false; shift = 0; fourBit = false; half = null; cgram = false;
  };
  // the HD44780's instruction set (datasheet table 6)
  const command = (c) => {
    if (c & 0x80) { ac = c & 0x7f; cgram = false; }            // set DDRAM address (setCursor)
    else if (c & 0x40) cgram = true;                           // set CGRAM address (createChar): not drawn
    else if (c & 0x20) { fourBit = !(c & 0x10); half = null; } // function set: DL bit
    else if (c & 0x10) {                                       // cursor / display shift
      if (c & 0x08) shift += c & 0x04 ? -1 : 1;
      else ac = (ac + (c & 0x04 ? 1 : -1)) & 0x7f;
    } else if (c & 0x08) displayOn = !!(c & 0x04);             // display on/off
    else if (c & 0x04) inc = !!(c & 0x02);                     // entry mode
    else if (c & 0x02) { ac = 0; shift = 0; }                  // home
    else if (c & 0x01) { ddram.fill(0x20); ac = 0; shift = 0; inc = true; } // clear
  };
  const data = (d) => {
    if (cgram) return;
    ddram[ac] = d;
    ac = (ac + (inc ? 1 : -1)) & 0x7f;
  };
  const bits = (pins) => pins.reduce((v, p, i) => v | ((level[p] ? 1 : 0) << i), 0);
  /** E fell: take what's on the data pins */
  const latch = () => {
    if (!powered || rwHigh) return;
    writes++;
    if (!fourBit) {
      const v = bits(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
      return level.RS ? data(v) : command(v);
    }
    const nibble = bits(['D4', 'D5', 'D6', 'D7']);
    if (half === null) { half = nibble; return; }
    const v = (half << 4) | nibble;
    half = null;
    level.RS ? data(v) : command(v);
  };
  const line = (start) => {
    let s = '';
    for (let c = 0; c < 16; c++) {
      const code = ddram[(start + (((c + shift) % 40) + 40) % 40) & 0x7f];
      s += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : code < 8 ? '█' : '?';
    }
    return s;
  };

  return {
    // every pin change the board made, in order: [['RS', 1], ['D4', 0], ['E', 1], ['E', 0], ...]
    edges(events) {
      for (const [pin, v] of events) {
        const wasE = level.E;
        if (pin in level) level[pin] = v;
        if (pin === 'E' && wasE && !v) latch();
      }
    },
    step(io) {
      const vdd = io.supply('VDD', 'VSS');
      const now = vdd >= 4;
      if (now !== powered) {
        powered = now;
        if (!now) reset();
      }
      // levels as the step ends (edges keep them up to date; this catches pins changed slowly)
      for (const p of Object.keys(level)) {
        const l = io.level(p);
        if (l !== null) level[p] = l;
      }
      rwHigh = io.level('RW') === 1;
      // contrast: how far V0 is below VDD (about 4 V or more = full; floating = invisible)
      const v0 = io.v('V0');
      contrast = v0 === null ? 0 : Math.max(0, Math.min(1, (vdd - v0 - 1.5) / 2.5));
      lit = io.supply('A', 'K') > 2.5;
      screen.light(powered && lit);
      const show = powered && displayOn && contrast > 0.05;
      // faint contrast: show the characters only when it's high enough to read
      screen.print(0, 0, show && contrast > 0.3 ? line(0x00) : ' '.repeat(16));
      screen.print(0, 1, show && contrast > 0.3 ? line(0x40) : ' '.repeat(16));
    },
    status() {
      if (!powered) return ['no power (VDD needs 5 V, VSS to GND)'];
      const notes = [];
      if (rwHigh) notes.push('RW is HIGH: it is in read mode and ignores writes (wire RW to GND)');
      if (contrast <= 0.3) notes.push(contrast === 0 ? 'no contrast: V0 is not wired (put it on a knob between 5 V and GND, or on GND)' : 'contrast too low to read: turn the knob towards GND');
      if (!lit) notes.push('backlight off (A to 5 V, K to GND)');
      return [`${displayOn ? 'display on' : 'display off'}, ${fourBit ? '4-bit' : '8-bit'} mode, ${writes} writes`, ...notes];
    },
  };
});
