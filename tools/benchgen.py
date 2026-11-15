# Helpers for writing libraries' example benches from Python (each library's examples/make_examples.py).
import json, os, sys

R, K, Y, B, G, W, O, P = '#e04848', '#2b2d33', '#e8c547', '#4a90e2', '#3cb371', '#f2f2f2', '#f08a24', '#9b59b6'

def part(uid, type_, name, pos, rot=(0, 0, 0, 1), parent=None, params=None, pinned=False):
    p = {"uid": uid, "type": type_, "name": name, "params": params or {}, "parent": parent and {"uid": parent[0], "body": parent[1]}, "pos": list(pos), "rot": list(rot)}
    if pinned:
        p["pinned"] = True
    return p

def wires(pairs, lengths=None):
    """pairs: ('uid.PIN', 'uid.PIN', colour) ...; lengths: {index: cm} for wires that must reach far"""
    out = []
    for i, w in enumerate(pairs):
        a, b, color = w[0], w[1], w[2]
        au, ap = a.split('.', 1); bu, bp = b.split('.', 1)
        x = {"id": f"w{i+1}", "a": {"uid": au, "pin": ap}, "b": {"uid": bu, "pin": bp}, "color": color}
        if len(w) > 3: x["length"] = w[3]
        out.append(x)
    return out

def bench(name, parts, ws, programs, **extra):
    """programs: {board uid: arduino source}"""
    p = {"format": "bench-workshop", "version": 1, "name": name, "parts": parts, "wires": ws,
         "programs": {k: {"lang": "arduino", "source": v} for k, v in programs.items()}, "boards": []}
    p.update(extra)
    return p

def here(file):
    return os.path.dirname(os.path.abspath(file))

def save(folder, name, proj):
    with open(os.path.join(folder, name), 'w', encoding='utf-8') as f:
        json.dump(proj, f, indent=1)
    print('wrote', name)

def source(folder, name):
    return open(os.path.join(folder, name), encoding='utf-8').read()

# the two-wheel rover base (chassis, motors, wheels, caster, battery, board, DRV8833 and its wires),
# as the app's own examples build it: drive(left, right) with AIN = right motor, BIN = left
def rover_base(caster=True):
    parts = [
        part('chassis', 'plate', 'Chassis', (0, 4.4, 0), params={"w": 12, "h": 0.3, "d": 9, "material": "plastic", "color": "#8fa3b8"}),
        part('motorR', 'motor-tt', 'Right motor', (0, -0.15, 3.55), (0, 0, 1, 0), ('chassis', 'body')),
        part('motorL', 'motor-tt', 'Left motor', (3.2, -0.15, -3.55), (1, 0, 0, 0), ('chassis', 'body')),
        part('wheelR', 'wheel', 'Right wheel', (0, 0.45, 0), (0, 1, 0, 0), ('motorR', 'hub'), {"r": 3.3, "width": 2.6, "grip": 1.2}),
        part('wheelL', 'wheel', 'Left wheel', (0, 0.45, 0), (0, 0, 0, 1), ('motorL', 'hub'), {"r": 3.3, "width": 2.6, "grip": 1.2}),
        part('battery', 'battery-18650', 'Batteries', (-2.2, 0.15, 0), parent=('chassis', 'body'), params={"count": "2", "charge": 100}),
        part('brain', 'maker-board', 'Brain', (2.6, 0.15, 0), (0, -0.7071, 0, 0.7071), ('chassis', 'body'), {"usb": False}),
        part('driver', 'drv8833', 'Motor driver', (0, 2.0, 0), parent=('battery', 'body')),
    ]
    if caster:
        parts.append(part('caster', 'caster', 'Caster', (-4.6, -0.15, 0), (0, 0, 1, 0), ('chassis', 'body'), {"r": 1.57}))
    ws = [
        ('battery.+', 'driver.VM', R), ('battery.-', 'driver.GND', K),
        ('battery.+', 'brain.VIN', R), ('battery.-', 'brain.GND2', K),
        ('brain.GP2', 'driver.AIN1', Y), ('brain.GP3', 'driver.AIN2', Y),
        ('brain.GP5', 'driver.BIN1', B), ('brain.GP6', 'driver.BIN2', B),
        ('driver.AOUT1', 'motorR.M+', R), ('driver.AOUT2', 'motorR.M-', K),
        ('driver.BOUT1', 'motorL.M+', R), ('driver.BOUT2', 'motorL.M-', K),
    ]
    return parts, ws

ROVER_DRIVE = """#define AIN1 2    // right motor (through the DRV8833)
#define AIN2 3
#define BIN1 5    // left motor
#define BIN2 6

void motor(int in1, int in2, int speed) {
  if (speed >= 0) { analogWrite(in1, speed); analogWrite(in2, 0); }
  else            { analogWrite(in1, 0);     analogWrite(in2, -speed); }
}

void drive(int left, int right) {   // -255 .. 255
  motor(BIN1, BIN2, left);
  motor(AIN2, AIN1, right);         // the right motor faces the other way
}
"""
