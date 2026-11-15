// BlobCam for sketches: talks to the colour-tracking camera over I2C (Wire).
//   BlobCam cam;              (or BlobCam cam(0x55); for the other address)
//   cam.begin();
//   cam.setColor(255, 0, 0);  the colour to track (red)
//   if (cam.read() && cam.found) { cam.x, cam.y (0-255), cam.width, cam.height, cam.size }
class BlobCam {
  constructor(addr = 0x54) {
    this.addr = addr;
    this.found = false;
    this.x = 128;
    this.y = 128;
    this.width = 0;
    this.height = 0;
    this.size = 0;
  }
  begin() {
    Wire.begin();
    Wire.beginTransmission(this.addr);
    return Wire.endTransmission() === 0; // true if the camera answered
  }
  setColor(r, g, b) {
    Wire.beginTransmission(this.addr);
    Wire.write(0x10);
    Wire.write(r);
    Wire.write(g);
    Wire.write(b);
    return Wire.endTransmission() === 0;
  }
  /** ask what it sees now; false if the camera didn't answer */
  read() {
    Wire.beginTransmission(this.addr);
    Wire.write(0x00);
    if (Wire.endTransmission() !== 0) return false;
    if (Wire.requestFrom(this.addr, 6) !== 6) return false;
    this.found = Wire.read() === 1;
    this.x = Wire.read();
    this.y = Wire.read();
    this.width = Wire.read();
    this.height = Wire.read();
    this.size = Wire.read();
    return true;
  }
}
