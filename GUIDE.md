# Make your own part

This guide builds a real part from nothing to working: a **16x2 character LCD with green text**,
wired in parallel, driven by Arduino's own **LiquidCrystal** library. It's the `lcd-parallel`
library in `src/` here, so every step points at code you can open, change and run.

By the end you'll know how to make any part that *does* something: a display, a sensor, a chip,
a board, and how to test it before anyone else uses it.

## What a part is made of

A part lives in a **library**: a folder with up to four kinds of files.

| File | What it is | The LCD's |
|---|---|---|
| `library.json` | what it **looks like** and where its **pins** are: data, no code | the green board, the black bezel, the screen, 16 pins |
| `device.js` | what it **does** while running: reads its pins, drives pins, draws on its screen | an HD44780 controller |
| `sketch/*.js` | the **Arduino library** a program `#include`s to talk to it | `LiquidCrystal.h` |
| `examples/*.bench` | a ready-wired **test bench** | "Hello, LCD" |

Only `library.json` is required. A plain board (just pins and copper) needs nothing else; the app's
**Import KiCad board** and **Make a part** make those for you.

## 1. Start a folder

Make a folder named after your library's id (lowercase, dashes), with a `library.json`:

```json
{
  "format": "bench-library",
  "formatVersion": 1,
  "id": "lcd-parallel",
  "name": "LCD 16x2 green (parallel, LiquidCrystal)",
  "version": "1.0.0",
  "author": "your name",
  "description": "What it is, in a sentence or two.",
  "category": "Displays",
  "parts": []
}
```

In the app: **Libraries > Install from folder...** and pick the folder. From now on, after every
change press **Reload** next to it (Libraries > Installed). No packing, no restart.

## 2. Its shape and pins

A part is described in centimetres, sitting on the bench with its bottom at y = 0 (x across, z
towards you). The LCD, from `src/lcd-parallel/library.json`:

```json
"shape": [
  { "box": [8.0, 0.16, 3.6], "at": [0, 0.08, 0], "color": "#1d6b3a" },
  { "box": [7.1, 0.7, 2.4], "at": [0, 0.51, 0.1], "color": "#1a1a1c" },
  { "screen": { "id": "text", "size": [6.4, 1.45], "px": [16, 2], "mode": "text",
                "on": "#6dff7a", "off": "#04100a", "bg": "#0c2414" }, "at": [0, 0.862, 0.1] }
]
```

- **Boxes, cylinders, spheres** make the look and the physical shape (what it bumps into). Add
  `"collide": false` to a decoration.
- A **screen** is a flat panel the part's code draws on. `"mode": "text"` is a grid of characters
  (`px` = columns, rows); `"mode": "pixels"` is a grid of dots (the 8x8 LED matrix uses 8 x 8).
  `on` is the text or lit-dot colour, `bg` the panel when lit, `off` when it's dark.
- Have a 3D model? `"glbFile": "models/lcd.glb"` (metres, Y up: KiCad's or Blender's glTF export)
  replaces the boxes' look.

Pins go in rows along a header:

```json
"pinRows": [{
  "ids": ["VSS", "VDD", "V0", "RS", "RW", "E", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "A", "K"],
  "at": [-3.2, 0.16, -1.55],
  "kinds": { "VSS": "gnd", "VDD": "vin", "RS": "in", "E": "in", "K": "gnd" },
  "extra": { "VDD": { "label": "VDD (5 V)", "vmin": 4.5, "vmax": 5.5 }, "D0": { "pulled": "up" } }
}]
```

Pin **kinds** matter: they colour the pin, and they're what **Check** uses to find mistakes
(`gnd`, `vin` = power in, `vout` = power out, `in`/`out` = signals, `io` = either, `i2c`, `motor`).
`vmin`/`vmax` on a power pin make Check warn about the wrong supply, and the part burns out above
`vmax` while running, as a real one would. `"pulled": "up"` (or down) marks an input that has a
resistor on the board, so leaving it unwired isn't a mistake.

Give the part `"device": "hd44780"` to connect it to its code (next step). Reload, put it on the
bench, wire it up, press **Check**.

## 3. What it does: device.js

`device.js` runs in a sealed-off thread (no network, no files: see Safety). It registers a
**device** by name and returns what the part does:

```js
bench.device('hd44780', (part) => {
  const screen = part.screen('text');       // the screen from library.json
  return {
    step(io) { /* every simulation step, 240 times a second */ },
    edges(events) { /* every pin change since the last step, in order */ },
    status() { return ['shown in the run panel'] },
  };
});
```

**`step(io)`** is where most parts live. Read your pins, decide, drive pins:

| | |
|---|---|
| `io.supply('VDD', 'VSS')` | volts between two of your pins (your power) |
| `io.level('RS')` | 1, 0, or `null` when nothing drives the pin (floating) |
| `io.v('V0')` | the pin's voltage, or `null` |
| `io.drive('OUT', 3.3)` | drive a pin (a third argument sets strength: 0 pull-up/down, 1 logic, 2 power) |
| `io.release('OUT')` | stop driving it |
| `io.time` | simulation time, seconds |

The LCD's power and contrast, from its `step`:

```js
const vdd = io.supply('VDD', 'VSS');
powered = vdd >= 4;
const v0 = io.v('V0');                                   // the contrast pin
contrast = v0 === null ? 0 : Math.max(0, Math.min(1, (vdd - v0 - 1.5) / 2.5));
screen.light(powered && io.supply('A', 'K') > 2.5);      // the backlight is its own LED
```

