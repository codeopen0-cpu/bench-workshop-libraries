# Writes library.json for the servos library (run: python make_library.py). Each servo is described
# once here; the shapes, pins and joints follow from its sizes.
import json, os
H = os.path.dirname(os.path.abspath(__file__))

def servo_part(id_, name, desc, w, h, d, shaft_x, mass, color, joint, pins='pwm', horn=1.8, sticker='#2c5fd1', device='pwm-servo', params=None, defaults=None, controls=None, extra_shape=None, span=None):
    """a servo: a case (w x h x d cm) with mounting ears (span = end to end; 0 = none, as on smart
    servos, which bolt on through their case), the horn on a shaft at (shaft_x, top)"""
    top = h + 0.35
    shape = [
        {"box": [w, h, d], "at": [0, h / 2, 0], "color": color},
        {"cyl": [d * 0.33, 0.35], "at": [shaft_x, h + 0.175, 0], "color": color},
        {"box": [w * 0.55, 0.01, d * 0.7], "at": [-w * 0.15, h * 0.5, d / 2 + 0.006], "rot": [90, 0, 0], "color": sticker, "collide": False},
    ] + (extra_shape or [])
    if span != 0:
        shape.insert(1, {"box": [span or w + 1.2, 0.22, d], "at": [0, h * 0.74, 0], "color": color})
    lead_x = -w / 2 - (0.6 if pins == 'pwm' else 0.1)  # (smart servos: sockets in the case)
    if pins == 'pwm':
        pin_list = [
            {"id": "GND", "label": "GND (brown)", "at": [lead_x, 0.45, -0.25], "kind": "gnd"},
            {"id": "V+", "label": "V+ (red)", "at": [lead_x, 0.45, 0], "kind": "vin", "vmin": 4, "vmax": joint.get("vmax", 7.4)},
            {"id": "SIG", "label": "Signal (orange)", "at": [lead_x, 0.45, 0.25], "kind": "in"},
        ]
        shorts = []
    else:  # a smart servo: two 3-pin bus connectors, wired through (to chain servos)
        pin_list = []
        for i, z in ((1, -0.6), (2, 0.6)):
            sfx = '' if i == 1 else '2'
            pin_list += [
                {"id": "GND" + sfx, "at": [lead_x, 0.45, z - 0.25], "kind": "gnd"},
                {"id": "V+" + sfx, "label": "V+ (" + joint["vrange"] + ")", "at": [lead_x, 0.45, z], "kind": "vin", "vmin": joint["vmin"], "vmax": joint["vmax"]},
                {"id": "DATA" + sfx, "label": "DATA (serial bus)", "at": [lead_x, 0.45, z + 0.25], "kind": "io"},
            ]
        shorts = [["GND", "GND2"], ["V+", "V+2"], ["DATA", "DATA2"]]
    j = {"at": [shaft_x, top, 0], "axis": [0, 1, 0], "motor": joint["motor"], "torque": joint["torque"], "speed": joint["rpm"], "volts": joint["volts"]}
    for k in ("min", "max", "multiturn"):
        if k in joint: j[k] = joint[k]
    part = {
        "id": id_, "name": name, "description": desc, "swatch": color, "mass": mass,
        "shape": shape, "pins": pin_list,
        "moving": [{
            "id": "horn", "mass": max(1, mass * 0.06),
            "shape": [
                {"cyl": [d * 0.42, 0.18], "at": [shaft_x, top + 0.09, 0], "color": "#f2f2f2"},
                {"box": [horn, 0.18, d * 0.36], "at": [shaft_x + horn / 2, top + 0.09, 0], "color": "#f2f2f2"},
                {"box": [0.3, 0.02, 0.12], "at": [shaft_x + d * 0.25, top + 0.19, 0], "color": "#e33030", "collide": False},
            ],
            "joint": j,
        }],
        "device": device,
    }
    if shorts: part["shorts"] = shorts
    if params: part["params"] = params
    if defaults: part["defaults"] = defaults
    if controls: part["controls"] = controls
    return part

