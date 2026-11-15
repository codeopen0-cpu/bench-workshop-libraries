
// Line-following robot: two line sensors under its nose, close together, look at the paper. Over
// the line both see black: straight on. When one slides off the edge, it steers back; if it loses
// the line altogether it turns back the way it last saw it.
#define LEFT 10    // left sensor's DO: HIGH over the black line
#define RIGHT 11   // right sensor's DO

int lastSide = 0;  // where the line was last: -1 left, 1 right

void setup() {
  Serial.begin(115200);
  pinMode(LEFT, INPUT);
  pinMode(RIGHT, INPUT);
  Serial.println("following the line");
}

void loop() {
  bool left = digitalRead(LEFT) == HIGH;
  bool right = digitalRead(RIGHT) == HIGH;
  if (left && right) drive(90, 90);                         // on the line
  else if (left) { drive(50, 120); lastSide = -1; }         // the line is going left
  else if (right) { drive(120, 50); lastSide = 1; }         // going right
  else if (lastSide < 0) drive(-30, 90);                    // lost it: turn back to it
  else if (lastSide > 0) drive(90, -30);
  else drive(100, 100);
  delay(5);
}
