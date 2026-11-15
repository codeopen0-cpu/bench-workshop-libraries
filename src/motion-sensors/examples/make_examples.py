# Writes this library's example benches (run it after changing a sketch: python make_examples.py)
import json, os
here = os.path.dirname(os.path.abspath(__file__))
src = lambda n: open(os.path.join(here, n), encoding='utf-8').read()

def part(uid, type_, name, pos, rot=(0, 0, 0, 1), parent=None, params=None, pinned=False):
    p = {"uid": uid, "type": type_, "name": name, "params": params or {}, "parent": parent and {"uid": parent[0], "body": parent[1]}, "pos": list(pos), "rot": list(rot)}
    if pinned: p["pinned"] = True
    return p

def wires(pairs):
    out = []
    for i, (a, b, color) in enumerate(pairs):
        au, ap = a.split('.'); bu, bp = b.split('.')
        out.append({"id": f"w{i+1}", "a": {"uid": au, "pin": ap}, "b": {"uid": bu, "pin": bp}, "color": color})
    return out

R, K, Y, B, G, W = '#e04848', '#2b2d33', '#e8c547', '#4a90e2', '#3cb371', '#f2f2f2'

def save(name, proj):
    with open(os.path.join(here, name), 'w', encoding='utf-8') as f:
        json.dump(proj, f, indent=1)

# ---- self-balancing robot: the chassis sits over the wheels' axle (x = 0)
parts = [
    part('chassis', 'plate', 'Chassis', (0, 4.4, 0), params={"w": 7, "h": 0.3, "d": 9, "material": "plastic", "color": "#8fa3b8"}),
    part('motorR', 'motor-tt', 'Right motor', (-1.6, -0.15, 3.55), (0, 0, 1, 0), ('chassis', 'body')),
    part('motorL', 'motor-tt', 'Left motor', (1.6, -0.15, -3.55), (1, 0, 0, 0), ('chassis', 'body')),
    part('wheelR', 'wheel', 'Right wheel', (0, 0.45, 0), (0, 1, 0, 0), ('motorR', 'hub'), {"r": 3.3, "width": 2.6, "grip": 1.4}),
    part('wheelL', 'wheel', 'Left wheel', (0, 0.45, 0), (0, 0, 0, 1), ('motorL', 'hub'), {"r": 3.3, "width": 2.6, "grip": 1.4}),
    part('mastF', 'block', 'Mast', (0, 0.15, 3.9), parent=('chassis', 'body'), params={"w": 1.2, "h": 12, "d": 0.8, "material": "plastic", "color": "#d8dce4"}),
    part('mastB', 'block', 'Mast 2', (0, 0.15, -3.9), parent=('chassis', 'body'), params={"w": 1.2, "h": 12, "d": 0.8, "material": "plastic", "color": "#d8dce4"}),
    part('deck', 'plate', 'Top deck', (0, 12.15, -3.9), parent=('mastF', 'body'), params={"w": 7, "h": 0.3, "d": 9, "material": "plastic", "color": "#8fa3b8"}),
    part('battery', 'battery-18650', 'Batteries', (0, 0.15, 0), parent=('deck', 'body'), params={"count": "2", "charge": 100}),
    part('brain', 'maker-board', 'Brain', (0, 0.15, 0), (0, -0.7071, 0, 0.7071), ('chassis', 'body'), {"usb": False}),
    part('driver', 'drv8833', 'Motor driver', (0, 2.0, 0), parent=('battery', 'body')),
    part('imu', 'mpu6050', 'MPU-6050', (2.6, 0.15, 2.4), parent=('chassis', 'body')),
]
ws = wires([
    ('battery.+', 'driver.VM', R), ('battery.-', 'driver.GND', K),
    ('battery.+', 'brain.VIN', R), ('battery.-', 'brain.GND2', K),
    ('brain.GP2', 'driver.AIN1', Y), ('brain.GP3', 'driver.AIN2', Y),
    ('brain.GP5', 'driver.BIN1', B), ('brain.GP6', 'driver.BIN2', B),
    ('driver.AOUT1', 'motorR.M+', R), ('driver.AOUT2', 'motorR.M-', K),
    ('driver.BOUT1', 'motorL.M+', R), ('driver.BOUT2', 'motorL.M-', K),
    ('brain.3V3', 'imu.VCC', R), ('brain.GND', 'imu.GND', K),
    ('brain.SDA', 'imu.SDA', G), ('brain.SCL', 'imu.SCL', W),
])
save('balancer.bench', {"format": "bench-workshop", "version": 1, "name": "Self-balancing robot", "parts": parts, "wires": ws,
     "programs": {"brain": {"lang": "arduino", "source": src('balancer.ino')}}, "boards": []})

# ---- compass and tilt alarm: both on a little loose board you can pick up
parts = [
    part('board', 'maker-board', 'Board', (-10, 0, 0), params={"usb": True}),
    part('base', 'plate', 'Sensor board', (6, 0.15, 0), params={"w": 8, "h": 0.3, "d": 6, "material": "plastic", "color": "#f2c230"}),
    part('compass', 'motion-sensors/compass', 'Compass', (-2, 0.15, 0), parent=('base', 'body')),
    part('tilt', 'motion-sensors/tilt-switch', 'Tilt switch', (2, 0.15, 0), parent=('base', 'body')),
    part('led', 'led', 'Alarm LED', (-10, 0, 7), params={"color": "red"}),
]
ws = wires([
    ('board.3V3', 'compass.VCC', R), ('board.GND', 'compass.GND', K),
    ('board.SDA', 'compass.SDA', G), ('board.SCL', 'compass.SCL', W),
    ('compass.VCC', 'tilt.VCC', R), ('compass.GND', 'tilt.GND', K),
    ('board.GP2', 'tilt.DO', Y),
    ('board.GP15', 'led.A', Y), ('board.GND2', 'led.K', K),
])
for w in ws:
    if w['a']['uid'] == 'board' and w['b']['uid'] in ('compass', 'tilt'): w['length'] = 40  # (slack: carry it about)
save('compass-tilt.bench', {"format": "bench-workshop", "version": 1, "name": "Compass and tilt alarm", "parts": parts, "wires": ws,
     "programs": {"board": {"lang": "arduino", "source": src('compass-tilt.ino')}}, "boards": []})
print('written')
