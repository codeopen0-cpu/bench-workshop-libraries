// Drone follows a red ball. A quadcopter (four 5 inch props on 2300 KV motors, a 4S LiPo) with an
// ESP32-S3 as its flight controller:
//   - the MPU-6050 feels how it leans and turns: it keeps it level (and turns it) by speeding up
//     some motors and slowing others,
//   - the HC-SR04 underneath measures its height,
//   - the colour-tracking camera on its nose (tilted 30 degrees down) finds the ball: it turns to
//     face it, flies to 50 cm from it, and stays 40 cm higher than it.
// Press Run: the ESCs arm, it takes off, finds the ball and flies to it. Pick the ball up and move
// it while it runs (or carry it with WASD), lift it slowly: it follows, up too. No ball in view: it
// turns on the spot to look (lifted out of view: it climbs to look first).
// Serial (115200) prints what it's doing; press Plot to see the height and distance.
//
// Motors, seen from above (nose = +x, where the camera looks):
//     FL (CW)   FR (CCW)        CW = clockwise props on straight-wired motors,
//          \ /                  CCW = counter-clockwise props on motors with two wires swapped:
//          / \                  diagonal pairs turn the same way, so their twists cancel.
//     BL (CCW)  BR (CW)
#include <Wire.h>
#include <ESP32Servo.h>
#include <BlobCam.h>

#define PIN_FR 4      // each ESC's signal wire
#define PIN_FL 5
#define PIN_BR 6
#define PIN_BL 7
#define TRIG 15       // HC-SR04 (looking down)
#define ECHO 16
#define MPU 0x68      // MPU-6050 on I2C (with the camera at 0x54)

const float HOVER_CM = 40;    // height to hold (sonar reading)
const float FOLLOW_CM = 50;   // how far from the ball to stay
const float CAM_TILT = 30;    // the camera looks this many degrees down
const float CAM_UP = 2.5;     // the camera is this much above the sonar
const float BALL_R = 4;       // the ball's radius (its middle is this high)
const float VFOV = 55;        // the camera's view, top to bottom (degrees); it is 80 x 60 pixels
const float DRAG = 0.25;      // the air slows this drone by 25 % of its speed each second

Servo escFR, escFL, escBR, escBL;
BlobCam cam;

// what it knows
float roll = 0, pitch = 0;        // degrees: roll + = right side down, pitch + = nose down
float gxBias = 0, gyBias = 0, gzBias = 0;
float gx = 0, gy = 0, gz = 0;     // turning, degrees a second (after the bias)
float ax = 0, ay = 0, az = 1;     // acceleration, g
float alt = 0, altV = 0;          // height (cm) and how fast it changes (cm/s), from the sonar
float vFwd = 0, vRight = 0;       // how fast it's moving (cm/s), forward and to the right
float ballDist = -1, ballSide = 0, ballHigh = 0;   // where the ball is: cm away, degrees right, cm up
bool ballSeen = false, sizeBased = false, lostUp = false;
int lastY = 128;
float dSize = 0, dFloor = 0;      // (the two ways of telling how far it is)
unsigned long seenAt = 0, lastSonar = 0, lastCam = 0, lastPrint = 0, lastUs = 0, startMs = 0;

// what it's doing
float altTarget = 0;
float iAlt = 0, iRollRate = 0, iPitchRate = 0, iDrift = 0;
int thrust = 1000;
int state = 0;   // 0 arming, 1 flying, 2 crashed (motors off)

int16_t rd16() {
  int v = Wire.read() << 8;
  v = v | Wire.read();
  if (v > 32767) v = v - 65536;
  return v;
}

void mpuWrite(int reg, int val) {
  Wire.beginTransmission(MPU);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

bool readImu() {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);                       // from ACCEL_XOUT_H: accel x y z, temperature, gyro x y z
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom(MPU, 14) != 14) return false;
  ax = rd16() / 8192.0;                   // +-4 g range
  ay = rd16() / 8192.0;
  az = rd16() / 8192.0;
  rd16();                                 // (temperature)
  gx = rd16() / 65.5 - gxBias;            // +-500 deg/s range
  gy = rd16() / 65.5 - gyBias;
  gz = rd16() / 65.5 - gzBias;
  return true;
}

void motors(int fr, int fl, int br, int bl) {
  escFR.writeMicroseconds(constrain(fr, 1000, 2000));
  escFL.writeMicroseconds(constrain(fl, 1000, 2000));
  escBR.writeMicroseconds(constrain(br, 1000, 2000));
  escBL.writeMicroseconds(constrain(bl, 1000, 2000));
}

void readSonar(float dt) {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  if (us <= 0 || us > 25000) return;     // no echo
  // straight down only when level: tilted, the beam is longer than the height
  float h = us / 58.0 * cos(roll * DEG_TO_RAD) * cos(pitch * DEG_TO_RAD);
  float v = (h - alt) / dt;
  altV = 0.6 * altV + 0.4 * v;
  alt = h;
}

