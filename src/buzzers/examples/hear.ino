// Hears the buzzer: a short beep every second and a half; the sound sensor beside it hears it and
// the LED lights while it does. Drag the buzzer away: far off, the beeps are too quiet to hear.
#define BUZZER 2
#define HEARD 3     // the sound sensor's DO: HIGH while it's loud
#define LED 15

unsigned long nextBeep = 0;

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER, OUTPUT);
  pinMode(HEARD, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (millis() >= nextBeep) {
    digitalWrite(BUZZER, HIGH);
    delay(150);
    digitalWrite(BUZZER, LOW);
    nextBeep = millis() + 1500;
  }
  bool heard = digitalRead(HEARD) == HIGH;
  digitalWrite(LED, heard ? HIGH : LOW);
  if (heard) Serial.println("heard it!");
  delay(10);
}
