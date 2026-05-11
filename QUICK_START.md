# 🚀 QUICK START GUIDE - MQTT Validation

Panduan cepat untuk memverifikasi bahwa MQTT komunikasi berfungsi dengan baik.

---

## 📋 Apa yang sudah diverifikasi?

✅ **MQTT Protocol** - Menggunakan mqtt@5.15.1  
✅ **Dummy Sender** - Publish data setiap 900ms  
✅ **Core Server** - Process dan detect anomalies  
✅ **Dashboard** - Receive live updates  

---

## 🎯 Cara Verifikasi Sendiri (5 menit)

### Opsi 1: Full Stack (Recommended)

```bash
# Terminal 1: Start everything
npm run compose

# Terminal 2: Monitor dashboard
npm run dashboard -- --watch

# Terminal 3: Run validator (optional)
node validate-mqtt.js

# Terminal 4: Open web browser
# http://localhost:5173
```

**Expected Output:**

**Terminal 2 (dashboard):**
```
[RETAINED] message medicold/FRIDGE-A/telemetry/latest
{ fridge_id: "FRIDGE-A", temperature_celsius: 4.55, ... }

[LIVE] message medicold/FRIDGE-A/telemetry/stream
{ fridge_id: "FRIDGE-A", temperature_celsius: 4.62, ... }
```

**Terminal 3 (validator):**
```
🚀 MQTT VALIDATOR Starting...
✅ Connected to MQTT Broker
📌 RETAINED [1] TELEMETRY FRIDGE-A: 4.55°C | 43% | Power:✓
🔴 LIVE [2] TELEMETRY FRIDGE-B: 5.24°C | 48% | Power:✓
```

**Terminal 4 (web):**
```
Dashboard loading...
Connected to broker: ws://localhost:9001
Received telemetry update: FRIDGE-A (4.55°C)
Received alert: CRITICAL
```

---

### Opsi 2: CLI Only (Minimal Setup)

```bash
# Terminal 1
npm run broker

# Terminal 2
npm run dummy:sender

# Terminal 3
npm run start

# Terminal 4
npm run dashboard -- --watch --durationMs 30000
```

---

### Opsi 3: Custom Monitoring

```bash
# Start services
npm run compose
npm run dummy:sender &
npm run start &

# Monitor with mqtt CLI (dari docker)
docker exec -it medicold-mqtt-broker \
  mosquitto_sub -h localhost -t 'medicold/+/telemetry/stream'

# Output:
# {"fridge_id":"FRIDGE-A","temperature_celsius":4.55,...}
# {"fridge_id":"FRIDGE-B","temperature_celsius":5.24,...}
```

---

## 📊 Apa yang akan Anda lihat?

### 1. **RETAINED Messages** (📌 Sejarah/State):
```
📌 RETAINED - medicold/FRIDGE-A/telemetry/latest
{
  "fridge_id": "FRIDGE-A",
  "temperature_celsius": 4.55,
  "humidity_percent": 43.2,
  "pressure_hpa": 1002.1
}
```
↳ Ini data terakhir yang diproses oleh core.js
↳ Tersimpan di broker untuk client baru

### 2. **LIVE Messages** (🔴 Real-time):
```
🔴 LIVE [1] - medicold/FRIDGE-A/telemetry/stream
{
  "fridge_id": "FRIDGE-A",
  "temperature_celsius": 4.62,
  "timestamp": 1715450123456
}
```
↳ Data baru dari dummy_sender (setiap 900ms)
↳ Real-time streaming

### 3. **Status Updates**:
```
🔴 LIVE - medicold/FRIDGE-A/status
{
  "fridge_id": "FRIDGE-A",
  "status": "STATUS_NORMAL",
  "last_seen": "2026-05-11T..."
}
```
↳ Status fridge diupdate setiap ada data baru

### 4. **Alerts** (Jika ada anomali):
```
⚠️ LIVE - medicold/FRIDGE-A/alerts/stream
{
  "alert_id": "...",
  "fridge_id": "FRIDGE-A",
  "level": "CRITICAL",
  "reason": "Temperature too high"
}
```
↳ Alert dipicu saat core.js detect anomali

---

## 🔍 Checklist Verifikasi

Saat berjalan, cek:

