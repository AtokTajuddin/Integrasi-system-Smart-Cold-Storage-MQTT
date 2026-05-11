# Medicold Smart Cold Storage - MQTT

Sistem integrasi pemantauan cold storage medis berbasis MQTT. Versi ini mengambil domain dari tugas Smart Cold Storage sebelumnya, tetapi protokol komunikasinya diganti menjadi MQTT publish/subscribe.

Fokus implementasi:

- **Streaming communication:** sensor mengirim telemetry secara kontinu ke topic MQTT.
- **Tetap ada communication/request-response:** admin dan dashboard mengirim command dengan `correlation_id` dan `reply_to`.
- **Retain Message:** snapshot terakhir disimpan oleh broker agar subscriber baru langsung menerima kondisi terkini.
- **Web dashboard:** monitoring MQTT via WebSocket dengan Vite dan Anime.js.

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
| `medicold/system/boxes/commands/upsert` | Dashboard/Sender -> Core | `false` | Command tambah atau update Medicold Box. |
| `medicold/system/boxes/commands/delete` | Dashboard -> Core | `false` | Command hapus Medicold Box. |
| `medicold/{fridgeId}/box/snapshot` | Core -> Dashboard | `true` | Snapshot detail box per fridge. |
| `medicold/system/boxes/snapshot` | Core -> Dashboard | `true` | Snapshot daftar Medicold Box. |
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
|   |   |-- dummy_sender.js
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
|-- web/
|   |-- index.html
|   `-- src/
|       |-- main.js
|       `-- styles.css
|-- docker-compose.yml
|-- package.json
`-- README.md
```

## Cara Menjalankan

Cara paling enak untuk menjalankan semua service:

```bash
docker compose up --build
```

Service yang akan naik:

| Service | URL/Port | Fungsi |
|---|---|---|
| `broker` | `1883`, `9001` | Mosquitto MQTT + WebSocket MQTT |
| `core` | internal Docker | MQTT core service, subscribe telemetry dan publish retained snapshot |
| `dummy-sender` | internal Docker | Publisher dummy untuk box registry, inventory command, dan telemetry stream |
| `dashboard` | `http://localhost:5173` | Dashboard web Vite + Anime.js |

Dummy data tidak dibuat di DOM/browser. Service `dummy-sender` mengirim data melalui MQTT, `core` menerima dan memprosesnya, lalu dashboard hanya menjadi receiver untuk retained snapshot dan live event.

Stop semua service:

```bash
docker compose down
```

### Menjalankan Manual

Install dependency:

```bash
pnpm install
```

Jika `pnpm` belum terpasang:

```bash
npx pnpm@11.0.9 install
```

Jalankan broker MQTT lokal:

```bash
pnpm broker
```

Di terminal lain, jalankan core service:

```bash
pnpm start
```

Jalankan dashboard web:

```bash
pnpm dashboard:web
```

Jalankan dummy sender MQTT:

```bash
pnpm dummy:sender
```

Buka URL Vite yang muncul di terminal, biasanya:

```text
http://localhost:5173
```

Dashboard web memakai MQTT WebSocket, jadi broker harus expose port `9001` dari `docker-compose.yml`. Tombol **Connection** di kanan atas membuka section settings terpisah untuk:

- connect/disconnect MQTT broker,
- mengubah topic root,
- filter fridge.

Dashboard web juga menyediakan CRUD **Medicold Boxes**. Operasi CRUD dikirim sebagai MQTT command ke `core`; dashboard kemudian menerima kembali snapshot box retained dari broker.

Dashboard terminal tetap tersedia untuk debugging:

```bash
pnpm dashboard -- --watch --fridge-ids FRIDGE-A,FRIDGE-B --min-level INFO
```

Daftarkan batch medis dari admin:

```bash
pnpm admin -- --action register \
  --fridge-id FRIDGE-A \
  --batch-id BATCH-001 \
  --content VACCINE \
  --qty 200 \
  --expiry-date 2026-12-31
```

Kirim telemetry streaming dari sensor:

```bash
pnpm sensor -- --fridge-id FRIDGE-A --scenario normal --readings 20 --interval-ms 1000
```

Coba skenario anomali:

```bash
pnpm sensor -- --fridge-id FRIDGE-A --scenario temp_rise --readings 20 --interval-ms 500
pnpm sensor -- --fridge-id FRIDGE-B --scenario power_fail --readings 20 --interval-ms 500
pnpm sensor -- --fridge-id FRIDGE-C --scenario chaos --readings 20 --interval-ms 500
```

Lihat snapshot inventory retained:

```bash
pnpm admin -- --action list --fridge-id FRIDGE-A
```

Resolve alert dari dashboard:

```bash
pnpm dashboard -- --resolve <alert_id> --by "Dr. Rina" --notes "Kulkas sudah stabil"
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
MQTT_BROKER_URL=mqtt://localhost:1883 pnpm start
```

## Pengujian

Test logic yang tidak membutuhkan broker:

```bash
pnpm test
```

Build dashboard web:

```bash
pnpm dashboard:web:build
```

Test runtime manual:

1. Jalankan broker.
2. Jalankan core service.
3. Jalankan dashboard web dengan `pnpm dashboard:web`.
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
