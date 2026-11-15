// Clock and thermometer: the DS3231 keeps the date and time; this prints them every second.
#include <Wire.h>
#include <RTClib.h>

RTC_DS3231 rtc;
char daysOfTheWeek[7][12] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};

void print2(int n) {   // two digits: 7 -> 07
  if (n < 10) Serial.print('0');
  Serial.print(n, DEC);
}

void setup() {
  Serial.begin(115200);
  if (!rtc.begin()) {
    Serial.println("No DS3231: check its wires");
    while (true) delay(100);
  }
  if (rtc.lostPower()) {
    Serial.println("The clock lost power: setting it to when this sketch was built");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
}

void loop() {
  DateTime now = rtc.now();
  Serial.print(daysOfTheWeek[now.dayOfTheWeek()]);
  Serial.print(" ");
  Serial.print(now.year(), DEC);
  Serial.print("-");
  print2(now.month());
  Serial.print("-");
  print2(now.day());
  Serial.print("  ");
  print2(now.hour());
  Serial.print(":");
  print2(now.minute());
  Serial.print(":");
  print2(now.second());
  Serial.print("   ");
  Serial.print(rtc.getTemperature());
  Serial.println(" C");
  delay(1000);
}
