import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'tools'))
from benchgen import *
H = here(__file__)
parts = [
    part('tx', 'maker-board', 'Sender', (-16, 0, 0), params={"usb": True}),
    part('radio1', 'nrf24-radio/nrf24l01', 'Radio 1', (-16, 0, -9)),
    part('knob', 'knob', 'Knob', (-16, 0, 9)),
    part('rx', 'maker-board', 'Receiver', (16, 0, 0), params={"usb": True}),
    part('radio2', 'nrf24-radio/nrf24l01', 'Radio 2', (16, 0, -9)),
    part('servo', 'servo-sg90', 'Servo', (16, 0, 9)),
]
def radio(b, r):
    return [(f'{b}.3V3', f'{r}.VCC', R), (f'{b}.GND', f'{r}.GND', K), (f'{b}.GP14', f'{r}.CE', O), (f'{b}.GP17', f'{r}.CSN', P),
            (f'{b}.GP18', f'{r}.SCK', B), (f'{b}.GP19', f'{r}.MOSI', G), (f'{b}.GP16', f'{r}.MISO', Y)]
ws = wires(radio('tx', 'radio1') + radio('rx', 'radio2') + [
    ('tx.GND2', 'knob.L', K), ('tx.3V3', 'knob.H', R), ('tx.A0', 'knob.W', G),
    ('rx.5V', 'servo.V+', R), ('rx.GND2', 'servo.GND', K), ('rx.GP15', 'servo.SIG', Y),
])
save(H, 'remote-servo.bench', bench('Radio remote servo', parts, ws, {"tx": source(H, 'sender.ino'), "rx": source(H, 'receiver.ino')}))
