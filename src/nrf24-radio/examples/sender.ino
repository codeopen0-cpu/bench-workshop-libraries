// Radio remote, the sending end: turn the knob (its slider in the run panel); the angle goes out by
// radio 20 times a second. radio.write() says whether the other end got it.
#include <SPI.h>
#include <RF24.h>

RF24 radio(14, 17);            // CE, CSN
const byte address[6] = "00001";
int sent = 0, lost = 0;

void setup() {
  Serial.begin(115200);
  if (!radio.begin()) {
    Serial.println("The radio isn't answering: check its wires (and 3.3 V)");
    while (true) delay(100);
  }
  radio.openWritingPipe(address);
  radio.setPALevel(RF24_PA_LOW);
  radio.stopListening();
}

void loop() {
  int angle = map(analogRead(A0), 0, 4095, 0, 180);
  bool ok = radio.write(&angle, sizeof(angle));
  if (ok) sent++; else lost++;
  if ((sent + lost) % 20 == 0) {
    Serial.print("angle ");
    Serial.print(angle);
    Serial.print("   got there: ");
    Serial.print(sent);
    Serial.print("   lost: ");
    Serial.println(lost);
  }
  delay(50);
}
