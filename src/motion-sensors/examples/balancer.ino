// Self-balancing robot. It would fall over on its own: the MPU-6050 feels which way it leans and how
// fast, and the wheels drive under it to catch it (a PD loop). Push it with Shift + the ball and watch
// it catch itself. Open the serial monitor and press Plot to see the angle and the motor power.
#include <Wire.h>
#include <Adafruit_MPU6050.h>

#define AIN1 2   // right motor (through the DRV8833)
#define AIN2 3
#define BIN1 5   // left motor
#define BIN2 6

Adafruit_MPU6050 mpu;

float Kp = 35;     // power per degree of lean
float Kd = 1.4;    // power per degree/second of falling
float Ks = 10;     // rolling away: lean against it (so it comes back instead of speeding off)
float angle = 0;   // lean, degrees: + = leaning back
float speed = 0;   // how fast it's rolling (a guess from the power it gives)
unsigned long last;
int n = 0;

void motor(int in1, int in2, int p) {
  p = constrain(p, -255, 255);
  if (p >= 0) { analogWrite(in1, p); analogWrite(in2, 0); }
  else        { analogWrite(in1, 0); analogWrite(in2, -p); }
}

void drive(int p) {
  motor(BIN1, BIN2, p);
  motor(AIN2, AIN1, p);   // the right motor faces the other way
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  if (!mpu.begin()) {
    Serial.println("No MPU-6050: check its wires");
    while (true) delay(100);
  }
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  last = micros();
  Serial.println("balancing");
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  float dt = (micros() - last) / 1000000.0;
  last = micros();

  // the lean from gravity (steady, but fooled while the wheels speed up) and from the gyro (fast but
  // drifts): mostly the gyro, nudged by gravity
  float accAngle = atan2(a.acceleration.x, a.acceleration.z) * 180 / PI;
  float rate = -g.gyro.y * 180 / PI;
  angle = 0.995 * (angle + rate * dt) + 0.005 * accAngle;

  if (abs(angle) > 40) {   // fallen over: stop the wheels
    drive(0);
    speed = 0;
    return;
  }
  float target = Ks * speed * 0.01;   // (lean against rolling off)
  float power = -(Kp * (angle - target) + Kd * rate);
  speed = 0.95 * speed + 0.05 * power;
  drive(power);

  if (++n % 10 == 0) {
    Serial.print("angle:");
    Serial.print(angle);
    Serial.print(" power:");
    Serial.println(power / 10);
  }
  delay(4);
}
