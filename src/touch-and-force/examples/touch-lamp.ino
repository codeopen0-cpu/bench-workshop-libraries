// Touch lamp: touch the pad (hold Shift and touch it with the ball, or press Touch in the run panel)
// to switch the lamp; drag the slide pot's knob to dim it; press the force pad and see how hard.
#define PAD 2
#define LAMP 15
#define DIMMER A0
#define FORCE A1

bool on = false;
bool wasTouched = false;

void setup() {
  Serial.begin(115200);
  pinMode(PAD, INPUT);
  pinMode(LAMP, OUTPUT);
}

void loop() {
  bool touched = digitalRead(PAD) == HIGH;
  if (touched && !wasTouched) {
    on = !on;
    Serial.println(on ? "lamp on" : "lamp off");
  }
  wasTouched = touched;

  int level = analogRead(DIMMER);          // 0 .. 4095
  int brightness = map(level, 0, 4095, 0, 255);
  analogWrite(LAMP, on ? brightness : 0);

  int force = analogRead(FORCE);
  if (force > 100) {
    Serial.print("squeeze:");
    Serial.println(force);
  }
  delay(50);
}
