// src/config/faq.ts

export interface FaqItem {
  q: string;
  a: string;
  images?: string[];
}

export interface FaqCategory {
  category: string;
  icon?: string;
  items: FaqItem[];
}

export const faqData: FaqCategory[] = [
  // --- KATEGORI BARU ---
  {
    category: "Login & Akses",
    icon: "mdi-shield-lock-outline",
    items: [
      {
        q: "Muncul peringatan 'Koneksi Anda tidak pribadi' saat buka web?",
        // PERHATIKAN PENGGUNAAN <strong> DAN <br> DI BAWAH INI:
        a: "Jangan panik, ini <strong>BUKAN ERROR</strong>. Peringatan ini muncul karena aplikasi menggunakan jaringan internal kantor, bukan domain publik.<br><br><strong>Solusinya:</strong><br>1. Klik tombol <strong>Lanjutan (Advanced)</strong>.<br>2. Klik link <strong>Lanjutkan ke... (Proceed to...)</strong> di bagian bawah.<br>3. Web akan terbuka normal.",
        // UBAH JADI ARRAY. Contoh jika ada 2 gambar:
        images: [
          "/images/faq/koneksi-tidak-pribadi.png",
          "/images/faq/koneksi-tidak-pribadi-2.png", // Gambar kedua (opsional)
        ],
      },
      {
        q: "Gagal Login / Layar Putih setelah klik Lanjut?",
        a: "Ini biasanya karena <strong>Sertifikat Pengguna</strong> belum dipilih.<br><br>Saat pertama kali akses, browser akan memunculkan popup kecil 'Select Certificate'. Pastikan Anda <strong>memilih nama user/sertifikat</strong> yang tersedia lalu klik <strong>OK</strong>.<br><br>Jika terlanjur 'Cancel', tutup browser sepenuhnya lalu buka ulang.",
        images: ["/images/faq/koneksi-tidak-pribadi-3.png"], // Tidak wajib ada
      },
      {
        q: "Muncul pesan error merah 'Token tidak valid'?",
        a: "Pesan ini muncul karena **Sesi Login Anda telah berakhir** (kadaluwarsa).<br><br>Demi keamanan data, sistem otomatis memutus koneksi jika aplikasi didiamkan terlalu lama tanpa aktivitas.<br><br><strong>Solusinya:</strong><br>1. Jangan panik, data aman.<br>2. <strong>Refresh / Muat Ulang</strong> halaman browser (tekan F5).<br>3. Anda akan diarahkan ke halaman Login, silakan masuk kembali.",
        images: ["/images/faq/token-tidak-valid.jpeg"],
      },
    ],
  },
  // --- KATEGORI LAMA (Digeser ke bawah) ---
  {
    category: "Transaksi & Kasir",
    icon: "mdi-cash-register",
    items: [
      {
        q: "Kenapa DP/Setoran saya jadi ganda (Duplikat)?",
        a: "Ini terjadi karena Anda <strong>menutup Tab Browser / Jendela</strong> setelah input DP, tapi <strong>BELUM menekan tombol Simpan</strong> pada Surat Pesanan.<br><br><strong>Alasannya:</strong> Saat Anda input DP, uang <strong>langsung tercatat</strong> di sistem keuangan. Jika browser ditutup sebelum SO disimpan, DP tersebut menjadi 'data gantung'. Saat Anda mengulang buat SO baru, Anda input DP lagi, sehingga tercatat 2 kali.<br><br><strong>PENTING:</strong> <span class='text-red'>JANGAN PERNAH</span> menutup browser jika sudah ada uang/DP masuk! Pastikan tekan <strong>Simpan</strong> atau batalkan dengan benar.",
        // Opsional: Jika nanti mau tambah gambar ilustrasi 'Don't close browser'
        // images: ["/images/faq/jangan-tutup-tab.png"]
      },
      {
        q: "Kenapa saat Print SO DTF gambarnya kosong/tidak muncul?",
        a: "Ini terjadi karena browser belum selesai memuat (*loading*) gambar saat dialog print muncul pertama kali.<br><br><strong>Solusinya:</strong><br>1. Klik <strong>Cancel / Batal</strong> pada dialog print yang kosong tersebut.<br>2. Tunggu sejenak sampai gambar terlihat di layar preview.<br>3. Klik tombol <strong>Print</strong> sekali lagi.<br><br>Gambar akan muncul dengan sempurna.",
      },
      {
        q: "Kenapa muncul Invoice Ganda (Double) untuk satu transaksi?",
        a: "Ini biasanya terjadi karena tombol <strong>Simpan</strong> diklik lebih dari 1 kali saat koneksi internet sedang lambat/tidak stabil.<br><br>Sistem menerima dua perintah simpan secara bersamaan sebelum proses pertama selesai.<br><br><strong>Solusinya:</strong><br>1. Klik tombol Simpan <strong>CUKUP SEKALI</strong> saja.<br>2. Tunggu sampai lingkaran <em>loading</em> selesai atau muncul pesan sukses.<br>3. Jangan klik berulang-ulang meski terasa macet.",
      },
    ],
  },
  {
    category: "Akun & Umum",
    icon: "mdi-account-cog",
    items: [
      {
        q: "Cara ganti password?",
        a: "Klik nama user Anda di pojok kanan bawah (footer), lalu pilih 'Ganti Password'.",
      },
    ],
  },
];
