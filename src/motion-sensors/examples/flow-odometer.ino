// Optical flow odometer. A rover with a PMW3901 optical flow sensor looking down from a boom, about
// 12 cm over the floor. It drives ahead, stops, and drives back; the sensor's counts add up to how
// far it went (counts / 500 = the angle the floor slid by; times the height = centimetres).
// Open the serial monitor (Program) and press Plot. Pick the rover up and carry it (WASD) too.
#include <SPI.h>
#include <Bitcraze_PMW3901.h>

#define AIN1 2    // right motor (through the DRV8833)
#define AIN2 3
#define BIN1 5    // left motor
#define BIN2 6
#define FLOW_CS 17

const float HEIGHT_CM = 12.0;       // the sensor's height over the floor (fixed on this rover)
const float COUNTS_PER_RAD = 500;   // the PMW3901: about 500 counts a radian

Bitcraze_PMW3901 flow(FLOW_CS);
float xCm = 0, yCm = 0;
unsigned long lastPrint = 0;

void motor(int in1, int in2, int speed) {
  if (speed >= 0) { analogWrite(in1, speed); analogWrite(in2, 0); }
  else            { analogWrite(in1, 0);     analogWrite(in2, -speed); }
}

void drive(int left, int right) {   // -255 .. 255
  motor(BIN1, BIN2, left);
  motor(AIN2, AIN1, right);         // the right motor faces the other way
}

void setup() {
  Serial.begin(115200);
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  if (!flow.begin()) Serial.println("no PMW3901 on SPI: check its wires (CS on GP17)");
  else Serial.println("PMW3901 found");
}

void loop() {
  int16_t dx, dy;
  flow.readMotionCount(&dx, &dy);
  // the floor slid this far (angle) at this height: that's how far the rover went
  xCm += dx / COUNTS_PER_RAD * HEIGHT_CM;
  yCm += dy / COUNTS_PER_RAD * HEIGHT_CM;

  unsigned long t = millis();
  // (slowing down before each stop: a sudden stop tips it onto its nose and the sensor loses the floor)
  if (t < 1000)      drive(0, 0);        // wait a moment
  else if (t < 3600) drive(160, 160);    // ahead
  else if (t < 4000) drive(70, 70);
  else if (t < 5000) drive(0, 0);
  else if (t < 7600) drive(-160, -160);  // and back
  else if (t < 8000) drive(-70, -70);
  else               drive(0, 0);

  if (t - lastPrint >= 200) {
    lastPrint = t;
    Serial.print("ahead_cm:");
    Serial.print(xCm, 1);
    Serial.print(" sideways_cm:");
    Serial.print(yCm, 1);
    Serial.print(" quality:");
    Serial.println(flow.readQuality());
  }
  delay(10);
}
