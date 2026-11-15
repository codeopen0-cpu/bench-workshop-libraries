// Smart servos: an STS3215 on Serial1 (1,000,000 baud) and a Dynamixel XL430 on Serial2 (57,600).
// They turn to angles, the STS spins as a wheel for a while, and both say where they are.
#include <SCServo.h>
#include <Dynamixel2Arduino.h>

SMS_STS st;
Dynamixel2Arduino dxl(Serial2, -1);
const int STS_ID = 1;
const int DXL_ID = 1;

void setup() {
  Serial.begin(115200);
  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  dxl.begin(57600);
  dxl.setPortProtocolVersion(2.0);
  Serial.print("STS3215: ");
  if (st.Ping(STS_ID) == STS_ID) Serial.println("answered");
  else Serial.println("no answer: check its wires and battery");
  Serial.print("XL430: ");
  if (dxl.ping(DXL_ID)) Serial.println("answered");
  else Serial.println("no answer: check its wires and battery");
  dxl.torqueOff(DXL_ID);
  dxl.setOperatingMode(DXL_ID, OP_POSITION);
  dxl.torqueOn(DXL_ID);
}

void report() {
  Serial.print("STS at ");
  Serial.print(st.ReadPos(STS_ID));
  Serial.print(" (of 4096), ");
  Serial.print(st.ReadVoltage(STS_ID) / 10.0, 1);
  Serial.print(" V   XL430 at ");
  Serial.print(dxl.getPresentPosition(DXL_ID, UNIT_DEGREE), 1);
  Serial.println(" deg");
}

void loop() {
  st.WritePosEx(STS_ID, 1024, 2400, 50);      // a quarter turn one way
  dxl.setGoalPosition(DXL_ID, 90.0, UNIT_DEGREE);
  delay(1500);
  report();
  st.WritePosEx(STS_ID, 3072, 2400, 50);      // a quarter turn the other way
  dxl.setGoalPosition(DXL_ID, 270.0, UNIT_DEGREE);
  delay(1500);
  report();
  st.WheelMode(STS_ID);                       // now spin as a wheel for two seconds
  st.WriteSpe(STS_ID, 2000, 50);
  delay(2000);
  st.WriteSpe(STS_ID, 0, 50);
  delay(300);
  st.PosMode(STS_ID);
  report();
}
