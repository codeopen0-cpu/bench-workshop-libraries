# Writes drone-follow.bench: a quadcopter with an ESP32-S3 flight controller and the colour camera,
# following a red ball. Run: python make_drone.py (from this folder or anywhere).
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import part, wires, bench, here, save, source, K, Y, B, G, W, O, P

def roty(deg):
    a = math.radians(deg) / 2
    return (0, round(math.sin(a), 6), 0, round(math.cos(a), 6))

def rotz(deg):
    a = math.radians(deg) / 2
    return (0, 0, round(math.sin(a), 6), round(math.cos(a), 6))

FLIP = (1, 0, 0, 0)          # upside down: hangs under what it's glued to
F = ('frame', 'body')        # everything is glued to the centre plate
TOP = 0.2                    # the plate's top (0.4 thick, pos is from its centre)
ARM_TOP = TOP + 0.4          # the arms' top
A = 8.5                      # motors at (+-A, +-A): 12 cm from the middle

parts = [
    part('frame', 'plate', 'Frame', (0, 4.45, 0), params={"w": 12, "h": 0.4, "d": 12, "material": "plastic", "color": "#3a3d44"}),
    part('arm1', 'plate', 'Arm (FR-BL)', (0, TOP, 0), roty(45), F, {"w": 28, "h": 0.4, "d": 2.5, "material": "plastic", "color": "#2b2d33"}),
    part('arm2', 'plate', 'Arm (FL-BR)', (0, TOP, 0), roty(-45), F, {"w": 28, "h": 0.4, "d": 2.5, "material": "plastic", "color": "#2b2d33"}),
]
# landing legs under the plate's corners (rods stand up from where they're put: flipped, they hang)
for i, (x, z) in enumerate([(5, 5), (5, -5), (-5, 5), (-5, -5)]):
    parts.append(part(f'leg{i+1}', 'rod', f'Leg {i+1}', (x, -TOP, z), FLIP, F, {"r": 0.4, "len": 4, "material": "plastic", "color": "#2b2d33"}))

# the motors: CW props on FL / BR (wired straight), CCW on FR / BL (two wires swapped)
MOTORS = [('FR', A, A, 'ccw'), ('FL', A, -A, 'cw'), ('BR', -A, A, 'cw'), ('BL', -A, -A, 'ccw')]
for m, x, z, spin in MOTORS:
    parts.append(part(f'motor{m}', 'brushless-prop', f'Motor {m} ({spin.upper()})', (x, ARM_TOP, z), parent=F,
                      params={"kv": 2300, "prop": 5, "pitch": 4.3, "spin": spin, "color": '#2b2d33' if spin == 'cw' else '#d9dce1'}))
    # its ESC on the arm, halfway in, along the arm
    ang = math.degrees(math.atan2(-z, x))
    parts.append(part(f'esc{m}', 'esc', f'ESC {m}', (x * 0.52, ARM_TOP, z * 0.52), roty(ang + 90), F, {"amps": "30"}))

parts += [
    part('battery', 'battery-lipo', 'LiPo 4S 1300 mAh', (0, -TOP, 0), FLIP, F, {"cells": "4", "mAh": 1300, "charge": 100}),
    part('fc', 'esp32s3-board', 'Flight controller (ESP32-S3)', (0, ARM_TOP, 0), parent=F, params={"usb": False}),
    part('imu', 'mpu6050', 'MPU-6050', (-3.6, TOP, 0), parent=F, params={"addr": "104"}),
    part('sonar', 'hcsr04', 'Height sonar (HC-SR04)', (0, -TOP, 3.9), FLIP, F),
    part('camera', 'color-camera/blobcam', 'Camera', (6.0, TOP, 0), rotz(-30), F, {"addr": "84"}),
    part('ball', 'ball', 'Red ball', (95, 0, 30), params={"r": 4, "material": "foam", "color": "#e02828"}),
]

ws = [
    # power: the LiPo to every ESC (yellow: red wires would look like the ball to the camera)
    *[(f'battery.+', f'esc{m}.BAT+', Y) for m, *_ in MOTORS],
    *[(f'battery.-', f'esc{m}.BAT-', K) for m, *_ in MOTORS],
    # one ESC's 5 V (its BEC) powers the flight controller and the sonar
    ('escFR.5V', 'fc.5V', Y), ('escFR.GND', 'fc.GND', K),
    ('fc.5V', 'sonar.VCC', Y), ('fc.GND', 'sonar.GND', K),
    ('fc.IO15', 'sonar.TRIG', G), ('fc.IO16', 'sonar.ECHO', G),
    # I2C: the MPU-6050 and the camera, on 3.3 V
    ('fc.3V3', 'imu.VCC', O), ('fc.GND2', 'imu.GND', K), ('fc.IO8', 'imu.SDA', B), ('fc.IO9', 'imu.SCL', P),
    ('fc.3V3', 'camera.VCC', O), ('fc.GND2', 'camera.GND', K), ('fc.IO8', 'camera.SDA', B), ('fc.IO9', 'camera.SCL', P),
    # throttle signals
    ('fc.IO4', 'escFR.SIG', W), ('fc.IO5', 'escFL.SIG', W), ('fc.IO6', 'escBR.SIG', W), ('fc.IO7', 'escBL.SIG', W),
]
# the motors' phase wires: straight for CW, A and B swapped for CCW
for m, x, z, spin in MOTORS:
    pairs = [('A', 'A'), ('B', 'B'), ('C', 'C')] if spin == 'cw' else [('A', 'B'), ('B', 'A'), ('C', 'C')]
    for e, mp in pairs:
        ws.append((f'esc{m}.{e}', f'motor{m}.{mp}', K))

d = here(__file__)
save(d, 'drone-follow.bench', bench('Drone follows a red ball', parts, wires(ws), {'fc': source(d, 'drone-follow.ino')},
                                    libraries=[{"id": "color-camera", "name": "Colour-tracking camera", "version": "1.1.0"}]))
