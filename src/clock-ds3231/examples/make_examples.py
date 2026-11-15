import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('board', 'maker-board', 'Board', (-8, 0, 0), params={"usb": True}),
    part('rtc', 'clock-ds3231/ds3231', 'Clock', (5, 0, 0)),
]
ws = wires([('board.3V3', 'rtc.VCC', R), ('board.GND', 'rtc.GND', K), ('board.SDA', 'rtc.SDA', G), ('board.SCL', 'rtc.SCL', W)])
save(H, 'clock.bench', bench('Clock and thermometer', parts, ws, {"board": source(H, 'clock.ino')}))
