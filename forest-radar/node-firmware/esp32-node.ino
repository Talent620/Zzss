// esp32-node.ino — Forest Radar node (ESP32). Device-free RTI mesh.
//
// Each node broadcasts a tiny beacon over ESP-NOW and measures the RSSI of every
// peer's beacon. A person walking between two nodes attenuates that link's RSSI;
// the hub collects all link RSSI and the phone reconstructs WHERE the person is.
//
// Roles:
//   - Set NODE_ID unique per node (0..N-1) and flash each unit.
//   - One node is the HUB (IS_HUB=1): it also runs a SoftAP + WebSocket/HTTP and
//     streams the link table to the phone running radar.html (live mode).
//
// Hardware: any ESP32 (bare module + LiPo/solar works for a forest perimeter).
// Libraries: esp_now.h, WiFi.h (built into ESP32 Arduino core). For the hub's
// WebSocket use the "ESPAsyncWebServer" + "AsyncTCP" libs (see README).

#include <esp_now.h>
#include <WiFi.h>

#define NODE_ID   0          // <-- unique per unit
#define NUM_NODES 8
#define IS_HUB    (NODE_ID == 0)
#define BEACON_MS 60         // beacon period (ms) -> ~16 Hz per node

uint8_t bcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
typedef struct { uint8_t id; uint32_t seq; } Beacon;
volatile int   rssiOf[NUM_NODES];      // last RSSI heard from each peer
volatile uint32_t seenAt[NUM_NODES];   // millis of last beacon per peer
uint32_t seq = 0;

// ESP-NOW receive callback gives us the RSSI in rx_ctrl.
void onRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len < (int)sizeof(Beacon)) return;
  const Beacon *b = (const Beacon *)data;
  if (b->id < NUM_NODES) { rssiOf[b->id] = info->rx_ctrl->rssi; seenAt[b->id] = millis(); }
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) { Serial.println("esp_now init FAIL"); return; }
  esp_now_register_recv_cb(onRecv);
  esp_now_peer_info_t peer = {}; memcpy(peer.peer_addr, bcast, 6); peer.channel = 1; peer.encrypt = false;
  esp_now_add_peer(&peer);
  for (int i = 0; i < NUM_NODES; i++) { rssiOf[i] = -127; seenAt[i] = 0; }
  // IS_HUB: also bring up SoftAP "ForestRadar" + a WebSocket server here (see README)
  Serial.printf("node %d up (hub=%d)\n", NODE_ID, IS_HUB);
}

void loop() {
  // 1) beacon
  Beacon b = { NODE_ID, seq++ };
  esp_now_send(bcast, (uint8_t *)&b, sizeof(b));

  // 2) every ~250 ms, emit this node's RSSI row as JSON (hub forwards to phone)
  static uint32_t t = 0;
  if (millis() - t > 250) {
    t = millis();
    Serial.printf("{\"node\":%d,\"rssi\":[", NODE_ID);
    for (int i = 0; i < NUM_NODES; i++) {
      bool fresh = (millis() - seenAt[i] < 1000);
      Serial.printf("%d%s", fresh ? rssiOf[i] : -127, i < NUM_NODES - 1 ? "," : "");
    }
    Serial.println("]}");
    // HUB: also push this row over WebSocket to all connected phones.
  }
  delay(BEACON_MS);
}

// ── Phone side (radar.html "NA ŻYWO") expects, per ~250 ms, the full matrix ──
// rssi[i][j]. It computes the per-link drop = baseline[i][j] - rssi[i][j]
// (baseline = median over a quiet calibration window) and feeds drops[] to
// RTI.step(). Baseline auto-learns in the first ~10 s of "empty forest".
