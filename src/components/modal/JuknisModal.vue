<script setup lang="ts">
import { ref, computed } from "vue";

defineProps<{ modelValue: boolean }>();
defineEmits(["update:modelValue"]);

const selectedStep = ref<number | null>(null);
const hoveredStep = ref<number | null>(null);
const activeTab = ref<"kt" | "doc">("kt");
const spkPhase = ref(0);

const STEPS = [
  {
    num: 1,
    label: "Penawaran",
    icon: "mdi-handshake-outline",
    color: "#1565c0",
    bg: "#e3f0fb",
    lane: "Jalur Utama Store",
    short: "Estimasi harga sebelum pesanan final. Dapat dilewati jika pesanan langsung final.",
    desc: "Digunakan saat pesanan belum final atau customer sedang mengkalkulasi harga. SC dapat mengestimasikan keseluruhan harga — kaos sekaligus jasanya — dalam satu dokumen menggunakan fitur Jenis Order. Penawaran bersifat non-mengikat dan dapat direvisi.",
    procedures: [
      "SC membuat dokumen Penawaran di sistem retail dan mengisi spesifikasi produk",
      "SC memilih <b>Jenis Order</b> untuk menambahkan estimasi jasa (DTF, bordir, sablon, dll) — harga kaos dan jasa terhitung sekaligus",
      "Penawaran dapat <b>diperlihatkan ke customer</b> — harga masih estimasi dan dapat direvisi",
      "Jika customer ingin membayar DP untuk jasa desain, <b>DP dapat diinput langsung di menu Penawaran</b>",
      "Jika customer setuju dan pesanan final, penawaran diteruskan menjadi <b>Surat Pesanan (SO)</b>",
    ],
    warnings: [
      {
        type: "note",
        title: "Fitur Jenis Order di Penawaran",
        items: [
          "Tombol Jenis Order memungkinkan SC menambahkan estimasi jasa langsung di penawaran",
          "Estimasi jasa terbawa saat penawaran dijadikan SO — dasar pembuatan SO Jasa Internal",
          "SC tidak perlu menginput ulang jenis jasa di langkah berikutnya",
        ],
      },
    ],
    tags: [
      { text: "Opsional (dapat dilewati)", color: "info" },
      { text: "Non-mengikat", color: "secondary" },
      { text: "DP bisa di sini", color: "warning" },
    ],
    nextFlow: [
      { from: "Penawaran", to: "Surat Pesanan", via: "jika customer setuju" },
      { from: "Penawaran", to: "Pengajuan Harga", via: "via pabrik" },
    ],
    docs: [
      {
        type: "SOP",
        code: "SOP-PNJ-001",
        name: "Penawaran Harga kepada Customer",
        desc: "Tata cara pembuatan dan penyampaian penawaran harga kepada customer, termasuk ketentuan revisi dan batas berlaku penawaran.",
        ket: [
          "Penawaran berlaku maksimal 7 hari kalender",
          "Format penawaran menggunakan template yang ditetapkan",
          "Wajib mencantumkan spesifikasi lengkap produk/jasa",
        ],
      },
    ],
  },
  {
    num: 2,
    label: "Surat Pesanan",
    icon: "mdi-file-document-edit-outline",
    color: "#6b3800",
    bg: "#fff3e0",
    lane: "Jalur Utama Store",
    short: "Dokumen utama yang mengikat pesanan. Wajib ada DP dan deadline.",
    desc: "Surat Pesanan (SO) adalah dokumen utama yang mengikat pesanan customer. Setiap pesanan wajib memiliki SO yang mencatat detail pesanan, DP, deadline, diskon, dan item yang dipesan.",
    procedures: [
      "SC membuat SO baru dengan mengisi data customer, item pesanan, jumlah, dan harga",
      "Input <b>DP minimum</b>: 30% untuk non-custom, 50% untuk custom/pabrik — tidak ada DP = butuh otorisasi Manajer",
      "Isi <b>deadline</b> sesuai kesepakatan — tanggal SO = awal hitungan waktu pengerjaan",
      "Diskon diterapkan <b>otomatis oleh sistem</b> — diskon di luar batas wewenang butuh otorisasi Manajer",
      'Jika ada jasa, klik <b>"Jadikan SO Jasa"</b> di menu Jenis Order untuk membuat SO Jasa Internal',
      "Setelah semua item siap, <b>scan barang</b> di SO — stok showroom otomatis pindah ke stok pesanan",
      "Status SO berubah menjadi <b>Ready</b> setelah scan berhasil — siap dilanjutkan ke Invoice",
    ],
    warnings: [
      {
        type: "danger",
        title: "DP Wajib — kecuali ada otorisasi Manajer",
        items: [
          "Non-custom: DP minimum 30% dari total SO",
          "Custom/pabrik: DP minimum 50% dari total SO",
          "Tanpa DP dan tanpa otorisasi Manajer → SO tidak dapat diproses",
        ],
      },
      {
        type: "warn",
        title: "Otorisasi Manajer diperlukan jika",
        items: [
          "DP di bawah 30% (non-custom) atau 50% (custom)",
          "Diskon yang diberikan di luar batas wewenang sales",
        ],
      },
    ],
    tags: [
      { text: "DP wajib (30%/50%)", color: "error" },
      { text: "Deadline wajib diisi", color: "error" },
      { text: "Scan barang → Ready", color: "warning" },
    ],
    nextFlow: [
      { from: "SO Ready", to: "Invoice" },
      { from: "SO + Jasa", to: "SO Jasa Internal", via: "via Jadikan SO Jasa" },
    ],
    docs: [
      {
        type: "SOP",
        code: "SOP-PNJ-003",
        name: "Pembuatan Surat Pesanan (SO)",
        desc: "Standar pembuatan SO mencakup ketentuan DP, pencatatan deadline, diskon otomatis, dan scan barang.",
        ket: [
          "SO wajib mencantumkan deadline",
          "SO tanpa DP tidak dapat diproses kecuali otorisasi Manajer",
          "Diskon diterapkan otomatis oleh sistem",
        ],
      },
      {
        type: "IK",
        code: "IK-SO-001",
        name: "IK: Input DP dan Verifikasi Pembayaran SO",
        desc: "Panduan teknis input DP pada sistem dan mekanisme otorisasi jika DP tidak sesuai ketentuan.",
        ket: [
          "Non-custom: DP minimum 30%",
          "Custom/pabrik: DP minimum 50%",
          "Perubahan kuantiti wajib diikuti penyesuaian DP",
        ],
      },
    ],
  },
  {
    num: 3,
    label: "Pengajuan Harga",
    icon: "mdi-cash-plus",
    color: "#155724",
    bg: "#e6f4ea",
    lane: "Jalur Pabrik",
    short: "Estimasi harga produk custom via pabrik. Butuh Approval Manajer.",
    desc: "Digunakan untuk pesanan produk custom yang diproduksi melalui pabrik. Store dapat membuat preview harga terlebih dahulu. Setelah mendapat Approval Manajer, pengajuan harga menjadi Pra-SPK yang diteruskan ke DC.",
    procedures: [
      "SC membuat Pengajuan Harga di sistem dengan mengisi spesifikasi produk custom dan estimasi jumlah",
      "Sistem menghasilkan <b>preview harga</b> — harga bersifat estimasi sampai mendapat Approval Manajer",
      "SC mengajukan ke Manajer untuk mendapat <b>Approval</b> — tanpa approval harga tidak dapat dijadikan SO",
      "Setelah Manajer approve, pengajuan harga otomatis menjadi <b>Pra-SPK</b> yang diteruskan ke DC",
      "DC memproses Pra-SPK menjadi SPK resmi di sistem Manksi — store tidak membuat SPK sendiri",
    ],
    warnings: [
      {
        type: "info",
        title: "Alur Approval",
        items: [
          "Store membuat Pengajuan Harga → Manajer review → jika disetujui menjadi Pra-SPK",
          "Pra-SPK diteruskan ke DC → DC membuat SPK di sistem Manksi",
          "Store tidak memiliki akses langsung ke modul SPK",
        ],
      },
    ],
    tags: [
      { text: "Preview harga dulu", color: "info" },
      { text: "Approval Manajer wajib", color: "warning" },
      { text: "Pra-SPK → DC", color: "success" },
    ],
    nextFlow: [
      { from: "Pengajuan Harga", to: "SO", via: "setelah approved" },
      { from: "Pra-SPK", to: "SPK via DC" },
    ],
    docs: [
      {
        type: "SOP",
        code: "SOP-PNJ-002",
        name: "Pengajuan Harga & Pra-SPK via DC",
        desc: "Proses pengajuan harga produk custom melalui pabrik, termasuk preview harga, approval Manajer, dan pengajuan Pra-SPK ke DC.",
        ket: [
          "Store dapat membuat preview sebelum harga final",
          "Harga bersifat preview sampai Approval Manajer",
          "Setelah approved, menjadi Pra-SPK diteruskan ke DC",
        ],
      },
    ],
  },
  {
    num: 4,
    label: "SO Jasa Internal",
    icon: "mdi-tshirt-crew",
    color: "#9b1c1c",
    bg: "#fff0f0",
    lane: "Internal Kaosan",
    short: "Pekerjaan jasa oleh tim internal Kaosan. Wajib ada LHK dan QC.",
    desc: "Dokumen untuk pekerjaan jasa yang dikerjakan oleh tim internal Kaosan. Harga jasa berdiri sendiri dan terpisah dari harga kaos. Semua jenis wajib dibuatkan LHK. Operator wajib QC sebelum dan sesudah proses.",
    procedures: [
      "SO Jasa hanya dapat dibuat jika SO utama sudah ada dan sudah ada DP-nya",
      'SO Jasa dibuat dari tombol <b>"Jadikan SO Jasa"</b> pada modul Jenis Order di SO',
      "<b>Semua jenis</b> SO Jasa Internal wajib dibuatkan <b>LHK</b> setelah proses selesai",
      "Operator wajib QC barang <b>sebelum dan sesudah</b> proses jasa",
      "Jika ditemukan barang NG (Not Good) → <b>laporkan segera</b> melalui modul penggantian barcode",
    ],
    warnings: [
      {
        type: "danger",
        title: "Tanggung Jawab Barang NG",
        items: [
          "Barang NG tidak segera dilaporkan → ditemukan audit → tanggung jawab 100% PIC",
          "Barang NG segera dilaporkan via modul → beban tidak 100%, ditentukan manajemen",
          "Prinsip: laporkan segera, jangan tunggu ditemukan audit",
        ],
      },
      {
        type: "info",
        title: "Isi LHK (Lembar Harian Kerja)",
        items: [
          "Jumlah hasil baik (pcs berhasil dicetak/dikerjakan)",
          "Jumlah barang BS / sortiran termasuk barang NG",
          "Penggunaan bahan / material (tinta, film, benang, dll)",
        ],
      },
    ],
    tags: [
      { text: "LHK wajib semua jenis", color: "error" },
      { text: "QC sebelum & sesudah", color: "success" },
      { text: "NG → laporkan segera", color: "warning" },
    ],
    nextFlow: [
      { from: "SO Jasa selesai + LHK", to: "Invoice" },
      { from: "Jika ada NG", to: "Modul Penggantian Barcode" },
    ],
    docs: [
      {
        type: "SOP",
        code: "SOP-JAS-001",
        name: "Pengelolaan SO Jasa Internal Kaosan",
        desc: "Alur pembuatan dan pengelolaan tiga jenis SO Jasa: Trial, Penjualan, dan Reprint.",
        ket: [
          "Semua jenis SO Jasa wajib dibuatkan LHK",
          "SO Jasa Trial maksimal 1 pcs",
          "Harga jasa terpisah dari harga kaos/barang",
        ],
      },
    ],
    spk: false,
  },
  {
    num: 5,
    label: "SPK (Manksi)",
    icon: "mdi-factory",
    color: "#0b5563",
    bg: "#e0f5f7",
    lane: "Jalur Pabrik",
    short: "Pembuatan kaos baru + jasa DTF via pabrik. Approval DC wajib.",
    desc: "SPK mencakup pembuatan kaos baru + jasa DTF. Kaosan membuat SPK via sistem Manksi, approval oleh DC. Alur produksi berjalan dalam 7 fase berurutan.",
    procedures: [
      "Kaosan membuat SPK di <b>sistem Manksi</b> berdasarkan Pengajuan Harga yang sudah diapprove Manajer",
      "DC mereview dan menyetujui SPK — SPK yang belum di-approve DC tidak dapat dilanjutkan ke produksi",
      "Setelah DC approve → P4 memulai 7 fase produksi",
    ],
    warnings: [
      {
        type: "warn",
        title: "SPK vs SO Jasa Internal",
        items: [
          "SPK: jika produk kaos diproduksi melalui pabrik (P4)",
          "SO Jasa Internal: jika jasa dikerjakan internal Kaosan — SPK hanya untuk kaos",
          "Keduanya dapat berjalan bersamaan",
        ],
      },
    ],
    tags: [
      { text: "Sistem Manksi", color: "info" },
      { text: "Approval DC", color: "warning" },
      { text: "7 Fase Produksi", color: "primary" },
    ],
    nextFlow: [{ from: "SPK Selesai + QC", to: "Invoice" }],
    docs: [
      {
        type: "SOP",
        code: "SOP-SPK-001",
        name: "Pembuatan SPK di Sistem Manksi",
        desc: "Panduan pembuatan SPK menggunakan sistem Manksi, proses approval DC, alur penerimaan barang dari pabrik.",
        ket: [
          "Store membuat SPK di sistem Manksi (bukan sistem retail)",
          "Approval SPK dilakukan oleh DC",
          "Alur barang: Pabrik → DC → Store",
        ],
      },
    ],
    spk: true,
  },
  {
    num: 6,
    label: "Invoice",
    icon: "mdi-receipt-text-outline",
    color: "#6b1c1c",
    bg: "#fdecea",
    lane: "Jalur Utama Store",
    short: "Barang keluar dari store. Wajib lunas dan SO sudah Ready.",
    desc: "Invoice menandakan barang keluar dari store. Barang hanya boleh keluar jika pembayaran sudah lunas. Setiap kondisi di luar ketentuan wajib melalui Otorisasi Manajer.",
    procedures: [
      "Invoice hanya dapat dibuat jika status SO sudah <b>Ready</b> (barang sudah di-scan)",
      "Pembayaran harus <b>lunas 100%</b> sebelum barang boleh keluar dari store",
      "Sales counter memverifikasi pelunasan sebelum mencetak invoice dan menyerahkan barang",
    ],
    warnings: [
      {
        type: "danger",
        title: "Invoice tidak bisa diproses jika",
        items: [
          "Pembayaran belum lunas (tanpa otorisasi Manajer)",
          "Status SO belum Ready atau barang belum di-scan",
        ],
      },
      {
        type: "warn",
        title: "Otorisasi Manajer diperlukan jika",
        items: [
          "DP tidak sesuai ketentuan",
          "Diskon di luar ketentuan yang berlaku",
          "Invoice diproses meskipun pembayaran belum lunas",
        ],
      },
    ],
    tags: [
      { text: "Lunas wajib sebelum barang keluar", color: "error" },
      { text: "Status SO harus Ready", color: "warning" },
    ],
    nextFlow: [
      { from: "Invoice", to: "Transaksi Selesai" },
      { from: "Jika ada masalah", to: "Retur" },
    ],
    docs: [
      {
        type: "SOP",
        code: "SOP-INV-001",
        name: "Pembuatan Invoice dan Pengeluaran Barang",
        desc: "Standar pembuatan invoice, syarat pengeluaran barang, dan mekanisme otorisasi untuk kondisi di luar ketentuan.",
        ket: [
          "Invoice hanya dibuat jika SO sudah Ready",
          "Barang keluar wajib disertai invoice lunas",
          "Invoice belum lunas tidak boleh diproses tanpa otorisasi",
        ],
      },
    ],
  },
  {
    num: 7,
    label: "Retur",
    icon: "mdi-keyboard-return",
    color: "#78350f",
    bg: "#fef3c7",
    lane: "Jalur Utama Store",
    short: "Pengembalian barang. Maks 1×24 jam setelah barang diterima.",
    desc: "Proses pengembalian barang oleh customer. 2 tipe: Tukar Barang dan Pengembalian. Batas waktu maksimal 1×24 jam setelah barang diterima customer.",
    procedures: [
      "<b>Tipe 1 — Tukar Barang:</b> Input retur pilih Tukar Barang → SC buat Invoice baru → masukkan kode retur di menu Pembayaran",
      "Selisih harga Tukar Barang: harga pengganti lebih rendah → tidak ada pengembalian; lebih tinggi → customer membayar selisih",
      "<b>Tipe 2 — Pengembalian:</b> Input retur pilih Pengembalian → kelebihan bayar di Invoice → dasar pengajuan Refund ke Finance",
    ],
    warnings: [
      {
        type: "danger",
        title: "Batas Waktu Retur",
        items: [
          "Retur hanya diterima dalam 1×24 jam setelah barang keluar / diterima customer",
          "Retur yang diajukan di luar batas waktu tidak dapat diproses",
        ],
      },
    ],
    tags: [
      { text: "Maks 1×24 jam", color: "error" },
      { text: "Tukar: selisih berlaku", color: "info" },
      { text: "Pengembalian → Refund", color: "warning" },
    ],
    nextFlow: [
      { from: "Retur Tukar Barang", to: "Selesai" },
      { from: "Retur Pengembalian", to: "Refund" },
    ],
    docs: [
      {
        type: "SOP",
        code: "SOP-RTR-001",
        name: "Prosedur Retur Barang",
        desc: "Standar proses retur: batas waktu, tata cara input, ketentuan selisih harga, dan lanjutan ke Refund.",
        ket: [
          "Retur hanya diterima dalam 1×24 jam",
          "Input retur disertai invoice asal dan verifikasi kondisi barang",
        ],
      },
    ],
  },
  {
    num: 8,
    label: "Refund",
    icon: "mdi-cash-refund",
    color: "#1a4f3a",
    bg: "#d1fae5",
    lane: "Jalur Utama Store",
    short: "Pengembalian dana ke customer. Finance eksekusi maks 7 hari kerja.",
    desc: "Proses pengembalian dana ke customer. Refund hanya dari dua sumber yang sah. Finance mengeksekusi pengembalian dana maksimal 7 hari kerja setelah pengajuan diterima.",
    procedures: [
      "Sumber 1: <b>Kelebihan bayar dari Invoice</b> — berasal dari Retur Pengembalian",
      "Sumber 2: <b>Kelebihan dalam modul setoran pembayaran</b>",
      "Identifikasi sumber → ajukan ke Finance beserta bukti kelebihan bayar yang valid",
      "Finance memverifikasi pengajuan dan kelengkapan dokumen",
      "Finance mengeksekusi pengembalian dana — <b>maks 7 hari kerja</b>",
    ],
    warnings: [
      {
        type: "info",
        title: "SLA Finance",
        items: [
          "Eksekusi refund maksimal 7 hari kerja setelah pengajuan diterima lengkap",
          "Pengajuan tanpa bukti kelebihan yang valid tidak akan diproses",
          "Refund nominal besar memerlukan approval Finance Manager",
        ],
      },
    ],
    tags: [
      { text: "Maks 7 hari kerja", color: "error" },
      { text: "Bukti kelebihan wajib", color: "warning" },
      { text: "SLA Finance", color: "success" },
    ],
    nextFlow: [{ from: "Refund", to: "Selesai ✓" }],
    docs: [
      {
        type: "SOP",
        code: "SOP-RFD-001",
        name: "Prosedur Refund Pengembalian Dana",
        desc: "Standar pengajuan dan eksekusi refund kepada customer beserta SLA Finance.",
        ket: [
          "Refund hanya dari dua sumber sah",
          "Finance mengeksekusi maks 7 hari kerja",
          "Pengajuan wajib dilampiri bukti",
        ],
      },
    ],
  },
];

