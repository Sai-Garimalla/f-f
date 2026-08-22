#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h> // By Nick O'Leary

// 1. YOUR RESTAURANT WI-FI
const char* ssid = "FF";
const char* password = "12345678";

// 2. YOUR HIVEMQ CLOUD DETAILS
const char* mqtt_server = "59b8ba9dc83641cba7c38e8392dde628.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "f&f";
const char* mqtt_pass = "12345678";

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);
WiFiClient printerClient; // For local TCP connection to the printer

void setup_wifi() {
  Serial.print("Connecting to Wi-Fi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ Wi-Fi Connected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// THIS FUNCTION RUNS INSTANTLY WHEN VERCEL SENDS A BILL
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("📥 Print Job Received! Topic: ");
  Serial.println(topic);

  // Extract the target Printer IP from the topic (e.g., "restaurant/printer/192.168.1.100")
  String topicStr = String(topic);
  int lastSlash = topicStr.lastIndexOf('/');
  String printerIP = topicStr.substring(lastSlash + 1);

  Serial.print("🖨️ Forwarding data to Printer IP: ");
  Serial.println(printerIP);

  // Connect locally to the TVS Printer (Port 9100)
  if (printerClient.connect(printerIP.c_str(), 9100)) {
    printerClient.write(payload, length); // Send the raw ESC/POS receipt data
    printerClient.stop();
    Serial.println("✅ Printed Successfully!");
  } else {
    Serial.println("❌ Failed to connect to local printer.");
  }
}

void reconnect() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to HiveMQ Cloud...");
    if (mqtt.connect("ESP32_Printer_Bridge", mqtt_user, mqtt_pass)) {
      Serial.println("✅ Connected!");
      // Subscribe to all printer topics sent by Vercel
      mqtt.subscribe("restaurant/printer/+"); 
    } else {
      Serial.print("❌ Failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setup_wifi();
  
  // Accept standard SSL certificates (Required for HiveMQ TLS)
  secureClient.setInsecure(); 
  
  mqtt.setServer(mqtt_server, mqtt_port);
  mqtt.setCallback(callback);
  
  // VERY IMPORTANT: Increase buffer size to hold large restaurant receipts
  mqtt.setBufferSize(4096); 
}

void loop() {
  if (!mqtt.connected()) {
    reconnect();
  }
  // This keeps the connection alive using 0 internet data and 0 polling!
  mqtt.loop(); 
}
