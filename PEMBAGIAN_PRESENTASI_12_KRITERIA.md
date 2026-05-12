# 🗣️ Skenario Demonstrasi & Pembagian Presentasi (12 Kriteria)
**Proyek:** Smart Cold Storage Berbasis MQTT  
**Jumlah Presenter:** 2 Orang (Anggota A & Anggota B)

---

## 👥 Pembagian Tugas & Fokus Kriteria

**👨‍💻 Anggota A (Konsep Dasar, Struktur Data, & Fitur Efisiensi)**
Fokus Kriteria: 1, 2, 3, 4, 5, 6
Menjelaskan arsitektur dasar, bagaimana topik disusun, cara MQTT menyimpan data, dan fitur-fitur efisiensi ukuran/umur pesan dari MQTT v5.

**👨‍💻 Anggota B (Keandalan, Pola Komunikasi, Beban Sistem, & Visualisasi)**
Fokus Kriteria: 7, 8, 9, 10, 11
Menjelaskan bagaimana sistem menangani putus koneksi (LWT), komunikasi dua arah, pembagian beban kerja (Shared Subscription), dan visualisasi pada Dashboard Web.

*(Kriteria 12: Pemahaman dan presentasi akan dinilai dari cara kalian berdua menjelaskannya).*

---

## 🎬 SKENARIO DEMONSTRASI (STEP-BY-STEP)

### 📌 SESI 1: Oleh Anggota A

**1. Pembukaan & Implementasi Arsitektur MQTT (Kriteria 1)**
* **Aksi:** Buka IDE dan tunjukkan struktur folder, lalu pastikan docker sedang berjalan.
* **Penjelasan:** "Halo, kami akan mendemonstrasikan sistem Smart Cold Storage kami yang menggunakan **Arsitektur MQTT**. Di sistem ini, terdapat **Mosquitto** sebagai Broker, sensor/dummy_sender sebagai **Publisher** (pengirim suhu), dan core server serta Web Dashboard sebagai **Subscriber**. Komunikasi dilakukan secara asinkron (Publish-Subscribe) yang memisahkan pengirim dan penerima data."

**2. Wildcard & Topic Hierarchy (Kriteria 2)**
* **Aksi:** Buka file `src/shared/topics.js` (baris 16-21).
* **Penjelasan:** "Kami menggunakan **Topic Hierarchy** yang terstruktur dengan format `medicold/<fridge_id>/<domain>/<action>`. Untuk menangkap data dari semua kulkas secara dinamis, kami mengimplementasikan **Wildcard `+`** (Single-level wildcard) pada backend, contohnya: `medicold/+/telemetry/stream` sehingga server bisa menerima data dari kulkas A, B, maupun C menggunakan satu *subscribe* saja."

**3. Retained Message (Kriteria 3)**
* **Aksi:** Buka tab Web Dashboard, tunjukkan data suhu awal yang langsung muncul saat web pertama kali dibuka.
* **Penjelasan:** "Untuk menyimpan status suhu terakhir, kami menggunakan fitur **Retained Message** (flag `retain: true`). Ini kami terapkan di topik `medicold/+/telemetry/latest`. Ketika Dashboard Web (Subscriber baru) terkoneksi, ia tidak perlu menunggu sensor mengirim data baru, tapi broker langsung mengirimkan data Retained yang disimpan terakhir kali."

**4. Message Expiry Interval (Kriteria 4)**
* **Aksi:** Tunjukkan file `src/server/core.js` bagian di mana `properties.messageExpiryInterval` diset (fitur MQTT v5).
* **Penjelasan:** "Sistem kami menggunakan **Message Expiry Interval** (fitur dari MQTT v5). Pesan yang berisi data live stream kami atur dengan interval kadaluarsa singkat. Artinya, jika *subscriber* sedang *offline* dan telat menerima pesan, pesan itu akan otomatis dihapus oleh Broker agar klien tidak dibanjiri data suhu yang sudah usang saat kembali *online*."

**5. User Property / Metadata (Kriteria 5)**
* **Aksi:** Tunjukkan terminal/log pada `core.js` saat memproses pesan.
* **Penjelasan:** "Kami memanfaatkan **User Property** (MQTT v5) untuk mengirimkan metadata ekstra di setiap *payload* MQTT, seperti `app_version`, `client_type`, atau `timestamp` pengiriman tanpa harus memasukkannya ke dalam bodi JSON. Ini membuat *parsing* di backend menjadi lebih mudah dan efisien untuk keperluan log dan *routing* pesan."