const SPK_PHASES = [
  {
    icon: "📋",
    label: "SPK & Approval",
    color: "#0b5563",
    bg: "#e0f5f7",
    steps: [
      { n: 1, t: "Kaosan membuat SPK di <b>sistem Manksi</b> — pastikan SO dan DP sudah ada" },
      {
        n: 2,
        t: "<b>Kaosan hanya sampai pada tahap pembuatan SPK</b> — proses selanjutnya di DC dan P4",
      },
      { n: 3, t: "SPK belum di-approve DC <b>tidak dapat dilanjutkan ke produksi apapun</b>" },
      {
        n: 4,
        t: "DC mereview SPK — jika ada ketidaksesuaian, dikembalikan ke Kaosan untuk diperbaiki",
      },
      { n: 5, t: "Setelah DC approve → SPK diteruskan ke <b>P4 untuk memulai produksi</b>" },
    ],
    note: {
      type: "warn",
      title: "SPK vs SO Jasa Internal",
      items: [
        "SPK: kaos diproduksi via pabrik (P4)",
        "Jasa internal Kaosan → SO Jasa Internal terpisah",
        "Keduanya dapat berjalan bersamaan",
      ],
    },
  },
  {
    icon: "🎨",
    label: "Final Art",
    color: "#880e4f",
    bg: "#fce4ec",
    steps: [
      { n: 6, t: "Kaosan mengunggah <b>file final art</b> ke server sharing file desain" },
      { n: 7, t: "Kaosan memberitahu grup produksi bahwa final art sudah siap" },
      {
        n: 8,
        t: "<b>Kaosan bertanggung jawab penuh atas kebenaran file design</b> — kesalahan bukan tanggung jawab P4/P1",
      },
      {
        n: 9,
        t: "Setelah final art terkirim, Kaosan hanya menunggu konfirmasi sample dan MAP dari P4",
      },
    ],
    note: {
      type: "warn",
      title: "Perubahan design setelah final art dikirim",
      items: [
        "P4 wajib konfirmasi ke Kaosan sebelum ada perubahan",
        "Perubahan tanpa persetujuan Kaosan tidak diperbolehkan",
      ],
    },
  },
  {
    icon: "🖨️",
    label: "Proses P4 & P1",
    color: "#6a1b9a",
    bg: "#f3e5f5",
    steps: [
      { n: 10, t: "P4 mengambil file final art dari server sharing" },
      {
        n: 11,
        t: "<b>Kat.1 — Kaos + Jasa:</b> DTF/Bordir/Sablon dikerjakan P1 via modul PO Internal<br><b>Kat.2 — Kaos saja:</b> Jasa dikerjakan internal Kaosan melalui SO Jasa Internal",
      },
      { n: 12, t: "P4 mengajukan cetak sample ke P1 via modul PO Internal" },
      { n: 13, t: "P1 cetak sample → P4 QC kesesuaian hasil cetak vs desain" },
      { n: 14, t: "Tidak OK → evaluasi ulang; OK → P4 membuat MAP" },
    ],
    note: {
      type: "info",
      title: "Peran Kaosan di fase ini",
      items: [
        "Kaosan tidak terlibat dalam cetak sample",
        "Kaosan hanya menunggu informasi dari P4",
      ],
    },
  },
  {
    icon: "📝",
    label: "MAP",
    color: "#155724",
    bg: "#e8f5e9",
    steps: [
      {
        n: 14,
        t: "P4 membuat <b>MAP (Memo Approval Produk)</b> — kaos sample jadi beserta hasil cetakan",
      },
      {
        n: 15,
        t: "<b>Disarankan:</b> Kaosan meminta preview dari hasil trial P4 sebelum diserahkan ke customer",
      },
      {
        n: 16,
        t: "<b>Ketentuan:</b> Order > 1 pcs → MAP gratis 1 pcs; Order ≤ 1 pcs → MAP dari jumlah yang dipesan",
      },
      {
        n: 17,
        t: "MAP diserahkan ke user Kaosan untuk disampaikan ke customer guna mendapat persetujuan",
      },
    ],
    note: {
      type: "info",
      title: "Tentang MAP",
      items: [
        "MAP = dokumen fisik berupa kaos sample",
        "Persetujuan customer terhadap MAP = dasar produksi massal",
      ],
    },
  },
  {
    icon: "✅",
    label: "Approval Customer",
    color: "#78350f",
    bg: "#fff3e0",
    steps: [
      {
        n: 18,
        t: "Kaosan menyampaikan MAP dan sample ke <b>customer untuk direview dan disetujui</b>",
      },
      {
        n: 19,
        t: "Revisi → catat dan sampaikan ke P4; Customer OK → konfirmasi ke P4, lanjut ke produksi massal",
      },
    ],
    note: null,
  },
  {
    icon: "🏭",
    label: "Massal & CMT",
    color: "#0b5563",
    bg: "#e0f5f7",
    steps: [
      { n: 20, t: "P4 mengajukan cetak produksi massal ke P1 via modul PO Internal" },
      { n: 21, t: "P1 melakukan cetak massal sesuai jumlah order" },
      {
        n: 22,
        t: "P4 melakukan proses <b>CMT (Cut Make Trim)</b> — pemotongan, penjahitan, finishing",
      },
      {
        n: 23,
        t: "Hasil CMT diperiksa P4 sebelum diserahkan ke DC — Kaosan tidak terlibat di fase ini",
      },
    ],
    note: {
      type: "info",
      title: "Tentang CMT",
      items: [
        "CMT dilakukan oleh P4, bukan Kaosan",
        "Barang belum boleh dikirim ke DC sebelum CMT selesai dan lolos QC P4",
      ],
    },
  },
  {
    icon: "🚚",
    label: "Penerimaan & QC",
    color: "#1a4f3a",
    bg: "#d1fae5",
    steps: [
      { n: 24, t: "Alur pengiriman: <b>Pabrik → DC → Kaosan</b>" },
      {
        n: 25,
        t: "Kaosan melakukan <b>QC penerimaan</b>: periksa spesifikasi, jumlah, dan kondisi fisik",
      },
      {
        n: 26,
        t: "QC lolos → scan barang di SO → status <b>Ready</b> → proses Invoice<br>QC tidak lolos → koordinasi klaim ke DC terlebih dahulu",
      },
    ],
    note: {
      type: "warn",
      title: "QC penerimaan wajib",
      items: [
        "Periksa kondisi fisik, jumlah, dan kesesuaian spesifikasi sebelum scan",
        "Temuan tidak sesuai dikomunikasikan ke DC terlebih dahulu",
      ],
    },
  },
];

