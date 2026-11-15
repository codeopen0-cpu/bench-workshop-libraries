// Compass and tilt alarm. Pick the yellow sensor board up (drag it), turn it with Q / E: the heading
// changes. Tip it over (or drop it on its side) and the alarm LED lights.
#include <Wire.h>
#include <QMC5883LCompass.h>

#define TILT 2
#define ALARM 15

QMC5883LCompass compass;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  compass.init();
  pinMode(TILT, INPUT);
  pinMode(ALARM, OUTPUT);
}

void loop() {
  compass.read();
  int heading = compass.getAzimuth();
  if (heading < 0) heading += 360;
  char dir[3];
  compass.getDirection(dir, heading);

  bool tipped = digitalRead(TILT) == HIGH;
  digitalWrite(ALARM, tipped ? HIGH : LOW);

  Serial.print("heading ");
  Serial.print(heading);
  Serial.print(" deg (");
  Serial.print(dir[0]);
  Serial.print(dir[1]);
  Serial.print(dir[2]);
  Serial.print(")");
  if (tipped) Serial.print("  TIPPED OVER!");
  Serial.println();
  delay(300);
}
