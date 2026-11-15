// Data logger: the knob's reading goes into log.csv on the SD card twice a second; every 10 lines
// the whole file is read back and printed. Turn the knob (its slider in the run panel).
#include <SPI.h>
#include <SD.h>

#define SD_CS 17
int lines = 0;

void setup() {
  Serial.begin(115200);
  if (!SD.begin(SD_CS)) {
    Serial.println("No SD card: check the module's wires (and that a card is in it)");
    while (true) delay(100);
  }
  if (SD.exists("log.csv")) SD.remove("log.csv");
  File f = SD.open("log.csv", FILE_WRITE);
  f.println("time_ms,knob");
  f.close();
  Serial.println("logging to log.csv");
}

void loop() {
  File f = SD.open("log.csv", FILE_WRITE);
  if (f) {
    f.print(millis());
    f.print(",");
    f.println(analogRead(A0));
    f.close();
    lines++;
  }
  if (lines % 10 == 0) {
    Serial.println("--- log.csv so far ---");
    File r = SD.open("log.csv");
    while (r.available()) Serial.write(r.read());
    r.close();
  }
  delay(500);
}