const step = computed(() => (selectedStep.value !== null ? STEPS[selectedStep.value] : null));
const alertColor = (t: string) =>
  ({ danger: "error", warn: "warning", info: "info", ok: "success", note: "orange" }[t] || "grey");
const alertIcon = (t: string) =>
  ({
    danger: "mdi-alert-octagon",
    warn: "mdi-alert",
    info: "mdi-information",
    ok: "mdi-check-circle",
    note: "mdi-note-text",
  }[t] || "mdi-information");
const docColor = (t: string) => ({ SOP: "blue", IK: "green", MEMO: "orange" }[t] || "grey");

function selectStep(idx: number) {
  selectedStep.value = idx;
  activeTab.value = "kt";
  spkPhase.value = 0;
}
function backToMap() {
  selectedStep.value = null;
}

function exportWord() {
  let body = '<h1 style="font-family:Arial">Juknis Alur Penjualan — Kaosan</h1><hr>';
  STEPS.forEach((s) => {
    body += `<h2 style="font-family:Arial;color:${s.color}">${s.num}. ${s.label}</h2>`;
    body += `<p style="font-family:Arial;font-size:10pt;color:#888"><em>${s.lane}</em></p>`;
    body += `<p style="font-family:Arial">${s.desc}</p>`;
    s.procedures.forEach((p, i) => {
      body += `<p style="font-family:Arial;font-size:10.5pt;padding-left:10pt">${
        i + 1
      }. ${p.replace(/<[^>]+>/g, "")}</p>`;
    });
    body += "<hr>";
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([`<html><head><meta charset="utf-8"></head><body>${body}</body></html>`], {
      type: "application/msword",
    })
  );
  a.download = "Juknis_Alur_Penjualan_Kaosan.doc";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="1100"
    class="juknis-dialog"
  >
    <v-card style="height: 88vh; display: flex; flex-direction: column; overflow: hidden">
      <!-- Toolbar -->
      <v-toolbar color="primary" density="compact" elevation="2" class="flex-shrink-0">
        <v-btn
          v-if="selectedStep !== null"
          icon
          size="small"
          variant="text"
          color="white"
          @click="backToMap"
          class="mr-1"
        >
          <v-icon size="18">mdi-arrow-left</v-icon>
        </v-btn>
        <v-icon start class="ml-2" size="18">mdi-book-open-page-variant</v-icon>
        <v-toolbar-title class="text-subtitle-2 font-weight-bold">
          {{
            selectedStep !== null
              ? `Langkah ${step?.num} — ${step?.label}`
              : "Juknis Alur Penjualan — Kaosan"
          }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon size="small" variant="text" color="white" @click="exportWord">
          <v-icon size="18">mdi-microsoft-word</v-icon>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          color="white"
          @click="$emit('update:modelValue', false)"
        >
          <v-icon size="20">mdi-close</v-icon>
        </v-btn>
      </v-toolbar>

      <!-- ═══ VIEW A: PETA ALUR ═══ -->
      <div v-if="selectedStep === null" class="map-view" style="overflow-y: auto; flex: 1">
        <div class="map-header">
          <div>
            <div class="map-title">Peta Alur Proses Penjualan</div>
            <div class="map-hint">
              <v-icon size="13">mdi-cursor-default-click-outline</v-icon>
              Hover node untuk ringkasan, klik untuk detail lengkap
            </div>
          </div>
        </div>

        <!-- SVG -->
        <div class="svg-wrap">
          <svg viewBox="0 0 700 322" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
            <defs>
              <marker
                id="ah"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M2 1L8 5L2 9"
                  fill="none"
                  stroke="#b8b4ac"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </marker>
              <marker
                id="ahg"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M2 1L8 5L2 9"
                  fill="none"
                  stroke="#155724"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </marker>
              <marker
                id="aha"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M2 1L8 5L2 9"
                  fill="none"
                  stroke="#d97706"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </marker>
              <marker
                id="ahr"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M2 1L8 5L2 9"
                  fill="none"
                  stroke="#9b1c1c"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </marker>
            </defs>
            <rect x="0" y="34" width="700" height="100" fill="#e6f4ea" opacity="0.5" />
            <rect x="0" y="134" width="700" height="110" fill="#fffaef" opacity="0.9" />
            <rect x="0" y="244" width="700" height="74" fill="#fff0f0" opacity="0.6" />
            <line
              x1="0"
              y1="134"
              x2="700"
              y2="134"
              stroke="#b8b4ac"
              stroke-width="0.5"
              stroke-dasharray="5 4"
            />
            <line
              x1="0"
              y1="244"
              x2="700"
              y2="244"
              stroke="#b8b4ac"
              stroke-width="0.5"
              stroke-dasharray="5 4"
            />
            <rect x="4" y="60" width="72" height="20" rx="3" fill="#b8dec0" />
            <text
              x="40"
              y="70"
              text-anchor="middle"
              dominant-baseline="central"
              font-family="Arial"
              font-size="8.5"
              font-weight="700"
              fill="#155724"
            >
              ▲ Jalur Pabrik
            </text>
            <rect x="4" y="168" width="72" height="20" rx="3" fill="#f5d9a8" />
            <text
              x="40"
              y="178"
              text-anchor="middle"
              dominant-baseline="central"
              font-family="Arial"
              font-size="8.5"
              font-weight="700"
              fill="#7a4200"
            >
              → Jalur Utama
            </text>
            <rect x="4" y="262" width="72" height="20" rx="3" fill="#ffc5c5" />
            <text
              x="40"
              y="272"
              text-anchor="middle"
              dominant-baseline="central"
              font-family="Arial"
              font-size="7.5"
              font-weight="700"
              fill="#7a0000"
            >
              ▼ Internal Kaosan
            </text>
            <line
              x1="188"
              y1="182"
              x2="208"
              y2="182"
              stroke="#c8c4bc"
              stroke-width="1.3"
              marker-end="url(#ah)"
            />
            <line
              x1="348"
              y1="182"
              x2="366"
              y2="182"
              stroke="#c8c4bc"
              stroke-width="1.3"
              marker-end="url(#ah)"
            />
            <line
              x1="458"
              y1="182"
              x2="467"
              y2="182"
              stroke="#c8c4bc"
              stroke-width="1.3"
              marker-end="url(#ah)"
            />
            <line
              x1="539"
              y1="182"
              x2="550"
              y2="182"
              stroke="#c8c4bc"
              stroke-width="1.3"
              marker-end="url(#ah)"
            />
            <line
              x1="268"
              y1="160"
              x2="268"
              y2="112"
              stroke="#155724"
              stroke-width="1.4"
              marker-end="url(#ahg)"
            />
            <text
              x="246"
              y="137"
              text-anchor="middle"
              font-family="Arial"
              font-size="8"
              fill="#155724"
            >
              via pabrik
            </text>
            <line
              x1="284"
              y1="112"
              x2="284"
              y2="160"
              stroke="#d97706"
              stroke-width="1.4"
              stroke-dasharray="5 3"
              marker-end="url(#aha)"
            />
            <rect
              x="290"
              y="120"
              width="88"
              height="16"
              rx="3"
              fill="#fef3c7"
              stroke="#f59e0b"
              stroke-width="0.7"
            />
            <text
              x="334"
              y="128"
              text-anchor="middle"
              dominant-baseline="central"
              font-family="Arial"
              font-size="8.5"
              fill="#92400e"
            >
              ★ Approval Manajer
            </text>
            <line
              x1="344"
              y1="84"
              x2="360"
              y2="84"
              stroke="#155724"
              stroke-width="1.4"
              marker-end="url(#ahg)"
            />
            <text
              x="352"
              y="75"
              text-anchor="middle"
              font-family="Arial"
              font-size="7.5"
              fill="#155724"
            >
              Pra-SPK → DC
            </text>
            <line
              x1="276"
              y1="202"
              x2="276"
              y2="252"
              stroke="#9b1c1c"
              stroke-width="1.4"
              marker-end="url(#ahr)"
            />
            <text
              x="254"
              y="229"
              text-anchor="middle"
              font-family="Arial"
              font-size="8"
              fill="#9b1c1c"
            >
              internal
            </text>

            <!-- Nodes -->
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 0 }"
              @click="selectStep(0)"
              @mouseenter="hoveredStep = 0"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="110"
                y="162"
                width="78"
                height="40"
                rx="7"
                fill="#e3f0fb"
                stroke="#1565c0"
                :stroke-width="hoveredStep === 0 ? 2.5 : 1.5"
              />
              <circle cx="149" cy="151" r="9" fill="#1565c0" />
              <text
                x="149"
                y="151"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                1
              </text>
              <text
                x="149"
                y="182"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="11"
                font-weight="600"
                fill="#0d3a72"
              >
                Penawaran
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 1 }"
              @click="selectStep(1)"
              @mouseenter="hoveredStep = 1"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="208"
                y="162"
                width="140"
                height="40"
                rx="7"
                fill="#fff3e0"
                stroke="#6b3800"
                :stroke-width="hoveredStep === 1 ? 2.5 : 2"
              />
              <circle cx="278" cy="151" r="9" fill="#6b3800" />
              <text
                x="278"
                y="151"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                2
              </text>
              <text
                x="278"
                y="182"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="11"
                font-weight="700"
                fill="#3d2000"
              >
                Surat Pesanan
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 2 }"
              @click="selectStep(2)"
              @mouseenter="hoveredStep = 2"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="208"
                y="66"
                width="136"
                height="36"
                rx="7"
                fill="#e6f4ea"
                stroke="#155724"
                :stroke-width="hoveredStep === 2 ? 2.5 : 1.5"
              />
              <circle cx="276" cy="56" r="9" fill="#155724" />
              <text
                x="276"
                y="56"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                3
              </text>
              <text
                x="276"
                y="84"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="10.5"
                font-weight="600"
                fill="#0a2d14"
              >
                Pengajuan Harga
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 3 }"
              @click="selectStep(3)"
              @mouseenter="hoveredStep = 3"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="208"
                y="252"
                width="140"
                height="36"
                rx="7"
                fill="#fff0f0"
                stroke="#9b1c1c"
                :stroke-width="hoveredStep === 3 ? 2.5 : 1.5"
              />
              <circle cx="278" cy="243" r="9" fill="#9b1c1c" />
              <text
                x="278"
                y="243"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                4
              </text>
              <text
                x="278"
                y="270"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="10.5"
                font-weight="600"
                fill="#5c0f0f"
              >
                SO Jasa Internal
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 4 }"
              @click="selectStep(4)"
              @mouseenter="hoveredStep = 4"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="360"
                y="66"
                width="82"
                height="36"
                rx="7"
                fill="#e0f5f7"
                stroke="#0b5563"
                :stroke-width="hoveredStep === 4 ? 2.5 : 1.5"
              />
              <circle cx="401" cy="56" r="9" fill="#0b5563" />
              <text
                x="401"
                y="56"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                5
              </text>
              <text
                x="401"
                y="84"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="10.5"
                font-weight="600"
                fill="#042a30"
              >
                SPK (Manksi)
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 5 }"
              @click="selectStep(5)"
              @mouseenter="hoveredStep = 5"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="366"
                y="162"
                width="92"
                height="40"
                rx="7"
                fill="#fdecea"
                stroke="#6b1c1c"
                :stroke-width="hoveredStep === 5 ? 2.5 : 1.5"
              />
              <circle cx="412" cy="151" r="9" fill="#6b1c1c" />
              <text
                x="412"
                y="151"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                6
              </text>
              <text
                x="412"
                y="182"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="11"
                font-weight="600"
                fill="#3d0808"
              >
                Invoice
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 6 }"
              @click="selectStep(6)"
              @mouseenter="hoveredStep = 6"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="467"
                y="162"
                width="72"
                height="40"
                rx="7"
                fill="#fef3c7"
                stroke="#78350f"
                :stroke-width="hoveredStep === 6 ? 2.5 : 1.5"
              />
              <circle cx="503" cy="151" r="9" fill="#78350f" />
              <text
                x="503"
                y="151"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                7
              </text>
              <text
                x="503"
                y="182"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="11"
                font-weight="600"
                fill="#3d1800"
              >
                Retur
              </text>
            </g>
            <g
              class="fnode"
              :class="{ hov: hoveredStep === 7 }"
              @click="selectStep(7)"
              @mouseenter="hoveredStep = 7"
              @mouseleave="hoveredStep = null"
            >
              <rect
                x="550"
                y="162"
                width="74"
                height="40"
                rx="7"
                fill="#d1fae5"
                stroke="#1a4f3a"
                :stroke-width="hoveredStep === 7 ? 2.5 : 1.5"
              />
              <circle cx="587" cy="151" r="9" fill="#1a4f3a" />
              <text
                x="587"
                y="151"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="9"
                font-weight="700"
                fill="white"
              >
                8
              </text>
              <text
                x="587"
                y="182"
                text-anchor="middle"
                dominant-baseline="central"
                font-family="Arial"
                font-size="11"
                font-weight="600"
                fill="#0a2018"
              >
                Refund
              </text>
            </g>
          </svg>
        </div>

        <!-- Hover card -->
        <transition name="fade">
          <div
            v-if="hoveredStep !== null"
            class="hover-card"
            :style="`border-color: ${STEPS[hoveredStep].color}; background: ${STEPS[hoveredStep].bg}`"
          >
            <div class="hc-num" :style="`background: ${STEPS[hoveredStep].color}`">
              {{ STEPS[hoveredStep].num }}
            </div>
            <div class="hc-body">
              <div class="hc-label" :style="`color: ${STEPS[hoveredStep].color}`">
                <v-icon size="14" class="mr-1" :style="`color: ${STEPS[hoveredStep].color}`">{{
                  STEPS[hoveredStep].icon
                }}</v-icon>
                {{ STEPS[hoveredStep].label }}
                <span class="hc-lane">· {{ STEPS[hoveredStep].lane }}</span>
              </div>
              <div class="hc-short">{{ STEPS[hoveredStep].short }}</div>
              <div class="hc-tags">
                <v-chip
                  v-for="tag in STEPS[hoveredStep].tags"
                  :key="tag.text"
                  :color="tag.color"
                  size="x-small"
                  variant="tonal"
                  class="font-weight-bold"
                  >{{ tag.text }}</v-chip
                >
              </div>
              <div class="hc-cta">Klik untuk detail lengkap →</div>
            </div>
          </div>
          <div v-else class="hover-placeholder">
            <v-icon size="13" color="grey">mdi-cursor-default-outline</v-icon>
            <span>Arahkan kursor ke node di diagram untuk melihat ringkasan langkah</span>
          </div>
        </transition>

        <!-- Legend -->
        <div class="map-legend">
          <div class="leg-item">
            <div class="leg-box" style="background: #e6f4ea; border-color: #155724" />
            <span>Jalur Pabrik</span>
          </div>
          <div class="leg-item">
            <div class="leg-box" style="background: #fffaef; border-color: #c8963c" />
            <span>Jalur Utama Store</span>
          </div>
          <div class="leg-item">
            <div class="leg-box" style="background: #fff0f0; border-color: #9b1c1c" />
            <span>Internal Kaosan</span>
          </div>
          <div class="leg-item">
            <svg width="30" height="10">
              <line
                x1="0"
                y1="5"
                x2="22"
                y2="5"
                stroke="#d97706"
                stroke-width="1.5"
                stroke-dasharray="4 2"
              />
              <polygon points="22,2 28,5 22,8" fill="#d97706" />
            </svg>
            <span>Approval Manajer</span>
          </div>
        </div>

        <!-- Step cards -->
        <div class="steps-grid">
          <div class="sg-title">Semua Langkah — Klik untuk Detail</div>
          <div class="sg-cards">
            <div
              v-for="(s, i) in STEPS"
              :key="s.num"
              class="sg-card"
              :style="`border-color: ${s.color}30`"
              @click="selectStep(i)"
            >
              <div class="sg-num" :style="`background: ${s.color}`">{{ s.num }}</div>
              <div class="sg-body">
                <div class="sg-label" :style="`color: ${s.color}`">
                  <v-icon size="12" class="mr-1" :style="`color: ${s.color}`">{{ s.icon }}</v-icon
                  >{{ s.label }}
                </div>
                <div class="sg-short">{{ s.short }}</div>
              </div>
              <v-icon size="14" color="grey-lighten-1">mdi-chevron-right</v-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ VIEW B: DETAIL LANGKAH ═══ -->
      <div
        v-else
        class="detail-view"
        style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden"
      >
        <!-- Header -->
        <div class="dv-header flex-shrink-0" :style="`background: ${step!.bg}`">
          <div class="d-flex align-center gap-3 flex-wrap">
            <div class="dv-num" :style="`background: ${step!.color}`">{{ step!.num }}</div>
            <div>
              <div class="dv-title" :style="`color: ${step!.color}`">
                <v-icon size="16" class="mr-1" :style="`color: ${step!.color}`">{{
                  step!.icon
                }}</v-icon
                >{{ step!.label }}
              </div>
              <div class="dv-lane">{{ step!.lane }}</div>
            </div>
            <div class="d-flex flex-wrap gap-1 ml-auto">
              <v-chip
                v-for="tag in step!.tags"
                :key="tag.text"
                :color="tag.color"
                size="x-small"
                variant="tonal"
                class="font-weight-bold"
                >{{ tag.text }}</v-chip
              >
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tab-bar flex-shrink-0">
          <button class="tbtn" :class="{ active: activeTab === 'kt' }" @click="activeTab = 'kt'">
            Ketentuan &amp; Prosedur
          </button>
          <button class="tbtn" :class="{ active: activeTab === 'doc' }" @click="activeTab = 'doc'">
            Referensi Dokumen
            <span class="tbadge" :class="{ active: activeTab === 'doc' }">{{
              step!.docs.length
            }}</span>
          </button>
        </div>

        <!-- Content -->
        <div class="dv-content flex-grow-1" style="overflow-y: auto">
          <template v-if="activeTab === 'kt'">
            <div class="cs">
              <div class="csl">Deskripsi</div>
              <div class="desc" :style="`border-left-color: ${step!.color}`">{{ step!.desc }}</div>
            </div>

            <div class="cs">
              <div class="csl">Prosedur</div>
              <div class="proc-list">
                <div v-for="(p,i) in step!.procedures" :key="i" class="proc-row">
                  <div
                    class="pn"
                    :style="`background: ${step!.bg}; border-color: ${step!.color}; color: ${step!.color}`"
                  >
                    {{ i + 1 }}
                  </div>
                  <div class="pt" v-html="p" />
                </div>
              </div>
            </div>

            <!-- SPK sub-flow -->
            <template v-if="(step as any).spk">
              <div class="cs">
                <div class="csl">Alur Produksi SPK — 7 Fase</div>
                <div class="spk-wrap">
                  <div class="spk-left">
                    <div
                      v-for="(ph, pi) in SPK_PHASES"
                      :key="pi"
                      class="spk-btn"
                      :class="{ active: spkPhase === pi }"
                      :style="
                        spkPhase === pi ? `border-color: ${ph.color}; background: ${ph.bg}` : ''
                      "
                      @click="spkPhase = pi"
                    >
                      <span class="phi">{{ ph.icon }}</span>
                      <span
                        class="phl"
                        :style="spkPhase === pi ? `color: ${ph.color}; font-weight:700` : ''"
                        >{{ ph.label }}</span
                      >
                    </div>
                  </div>
                  <div class="spk-right" :style="`border-color: ${SPK_PHASES[spkPhase].color}44`">
                    <div class="spk-rh" :style="`background: ${SPK_PHASES[spkPhase].bg}`">
                      <span class="phi">{{ SPK_PHASES[spkPhase].icon }}</span>
                      <span
                        class="font-weight-bold text-caption"
                        :style="`color: ${SPK_PHASES[spkPhase].color}`"
                        >{{ SPK_PHASES[spkPhase].label }}</span
                      >
                      <span
                        class="spk-badge"
                        :style="`color: ${SPK_PHASES[spkPhase].color}; border-color: ${SPK_PHASES[spkPhase].color}44`"
                        >Fase {{ spkPhase + 1 }}/{{ SPK_PHASES.length }}</span
                      >
                    </div>
                    <div
                      class="spk-steps"
                      style="max-height: 260px; overflow-y: auto; padding: 8px 12px"
                    >
                      <div v-for="s in SPK_PHASES[spkPhase].steps" :key="s.n" class="spk-row">
                        <div
                          class="spk-n"
                          :style="`background: ${SPK_PHASES[spkPhase].bg}; border-color: ${SPK_PHASES[spkPhase].color}; color: ${SPK_PHASES[spkPhase].color}`"
                        >
                          {{ s.n }}
                        </div>
                        <div class="spk-t" v-html="s.t" />
                      </div>
                      <v-alert
                        v-if="SPK_PHASES[spkPhase].note"
                        :type="SPK_PHASES[spkPhase].note!.type==='warn' ? 'warning' : 'info'"
                        density="compact"
                        variant="tonal"
                        class="mt-3"
                        style="font-size: 11px"
                      >
                        <div class="font-weight-bold mb-1">
                          {{ SPK_PHASES[spkPhase].note!.title }}
                        </div>
                        <ul class="pl-4">
                          <li v-for="it in SPK_PHASES[spkPhase].note!.items" :key="it">{{ it }}</li>
                        </ul>
                      </v-alert>
                    </div>
                    <div
                      style="
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 12px;
                        border-top: 1px solid rgba(0, 0, 0, 0.08);
                      "
                    >
                      <v-btn
                        size="x-small"
                        variant="outlined"
                        :disabled="spkPhase === 0"
                        @click="spkPhase--"
                        >← Kembali</v-btn
                      >
                      <v-btn
                        size="x-small"
                        variant="flat"
                        :color="SPK_PHASES[spkPhase].color"
                        :disabled="spkPhase === SPK_PHASES.length - 1"
                        @click="spkPhase++"
                      >
                        {{ spkPhase === SPK_PHASES.length - 1 ? "Selesai ✓" : "Lanjut →" }}
                      </v-btn>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Catatan accordion -->
            <div v-if="step!.warnings.length > 0" class="cs">
              <div class="csl">
                Catatan &amp; Peringatan
                <span
                  style="font-size: 9px; font-weight: 400; text-transform: none; letter-spacing: 0"
                  >(klik untuk buka)</span
                >
              </div>
              <v-expansion-panels variant="accordion" density="compact">
                <v-expansion-panel v-for="w in step!.warnings" :key="w.title">
                  <v-expansion-panel-title
                    style="font-size: 12px; font-weight: 600; min-height: 40px"
                  >
                    <v-icon
                      :icon="alertIcon(w.type)"
                      :color="alertColor(w.type)"
                      size="16"
                      class="mr-2"
                    />
                    {{ w.title }}
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <ul
                      style="
                        padding-left: 16px;
                        font-size: 12px;
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                      "
                    >
                      <li v-for="item in w.items" :key="item" v-html="item" />
                    </ul>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>

            <!-- Lanjut ke -->
            <div class="cs">
              <div class="csl">Lanjut ke</div>
              <div class="flow-mini">
                <span
                  class="fn active-n"
                  :style="`background: ${step!.bg}; color: ${step!.color}; border-color: ${step!.color}`"
                  >{{ step!.label }}</span
                >
                <template v-for="(f,i) in step!.nextFlow" :key="i">
                  <span v-if="f.via" class="fvia">{{ f.via }}</span>
                  <v-icon size="14" color="grey">mdi-arrow-right</v-icon>
                  <span class="fn">{{ f.to }}</span>
                </template>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="pa-4 d-flex flex-column gap-3">
              <v-card v-for="doc in step!.docs" :key="doc.code" variant="outlined" rounded="lg">
                <div style="padding: 10px 12px; display: flex; align-items: flex-start; gap: 8px">
                  <v-chip
                    :color="docColor(doc.type)"
                    size="x-small"
                    variant="flat"
                    class="font-weight-bold mr-2"
                    >{{ doc.type }}</v-chip
                  >
                  <div>
                    <div style="font-size: 12.5px; font-weight: 700">{{ doc.code }}</div>
                    <div
                      style="
                        font-size: 11px;
                        color: rgba(var(--v-theme-on-surface), 0.5);
                        margin-top: 2px;
                      "
                    >
                      {{ doc.name }}
                    </div>
                  </div>
                </div>
                <v-divider />
                <div style="padding: 10px 12px">
                  <p style="font-size: 12px; line-height: 1.6; margin-bottom: 8px">
                    {{ doc.desc }}
                  </p>
                  <ul
                    style="
                      padding-left: 16px;
                      font-size: 11.5px;
                      display: flex;
                      flex-direction: column;
                      gap: 3px;
                    "
                  >
                    <li v-for="k in doc.ket" :key="k">{{ k }}</li>
                  </ul>
                </div>
              </v-card>
            </div>
          </template>
        </div>

        <!-- Nav footer -->
        <div class="nav-footer flex-shrink-0">
          <v-btn
            size="small"
            variant="text"
            color="primary"
            prepend-icon="mdi-map-outline"
            @click="backToMap"
            >← Peta Alur</v-btn
          >
          <div class="d-flex gap-2">
            <v-btn
              size="small"
              variant="outlined"
              :disabled="selectedStep === 0"
              @click="selectStep(selectedStep! - 1)"
            >
              <v-icon start size="14">mdi-arrow-left</v-icon> Sebelumnya
            </v-btn>
            <v-btn
              size="small"
              variant="flat"
              color="primary"
              :disabled="selectedStep === STEPS.length - 1"
              @click="selectStep(selectedStep! + 1)"
            >
              Berikutnya <v-icon end size="14">mdi-arrow-right</v-icon>
            </v-btn>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.gap-1 {
  gap: 4px;
}
.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}

