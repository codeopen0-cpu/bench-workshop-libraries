// 270, 360 and a winch: one knob (its slider in the run panel) moves all three. The same signal
// turns each one a different amount: 270 deg, a full circle, three and a half turns.
#include <Servo.h>

#define KNOB A0
Servo s270;
Servo s360;
Servo winch;

void setup() {
  Serial.begin(115200);
  s270.attach(2);
  s360.attach(3);
  winch.attach(4);
}

void loop() {
  int k = analogRead(KNOB);                   // 0 .. 4095
  int angle = map(k, 0, 4095, 0, 180);        // write(0..180): each servo's whole range
  s270.write(angle);
  s360.write(angle);
  int us = map(k, 0, 4095, 600, 2400);        // the winch's range is 600 .. 2400 us
  winch.writeMicroseconds(us);
  Serial.print("270 servo: ");
  Serial.print(map(angle, 0, 180, -135, 135));
  Serial.print(" deg   360 servo: ");
  Serial.print(map(angle, 0, 180, -180, 180));
  Serial.print(" deg   winch: ");
  Serial.print(map(us, 600, 2400, -630, 630));
  Serial.println(" deg");
  delay(250);
}
