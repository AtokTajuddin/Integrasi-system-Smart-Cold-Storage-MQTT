# 📋 Environment Configuration & Caching Strategy

## 1️⃣ CURRENT STATE - Not Best Practice

```yaml
# ❌ docker-compose.yml (Hardcoded values)
environment:
  MQTT_BROKER_URL: mqtt://broker:1883
  MQTT_TOPIC_ROOT: medicold
```

**Problems:**
- ❌ Tidak separable antara dev/staging/production
- ❌ Credentials hardcoded (security risk)
- ❌ Susah untuk configure di environment berbeda

---

## 2️⃣ RECOMMENDED - Setup .env

### A. Files Created

**`.env.example`** - Template untuk dokumentasi
```bash
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC_ROOT=medicold
NODE_ENV=development
```

**`.env.local`** - Actual config (dev machine)
```bash
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_BROKER_WS_URL=ws://localhost:9001
MQTT_TOPIC_ROOT=medicold
NODE_ENV=development
```

**`.env.production`** - Config untuk production
```bash
MQTT_BROKER_URL=mqtt://broker-prod:1883
MQTT_TOPIC_ROOT=medicold-prod
NODE_ENV=production
MQTT_USERNAME=admin
MQTT_PASSWORD=***secret***
```

### B. Update docker-compose.yml

**BEFORE (Hardcoded):**
```yaml
environment:
  MQTT_BROKER_URL: mqtt://broker:1883
  MQTT_TOPIC_ROOT: medicold
```

**AFTER (Using .env):**
```yaml
environment:
  MQTT_BROKER_URL: ${MQTT_BROKER_URL}
  MQTT_TOPIC_ROOT: ${MQTT_TOPIC_ROOT}
```

Kemudian jalankan:
```bash
# Development
docker compose --env-file .env.local up

# Production
docker compose --env-file .env.production up
```

### C. Load in Node.js

```javascript
// src/shared/config.js
require('dotenv').config();

const config = {
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    topicRoot: process.env.MQTT_TOPIC_ROOT || 'medicold',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  },
  node: {
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.CORE_LOG_LEVEL || 'info',
  },
};

module.exports = config;
```

---

## 3️⃣ REDIS / CACHING - ANALYSIS UNTUK STREAMING MQTT

**TL;DR:** ❌ **TIDAK DIPERLUKAN untuk streaming communication murni**

### A. Apa yang Anda Gunakan Saat Ini?

```javascript
// stateStore.js - In-Memory Map
const fridges = new Map();
const batches = new Map();
const alerts = new Map();
const boxes = new Map();
```

**Artinya:**
- State disimpan dalam memori Node.js process
- Data hilang jika process restart
- Ideal untuk session-scoped data

### B. Kapan Redis DIPERLUKAN?

Redis diperlukan hanya jika:

| Skenario | Redis? | Alasan |
|----------|--------|--------|
| **Single Node** (Anda sekarang) | ❌ No | In-memory sudah cukup |
| **Multiple Core Servers** | ✅ Yes | Share state antar instance |
| **Persistent State** | ✅ Yes | Survive restarts |
| **Cache busting/TTL** | ✅ Yes | Automatic expiry |
| **High Throughput** | ✅ Maybe | Reduce DB queries |

**Anda sekarang:** Single instance → **In-memory cache sufficient**

### C. Mengapa Redis TIDAK PERLU untuk Streaming MQTT?

```
┌─────────────────────────────────────────────────────┐
│             MQTT BROKER (Mosquitto)                  │
│        ✅ Already has built-in storage              │
│  - Retains latest messages                           │
│  - Persists to disk                                  │
│  - Handles replay on reconnect                       │
└─────────────────────────────────────────────────────┘
         ↑
         │ MQTT handles persistence & storage
         │
┌─────────────────────────────────────────────────────┐
│      Application State (stateStore.js)              │
│   ✅ In-memory cache (session-scoped)               │
│   - Latest readings                                  │
│   - Current inventory                                │
│   - Open alerts                                      │
│   - Reconstructable from MQTT retained msgs         │
└─────────────────────────────────────────────────────┘
```

