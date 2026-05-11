# Medicold Smart Cold Storage - MQTT

Sistem integrasi pemantauan cold storage medis berbasis MQTT. Versi ini mengambil domain dari tugas Smart Cold Storage sebelumnya, tetapi protokol komunikasinya diganti menjadi MQTT publish/subscribe.

Fokus implementasi:

- **Streaming communication:** sensor mengirim telemetry secara kontinu ke topic MQTT.
- **Tetap ada communication/request-response:** admin dan dashboard mengirim command dengan `correlation_id` dan `reply_to`.
- **Retain Message:** snapshot terakhir disimpan oleh broker agar subscriber baru langsung menerima kondisi terkini.

Repo referensi tugas sebelumnya: <https://github.com/MFaqihRidh0/Integrasi-system-Smart-Cold-Storage>

## Arsitektur

```text
                      publish retain=false
+-------------------+ medicold/{id}/telemetry/stream +----------------+
| Sensor Fridge     | ------------------------------> | MQTT Broker    |
| src/client/sensor |                                 | Mosquitto      |
+-------------------+                                 +-------+--------+
                                                                |
                                                                | subscribe
                                                                v
                                                        +-------+--------+
                                                        | Core Service   |
                                                        | src/server/core|
                                                        +-------+--------+
                                                                |
       publish retain=true snapshots                           | publish retain=false events
    +-----------------------------------------------------------+--------------------------+
    v                                                           v                          v
medicold/{id}/telemetry/latest                         medicold/{id}/alerts/stream     reply topics
medicold/{id}/status                                   medicold/{id}/alerts/latest     medicold/replies/{client}
medicold/{id}/inventory/snapshot
    ^                                                           ^
    | subscribe                                                 | subscribe
+---+---------------+                              +------------+-----------+
| Admin Client      |                              | Dashboard Client       |
| src/client/admin  |                              | src/client/dashboard   |
+-------------------+                              +------------------------+
```

## Konsep MQTT yang Dipakai

| Topic | Arah | Retain | Fungsi |
|---|---:|---:|---|
| `medicold/{fridgeId}/telemetry/stream` | Sensor -> Core | `false` | Streaming telemetry real-time. Message lama tidak diputar ulang. |
| `medicold/{fridgeId}/telemetry/latest` | Core -> Subscriber | `true` | Snapshot telemetry terakhir. Subscriber baru langsung dapat data terakhir. |
| `medicold/{fridgeId}/status` | Core -> Subscriber | `true` | Status fridge terakhir: normal, warning, critical, emergency. |
| `medicold/{fridgeId}/alerts/stream` | Core -> Dashboard | `false` | Event alert baru atau resolved secara live. |
| `medicold/{fridgeId}/alerts/latest` | Core -> Dashboard | `true` | Alert aktif terakhir, atau state bahwa tidak ada alert aktif. |
| `medicold/{fridgeId}/inventory/commands/register` | Admin -> Core | `false` | Command pendaftaran batch medis. |
| `medicold/{fridgeId}/inventory/snapshot` | Core -> Admin/Dashboard | `true` | Snapshot inventory terakhir. |
| `medicold/system/alerts/commands/resolve` | Dashboard -> Core | `false` | Command resolve alert. |
| `medicold/replies/{clientId}` | Core -> Client | `false` | Response command berbasis `correlation_id`. |

Catatan penting: command tidak dibuat retained supaya command lama tidak tereksekusi ulang saat core service reconnect.

## Struktur File

```text
.
|-- config/
|   `-- mosquitto.conf
|-- src/
|   |-- client/
|   |   |-- admin.js
|   |   |-- dashboard.js
|   |   `-- sensor.js
|   |-- server/
|   |   |-- core.js
|   |   |-- logic/
|   |   |   |-- anomaly.js
|   |   |   |-- inventory.js
|   |   |   `-- severity.js
|   |   `-- stateStore.js
|   `-- shared/
|       |-- cli.js
|       |-- json.js
|       |-- mqttClient.js
|       `-- topics.js
|-- test/
|   |-- anomaly.test.js
|   `-- inventory.test.js
|-- docker-compose.yml
|-- package.json
`-- README.md
```