trim = [{"key": "trim", "label": "Stop point trim (us)", "kind": "number", "min": -100, "max": 100, "step": 1}]
idp = [{"key": "id", "label": "Bus ID", "kind": "number", "min": 0, "max": 253, "step": 1}]
parts = [
    servo_part("fs90r", "Servo FS90R (continuous, micro)",
        "A micro servo that spins round and round: write(90) stops it, write(0) and write(180) are full speed each way, in between slower (no angle: it doesn't know where it is). 1.3 kg*cm, about 110 rpm at 4.8 V. Real ones stop a little off 90: the trim setting copies that.",
        2.3, 2.25, 1.22, 0.55, 9, "#1d1d20", {"motor": "motor", "torque": 1.3, "rpm": 110, "volts": 4.8, "vmax": 6.5},
        horn=1.6, params=trim, defaults={"trim": 0}, device="cr-servo"),
    servo_part("mg996r-360", "Servo MG996R 360 (continuous)",
        "The metal-gear MG996R made to spin round and round: write(90) stops it, 0 and 180 are full speed each way (no angle: it doesn't know where it is). 10 kg*cm, about 55 rpm at 6 V: a good wheel motor.",
        4.07, 3.78, 1.97, 1.0, 55, "#202226", {"motor": "motor", "torque": 10, "rpm": 55, "volts": 6, "vmax": 7.4},
        horn=2.4, params=trim, defaults={"trim": 0}, device="cr-servo"),
    servo_part("ds3218-270", "Servo DS3218 (270 deg)",
        "A 20 kg*cm digital servo with 270 degrees of travel: pulses 500-2500 us go from -135 to +135 deg. With Servo: write(0..180) covers the whole 270 (write(90) is the middle), or writeMicroseconds(). About 60 rpm at 6.8 V.",
        4.0, 3.7, 2.0, 1.0, 60, "#1a1a1c", {"motor": "servo", "torque": 20, "rpm": 60, "volts": 6.8, "min": -135, "max": 135, "vmax": 7.4},
        horn=2.4, span=5.45, sticker="#d03030", params=[{"key": "range", "label": "Travel", "kind": "select", "options": [{"value": "270", "label": "270 deg"}]}], defaults={"range": "270"}),
    servo_part("servo-360", "Servo 360 deg positional (25 kg)",
        "A positional servo with a full circle of travel: pulses 500-2500 us go from -180 to +180 deg (write(0..180) covers the whole circle, write(90) is the middle). It knows its angle, unlike a continuous servo. 25 kg*cm, about 50 rpm at 6.8 V.",
        4.0, 3.7, 2.0, 1.0, 65, "#24262b", {"motor": "servo", "torque": 25, "rpm": 50, "volts": 6.8, "min": -180, "max": 180, "vmax": 7.4},
        horn=2.4, span=5.45, sticker="#e0a020", params=[{"key": "range", "label": "Travel", "kind": "select", "options": [{"value": "360", "label": "360 deg"}]}], defaults={"range": "360"}),
    servo_part("hs785hb", "Sail winch servo HS-785HB (3.5 turns)",
        "A multi-turn winch servo: pulses 600-2400 us go from -630 to +630 deg, three and a half turns end to end, and it holds there. writeMicroseconds(600..2400) (write(0..180) gives about two turns). 13 kg*cm, about 36 rpm at 6 V. Wind a line on its drum.",
        5.9, 5.0, 2.9, 1.6, 110, "#2a2a2e", {"motor": "servo", "multiturn": True, "torque": 13.2, "rpm": 36, "volts": 6, "vmax": 7.4},
        horn=1.2, sticker="#3060c0", device="winch-servo",
        extra_shape=[{"cyl": [1.3, 0.1], "at": [1.6, 5.36, 0], "color": "#c9cdd4", "collide": False}]),
    servo_part("sts3215", "Smart servo Feetech STS3215",
        "A serial-bus smart servo: it knows its angle (0-4095 = one turn), and turns to a position or spins as a wheel; it reports where it is, its speed, load, voltage and temperature. 19.5 kg*cm, about 45 rpm at 7.4 V (6-8.4 V). Its DATA wire is one half-duplex serial line at 1,000,000 baud: wire both the board's TX and RX to it. Chain several on one bus (each its own ID). #include <SCServo.h>; SMS_STS st; Serial1.begin(1000000); st.pSerial = &Serial1; st.WritePosEx(1, 2048, 2000, 50);",
        4.52, 3.15, 2.47, 1.1, 55, "#141416", {"motor": "servo", "multiturn": True, "torque": 19.5, "rpm": 45, "volts": 7.4, "vmin": 4, "vmax": 8.6, "vrange": "6-8.4 V"},
        pins='bus', horn=2.0, span=0, sticker="#e0e0e0", device="sts-servo", params=idp, defaults={"id": 1}),
    servo_part("xl430", "Smart servo Dynamixel XL430-W250",
        "ROBOTIS's smart servo (Protocol 2.0): position (one turn, or many in extended mode) or velocity, and it reports position, speed, load, voltage and temperature. Torque is off until you turn it on. 15 kg*cm (1.5 N*m), about 57 rpm at 12 V (6.5-12 V). DATA: one half-duplex serial line at 57,600 baud by default: wire both the board's TX and RX to it. #include <Dynamixel2Arduino.h>; Dynamixel2Arduino dxl(Serial1, -1); dxl.begin(57600); dxl.setPortProtocolVersion(2.0); dxl.torqueOn(1); dxl.setGoalPosition(1, 90.0, UNIT_DEGREE);",
        4.65, 2.87, 2.85, 1.2, 57, "#1d1d20", {"motor": "servo", "multiturn": True, "torque": 15.3, "rpm": 57, "volts": 12, "vmin": 5.5, "vmax": 13, "vrange": "6.5-12 V, 11.1 V best"},
        pins='bus', horn=1.8, span=0, sticker="#3a6fe0", device="xl430", params=idp, defaults={"id": 1}),
]

