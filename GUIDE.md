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

### A part that sees: cameras

A part can have a **camera**: the app renders the bench from where it sits, and its code gets the
pictures. The colour-tracking camera (`src/color-camera`) is a working example: it finds a colour
and reports where it is over I2C, and a rover in its test bench drives itself to a red ball.

In `library.json`, put the camera where its lens is:

```json
{ "camera": { "id": "eye", "px": [80, 60], "fov": 55, "look": [1, 0, 0], "range": 600 }, "at": [1.05, 1.6, 0] }
```

`px` is the picture size (160 x 120 at most: small is faster, and plenty for most jobs), `fov` the
angle it sees top to bottom, `look` which way it faces in the part's frame (here +x, out of the
lens), `range` how far it sees (cm). It's invisible: draw the lens with a cylinder.

In `device.js`:

```js
const eye = part.camera('eye');
eye.want(15);                        // pictures, 15 a second (the most; 0 stops them)
// ... then in step(io):
const f = eye.frame;                 // the newest picture, or null before the first
if (f && f.time !== lastTime) {      // a new one
  lastTime = f.time;
  const [r, g, b] = f.get(40, 30);   // the pixel in the middle (0-255 each)
  // f.data holds them all: RGBA, top row first, f.width x f.height
}
```

Ask for pictures only while the part has power (`want(0)` otherwise): each one costs a render.
Turning the pictures into something a board can use is your part's job, like a real camera
module's chip: find a colour, a line on the floor, a bright light, motion... and report it on pins,
I2C or Wi-Fi. A screen with `"dots": false` shows square pixels, good for showing what it sees
(the colour camera draws its view on its back, with a cross on what it found).

A camera's code needs Bench Workshop 0.2.1 or newer: say so with `"needsApp": "0.2.1"` in
`library.json`, and an older app asks people to update instead of failing.

One thing real camera robots teach fast: **the camera is slow compared to the motors**. 15
pictures a second means a rover turning fast moves 15 degrees between two looks and overshoots.
The test bench's sketch turns slower as the target nears the middle, and drives slower as it
gets close. Test your part with something that moves.

### More a part can do (app 0.3.0 and newer)

Any of these needs `"needsApp": "0.3.0"` in `library.json` (the checker asks for it). Every library
in this list's `src/` uses one or more of them: read them as worked examples.

**Pieces that move** (`src/stepper-motors`, `src/encoder-motor`): a shaft, a horn, a slider, a
knob. Each is its own body, joined to the part's main body:

```json
"moving": [{
  "id": "shaft", "mass": 3,
  "shape": [{ "cyl": [0.25, 0.6], "at": [0.8, 2.6, 0], "color": "#d8b04a" }],
  "joint": { "type": "turn", "at": [0.8, 2.4, 0], "axis": [0, 1, 0], "motor": "stepper", "torque": 0.34, "speed": 16, "volts": 5 }
}]
```

