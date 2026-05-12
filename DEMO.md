# 🏥 Panduan Demo - Medicold MQTT Integration System

Dokumentasi lengkap untuk melakukan demo sistem integrasi cold storage medis berbasis MQTT.

---

## 📋 Daftar Isi

1. [Persyaratan](#persyaratan)
2. [Cara Menjalankan](#cara-menjalankan)
3. [Komponen Sistem](#komponen-sistem)
4. [Skenario Demo](#skenario-demo)
5. [MQTT Topics & Data Flow](#mqtt-topics--data-flow)
6. [Penjelasan Fitur](#penjelasan-fitur)
7. [Troubleshooting](#troubleshooting)

---

## ✅ Ringkasan Kesiapan Rubrik

| Rubrik | Status | Bukti Demo |
|--------|--------|------------|
| Wildcard & topic hierarchy | ✅ Lengkap | Core subscribe `medicold/+/telemetry/stream`, dashboard subscribe snapshot/alert wildcard |
| Retained message | ✅ Lengkap | Refresh dashboard tetap menerima `telemetry/latest`, `status`, `inventory/snapshot`, `boxes/snapshot` |
| QoS | ✅ Lengkap | Semua publish/subscribe utama memakai QoS 1 |
| MQTT 5.0 metadata | ✅ Lengkap | `messageExpiryInterval`, user properties, topic alias otomatis, dan Last Will |
| Request-response | ✅ Lengkap | Command memakai `correlation_id`, `reply_to`, dan response di `medicold/replies/{clientId}` |
| Streaming realtime | ✅ Lengkap | Sensor/dummy publish telemetry live, core publish alert stream non-retained |
| Dashboard/monitoring | ✅ Lengkap | Web dashboard + CLI validator/control tool |
| Skenario anomali | ✅ Lengkap | Normal, temperature rise, door open, power fail, chaos, multi-fridge |

---

## 📦 Persyaratan

### Hardware Minimal
- CPU: 2+ cores
- RAM: 2GB
- Storage: 500MB free

### Software
- **Docker & Docker Compose** (otomatis setup semua service)
- **Node.js** 22.13+ (jika ingin menjalankan manual)
- **pnpm** 11.0.9+ (package manager)

### Perangkat
- Browser modern (Chrome, Firefox, Safari, Edge)
- Terminal/Command prompt

---

## 🚀 Cara Menjalankan

### **Opsi 1: Docker (Recommended - 1 Perintah)**

Paling mudah dan recommended untuk demo:

```bash
docker compose up --build
```

**Output yang diharapkan:**
```
broker   | mosquitto version 2.0.18 starting
core     | Medicold MQTT core is ready
dummy-sender | Publishing initial box registry and inventory snapshots...
dashboard | Local: http://localhost:5173/
```

**Akses dashboard:**
- Browser: `http://localhost:5173`
- Status: Lihat indikator "Connected" di topbar

**Stop semua service:**
```bash
docker compose down
```

---

### **Opsi 2: Manual (Untuk Development)**

**Terminal 1 - Jalankan MQTT Broker:**
```bash
pnpm install
pnpm broker
```

**Terminal 2 - Jalankan Core Service:**
```bash
pnpm start
```

Akan output:
```
medicold-core-xxxxx ready
Subscribed to medicold/+/telemetry/stream
Subscribed to medicold/+/inventory/commands/register
```

**Terminal 3 - Jalankan Dashboard Web:**
```bash
pnpm dashboard:web
```

Akan output:
```
VITE v8.0.11 running at:
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

**Terminal 4 - Jalankan Dummy Sender (untuk generate data test):**
```bash
pnpm dummy:sender
```

**Terminal 5 (Opsional) - Jalankan Sensor dengan skenario:**
```bash
# Normal operation
pnpm sensor -- --fridgeId FRIDGE-A --scenario normal

# Atau skenario lain (lihat Skenario Demo di bawah)
pnpm sensor -- --fridgeId FRIDGE-A --scenario temp_rise
```

---

## 🏗️ Komponen Sistem

### **1. MQTT Broker (Mosquitto)**
- **Port**: 1883 (MQTT native) + 9001 (WebSocket)
- **Fungsi**: Message broker, menyimpan retained messages
- **Teknologi**: Mosquitto 2.0.18

### **2. Core Service** (`src/server/core.js`)
- **Tipe**: Node.js backend, MQTT subscriber + publisher
- **Fungsi**:
  - Subscribe ke sensor telemetry streaming
  - Proses anomaly detection & severity scoring
  - Simpan state (inventory, boxes, alerts)
  - Publish retained snapshots & live events
  - Handle command responses (correlation_id)

### **3. Sensor Client** (`src/client/sensor.js`)
- **Tipe**: Node.js publisher
- **Fungsi**: Publish sensor readings setiap ~1 detik
- **Data**: Temperature, humidity, pressure, door status, power status
- **Skenario**:
  - `normal` - operasi stabil
  - `temp_rise` - kenaikan suhu progresif
  - `door_open` - pintu terbuka sementara
  - `power_fail` - kehilangan daya
  - `chaos` - multiple anomalies sekaligus

### **4. Dashboard Web** (`web/src/main.js`)
- **Tipe**: Vite SPA dengan Anime.js animations
- **Teknologi**: Vanilla JS + WebSocket MQTT
- **Fitur**:
  - Real-time monitoring 5+ fridge sekaligus
  - Live alert streaming
  - Inventory management
  - Box management
  - Connection status indicator
  - Configurable MQTT broker/topic root

### **5. Dummy Sender** (`src/client/dummy_sender.js`)
- **Tipe**: Node.js publisher automation
- **Fungsi**: Auto-publish 5 box registry, inventory, dan telemetry dummy
- **Frekuensi**: Telemetry setiap ~900ms, seed box/inventory setiap 30 detik

---

## 🎬 Skenario Demo

### **Skenario A: Normal Operation (2 menit)**

**Tujuan**: Tampilkan operasi stabil, retained message, dan real-time updates.

**Langkah**:
1. Dashboard sudah buka di `http://localhost:5173`
2. Jalankan sensor normal:
   ```bash
   pnpm sensor -- --fridgeId FRIDGE-A --scenario normal --readings 30 --intervalMs 1000
   ```
3. **Observasi**:
   - Dashboard menampilkan `FRIDGE-A` status **NORMAL** ✅
   - Temperature ~4.5°C, Humidity ~43%
   - Live event counter meningkat
   - Jika reload dashboard, data tetap muncul (retained message)

**Key Point untuk Penjelasan**:
- ✅ Subscribe ke `medicold/FRIDGE-A/telemetry/latest` dengan retain=true
- ✅ Broker menyimpan last message untuk subscriber baru
- ✅ Core service menerima streaming, output snapshot

---

### **Skenario B: Temperature Rise Alert (3 menit)**

**Tujuan**: Trigger anomaly detection dan alert system.

**Langkah**:
1. Jalankan sensor dengan skenario temp_rise:
   ```bash
   pnpm sensor -- --fridgeId FRIDGE-B --scenario temp_rise --readings 30 --intervalMs 1500
   ```
2. **Observasi**:
   - Temperature naik progresif: 4.5°C → 16°C
   - Status berubah: NORMAL → WARNING → CRITICAL → EMERGENCY
   - **Alert muncul** di dashboard dengan timestamp
   - Red glow di scene animation
   - Retained alert message disimpan di `medicold/FRIDGE-B/alerts/latest`

**Key Point untuk Penjelasan**:
- ✅ Core service menjalankan `inspectReading()` setiap data
- ✅ Threshold checking: WARNING jika temp ≥ 6°C, CRITICAL jika temp > 8°C, EMERGENCY jika temp > 10°C
- ✅ Publish live event ke `medicold/FRIDGE-B/alerts/stream` (retain=false)
- ✅ Publish latest alert ke `medicold/FRIDGE-B/alerts/latest` (retain=true)

---

### **Skenario C: Door Open Detection (2 menit)**

**Tujuan**: Deteksi perilaku pintu abnormal.

**Langkah**:
1. Jalankan sensor dengan skenario door_open:
   ```bash
   pnpm sensor -- --fridgeId FRIDGE-C --scenario door_open --readings 30 --intervalMs 1000
   ```
2. **Observasi**:
   - `door_open: true` selama progress 35-90%, durasi simulasi naik sampai ~45 detik
   - Status: NORMAL → WARNING → CRITICAL
   - Alert event: "Pintu terbuka selama X detik" muncul
   - Dashboard menampilkan warning state

**Key Point untuk Penjelasan**:
- ✅ Logic dalam `inspectReading()` cek `door_open_duration_seconds`
- ✅ Warning saat pintu mulai terbuka, CRITICAL jika durasi > 30 detik

---

### **Skenario D: Power Failure (3 menit)**

**Tujuan**: Simulasi kehilangan daya, perubahan suhu eksponensial.

**Langkah**:
1. Jalankan sensor dengan skenario power_fail:
   ```bash
   pnpm sensor -- --fridgeId FRIDGE-D --scenario power_fail --readings 40 --intervalMs 1000
   ```
2. **Observasi**:
   - Saat power_fail: temperature naik ke ~9-10°C
   - Status: NORMAL → CRITICAL/EMERGENCY
   - Multiple alerts: Power + Temperature
   - Red animation di dashboard

**Key Point untuk Penjelasan**:
- ✅ Sensor report `power_stable: false`
- ✅ Anomaly detection: multiple triggers sekaligus
- ✅ Priority: EMERGENCY > CRITICAL > WARNING > NORMAL

---

### **Skenario E: Chaos - Multiple Anomalies (2 menit)**

**Tujuan**: Stress test dengan banyak anomali acak.

**Langkah**:
1. Jalankan sensor dengan skenario chaos:
   ```bash
   pnpm sensor -- --fridgeId FRIDGE-E --scenario chaos --readings 50 --intervalMs 800
   ```
2. **Observasi**:
   - Random anomalies: temp spike, humidity, door open, power loss
   - Alert stream rapid-fire
   - Dashboard handle high event frequency
   - Core service process semua tanpa crash

**Key Point untuk Penjelasan**:
- ✅ System stability di bawah high load
- ✅ QoS 1 guarantee message delivery
- ✅ State store tidak corrupt dengan concurrent updates

---

### **Skenario F: Multiple Fridges Monitoring (4 menit)**

**Tujuan**: Tampilkan dashboard monitoring 5+ fridge sekaligus.

**Langkah**:
1. Jalankan beberapa sensor di background:
   ```bash
   pnpm sensor -- --fridgeId FRIDGE-A --scenario normal &
   sleep 3
   pnpm sensor -- --fridgeId FRIDGE-B --scenario temp_rise &
   sleep 3
   pnpm sensor -- --fridgeId FRIDGE-C --scenario door_open &
   sleep 3
   pnpm sensor -- --fridgeId FRIDGE-D --scenario normal &
   sleep 3
   pnpm sensor -- --fridgeId FRIDGE-E --scenario chaos &
   ```
2. **Observasi**:
   - Dashboard menampilkan 5 fridge di grid
   - Warna berbeda per status: NORMAL (green), WARNING (yellow), CRITICAL (red)
   - Real-time sync antar fridge
   - Inventory & box data shared di semua fridge

---

## 📡 MQTT Topics & Data Flow

### **Arsitektur Komunikasi**

```
┌─────────────────┐                    ┌──────────────────┐
│ Sensor Fridge   │ publish stream     │                  │
│ (sensor.js)     │──────────────────>│  MQTT Broker     │
│                 │                    │  (Mosquitto)     │
└─────────────────┘                    │                  │
                                        │ • 1883 (native)  │
                                        │ • 9001 (WS)      │
                                        └────────┬─────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │            │            │
                                    v            v            v
                          ┌──────────────┐  ┌────────────┐  ┌──────────────┐
                          │ Core Service │  │  Admin     │  │ Dashboard    │
                          │ (core.js)    │  │  (admin.js)│  │ (main.js)    │
                          │              │  │            │  │              │
                          │ Subscriber:  │  │ Subscriber │  │ Subscriber   │
                          │ • telemetry/ │  │ to:        │  │ to:          │
                          │   stream     │  │ • snapshots│  │ • alerts/    │
                          │ • commands   │  │ • responses│  │   stream     │
                          │              │  │            │  │ • snapshots  │
                          │ Publisher:   │  │ Publisher: │  │              │
                          │ • snapshots  │  │ • commands │  │ Publisher:   │
                          │ • alerts     │  │ • responses│  │ • box cmds   │
                          └──────────────┘  └────────────┘  └──────────────┘
```

### **Topic Hierarchy & Retain Policy**

| Topic | Direction | Retain | QoS | Fungsi |
|-------|-----------|--------|-----|--------|
| `medicold/{id}/telemetry/stream` | Sensor → Core | ❌ | 1 | Live streaming data, tidak disimpan |
| `medicold/{id}/telemetry/latest` | Core → Sub | ✅ | 1 | Last reading snapshot untuk subscriber baru |
| `medicold/{id}/status` | Core → Sub | ✅ | 1 | Status: STATUS_NORMAL/WARNING/CRITICAL/EMERGENCY |
| `medicold/{id}/alerts/stream` | Core → Dashboard | ❌ | 1 | Live alert events |
| `medicold/{id}/alerts/latest` | Core → Sub | ✅ | 1 | Current active alert |
| `medicold/{id}/inventory/commands/register` | Admin → Core | ❌ | 1 | Command batch register (tidak retained) |
| `medicold/{id}/inventory/snapshot` | Core → Sub | ✅ | 1 | Latest inventory state |
| `medicold/{id}/box/snapshot` | Core → Sub | ✅ | 1 | Box details per fridge |
| `medicold/system/boxes/snapshot` | Core → Sub | ✅ | 1 | All boxes registry |
| `medicold/system/boxes/commands/upsert` | Client → Core | ❌ | 1 | Add/update box command |
| `medicold/system/boxes/commands/delete` | Client → Core | ❌ | 1 | Delete box command |
| `medicold/system/alerts/commands/resolve` | Dashboard → Core | ❌ | 1 | Resolve alert command |
| `medicold/replies/{clientId}` | Core → Client | ❌ | 1 | Response via correlation_id |

### **Message Schema**

```json
{
  "schema": "medicold.mqtt.v1",
  "type": "telemetry.latest | alert.latest | boxes.snapshot | ...",
  "emitted_at": "2026-05-12T10:30:45.123Z",
  "payload": {
    "fridge_id": "FRIDGE-A",
    "temperature_celsius": 4.5,
    "humidity_percent": 43.2,
    "pressure_hpa": 1002.3,
    "door_open": false,
    "power_stable": true,
    "location": "Ruang Farmasi Lt. 2",
    "medical_content": "VACCINE"
  }
}
```

---

## ✨ Penjelasan Fitur

### **1. Retained Messages (Sticky Data)**

**Konsep**: Message terakhir disimpan broker, dikirim otomatis ke subscriber baru.

**Implementasi**:
- `telemetry/latest` → retain=true
- `alerts/latest` → retain=true
- `boxes/snapshot` → retain=true

**Demo**: 
1. Dashboard buka dan konek → langsung dapat data terbaru
2. Refresh browser → data tidak hilang (masih dari retained message)
3. Stop sensor, start ulang → dashboard masih tampil data terakhir

**Technical Detail**:
```javascript
// src/server/core.js - publish retained snapshot
await publishJson(client, topics.telemetryLatest(fridgeId),
  withEnvelope("telemetry.latest", reading),
  { qos: 1, retain: true }  // ← retain=true
);
```

---

### **2. Streaming vs Command Response**

**Streaming** (Alert Events):
- Topic: `medicold/{id}/alerts/stream`
- Retain: ❌ (tidak disimpan)
- Flow: Core publish → Dashboard subscribe live
- Use case: Live notification, tidak perlu historical

**Command Response** (Request-Reply):
- Topic: `medicold/replies/{clientId}`
- Retain: ❌
- Flow: Client send command + correlation_id → Core process → Core publish response
- Use case: Dashboard command (delete box, resolve alert) + expect response

**Demo**:
1. Lihat Alert Stream di console
2. Delete box dari dashboard → core send response via replies topic
3. Resolve alert dari dashboard → core confirm via replies topic

---

### **3. Anomaly Detection Pipeline**

**Alur**:
```
Sensor telemetry 
    ↓
Core receive (topic: medicold/{id}/telemetry/stream)
    ↓
inspectReading(reading) [src/server/logic/anomaly.js]
    ├─→ severity.js: Score temp, humidity, door, power
    ├─→ Compare threshold
    └─→ Generate alerts array
    ↓
Store state (stateStore.js)
    ↓
Publish telemetry/latest + alerts/stream
    ↓
Dashboard subscribe & display
```

**Thresholds**:
- **EMERGENCY**: temp > 10°C OR temp < 0°C OR power_fail
- **CRITICAL**: temp > 8°C OR door > 30s
- **WARNING**: temp 6-8°C OR humidity abnormal OR door mulai terbuka
- **NORMAL**: semua aman

---

### **4. State Management & Persistence**

**In-Memory Store** (src/server/stateStore.js):
- Fridges: Latest reading per fridge
- Alerts: Unresolved alerts
- Inventory: Box & batch data
- **NOTE**: State di-reset saat core restart (bisa di-improve dengan persistent DB)

**Publish on Change**:
- State update → immediately publish snapshot
- Snapshot = retained message di broker
- Subscriber baru otomatis dapat latest state

---

### **5. Web Dashboard Features**

**Live Monitoring**:
- Real-time fridge status grid
- Color-coded status: green/yellow/red
- Temperature gauge animation
- Live alert bell notification

**Inventory Management**:
- View registered batches per fridge
- Add new batch (command)
- Expiration tracking

**Box Management**:
- Registry semua medicold boxes
- Add/Edit/Delete box
- Association dengan fridge

**Connection Control**:
- Settings: broker URL, topic root
- Manual connect/disconnect
- Connection status indicator
- Message counter: retained vs live

---

## 📝 Penjelasan untuk Audiensi

### **Slide Presentasi 1: Arsitektur Sistem**

**Apa yang ditampilkan**: Diagram sistem dengan 3 komponen utama.

**Penjelasan**:
- Sensor publish temperature, humidity, pressure setiap detik
- MQTT broker Mosquitto menyimpan message terbaru (retained)
- Core service subscribe sensor, proses anomaly detection, publish snapshot
- Dashboard subscribe snapshot dan alert stream, tampil real-time

**Why MQTT?**:
- Lightweight protocol untuk IoT
- Publish-subscribe model cocok untuk multiple consumers
- Retained message untuk new subscriber dapat last state
- QoS options untuk guarantee delivery

---

### **Slide Presentasi 2: Data Flow**

**Normal Operation**:
```
Sensor (4.5°C) → publish → Broker → Core read → Store 
                                    → check normal ✅ 
                                    → publish snapshot 
                                    → Dashboard display ✅
```

**Alert Flow**:
```
Sensor (15°C) → publish → Broker → Core read → Store
                                  → check EMERGENCY ⚠️
                                  → generate alert
                                  → publish alerts/stream
                                  → publish alerts/latest
                                  → Dashboard notify 🔔
```

---

### **Slide Presentasi 3: Key Features**

| Feature | Benefit | Demo |
|---------|---------|------|
| **Retained Messages** | New subscriber dapat latest state immediately | Refresh browser, data masih ada |
| **Streaming Alerts** | Real-time notification tanpa polling | Alert muncul instan |
| **Request-Reply Pattern** | Async command + response tracking | Delete box, get confirmation |
| **Multiple Subscribers** | Skalabel ke banyak dashboard/admin client | 3+ client konek bersamaan |
| **Anomaly Detection** | Automated monitoring, no manual check | Temp rise trigger alert |
| **Web Dashboard** | Visual monitoring, accessible anywhere | Buka `http://localhost:5173` |

---

## 🔧 Troubleshooting

### **Problem: Dashboard "Disconnected"**

**Kemungkinan**:
1. Broker tidak jalan
2. WebSocket port 9001 blocked
3. Broker URL salah di settings

**Solution**:
```bash
# Cek broker jalan
docker compose logs broker

# Jika manual mode, pastikan broker running
pnpm broker

# Di dashboard settings, ubah broker URL
# Default: ws://localhost:9001
# Atau: ws://broker:9001 (docker network)
```

---

### **Problem: Core Service Error**

**Kemungkinan**: Broker belum siap saat core start.

**Solution**:
```bash
# Restart core setelah broker ready
docker compose up broker
# Wait 5 detik, lalu:
docker compose up core
```

---

### **Problem: Sensor Data Tidak Terlihat di Dashboard**

**Kemungkinan**:
1. Sensor tidak publish
2. Core tidak subscribe
3. Dashboard subscribe topic salah

**Debug**:
```bash
# Monitor MQTT traffic (manual mode)
# Terminal: subscribe to all topics
mosquitto_sub -h localhost -t "medicold/#" -v

# Jalankan sensor di terminal lain
pnpm sensor -- --fridgeId FRIDGE-A --scenario normal

# Lihat message muncul di mosquitto_sub
```

---

### **Problem: Alert Tidak Muncul**

**Kemungkinan**: Threshold tidak trigger (suhu belum cukup naik).

**Solution**:
```bash
# Gunakan skenario temp_rise (lebih agresif)
pnpm sensor -- --fridgeId FRIDGE-X --scenario temp_rise

# Atau manual adjust threshold di anomaly.js
# CRITICAL_TEMPERATURE = 8 (ubah jadi lebih rendah untuk test)
```

---

### **Problem: "Cannot find module 'mqtt'"**

**Solution**:
```bash
pnpm install
# atau
npm install
```

---

## 📊 Performance & Scalability

### **Tested Capacity**

- **Fridges**: 5-10 sekaligus
- **Event frequency**: 1 message/second per fridge
- **Subscribers**: 3-5 client konek bersamaan
- **Latency**: <100ms dari sensor publish ke dashboard display

### **Bottleneck & Optimization**

| Bottleneck | Solution |
|-----------|----------|
| In-memory state | Migrate to persistent DB (Redis/PostgreSQL) |
| Single core process | Scale dengan MQTT topic partitioning |
| Browser DOM updates | Virtual scrolling untuk long alert list |
| Broker memory | Cleanup expired retained messages |

---

## 📚 Reference Files

- **Sensor logic**: [src/client/sensor.js](src/client/sensor.js)
- **Core service**: [src/server/core.js](src/server/core.js)
- **Anomaly detection**: [src/server/logic/anomaly.js](src/server/logic/anomaly.js)
- **Topics definition**: [src/shared/topics.js](src/shared/topics.js)
- **Dashboard code**: [web/src/main.js](web/src/main.js)
- **Docker setup**: [docker-compose.yml](docker-compose.yml)

---

## ✅ Checklist Demo

Sebelum demo ke audiensi:

- [ ] Docker installed & running
- [ ] Clone repo, cd ke folder
- [ ] `docker compose up --build` → semua service jalan
- [ ] Dashboard `http://localhost:5173` → Connected
- [ ] Jalankan 1 skenario → data muncul di dashboard
- [ ] Test refresh browser → data retained
- [ ] Trigger alert → notification muncul
- [ ] Klik delete box → response ✅
- [ ] Jalankan multiple fridges → grid update
- [ ] Stop sensor → last data masih ada (retained)
- [ ] Check README & DEMO.md terbuka untuk reference

---

**Good luck with your demo! 🎉**