void readCamera(float dt) {
  if (!cam.read()) return;
  if (!cam.found) {
    if (ballSeen && millis() - seenAt > 600) {
      ballSeen = false;
      lostUp = lastY < 80;                // it went out of the top of the picture: it was lifted
      if (lostUp) Serial.println("lost the ball upwards: climbing to look for it");
      else Serial.println("lost the ball: turning to look for it");
    }
    return;
  }
  // where it is: the picture's x and y are angles from the middle of the view
  float tv = tan(VFOV / 2 * DEG_TO_RAD);
  float th = tv * 80 / 60;
  float side = atan((cam.x / 255.0 - 0.5) * 2 * th) * RAD_TO_DEG;      // + = to the right
  float down = CAM_TILT + pitch + atan((cam.y / 255.0 - 0.5) * 2 * tv) * RAD_TO_DEG;   // below level
  // how far: from how wide it looks (straight-line distance, at any height; its width, because
  // the shaded underside doesn't look red, so its height comes out short), or, when the edge of
  // the picture cuts it off, from how far down it looks (as if it's on the floor)
  float wide = 2 * atan(cam.width / 255.0 * th) * RAD_TO_DEG;     // degrees, side to side
  bool whole = cam.y - cam.height / 2 > 4 && cam.y + cam.height / 2 < 251 && cam.x - cam.width / 2 > 4 && cam.x + cam.width / 2 < 251;
  sizeBased = whole && wide > 1;
  float slant = sizeBased ? BALL_R / sin(wide / 2 * DEG_TO_RAD) : 0;
  dSize = slant * cos(down * DEG_TO_RAD);                         // (along the floor)
  dFloor = down > 3 ? (alt + CAM_UP - BALL_R) / tan(down * DEG_TO_RAD) : 300;
  float d = constrain(sizeBased ? dSize : dFloor, 5, 300);
  // and how high it is (the floor = 0)
  float h = sizeBased ? alt + CAM_UP - slant * sin(down * DEG_TO_RAD) : BALL_R;
  if (!ballSeen) {
    Serial.print("ball seen: ");
    Serial.print(d, 0);
    Serial.print(" cm away, ");
    Serial.print(side, 0);
    Serial.print(" degrees right, ");
    Serial.print(h, 0);
    Serial.println(" cm up");
    ballHigh = h;
  }
  ballDist = ballSeen ? 0.6 * ballDist + 0.4 * d : d;
  ballHigh = 0.8 * ballHigh + 0.2 * h;
  ballSide = side;
  lastY = cam.y;
  ballSeen = true;
  seenAt = millis();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  escFR.setPeriodHertz(400);              // ESCs take fast updates (servos want 50)
  escFL.setPeriodHertz(400);
  escBR.setPeriodHertz(400);
  escBL.setPeriodHertz(400);
  escFR.attach(PIN_FR, 1000, 2000);
  escFL.attach(PIN_FL, 1000, 2000);
  escBR.attach(PIN_BR, 1000, 2000);
  escBL.attach(PIN_BL, 1000, 2000);
  motors(1000, 1000, 1000, 1000);         // a low signal arms the ESCs

  Wire.begin();
  mpuWrite(0x6B, 0x00);                   // wake the MPU-6050
  mpuWrite(0x1B, 0x08);                   // gyro +-500 deg/s
  mpuWrite(0x1C, 0x08);                   // accel +-4 g
  mpuWrite(0x1A, 0x03);                   // its low-pass filter (44 Hz)
  if (!readImu()) Serial.println("no MPU-6050 on I2C: check its wires");
  if (!cam.begin()) Serial.println("no camera on I2C: check its wires");
  cam.setColor(255, 0, 0);                // look for red

  // the gyro reads a little even when still: measure that while it sits on the ground
  Serial.println("keep still: measuring the gyro");
  float sx = 0, sy = 0, sz = 0;
  for (int i = 0; i < 100; i++) {
    readImu();
    sx += gx; sy += gy; sz += gz;
  }
  gxBias = sx / 100; gyBias = sy / 100; gzBias = sz / 100;
  roll = atan2(ay, az) * RAD_TO_DEG;
  pitch = atan2(-ax, az) * RAD_TO_DEG;
  readSonar(0.05);
  altTarget = alt;
  delay(1500);                            // (the ESCs arm)
  Serial.println("armed: taking off");
  state = 1;
  startMs = millis();
  lastUs = micros();
}

