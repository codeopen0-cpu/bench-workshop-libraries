// A membrane keypad: a grid of switches. Holding a key joins its row wire to its column wire
// (nothing else: no power, no chip). A board finds the key by driving one wire low at a time and
// reading which of the others follows (Keypad.h does that).
bench.device('keypad', (part) => {
  const keys = part.control('keys');
  const screen = part.screen('keys');
  const cols = screen.cols, rows = screen.rows;
  const labels = cols === 4 ? ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  let held = [];
  return {
    step(io) {
      held = keys.down;
      for (let i = 0; i < labels.length; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const down = held.includes(labels[i]);
        io.connect(`R${r + 1}`, `C${c + 1}`, down);
        screen.set(c, r, down ? 1 : 0);
      }
    },
    status() {
      return [held.length ? `holding ${held.join(' ')}` : 'no key held'];
    },
  };
});
