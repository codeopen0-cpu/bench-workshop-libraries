// Night light: the LED comes on when the light sensor says it's dark. Press the toolbar's Room
// button to dim the room, or drag the box over the sensor. The light meter prints lux (Plot them).
#include <Wire.h>
#include <BH1750.h>

#define DARK 2      // the LDR module's DO: HIGH when dark
#define LEVEL A0    // its AO: higher when darker
#define LAMP 15

BH1750 meter;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  meter.begin();
  pinMode(DARK, INPUT);
  pinMode(LAMP, OUTPUT);
}

void loop() {
  bool dark = digitalRead(DARK) == HIGH;
  digitalWrite(LAMP, dark ? HIGH : LOW);
  float lux = meter.readLightLevel();
  Serial.print("lux:");
  Serial.print(lux, 0);
  Serial.print(" ldr:");
  Serial.println(analogRead(LEVEL));
  delay(400);
}
