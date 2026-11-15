import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)

# ---- kitchen scale
parts = [
    part('board', 'maker-board', 'Board', (-14, 0, 0), params={"usb": True}),
    part('scale', 'touch-and-force/scale', 'Scale', (4, 0, 0)),
    part('w100', 'block', '100 g weight', (-4, 0, 12), params={"w": 2.6, "h": 2, "d": 2.45, "material": "steel", "color": "#9aa3ad"}),
    part('w250', 'block', '250 g weight', (2, 0, 13), params={"w": 3.4, "h": 3, "d": 3.13, "material": "steel", "color": "#7f8893"}),
    part('apple', 'ball', 'Apple', (9, 0, 13), params={"r": 3.4, "material": "wood", "color": "#c8312b"}),
]
ws = wires([
    ('board.3V3', 'scale.VCC', R), ('board.GND', 'scale.GND', K),
    ('board.GP2', 'scale.DT', Y), ('board.GP3', 'scale.SCK', B),
])
save(H, 'scale.bench', bench('Kitchen scale', parts, ws, {"board": source(H, 'scale.ino')}))

# ---- touch lamp and dimmer
parts = [
    part('board', 'maker-board', 'Board', (-10, 0, 0), params={"usb": True}),
    part('pad', 'touch-and-force/ttp223', 'Touch pad', (2, 0, -6), pinned=True),
    part('pot', 'touch-and-force/slide-pot', 'Dimmer', (6, 0, 2), pinned=True),
    part('fsr', 'touch-and-force/fsr', 'Force pad', (2, 0, 9), pinned=True),
    part('led', 'led', 'Lamp', (-10, 0, 8), params={"color": "yellow"}),
]
ws = wires([
    ('board.3V3', 'pad.VCC', R), ('board.GND', 'pad.GND', K), ('board.GP2', 'pad.SIG', Y),
    ('board.3V3', 'pot.VCC', R), ('board.GND', 'pot.GND', K), ('board.A0', 'pot.W', G),
    ('board.3V3', 'fsr.VCC', R), ('board.GND', 'fsr.GND', K), ('board.A1', 'fsr.AO', B),
    ('board.GP15', 'led.A', Y), ('board.GND2', 'led.K', K),
])
save(H, 'touch-lamp.bench', bench('Touch lamp and dimmer', parts, ws, {"board": source(H, 'touch-lamp.ino')}))

# ---- bumper rover
parts, ws0 = rover_base()
parts += [
    part('bumper', 'touch-and-force/bumper', 'Bumper', (5.2, 0.15, 0), parent=('chassis', 'body')),
    # a pen of four walls, 80 cm across
    part('wallE', 'block', 'Wall (east)', (40, 0, 0), params={"w": 2, "h": 12, "d": 82, "material": "wood", "color": "#9b7b5b"}, pinned=True),
    part('wallW', 'block', 'Wall (west)', (-40, 0, 0), params={"w": 2, "h": 12, "d": 82, "material": "wood", "color": "#9b7b5b"}, pinned=True),
    part('wallN', 'block', 'Wall (north)', (0, 0, -40), params={"w": 78, "h": 12, "d": 2, "material": "wood", "color": "#9b7b5b"}, pinned=True),
    part('wallS', 'block', 'Wall (south)', (0, 0, 40), params={"w": 78, "h": 12, "d": 2, "material": "wood", "color": "#9b7b5b"}, pinned=True),
]
ws = wires([*ws0, ('bumper.COM', 'brain.GND', K), ('bumper.NO', 'brain.GP10', Y)])
save(H, 'bumper-rover.bench', bench('Bumper rover', parts, ws, {"brain": ROVER_DRIVE + source(H, 'bumper-rover.ino')}))
