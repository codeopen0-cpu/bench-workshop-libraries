// Radio remote, the receiving end: each angle that arrives turns the servo.
#include <SPI.h>
#include <RF24.h>
#include <Servo.h>

RF24 radio(14, 17);            // CE, CSN
const byte address[6] = "00001";
Servo servo;

void setup() {
  Serial.begin(115200);
  if (!radio.begin()) {
    Serial.println("The radio isn't answering: check its wires (and 3.3 V)");
    while (true) delay(100);
  }
  radio.openReadingPipe(0, address);
  radio.setPALevel(RF24_PA_LOW);
  radio.startListening();
  servo.attach(15);
}

int last = -1;

void loop() {
  if (radio.available()) {
    int angle = 0;
    radio.read(&angle, sizeof(angle));
    servo.write(angle);
    if (angle != last) {
      Serial.print("angle: ");
      Serial.println(angle);
      last = angle;
    }
  }
}