/* MAP VIEW */
.map-view {
  background: rgb(var(--v-theme-surface));
}
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
}
.map-title {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}
.map-hint {
  font-size: 10.5px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
}

.svg-wrap {
  padding: 0 16px;
}
.flow-svg {
  display: block;
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(255, 255, 255, 0.6);
}
.v-theme--dark .flow-svg {
  background: rgba(255, 255, 255, 0.04);
}
.fnode {
  cursor: pointer;
}
.fnode:hover rect {
  filter: brightness(0.93);
}
.fnode.hov rect {
  filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.22));
}

/* Hover card */
.hover-card {
  margin: 10px 16px 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border: 1.5px solid;
  border-radius: 10px;
  transition: all 0.2s;
}
.hover-placeholder {
  margin: 10px 16px 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 10px;
  font-size: 10.5px;
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.hc-num {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}
.hc-body {
  flex: 1;
}
.hc-label {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.hc-lane {
  font-size: 10px;
  font-weight: 400;
  opacity: 0.6;
}
.hc-short {
  font-size: 11.5px;
  color: rgba(var(--v-theme-on-surface), 0.65);
  margin-top: 3px;
  line-height: 1.5;
}
.hc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.hc-cta {
  font-size: 10px;
  font-weight: 600;
  margin-top: 6px;
  opacity: 0.55;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Legend */
.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 10px 16px;
  margin-top: 4px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  font-size: 10.5px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  align-items: center;
}
.leg-item {
  display: flex;
  align-items: center;
  gap: 5px;
}
.leg-box {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid;
  flex-shrink: 0;
}

/* Steps grid */
.steps-grid {
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  margin-top: 4px;
}
.sg-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin-bottom: 8px;
}
.sg-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
}
.sg-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid;
  cursor: pointer;
  background: rgb(var(--v-theme-surface));
  transition: all 0.15s;
}
.sg-card:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
  transform: translateX(2px);
}
.sg-num {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: white;
}
.sg-body {
  flex: 1;
  min-width: 0;
}
.sg-label {
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}
.sg-short {
  font-size: 10.5px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-top: 2px;
  line-height: 1.4;
}

