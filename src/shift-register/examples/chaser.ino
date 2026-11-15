// Light chaser: eight LEDs on a 74HC595, from three pins. One light runs back and forth.
#define DATA 2    // DS
#define CLOCK 3   // SHCP
#define LATCH 4   // STCP

void show(byte pattern) {
  digitalWrite(LATCH, LOW);
  shiftOut(DATA, CLOCK, MSBFIRST, pattern);
  digitalWrite(LATCH, HIGH);   // the outputs change now, all at once
}

void setup() {
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  for (int i = 0; i < 8; i++) { show(1 << i); delay(80); }
  for (int i = 6; i > 0; i--) { show(1 << i); delay(80); }
}