So, as with the real LCD: no V0 wire, no text, and the run panel says why. Model the things that
catch people out on a real bench; that's what makes the simulation worth testing in.

**`edges(events)`** is for parts clocked faster than a step. A program can wiggle a pin
thousands of times between two steps (the LCD's E pin pulses twice per character), so each pin
change arrives in order: `[['RS', 1], ['D4', 0], ['E', 1], ['E', 0], ...]`. The LCD keeps every
pin's level and acts the moment E falls, exactly as the chip does:

```js
edges(events) {
  for (const [pin, v] of events) {
    const wasE = level.E;
    level[pin] = v;
    if (pin === 'E' && wasE && !v) latch();   // E fell: take RS and D4-D7
  }
}
```

The **8x8 LED matrix** works the same way. Its MAX7219 shifts one bit in on each rising CLK edge
(DIN's level at that moment), and when CS (LOAD) rises it takes the last 16 bits: a register
number and a value. Registers 1-8 are the rows; each bit lights one dot through
`screen.set(column, row, colour)`. The **I2C LCD** doesn't need edges at all: it gives an `i2c` answer
instead, and the bus delivers whole bytes:

```js
i2c: { address: 0x27, write(bytes) { /* ... */ return true }, read(n) { return [...] } },
```

(The part needs pins called `SDA` and `SCL` for that.)

**Screens:** `screen.print(col, row, text)` and `screen.fill(' ')` for text screens;
`screen.set(x, y, on)` (or a CSS colour), `screen.fill(0)` for pixel screens;
`screen.light(on)` for the backlight. Only what changed is redrawn, so draw every step if you like.

**Status:** whatever `status()` returns shows under the part in the run panel. Use it to say what
the part is doing *and what's wrong*: "contrast too low to read: turn the knob towards GND".
`part.log('...')` writes to the developer console (Ctrl+Shift+I) for your own debugging.
`part.params` are the settings from the inspector (an I2C address, say).

## 4. The Arduino library: sketch/*.js

People will program your part with the library they'd use on real hardware, so give them the same
one: same class name, same constructor, same functions. In `library.json`:

```json
"sketch": { "LiquidCrystal.h": { "classes": ["LiquidCrystal"], "file": "sketch/LiquidCrystal.js" } }
```

Now `#include <LiquidCrystal.h>` in a sketch loads `sketch/LiquidCrystal.js`, and listing the class
lets the C++-style declaration work: `LiquidCrystal lcd(12, 11, 5, 4, 3, 2);`.

The file is JavaScript, run inside the program's thread, where the Arduino functions are in scope:
`pinMode`, `digitalWrite`, `digitalRead`, `shiftOut`, `delay`, `Wire`, `Serial`, `HIGH`/`LOW`/`OUTPUT`.
Port the real library function by function. LiquidCrystal's `send` is the real one, line for line:

```js
send(value, rs) {
  digitalWrite(this.rs, rs);
  this.bits(value >> 4, 4);      // high half, then low half (4-bit mode)
  this.bits(value & 0x0f, 4);
}
bits(value, n) {
  for (let i = 0; i < n; i++) digitalWrite(this.data[i], (value >> i) & 1);
  digitalWrite(this.en, HIGH);   // pulse E: the LCD reads the pins as it falls
  digitalWrite(this.en, LOW);
}
```

Because it talks to your part only through its pins (or Wire for I2C), the same `device.js` also works
with real firmware on the RP2040 board, and with any other library someone writes for it.

Tips: C++ `int x = a / b` drops the fraction; in JS write `Math.trunc(a / b)`. Leave out
microsecond waits that only exist for real silicon (the sim doesn't need them), but keep the ones
a program would notice (`clear()` takes 2 ms).

## 5. Test it

Make a **test bench**: wire the part to a board the way the datasheet or a tutorial says, with a
short sketch, and save it (**Save**) into the folder as `examples/hello-lcd.bench`. Then in
`library.json`:

```json
"examples": [{ "name": "Hello, LCD (LiquidCrystal)", "description": "...", "file": "examples/hello-lcd.bench" }]
```

Everyone who installs the library gets **Open example** for it in the Libraries window, so it's
also how people learn to use your part.

The loop: change a file, **Reload**, **Open example**, **Run**, look at the part and its status line,
open the board's **Serial / program** monitor. Then try to break it on purpose, the way people
will by accident:

- no power, or the wrong voltage: does Check warn, does the part say "no power"?
- a pin left unwired (the LCD's V0, its RW wired HIGH): does the status say what's wrong?
- the wiring swapped (D4 with D7): it should misbehave the way the real one does, not crash
- two of them on one bus or one board: do they stay separate?
- the Arduino library's other functions (`setCursor`, `scrollDisplayLeft`, `createChar`...)

## 6. Share it

- **Save as file** (Libraries > Installed) gives a `.benchlib` anyone can install with
  **Install from file**.
- **Publish...** sends it to this list as a pull request: the app signs you in to GitHub and does
  the rest. Bump `version` for every change (`1.0.0` > `1.0.1`), or people won't get the update.

## Safety

Every library is checked before it's installed, when it's published, on every pull request here,
and before it goes on the list (`tools/safety.mjs`). `device.js` and `sketch/*.js` may not reach the
network, stored data, other threads or the app window, build code at run time (`eval`,
`Function`, `constructor` tricks) or hide what they do (minified lines, escaped or encoded text);
3D models may not load anything from outside their own file. Write plain, readable code: a person
reads every pull request before it's merged. And a part that freezes (an endless loop in `step`) is
stopped after 3 seconds, so keep `step` quick and let time pass between calls.

The full reference for every field is in [README.md](README.md).
