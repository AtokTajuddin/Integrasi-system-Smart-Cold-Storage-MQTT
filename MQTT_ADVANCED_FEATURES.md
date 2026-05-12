# 🚀 MQTT 5.0 Advanced Features - Dokumentasi Lengkap

Panduan detail tentang advanced MQTT 5.0 features yang diimplementasikan dalam Medicold system.

---

## 📑 Daftar Isi

1. [MQTT 5.0 Overview](#mqtt-50-overview)
2. [Message Expiry Interval](#message-expiry-interval)
3. [User Properties](#user-properties)
4. [Topic Alias](#topic-alias)
5. [Last Will & Testament](#last-will--testament)
6. [Request-Response Pattern](#request-response-pattern)
7. [Best Practices](#best-practices)
8. [Perbandingan Protocol](#perbandingan-protocol)

---

## MQTT 5.0 Overview

### Apa itu MQTT 5.0?

**MQTT 5.0** (diterbitkan 2017) adalah upgrade dari MQTT 3.1.1 dengan fitur enterprise-grade:

| Fitur | MQTT 3.1.1 | MQTT 5.0 |
|-------|-----------|---------|
| Message Expiry | ❌ | ✅ Auto-cleanup |
| User Properties | ❌ | ✅ Custom metadata |
| Topic Alias | ❌ | ✅ Bandwidth optimize |
| Last Will Properties | ❌ | ✅ Delayed will |
| Request-Response | ⚠️ Manual | ✅ Pattern built-in |
| Session Expiry | ❌ | ✅ Persistent session |
| Shared Subscriptions | ❌ | ✅ Load balancing |
| Message Routing | Manual | ✅ Content-based |

---

## Message Expiry Interval

### Konsep

**Message Expiry Interval**: Otomatis hapus message dari broker setelah N detik.

```
Publish message dengan expiry=3600
         ↓
Broker menyimpan message
         ↓
Setelah 3600 detik (1 jam), message dihapus otomatis
         ↓
Subscriber baru tidak dapat message lama
```

### Implementasi di Medicold

```javascript
// src/shared/mqttClient.js - publishJson()

await publishJson(client, topic, message, {
  qos: 1,
  retain: true,
  messageExpiryInterval: 24 * 3600,  // ← 24 jam untuk snapshot
  source: "medicold-core",
  priority: "normal"
});

// Non-retained message:
await publishJson(client, topic, message, {
  qos: 1,
  retain: false,
  messageExpiryInterval: 5 * 60,  // ← 5 menit untuk events
  source: "medicold-core"
});
```

### Expiry Policy di Medicold

| Message Type | Retain | Expiry | Alasan |
|--------------|--------|--------|--------|
| Telemetry snapshot | ✅ | 24h | Data sensor terbaru perlu disimpan sehari |
| Status update | ✅ | 1h | Status bisa berubah cepat |
| Alert latest | ✅ | 1h | Alert aktif perlu cepat di-clear |
| Alert stream (live) | ❌ | 5m | Event tidak perlu disimpan, hanya live |
| Inventory snapshot | ✅ | 24h | Batch data stabil |
| Box snapshot | ✅ | 24h | Box registry jarang berubah |
| Response message | ❌ | 5m | Response timeframe 5 menit |
| Command message | ❌ | - | Non-retained, tidak expire |

### Benefit

#### 1. **Broker Memory Optimization**
```
TANPA Expiry:
┌─────────────────────────────────────┐
│ Retained Messages (tanpa batas)     │
│ - Message A dari 2025 (500 byte)    │ ← LAMA, belum dihapus!
│ - Message B dari 2025 (500 byte)    │ ← LAMA, belum dihapus!
│ - Message C dari sekarang (500 byte)│ ✓ Fresh data
│ Total: Terus bertambah, memory leak  │
└─────────────────────────────────────┘

DENGAN Expiry (24h):
┌─────────────────────────────────────┐
│ Retained Messages (auto-cleanup)    │
│ - Message A dihapus (expired 24h)   │ ← Cleared!
│ - Message B dihapus (expired 24h)   │ ← Cleared!
│ - Message C dari sekarang (500 byte)│ ✓ Fresh data
│ Total: Bounded memory (selalu < X)  │
└─────────────────────────────────────┘
```

#### 2. **Freshness Guarantee**
```javascript
// Subscriber tahu message tidak lebih tua dari 24 jam
const reading = await subscribeToTelemetry("FRIDGE-A");
const age = Date.now() - reading.emitted_at;

if (age > 24 * 3600 * 1000) {
  // Message sudah expired, ini data baru!
  console.log("Fresh data, not stale");
}
```

#### 3. **Automatic Cleanup**
- Tidak perlu manual delete
- Broker otomatis cleanup sesuai interval
- Hemat storage & bandwidth

### Monitoring Message Age

```bash
# Check message expiry di mosquitto
mosquitto_sub -h localhost -t "medicold/+/telemetry/latest" \
  --remove-retained

# Lihat berapa lama message bertahan di broker
echo "Message akan dihapus setelah 24 jam"
```

---

## User Properties

### Konsep

**User Properties**: Custom key-value metadata di MQTT message header (MQTT 5.0).

```
┌─────────────────────────────────────────┐
│ MQTT Message                            │
├─────────────────────────────────────────┤
│ Header:                                 │
│  - QoS: 1                               │
│  - Retain: true                         │
│  - Expiry: 3600                         │
│  - User Properties:          ← NEW!     │
│    • correlation-id: abc123             │
│    • source: medicold-core              │
│    • priority: high                     │
│    • timestamp: 2026-05-12T10:30:45Z    │
├─────────────────────────────────────────┤
│ Payload:                                │
│ {                                       │
│   "schema": "medicold.mqtt.v1",         │
│   "type": "alert.new",                  │
│   "payload": { ... }                    │
│ }                                       │
└─────────────────────────────────────────┘
```

### Implementasi di Medicold

```javascript
// src/shared/mqttClient.js - publishJson()

const userProperties = {};
if (options.correlationId) {
  userProperties["correlation-id"] = options.correlationId;
}
if (options.source) {
  userProperties["source"] = options.source;
}
if (options.priority) {
  userProperties["priority"] = options.priority; // high|normal|low
}

await publishJson(client, topic, message, {
  qos: 1,
  retain: true,
  userProperties,  // ← Di-set di MQTT header, bukan payload
  source: "medicold-core",
  priority: "high"
});
```

### User Properties yang Digunakan

| Property | Values | Use Case |
|----------|--------|----------|
| `correlation-id` | UUID string | Match request-response |
| `source` | `medicold-core`, `dashboard`, `sensor` | Trace origin |
| `priority` | `critical`, `high`, `normal`, `low` | Message routing |
| `timestamp` | ISO 8601 | Message creation time |
| `client-id` | UUID | Tracking client |

### Benefit

#### 1. **Request-Response Correlation**
```javascript
// Dashboard mengirim command:
const commandId = randomUUID();
await publishJson(client, topic, {
  command: "delete_box",
  box_id: "BOX-1"
}, {
  userProperties: {
    "correlation-id": commandId
  }
});

// Core menerima command:
client.on("message", (topic, payload, packet) => {
  const correlationId = packet.properties?.userProperties?.["correlation-id"];
  
  // Process command
  const result = deleteBox("BOX-1");
  
  // Publish response dengan correlation-id sama:
  await publishJson(client, replyTopic, result, {
    userProperties: {
      "correlation-id": correlationId  // ← Link ke request!
    }
  });
});

// Dashboard terima response:
client.on("message", (topic, payload, packet) => {
  const correlationId = packet.properties?.userProperties?.["correlation-id"];
  
  // Match response ke pending request
  if (pendingRequests[correlationId]) {
    pendingRequests[correlationId].resolve(payload);
  }
});
```

#### 2. **Priority-Based Message Handling**
```javascript
// Broker bisa prioritize message berdasarkan user property
// High priority messages dikirim lebih dulu (jika congestion)

client.on("message", (topic, payload, packet) => {
  const priority = packet.properties?.userProperties?.["priority"];
  
  if (priority === "critical") {
    // Handle immediately, top priority
    handleCritical(payload);
  } else if (priority === "high") {
    // Handle soon
    handleHigh(payload);
  } else {
    // Handle normal
    handleNormal(payload);
  }
});
```

#### 3. **Message Tracing & Debugging**
```javascript
// Trace message path:
// Dashboard → Core → Broker → Dashboard

const packet = {
  properties: {
    userProperties: {
      "correlation-id": "req-123",
      "source": "dashboard",
      "timestamp": "2026-05-12T10:30:00Z"
    }
  }
};

// Core log:
console.log(`Received from ${packet.properties.userProperties['source']}`);
console.log(`Correlation: ${packet.properties.userProperties['correlation-id']}`);

// Dashboard log:
console.log(`Response for ${correlationId} received in 150ms`);
```

#### 4. **Reduce Message Payload**
```javascript
// TANPA User Properties:
{
  "correlation_id": "abc123",    // Duplicate di payload
  "source": "medicold-core",     // Bisa dilihat di header
  "priority": "high",            // Bisa dilihat di header
  "timestamp": "2026-05-12...",  // Bisa dilihat di header
  "actual_data": { ... }
}

// DENGAN User Properties (lebih lean):
// Header punya:
//   userProperties: { "correlation-id", "source", "priority" }
// Payload:
{
  "actual_data": { ... }  // Payload lebih kecil!
}
```

---

## Topic Alias

### Konsep

**Topic Alias**: Gunakan nomor (0-65535) untuk replace topic string panjang.

```
Publish 1: topic="medicold/FRIDGE-A/telemetry/stream" (36 byte)
           properties.topicAlias=1
           
Publish 2: topic=null (0 byte!)
           properties.topicAlias=1  ← Reuse alias 1
           
Publish 3: topic=null (0 byte!)
           properties.topicAlias=1  ← Reuse alias 1

Saved bandwidth: 36 byte × 99 publishes = 3,564 byte!
```

### Implementasi di Medicold

```javascript
// src/shared/mqttClient.js - publishJson()

if (options.topicAlias) {
  publishOptions.properties = publishOptions.properties || {};
  publishOptions.properties.topicAlias = options.topicAlias;
}

// Usage:
// First publish: set alias
await publishJson(client, "medicold/FRIDGE-A/telemetry/stream", message, {
  topicAlias: 1  // First time set alias
});

// Subsequent publishes: reuse alias
await publishJson(client, null, message, {
  topicAlias: 1  // Reuse alias, topic=null
});
```

### Benefit

#### 1. **Bandwidth Optimization**
```
For high-frequency publishing:

Sensor publish temperature 100x per hour
Without topic alias:
- Topic string: 36 bytes
- Total: 36 × 100 = 3,600 bytes/hour

With topic alias:
- First: 36 bytes (set alias)
- Rest: 0 bytes (just alias number)
- Total: 36 + (0 × 99) = 36 bytes/hour

Savings: 99% bandwidth reduction! 🚀

For 1,000 sensors:
Without: 3,600 KB/hour
With: 36 KB/hour
Save: 3,564 KB/hour = ~25 MB/day
```

#### 2. **Latency Improvement**
```
Less data = Faster transmission

MQTT packet size:
- Fixed header: ~2 bytes
- Variable header: ~10 bytes
- Topic: 36 bytes (long)
- Payload: 100 bytes
Total: ~148 bytes

With topic alias:
- Fixed header: ~2 bytes
- Variable header: ~10 bytes
- Alias: 2 bytes (instead of 36)
- Payload: 100 bytes
Total: ~114 bytes

Reduction: 34 bytes per message
For 1,000 msg/sec: 34 KB/sec faster! ⚡
```

### IoT Use Cases
```javascript
// Constrained devices (sensor dengan CPU/bandwidth terbatas)
const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://broker");

// Device hanya punya 128KB RAM, connection 2G LTE
// Topic string terlalu boros

// Setup alias once:
client.publish("device/sensor-001/temperature", "25.5", {
  properties: { topicAlias: 1 }
});

// Then reuse:
setInterval(() => {
  client.publish(null, "25.6", {  // null topic
    properties: { topicAlias: 1 }  // Use alias 1
  });
}, 1000);
```

---

## Last Will & Testament

### Konsep

**Last Will & Testament (LWT)**: Message yang otomatis dipublish broker saat client disconnect.

```
Client connect → setup will message
         ↓
Client jalan normal
         ↓
Client disconnect (crash/network fail)
         ↓
Broker otomatis publish will message
         ↓
Other subscribers dapat notifikasi
```

### Implementasi di Medicold

```javascript
// src/shared/mqttClient.js - createMqttClient()

const willTopic = options.willTopic || 
  `${process.env.MQTT_TOPIC_ROOT || "medicold"}/system/client-status`;

const willMessage = JSON.stringify({
  schema: "medicold.mqtt.v1",
  type: "client.offline",
  client_id: clientId,
  disconnected_at: new Date().toISOString(),
  reason: "connection-lost"
});

return mqtt.connect(BROKER_URL, {
  will: {
    topic: willTopic,
    payload: willMessage,
    qos: 1,
    retain: false,
    properties: {
      willDelayInterval: 1  // Delay 1 detik sebelum publish
    }
  }
});
```

### Last Will Topics di Medicold

```
medicold/system/client-status

Message:
{
  "schema": "medicold.mqtt.v1",
  "type": "client.offline",
  "client_id": "medicold-core-xxxxx",
  "disconnected_at": "2026-05-12T10:30:45.123Z",
  "reason": "connection-lost"
}
```

### Benefit

#### 1. **Client Health Monitoring**
```javascript
// Dashboard subscribe to client status
client.subscribe("medicold/system/client-status");

client.on("message", (topic, payload) => {
  const msg = JSON.parse(payload);
  
  if (msg.type === "client.offline") {
    // Alert: Core service offline!
    updateStatus(msg.client_id, "OFFLINE");
    
    // Trigger notification
    notifyAdmins({
      title: "⚠️ Core Service Disconnected",
      message: `${msg.client_id} disconnected at ${msg.disconnected_at}`,
      severity: "HIGH"
    });
  }
});
```

#### 2. **Graceful Degradation**
```javascript
// Core service offline → Dashboard show offline indicator

Dashboard:
┌────────────────────────────────┐
│ Medicold MQTT Dashboard        │
│                                │
│ Status: ⚠️ OFFLINE             │
│ Message: Core service lost     │
│ Disconnected: 2 minutes ago    │
│                                │
│ [Last data available]          │
│ Sensor data: May 12 10:28 UTC  │
│ Boxes: 15 registered           │
│ Alerts: 2 active (not updated) │
└────────────────────────────────┘
```

#### 3. **Automatic Alert Resolution**
```javascript
// Jika sensor disconnect, auto-resolve alert

class AlertManager {
  onClientOffline(clientId) {
    const alerts = store.getAlerts(clientId);
    
    // Resolve pending alerts otomatis
    for (const alert of alerts) {
      if (alert.status === "UNRESOLVED") {
        store.resolveAlert(alert.id, "SYSTEM", "Client offline, auto-resolved");
        
        publishJson(client, topics.alertStream(clientId), {
          type: "alert.auto_resolved",
          alert_id: alert.id,
          reason: "client_offline"
        });
      }
    }
  }
}
```

#### 4. **Session Cleanup**
```javascript
// Core service cleanup stale connections

// Subscribe to all client statuses
client.subscribe("medicold/system/client-status");

const deadClients = new Set();

client.on("message", (topic, payload) => {
  const msg = JSON.parse(payload);
  deadClients.add(msg.client_id);
  
  // After 5 minutes, cleanup state
  setTimeout(() => {
    if (deadClients.has(msg.client_id)) {
      store.removeClient(msg.client_id);
      console.log(`Cleaned up stale client: ${msg.client_id}`);
    }
  }, 5 * 60 * 1000);
});
```

### Will Delay Interval

```javascript
// willDelayInterval: delay before publishing will message

// Scenario 1: Network blip (reconnect dalam 1 detik)
connect → network fail → WAIT 1 detik → reconnect ✓
         (will message NOT published)

// Scenario 2: Real disconnect (network down > 1 detik)
connect → network down → WAIT 1 detik → publish will ✓
         (other clients get notification)

Benefits:
- Avoid false alerts dari network blip
- Still notify on real disconnects
- Configurable delay (1-65535 seconds)
```

---

## Request-Response Pattern

### Konsep

**Request-Response**: Client kirim request + correlation_id, server reply dengan correlation_id sama.

```
Timeline:
t=0:   Dashboard publish request
       topic: medicold/+/inventory/commands/register
       payload: { command, correlation_id: "req-123", reply_to: "medicold/replies/dashboard" }
       
t=10ms: Core receive request
       Process command
       
t=50ms: Core publish response
       topic: medicold/replies/dashboard
       payload: { ok: true, result, correlation_id: "req-123" }
       
t=60ms: Dashboard receive response
       Match response ke pending request
       Callback resolve(response)
```

### Implementasi di Medicold

#### Server Side (Core)
```javascript
// src/server/core.js

async function publishResponse(replyTo, correlationId, response, options = {}) {
  if (!replyTo) return;
  
  await publishJson(
    client,
    replyTo,
    {
      correlation_id: correlationId,
      ...response
    },
    {
      qos: 1,
      retain: false,
      correlationId,        // User property
      source: "medicold-core",
      priority: options.priority || (response.ok ? "normal" : "high"),
      messageExpiryInterval: 5 * 60  // Response expires dalam 5 menit
    }
  );
}

// Handle inventory register command
async function handleInventoryRegister(message) {
  try {
    const result = registerBatch(store, message);
    
    // Publish success response
    await publishResponse(
      message.reply_to,
      message.correlation_id,
      { ok: true, result }
    );
  } catch (error) {
    // Publish error response dengan priority high
    await publishResponse(
      message.reply_to,
      message.correlation_id,
      { ok: false, error: { code: error.code, message: error.message } },
      { priority: "high" }
    );
  }
}
```

#### Client Side (Dashboard)
```javascript
// src/client/dashboard.js (contoh)

class RequestResponseTracker {
  constructor(timeoutMs = 30000) {
    this.pending = new Map();
    this.timeoutMs = timeoutMs;
  }
  
  sendRequest(topic, message, replyTopic) {
    const correlationId = randomUUID();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      
      this.pending.set(correlationId, { resolve, reject, timeout });
      
      // Publish request
      client.publish(topic, JSON.stringify({
        ...message,
        correlation_id: correlationId,
        reply_to: replyTopic
      }), { qos: 1, retain: false });
    });
  }
  
  resolveRequest(correlationId, response) {
    const pending = this.pending.get(correlationId);
    if (!pending) return;
    
    clearTimeout(pending.timeout);
    pending.resolve(response);
    this.pending.delete(correlationId);
  }
}

// Usage:
const rrc = new RequestResponseTracker();

// Send request:
try {
  const response = await rrc.sendRequest(
    "medicold/FRIDGE-A/inventory/commands/register",
    { batch_id: "BATCH-001", items: [...] },
    "medicold/replies/dashboard"
  );
  
  console.log("✅ Batch registered:", response.result);
} catch (error) {
  console.error("❌ Registration failed:", error.message);
}

// Subscribe to responses:
client.subscribe("medicold/replies/dashboard");
client.on("message", (topic, payload) => {
  const response = JSON.parse(payload);
  rrc.resolveRequest(response.correlation_id, response);
});
```

### Request-Response Flow Diagram

```
Dashboard                    Core                   Broker
    │                         │                       │
    │ Publish command         │                       │
    ├───────────────────────────────────────────────→ │
    │ topic: medicold/FRIDGE-A/inventory/...          │
    │ body: { command, correlation_id: "req-123" }    │
    │                         │                       │
    │                         │ Subscribe pattern    │
    │                         │← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                         │                       │
    │                         │ Receive command      │
    │                         │← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                         │                       │
    │                  [Process command]              │
    │                         │                       │
    │                         │ Publish response      │
    │                         ├───────────────────────→
    │                         │ topic: medicold/replies/dashboard
    │                         │ body: { ok, result, correlation_id: "req-123" }
    │                         │                       │
    │ Receive response        │                       │
    │← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │ Match correlation_id    │                       │
    │ Resolve pending promise │                       │
    │                         │                       │
```

### Timeout Handling

```javascript
// Request tanpa response dalam 30 detik → reject

const response = await rrc.sendRequest(...);
// ✅ Response diterima dalam 100ms → resolve
// ❌ No response dalam 30 detik → reject with timeout error

// Error handling:
try {
  const result = await registerBatch(batchData);
} catch (error) {
  if (error.message.includes("timeout")) {
    showError("Server tidak merespons, coba lagi");
  } else {
    showError(error.message);
  }
}
```

---

## Best Practices

### 1. Message Expiry Strategy

```javascript
// ✅ BENAR: Expiry sesuai use case

// Snapshot data (perlu tahan lama):
messageExpiryInterval: 24 * 3600  // 24 jam

// Real-time events (tidak perlu disimpan):
messageExpiryInterval: 5 * 60  // 5 menit

// Response (timeframe request):
messageExpiryInterval: 5 * 60  // 5 menit

// ❌ SALAH: Semua pakai interval sama
messageExpiryInterval: 3600  // 1 jam untuk semua
```

### 2. Priority Levels

```javascript
// ✅ BENAR: Use priority for routing

// Critical alerts:
priority: "critical"  // Sensor offline, temp 30°C

// High priority:
priority: "high"  // Temperature warning, door open

// Normal:
priority: "normal"  // Regular status update

// Low:
priority: "low"  // Debug logs, metadata

// ❌ SALAH: Ignore priority
{} // Semua treat equally
```

### 3. User Properties Usage

```javascript
// ✅ BENAR: Metadata di header

await publishJson(client, topic, message, {
  userProperties: {
    "correlation-id": commandId,
    "source": "medicold-dashboard",
    "priority": "high"
  }
  // Message payload: lean, hanya data
});

// ❌ SALAH: Metadata di payload (duplicate)

await publishJson(client, topic, {
  correlation_id: commandId,    // Juga di user properties!
  source: "medicold-dashboard", // Juga di user properties!
  priority: "high",             // Juga di user properties!
  actual_data: { ... }
});
```

### 4. Topic Alias Management

```javascript
// ✅ BENAR: Alias untuk high-frequency topics

// Sensor telemetry (publish 100x/min):
const sensorTopic = "medicold/FRIDGE-A/telemetry/stream";

// First publish:
client.publish(sensorTopic, reading, {
  properties: { topicAlias: 1 }
});

// Subsequent:
for (let i = 0; i < 99; i++) {
  const reading = getReading();
  client.publish(null, reading, {  // null topic
    properties: { topicAlias: 1 }   // reuse alias
  });
}

// ❌ SALAH: Alias untuk low-frequency

// Broker connection status (1x/hour):
client.publish(topic, message, {
  properties: { topicAlias: 1 }  // Overkill, topicString cost < alias overhead
});
```

### 5. Last Will Configuration

```javascript
// ✅ BENAR: Graceful will setup

mqtt.connect(BROKER_URL, {
  will: {
    topic: "medicold/system/client-status",
    payload: JSON.stringify({
      type: "client.offline",
      client_id: clientId,
      timestamp: new Date().toISOString(),
      reason: "connection-lost"
    }),
    qos: 1,
    retain: false,
    properties: {
      willDelayInterval: 1  // 1 detik delay
    }
  }
});

// ❌ SALAH: Will dengan instant trigger

{
  will: {
    topic: "medicold/system/alerts",
    payload: JSON.stringify({ critical: true }),
    qos: 0,
    retain: true  // Might pollute alert topic!
  }
}
```

### 6. Request-Response Timeout

```javascript
// ✅ BENAR: Reasonable timeout

const rrc = new RequestResponseTracker(30000);  // 30 detik

// ❌ SALAH: Timeout terlalu pendek

const rrc = new RequestResponseTracker(1000);  // 1 detik
// Will timeout valid requests karena network latency
```

---

## Perbandingan Protocol

### MQTT vs HTTP vs WebSocket

| Aspek | MQTT | HTTP | WebSocket |
|-------|------|------|-----------|
| **Overhead** | Very low (~2 byte) | High (~100+ byte headers) | Medium (~10 bytes) |
| **Bandwidth** | ✅ Optimal | ❌ Wasteful | ✅ Good |
| **Push** | ✅ Native (pub-sub) | ❌ Polling only | ✅ Bidirectional |
| **Latency** | ✅ ~50ms | ⚠️ ~100-500ms | ✅ ~50ms |
| **Reliability** | ✅ QoS 0/1/2 | ✅ TCP | ⚠️ TCP with overhead |
| **Persistence** | ✅ Retained msg | ❌ No | ❌ No |
| **Expiry** | ✅ MQTT 5.0 | ❌ Complex headers | ❌ No |
| **IoT Ready** | ✅ Purpose-built | ❌ Generic | ⚠️ Workaround |

### Use Cases

```
MQTT:
✅ IoT sensor networks
✅ Real-time messaging
✅ Constrained devices
✅ High-frequency publishing (1000+ msg/sec)
✅ Mission-critical systems
✅ Low-bandwidth environments

HTTP REST:
✅ Traditional web services
✅ Stateless APIs
✅ File uploads/downloads
✅ Caching needs

WebSocket:
✅ Real-time web dashboards
✅ Browser-based clients
✅ Two-way communication
✅ Hybrid use (mix MQTT + WebSocket)
```

### Comparison: Cold Storage Monitoring

```
Scenario: Monitor 1000 fridges, 1 reading/second each

HTTP (REST API):
- 1000 requests/second
- 200 bytes per request (with headers)
- Total: 200 KB/second = 17.28 GB/day
- Latency: 200-500ms per request
- Server load: Very high (1000 connections)

WebSocket:
- 1 persistent connection per client
- 100 bytes per message
- Total: 100 KB/second = 8.64 GB/day
- Latency: 50-100ms
- Server load: Medium (1000 WebSocket connections)

MQTT (with compression):
- 1 persistent connection per client
- 50 bytes per message (with topic alias)
- Total: 50 KB/second = 4.32 GB/day
- Latency: 10-50ms
- Server load: Low (1000 TCP connections, better handled)

Winner: MQTT 🏆
- 4x less bandwidth than HTTP
- 2x less bandwidth than WebSocket
- Better scalability
- Native IoT features (retained, QoS, expiry)
```

---

## Monitoring MQTT Features

### Mosquitto Broker Stats

```bash
# Monitor MQTT broker
mosquitto_sub -h localhost -t '$SYS/broker/#' -v

# Output:
$SYS/broker/version mosquitto version 2.0.18
$SYS/broker/clients/connected 5
$SYS/broker/clients/disconnected 0
$SYS/broker/clients/maximum 1000
$SYS/broker/messages/stored 42
$SYS/broker/messages/received 10500
$SYS/broker/messages/published 10500
$SYS/broker/subscriptions/count 25
```

### Message Inspection

```bash
# See message properties (di tools seperti MQTT Explorer)
Topic: medicold/FRIDGE-A/telemetry/latest
Payload: { ... }
Properties:
  - QoS: 1
  - Retain: true
  - Expiry: 86400 (seconds)
  - User Properties:
    • correlation-id: abc123
    • source: medicold-core
    • priority: normal
```

---

## Kesimpulan

MQTT 5.0 features di Medicold mengoptimalkan:

1. **Message Expiry** → Memory management
2. **User Properties** → Better tracing & priority
3. **Topic Alias** → Bandwidth optimization
4. **Last Will** → Health monitoring
5. **Request-Response** → Reliable command handling

Semua bersama menciptakan system yang:
- ✅ Scalable (1000+ devices)
- ✅ Reliable (QoS + correlation)
- ✅ Efficient (bandwidth optimized)
- ✅ Observable (tracing & monitoring)
- ✅ Resilient (graceful degradation)

---

**References**:
- MQTT 5.0 Specification: https://docs.oasis-open.org/mqtt/mqtt/v5.0
- Mosquitto Documentation: https://mosquitto.org
- MQTT.js Library: https://github.com/mqttjs/MQTT.js
