#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ======================================================
// 1. RESTAURANT WI-FI
// ======================================================

const char* ssid = "FF";
const char* password = "12345678";

// ======================================================
// 2. HIVEMQ CLOUD
// ======================================================

const char* mqtt_server =
    "59b8ba9dc83641cba7c38e8392dde628.s1.eu.hivemq.cloud";

const int mqtt_port = 8883;

const char* mqtt_user = "f&f";
const char* mqtt_pass = "12345678";

// ======================================================
// 3. TVS PRINTER
// ======================================================

const char* printerIP = "10.193.246.68";
const int printerPort = 9100;

// ======================================================
// CLIENTS
// ======================================================

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);

WiFiClient printerClient;


// ======================================================
// WIFI SETUP
// ======================================================

void setup_wifi() {

  Serial.println();
  Serial.println("======================================");
  Serial.println("      ESP32 RESTAURANT PRINT BRIDGE");
  Serial.println("======================================");

  WiFi.mode(WIFI_STA);

  Serial.print("Connecting to Wi-Fi...");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("✅ Wi-Fi Connected!");

  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("Subnet: ");
  Serial.println(WiFi.subnetMask());

  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());

  Serial.print("Printer IP: ");
  Serial.println(printerIP);

  Serial.print("Printer Port: ");
  Serial.println(printerPort);

  Serial.println();
}


// ======================================================
// MQTT CALLBACK
// ======================================================
//
// Vercel sends a print job to:
//
// restaurant/printer/10.193.246.68
//
// The ESP32 receives the receipt payload and sends it
// directly to the TVS printer over TCP port 9100.
// ======================================================

void callback(char* topic, byte* payload, unsigned int length) {

  Serial.println();
  Serial.println("======================================");
  Serial.println("📥 PRINT JOB RECEIVED");
  Serial.println("======================================");

  Serial.print("MQTT Topic: ");
  Serial.println(topic);

  Serial.print("Receipt size: ");
  Serial.print(length);
  Serial.println(" bytes");

  Serial.print("🖨️ Printing to: ");
  Serial.print(printerIP);
  Serial.print(":");
  Serial.println(printerPort);


  // ====================================================
  // CONNECT TO PRINTER
  // ====================================================

  printerClient.stop();

  printerClient.setTimeout(3000);

  Serial.println("🔌 Connecting to printer...");

  if (!printerClient.connect(printerIP, printerPort)) {

    Serial.println("❌ FAILED TO CONNECT TO PRINTER");

    Serial.println();
    Serial.println("Check:");
    Serial.println("1. Printer is powered ON");
    Serial.println("2. Printer is connected to Wi-Fi");
    Serial.println("3. Printer IP is 10.193.246.68");
    Serial.println("4. Printer port is 9100");
    Serial.println("5. ESP32 and printer are on the same network");

    printerClient.stop();

    return;
  }

  Serial.println("✅ Connected to printer!");


  // ====================================================
  // SEND RAW ESC/POS RECEIPT
  // ====================================================

  size_t bytesSent = printerClient.write(payload, length);

  printerClient.flush();

  Serial.print("📤 Sent ");
  Serial.print(bytesSent);
  Serial.print(" / ");
  Serial.print(length);
  Serial.println(" bytes");


  if (bytesSent == length) {

    Serial.println("✅ Receipt sent successfully!");

  } else {

    Serial.println("⚠️ WARNING: Not all receipt data was sent.");
  }


  // Give printer time to process
  delay(300);

  printerClient.stop();

  Serial.println("🖨️ Printer connection closed.");

  Serial.println("======================================");
}


// ======================================================
// MQTT RECONNECT
// ======================================================

void reconnect() {

  while (!mqtt.connected()) {

    Serial.println();
    Serial.print("🔄 Connecting to HiveMQ Cloud...");


    // Unique MQTT client ID
    String clientId = "ESP32_Printer_Bridge_";

    clientId += String((uint32_t)ESP.getEfuseMac(), HEX);


    if (mqtt.connect(
          clientId.c_str(),
          mqtt_user,
          mqtt_pass)) {

      Serial.println("✅ Connected!");


      // Subscribe to all printer print jobs
      if (mqtt.subscribe("restaurant/printer/+")) {

        Serial.println("📡 Subscribed to:");
        Serial.println("restaurant/printer/+");

      } else {

        Serial.println("❌ MQTT subscription failed.");
      }

    } else {

      Serial.print("❌ MQTT connection failed. rc=");
      Serial.println(mqtt.state());

      Serial.println("Retrying in 5 seconds...");

      delay(5000);
    }
  }
}


// ======================================================
// SETUP
// ======================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  setup_wifi();


  // ====================================================
  // HIVEMQ TLS
  // ====================================================
  //
  // Keeps your existing working HiveMQ configuration.
  // For production, certificate verification should
  // eventually be enabled.
  // ====================================================

  secureClient.setInsecure();


  mqtt.setServer(mqtt_server, mqtt_port);

  mqtt.setCallback(callback);


  // Supports large restaurant receipts
  mqtt.setBufferSize(4096);


  Serial.println("✅ ESP32 setup complete.");

  Serial.println();
  Serial.println("======================================");
  Serial.println("Printer configuration:");
  Serial.print("IP:   ");
  Serial.println(printerIP);
  Serial.print("Port: ");
  Serial.println(printerPort);
  Serial.println("======================================");
}


// ======================================================
// MAIN LOOP
// ======================================================

void loop() {

  // ----------------------------------------------------
  // Reconnect Wi-Fi if disconnected
  // ----------------------------------------------------

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("⚠️ Wi-Fi disconnected.");

    setup_wifi();
  }


  // ----------------------------------------------------
  // Reconnect MQTT if disconnected
  // ----------------------------------------------------

  if (!mqtt.connected()) {

    reconnect();
  }


  // ----------------------------------------------------
  // Keep MQTT connection alive
  // ----------------------------------------------------

  mqtt.loop();
}
