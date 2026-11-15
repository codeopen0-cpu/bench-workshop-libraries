// Door lock: hold a tag to the reader (drag it onto the coil). The key fob is on the list: green.
// Anything else: red. Each tag also counts its visits in its own memory (block 4).
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 17    // the reader's SDA
#define RST_PIN 15
#define GREEN 13
#define RED 14

MFRC522 rfid(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key key;
byte allowed[4] = {0xAA, 0xBB, 0xCC, 0xDD};

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_DumpVersionToSerial();
  for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;   // a new tag's key
  pinMode(GREEN, OUTPUT);
  pinMode(RED, OUTPUT);
  Serial.println("Hold a tag to the reader");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }
  Serial.print("Tag:");
  for (byte i = 0; i < rfid.uid.size; i++) {
    Serial.print(rfid.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(rfid.uid.uidByte[i], HEX);
  }
  Serial.println();

  bool ok = true;
  for (byte i = 0; i < 4; i++) if (rfid.uid.uidByte[i] != allowed[i]) ok = false;

  // its visits, kept in the tag itself
  byte block = 4;
  byte buffer[18];
  byte size = sizeof(buffer);
  MFRC522::StatusCode status = (MFRC522::StatusCode) rfid.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, block, &key, &(rfid.uid));
  if (status == MFRC522::STATUS_OK) {
    status = rfid.MIFARE_Read(block, buffer, &size);
    if (status == MFRC522::STATUS_OK) {
      buffer[0] = buffer[0] + 1;
      rfid.MIFARE_Write(block, buffer, 16);
      Serial.print("visits: ");
      Serial.println(buffer[0]);
    }
  } else {
    Serial.print("couldn't open its memory: ");
    Serial.println(rfid.GetStatusCodeName(status));
  }

  Serial.println(ok ? "Welcome in" : "Not on the list");
  digitalWrite(ok ? GREEN : RED, HIGH);
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500);
  digitalWrite(GREEN, LOW);
  digitalWrite(RED, LOW);
}
