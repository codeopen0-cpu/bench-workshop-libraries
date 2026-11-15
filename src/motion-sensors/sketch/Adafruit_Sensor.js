// Adafruit_Sensor.h: the "unified sensor" event the Adafruit libraries fill in.
//   sensors_event_t e;  e.acceleration.x (m/s2), e.gyro.x (rad/s), e.magnetic.x (uT), e.temperature (C)
class sensors_event_t {
  constructor() {
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.gyro = { x: 0, y: 0, z: 0 };
    this.magnetic = { x: 0, y: 0, z: 0 };
    this.temperature = 0;
    this.timestamp = 0;
    this.sensor_id = 0;
    this.type = 0;
  }
}
