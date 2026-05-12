# 🗣️ Skenario & Pembagian Presentasi Tugas MQTT
**Proyek:** Integrasi Sistem - Smart Cold Storage MQTT  
**Jumlah Anggota:** 2 Orang (Anggota A dan Anggota B)

---

## 🎯 Fokus Utama Penilaian (Wajib Disorot)
1. Minimal **3 Topik MQTT**
2. Minimal **2 Subscribe**
3. Terdapat **Website/Frontend**

---

## 👨‍💻 Pembagian Tugas Pembahasan

### 👤 Anggota 1: Pembukaan, Arsitektur, & Topik MQTT
**Fokus Pembahasan:** Menjelaskan secara umum apa aplikasi ini, arsitektur dasar (Broker, Publisher), dan poin penilaian **Topik MQTT**.

* **[00:00 - 01:00] 1. Pembukaan & Latar Belakang**
  * "Halo, kami dari kelompok ... akan mempresentasikan tugas Integrasi Sistem berbasis protokol MQTT."
  * "Proyek kami adalah **Smart Cold Storage** (Kulkas Medis Pintar). Sistem ini mensimulasikan pengiriman data sensor kulkas medis (seperti suhu dan peringatan bahaya) secara real-time."
  * "Komponen utamanya ada Broker (menggunakan Docker/Mosquitto), Core Server (backend), Dummy Sender (sensor), dan Web Dashboard (frontend)."

* **[01:00 - 02:30] 2. Penjelasan Topik (Menjawab Syarat 1: Minimal 3 Topik)**
  * "Pada tugas ini, disyaratkan minimal 3 topik MQTT. Kami telah mengimplementasikan lebih dari 3 topik yang bisa dilihat di file `src/shared/topics.js`."
  * **(Tunjukkan file `src/shared/topics.js` baris 16-21)**.
  * "Beberapa topik utamanya antara lain:"
    1. **`medicold/+/telemetry/stream`** → Topik untuk mengirim data sensor suhu secara langsung (streaming).
    2. **`medicold/+/status`** → Topik untuk memantau status aktif atau tidaknya kulkas.
    3. **`medicold/+/alerts/stream`** → Topik khusus untuk mengirimkan notifikasi peringatan/alert jika suhu kulkas tidak normal (anomali).

* **[02:30 - 03:00] 3. Demonstrasi Data Publisher (Sensor)**
  * "Di sini kami memiliki sensor yang secara konstan mem-publish data suhu ke topik telemetry."
  * **(Buka terminal yang menjalankan log sensor atau dashboard CLI)** untuk membuktikan bahwa data sukses di-publish ke broker.

---

### 👤 Anggota 2: Subscriptions, Proses Backend, & Web Dashboard
**Fokus Pembahasan:** Menjelaskan bagaimana data diterima (Subscribe), diproses di backend, dan ditampilkan ke Website (Frontend).

* **[03:00 - 04:30] 4. Penjelasan Subscribe (Menjawab Syarat 2: Minimal 2 Subscribe)**
  * "Setelah data dikirim oleh sensor, langkah selanjutnya adalah menerima data tersebut dengan proses *Subscribe*."
  * "Syarat kedua adalah minimal 2 *subscribe*. Sistem kami melakukan banyak *subscribe* baik di sisi Backend Server dan di sisi Website."
  * **(Tunjukkan file `src/server/core.js` baris 311-315)**.
  * "Di backend server (`core.js`), kami melakukan *subscribe* ke banyak topik sekaligus, antara lain ke topik *telemetryStream* (suhu), *inventoryRegister* (barang masuk), dan *boxUpsert* (pengaturan penyimpanan)."
  * "Ketika pesan diterima, backend akan mengecek suhu tersebut. Jika terlalu ekstrem (panas/dingin), server akan otomatis meng-generate status alert/bahaya."

* **[04:30 - 06:00] 5. Demonstrasi Web Dashboard (Menjawab Syarat 3: Ada Website)**
  * **(Buka web browser dan arahkan ke `http://localhost:5173`)**.
  * "Untuk memenuhi syarat ketiga, kami membangun web dashboard interaktif yang source code-nya berada pada folder `web/`."
  * "Website ini di-build menggunakan Vue/Vite dan langsung terhubung ke MQTT Broker melalui WebSocket."
  * **(Opsional: Tunjukkan file `web/src/main.js` di bagian baris 669 tempat website melakukan subscribe)**.
  * "Di web ini, Anda bisa melihat visualisasi data suhu yang berubah-ubah secara real-time karena website telah *subscribe* ke broker, sehingga pembaruan data dan status alert dapat langsung diterima oleh pengguna."

* **[06:00 - 06:30] 6. Kesimpulan & Penutup**
  * "Sebagai kesimpulan, aplikasi IoT Smart Cold Storage kami telah memenuhi semua kriteria penilaian:"
    - Ada lebih dari 3 topik yang dipakai.
    - Ada lebih dari 2 implementasi subscribe (di Backend dan Frontend web).
    - Ada visualisasi real-time berbasis Website.
  * "Sekian presentasi dan demonstrasi dari kelompok kami. Terima kasih."

---

## 💡 Tips Saat Presentasi
1. **Buka Code Editor:** Sebelum presentasi dimulai, pastikan file **`src/shared/topics.js`** dan **`src/server/core.js`** sudah dibuka agar tidak bingung mencari saat demo.
2. **Jalankan Aplikasi:** Pastikan `docker-compose` sudah berjalan dan website di `http://localhost:5173` sudah terbuka di browser sebelum dosen/penilai melihat.
3. **Pahami Cara Kerjanya:** Jika dosen bertanya di mana logika yang mendeteksi suhu kepanasan/kedinginan, Anda bisa membukakan file `src/server/logic/anomaly.js`.