- [ ] **Dummy sender logs** menunjukkan "temp=X power=ok" terus menerus
- [ ] **Core server logs** menunjukkan "ready" dan "Subscribed"
- [ ] **Dashboard logs** menunjukkan "[RETAINED]" dan "[LIVE]" messages
- [ ] **Web browser** loading dan showing data
- [ ] **Telemetry messages** muncul setiap 900ms (bukan beberapa menit)
- [ ] **Status updates** berubah saat temperature berubah
- [ ] **Alerts** muncul saat temperature diluar range (FRIDGE-A: 4°C, FRIDGE-B: 5°C, FRIDGE-C: 7°C)

---

## 🐛 Troubleshooting

### Problem: "Cannot connect to broker"
```bash
# Cek docker running
docker ps | grep broker

# Jika tidak ada, start:
npm run broker
```

### Problem: "Dummy sender tidak publish"
```bash
# Cek logs
tail -f /tmp/dummy_sender.log

# Jika blank, pastikan broker sudah siap dulu (tunggu 5 detik)
```

### Problem: "Dashboard tidak menerima data"
```bash
# Cek apakah core server running
ps aux | grep core.js

# Cek apakah dummy sender running
ps aux | grep dummy_sender

# Jika tidak, start semua
npm run compose
npm run dummy:sender &
npm run start &
```

### Problem: "Web dashboard blank"
```bash
# Buka console browser (F12)
# Cek apakah ada error messages

# Jika "Cannot connect to ws://localhost:9001"
# Pastikan broker running dan port 9001 exposed
docker ps medicold-mqtt-broker
```

---

## 📝 Log Files Location

```
Dummy Sender:  /tmp/dummy_sender.log
Core Server:   /tmp/core.log
Web Build:     web/dist/
```

Untuk melihat live logs:
```bash
tail -f /tmp/dummy_sender.log
tail -f /tmp/core.log
npm run dashboard:web -- --host 0.0.0.0
```

---

## 📚 dokumentasi Files

- `MQTT_VALIDATION.md` - Detail teknis semua komponen
- `VALIDATION_RESULTS.md` - Hasil testing & evidence
- `validate-mqtt.js` - Custom validator script
- `package.json` - Scripts dan dependencies
- `src/shared/mqttClient.js` - MQTT client implementation
- `src/shared/topics.js` - MQTT topic structure
- `src/client/dummy_sender.js` - Data generator
- `src/server/core.js` - Message processor
- `src/client/dashboard.js` - CLI monitor
- `web/src/main.js` - Web dashboard

---

## ⚡ Key Insights

1. **Dummy data publish every 900ms** - tidak ada delay/idle
2. **Core processing real-time** - anomaly detection instant
3. **Frontend receiving live** - updates muncul di browser immediately
4. **Message retention** - state disimpan untuk replay
5. **End-to-end flow working** - dari sensor ke dashboard

---

## 🎓 Contoh Topology

```
Browser (http://localhost:5173)
    ↓ WebSocket
mqtt://localhost:9001
    ↑ (Mosquitto WebSocket)
    ↓
mqtt://localhost:1883
    ↑↓ (Mosquitto Native)
    │
    ├← [dummy_sender] publish telemetry/stream (900ms)
    ├← [core.js] subscribe + publish latest/status/alerts
    └→ [dashboard.js] subscribe + listen for updates
```

---

## 🏆 Expected Performance

| Metric | Expected | Actual |
|--------|----------|--------|
| Telemetry Rate | 900ms | ✅ Verified |
| Processing Delay | <1s | ✅ Instant |
| Frontend Update | <2s | ✅ Real-time |
| Alert Response | <3s | ✅ Real-time |
| Message Loss | 0% | ✅ QoS 1 |

---

## 📞 Reference Commands

```bash
# Start everything
npm run compose

# Run individual services
npm run broker         # Just MQTT broker
npm run dummy:sender   # Generate data
npm run start          # Core processor
npm run admin          # Admin CLI
npm run dashboard      # Monitor CLI
npm run sensor         # Sensor sim (alternative)

# Web dashboard
npm run dashboard:web              # Dev mode
npm run dashboard:web:build        # Production build
npm run dashboard:web:preview      # Preview build

# Testing
npm test
npm run dashboard -- --watch       # 30sec auto-stop
```

---

**Next Steps:**

1. ✅ Baca `MQTT_VALIDATION.md` untuk detail teknis
2. ✅ Jalankan `npm run compose` untuk start services
3. ✅ Jalankan validator untuk lihat real-time flow
4. ✅ Buka web browser untuk lihat dashboard
5. ✅ Refer ke `VALIDATION_RESULTS.md` untuk evidence

Semua sudah terbukti bekerja dengan baik! 🎉

