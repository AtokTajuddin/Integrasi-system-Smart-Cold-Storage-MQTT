# Skenario Demonstrasi & Pembagian Presentasi 12 Kriteria

**Proyek:** Medicold Smart Cold Storage berbasis MQTT
**Presenter:** 2 orang, Anggota A dan Anggota B
**Tujuan file ini:** menjadi naskah utama presentasi. Semua penjelasan rubrik, aksi demo, file bukti, dan command penting dikumpulkan di sini.

---

## Ringkasan Nilai Jual Sistem

Medicold mensimulasikan cold storage medis yang mengirim data suhu, kelembaban, tekanan, pintu, dan status listrik melalui MQTT. Sensor/dummy sender bertindak sebagai publisher, Mosquitto sebagai broker, core service sebagai subscriber sekaligus publisher snapshot/alert, dan dashboard web sebagai subscriber realtime melalui WebSocket MQTT.

Poin besar yang harus terus disebut:

- Sistem memakai publish-subscribe, jadi sensor tidak perlu tahu siapa penerima datanya.
- Topic sudah hierarkis dan memakai wildcard.
- Snapshot penting dibuat retained agar dashboard baru langsung mendapat state terakhir.
- Command tidak retained agar command lama tidak dieksekusi ulang.
- QoS utama yang dipakai adalah QoS 1 agar pesan penting minimal sampai satu kali.
- Fitur MQTT 5.0 yang dipakai: message expiry, user properties, topic alias, Last Will, request-response, receive maximum, dan shared subscription.
- Dashboard web bukan data statis; data datang dari broker MQTT melalui `ws://localhost:9001`.

---

## Posisi QoS di Rubrik

QoS tidak perlu dibuat sebagai kriteria terpisah jika rubrik utama yang diberikan adalah:

- Implementasi arsitektur MQTT
- Wildcard dan topic hierarchy
- Retained message
- Message expiry
- User properties / metadata
- Topic alias
- Last Will and Testament
- Request-response flow
- Control dashboard
- Presentasi dan pemahaman konsep

QoS paling tepat dimasukkan ke:

1. **Kriteria 1 - Implementasi Arsitektur MQTT**
   Karena QoS adalah bagian dari desain komunikasi MQTT: bagaimana publisher, broker, dan subscriber menjamin pengiriman pesan.

2. **Kriteria 8 - Request-Response Pattern**
   Karena command dan response perlu delivery guarantee. Di sistem ini command memakai QoS 1 agar request/response tidak gampang hilang.

3. **Kriteria 10 - Flow Control / Overload Handling**
   Karena QoS berhubungan dengan ACK, retry, kemungkinan duplikasi, dan beban broker/client.

Kalimat aman saat presentasi:

"QoS kami masukkan sebagai bagian dari arsitektur komunikasi MQTT. Hampir semua publish dan subscribe utama memakai QoS 1, yaitu at least once, karena data telemetry, alert, snapshot, dan command harus sampai ke penerima. Kami tidak memakai QoS 0 karena terlalu berisiko untuk data cold storage medis, dan tidak memakai QoS 2 karena lebih berat serta belum dibutuhkan untuk demo ini."

---

## Pembagian Presenter

### Anggota A: Konsep Dasar & Efisiensi MQTT

Membawakan kriteria 1 sampai 6:

1. Arsitektur MQTT
2. Wildcard dan topic hierarchy
3. Retained message
4. Message expiry interval
5. User properties / metadata
6. Topic alias

### Anggota B: Keandalan, Komunikasi Dua Arah, Skalabilitas, Dashboard

Membawakan kriteria 7 sampai 12:

7. Last Will and Testament
8. Request-response pattern
9. Shared subscription
10. Flow control / overload handling
11. Dashboard monitoring
12. Pemahaman konsep dan kesimpulan

---

## Persiapan Sebelum Presentasi

Jalankan semua service:

```bash
docker compose up --build
```

Buka dashboard:

```text
http://localhost:5173
```

File yang sebaiknya sudah terbuka di IDE:

