// Takes a JPEG photo every 3 seconds and reads it out of the camera's buffer.
// Wiring (Arduino Nano or UNO): CS 7, MOSI 11, MISO 12, SCLK 13, SDA A4, SCL A5, VCC 5V, GND.
#include <Wire.h>
#include <SPI.h>
#include <ArduCAM.h>

const int CAM_CS = 7;
ArduCAM myCAM(OV2640, CAM_CS);

void setup() {
  uint8_t vid = 0, pid = 0;
  Serial.begin(115200);
  Wire.begin();
  SPI.begin();

  myCAM.write_reg(0x07, 0x80);   // restart the ArduChip
  delay(100);
  myCAM.write_reg(0x07, 0x00);
  delay(100);

  while (true) {                 // is the SPI side wired right?
    myCAM.write_reg(ARDUCHIP_TEST1, 0x55);
    if (myCAM.read_reg(ARDUCHIP_TEST1) == 0x55) break;
    Serial.println("No answer on SPI: check CS, MOSI, MISO, SCLK and power");
    delay(1000);
  }
  while (true) {                 // and the I2C side?
    myCAM.wrSensorReg8_8(0xff, 0x01);
    myCAM.rdSensorReg8_8(OV2640_CHIPID_HIGH, &vid);
    myCAM.rdSensorReg8_8(OV2640_CHIPID_LOW, &pid);
    if (vid == 0x26 && (pid == 0x41 || pid == 0x42)) break;
    Serial.println("No OV2640 on I2C: check SDA and SCL");
    delay(1000);
  }
  Serial.println("Camera found");

  myCAM.set_format(JPEG);
  myCAM.InitCAM();
  myCAM.OV2640_set_JPEG_size(OV2640_320x240);   // up to OV2640_1600x1200
  delay(500);
}

void loop() {
  myCAM.flush_fifo();
  myCAM.clear_fifo_flag();
  myCAM.start_capture();
  while (!myCAM.get_bit(ARDUCHIP_TRIG, CAP_DONE_MASK)) delay(5);

  uint32_t length = myCAM.read_fifo_length();
  uint32_t count = 0;
  uint8_t first = 0, second = 0, now = 0, before = 0;
  bool ended = false;

  myCAM.CS_LOW();
  myCAM.set_fifo_burst();
  while (count < length) {
    before = now;
    now = SPI.transfer(0x00);    // the next byte of the photo: save it or send it from here
    count++;
    if (count == 1) first = now;
    if (count == 2) second = now;
    if (before == 0xFF && now == 0xD9) {
      ended = true;
      break;
    }
  }
  myCAM.CS_HIGH();
  myCAM.clear_fifo_flag();

  Serial.print("Photo: ");
  Serial.print(count);
  Serial.print(" bytes");
  if (first == 0xFF && second == 0xD8 && ended) Serial.println(", a whole JPEG (FF D8 ... FF D9)");
  else Serial.println(", broken: check the wiring");
  delay(3000);
}
