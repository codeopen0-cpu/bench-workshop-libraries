// ArduCAM.h for the bench: the names, numbers and calls of Arducam's library that an OV2640 Mini
// uses, so the same sketch runs here and on the real board. Written for the bench, not their code.
//
//   ArduCAM myCAM(OV2640, 7);
//   myCAM.set_format(JPEG); myCAM.InitCAM(); myCAM.OV2640_set_JPEG_size(OV2640_320x240);
//   myCAM.flush_fifo(); myCAM.clear_fifo_flag(); myCAM.start_capture();
//   while (!myCAM.get_bit(ARDUCHIP_TRIG, CAP_DONE_MASK));
//   uint32_t n = myCAM.read_fifo_length();
//   myCAM.CS_LOW(); myCAM.set_fifo_burst(); ... SPI.transfer(0x00) ... myCAM.CS_HIGH();

const BMP = 0, JPEG = 1, RAW = 2;
const OV7670 = 0, MT9D111_A = 1, OV7675 = 2, OV5642 = 3, MT9D111_B = 4, OV2640 = 5;
const OV2640_160x120 = 0, OV2640_176x144 = 1, OV2640_320x240 = 2, OV2640_352x288 = 3, OV2640_640x480 = 4;
const OV2640_800x600 = 5, OV2640_1024x768 = 6, OV2640_1280x1024 = 7, OV2640_1600x1200 = 8;
const OV2640_CHIPID_HIGH = 0x0a, OV2640_CHIPID_LOW = 0x0b;
const ARDUCHIP_TEST1 = 0x00, ARDUCHIP_FRAMES = 0x01, ARDUCHIP_MODE = 0x02, ARDUCHIP_TIM = 0x03;
const MCU2LCD_MODE = 0, CAM2LCD_MODE = 1, LCD2MCU_MODE = 2, VSYNC_LEVEL_MASK = 0x02;
const ARDUCHIP_FIFO = 0x04, FIFO_CLEAR_MASK = 0x01, FIFO_START_MASK = 0x02;
const FIFO_RDPTR_RST_MASK = 0x10, FIFO_WRPTR_RST_MASK = 0x20;
const ARDUCHIP_GPIO = 0x06, GPIO_RESET_MASK = 0x01, GPIO_PWDN_MASK = 0x02, GPIO_PWREN_MASK = 0x04;
const BURST_FIFO_READ = 0x3c, SINGLE_FIFO_READ = 0x3d;
const ARDUCHIP_REV = 0x40, ARDUCHIP_TRIG = 0x41, VSYNC_MASK = 0x01, CAP_DONE_MASK = 0x08;
const FIFO_SIZE1 = 0x42, FIFO_SIZE2 = 0x43, FIFO_SIZE3 = 0x44, MAX_FIFO_SIZE = 0x5ffff;
const Auto = 0, Sunny = 1, Cloudy = 2, Office = 3, Home = 4;
const Saturation2 = 2, Saturation1 = 3, Saturation0 = 4, Saturation_1 = 5, Saturation_2 = 6;
const Brightness2 = 2, Brightness1 = 3, Brightness0 = 4, Brightness_1 = 5, Brightness_2 = 6;
const Contrast2 = 2, Contrast1 = 3, Contrast0 = 4, Contrast_1 = 5, Contrast_2 = 6;
const Antique = 0, Bluish = 1, Greenish = 2, Reddish = 3, BW = 4, Negative = 5, BWnegative = 6, Normal = 7;

const _sizes = [[160, 120], [176, 144], [320, 240], [352, 288], [640, 480], [800, 600], [1024, 768], [1280, 1024], [1600, 1200]];
// tells the simulated chip that a new transaction starts (see device.js)
const _start = [0xa5, 0x5a, 0xc5, 0x3a];
// the sensor is at 0x30; the 5 MP ones this class may be asked for are at 0x3c (nothing answers there)
const _address = (model) => (model === OV2640 ? 0x60 : model === OV5642 ? 0x78 : 0x42);

class ArduCAM {
  constructor(model = OV7670, cs = -1) {
    this.sensor_model = model;
    this.sensor_addr = _address(model);
    this.m_fmt = BMP;
    this.cs = cs;
    if (cs >= 0) {
      pinMode(cs, OUTPUT);
      digitalWrite(cs, HIGH);
    }
  }
  CS_LOW() { digitalWrite(this.cs, LOW); }
  CS_HIGH() { digitalWrite(this.cs, HIGH); }

  bus_write(address, value) {
    this.CS_LOW();
    SPI.transfer([..._start, address & 255, value & 255]);
    this.CS_HIGH();
    return 1;
  }
  bus_read(address) {
    this.CS_LOW();
    const got = SPI.transfer([..._start, address & 255, 0]);
    this.CS_HIGH();
    return got[5];
  }
  write_reg(address, value) { this.bus_write(address | 0x80, value); }
  read_reg(address) { return this.bus_read(address & 0x7f); }
  set_bit(address, bit) { this.write_reg(address, this.read_reg(address) | bit); }
  clear_bit(address, bit) { this.write_reg(address, this.read_reg(address) & ~bit); }
  get_bit(address, bit) { return this.read_reg(address) & bit; }
  set_mode(mode) { this.write_reg(ARDUCHIP_MODE, mode === CAM2LCD_MODE || mode === LCD2MCU_MODE ? mode : MCU2LCD_MODE); }