- `src/shared/topics.js`
- `src/shared/mqttClient.js`
- `src/server/core.js`
- `src/server/logic/anomaly.js`
- `src/client/dummy_sender.js`
- `web/src/main.js`
- `docker-compose.yml`
- `config/mosquitto.conf`

Tool tambahan untuk demo inspeksi MQTT:

```bash
node validate-mqtt.js
node mqtt-control-tool.js
```

Kalau `pnpm` tersedia, boleh pakai:

```bash
pnpm mqtt:validate
pnpm mqtt:control
```

---

## Alur Demo Singkat

1. Tunjukkan `docker compose up --build` sudah menjalankan `broker`, `core`, `dummy-sender`, dan `dashboard`.
2. Buka dashboard, tunjukkan status Connected dan 5 fridge muncul.
3. Tunjukkan `src/shared/topics.js` untuk topic hierarchy dan wildcard.
4. Refresh dashboard untuk membuktikan retained message.
5. Jalankan satu skenario sensor, misalnya:

```bash
pnpm sensor -- --fridgeId FRIDGE-B --scenario temp_rise --readings 30 --intervalMs 1000
```

6. Tunjukkan alert berubah dari normal ke warning/critical/emergency.
7. Klik resolve alert atau delete box di dashboard, lalu tunjukkan event response command.
8. Untuk LWT, hentikan paksa salah satu client/sender dan tunjukkan event `medicold/system/client-status`.
9. Untuk control tool, subscribe wildcard:

```text
subscribe medicold/+/telemetry/latest
subscribe medicold/+/alerts/stream
history
```

---

# Naskah Per Kriteria

## 1. Implementasi Arsitektur MQTT

**Aksi demo:** Buka `docker-compose.yml`, `config/mosquitto.conf`, dan jelaskan service yang berjalan.

**Bukti file:**

- `docker-compose.yml`
- `config/mosquitto.conf`
- `src/client/sensor.js`
- `src/client/dummy_sender.js`
- `src/server/core.js`
- `web/src/main.js`

**Penjelasan yang diucapkan:**

"Sistem kami memakai arsitektur MQTT publish-subscribe. Broker yang dipakai adalah Mosquitto. Sensor dan dummy sender bertindak sebagai publisher yang mengirim data telemetry. Core service menjadi subscriber untuk telemetry, lalu memproses anomaly detection. Setelah diproses, core kembali menjadi publisher untuk snapshot, status, alert, inventory, dan response command. Dashboard web menjadi subscriber yang membaca snapshot dan live event lewat WebSocket MQTT."

**Alur data:**

```text
Sensor/Dummy Sender
  -> publish medicold/{id}/telemetry/stream
  -> Mosquitto Broker
  -> Core Service subscribe wildcard
  -> anomaly detection + state store
  -> publish telemetry/latest, status, alerts/stream
  -> Dashboard subscribe dan render realtime
```

**Poin penilaian:** Ada broker, publisher, subscriber, dan komunikasi asinkron yang jelas.

### Strategi QoS pada Arsitektur

**Aksi demo:** Buka `src/server/core.js`, `src/client/sensor.js`, `src/client/admin.js`, dan `web/src/main.js`, lalu tunjukkan publish/subscribe memakai `{ qos: 1 }`.

**Penjelasan yang diucapkan:**

"Di MQTT ada tiga level QoS. QoS 0 berarti at most once, pesan dikirim tanpa ACK dan tanpa retry, jadi cepat tetapi bisa hilang. QoS 1 berarti at least once, ada alur PUBLISH lalu PUBACK; jika ACK tidak diterima, pesan bisa dikirim ulang. Artinya pesan pasti diusahakan sampai, tetapi subscriber harus siap menerima kemungkinan duplikasi. QoS 2 berarti exactly once dengan alur PUBLISH, PUBREC, PUBREL, PUBCOMP. Ini paling aman dari duplikasi, tetapi paling berat."

**Strategi Medicold:**

