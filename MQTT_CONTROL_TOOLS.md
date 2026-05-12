# 🎮 MQTT Control Dashboard & Tools

Dokumentasi lengkap tentang tools untuk menguji, debugging, dan monitor MQTT system.

---

## 📑 Daftar Isi

1. [MQTT Control Tool CLI](#mqtt-control-tool-cli)
2. [Menggunakan MQTT Explorer](#menggunakan-mqtt-explorer)
3. [Mosquitto CLI Tools](#mosquitto-cli-tools)
4. [Web Dashboard Features](#web-dashboard-features)
5. [Debugging & Monitoring](#debugging--monitoring)
6. [Message Inspection](#message-inspection)

---

## MQTT Control Tool CLI

### Overview

**mqtt-control-tool.js** adalah interactive CLI untuk test & debug MQTT system tanpa perlu external tools.

**Features:**
- Subscribe ke topic dengan wildcard
- Publish custom messages
- Inspect message properties (MQTT 5.0)
- Message history logging
- Connection status monitoring
- User-friendly interactive interface

### Instalasi & Running

```bash
# Install dependencies (sudah termasuk di project)
pnpm install

# Run control tool
node mqtt-control-tool.js

# Output:
🚀 MQTT Control Tool
📡 Broker: mqtt://localhost:1883
📂 Topic Root: medicold

Connecting to MQTT broker...
✅ Connected to broker

mqtt-ctrl>
```

### Perintah Dasar

#### 1. **Subscribe ke Topic**

```bash
# Subscribe ke single topic
mqtt-ctrl> subscribe medicold/FRIDGE-A/telemetry/latest

# Subscribe dengan wildcard (single level)
mqtt-ctrl> subscribe medicold/+/telemetry/stream

# Subscribe dengan wildcard (multi level)
mqtt-ctrl> subscribe medicold/system/#

# Subscribe ke multiple patterns
mqtt-ctrl> subscribe medicold/+/alerts/latest
mqtt-ctrl> subscribe medicold/+/status
```

**Output:**
```
✅ Subscribed to: medicold/+/telemetry/stream
   Waiting for messages...
```

#### 2. **Publish Message**

```bash
# Publish JSON message
mqtt-ctrl> publish medicold/test/data {"temp": 25.5, "humidity": 65}

# Publish plain text
mqtt-ctrl> publish medicold/test/string Hello World

# Publish ke command topic (simulate request)
mqtt-ctrl> publish medicold/FRIDGE-A/inventory/commands/register {"batch_id": "BATCH-001", "items": []}
```

**Output:**
```
✅ Published to medicold/test/data
   Message: {"temp": 25.5, "humidity": 65}
```

#### 3. **View Active Subscriptions**

```bash
mqtt-ctrl> list-subs
```

**Output:**
```
📋 Active Subscriptions (3):
  1. medicold/+/telemetry/stream
  2. medicold/+/alerts/latest
  3. medicold/system/#
```

#### 4. **View Message History**

```bash
mqtt-ctrl> history
```

**Output:**
```
📚 Message History (last 15):

[1] 2026-05-12T10:30:45.123Z | medicold/FRIDGE-A/telemetry/latest
    QoS: 1, Retain: true
    User Props: { source: 'medicold-core', priority: 'normal' }
    {"fridge_id": "FRIDGE-A", "temperature_celsius": 4.5, ...}

[2] 2026-05-12T10:30:46.456Z | medicold/FRIDGE-B/alerts/stream
    QoS: 1, Retain: false
    User Props: { source: 'medicold-core', priority: 'high', 'correlation-id': 'alert-123' }
    {"type": "alert.new", "severity": "CRITICAL", ...}

[3] 2026-05-12T10:30:47.789Z | medicold/system/client-status
    QoS: 1, Retain: false
    User Props: { source: 'medicold-core' }
    {"type": "client.offline", "client_id": "sensor-xyz", ...}
```

#### 5. **Check Connection Status**

```bash
mqtt-ctrl> status
```

**Output:**
```
📊 Connection Status:
  Broker: mqtt://localhost:1883
  Connected: ✅ Yes
  Client ID: mqtt-control-xyz12345
  Active Subscriptions: 3
  Message History: 42/100
```

#### 6. **Clear History**

```bash
mqtt-ctrl> clear-history
✅ Message history cleared
```

#### 7. **Exit**

```bash
mqtt-ctrl> exit

Disconnecting...
✅ Disconnected
```

---

### Message Properties Display

Saat menerima message, control tool menampilkan:

```
📨 Message from medicold/FRIDGE-A/telemetry/latest
⏰ 2026-05-12T10:30:45.123Z

Properties:
  QoS: 1
  Retain: true
  Expiry: 86400s                          ← MQTT 5.0 feature
  User Properties:                         ← MQTT 5.0 feature
    - correlation-id: req-abc123
    - source: medicold-core
    - priority: high

Payload:
{
  "fridge_id": "FRIDGE-A",
  "temperature_celsius": 4.5,
  "humidity_percent": 43.2,
  ...
}
```

---

## Menggunakan MQTT Explorer

### Download & Install

MQTT Explorer adalah GUI tool populer untuk MQTT debugging:

1. Download: https://mqtt-explorer.com/
2. Install sesuai OS (Windows, Mac, Linux)
3. Launch aplikasi

### Setup Connection

**Step 1: Add Connection**
```
URL: mqtt://localhost
Port: 1883
Protocol: mqtt
Client ID: mqtt-explorer-user
```

**Step 2: Connect**
```
Click "Connect" button
→ Status should show "connected"
```

### Features

#### 1. **Topic Browser**
```
Left panel menampilkan:
medicold/
├── FRIDGE-A/
│   ├── telemetry/
│   │   ├── stream (latest message)
│   │   └── latest
│   ├── status
│   ├── alerts/
│   │   ├── stream
│   │   └── latest
│   └── inventory/
├── FRIDGE-B/
└── system/
    ├── boxes/
    ├── client-status
    └── alerts/
```

#### 2. **Message Inspection**
```
Right panel menampilkan:
Topic: medicold/FRIDGE-A/telemetry/latest
QoS: 1
Retain: ✅
Last Updated: 2026-05-12 10:30:45

Message:
{
  "schema": "medicold.mqtt.v1",
  "type": "telemetry.latest",
  "emitted_at": "2026-05-12T10:30:45.123Z",
  "payload": {
    "fridge_id": "FRIDGE-A",
    "temperature_celsius": 4.5,
    ...
  }
}

Properties (MQTT 5.0):
- messageExpiryInterval: 86400
- userProperties:
  - source: medicold-core
  - priority: normal
```

#### 3. **Publish Message**
```
1. Click topic → right panel
2. Scroll ke bawah → "Publish" section
3. Enter payload:
   {
     "fridge_id": "FRIDGE-TEST",
     "temperature_celsius": 25.0
   }
4. Click "Publish"
5. Message appear di dashboard
```

#### 4. **Real-time Monitoring**
```
- Subscribe ke pattern: medicold/#
- Live update saat ada message
- Color indicator: green=received, blue=updated
- Timeline: see message frequency
```

### Export & Analysis

```
MQTT Explorer bisa export messages:
1. Right-click topic
2. "Export messages" → JSON/CSV
3. Analyze di Excel atau text editor
```

---

## Mosquitto CLI Tools

### mosquitto_sub - Subscribe & Monitor

**Lihat semua messages di broker:**
```bash
# Subscribe ke semua topics
mosquitto_sub -h localhost -t "medicold/#" -v

# Subscribe with QoS
mosquitto_sub -h localhost -t "medicold/+/telemetry/stream" -q 1

# Subscribe & save ke file
mosquitto_sub -h localhost -t "medicold/#" > messages.log

# With timestamp
mosquitto_sub -h localhost -t "medicold/#" -v | \
  sed "s/^/$(date '+%Y-%m-%d %H:%M:%S') /"
```

**Output:**
```
medicold/FRIDGE-A/telemetry/latest {"fridge_id":"FRIDGE-A","temperature_celsius":4.5}
medicold/FRIDGE-A/status {"status":"NORMAL","last_seen":"2026-05-12T10:30:45Z"}
medicold/FRIDGE-A/alerts/stream {"type":"alert.new","severity":"WARNING"}
medicold/FRIDGE-B/telemetry/latest {"fridge_id":"FRIDGE-B","temperature_celsius":4.2}
```

### mosquitto_pub - Publish Messages

**Publish test message:**
```bash
# Publish simple message
mosquitto_pub -h localhost -t "medicold/test" -m "Hello MQTT"

# Publish JSON
mosquitto_pub -h localhost -t "medicold/test/data" \
  -m '{"test": true, "value": 42}'

# Publish dengan QoS & Retain
mosquitto_pub -h localhost -t "medicold/test/snapshot" \
  -q 1 -r -m '{"snapshot": true, "timestamp": "now"}'

# Publish dari file
mosquitto_pub -h localhost -t "medicold/test" -f message.json
```

### Broker Statistics

**Monitor broker performance:**
```bash
# Subscribe ke $SYS topics
mosquitto_sub -h localhost -t '$SYS/broker/#' -v

# Output:
$SYS/broker/version mosquitto version 2.0.18
$SYS/broker/timestamp 2026-05-12T10:30:45+0000
$SYS/broker/clients/connected 5
$SYS/broker/clients/disconnected 2
$SYS/broker/clients/maximum 1000
$SYS/broker/clients/total 7
$SYS/broker/messages/stored 42
$SYS/broker/messages/received 10500
$SYS/broker/messages/published 10500
$SYS/broker/subscriptions/count 25
$SYS/broker/retained messages/count 25
```

---

## Web Dashboard Features

### Connection Monitor

**Top bar menampilkan:**
```
┌────────────────────────────────────────────────┐
│ Status: ✅ Connected (ws://localhost:9001)     │
│ Mode: Real-time | Retained: 42 | Live: 10500  │
│ [Settings] [Disconnect]                        │
└────────────────────────────────────────────────┘
```

### Settings / Configuration

**Click "Connection" button:**
```
┌─────────────────────────────────────┐
│ MQTT Settings                       │
├─────────────────────────────────────┤
│ Broker URL:                         │
│ [ws://localhost:9001]        [✓]   │
│                                     │
│ Topic Root:                         │
│ [medicold]                   [✓]   │
│                                     │
│ Client ID:                          │
│ [dashboard-...]              (auto) │
│                                     │
│ [Connect] [Disconnect] [Close]      │
└─────────────────────────────────────┘
```

### Real-time Status Grid

```
Cold Storage Monitoring:

┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ FRIDGE-A │ FRIDGE-B │ FRIDGE-C │ FRIDGE-D │ FRIDGE-E │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ ✅ 4.5°C │ ⚠️ 6.2°C │ ✅ 4.8°C │ 🔴 9.1°C │ ✅ 4.6°C │
│ 43% RH   │ 45% RH   │ 42% RH   │ 51% RH   │ 44% RH   │
│ NORMAL   │ WARNING  │ NORMAL   │ CRITICAL │ NORMAL   │
│ Updated  │ 2min ago │ Updated  │ 1min ago │ Updated  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Alert Panel

```
ACTIVE ALERTS (3):

1. 🔴 CRITICAL - FRIDGE-D
   Temperature 9.1°C (threshold 8.0°C)
   Since: 2026-05-12 10:28:45
   [Resolve Alert]

2. ⚠️ WARNING - FRIDGE-B
   Humidity 65% (threshold 60%)
   Since: 2026-05-12 10:25:30
   [Resolve Alert]

3. ⚠️ WARNING - FRIDGE-C
   Door open > 60 seconds
   Since: 2026-05-12 10:22:15
   [Resolve Alert]
```

### Inventory & Boxes

**Tab: Inventory**
```
FRIDGE-A Inventory:

Batch: BATCH-001
├── Items: 500 units
├── Type: VACCINE
├── Expiry: 2027-12-31
├── Registered: 2026-05-01
└── Status: ✅ OK

Batch: BATCH-002
├── Items: 300 units
├── Type: SERUM
├── Expiry: 2026-08-15
├── Registered: 2026-05-05
└── Status: ⚠️ Expiring soon
```

**Tab: Boxes**
```
Medicold Boxes Registry:

BOX-001: FRIDGE-A Pharmacy
├── Location: Ruang Farmasi Lt. 2
├── Content: VACCINE
├── Temperature: 4.5°C
└── [Edit] [Delete]

BOX-002: FRIDGE-B Emergency
├── Location: Ruang Darurat Lt. 1
├── Content: SERUM
├── Temperature: 4.2°C
└── [Edit] [Delete]
```

---

## Debugging & Monitoring

### Scenario 1: Debug Temperature Rise Alert

**Step-by-step:**

```bash
# Terminal 1: Monitor all fridge data
node mqtt-control-tool.js
> subscribe medicold/+/telemetry/latest
> subscribe medicold/+/alerts/stream
> subscribe medicold/+/status

# Terminal 2: Start sensor dengan temp_rise scenario
pnpm sensor -- --fridgeId FRIDGE-A --scenario temp_rise --readings 30

# Terminal 3 (optional): Monitor dengan mosquitto_sub
mosquitto_sub -h localhost -t "medicold/FRIDGE-A/#" -v
```

**Expected output:**
```
[10:30:45] medicold/FRIDGE-A/telemetry/latest: temp=4.5°C
[10:30:46] medicold/FRIDGE-A/telemetry/latest: temp=5.2°C
[10:30:47] medicold/FRIDGE-A/telemetry/latest: temp=6.0°C
[10:30:48] medicold/FRIDGE-A/status: NORMAL
[10:30:49] medicold/FRIDGE-A/telemetry/latest: temp=7.5°C
[10:30:50] medicold/FRIDGE-A/status: WARNING
[10:30:51] medicold/FRIDGE-A/telemetry/latest: temp=8.5°C
[10:30:52] medicold/FRIDGE-A/alerts/stream: CRITICAL alert triggered
[10:30:53] medicold/FRIDGE-A/status: CRITICAL
[10:30:54] medicold/FRIDGE-A/alerts/latest: CRITICAL - Temp 8.5°C
```

### Scenario 2: Debug Request-Response Command

**Step-by-step:**

```bash
# Terminal 1: Subscription ke replies
node mqtt-control-tool.js
> subscribe medicold/replies/dashboard
> subscribe medicold/system/boxes/commands/delete

# Terminal 2: Simulate delete box request
# Publish dari dashboard:
> publish medicold/system/boxes/commands/delete {"fridge_id":"BOX-1","correlation_id":"req-123","reply_to":"medicold/replies/dashboard"}

# Terminal 1: Watch untuk response
[Akan terlihat response dengan correlation_id yang match]
```

**Expected output:**
```
[10:30:00] medicold/system/boxes/commands/delete received
Request:
{
  "fridge_id": "BOX-1",
  "correlation_id": "req-123",
  "reply_to": "medicold/replies/dashboard"
}

[10:30:01] medicold/replies/dashboard received
Response:
{
  "ok": true,
  "result": { "deleted": "BOX-1" },
  "correlation_id": "req-123"  ← MATCHED!
}
```

### Scenario 3: Monitor Message Expiry

**Step-by-step:**

```bash
# Terminal 1: Subscribe & watch
mosquitto_sub -h localhost -t "medicold/test/snapshot" -v

# Terminal 2: Publish message dengan short expiry
mosquitto_pub -h localhost -t "medicold/test/snapshot" \
  -m '{"test": true}' -r

# Terminal 3: Wait 30 detik, baru subscribe lagi
sleep 30
mosquitto_sub -h localhost -t "medicold/test/snapshot" -v
# Should NOT get message (sudah expired)

# But dengan default expiry (24h):
mosquitto_pub -h localhost -t "medicold/test/snapshot-24h" \
  -m '{"test": true}' -r
# Message akan tetap ada setelah 30 detik
```

---

## Message Inspection

### Inspect MQTT 5.0 Properties

**Di mqtt-control-tool.js, properties ditampilkan:**

```
Properties:
  QoS: 1                                    ← QoS level
  Retain: true                              ← Retained?
  Expiry: 86400s                            ← MQTT 5.0: expires dalam 24h
  User Properties:                          ← MQTT 5.0: custom metadata
    - correlation-id: abc123
    - source: medicold-core
    - priority: high
```

### Check Message Size

**Estimate bandwidth:**

```javascript
// Jika pakai topic alias
payload_size + alias_overhead ≈ 30-50 bytes

// Jika tanpa alias
payload_size + topic_string ≈ 100-200 bytes

// Contoh:
// Topic: "medicold/FRIDGE-A/telemetry/stream" (36 bytes)
// Payload: {"temp": 4.5} (20 bytes)
// Total: 56 bytes per message

// Dengan alias:
// Alias number (2 bytes) + payload (20 bytes)
// Total: 22 bytes per message
// Saving: 60%!
```

### Correlation ID Tracking

**Untuk request-response, correlation ID di user properties:**

```
Request (Dashboard):
  User Properties: { "correlation-id": "req-xyz123" }
  
Response (Core):
  User Properties: { "correlation-id": "req-xyz123" }  ← SAME ID!
  
Dashboard dapat match:
  Pending request "req-xyz123" + Response "req-xyz123" = MATCH ✓
```

---

## Troubleshooting Common Issues

### Issue 1: Cannot Connect to Broker

**Problem:**
```
❌ Error: connect ECONNREFUSED 127.0.0.1:1883
```

**Solution:**
```bash
# Check broker running
docker ps | grep mosquitto
# or
ps aux | grep mosquitto

# Start broker if not running
docker compose up broker
# or
pnpm broker
```

### Issue 2: Subscribe Tidak Dapat Message

**Problem:**
```
✅ Subscribed to: medicold/+/telemetry/stream
   Waiting for messages...
   (tidak ada message datang)
```

**Solution:**
```bash
# Check ada publisher?
# Terminal lain, publish test message
mosquitto_pub -h localhost -t "medicold/TEST/telemetry/stream" \
  -m '{"test": true}'

# Check topic pattern match?
# Seharusnya: medicold/TEST/telemetry/stream
# Match pattern: medicold/+/telemetry/stream ✓

# Wrong pattern examples:
mosquitto_sub -t "medicold/telemetry/stream"  # Missing {id} level!
mosquitto_sub -t "medicold/FRIDGE-A/telemetry"  # Missing /stream!
```

### Issue 3: Message Properties Tidak Terlihat

**Problem:**
```
Received message, tapi tidak lihat expiry atau userProperties
```

**Solution:**
```bash
# Pastikan using mqtt control tool
# (tidak semua CLI tool show MQTT 5.0 properties)

# Gunakan:
node mqtt-control-tool.js  # ✅ Show properties

# Bukan:
mosquitto_sub  # ❌ Tidak show properties
```

---

## Best Practices for Debugging

### 1. **Systematic Approach**

```
1. Check connectivity
   > status
   → Broker: ✅ Connected?

2. Check subscriptions
   > list-subs
   → Subscribed ke correct topic?

3. Publish test message
   > publish medicold/test/debug {"test": true}
   → Message terlihat di history?

4. Monitor real topics
   > subscribe medicold/+/telemetry/stream
   → Real data datang?

5. Inspect properties
   > history
   → QoS, Retain, Expiry, UserProperties correct?
```

### 2. **Isolation Testing**

```
Test per component:

1. Test Broker:
   - Publish test message
   - Subscribe & verify received

2. Test Sensor:
   - Start sensor dengan scenario
   - Check di broker menerima

3. Test Core:
   - Check core processing
   - Verify snapshot published

4. Test Dashboard:
   - Connect & check retained messages
   - Trigger alert & verify stream
```

### 3. **Message Flow Tracing**

```
Trace complete flow:

Sensor → Publish telemetry/stream
   Terminal 1: mqtt-ctrl> subscribe medicold/+/telemetry/stream
   → Verify received

Core → Publish telemetry/latest
   Terminal 1: mqtt-ctrl> subscribe medicold/+/telemetry/latest
   → Verify received with retention

Dashboard → Subscribe
   Terminal 1: Check properties (correlation-id, source, etc)
```

---

## Summary

| Tool | Use Case | Strength |
|------|----------|----------|
| **mqtt-control-tool.js** | Interactive testing, debugging | Easy to use, show all properties |
| **MQTT Explorer** | Visual monitoring, browser | GUI, great for inspection |
| **mosquitto_sub/pub** | CLI monitoring, scripting | Lightweight, scriptable |
| **Web Dashboard** | Real-time visualization | Beautiful UI, business logic |

Gunakan kombinasi tools sesuai kebutuhan untuk debugging yang efektif! 🚀