  flush_fifo() { this.write_reg(ARDUCHIP_FIFO, FIFO_CLEAR_MASK); }
  clear_fifo_flag() { this.write_reg(ARDUCHIP_FIFO, FIFO_CLEAR_MASK); }
  start_capture() { this.write_reg(ARDUCHIP_FIFO, FIFO_START_MASK); }
  read_fifo_length() { return this.read_reg(FIFO_SIZE1) | (this.read_reg(FIFO_SIZE2) << 8) | ((this.read_reg(FIFO_SIZE3) & 0x7f) << 16); }
  read_fifo() { return this.bus_read(SINGLE_FIFO_READ); }
  // (CS is already LOW: the bytes after this are the picture, from where the last read stopped)
  set_fifo_burst() { SPI.transfer([..._start, BURST_FIFO_READ]); }

  wrSensorReg8_8(reg, value) {
    Wire.beginTransmission(this.sensor_addr >> 1);
    Wire.write(reg & 255);
    Wire.write(value & 255);
    if (Wire.endTransmission()) return 0;
    delay(1);
    return 1;
  }
  rdSensorReg8_8(reg, into) {
    const a = this.sensor_addr >> 1;
    Wire.beginTransmission(a);
    Wire.write(reg & 255);
    Wire.endTransmission();
    Wire.requestFrom(a, 1);
    if (Wire.available()) setRef(into, Wire.read());
    delay(1);
    return 1;
  }
  wrSensorReg16_8(reg, value) {
    Wire.beginTransmission(this.sensor_addr >> 1);
    Wire.write((reg >> 8) & 255);
    Wire.write(reg & 255);
    Wire.write(value & 255);
    if (Wire.endTransmission()) return 0;
    delay(1);
    return 1;
  }
  wrSensorRegs8_8(list) {
    for (const [reg, value] of list) {
      if (reg === 0xff && value === 0xff) break;
      this.wrSensorReg8_8(reg, value);
    }
    return 1;
  }

  set_format(format) { this.m_fmt = format === BMP || format === RAW ? format : JPEG; }
  InitCAM() {
    if (this.sensor_model !== OV2640) return;
    this.wrSensorReg8_8(0xff, 0x01);
    this.wrSensorReg8_8(0x12, 0x80); // reset
    delay(100);
    delay(200); // the real library sends some 200 tuning registers here
    this.wrSensorReg8_8(0xff, 0x00);
    this.wrSensorReg8_8(0xda, this.m_fmt === JPEG ? 0x10 : 0x08);
    this._size(320, 240);
  }
  _size(w, h) {
    this.wrSensorRegs8_8([
      [0xff, 0x00],
      [0x5a, (w / 4) & 255],
      [0x5b, (h / 4) & 255],
      [0x5c, ((w / 4) >> 8) | (((h / 4) >> 8) << 2)],
    ]);
  }
  OV2640_set_JPEG_size(size) {
    const [w, h] = _sizes[size] ?? _sizes[OV2640_320x240];
    this._size(w, h);
  }

  // the effect registers are reached through 0x7c (which one) and 0x7d (its value, then the next)
  _effect(enable, first, values) {
    this.wrSensorRegs8_8([[0xff, 0], [0x7c, 0], [0x7d, enable], [0x7c, first], ...values.map((v) => [0x7d, v])]);
  }
  OV2640_set_Color_Saturation(level) {
    const v = { [Saturation2]: 0x68, [Saturation1]: 0x58, [Saturation0]: 0x48, [Saturation_1]: 0x38, [Saturation_2]: 0x28 }[level];
    if (v !== undefined) this._effect(0x02, 0x03, [v, v]);
  }
  OV2640_set_Brightness(level) {
    const v = { [Brightness2]: 0x40, [Brightness1]: 0x30, [Brightness0]: 0x20, [Brightness_1]: 0x10, [Brightness_2]: 0x00 }[level];
    if (v !== undefined) this._effect(0x04, 0x09, [v, 0x00]);
  }
  OV2640_set_Contrast(level) {
    const v = { [Contrast2]: [0x28, 0x0c], [Contrast1]: [0x24, 0x16], [Contrast0]: [0x20, 0x20], [Contrast_1]: [0x20, 0x2a], [Contrast_2]: [0x18, 0x34] }[level];
    if (v) this._effect(0x04, 0x07, [0x20, ...v, 0x06]);
  }
  OV2640_set_Special_effects(effect) {
    const v = [[0x18, 0x40, 0xa6], [0x18, 0xa0, 0x40], [0x18, 0x40, 0x40], [0x18, 0x40, 0xc0], [0x18, 0x80, 0x80], [0x40, 0x80, 0x80], [0x58, 0x80, 0x80], [0x00, 0x80, 0x80]][effect];
    if (v) this._effect(v[0], 0x05, [v[1], v[2]]);
  }
  OV2640_set_Light_Mode(light) {
    const gains = { [Sunny]: [0x5e, 0x41, 0x54], [Cloudy]: [0x65, 0x41, 0x4f], [Office]: [0x52, 0x41, 0x66], [Home]: [0x42, 0x3f, 0x71] }[light];
    this.wrSensorReg8_8(0xff, 0x00);
    this.wrSensorReg8_8(0xc7, gains ? 0x40 : 0x00);
    if (gains) gains.forEach((v, i) => this.wrSensorReg8_8(0xcc + i, v));
  }
}