| Jenis pesan | QoS | Alasan |
|---|---:|---|
| Telemetry stream | 1 | Data sensor penting sampai ke core; duplikasi masih bisa ditoleransi karena setiap reading punya timestamp/session |
| Telemetry latest/status | 1 | Snapshot state harus sampai ke dashboard/subscriber baru |
| Alert stream/latest | 1 | Alert medis penting tidak boleh mudah hilang |
| Inventory/box command | 1 | Command perlu ACK dari broker dan response dari core |
| Command response | 1 | Client perlu menerima hasil sukses/gagal |
| LWT client-status | 1 | Event offline perlu sampai ke subscriber monitoring |

**Kenapa tidak QoS 0?**

QoS 0 terlalu ringan untuk use case cold storage medis. Kalau alert suhu tinggi hilang, dashboard bisa terlambat mengetahui kondisi bahaya.

**Kenapa tidak QoS 2?**

QoS 2 lebih berat karena handshake empat langkah. Untuk demo ini QoS 1 sudah cukup karena sistem memakai timestamp, state snapshot, dan `correlation_id`. Jika nanti ada command kritis yang benar-benar tidak boleh dieksekusi dua kali, QoS 2 bisa dipakai bersama idempotency key di sisi core.

---

## 2. Wildcard dan Topic Hierarchy

**Aksi demo:** Buka `src/shared/topics.js`.

**Bukti file:**

- `src/shared/topics.js`
- `src/server/core.js`
- `web/src/main.js`

**Topic utama:**

| Topic | Fungsi |
|---|---|
| `medicold/{id}/telemetry/stream` | Sensor publish data live ke core |
| `medicold/{id}/telemetry/latest` | Snapshot telemetry terakhir, retained |
| `medicold/{id}/status` | Status fridge terakhir |
| `medicold/{id}/alerts/stream` | Event alert live |
| `medicold/{id}/alerts/latest` | Alert aktif terakhir, retained |
| `medicold/{id}/inventory/commands/register` | Command register batch |
| `medicold/{id}/inventory/snapshot` | Snapshot inventory |
| `medicold/system/boxes/commands/upsert` | Command tambah/update box |
| `medicold/system/boxes/commands/delete` | Command hapus box |
| `medicold/system/boxes/snapshot` | Snapshot semua box |
| `medicold/system/alerts/commands/resolve` | Command resolve alert |
| `medicold/replies/{clientId}` | Response command |
| `medicold/system/client-status` | Last Will client offline |

**Penjelasan yang diucapkan:**

"Topic kami dibuat hierarkis dengan pola `root/scope/domain/kind/action`. Root-nya `medicold`, scope-nya bisa `FRIDGE-A` atau `system`, domain-nya misalnya `telemetry`, `alerts`, `inventory`, atau `boxes`. Core service memakai wildcard `+`, contohnya `medicold/+/telemetry/stream`, sehingga satu subscriber bisa menerima telemetry dari semua fridge tanpa hardcode satu per satu."

**Poin penting:**

- `+` berarti single-level wildcard.
- `medicold/+/telemetry/stream` cocok untuk `FRIDGE-A`, `FRIDGE-B`, dan seterusnya.
- Command dipisahkan dari snapshot agar command lama tidak replay.

---

## 3. Retained Message

**Aksi demo:** Refresh dashboard, lalu tunjukkan data fridge tetap muncul tanpa menunggu sensor publish ulang.

**Bukti file:**

- `src/server/core.js`
- `web/src/main.js`

**Topic retained:**

| Topic | Retain | Alasan |
|---|---:|---|
| `telemetry/latest` | Ya | Dashboard baru langsung mendapat suhu terakhir |
| `status` | Ya | Status fridge tidak hilang saat subscriber baru masuk |
| `alerts/latest` | Ya | Alert aktif terakhir tetap diketahui |
| `inventory/snapshot` | Ya | Inventory terakhir tersedia |
| `box/snapshot` | Ya | Detail box per fridge tersedia |
| `system/boxes/snapshot` | Ya | Registry semua box tersedia |
| `system/status` | Ya | Status core service tersedia |

**Penjelasan yang diucapkan:**

