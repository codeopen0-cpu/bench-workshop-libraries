// Colour names: the TCS34725 looks down from the arm at the white paper. Drag a coloured block
// under it.
#include <Wire.h>
#include <Adafruit_TCS34725.h>

Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);

String nameOf(float r, float g, float b, uint16_t c) {
  if (c < 300) return "nothing (too dark)";
  if (r > 0.33 && g > 0.33 && b < 0.25) return "yellow";   // (red and green together, little blue)
  if (r > 0.27 && g > 0.27 && b > 0.27 && max(r, max(g, b)) < 0.42) return "white (just the paper?)";
  if (r > g && r > b) return "red";
  if (g > r && g > b) return "green";
  return "blue";
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  if (!tcs.begin()) {
    Serial.println("No TCS34725: check its wires");
    while (true) delay(100);
  }
}

String last = "";

void loop() {
  uint16_t r, g, b, c;
  tcs.getRawData(&r, &g, &b, &c);
  float sum = r + g + b;
  if (sum < 1) sum = 1;
  String name = nameOf(r / sum, g / sum, b / sum, c);
  if (name != last) {
    Serial.print("I see ");
    Serial.print(name);
    Serial.print("  (r ");
    Serial.print(r);
    Serial.print(", g ");
    Serial.print(g);
    Serial.print(", b ");
    Serial.print(b);
    Serial.println(")");
    last = name;
  }
  delay(200);
}