**Key Point:** Data penting SUDAH tersimpan di MQTT broker dengan retained messages.

### D. Jika Database Ditambah Nanti

**Hanya perlu caching jika:**

```javascript
// Jika ada database queries yang mahal
database.queryInventory(fridgeId)  // Query berat
  ↓
// Cache di Redis untuk 5 menit
redis.setex(`inventory:${fridgeId}`, 300, result)
```

Tapi dalam konteks MQTT streaming:
- Data sudah available dari retained messages
- Tidak perlu query database setiap saat
- In-memory cache suffisien

---

## 4️⃣ REKOMENDASI UNTUK SISTEM ANDA

### Phase 1: Current (Development) ✅
```
.env → docker-compose → MQTT Broker
                    ↓
                In-Memory Cache (stateStore)
                    ↓
                Dashboard
```
**Status:** Cukup. Redis tidak perlu.

### Phase 2: Production (Multi-Node) 🔮
```
.env.production
      ↓
docker-compose → MQTT Broker (High Availability)
      ↓
  [App Node 1] → Redis Shared Cache ← [App Node 2]
      ↓
  Database (PostgreSQL) untuk long-term archive
```
**Ketika:** Jika scale ke multiple instances
**Alasan:** Share state antar node, persistent across restarts

### Phase 3: Enterprise (With Database) 🏢
```
.env.production
      ↓
MQTT → [Core 1] → Redis (L1 Cache)
        [Core 2] → PostgreSQL (L2 Cache/Archive)
        [Core 3]
      ↓
    Dashboard
```
**Ketika:** Need audit trail, historical data, compliance
**Alasan:** MQTT + Redis for speed, DB for compliance

---

## 5️⃣ ACTUAL IMPLEMENTATION - Add dotenv

### Install dependency:
```bash
npm install dotenv
```

### Create src/shared/config.js:
```javascript
require('dotenv').config();

module.exports = {
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    topicRoot: process.env.MQTT_TOPIC_ROOT || 'medicold',
  },
  node: {
    env: process.env.NODE_ENV || 'development',
  },
};
```

### Update docker-compose.yml:
```yaml
services:
  core:
    build:
      context: .
    environment:
      MQTT_BROKER_URL: ${MQTT_BROKER_URL}
      MQTT_TOPIC_ROOT: ${MQTT_TOPIC_ROOT}
      NODE_ENV: ${NODE_ENV}
```

### Run:
```bash
docker compose --env-file .env.local up
```

---

## 6️⃣ QUICK COMPARISON

| Aspect | In-Memory | Redis | PostgreSQL |
|--------|-----------|-------|-----------|
| **Speed** | ⚡⚡⚡ Instant | ⚡⚡ Fast | ⚡ Slower |
| **Persistence** | ❌ No | ✅ Optional | ✅ Yes |
| **Shared State** | ❌ Single node | ✅ Multi-node | ✅ Multi-node |
| **Use Case** | Dev, Single node | Scaling | Compliance |
| **For You Now** | ✅ Perfect | ❌ Not needed | ❌ Not needed |

---

## 7️⃣ CONCLUSION

✅ **ADD .env files** - Best practice, sudah saya buatkan  
✅ **Keep In-Memory Cache** - Sufficient untuk streaming MQTT  
❌ **Skip Redis for now** - Add later jika multi-node  
❌ **Skip Database for now** - MQTT + In-memory cukup  

**Philosophy:** MQTT broker IS the database untuk streaming data.  
Gunakan Redis/PostgreSQL hanya untuk:
- **Redis:** Shared state across multiple app instances
- **PostgreSQL:** Audit trail & historical archive

Untuk single-node development/staging → In-memory cache cukup 💯