"Retained message membuat broker menyimpan satu pesan terakhir pada topic tertentu. Ini cocok untuk data state seperti suhu terakhir, status terakhir, dan snapshot inventory. Karena itu saat dashboard dibuka atau di-refresh, broker langsung mengirim retained message ke dashboard. Dashboard tidak perlu menunggu sensor mengirim data baru."

**Yang perlu ditekankan:**

- Streaming telemetry mentah tidak retained.
- Command tidak retained.
- Retained hanya untuk snapshot/state terbaru.

---

## 4. Message Expiry Interval

**Aksi demo:** Buka `src/shared/mqttClient.js` dan `src/server/core.js`, cari `messageExpiryInterval`.

**Bukti file:**

- `src/shared/mqttClient.js`
- `src/server/core.js`

**Penjelasan yang diucapkan:**

"Message Expiry Interval adalah fitur MQTT 5.0 untuk memberi masa berlaku pesan. Retained message memang berguna, tetapi jika tidak diberi expiry, data lama bisa terlalu lama bertahan di broker. Di sistem kami, snapshot seperti telemetry dan inventory diberi expiry 24 jam, status dan latest alert 1 jam, sedangkan alert stream dan response command 5 menit."

**Policy yang dipakai:**

| Jenis pesan | Expiry |
|---|---:|
| Telemetry latest | 24 jam |
| Inventory snapshot | 24 jam |
| Box snapshot | 24 jam |
| Status | 1 jam |
| Alert latest | 1 jam |
| Alert stream | 5 menit |
| Command response | 5 menit |

**Poin penilaian:** Broker tidak menyimpan data basi terlalu lama, sehingga memory dan data freshness lebih terkontrol.

---

## 5. User Properties / Metadata

**Aksi demo:** Buka `src/shared/mqttClient.js`, lalu gunakan `mqtt-control-tool.js` untuk melihat message properties.

**Bukti file:**

- `src/shared/mqttClient.js`
- `src/server/core.js`
- `mqtt-control-tool.js`

**Penjelasan yang diucapkan:**

"User properties adalah metadata header di MQTT 5.0. Di sistem kami, helper `publishJson()` menambahkan metadata seperti `source`, `priority`, `timestamp`, dan `correlation-id`. Metadata ini tidak harus dimasukkan ke payload bisnis, sehingga payload tetap fokus pada isi data sensor atau command."

**Metadata yang dipakai:**

| Property | Fungsi |
|---|---|
| `source` | Menandai pengirim, misalnya `medicold-core` |
| `priority` | Menandai prioritas pesan: high, normal, low |
| `timestamp` | Waktu publish message |
| `correlation-id` | Menghubungkan command dengan response |

**Kalimat tambahan:**

"Saat alert critical atau emergency, core memberi priority lebih tinggi. Ini membantu trace pesan dan memudahkan debugging."

---

## 6. Topic Alias

**Aksi demo:** Buka `src/shared/mqttClient.js`, cari `autoAssignTopicAlias` dan `autoUseTopicAlias`.

**Bukti file:**

- `src/shared/mqttClient.js`

**Penjelasan yang diucapkan:**

"Topic MQTT di sistem IoT bisa panjang dan dikirim berulang, misalnya `medicold/FRIDGE-A/telemetry/stream`. Dengan Topic Alias di MQTT 5.0, client bisa memetakan topic panjang menjadi angka kecil. Setelah alias terbentuk, publish berikutnya bisa lebih hemat bandwidth. Di helper MQTT kami, `autoAssignTopicAlias` dan `autoUseTopicAlias` aktif."

**Poin penilaian:**

- Cocok untuk telemetry berulang.
- Mengurangi overhead topic string.
- Berguna jika sensor banyak atau koneksi terbatas.

---

## 7. Last Will and Testament

**Aksi demo:** Buka `src/shared/mqttClient.js`, lalu hentikan paksa salah satu client/sender. Tunjukkan event di dashboard atau control tool pada topic `medicold/system/client-status`.

**Bukti file:**

- `src/shared/mqttClient.js`
- `web/src/main.js`

**Penjelasan yang diucapkan:**

