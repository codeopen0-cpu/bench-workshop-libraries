import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-12, 0, -2), params={"usb": True}),
    part('sr', 'shift-register/hc595', '74HC595', (2, 0, -4)),
]
pairs = [('board.3V3', 'sr.VCC', R), ('board.GND', 'sr.GND', K),
         ('board.GP2', 'sr.DS', Y), ('board.GP3', 'sr.SHCP', B), ('board.GP4', 'sr.STCP', G)]
colours = ['red', 'red', 'yellow', 'yellow', 'green', 'green', 'blue', 'blue']
for i in range(8):
    parts.append(part(f'led{i}', 'led', f'LED {i}', (-2.6 + i * 1.3, 0, 5), params={"color": colours[i]}))
    pairs.append((f'sr.Q{i}', f'led{i}.A', Y))
    pairs.append((f'led{i}.K', 'board.GND2' if i == 0 else f'led{i-1}.K', K))
save(H, 'chaser.bench', bench('Light chaser', parts, wires(pairs), {"board": source(H, 'chaser.ino')}))