`type` is `turn` (about `axis`) or `slide` (along it). `motor`: `servo` (goes to an angle within
`min`/`max` degrees), `motor` (spins with a power), `stepper` (goes to an angle any number of turns
away, and skips steps when overloaded, as a real one does), `free` (no motor: a hinge, an axle; its
`torque` is the friction). `torque` is in kg*cm at `volts` (a slide's push is `force`, newtons),
`speed` in rpm (a slide's in cm/s). Other parts can be glued to a moving piece by its id, and pins
can sit on one: `"on": "shaft"`. In `device.js`:

```js
const shaft = part.motor('shaft');
shaft.to(90, volts);       // servo / stepper / slide: go to 90 deg (or cm), with the volts it gets
shaft.power(-0.5, volts);  // motor: half power backwards
shaft.limp();              // no power: it turns freely
shaft.angle; shaft.speed; shaft.stalled;   // where it is (deg or cm), how fast, and if it's stuck
```

The app holds it to what `library.json` says: your code can't make it stronger or faster than
its `torque` and `speed`, and gets less torque from fewer volts. Pass the volts your part really
gets (`io.supply('+', '-')`), so a flat battery makes a weak motor.

**Sounds** (`src/buzzers`, the relay's click): `"sound": true` on the part, then
`const snd = part.sound(); snd.tone(440, 0.5, 'square'); snd.stop();`. Tones only (20 Hz-12 kHz,
`square`, `sine`, `triangle` or `sawtooth`), quiet by design; the toolbar's **Sound** button turns
them all off. `io.pwm('+')` gives `{ hz, duty }` when a board's `tone()` drives a pin.

**Controls in the run panel** (`src/keypad`, `src/climate-sensors`, `src/joystick-encoder`): for
what a person does to the part, or what the world around it is like:

```json
"controls": [
  { "id": "temp", "kind": "slider", "label": "Temperature (C)", "min": -40, "max": 80, "step": 0.1, "value": 22 },
  { "id": "press", "kind": "button", "label": "Push" },
  { "id": "keys", "kind": "keys", "label": "Keys", "cols": 4, "keys": ["1", "2", "3", "A"] }
]
```

Kinds: `slider` (`.value`), `button` (`.down`, `.presses()`), `switch` (`.on`), `text` (a text
box: `.take()` gives the lines sent), `keys` (a grid of buttons: `.down` lists the held ones,
`.take()` the pressed ones in order). Read them with `part.control('temp')`.

**Distance sensors** (`src/ir-sensors`): a beam in its shape,
`{ "ranger": { "id": "beam", "look": [1, 0, 0], "max": 200 }, "at": [0.7, 0.26, 0] }`, and
`part.ranger('beam').distance` is how far (cm) the first thing along it is, or `null`.

**Joining its own pins** (`src/keypad`, `src/relay-module`): `io.connect('COM', 'NO', true)` joins
two of its pins as a wire would (a pressed key, a relay's contact); `false` parts them.

**Messages along a wire** (`src/neopixel`, `src/bluetooth-hc05`, `src/climate-sensors`,
`src/ir-remote`): some signals are far faster than the simulation's steps (a serial port's bits,
an LED strip's 800 kHz train, a DHT's 40 bits in 4 ms). Those travel as messages on the wire:
`io.send('TX', 'uart', bytes, 9600)` sends one to every part on that pin's wire, and the device's
`packets(list)` gets the ones that arrive: `[{ pin, proto, data, baud }]`. Kinds: `uart` (serial
bytes, with their baud: boards' `Serial1`, `Serial2` and `SoftwareSerial` speak it),
`pixels`, `data`, `ir`, `onewire`, `raw`. In a sketch library, `linkSend(pin, 'pixels', bytes)` and
`linkReceive(pin, 'data')` do the same from the board's side. Keep the bytes the real ones (a
DHT22's real 5-byte frame, a strip's GRB order), so the part teaches what the hardware does.

**Power it uses:** `io.draw(0.12)` says it takes 120 mA now; batteries drain and sag by it, and
a power meter on its supply shows it.

**Pull-ups:** a pin marked `"pulled": "up"` (or `"down"`) gets that resistor from the very first
step, to the part's own supply: an encoder's or a DHT's line reads high even before its code runs.

### Sensing the world (app 0.4.0 and newer)

These need `"needsApp": "0.4.0"`. Each reads the real physics of the run, so people can test a part
by picking things up and moving them (drag a part to carry it; Shift pushes with a small ball).

**How it moves** (`src/motion-sensors`, `src/gps-neo6m`): `part.motion()` gives `accel` [x, y, z] in
g (a still part feels 1 g up), `gyro` [x, y, z] in deg/s, `up` (which way is up, in its own frame),
`heading` (0 north, 90 east: the way its +x side faces; north is -z on the bench), `pos` [x, y, z]
cm, `vel`, `speed` and `quat` (its orientation). Glue the part onto something and it feels that.

**What touches it** (`src/touch-and-force`): mark a solid piece of its shape `"touch": "pad"`, and
`part.touch('pad')` gives `force` (newtons pressing on it: a 100 g weight is about 1 N), `touching`
and `hand` (the pushing ball touches it: a finger). A scale, a bumper, a touch button, a limit switch.

**Light** (`src/light-sensors`): `{ "light": { "id": "eye", "look": [0, 1, 0], "fov": 120 } }` in
its shape, and `part.light('eye').lux`: the room's light (the toolbar's Room button), shaded by
whatever is over it, plus lit LEDs and screens it can see. A colour sensor uses a small camera
instead (`src/light-sensors`, the TCS34725); a camera with a range of 20 cm or less lights what it
looks at, like the LED on a line or colour sensor.

**Sound** (`src/buzzers`, the sound sensor): `"hear": true` on the part, and `part.hear()` gives
`level` (0..1; closer is louder) and `hz` (the loudest tone) of what parts on the bench play.

**SPI** (`src/rfid-rc522`, `src/nrf24-radio`, `src/tft-displays`, `src/sd-card`): name its SPI pins
in `library.json`, `"spi": { "sck": "SCK", "mosi": "MOSI", "miso": "MISO", "cs": "CS" }`, and give
the device an `spi` handler:

```js
spi: {
  // the bytes a board clocked out while this part's CS was LOW; return what it answers on MISO
  // (one byte for each). pins: the levels of its pins at that moment ({ DC: 1, ... }: a screen's
  // command / data pin)
  transfer(bytes, pins) { return bytes.map(() => 0); },
},
```

A board's `SPI.transfer(...)` waits for that answer; `SPI.writeBytes(...)` doesn't (fast: a screen's
pixels). Only the part whose CS is LOW gets the bytes; two at once is reported as a clash.

**Multi-turn servos** (`src/servos`, app 0.4.3): a moving piece with `"motor": "servo"` and
`"multiturn": true` goes to any angle, any number of turns away (`part.motor('horn').to(1260)` is
three and a half turns), and never loses its place: a winch, a smart servo. Overloaded, it stalls
and keeps trying, as a servo does.

**Big colour screens** (`src/tft-displays`): a screen with `"mode": "rgb"` (up to 320 x 320) takes
a colour number per pixel (`s.set(x, y, 0xff8800)`), and `s.pixels(x, y, w, h, colours)` sets a block
at once. It shows 30 pictures a second at most.

## 4. The Arduino library: sketch/*.js

People will program your part with the library they'd use on real hardware, so give them the same
one: same class name, same constructor, same functions. In `library.json`:

```json
"sketch": { "LiquidCrystal.h": { "classes": ["LiquidCrystal"], "file": "sketch/LiquidCrystal.js" } }
```

Now `#include <LiquidCrystal.h>` in a sketch loads `sketch/LiquidCrystal.js`, and listing the class
lets the C++-style declaration work: `LiquidCrystal lcd(12, 11, 5, 4, 3, 2);`. Constants and plain
functions a sketch uses go in `"exports"`: `"exports": ["NEO_GRB", "makeKeymap"]`. Libraries
included as `.hpp` (`IRremote.hpp`) are listed by that name.

If programs test the real header's macros with `#if` (`#if defined (OV2640_MINI_2MP)`), list those
(app 0.15.1 and newer): `"defines": { "OV2640_MINI_2MP": 1 }`.

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

Out-parameters: when a sketch hands over a variable, `radio.read(&value, sizeof(value))` or
`sensor.getRawData(&r, &g, &b, &c)`, your function gets that variable itself: `setRef(r, 120)` sets
it (`isRef(x)` says whether it's one; `x.type` is `'f'` float, `'i'` int, `'u'` unsigned, `'s'` a
char array, and `x.size` its bytes). Objects and arrays arrive as themselves. `sizeof(x)` of a
variable the sketch declared is its real size (int 2, long and float 4, as on an UNO).

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

## 7. Update it

Found a bug, or want to add a function? Updating is the same loop, plus a version number:

1. **Get your working folder.** If you made it, you have it. If you only have the installed
   library: Libraries > Installed > **Save as file**, then `node tools/unpack.mjs mylib.benchlib`
   turns the `.benchlib` back into its folder (or download `src/<your-id>/` from this repo).
2. **Change it and test it:** Install from folder (once), then after each change **Reload**,
   **Open example**, **Run**.
3. **Raise the version** in `library.json`. Use the last number for fixes (1.0.0 > 1.0.1), the middle
   one for new things (1.0.1 > 1.1.0), the first for changes that break benches people already
   built (1.1.0 > 2.0.0). **Publish...** suggests the next number for you.
4. **Publish...** again. It opens a new pull request with just your changes; the check runs, and once
   it's merged everyone sees **Update to 1.0.1** in Libraries > Browse, and the app tells them at
   start-up that an update is there.

Things that keep other people's benches working:

- **Don't rename part ids or pin names.** A bench stores which part and which pin each wire goes
  to; renamed, those wires disappear. Need a different part? Add it next to the old one.
- **Keep the Arduino library's functions** (add new ones freely), so sketches still compile.
- A library belongs to whoever first published it: its `owner` (the app fills it in from your
  GitHub sign-in). Only the owner, or the maintainer of this list, can change it: anyone else's pull
  request is stopped by the check. Want to build on someone else's library? Publish your copy under a
  new `id`, and say where it came from in the description.

## Safety

Every library is checked before it's installed, when it's published, on every pull request here,
and before it goes on the list (`tools/safety.mjs`). `device.js` and `sketch/*.js` may not reach the
network, stored data, other threads or the app window, build code at run time (`eval`,
`Function`, `constructor` tricks) or hide what they do (minified lines, escaped or encoded text);
3D models may not load anything from outside their own file. Write plain, readable code: a person
reads every pull request before it's merged. And a part that freezes (an endless loop in `step`) is
stopped after 3 seconds, so keep `step` quick and let time pass between calls.

Parts that move, sound or have controls stay within limits the app enforces while running and the
checker checks before installing: at most 8 moving pieces a part, 300 kg*cm, 2000 N, 30000 rpm
(500 cm/s sliding, 100 cm of travel); tones only, volume-capped, muted by the Sound button and
silent while paused; 32 controls with plain-text labels; 4 distance beams of up to 10 m; messages
of up to 4096 bytes, 64 a step; 8 touch surfaces and 4 light sensors a part; colour screens of up to
320 x 320. Whoever installs a library is told which of its parts move, make sounds, or hear the
bench (no part hears a real microphone: only the sounds parts on the bench play).

The full reference for every field is in [README.md](README.md).
