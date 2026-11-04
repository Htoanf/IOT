#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <math.h>

#define DHT_PIN 4
#define DHT_TYPE DHT11
#define LIGHT_PIN 34
#define LED_1_PIN 25
#define LED_2_PIN 26
#define LED_3_PIN 27

const char* WIFI_NAME = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_SERVER = "YOUR_BROKER_LAN_IP";
const int MQTT_PORT = 2005;

const char* MQTT_USERNAME = "YOUR_MQTT_USERNAME";
const char* MQTT_PASSWORD = "YOUR_MQTT_PASSWORD";

const char* SENSOR_TOPIC = "sensor/data";
const char* CONTROL_TOPIC = "device/control/+";
const char* STATUS_TOPIC = "device/status";

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Gui sensor moi 2 giay
unsigned long previousTime = 0;
const unsigned long INTERVAL = 2000;

// ==========================
// KET NOI WIFI
// ==========================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NAME, WIFI_PASSWORD);

  Serial.print("Dang ket noi WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Da ket noi WiFi");

  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

// ==========================
// GUI TRANG THAI THIET BI
// ==========================
void publishDeviceStatus(
  int deviceId,
  const char* status,
  const char* state
) {
  char payload[128];

  snprintf(
    payload,
    sizeof(payload),
    "{\"deviceId\":%d,\"status\":\"%s\",\"state\":\"%s\"}",
    deviceId,
    status,
    state
  );

  if (mqttClient.publish(STATUS_TOPIC, payload)) {
    Serial.print("device/status ");
    Serial.println(payload);
  } else {
    Serial.println("Publish device/status that bai");
  }
}

// ==========================
// NHAN LENH MQTT
// ==========================
void mqttCallback(
  char* topic,
  byte* payload,
  unsigned int length
) {
  String topicName = String(topic);
  String message = "";

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  message.trim();
  message.toUpperCase();

  Serial.print("Nhan topic: ");
  Serial.println(topicName);

  Serial.print("Nhan payload: ");
  Serial.println(message);

  // ======================
  // DIEU KHIEN CA 3 DEN
  // ======================
  if (topicName == "device/control/all") {
    bool turnOn;

    if (message.indexOf("OFF") >= 0) {
      turnOn = false;
    }
    else if (message.indexOf("ON") >= 0) {
      turnOn = true;
    }
    else {
      Serial.println("Lenh khong hop le");

      publishDeviceStatus(1, "FAILED", "UNKNOWN");
      publishDeviceStatus(2, "FAILED", "UNKNOWN");
      publishDeviceStatus(3, "FAILED", "UNKNOWN");

      return;
    }

    digitalWrite(
      LED_1_PIN,
      turnOn ? HIGH : LOW
    );

    digitalWrite(
      LED_2_PIN,
      turnOn ? HIGH : LOW
    );

    digitalWrite(
      LED_3_PIN,
      turnOn ? HIGH : LOW
    );

    const char* state =
      turnOn ? "ON" : "OFF";

    publishDeviceStatus(
      1,
      "SUCCESS",
      state
    );

    publishDeviceStatus(
      2,
      "SUCCESS",
      state
    );

    publishDeviceStatus(
      3,
      "SUCCESS",
      state
    );

    if (turnOn) {
      Serial.println("Da bat ca 3 den");
    } else {
      Serial.println("Da tat ca 3 den");
    }

    return;
  }

  // ======================
  // DIEU KHIEN TUNG DEN
  // ======================
  int deviceId;
  int ledPin;

  if (topicName == "device/control/1") {
    deviceId = 1;
    ledPin = LED_1_PIN;
  }
  else if (topicName == "device/control/2") {
    deviceId = 2;
    ledPin = LED_2_PIN;
  }
  else if (topicName == "device/control/3") {
    deviceId = 3;
    ledPin = LED_3_PIN;
  }
  else {
    Serial.println(
      "Topic dieu khien khong hop le"
    );
    return;
  }

  // ======================
  // LENH OFF
  // ======================
  if (message.indexOf("OFF") >= 0) {
    digitalWrite(ledPin, LOW);

    Serial.print("Da tat LED ");
    Serial.println(deviceId);

    publishDeviceStatus(
      deviceId,
      "SUCCESS",
      "OFF"
    );
  }

  // ======================
  // LENH ON
  // ======================
  else if (message.indexOf("ON") >= 0) {
    digitalWrite(ledPin, HIGH);

    Serial.print("Da bat LED ");
    Serial.println(deviceId);

    publishDeviceStatus(
      deviceId,
      "SUCCESS",
      "ON"
    );
  }

  // ======================
  // LENH SAI
  // ======================
  else {
    Serial.println("Lenh khong hop le");

    publishDeviceStatus(
      deviceId,
      "FAILED",
      "UNKNOWN"
    );
  }
}

