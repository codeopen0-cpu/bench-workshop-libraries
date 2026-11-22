// Finds red in the camera's uncompressed (RGB565) picture.
// Wiring (ESP32-S3): CS 7, MOSI 11, MISO 13, SCLK 12, SDA 8, SCL 9, VCC 3V3, GND.
#include <Wire.h>
#include <SPI.h>
#include <ArduCAM.h>

const int CAM_CS = 7;
const int W = 320;
const int H = 240;
ArduCAM myCAM(OV2640, CAM_CS);

uint8_t row[640];   // one line of the picture, 2 bytes a pixel
int cells[128];     // red pixels in each square of a 16 x 8 map

void setup() {
  Serial.begin(115200);
  Wire.begin();
  SPI.begin();
  myCAM.write_reg(ARDUCHIP_TEST1, 0x55);
  while (myCAM.read_reg(ARDUCHIP_TEST1) != 0x55) {
    Serial.println("Camera not answering on SPI");
    delay(1000);
    myCAM.write_reg(ARDUCHIP_TEST1, 0x55);
  }
  myCAM.set_format(BMP);
  myCAM.InitCAM();
  delay(300);
}

void loop() {
  myCAM.flush_fifo();
  myCAM.clear_fifo_flag();
  myCAM.start_capture();
  while (!myCAM.get_bit(ARDUCHIP_TRIG, CAP_DONE_MASK)) delay(5);

  for (int i = 0; i < 128; i++) cells[i] = 0;
  long total = 0;
  long sumX = 0;

  myCAM.CS_LOW();
  myCAM.set_fifo_burst();
  for (int y = 0; y < H; y++) {
    SPI.transfer(row, sizeof(row));
    int line = y / 30;
    for (int x = 0; x < W; x++) {
      int p = (row[x * 2] << 8) | row[x * 2 + 1];   // high byte first
      int r = (p >> 11) << 3;
      int g = ((p >> 5) & 63) << 2;
      int b = (p & 31) << 3;
      if (r > 60 && r > 2 * g && r > 2 * b) {
        int column = x / 20;
        cells[line * 16 + column]++;
        total++;
        sumX += x;
      }
    }
  }
  myCAM.CS_HIGH();
  myCAM.clear_fifo_flag();

  for (int line = 0; line < 8; line++) {
    for (int column = 0; column < 16; column++) {
      if (cells[line * 16 + column] > 150) Serial.print("#");
      else Serial.print(".");
    }
    Serial.println();
  }
  if (total < 200) Serial.println("no red ball");
  else {
    long middle = sumX / total;
    if (middle < W * 0.4) Serial.println("red ball: left");
    else if (middle > W * 0.6) Serial.println("red ball: right");
    else Serial.println("red ball: middle");
  }
  delay(500);
}
