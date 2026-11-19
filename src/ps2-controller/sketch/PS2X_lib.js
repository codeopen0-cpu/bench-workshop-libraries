// PS2X_lib.h (Bill Porter's library), the parts most sketches use:
//   PS2X ps2x;  int error = ps2x.config_gamepad(CLK, CMD, ATT, DAT, false, false);  (0 = found)
//   loop: ps2x.read_gamepad(false, 0);
//         ps2x.Button(PSB_PAD_UP) (held), ps2x.ButtonPressed(PSB_CROSS) (just now), ButtonReleased, NewButtonState()
//         ps2x.Analog(PSS_LY) (0..255, 128 in the middle; up is 0)
//   ps2x.readType() (1: a DualShock)
// (It asks the receiver with a message on ATT and reads its answer on DAT.)
const PSB_SELECT = 0x0001, PSB_L3 = 0x0002, PSB_R3 = 0x0004, PSB_START = 0x0008, PSB_PAD_UP = 0x0010, PSB_PAD_RIGHT = 0x0020, PSB_PAD_DOWN = 0x0040, PSB_PAD_LEFT = 0x0080;
const PSB_L2 = 0x0100, PSB_R2 = 0x0200, PSB_L1 = 0x0400, PSB_R1 = 0x0800, PSB_GREEN = 0x1000, PSB_RED = 0x2000, PSB_BLUE = 0x4000, PSB_PINK = 0x8000;
const PSB_TRIANGLE = 0x1000, PSB_CIRCLE = 0x2000, PSB_CROSS = 0x4000, PSB_SQUARE = 0x8000;
const PSS_RX = 5, PSS_RY = 6, PSS_LX = 7, PSS_LY = 8;
const PSAB_PAD_RIGHT = 9, PSAB_PAD_UP = 11, PSAB_PAD_DOWN = 12, PSAB_PAD_LEFT = 10, PSAB_L2 = 19, PSAB_R2 = 20, PSAB_L1 = 17, PSAB_R1 = 18;
const PSAB_GREEN = 13, PSAB_RED = 14, PSAB_BLUE = 15, PSAB_PINK = 16, PSAB_TRIANGLE = 13, PSAB_CIRCLE = 14, PSAB_CROSS = 15, PSAB_SQUARE = 16;
class PS2X {
  constructor() { this.att = -1; this.dat = -1; this.buttons = 0xffff; this.last = 0xffff; this.data = [0xff, 0xff, 128, 128, 128, 128]; this.found = false; }
  _ask() {
    linkReceive(this.dat, 'data'); // (nothing stale)
    linkSend(this.att, 'data', [0x42, 0, 0]);
    const t = millis();
    while (millis() - t < 30) {
      const got = linkReceive(this.dat, 'data');
      if (got.length) return got[got.length - 1].data;
      delay(1);
    }
    return null;
  }
  config_gamepad(clk, cmd, att, dat, pressures = false, rumble = false) {
    this.att = att; this.dat = dat;
    pinMode(clk, OUTPUT); pinMode(cmd, OUTPUT); pinMode(att, OUTPUT); pinMode(dat, INPUT);
    digitalWrite(att, HIGH);
    for (let i = 0; i < 10; i++) { if (this._ask()) { this.found = true; return 0; } delay(10); }
    return 1; // (no controller found: wiring, power, or the pad is off)
  }
  read_gamepad(motor1 = false, motor2 = 0) {
    if (this.att < 0) return false;
    const d = this._ask();
    this.last = this.buttons;
    if (!d) return false;
    this.data = d;
    this.buttons = d[0] | (d[1] << 8);
    return true;
  }
  readType() { return this.found ? 1 : 0; }
  Button(b) { return (~this.buttons & b) > 0; }
  ButtonPressed(b) { return this.NewButtonState(b) && this.Button(b); }
  ButtonReleased(b) { return this.NewButtonState(b) && (~this.last & b) > 0; }
  NewButtonState(b) { return b === undefined ? (this.last ^ this.buttons) > 0 : ((this.last ^ this.buttons) & b) > 0; }
  ButtonDataByte() { return ~this.buttons & 0xffff; }
  Analog(i) {
    if (i >= 5 && i <= 8) return this.data[i - 3]; // RX RY LX LY
    return this.Button(1 << ((i - 9) & 15)) ? 255 : 0; // (pressure: full, as with pressures off)
  }
  enableRumble() {} enablePressures() { return false; } reconfig_gamepad() {}
}