/* DETAIL VIEW */
.dv-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
.dv-num {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
}
.dv-title {
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.dv-lane {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-top: 2px;
}

.tab-bar {
  display: flex;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
.tbtn {
  font-size: 11px;
  padding: 8px 14px;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.5);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-family: inherit;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.tbtn.active {
  color: rgb(var(--v-theme-primary));
  border-bottom-color: rgb(var(--v-theme-primary));
  font-weight: 700;
}
.tbadge {
  background: rgba(var(--v-theme-on-surface), 0.15);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 8px;
}
.tbadge.active {
  background: rgb(var(--v-theme-primary));
  color: white;
}

.dv-content {
  padding: 0;
}
.cs {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.cs:last-child {
  border-bottom: none;
}
.csl {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.desc {
  font-size: 12.5px;
  line-height: 1.7;
  padding: 10px 12px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-radius: 8px;
  border-left: 3px solid;
  color: rgb(var(--v-theme-on-surface));
}

.proc-list {
  display: flex;
  flex-direction: column;
}
.proc-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.proc-row:last-child {
  border-bottom: none;
}
.pn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}
.pt {
  font-size: 12.5px;
  line-height: 1.65;
  color: rgb(var(--v-theme-on-surface));
  flex: 1;
}

/* SPK */
.spk-wrap {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.spk-left {
  width: 115px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.spk-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 7px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.15);
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.phi {
  font-size: 14px;
  flex-shrink: 0;
}
.phl {
  font-size: 9.5px;
  line-height: 1.3;
  color: rgba(var(--v-theme-on-surface), 0.6);
  flex: 1;
}
.spk-right {
  flex: 1;
  border: 1px solid;
  border-radius: 9px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.02);
  min-width: 0;
}
.spk-rh {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  display: flex;
  align-items: center;
  gap: 8px;
}
.spk-badge {
  margin-left: auto;
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 8px;
  border: 1px solid;
  background: white;
  white-space: nowrap;
  flex-shrink: 0;
}
.spk-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.spk-row:last-child {
  border-bottom: none;
}
.spk-n {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}
.spk-t {
  font-size: 11.5px;
  line-height: 1.65;
  color: rgb(var(--v-theme-on-surface));
  flex: 1;
}

/* Flow mini */
.flow-mini {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.fn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 500;
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.7);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
}
.fn.active-n {
  font-weight: 700;
}
.fvia {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* Nav footer */
.nav-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  background: rgb(var(--v-theme-surface));
}

/* Scrollbar */
.map-view::-webkit-scrollbar,
.dv-content::-webkit-scrollbar {
  width: 4px;
}
.map-view::-webkit-scrollbar-thumb,
.dv-content::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 4px;
}

@media print {
  .nav-footer,
  .tab-bar {
    display: none !important;
  }
}
</style>
