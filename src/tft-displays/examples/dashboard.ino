// Colour dashboard on a 2.8" ILI9341: a title bar, the knob as a gauge and a scrolling graph.
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

#define TFT_CS 17
#define TFT_DC 14
#define TFT_RST 15
#define KNOB A0

Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);
int x = 0;
int lastY = -1;

void setup() {
  Serial.begin(115200);
  tft.begin();
  tft.setRotation(1);                  // landscape: 320 x 240
  tft.fillScreen(ILI9341_BLACK);
  tft.fillRect(0, 0, 320, 30, ILI9341_NAVY);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(10, 8);
  tft.print("Bench dashboard");
  tft.drawRect(10, 40, 300, 40, ILI9341_LIGHTGREY);
  tft.drawRect(10, 100, 300, 130, ILI9341_DARKGREY);
  Serial.println("drawn");
}

void loop() {
  int raw = analogRead(KNOB);                  // 0 .. 4095
  int pct = map(raw, 0, 4095, 0, 100);
  // the gauge: a bar and the number
  int w = map(pct, 0, 100, 0, 296);
  uint16_t colour = pct < 50 ? ILI9341_GREEN : pct < 80 ? ILI9341_YELLOW : ILI9341_RED;
  tft.fillRect(12, 42, w, 36, colour);
  tft.fillRect(12 + w, 42, 296 - w, 36, ILI9341_BLACK);
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setCursor(250, 52);
  tft.setTextSize(2);
  tft.print(pct);
  tft.print("% ");
  // the graph: a column at a time, wrapping round
  int y = map(pct, 0, 100, 227, 103);
  tft.drawFastVLine(12 + x, 102, 126, ILI9341_BLACK);
  if (lastY >= 0) tft.drawLine(11 + x, lastY, 12 + x, y, ILI9341_CYAN);
  lastY = y;
  x = (x + 2) % 296;
  if (x == 0) lastY = -1;
  delay(50);
}
