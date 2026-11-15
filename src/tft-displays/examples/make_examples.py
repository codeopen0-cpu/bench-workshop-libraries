import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-12, 0, 0), params={"usb": True}),
    part('tft', 'tft-displays/ili9341', 'Screen', (5, 0, 0), (0, -0.7071, 0, 0.7071), pinned=True),
    part('knob', 'knob', 'Knob', (-12, 0, 9)),
]
ws = wires([
    ('board.3V3', 'tft.VCC', R), ('board.GND', 'tft.GND', K), ('board.3V3', 'tft.LED', R),
    ('board.GP17', 'tft.CS', O), ('board.GP14', 'tft.DC', P), ('board.GP15', 'tft.RESET', W),
    ('board.GP18', 'tft.SCK', B), ('board.GP19', 'tft.MOSI', G), ('board.GP16', 'tft.MISO', Y),
    ('board.GND2', 'knob.L', K), ('board.3V3', 'knob.H', R), ('board.A0', 'knob.W', G),
])
save(H, 'dashboard.bench', bench('Colour dashboard', parts, ws, {"board": source(H, 'dashboard.ino')}))