"Last Will and Testament adalah pesan otomatis dari broker ketika client putus secara tidak normal. Saat client Medicold dibuat, kami mendaftarkan will message ke topic `medicold/system/client-status`. Jika sensor, dummy sender, atau client lain mati mendadak, broker menerbitkan pesan `client.offline`. Dashboard juga subscribe ke topic ini, sehingga kejadian offline bisa terlihat sebagai event."

**Catatan penting untuk tidak salah ucap:**

- LWT tidak publish ke `medicold/FRIDGE-A/status`.
- LWT publish ke `medicold/system/client-status`.
- Status fridge tetap dipublish core ke `medicold/{id}/status`.

**Command demo opsional:**

```text
subscribe medicold/system/client-status
```

---

## 8. Request-Response Pattern

**Aksi demo:** Klik delete box atau resolve alert di dashboard. Alternatif CLI: register batch dengan admin.

**Bukti file:**

- `src/server/core.js`
- `src/client/admin.js`
- `src/client/dashboard.js`
- `web/src/main.js`
- `src/shared/topics.js`

**Penjelasan yang diucapkan:**

"MQTT biasanya publish-subscribe, tetapi kami juga menerapkan request-response untuk command. Client mengirim command dengan `correlation_id` dan `reply_to`. Core memproses command, lalu mengirim response ke `medicold/replies/{clientId}` dengan correlation id yang sama. Dengan ini dashboard atau admin bisa tahu command berhasil atau gagal."

**Contoh flow:**

```text
Dashboard publish delete box
  -> medicold/system/boxes/commands/delete
  -> payload berisi correlation_id + reply_to
Core proses command
  -> publish response ke medicold/replies/{clientId}
Dashboard menerima command-response-ok / command-response-error
```

**Command CLI contoh:**

```bash
pnpm admin -- --action register --fridgeId FRIDGE-A --batchId BATCH-DEMO-001 --content VACCINE --qty 20
```

**Poin penilaian:** Ada komunikasi dua arah tanpa meninggalkan model MQTT.

**QoS pada request-response:**

"Command dan response memakai QoS 1. Artinya command akan mendapat PUBACK dari broker dan punya retry jika ACK tidak diterima. Karena QoS 1 punya kemungkinan duplikasi, setiap command membawa `correlation_id` agar client bisa mencocokkan response yang benar. Untuk perintah yang benar-benar tidak boleh dieksekusi dua kali, peningkatan berikutnya adalah memakai QoS 2 atau idempotency key di core."

---

## 9. Shared Subscription

**Aksi demo:** Buka `src/server/core.js`, `src/shared/topics.js`, dan `docker-compose.yml`.

**Bukti file:**

- `src/server/core.js`
- `src/shared/topics.js`
- `docker-compose.yml`

**Penjelasan yang diucapkan:**

"Shared subscription dipakai untuk membagi beban subscriber. Pada Docker, core diberi environment `MQTT_SHARED_GROUP=medicold-core-group`. Saat env ini aktif, subscription input core berubah menjadi format `$share/medicold-core-group/<topic>`, misalnya `$share/medicold-core-group/medicold/+/telemetry/stream`. Jika ada lebih dari satu instance core dalam group yang sama, broker akan membagi pesan ke anggota group tersebut, sehingga beban pemrosesan tidak menumpuk di satu backend."

**Command demo opsional untuk menjalankan core kedua secara manual:**

```bash
MQTT_BROKER_URL=mqtt://localhost:1883 MQTT_SHARED_GROUP=medicold-core-group node src/server/core.js
```

Jalankan command di atas setelah broker Docker hidup. Core di Docker dan core manual akan berada dalam shared group yang sama. Jika tidak ingin menjalankan proses tambahan saat presentasi, cukup jelaskan konsepnya lewat subscription string:

```text
$share/medicold-core-group/medicold/+/telemetry/stream
```

**Poin penilaian:**

- Shared subscription aktif untuk topic input core: telemetry, inventory command, box command, dan resolve alert.
- Dengan `$share`, satu pesan hanya dikirim ke salah satu subscriber dalam grup, bukan ke semua core.
- Ini mencegah duplicate processing ketika core service dijalankan lebih dari satu instance.