**6. Topic Alias (Kriteria 6)**
* **Aksi:** Tunjukkan file `src/shared/mqttClient.js` atau sebutkan saat inisiasi koneksi klien MQTT.
* **Penjelasan:** "Untuk menekan penggunaan bandwidth, kami mengaktifkan **Topic Alias**. Karena sensor terus menerus mengirim data ke topik panjang seperti `medicold/FRIDGE-A/telemetry/stream`, MQTT v5 akan otomatis memetakan topik panjang tersebut menjadi integer kecil (Alias) setelah pesan pertama, sehingga menghemat ukuran paket TCP yang dikirim secara konstan."

---

### 📌 SESI 2: Oleh Anggota B

**7. Last Will and Testament / LWT (Kriteria 7)**
* **Aksi:** Putuskan/hentikan paksa kontainer/script `dummy:sender` (sensor). Tunjukkan log di web dashboard atau terminal backend.
* **Penjelasan:** "Untuk mendeteksi apakah sebuah sensor/kulkas mati mendadak (putus koneksi), kami mengatur pesan wasiat atau **Last Will and Testament (LWT)** saat sensor terkoneksi ke broker. Jadi, saat saya matikan sensor secara paksa (demonstrasikan), Broker akan menyadari bahwa sensor putus (tanpa `disconnect` resmi) dan broker otomatis mempublikasikan pesan LWT ke topik `medicold/FRIDGE-A/status` dengan payload `STATUS_OFFLINE`."

**8. Request-Response Pattern (Kriteria 8)**
* **Aksi:** Buka terminal baru dan jalankan `npm run admin` atau command spesifik yang meminta data (misal: mengambil daftar stok inventory/box).
* **Penjelasan:** "Selain Publish-Subscribe, kami juga mengimplementasikan pola **Request-Response** menggunakan MQTT v5. Klien Admin mempublikasikan *request* ke suatu topik komando, sambil menyertakan properti `Response Topic` dan `Correlation ID`. Server akan merespon tepat di topik yang diminta tersebut. Hal ini membuat MQTT bisa digunakan selayaknya API konvensional (RPC)."

**9. Shared Subscription (Kriteria 9)**
* **Aksi:** Jalankan dua atau lebih instance dari `core.js` secara bersamaan.
* **Penjelasan:** "Untuk memenuhi kriteria ke-9 dan mencegah *bottleneck* di backend saat jumlah sensor ribuan, kami memakai **Shared Subscription**. Kedua backend kami men-subscribe dengan format `$share/medicold_group/medicold/+/telemetry/stream`. Dengan begini, Broker akan melakukan *load-balancing* pola *Round-Robin*. Pesan dari kulkas A dikerjakan Server 1, kulkas B dikerjakan Server 2."

**10. Flow Control / Overload Scenario (Kriteria 10)**
* **Aksi:** Gunakan tool load test atau `mqtt-control-tool.js` untuk membanjiri broker dengan puluhan pesan per detik.
* **Penjelasan:** "Kami menggunakan fitur MQTT v5 **Receive Maximum** sebagai mekanisme **Flow Control**. Jika sensor tiba-tiba error dan membanjiri broker dengan pesan (Overload Scenario), limit `receiveMaximum` dan `maximumPacketSize` pada konfigurasi klien dan broker akan menahan banjir data, memastikan server *core* tidak crash atau kehabisan memori (*out of memory*)."

**11. Dashboard Monitoring (Kriteria 11)**
* **Aksi:** Buka dan navigasikan Web Dashboard di `http://localhost:5173`.
* **Penjelasan:** "Semua data yang mengalir, retained message, LWT status, dan alert anomali divisualisasikan pada **Dashboard Monitoring** ini. Dashboard di-build dengan Vite dan terhubung ke broker via WebSockets (`ws://localhost:9001`). Kami men-subscribe topik dari browser secara langsung untuk mendapat delay sekecil mungkin."

**12. Presentasi & Pemahaman Konsep (Kriteria 12)**
* **Penjelasan Bersama:** "Itulah 11 fitur utama MQTT v5 yang kami terapkan di proyek Smart Cold Storage ini untuk menjadikannya reliabel, *scalable*, dan responsif. Kami siap menjawab pertanyaan jika ada yang perlu didalami."

---

## 🎯 Persiapan Penting Sebelum Demo
1. Jalankan `npm run compose` (Pastikan Broker, Backend, dan Frontend menyala).
2. Tahu letak *script* simulasi putus koneksi untuk demo **LWT (Kriteria 7)**.
3. Tahu cara memanggil *Request-Response* (menggunakan CLI `npm run admin`).
4. Buka lebih dari satu terminal untuk menunjukkan pembagian tugas dengan **Shared Subscription (Kriteria 9)**.
