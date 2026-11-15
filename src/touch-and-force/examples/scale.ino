// Kitchen scale: a load cell and an HX711. Press Run, then drag a weight onto the pan: the grams
// show in the serial monitor (press Plot to graph them).
#include <HX711.h>

#define DT 2
#define SCK 3

HX711 scale;

void setup() {
  Serial.begin(115200);
  scale.begin(DT, SCK);
  Serial.println("Taring: keep the pan empty...");
  scale.tare(10);          // what the empty pan reads is zero
  scale.set_scale(420);    // counts per gram (found by weighing something known)
  Serial.println("Ready: put something on the pan");
}

void loop() {
  float grams = scale.get_units(5);
  if (abs(grams) < 0.5) grams = 0;
  Serial.print("weight:");
  Serial.println(grams, 1);
  delay(500);
}
