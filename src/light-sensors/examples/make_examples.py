import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)

# ---- night light
parts = [
    part('board', 'maker-board', 'Board', (-10, 0, 0), params={"usb": True}),
    part('ldr', 'light-sensors/ldr', 'Light sensor', (3, 0, -4)),
    part('meter', 'light-sensors/bh1750', 'Light meter', (3, 0, 5)),
    part('led', 'led', 'Night light', (-10, 0, 8), params={"color": "white"}),
    part('cover', 'block', 'Box (drag it over a sensor)', (12, 0, 0), params={"w": 5, "h": 3, "d": 5, "material": "cardboard", "color": "#b98b55"}),
]
ws = wires([
    ('board.3V3', 'ldr.VCC', R), ('board.GND', 'ldr.GND', K), ('board.GP2', 'ldr.DO', Y), ('board.A0', 'ldr.AO', G),
    ('board.3V3', 'meter.VCC', R), ('board.GND', 'meter.GND', K), ('board.SDA', 'meter.SDA', G), ('board.SCL', 'meter.SCL', W),
    ('board.GP15', 'led.A', Y), ('board.GND2', 'led.K', K),
])
save(H, 'night-light.bench', bench('Night light', parts, ws, {"board": source(H, 'night-light.ino')}))

# ---- colour names: the sensor face down under an arm, blocks to slide under it
parts = [
    part('board', 'maker-board', 'Board', (-14, 0, 0), params={"usb": True}),
    part('post', 'block', 'Post', (0, 0, -6), params={"w": 2, "h": 6, "d": 2, "material": "wood", "color": "#c98a4b"}, pinned=True),
    part('arm', 'block', 'Arm', (0, 6, 3), parent=('post', 'body'), params={"w": 2, "h": 1, "d": 8, "material": "wood", "color": "#c98a4b"}),
    part('tcs', 'light-sensors/tcs34725', 'Colour sensor', (0, 0, 3), (1, 0, 0, 0), ('arm', 'body')),
    part('paper', 'plate', 'White paper', (0, 0, 0), params={"w": 16, "h": 0.3, "d": 14, "material": "cardboard", "color": "#f4f4f2"}, pinned=True),
]
colours = [('red', '#d02020'), ('green', '#20a040'), ('blue', '#2050d0'), ('yellow', '#e8c820'), ('white', '#f2f2f2')]
for i, (n, c) in enumerate(colours):
    parts.append(part(f'b{n}', 'block', f'{n.title()} block', (12 + i * 5, 0, 4), params={"w": 3.5, "h": 2.5, "d": 3.5, "material": "plastic", "color": c}))
ws = wires([
    ('board.3V3', 'tcs.VIN', R, 30), ('board.GND', 'tcs.GND', K, 30), ('board.SDA', 'tcs.SDA', G, 30), ('board.SCL', 'tcs.SCL', W, 30),
])
save(H, 'colours.bench', bench('Colour names', parts, ws, {"board": source(H, 'colours.ino')}))