## Cara Menjalankan

Install dependency:

```bash
npm install
```

Jalankan broker MQTT lokal:

```bash
docker compose up broker
```

Di terminal lain, jalankan core service:

```bash
npm start
```

Jalankan dashboard untuk melihat retained snapshot dan live stream:

```bash
npm run dashboard -- --watch --fridge-ids FRIDGE-A,FRIDGE-B --min-level INFO
```

Daftarkan batch medis dari admin:

```bash
npm run admin -- --action register \
  --fridge-id FRIDGE-A \
  --batch-id BATCH-001 \
  --content VACCINE \
  --qty 200 \
  --expiry-date 2026-12-31
```

Kirim telemetry streaming dari sensor:

```bash
npm run sensor -- --fridge-id FRIDGE-A --scenario normal --readings 20 --interval-ms 1000
```

Coba skenario anomali:

```bash
npm run sensor -- --fridge-id FRIDGE-A --scenario temp_rise --readings 20 --interval-ms 500
npm run sensor -- --fridge-id FRIDGE-B --scenario power_fail --readings 20 --interval-ms 500
npm run sensor -- --fridge-id FRIDGE-C --scenario chaos --readings 20 --interval-ms 500
```

Lihat snapshot inventory retained:

```bash
npm run admin -- --action list --fridge-id FRIDGE-A
```

Resolve alert dari dashboard:

```bash
npm run dashboard -- --resolve <alert_id> --by "Dr. Rina" --notes "Kulkas sudah stabil"
```

## Skenario Sensor

| Scenario | Perilaku |
|---|---|
| `normal` | Suhu, kelembaban, tekanan berada di range aman. |
| `temp_rise` | Suhu naik bertahap sampai melewati batas cold storage medis. |
| `door_open` | Pintu terbuka cukup lama sehingga memicu critical alert. |
| `power_fail` | Listrik tidak stabil dan memicu emergency alert. |
| `chaos` | Campuran beberapa anomali untuk menguji dashboard. |

## Threshold Anomali

| Parameter | Range Aman | Alert |
|---|---:|---|
| Suhu | 2C - 8C | `CRITICAL` jika keluar range, `EMERGENCY` jika <0C atau >10C |
| Kelembaban | 30% - 60% | `WARNING` |
| Tekanan | 980 - 1020 hPa | `WARNING` |
| Pintu terbuka | Maksimal 30 detik | `CRITICAL` |
| Power unstable | Harus stabil | `EMERGENCY` |

Nilai sensor yang tidak masuk akal secara fisik, misalnya suhu di atas 100C, akan ditolak oleh core service.

## Environment

| Variable | Default | Fungsi |
|---|---|---|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | Alamat broker MQTT. |
| `MQTT_TOPIC_ROOT` | `medicold` | Prefix topic seluruh sistem. |

Contoh:

```bash
MQTT_BROKER_URL=mqtt://localhost:1883 npm start
```

## Pengujian

Test logic yang tidak membutuhkan broker:

```bash
npm test
```

Test runtime manual:

1. Jalankan broker.
2. Jalankan core service.
3. Jalankan dashboard dengan `--watch`.
4. Publish data sensor dengan scenario `temp_rise`.
5. Dashboard akan menerima snapshot retained dan event alert live.

## Kenapa Retain Message Diletakkan di Snapshot

MQTT retained message menyimpan satu payload terakhir pada sebuah topic. Karena itu retained cocok untuk state terbaru:

- telemetry terakhir,
- status fridge terakhir,
- inventory snapshot terakhir,
- alert aktif terakhir,
- status core service.

Retained tidak cocok untuk telemetry stream mentah dan command, karena subscriber baru bisa menerima data/command lama yang sudah tidak relevan.
