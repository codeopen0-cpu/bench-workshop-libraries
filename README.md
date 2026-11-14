# Bench Workshop libraries

Libraries add parts to Bench Workshop without being part of the app: an LED matrix, an LCD, a
sensor, your own board. In the app, **Libraries** lists everything here; one click installs one.

## Making a library

A library is a folder in `src/` with:

| File | What |
|---|---|
| `library.json` | its name, version, author, and its **parts**: shape, pins, screens (data, no code) |
| `device.js` | what its parts **do** in a run (optional: a plain board needs none) |
| `sketch/*.js` | Arduino-style libraries a program can `#include` (optional) |

`node tools/check.mjs` checks it; `node tools/pack.mjs` packs it into `libraries/<id>.benchlib`
and adds it to `index.json` (on GitHub that happens by itself after a merge). A `.benchlib` file
can also be shared on its own: Libraries > Install from file.

Easiest of all: make or import your part in the app, then Libraries > Installed > **Publish**. The
app signs you in to GitHub and opens the pull request for you.

Look at `src/led-matrix-max7219` (a clocked chip, listening to every pin edge) and `src/lcd-i2c`
(an I2C chip) to start from.

### Parts (library.json)

Units are centimetres and grams. A part sits on the bench with its bottom at y = 0; x is across, z
is towards you.

- `shape`: a list of pieces: `{ "box": [w, h, d], "at": [x, y, z], "color": "#hex" }`, `cyl`
  `[radius, height]`, `sphere` radius, `header` `{ "n": 5, "dir": "x" }`, and
  `screen` `{ "id", "size": [w, d], "px": [cols, rows], "mode": "pixels" | "text", "on", "off", "bg" }`.
  Boxes, cylinders and spheres make its physical shape unless `"collide": false`.
- `pinRows`: pins on a header: `{ "ids": [...], "at": [x, y, z], "dir": "x" | "z", "kinds": {...} }`
  (kinds: `gnd`, `vin`, `vout`, `io`, `in`, `out`, `motor`, `i2c`). For a `vin` pin, `vmin`/`vmax`
  in `extra` make it burn out above its rating, as in real life.
- `shorts`: pins joined on the board: `[["GND", "GND2"]]`.
- `device`: the name its code registers (below).
- `params`/`defaults`: settings in the inspector (an I2C address, say).
- A 3D model: `"glbFile": "board.glb"` (metres, Y up, like KiCad's export) and `"glbAt": [x, y, z]`.

### What parts do (device.js)

It runs in a sealed-off thread: no network, no files, no page. It sees only its own parts' pins.

```js
bench.device('my-chip', (part) => {
  // part.name, part.params, part.screen('id'), part.log(text)
  return {
    step(io) {            // every simulation step (240 a second)
      io.supply('VCC', 'GND');   // volts between two pins
      io.level('IN');            // 1, 0, or null when nothing drives it
      io.drive('OUT', 3.3);      // drive a pin (strength: 0 pull-up/down, 1 logic, 2 power)
      io.release('OUT');
    },
    edges(events) { },    // every pin change other parts made, in order: [['CLK', 1], ['DIN', 0], ...]
    i2c: { address: 0x27, write(bytes) { return true }, read(n) { return [] } }, // on its SDA/SCL pins
    status() { return ['shown in the run inspector'] },
  };
});
```

Screens: `s.set(x, y, on)` (or a CSS colour), `s.fill(v)`, `s.print(col, row, text)`, `s.light(on)`.

### Sketch libraries (sketch/*.js)

Plain JavaScript run inside the program's thread, where the Arduino functions (`pinMode`,
`digitalWrite`, `shiftOut`, `Wire`, `delay`...) are in scope. List the classes it defines under
`classes`, so a C++-style `LedControl lc(12, 11, 10, 1);` works in Arduino programs.

## Adding yours to the list

Open a pull request adding your folder under `src/` (or use Publish in the app). Keep the id
unique and bump `version` for every change: the app offers updates when the version here is newer
than the installed one.

## Safety

Every library is checked three times: by the app before it installs anything, by
`tools/check.mjs` on every pull request (its report is on the pull request's Checks page), and by
`tools/pack.mjs` before it goes on the list. The checker (`tools/safety.mjs`) reads libraries, it
never runs them, and blocks:

- code that reaches the network, stored data, other threads or the app window
- code built at run time (`eval`, `Function`, `constructor` tricks) or hidden (minified lines,
  escaped text, encoded blobs, `atob`)
- 3D models that load anything from outside their own file
- web markup in names and descriptions, non-hex colours, oversized files

And when a library runs, its code is in a sealed-off thread with no network, no storage and no
access to the app; one that stops responding is shut down. A person still reads every pull request
before merging it: the checker's report lists the code to read.
