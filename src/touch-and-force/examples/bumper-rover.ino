
// Bumper rover: drives ahead until its bumper hits something, then backs up and turns away.
#define BUMPER 10   // the bumper's NO; its COM is on GND, so LOW = bumped

void setup() {
  Serial.begin(115200);
  pinMode(BUMPER, INPUT_PULLUP);
  Serial.println("bumper rover ready");
}

void loop() {
  if (digitalRead(BUMPER) == LOW) {
    Serial.println("bump! backing up");
    drive(-200, -200);
    delay(500);
    drive(200, -200);    // turn
    delay(400);
  } else {
    drive(200, 200);
  }
  delay(20);
}
