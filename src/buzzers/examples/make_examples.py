import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-10, 0, 0), params={"usb": True}),
    part('buz', 'buzzers/active-buzzer', 'Buzzer', (4, 0, -5)),
    part('mic', 'buzzers/sound-sensor', 'Sound sensor', (4, 0, 4)),
    part('led', 'led', 'Heard it', (-10, 0, 8), params={"color": "green"}),
]
ws = wires([
    ('board.GP2', 'buz.+', Y, 60), ('board.GND', 'buz.-', K, 60),
    ('board.3V3', 'mic.VCC', R), ('board.GND', 'mic.GND', K), ('board.GP3', 'mic.DO', B),
    ('board.GP15', 'led.A', Y), ('board.GND2', 'led.K', K),
])
save(H, 'hear.bench', bench('Hears the buzzer', parts, ws, {"board": source(H, 'hear.ino')}))