lib = {
    "format": "bench-library", "formatVersion": 1, "id": "servos", "name": "More servos: 360, continuous, winch and smart",
    "version": "1.0.1", "author": "Bench Workshop", "owner": "codeopen0-cpu",
    "description": "Servos beyond 180 degrees. Continuous ones that spin round and round (FS90R, MG996R 360: the signal sets speed and direction), positional ones with 270 and 360 degrees of travel, a sail winch servo that turns three and a half turns, and two smart serial-bus servos that turn to any angle and report back (Feetech STS3215 with SCServo.h, Dynamixel XL430 with Dynamixel2Arduino.h).",
    "category": "Motion", "needsApp": "0.4.3", "code": "device.js",
    "sketch": {
        "SCServo.h": {"classes": ["SMS_STS", "SCSCL"], "file": "sketch/SCServo.js"},
        "Dynamixel2Arduino.h": {"classes": ["Dynamixel2Arduino"], "exports": [
            "OP_POSITION", "OP_EXTENDED_POSITION", "OP_VELOCITY", "OP_PWM", "OP_CURRENT", "OP_CURRENT_BASED_POSITION",
            "UNIT_RAW", "UNIT_PERCENT", "UNIT_RPM", "UNIT_DEGREE", "UNIT_MILLI_AMPERE",
            "TORQUE_ENABLE", "LED", "GOAL_POSITION", "GOAL_VELOCITY", "PROFILE_VELOCITY", "PROFILE_ACCELERATION", "PRESENT_POSITION",
            "PRESENT_VELOCITY", "PRESENT_LOAD", "PRESENT_INPUT_VOLTAGE", "PRESENT_TEMPERATURE", "MOVING", "OPERATING_MODE", "ID", "BAUD_RATE", "MODEL_NUMBER"],
            "file": "sketch/Dynamixel2Arduino.js"},
    },
    "parts": parts,
    "examples": [
        {"name": "Continuous servos and a knob", "description": "An FS90R and an MG996R 360 on one knob (its slider in the run panel): the middle stops them, either side spins them that way, faster the further you go. write() sets speed, not an angle.", "file": "examples/cr.bench"},
        {"name": "270, 360 and winch", "description": "A 270 deg servo, a 360 deg servo and a sail winch servo side by side, all swept by one knob (their run-panel slider): see how far each one turns for the same signal.", "file": "examples/sweep.bench"},
        {"name": "Smart servos", "description": "An STS3215 (on Serial1) and a Dynamixel XL430 (on Serial2), each on its own battery: the board turns them to angles, spins the STS as a wheel, and prints where they say they are.", "file": "examples/smart.bench"},
    ],
}
json.dump(lib, open(os.path.join(H, 'library.json'), 'w', encoding='utf-8'), indent=1)
print('library.json:', len(parts), 'parts')
