// Continuous servos: turn the knob (its slider in the run panel). The middle stops both servos; to
// either side they spin that way, faster the further you go. write() sets SPEED, not an angle.
#include <Servo.h>

#define KNOB A0
Servo small;    // FS90R
Servo big;      // MG996R 360

void setup() {
  Serial.begin(115200);
  small.attach(2);
  big.attach(3);
}

void loop() {
  int speed = map(analogRead(KNOB), 0, 4095, 0, 180);   // 90 = stop
  small.write(speed);
  big.write(speed);
  Serial.print("write(");
  Serial.print(speed);
  if (speed == 90) Serial.println(") = stop");
  else if (speed < 90) Serial.println(") = one way");
  else Serial.println(") = the other way");
  delay(200);
}
