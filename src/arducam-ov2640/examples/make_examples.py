import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *

H = here(__file__)
CAM = 'arducam-ov2640/mini-2mp'

# the camera on a pinned stand at x = 0, looking along +x at what's 30 cm away
def stand():
    return [
        part('stand', 'block', 'Stand', (0, 0, 0), params={"w": 3, "h": 5, "d": 3, "material": "wood", "color": "#c98a4b"}, pinned=True),
        part('cam', CAM, 'Camera', (0, 2.5, 0), parent=('stand', 'body')),
    ]

def ball(z):
    return part('ball', 'ball', 'Red ball', (32, 0, z), params={"r": 3.5, "material": "plastic", "color": "#e01b24"}, pinned=True)

photo = stand() + [
    part('board', 'arduino-nano', 'Nano', (-9, 0, 0), params={"usb": True}),
    ball(-7),
    part('blue', 'block', 'Blue block', (36, 0, 2), params={"w": 5, "h": 8, "d": 5, "material": "plastic", "color": "#1c5fd0"}, pinned=True),
    part('yellow', 'block', 'Yellow block', (28, 0, 8), params={"w": 4, "h": 4, "d": 4, "material": "plastic", "color": "#f0c419"}, pinned=True),
]
photo_wires = wires([
    ('board.5V', 'cam.VCC', R), ('board.GND', 'cam.GND', K),
    ('board.D7', 'cam.CS', O), ('board.D11', 'cam.MOSI', G), ('board.D12', 'cam.MISO', Y), ('board.D13', 'cam.SCK', B),
    ('board.A4', 'cam.SDA', W), ('board.A5', 'cam.SCL', P),
])
save(H, 'take-photo.bench', bench('ArduCAM: take a photo', photo, photo_wires, {"board": source(H, 'take-photo.ino')}))

red = stand() + [part('board', 'esp32s3-board', 'ESP32-S3', (-9, 0, 0), params={"usb": True}), ball(7)]
red_wires = wires([
    ('board.3V3', 'cam.VCC', R), ('board.GND', 'cam.GND', K),
    ('board.IO7', 'cam.CS', O), ('board.IO11', 'cam.MOSI', G), ('board.IO13', 'cam.MISO', Y), ('board.IO12', 'cam.SCK', B),
    ('board.IO8', 'cam.SDA', W), ('board.IO9', 'cam.SCL', P),
])
save(H, 'red-ball.bench', bench('ArduCAM: find the red ball', red, red_wires, {"board": source(H, 'red-ball.ino')}))
