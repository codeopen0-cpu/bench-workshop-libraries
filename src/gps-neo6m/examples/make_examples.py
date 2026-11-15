import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-10, 0, 0), params={"usb": True}),
    part('gps', 'gps-neo6m/neo6m', 'GPS', (5, 0, 0)),
]
ws = wires([('board.3V3', 'gps.VCC', R, 80), ('board.GND', 'gps.GND', K, 80), ('gps.TX', 'board.GP1', Y, 80), ('board.GP0', 'gps.RX', B, 80)])
save(H, 'where.bench', bench('Where am I', parts, ws, {"board": source(H, 'where.ino')}))