---

## 10. Flow Control / Overload Handling

**Aksi demo:** Buka `src/shared/mqttClient.js`, cari `receiveMaximum` dan `maximumPacketSize`. Jalankan skenario chaos.

**Bukti file:**

- `src/shared/mqttClient.js`
- `src/client/sensor.js`
- `src/client/dummy_sender.js`

**Penjelasan yang diucapkan:**

"Untuk flow control, client MQTT kami memakai fitur MQTT 5.0 seperti `receiveMaximum` dan `maximumPacketSize`. `receiveMaximum` membatasi jumlah publish QoS yang diproses bersamaan, sedangkan `maximumPacketSize` membatasi ukuran paket. Selain itu, skenario `chaos` dan dummy sender mengirim event cukup cepat untuk menunjukkan core dan dashboard tetap berjalan saat banyak anomaly masuk."

**Command demo:**

```bash
pnpm sensor -- --fridgeId FRIDGE-E --scenario chaos --readings 50 --intervalMs 800
```

**Kalimat tambahan:**

"Untuk sistem produksi, flow control ini bisa dilanjutkan dengan persistent queue, database, atau scaling core service. Untuk demo ini, MQTT-level flow control sudah ditunjukkan di konfigurasi client."

**Hubungan dengan QoS:**

"QoS 1 memang lebih aman daripada QoS 0, tetapi bisa menambah beban karena ada ACK dan retry. Karena itu flow control seperti `receiveMaximum` penting untuk membatasi pesan QoS yang sedang diproses bersamaan. Ini menjaga core dan dashboard tetap stabil saat traffic naik."

---

## 11. Dashboard Monitoring

**Aksi demo:** Buka `http://localhost:5173`.

**Bukti file:**

- `web/src/main.js`
- `web/src/styles.css`
- `web/index.html`

**Penjelasan yang diucapkan:**

"Dashboard web adalah frontend monitoring realtime. Browser connect ke broker lewat WebSocket `ws://localhost:9001`. Dashboard subscribe ke telemetry latest, status, alert latest, alert stream, inventory snapshot, box snapshot, system status, client-status, dan reply topic. Jadi data yang tampil bukan hardcode, tetapi hasil subscribe MQTT."

**Yang ditunjukkan di dashboard:**

- 5 fridge dalam grid.
- Status NORMAL/WARNING/CRITICAL/EMERGENCY.
- Average temperature.
- Open alerts.
- Inventory snapshot.
- Box registry.
- Event log retained/live.
- Command response dari delete box atau resolve alert.

**Poin penilaian:** Website ada, realtime, dan terhubung langsung ke MQTT.

---

## 12. Pemahaman Konsep dan Penutup

**Penjelasan bersama:**

"Kesimpulannya, sistem Medicold tidak hanya mengirim data sensor lewat MQTT, tetapi juga menunjukkan pola komunikasi IoT yang lengkap. Ada streaming telemetry untuk data realtime, retained snapshot untuk state terakhir, command request-response untuk aksi dari dashboard/admin, Last Will untuk mendeteksi client offline, message expiry untuk mencegah data basi, user properties untuk metadata, topic alias untuk efisiensi bandwidth, shared subscription untuk scaling backend, dan flow control untuk menjaga sistem saat traffic naik."

**Penutup singkat:**

"Dengan arsitektur ini, dashboard bisa memantau banyak cold storage medis secara realtime, alert bisa muncul otomatis ketika suhu atau kondisi sensor bermasalah, dan sistem tetap mudah dikembangkan untuk jumlah fridge yang lebih besar."

**Jika ditanya kekurangan:**

- State core masih in-memory; untuk produksi bisa ditambah Redis/PostgreSQL.
- Demo memakai satu broker Mosquitto; produksi bisa memakai broker cluster/managed MQTT.
- Shared subscription sudah didukung, tetapi demo scaling penuh tergantung setup Docker/container name.

---

## Skenario Demo Anomali

### Normal Operation