// ==========================
// KET NOI MQTT
// ==========================
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Dang ket noi MQTT...");

    String clientId = "esp32-smart-home-";

    clientId += String(
      (uint32_t)ESP.getEfuseMac(),
      HEX
    );

    if (
      mqttClient.connect(
        clientId.c_str(),
        MQTT_USERNAME,
        MQTT_PASSWORD
      )
    ) {
      Serial.println("thanh cong");

      if (
        mqttClient.subscribe(
          CONTROL_TOPIC,
          1
        )
      ) {
        Serial.print(
          "Da subscribe: "
        );

        Serial.println(
          CONTROL_TOPIC
        );
      } else {
        Serial.println(
          "Subscribe that bai"
        );
      }

    } else {
      Serial.print(
        "That bai, ma loi = "
      );

      Serial.println(
        mqttClient.state()
      );

      delay(2000);
    }
  }
}

// ==========================
// DOC LUX UOC TINH
// ==========================
float readEstimatedLux() {
  const float VCC = 3.3f;
  const float R_FIXED = 10000.0f;

  const float R_AT_10_LUX =
    50000.0f;

  const float GAMMA = 0.7f;

  int adc =
    analogRead(LIGHT_PIN);

  float voltage =
    analogReadMilliVolts(
      LIGHT_PIN
    ) / 1000.0f;

  // Ngoai gioi han ADC
  if (
    adc <= 0 ||
    adc >= 4095 ||
    voltage <= 0.0f ||
    voltage >= VCC
  ) {
    return NAN;
  }

  // Tinh dien tro LDR
  float resistance =
    R_FIXED * voltage /
    (VCC - voltage);

  // Lux uoc tinh
  float lux =
    10.0f *
    powf(
      R_AT_10_LUX / resistance,
      1.0f / GAMMA
    );

  return lux;
}

// ==========================
// GUI DU LIEU CAM BIEN
// ==========================
void publishSensorData() {
  float temperature =
    dht.readTemperature();

  float humidity =
    dht.readHumidity();

  float light =
    readEstimatedLux();

  // Kiem tra DHT
  if (
    isnan(temperature) ||
    isnan(humidity)
  ) {
    Serial.println(
      "Khong doc duoc DHT11"
    );
    return;
  }

  char lightText[32];

  if (!isfinite(light)) {
    snprintf(
      lightText,
      sizeof(lightText),
      "null"
    );

    Serial.println(
      "Anh sang ngoai gioi han"
    );
  } else {
    snprintf(
      lightText,
      sizeof(lightText),
      "%.0f",
      light
    );
  }

  // Tao JSON
  char payload[128];

  snprintf(
    payload,
    sizeof(payload),
    "{\"temperature\":%.1f,\"humidity\":%.1f,\"light\":%s}",
    temperature,
    humidity,
    lightText
  );

  // Publish
  if (
    mqttClient.publish(
      SENSOR_TOPIC,
      payload
    )
  ) {
    Serial.print(
      "sensor/data "
    );

    Serial.println(
      payload
    );
  } else {
    Serial.println(
      "Publish sensor/data that bai"
    );
  }
}

// ==========================
// SETUP
// ==========================
void setup() {
  Serial.begin(115200);

  dht.begin();

  pinMode(
    LIGHT_PIN,
    INPUT
  );

  pinMode(
    LED_1_PIN,
    OUTPUT
  );

  pinMode(
    LED_2_PIN,
    OUTPUT
  );

  pinMode(
    LED_3_PIN,
    OUTPUT
  );

  // Ban dau tat 3 den
  digitalWrite(
    LED_1_PIN,
    LOW
  );

  digitalWrite(
    LED_2_PIN,
    LOW
  );

  digitalWrite(
    LED_3_PIN,
    LOW
  );

  // ADC ESP32
  analogReadResolution(12);

  analogSetPinAttenuation(
    LIGHT_PIN,
    ADC_11db
  );

  // Ket noi
  connectWiFi();

  mqttClient.setServer(
    MQTT_SERVER,
    MQTT_PORT
  );

  mqttClient.setCallback(
    mqttCallback
  );
}

// ==========================
// LOOP
// ==========================
void loop() {
  if (
    WiFi.status() != WL_CONNECTED
  ) {
    connectWiFi();
  }

  if (
    !mqttClient.connected()
  ) {
    connectMQTT();
  }

  // Duy tri MQTT
  mqttClient.loop();

  // Gui sensor moi 2 giay
  unsigned long currentTime =
    millis();

  if (
    currentTime - previousTime
    >= INTERVAL
  ) {
    previousTime =
      currentTime;

    publishSensorData();
  }
}