void loop() {
  float dt = (micros() - lastUs) / 1000000.0;
  lastUs = micros();
  dt = constrain(dt, 0.001, 0.05);
  readImu();

  // how it leans: the gyro (fast, but adds up small errors) nudged very gently by gravity. Only
  // gently: a flying drone falls with gravity, so its accelerometer can't feel which way is down
  // (it reads level even while it leans to fly along); trusted more, it would let the drone tip.
  roll = 0.999 * (roll + gx * dt) + 0.001 * atan2(ay, az) * RAD_TO_DEG;
  pitch = 0.999 * (pitch + gy * dt) + 0.001 * atan2(-ax, az) * RAD_TO_DEG;
  // how fast it moves: what the accelerometer does feel sideways in flight is the air pushing
  // back, which grows with speed (the same trick real flight controllers use, "rotor drag")
  if (alt > 10) {
    vFwd = 0.9 * vFwd + 0.1 * (-ax * 981 / DRAG);
    vRight = 0.9 * vRight + 0.1 * (ay * 981 / DRAG);
  }

  if (millis() - lastSonar >= 50) {       // the sonar 20 times a second
    float sdt = (millis() - lastSonar) / 1000.0;
    lastSonar = millis();
    readSonar(sdt);
  }
  if (millis() - lastCam >= 66) {         // the camera has a new picture 15 times a second
    float cdt = (millis() - lastCam) / 1000.0;
    lastCam = millis();
    readCamera(cdt);
  }

  if (state == 1 && (abs(roll) > 60 || abs(pitch) > 60)) {
    state = 2;
    Serial.println("crashed (tipped over): motors off");
  }
  if (state != 1) {
    motors(1000, 1000, 1000, 1000);
    return;
  }

  // 1. height: climb gently to HOVER_CM above the ball (40 cm: the ball on the floor), then hold it
  float altWant = HOVER_CM;
  if (ballSeen) altWant = constrain(ballHigh + HOVER_CM - BALL_R, 25, 150);
  else if (lostUp && millis() - seenAt < 6000) altWant = 150;    // (up to look; then back down)
  if (altTarget < altWant) altTarget = min(altWant, altTarget + 25 * dt);
  else altTarget = max(altWant, altTarget - 25 * dt);
  float altErr = altTarget - alt;
  iAlt = constrain(iAlt + 0.5 * altErr * dt, -150, 250);
  thrust = 1480 + 1.2 * altErr - 0.9 * altV + iAlt;

  // 2. where to go: face the ball, and fly forward (far) or back (too close); sideways, stay put
  float vWant = 0, yawRateWant = 0;
  if (ballSeen && alt > 15) {
    yawRateWant = constrain(-2.0 * ballSide, -60, 60);
    if (abs(ballSide) < 25) vWant = constrain(0.8 * (ballDist - FOLLOW_CM), -40, 60);   // (facing it)
  } else if (alt > 25 && !(lostUp && millis() - seenAt < 6000)) {
    yawRateWant = 30;                     // turn to the left, looking for it
  }
  // lean to speed up or slow down: a 1 degree lean pushes it along at about 17 cm/s each second
  float pitchWant = constrain(0.09 * (vWant - vFwd), -10, 10);
  iDrift = constrain(iDrift + 0.02 * vRight * dt, -3, 3);   // (a small lean that's always needed)
  float rollWant = constrain(-0.09 * vRight - iDrift, -10, 10);

  // 3. lean: how fast to tip towards the lean it wants, then the motors to turn it that fast
  float rollRateWant = 3.0 * (rollWant - roll);
  float pitchRateWant = 3.0 * (pitchWant - pitch);
  float eR = rollRateWant - gx, eP = pitchRateWant - gy;
  iRollRate = constrain(iRollRate + 0.3 * eR * dt, -40, 40);
  iPitchRate = constrain(iPitchRate + 0.3 * eP * dt, -40, 40);
  float uRoll = constrain(0.12 * eR + iRollRate, -150, 150);
  float uPitch = constrain(0.12 * eP + iPitchRate, -150, 150);
  float uYaw = constrain(1.2 * (yawRateWant - gz), -150, 150);

  // 4. mix: roll right-down = lift the left; nose down = lift the back; turn left = speed up the
  //    clockwise props (their motors twist the frame the other way)
  if (alt < 4 && altTarget < 6) { uRoll = 0; uPitch = 0; uYaw = 0; }   // (still on the ground)
  motors(thrust - uRoll - uPitch - uYaw,    // FR (CCW)
         thrust + uRoll - uPitch + uYaw,    // FL (CW)
         thrust - uRoll + uPitch + uYaw,    // BR (CW)
         thrust + uRoll + uPitch - uYaw);   // BL (CCW)

  if (millis() - lastPrint >= 200) {
    lastPrint = millis();
    Serial.print("height:");
    Serial.print(alt, 1);
    Serial.print(" ball:");
    Serial.print(ballSeen ? ballDist : 0, 1);
    Serial.print(" side:");
    Serial.print(ballSeen ? ballSide : 0, 1);
    Serial.print(" ballUp:");
    Serial.print(ballSeen ? ballHigh : 0, 1);
    Serial.print(" bySize:");
    Serial.print(dSize, 1);
    Serial.print(" byFloor:");
    Serial.print(dFloor, 1);
    Serial.print(" speed:");
    Serial.print(vFwd, 0);
    Serial.print(" drift:");
    Serial.print(vRight, 0);
    Serial.print(" turn:");
    Serial.print(gz, 0);
    Serial.print(" pitch:");
    Serial.print(pitch, 1);
    Serial.print(" roll:");
    Serial.print(roll, 1);
    Serial.print(" thrust:");
    Serial.println(thrust - 1000);
  }
}
