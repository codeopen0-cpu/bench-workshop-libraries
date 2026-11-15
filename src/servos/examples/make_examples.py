import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)

# continuous servos, steered by one knob
parts = [
    part('board', 'maker-board', 'Board', (-12, 0, 0), params={"usb": True}),
    part('knob', 'knob', 'Speed knob', (-12, 0, 9)),
    part('small', 'servos/fs90r', 'FS90R (continuous)', (2, 0, -5), pinned=True),
    part('big', 'servos/mg996r-360', 'MG996R 360 (continuous)', (4, 0, 6), pinned=True),
    part('batt', 'battery-4aa', 'Servo batteries', (-2, 0, 14), pinned=True),
]
ws = wires([
    ('board.GND2', 'knob.L', K), ('board.3V3', 'knob.H', R), ('board.A0', 'knob.W', G),
    ('batt.+', 'small.V+', R), ('batt.-', 'small.GND', K), ('board.GP2', 'small.SIG', Y),
    ('batt.+', 'big.V+', R), ('batt.-', 'big.GND', K), ('board.GP3', 'big.SIG', O),
    ('batt.-', 'board.GND', K),
])
save(H, 'cr.bench', bench('Continuous servos and a knob', parts, ws, {"board": source(H, 'cr.ino')}))

# 270, 360 and winch
parts = [
    part('board', 'maker-board', 'Board', (-14, 0, 0), params={"usb": True}),
    part('knob', 'knob', 'Knob', (-14, 0, 9)),
    part('s270', 'servos/ds3218-270', '270 deg servo', (0, 0, -7), pinned=True),
    part('s360', 'servos/servo-360', '360 deg servo', (0, 0, 2), pinned=True),
    part('winch', 'servos/hs785hb', 'Winch servo', (2, 0, 11), pinned=True),
    part('batt', 'battery-4aa', 'Servo batteries', (-8, 0, 16), pinned=True),
]
ws = wires([
    ('board.GND2', 'knob.L', K), ('board.3V3', 'knob.H', R), ('board.A0', 'knob.W', G),
    ('batt.+', 's270.V+', R), ('batt.-', 's270.GND', K), ('board.GP2', 's270.SIG', Y),
    ('batt.+', 's360.V+', R), ('batt.-', 's360.GND', K), ('board.GP3', 's360.SIG', O),
    ('batt.+', 'winch.V+', R), ('batt.-', 'winch.GND', K), ('board.GP4', 'winch.SIG', B),
    ('batt.-', 'board.GND', K),
])
save(H, 'sweep.bench', bench('270, 360 and winch', parts, ws, {"board": source(H, 'sweep.ino')}))

# smart servos on two serial ports, each on its own battery
parts = [
    part('board', 'maker-board', 'Board', (-14, 0, 0), params={"usb": True}),
    part('sts', 'servos/sts3215', 'STS3215', (2, 0, -6), pinned=True),
    part('xl', 'servos/xl430', 'XL430', (2, 0, 7), pinned=True),
    part('b74', 'battery-18650', '7.4 V for the STS', (-6, 0, -14), params={"count": "2", "charge": 100}, pinned=True),
    part('b11', 'battery-lipo', '11.1 V for the XL430', (-6, 0, 15), params={"cells": "3", "mAh": 1500, "charge": 100}, pinned=True),
]
ws = wires([
    ('b74.+', 'sts.V+', R), ('b74.-', 'sts.GND', K), ('board.GP0', 'sts.DATA', Y), ('board.GP1', 'sts.DATA', Y),
    ('b11.+', 'xl.V+', R), ('b11.-', 'xl.GND', K), ('board.GP4', 'xl.DATA', B), ('board.GP5', 'xl.DATA', B),
    ('b74.-', 'board.GND', K), ('b11.-', 'board.GND2', K),
])
save(H, 'smart.bench', bench('Smart servos', parts, ws, {"board": source(H, 'smart.ino')}))
