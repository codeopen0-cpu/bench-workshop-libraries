import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-10, 0, 0), params={"usb": True}),
    part('sd', 'sd-card/sd', 'SD card', (5, 0, 0)),
    part('knob', 'knob', 'Knob', (-10, 0, 9)),
]
ws = wires([
    ('board.5V', 'sd.VCC', R), ('board.GND', 'sd.GND', K), ('board.GP17', 'sd.CS', O),
    ('board.GP18', 'sd.SCK', B), ('board.GP19', 'sd.MOSI', G), ('board.GP16', 'sd.MISO', Y),
    ('board.GND2', 'knob.L', K), ('board.3V3', 'knob.H', R), ('board.A0', 'knob.W', G),
])
save(H, 'logger.bench', bench('Data logger', parts, ws, {"board": source(H, 'logger.ino')}))
