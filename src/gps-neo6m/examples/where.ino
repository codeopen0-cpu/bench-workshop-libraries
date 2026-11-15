// Where am I: reads the GPS on Serial1 and prints where it is. Wait for the fix, then pick the GPS
// up (drag it) and carry it about: 1 m on the bench is 1 m on Earth.
#include <TinyGPSPlus.h>

TinyGPSPlus gps;
double startLat = 0, startLng = 0;
bool haveStart = false;
unsigned long lastPrint = 0;

void setup() {
  Serial.begin(115200);
  Serial1.begin(9600);   // the GPS's TX goes to RX1 (GP1)
  Serial.println("waiting for a fix...");
}

void loop() {
  while (Serial1.available()) gps.encode(Serial1.read());
  if (millis() - lastPrint < 1000) return;
  lastPrint = millis();
  if (!gps.location.isValid()) {
    Serial.print("no fix yet, satellites: ");
    Serial.println(gps.satellites.value());
    return;
  }
  double lat = gps.location.lat(), lng = gps.location.lng();
  if (!haveStart) { startLat = lat; startLng = lng; haveStart = true; }
  double moved = TinyGPSPlus::distanceBetween(startLat, startLng, lat, lng);
  Serial.print(lat, 6);
  Serial.print(", ");
  Serial.print(lng, 6);
  Serial.print("  ");
  Serial.print(gps.speed.kmph(), 1);
  Serial.print(" km/h  moved ");
  Serial.print(moved * 100, 0);
  Serial.println(" cm");
}
