# Bench Workshop libraries

Libraries add parts to Bench Workshop without being part of the app: an LED matrix, an LCD, a
sensor, your own board. In the app, **Libraries** lists everything here; one click installs one.

## Making a library

**New to this? Start with [GUIDE.md](GUIDE.md)**: it builds a working part (a green 16x2 LCD with
Arduino's LiquidCrystal library) step by step, and shows how to test it. What follows is the
reference.

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
  A `screen` with `"dots": false` draws square pixels (an image) instead of LED dots.
- `camera` (in `shape`): `{ "id", "px": [w, h], "fov", "look": [x, y, z], "range" }` at `at`: its
  code gets pictures of the bench from there (`part.camera(id)`, see GUIDE.md). Parts with a camera
  need app 0.2.1 or newer: add `"needsApp": "0.2.1"` to the library.
- `pinRows`: pins on a header: `{ "ids": [...], "at": [x, y, z], "dir": "x" | "z", "kinds": {...} }`
  (kinds: `gnd`, `vin`, `vout`, `io`, `in`, `out`, `motor`, `i2c`). For a `vin` pin, `vmin`/`vmax`
  in `extra` make it burn out above its rating, as in real life, and let Check warn before it does.
  An input with a resistor on the board (EN, OE, RESET) gets `"pulled": "up"` or `"down"` in
  `extra`, so Check doesn't call it floating when it's left unwired.
- `shorts`: pins joined on the board: `[["GND", "GND2"]]`.
- `moving`: pieces that turn or slide, each with its own `shape`, `mass` and a `joint`
  (`type` turn/slide, `at`, `axis`, `motor` servo/motor/stepper/free, `torque` kg*cm or `force` N,
  `speed` rpm or cm/s, `volts`, `min`/`max`). Pins can sit on one: `"on": "shaft"`.
- `controls`: run-panel controls: `slider`, `button`, `switch`, `text`, `keys`.
- `sound: true`: it can play tones. `ranger` (in `shape`): a distance-measuring beam.
- `"touch": "id"` on a solid shape piece: it feels what presses on it. `light` (in `shape`): a
  light sensor's eye. `hear: true`: it hears the bench's sounds. `spi`: its SPI pins
  (`{ "sck", "mosi", "miso", "cs" }`). A screen's `"mode": "rgb"`: full colour (TFTs).
- Parts using `touch`, `light`, `hear`, `spi`, an rgb screen or `part.motion()` need
  `"needsApp": "0.4.0"`. See GUIDE.md, "Sensing the world".
- Parts using `moving`, `controls`, `sound` or `ranger` (or messages, below) need
  `"needsApp": "0.3.0"`. See GUIDE.md, "More a part can do".
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

Also (app 0.3.0): `part.motor(id)` (`to`, `power`, `limp`, `angle`, `speed`, `stalled`),
`part.sound()` (`tone(hz, volume, wave)`, `stop()`), `part.control(id)`, `part.ranger(id).distance`;
`io.send(pin, proto, bytes, baud)` and a `packets(list)` handler for messages along a wire (`uart`,
`pixels`, `data`, `ir`...), `io.pwm(pin)`, `io.connect(a, b, on)` to join two of its pins,
`io.draw(amps)` for the current it takes.

And (app 0.4.0): `part.motion()` (`accel`, `gyro`, `up`, `heading`, `pos`, `vel`, `speed`, `quat`),
`part.touch(id)` (`force`, `touching`, `hand`), `part.light(id).lux`, `part.hear()` (`level`, `hz`),
an `spi: { transfer(bytes, pins) { return answers } }` handler, and `s.pixels(x, y, w, h, colours)`
on an rgb screen.

### Sketch libraries (sketch/*.js)

Plain JavaScript run inside the program's thread, where the Arduino functions (`pinMode`,
`digitalWrite`, `shiftOut`, `Wire`, `delay`...) are in scope. List the classes it defines under
`classes`, so a C++-style `LedControl lc(12, 11, 10, 1);` works in Arduino programs, and constants
or functions under `exports`. `linkSend(pin, proto, bytes)` / `linkReceive(pin, proto)` send and
receive messages along a wire (an LED strip's pixels, a sensor's answer). `SPI` is there too
(`transfer`, `transfer16`, `writeBytes`), and `setRef(x, v)` / `isRef(x)` fill in variables a sketch
hands over with `&x`.

## What's on the list

Displays: LCD 16x2 and 20x4 (I2C), LCD 16x2 (parallel), LED matrix 8x8 (MAX7219), OLED (SSD1306),
4-digit (TM1637), NeoPixel LEDs, colour TFTs (ST7735, ILI9341). Sensors: colour camera,
DHT11/DHT22/BME280, line (TCRT5000), obstacle (FC-51), laser distance (VL53L0X), PIR motion, tilt
switch, compass (QMC5883L), accelerometer (ADXL345), light (LDR, BH1750), colour (TCS34725), sound
(KY-038), touch pad (TTP223), force pad (FSR), limit switch, bumper, scale (HX711), GPS (NEO-6M),
real-time clock (DS3231), RFID (RC522 and tags). Motion: steppers (28BYJ-48 + ULN2003, NEMA 17 +
A4988), TT motor with encoder, slide potentiometer, servos beyond 180 degrees (continuous FS90R
and MG996R 360, 270 and 360 degree positional, HS-785HB sail winch, STS3215 and Dynamixel XL430
smart servos). Input: keypads, joystick, rotary encoder.
Wireless: HC-05 Bluetooth, IR remote and receiver, nRF24L01 radios. Storage: SD card. Sound:
buzzers. Power and logic: relay module, 74HC595 shift register. Each comes with a ready-wired
example bench; robots to build on: a self-balancing robot, a line follower and a bumper rover.

## Adding yours to the list

Open a pull request adding your folder under `src/` (or use Publish in the app). Keep the id
unique and bump `version` for every change: the app offers updates when the version here is newer
than the installed one.

Each library has an `owner` (a GitHub account, filled in by Publish). The check on pull requests
stops changes to a library from anyone but its owner or the maintainer of this list. Updating your
own: see [GUIDE.md](GUIDE.md#7-update-it).

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
- parts beyond the app's limits (motor torque and speed, travel, controls, distance beams, touch
  surfaces, light sensors, screen size), and it tells installers which parts move, make sounds or
  hear the bench

And when a library runs, its code is in a sealed-off thread with no network, no storage and no
access to the app; one that stops responding is shut down. A person still reads every pull request
before merging it: the checker's report lists the code to read.