```bash
pnpm sensor -- --fridgeId FRIDGE-A --scenario normal --readings 30 --intervalMs 1000
```

Ekspektasi:

- Status `STATUS_NORMAL`.
- Suhu sekitar 4.5C.
- Dashboard menerima telemetry latest.

### Temperature Rise

```bash
pnpm sensor -- --fridgeId FRIDGE-B --scenario temp_rise --readings 30 --intervalMs 1000
```

Ekspektasi:

- Status naik dari NORMAL ke WARNING, CRITICAL, lalu EMERGENCY.
- Alert muncul di `medicold/FRIDGE-B/alerts/stream`.
- Latest alert retained di `medicold/FRIDGE-B/alerts/latest`.

### Door Open

```bash
pnpm sensor -- --fridgeId FRIDGE-C --scenario door_open --readings 30 --intervalMs 1000
```

Ekspektasi:

- Saat pintu mulai terbuka, status WARNING.
- Jika durasi lebih dari 30 detik, status CRITICAL.

### Power Fail

```bash
pnpm sensor -- --fridgeId FRIDGE-D --scenario power_fail --readings 40 --intervalMs 1000
```

Ekspektasi:

- `power_stable: false`.
- Alert power unstable level EMERGENCY.
- Dashboard memberi warna/indikasi critical/emergency.

### Chaos

```bash
pnpm sensor -- --fridgeId FRIDGE-E --scenario chaos --readings 50 --intervalMs 800
```

Ekspektasi:

- Banyak anomaly: suhu, kelembaban, tekanan, pintu, dan power.
- Event log dashboard bergerak cepat.
- Core tetap memproses message.

---

## Checklist Cepat Sebelum Dinilai

- [ ] `docker compose up --build` berjalan.
- [ ] Dashboard membuka `http://localhost:5173`.
- [ ] Status dashboard Connected.
- [ ] 5 fridge dari dummy sender terlihat.
- [ ] Refresh browser tetap menampilkan data retained.
- [ ] Skenario `temp_rise` memunculkan alert.
- [ ] Delete/resolve command menghasilkan response event.
- [ ] `src/shared/topics.js` siap ditunjukkan untuk wildcard.
- [ ] `src/shared/mqttClient.js` siap ditunjukkan untuk MQTT 5.0 features.
- [ ] `src/server/core.js` siap ditunjukkan untuk processing dan publish snapshot.
- [ ] `web/src/main.js` siap ditunjukkan untuk dashboard subscribe.

---

## Jawaban Singkat Untuk Pertanyaan Dosen

**Kenapa command tidak retained?**
Karena command lama bisa tereksekusi ulang saat core reconnect. Retained hanya dipakai untuk snapshot/state.

**Kenapa perlu `telemetry/stream` dan `telemetry/latest`?**
`stream` untuk event realtime yang tidak disimpan, `latest` untuk state terakhir yang disimpan broker sebagai retained message.

**Apa bedanya alert stream dan alert latest?**
`alerts/stream` adalah event live, `alerts/latest` adalah alert aktif terakhir untuk subscriber baru.

**Bagaimana dashboard tahu command berhasil?**
Dashboard mengirim `correlation_id` dan `reply_to`, lalu core membalas ke `medicold/replies/{clientId}`.

**Bagaimana kalau sensor mati mendadak?**
Broker menerbitkan Last Will ke `medicold/system/client-status`.

**Bagaimana sistem diskalakan?**
Core telemetry subscription mendukung shared subscription dengan `$share/medicold-core-group/...`, sehingga beberapa core bisa berbagi beban telemetry.

**Apa bukti website benar-benar subscribe MQTT?**
Di `web/src/main.js`, dashboard connect memakai `mqtt.connect()` ke WebSocket broker dan subscribe ke topic-topic MQTT.

**QoS masuk kriteria mana?**
QoS masuk ke kriteria implementasi arsitektur MQTT, lalu diperkuat lagi saat menjelaskan request-response dan flow control. Sistem ini memakai QoS 1 untuk pesan utama karena butuh delivery guarantee tanpa overhead QoS 2.
