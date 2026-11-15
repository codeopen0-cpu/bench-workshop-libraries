import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-12, 0, 0), params={"usb": True}),
    part('reader', 'rfid-rc522/rc522', 'Reader', (5, 0, 0), pinned=True),
    part('card', 'rfid-rc522/card', 'White card', (2, 0, 14)),
    part('fob', 'rfid-rc522/fob', 'Key fob', (12, 0, 12)),
    part('green', 'led', 'Open', (-12, 0, 8), params={"color": "green"}),
    part('red', 'led', 'Locked', (-9, 0, 8), params={"color": "red"}),
]
ws = wires([
    ('board.3V3', 'reader.3.3V', R), ('board.GND', 'reader.GND', K),
    ('board.GP17', 'reader.SDA', O), ('board.GP18', 'reader.SCK', B), ('board.GP19', 'reader.MOSI', G), ('board.GP16', 'reader.MISO', Y),
    ('board.GP15', 'reader.RST', W),
    ('board.GP13', 'green.A', G), ('board.GP14', 'red.A', R), ('green.K', 'board.GND2', K), ('red.K', 'green.K', K),
])
save(H, 'door.bench', bench('Door lock', parts, ws, {"board": source(H, 'door.ino')}))
