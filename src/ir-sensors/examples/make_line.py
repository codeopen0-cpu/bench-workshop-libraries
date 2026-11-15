# The line-following robot example (the other examples here were written by hand)
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts, ws0 = rover_base()
# a bracket under its nose, holding the two line sensors 0.8 cm over the paper (glued positions
# are from the middle of what they're glued to). Not lower: when it brakes hard or swings round,
# the robot dips its nose, and at 0.5 cm the sensors caught on the tape and stopped it.
parts += [
    part('bracket', 'block', 'Sensor bracket', (5.0, -2.95, 0), parent=('chassis', 'body'), params={"w": 1.4, "h": 3.1, "d": 5, "material": "plastic", "color": "#d8dce4"}),
    part('lineL', 'ir-sensors/tcrt5000', 'Left line sensor', (0.2, -2.15, -0.75), parent=("bracket", "body"), params={"threshold": 35}),
    part('lineR', 'ir-sensors/tcrt5000', 'Right line sensor', (0.2, -2.15, 0.75), parent=("bracket", "body"), params={"threshold": 35}),
]
# the track: white paper and an oval of black tape (straights along x, half circles at the ends)
L, Rr = 50, 35
parts.append(part('paper', 'plate', 'Paper', (0, 0, 0), params={"w": L + 2 * Rr + 30, "h": 0.3, "d": 2 * Rr + 30, "material": "cardboard", "color": "#f4f4f2"}, pinned=True))
def tape(uid, x, z, ang, length):
    q = (0, math.sin(ang / 2), 0, math.cos(ang / 2))
    return part(uid, 'plate', 'Tape', (x, 0.3, z), q, params={"w": length, "h": 0.06, "d": 2.5, "material": "plastic", "color": "#151515"}, pinned=True)
parts.append(tape('t1', 0, Rr, 0, L + 1))
parts.append(tape('t2', 0, -Rr, 0, L + 1))
n = 24
seg = math.pi * Rr / n + 0.25
for side, cx in (('e', L / 2), ('w', -L / 2)):
    for i in range(n):
        a = (i + 0.5) / n * math.pi
        if side == 'e':
            x, z = cx + Rr * math.sin(a), Rr * math.cos(a)
        else:
            x, z = cx - Rr * math.sin(a), -Rr * math.cos(a)
        parts.append(tape(f'{side}{i}', x, z, a if side == 'e' else a, seg))
# the robot starts on the near straight, heading +x
for p in parts:
    if p['uid'] == 'chassis':
        p['pos'] = [-12, 4.4 + 0.15, Rr]
pairs = [*ws0,
    ('brain.3V3', 'lineL.VCC', R), ('brain.GND', 'lineL.GND', K), ('brain.GP10', 'lineL.DO', Y),
    ('brain.3V3', 'lineR.VCC', R), ('brain.GND', 'lineR.GND', K), ('brain.GP11', 'lineR.DO', B)]
save(H, 'line-follower.bench', bench('Line-following robot', parts, wires(pairs), {"brain": ROVER_DRIVE + source(H, 'line-follower.ino')}))
