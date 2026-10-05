<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";
import { useAuthStore } from "@/stores/authStore";
import CountUp from "@/components/CountUp.vue";

import icDtf from "@/assets/ikon-jasa/dtf.png";
import icDtfPremium from "@/assets/ikon-jasa/dtf-premium.png";
import icBordir from "@/assets/ikon-jasa/bordir.png";
import icPlatisol from "@/assets/ikon-jasa/platisol.png";
import icDtg from "@/assets/ikon-jasa/dtg.png";
import icSablon from "@/assets/ikon-jasa/sablon.png";
import icGambar from "@/assets/ikon-jasa/jasa-gambar.png";
import icTulisan from "@/assets/ikon-jasa/jasa-tulisan.png";

const authStore = useAuthStore();
const isStaff = computed(() => authStore.isAuthenticated);
const route = useRoute();
const router = useRouter();
const isLoading = ref(true);
const nomorSo = ref(route.params.nomor as string);
// Ambil target SPK dari URL (jika dialihkan dari combo box beranda)
const targetSpk = route.query.target as string;

// --- TIPE DATA ---
interface TrackingLog {
  id: number;
  waktu: string;
  status: string;
  deskripsi: string;
  aktor: string;
  isSpkGroup?: boolean;
  children?: TrackingLog[];
  color?: string;
  originalDeskripsi?: string;
}

interface Milestone {
  id: number;
  kode: string;
  title: string;
  icon: string;
  waktu: string | null;
  isActive: boolean;
  isCurrent: boolean;
  skippedText?: string;
  jenisProduksi?: string;
}

interface RawLog {
  id: number;
  waktu: string;
  title: string;
  subtitle: string;
  detail?: string;
  status: string;
  isSpkGroup?: boolean;
  color?: string;
  children?: RawLog[];
}

interface OrderItemBreakdown {
  ukuran: string;
  qty: number;
  harga: number;
  diskon: number;
  subtotal: number;
}

interface OrderItem {
  kode: string;
  nama: string;
  nama_spk?: string;
  ukuran?: string;
  qty: number;
  harga: number;
  diskon: number;
  subtotal: number;
  sd_nomor?: string;
  imageUrl?: string;
  isJasaMurni?: boolean;
  isFullyScanned?: boolean;
  hasHoverDetail?: boolean;
  breakdown?: OrderItemBreakdown[];
}

interface OrderSummary {
  totalBruto: number;
  diskonFaktur: number;
  biayaKirim: number;
  ppn: number;
  totalDibayar: number;
  grandTotal: number;
  sisaTagihan: number;
}

// --- STATE ---
const logs = ref<TrackingLog[]>([]);
const milestones = ref<Milestone[]>([]);
const resiAwb = ref("");
const penerima = ref("");
const datelineCustomer = ref<string | null>(null);
const estimasiSelesai = ref<string | null>(null);
const orderItems = ref<OrderItem[]>([]);
const orderSummary = ref<OrderSummary>({
  totalBruto: 0,
  diskonFaktur: 0,
  biayaKirim: 0,
  ppn: 0,
  totalDibayar: 0,
  grandTotal: 0,
  sisaTagihan: 0,
});

const expandedSpks = ref<number[]>([]);
const toggleSpk = (id: number) => {
  if (expandedSpks.value.includes(id)) {
    expandedSpks.value = expandedSpks.value.filter((x) => x !== id);
  } else {
    expandedSpks.value.push(id);
  }
};

// --- Tambahan tampilan ---
const imgFailed = reactive<Record<string, boolean>>({});
const copied = ref(false);

const copyResi = async () => {
  try {
    await navigator.clipboard.writeText(resiAwb.value || nomorSo.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1800);
  } catch {
    /* clipboard tidak tersedia */
  }
};

const currentMilestone = computed(() => milestones.value.find((m) => m.isCurrent));

// Persen isi garis progres: dari pusat langkah pertama ke pusat langkah aktif
const progressPct = computed(() => {
  const n = milestones.value.length;
  const i = milestones.value.findIndex((m) => m.isCurrent);
  return n < 2 || i < 0 ? 0 : (i / (n - 1)) * 100;
});

const lastUpdate = computed(() => {
  const l = logs.value.find((x) => x.waktu && x.waktu !== "Berjalan" && x.waktu !== "-");
  return l ? l.waktu : "";
});

const whenParts = (w: string) => {
  if (!w || w === "Berjalan") return { d: "Sedang", t: "berjalan" };
  if (w === "-") return { d: "-", t: "" };
  const [d, t] = w.split(" ");
  return { d, t: t || "" };
};

// Kelompokkan barang beraawalan nama sama: judul = awalan bersama, baris = varian
interface ItemRow {
  item: OrderItem;
  label: string;
  idx: number;
}
interface ItemGroup {
  key: string;
  title: string | null;
  qty: number;
  items: ItemRow[];
}

const itemGroups = computed<ItemGroup[]>(() => {
  const buckets = new Map<string, OrderItem[]>();
  orderItems.value.forEach((it) => {
    const key = (it.nama || "").trim().toUpperCase().split(/\s+/).slice(0, 3).join(" ");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  });

  let idx = 0;
  const groups: ItemGroup[] = [];
  buckets.forEach((list, key) => {
    const qty = list.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const words = list.map((i) => (i.nama || "").trim().split(/\s+/));
    let p = 0;
    if (list.length > 1) {
      const maxP = Math.min(...words.map((w) => w.length)) - 1; // sisakan minimal 1 kata varian
      while (p < maxP && words.every((w) => w[p].toUpperCase() === words[0][p].toUpperCase())) p++;
    }
    const grouped = list.length > 1 && p >= 2;
    groups.push({
      key,
      title: grouped ? words[0].slice(0, p).join(" ") : null,
      qty,
      items: list.map((item, n) => ({
        item,
        label: grouped ? words[n].slice(p).join(" ") : item.nama,
        idx: idx++,
      })),
    });
  });
  return groups;
});

// --- Ikon jasa ---
const PREFIX_ICON: Record<string, { src: string; label: string }> = {
  SD: { src: icDtf, label: "DTF" },
  DP: { src: icDtfPremium, label: "DTF Premium" },
  BR: { src: icBordir, label: "Bordir" },
  SB: { src: icPlatisol, label: "Platisol" },
  TG: { src: icDtg, label: "DTG" },
  PL: { src: icSablon, label: "Polyflex" },
};

const serviceIcon = (it: OrderItem): { src: string; label: string } | null => {
  const nama = (it.nama || "").toUpperCase();
  if (/JASA\s+DESIGN\s+GAMBAR/.test(nama)) return { src: icGambar, label: "Jasa Gambar" };
  if (/JASA\s+DESIGN\s+TULISAN/.test(nama)) return { src: icTulisan, label: "Jasa Tulisan" };
  const prefix = (it.sd_nomor || "").split(".")[1]?.toUpperCase();
  return prefix ? PREFIX_ICON[prefix] ?? null : null;
};

// --- Kartu bantuan: kontak store sesuai cabang surat pesanan ---
interface ContactItem {
  kode: string;
  nama: string;
  telepon: string;
  alamat: string;
  wa_link: string | null;
}
const contact = ref<ContactItem | null>(null);
const contactLoaded = ref(false);
const branchKode = computed(() => decodeResi(nomorSo.value).split(".")[0].toUpperCase());

const fetchContact = async () => {
  try {
    const { data } = await api.get<ContactItem[]>("/so/public/contacts");
    contact.value = data.find((c) => c.kode === branchKode.value) ?? null;
  } catch {
    contact.value = null;
  } finally {
    contactLoaded.value = true;
  }
};

const waLink = computed(() => {
  const c = contact.value;
  if (!c?.wa_link) return null;
  const text = `Halo Kaosan ${c.nama}, saya ingin menanyakan pesanan dengan nomor resi ${
    resiAwb.value || nomorSo.value
  }.`;
  return `${c.wa_link}?text=${encodeURIComponent(text)}`;
});

// Fungsi pintar penentu warna Oranye / Hijau
const isOngoing = (item: TrackingLog, i: number, isParent: boolean = false): boolean => {
  // 1. Indikator paling kuat: kalau belum ada jamnya alias "Berjalan"
  if (item.waktu === "Berjalan" || !item.waktu) return true;

  // 2. Jika Parent punya anak, parent ikut status anak terakhirnya (kalau anak terakhir masih 'Berjalan')
  if (isParent && item.children && item.children.length > 0) {
    const lastChild = item.children[item.children.length - 1];
    if (lastChild.waktu === "Berjalan" || !lastChild.waktu) return true;
  }

  // 3. Jika Parent & dia ada di urutan paling atas (index 0)
  if (isParent && i === 0) {
    const text = (item.status + " " + item.deskripsi).toLowerCase();
    // [PERBAIKAN]: Tambahkan kata kunci 'diambil' dan 'invoice'
    if (
      text.includes("selesai") ||
      text.includes("diterima") ||
      text.includes("lunas") ||
      text.includes("batal") ||
      text.includes("diambil") ||
      text.includes("invoice")
    ) {
      return false; // Jadi Hijau
    }
    // Selain itu -> Oranye
    return true;
  }

  // 4. Default: Kalau sudah lewat & punya tanggal -> Hijau (Selesai)
  return false;
};

// --- FUNGSI DECODE RESI SHOPEE ALA KAOSAN ---
const decodeResi = (resi: string) => {
  try {
    const raw = resi.trim().toUpperCase();
    if (!raw.startsWith("KSN")) return raw;

    const cabang = raw.substring(3, 6);
    const encodedNum = raw.substring(6);

    const secretVal = parseInt(encodedNum, 36);
    if (isNaN(secretVal)) return raw;

    const origNum = (secretVal - 456789) / 7;
    if (!Number.isInteger(origNum)) return raw;

    let numStr = origNum.toString();
    if (numStr.length < 8) {
      numStr = numStr.padStart(8, "0");
    }

    const part1 = numStr.substring(0, 4);
    const part2 = numStr.substring(4);

    return `${cabang}.SO.${part1}.${part2}`;
  } catch (e) {
    console.error("Decode resi gagal:", e);
    return resi;
  }
};

// [BARU] Mapping penamaan proses produksi untuk View Internal — istilah
// teknis backend diringkas jadi lebih umum & mudah dipahami staff lintas
// divisi (bukan cuma yang paham detail alur pabrik).
const STAFF_TITLE_MAP: Record<string, string> = {
  "SO Diteruskan ke MANKSI (PPIC)": "Pesanan Diteruskan ke Produksi",
  "Menunggu SPK Produksi (PPIC)": "Menunggu Dijadwalkan Produksi",
  "Diteruskan ke Produksi (SPK PABRIK)": "Produksi Dimulai",
  "Permintaan Bahan Dibuat": "Bahan Baku Diminta",
  "Bahan Dikeluarkan (Realisasi)": "Bahan Baku Disiapkan",
  "Menunggu Pengeluaran Bahan": "Menunggu Bahan Baku",
  "Permintaan Bahan Dibatalkan": "Permintaan Bahan Dibatalkan",
  "Menunggu Permintaan Bahan": "Menunggu Persiapan Bahan",

  // [DIUBAH]: Semua tahap "Menunggu Proses X" digeneralisir jadi satu
  // label netral, supaya tidak menampilkan detail tahap teknis pabrik
  "Menunggu Proses Potong": "Menunggu Tahap Berikutnya",
  "Menunggu Proses Jahit": "Menunggu Tahap Berikutnya",
  "Menunggu Proses Lipat": "Menunggu Tahap Berikutnya",

  "Menunggu Masuk Koli": "Menunggu Pengemasan",
  "Menunggu Pembuatan STBJ": "Menunggu Serah Terima",
  "Surat Terima Barang Jadi (STBJ)": "Serah Terima ke Gudang Pusat",
  "Menunggu Penerimaan DC": "Menunggu Diterima Gudang Pusat",
  "Barang Diterima DC": "Diterima Gudang Pusat",
};

// [BARU] Deteksi apakah 1 grup SPK sudah tuntas sampai gudang pusat (DC).
// Patokannya: child terakhir dari grup SPK punya title mentah "Barang Diterima DC".
const isSpkReachedDC = (children?: RawLog[]): boolean => {
  if (!children || children.length === 0) return false;
  const last = children[children.length - 1];
  return /barang diterima dc/i.test(last.title);
};

const friendlyStaffTitle = (title: string): string => {
  if (STAFF_TITLE_MAP[title]) return STAFF_TITLE_MAP[title];

  // [BARU] Fallback generik: title apapun yang berpola "Menunggu Proses ..."
  // otomatis dianggap "Menunggu Tahap Berikutnya", tanpa perlu didaftar satu-satu
  if (/^Menunggu Proses /i.test(title)) return "Menunggu Tahap Berikutnya";

  if (title.startsWith("Proses Potong Selesai"))
    return title.replace("Proses Potong Selesai", "Tahap Potong Selesai");
  if (title.startsWith("Proses Cetak Selesai"))
    return title.replace("Proses Cetak Selesai", "Tahap Cetak Selesai");
  if (title.startsWith("Proses Jahit Selesai"))
    return title.replace("Proses Jahit Selesai", "Tahap Jahit Selesai");
  if (title.startsWith("Proses Lipat Selesai"))
    return title.replace("Proses Lipat Selesai", "Tahap Lipat & QC Selesai");
  if (title.startsWith("Barang Jadi (Masuk Koli)"))
    return title.replace("Barang Jadi (Masuk Koli)", "Barang Jadi Dikemas");
  return title;
};

// --- DATA FETCHING ---
const fetchTrackingData = async () => {
  isLoading.value = true;
  try {
    // 1. UBAH RESI DARI URL KEMBALI JADI NOMOR SO ASLI
    const realSoNumber = decodeResi(nomorSo.value);

    // 2. TEMBAK API PAKAI NOMOR SO ASLI
    const response = await api.get(`/so/track/${realSoNumber}`);
    const data = response.data;

    // ... (SISA KODE MAPPING LOGS DAN LAINNYA SAMA PERSIS) ...
    logs.value = data.logs.map((log: RawLog): TrackingLog => {
      const gabunganUtama = log.detail ? `${log.subtitle} • ${log.detail}` : log.subtitle;

      if (isStaff.value) {
        let mappedStatus = friendlyStaffTitle(log.title);
        if (log.isSpkGroup && mappedStatus === "Produksi Dimulai" && isSpkReachedDC(log.children)) {
          mappedStatus = "Produksi Selesai";
        }

        return {
          id: log.id,
          waktu: log.waktu,
          status: mappedStatus,
          originalDeskripsi: gabunganUtama,
          deskripsi: gabunganUtama,
          aktor: log.status,
          isSpkGroup: log.isSpkGroup,
          children: log.children
            ? log.children.map((c: RawLog): TrackingLog => {
                const gabunganChild = c.detail ? `${c.subtitle} • ${c.detail}` : c.subtitle;
                return {
                  id: c.id,
                  waktu: c.waktu,
                  status: friendlyStaffTitle(c.title),
                  originalDeskripsi: gabunganChild,
                  deskripsi: gabunganChild,
                  aktor: c.status,
                  color: c.color,
                };
              })
            : [],
        };
      } else {
        let simpleTitle = log.title
          .replace(/\s*\(\s*LHK\s*\)/i, "")
          .replace(/\s*\(\s*SPK PABRIK\s*\)/i, "")
          .replace(/\s*\(\s*PPIC\s*\)/i, "");

        let simpleDesc = "";
        const titleLower = log.title.toLowerCase();

        // [BARU] Override khusus 3 tahap SO -> PPIC -> SPK, supaya bahasanya
        // general & tidak duplikat makna di mata customer:
        // 1. SO baru diteruskan ke MANKSI (belum ada SPK) -> "Diteruskan ke Produksi"
        // 2. Masih menunggu PPIC menerbitkan SPK -> "Menunggu Diteruskan ke Produksi"
        // 3. SPK sudah diterbitkan (produksi fisik dimulai) -> "Masuk Antrean Produksi"
        //    (dibedakan dari #1 supaya tidak ada 2 entri timeline dengan judul sama persis)
        if (titleLower.includes("so diteruskan ke manksi")) {
          simpleTitle = "Diteruskan ke Produksi";
          simpleDesc = "Pesanan Anda telah diteruskan ke tim produksi kami.";
        } else if (titleLower.includes("menunggu spk produksi")) {
          simpleTitle = "Menunggu Diteruskan ke Produksi";
          simpleDesc = "Pesanan Anda akan segera diteruskan ke tim produksi.";
        } else if (
          titleLower.includes("diteruskan ke produksi") &&
          titleLower.includes("spk pabrik")
        ) {
          simpleTitle = "Masuk Antrean Produksi";
          simpleDesc = "Pesanan Anda telah masuk antrean/proses produksi.";
        } else if (titleLower.includes("penawaran"))
          simpleDesc = "Dokumen penawaran harga telah dibuat.";
        else if (titleLower.includes("pesanan dibuat"))
          simpleDesc = "Pesanan Anda telah tercatat dalam sistem kami.";
        else if (titleLower.includes("pembayaran diterima (dp)"))
          simpleDesc = "Pembayaran uang muka (DP) telah diverifikasi.";
        else if (titleLower.includes("pembayaran diterima (lunas)"))
          simpleDesc = "Pembayaran lunas telah diverifikasi.";
        else if (titleLower.includes("pembayaran tagihan"))
          simpleDesc = "Pembayaran tagihan/cicilan telah diverifikasi.";
        else if (titleLower.includes("produksi"))
          simpleDesc = "Pesanan sedang diproses oleh tim produksi kami.";
        else if (titleLower.includes("selesai")) simpleDesc = "Tahap pengerjaan ini telah selesai.";
        else if (titleLower.includes("ready") || titleLower.includes("diterima dc"))
          simpleDesc = "Pesanan sudah berada di toko dan siap diambil / dikirim.";
        else if (titleLower.includes("invoice") || titleLower.includes("diambil"))
          simpleDesc = "Pesanan telah diserahkan / dikirim ke pelanggan.";
        else if (titleLower.includes("batal") || titleLower.includes("close"))
          simpleDesc = "Pesanan dibatalkan.";
        else simpleDesc = "Proses administrasi berjalan.";

        const filteredChildren: TrackingLog[] = [];

        return {
          id: log.id,
          waktu: log.waktu,
          status: simpleTitle,
          originalDeskripsi: gabunganUtama,
          deskripsi: simpleDesc,
          aktor: log.status,
          isSpkGroup: log.isSpkGroup,
          children: filteredChildren,
        };
      }
    });

    if (isStaff.value) {
      const spkGroups = logs.value.filter((l) => l.isSpkGroup);
      const allSpkDone =
        spkGroups.length > 0 && spkGroups.every((l) => l.status === "Produksi Selesai");

      if (allSpkDone) {
        logs.value.unshift({
          id: -1,
          waktu: "Berjalan",
          status: "Menunggu Tahap Berikutnya",
          deskripsi: "Seluruh SPK produksi telah selesai, menunggu proses selanjutnya.",
          aktor: "",
          isSpkGroup: false,
          children: [],
        });
      }
    }

    // [PERBAIKAN]: Sembunyikan Nomor SO di pojok kanan atas
    if (!data.resiAwb || data.resiAwb === realSoNumber) {
      // Jika kosong atau isinya nomor SO asli mentah, ganti pakai Resi KSN...
      resiAwb.value = nomorSo.value;
    } else {
      // Jika isinya resi ekspedisi sungguhan (misal: J&T / Shopee Express), biarkan tampil
      resiAwb.value = data.resiAwb;
    }

    penerima.value = data.penerima || "Umum";
    estimasiSelesai.value = data.estimasiSelesai;
    datelineCustomer.value = data.datelineCustomer;
    orderItems.value = data.orderItems;
    orderSummary.value = data.orderSummary;

    const isMurniReadyStock =
      !data.orderItems.some((item: OrderItem) => {
        const k = (item.kode || "").toUpperCase();
        const n = (item.nama || "").toUpperCase();
        return (
          k === "CUSTOM" ||
          item.sd_nomor ||
          k.startsWith("JASA") ||
          k.startsWith("JS") ||
          n.includes("JASA")
        );
      }) &&
      !logs.value.some(
        (l: TrackingLog) => l.status?.includes("Produksi") || l.deskripsi?.includes("SPK PABRIK")
      );

    const filteredMilestones = data.milestones.filter((m: Milestone) => {
      if (m.kode === "PENAWARAN" && !m.isActive) return false;
      if (m.kode === "PRODUKSI" && isMurniReadyStock) return false;
      return true;
    });

    milestones.value = filteredMilestones.map((m: Milestone) => {
      const skippedText = "";
      return { ...m, skippedText };
    });

    if (targetSpk && targetSpk !== "UMUM") {
      logs.value = logs.value.filter((log) => {
        if (!log.isSpkGroup) return true;
        return log.originalDeskripsi?.includes(targetSpk);
      });
      const matchedLog = logs.value.find(
        (log) => log.isSpkGroup && log.originalDeskripsi?.includes(targetSpk)
      );
      if (matchedLog) {
        expandedSpks.value.push(matchedLog.id);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

const goBackToHome = () => {
  router.push("/tracking"); // Sesuaikan dengan route path TrackingHomeView Mas Rizal
};

// Tinggi hero diukur agar kartu rincian bisa disejajarkan dengan teks status (desktop)
const heroEl = ref<HTMLElement | null>(null);
const heroH = ref(0);
const measureHero = () => {
  heroH.value = heroEl.value?.offsetHeight ?? 0;
};
watch(isLoading, async (v) => {
  if (v) return;
  await nextTick();
  measureHero();
  document.fonts?.ready.then(measureHero);
});

onMounted(() => {
  fetchTrackingData();
  fetchContact();
  window.addEventListener("resize", measureHero);
});
onUnmounted(() => window.removeEventListener("resize", measureHero));
</script>

<template>
  <div class="st">
    <header class="st-bar">
      <div class="st-bar-in">
        <button class="st-icon-btn" aria-label="Kembali" @click="goBackToHome">
          <v-icon size="22">mdi-arrow-left</v-icon>
        </button>
        <span class="st-bar-title">Lacak Pesanan</span>
        <button class="st-icon-btn" aria-label="Muat ulang" @click="fetchTrackingData">
          <v-icon size="22">mdi-refresh</v-icon>
        </button>
      </div>
    </header>

    <!-- LOADING -->
    <template v-if="isLoading">
      <section class="st-hero">
        <div class="st-wrap st-hero-in">
          <div class="st-skel" style="width: 120px; height: 14px"></div>
          <div class="st-skel" style="width: 62%; height: 52px; margin-top: 14px"></div>
          <div class="st-skel" style="width: 38%; height: 16px; margin-top: 16px"></div>
        </div>
      </section>
      <div class="st-wrap">
        <div
          class="st-skel st-skel--light"
          style="height: 150px; margin-top: -64px; border-radius: 22px"
        ></div>
        <div
          class="st-skel st-skel--light"
          style="height: 320px; margin-top: 20px; border-radius: 20px"
        ></div>
      </div>
    </template>

    <template v-else>
      <!-- HERO STATUS -->
      <section ref="heroEl" class="st-hero" :class="{ 'st-hero--public': !isStaff }">
        <div class="st-wrap st-hero-in">
          <div class="st-eyebrow st-rise" style="--d: 0ms">Status pesanan</div>
          <h1 class="st-status st-rise" style="--d: 90ms">
            {{ currentMilestone?.title || "Diproses" }}
          </h1>
          <div class="st-meta st-rise" style="--d: 180ms">
            <span
              >Atas nama <b>{{ penerima }}</b></span
            >
            <span v-if="lastUpdate" class="st-meta-sep">Diperbarui {{ lastUpdate }}</span>
          </div>
          <button class="st-resi st-rise" style="--d: 270ms" @click="copyResi">
            <small>NO. RESI</small>
            <b>{{ resiAwb }}</b>
            <span class="st-resi-act">
              <v-icon size="14">{{ copied ? "mdi-check" : "mdi-content-copy" }}</v-icon>
              {{ copied ? "Tersalin" : "Salin" }}
            </span>
          </button>
        </div>
        <i class="st-stripe"></i>
      </section>

      <div
        class="st-wrap st-body"
        :class="{ 'st-body--public': !isStaff }"
        :style="{ '--hero-h': heroH + 'px' }"
      >
        <!-- LANGKAH -->
        <section class="st-steps-card">
          <div class="st-steps" :style="{ '--n': milestones.length, '--p': progressPct }">
            <div class="st-track"><i class="st-track-fill"></i></div>
            <div
              v-for="(step, index) in milestones"
              :key="step.id"
              class="st-step"
              :class="{ active: step.isActive, current: step.isCurrent }"
              :style="{ '--i': index }"
            >
              <span class="st-node"
                ><v-icon size="22">{{ step.icon }}</v-icon></span
              >
              <span class="st-step-title">{{ step.title }}</span>
              <span v-if="step.waktu" class="st-step-time">{{ step.waktu }}</span>
              <span v-if="step.jenisProduksi" class="st-step-kind">{{ step.jenisProduksi }}</span>
            </div>
          </div>
        </section>

        <div class="st-grid" :class="{ 'st-grid--public': !isStaff }">
          <!-- RIWAYAT (hanya staff) -->
          <section v-if="isStaff" class="st-card">
            <div class="st-card-h"><h2>Riwayat Pesanan</h2></div>
            <ol class="tl">
              <li
                v-for="(log, i) in logs"
                :key="log.id"
                class="tl-item"
                :class="{ 'is-now': isOngoing(log, i, true) }"
                :style="{ '--d': `${i * 80}ms` }"
              >
                <div class="tl-time">
                  <b>{{ whenParts(log.waktu).d }}</b>
                  <span>{{ whenParts(log.waktu).t }}</span>
                </div>
                <div class="tl-rail">
                  <i class="tl-dot"
                    ><v-icon size="14">{{
                      isOngoing(log, i, true) ? "mdi-timer-sand" : "mdi-check"
                    }}</v-icon></i
                  >
                </div>
                <div class="tl-body">
                  <h3>{{ log.status }}</h3>
                  <p>{{ log.deskripsi }}</p>

                  <div v-if="log.isSpkGroup && log.children && log.children.length > 0">
                    <button class="tl-toggle" @click="toggleSpk(log.id)">
                      {{
                        expandedSpks.includes(log.id)
                          ? "Tutup detail pabrik"
                          : "Lihat detail pabrik"
                      }}
                      <v-icon size="16">{{
                        expandedSpks.includes(log.id) ? "mdi-chevron-up" : "mdi-chevron-down"
                      }}</v-icon>
                    </button>

                    <v-expand-transition>
                      <div v-show="expandedSpks.includes(log.id)" class="tl-sub">
                        <ol class="tl tl--sub">
                          <li
                            v-for="(child, ci) in log.children"
                            :key="child.id"
                            class="tl-item"
                            :class="{ 'is-now': isOngoing(child, ci, false) }"
                            :style="{ '--d': `${ci * 60}ms` }"
                          >
                            <div class="tl-time">
                              <b>{{ whenParts(child.waktu).d }}</b>
                              <span>{{ whenParts(child.waktu).t }}</span>
                            </div>
                            <div class="tl-rail">
                              <i class="tl-dot"
                                ><v-icon size="14">{{
                                  isOngoing(child, ci, false) ? "mdi-timer-sand" : "mdi-check"
                                }}</v-icon></i
                              >
                            </div>
                            <div class="tl-body">
                              <h3>{{ child.status }}</h3>
                              <p>{{ child.deskripsi }}</p>
                            </div>
                          </li>
                        </ol>
                      </div>
                    </v-expand-transition>
                  </div>
                </div>
              </li>
            </ol>
          </section>

          <!-- RINCIAN -->
          <aside class="st-card">
            <div class="st-card-h">
              <h2>Rincian Pesanan</h2>
              <span v-if="orderSummary.sisaTagihan <= 0" class="st-chip-ok">
                <v-icon size="14">mdi-check-decagram</v-icon> LUNAS
              </span>
              <span v-else class="st-chip-due">Belum lunas</span>
            </div>

            <div class="st-detail">
              <ul class="it-list">
                <template v-for="g in itemGroups" :key="g.key">
                  <li v-if="g.title" class="it-group">
                    <b>{{ g.title }}</b>
                    <span>{{ g.items.length }} varian · {{ g.qty }} pcs</span>
                  </li>

                  <li
                    v-for="row in g.items"
                    :key="row.idx"
                    class="it"
                    :class="{ 'is-ready': row.item.isFullyScanned, 'it--sub': !!g.title }"
                    :style="{ '--d': `${row.idx * 70}ms` }"
                  >
                    <div class="it-img" :class="{ 'it-img--svc': !!serviceIcon(row.item) }">
                      <img
                        v-if="serviceIcon(row.item)"
                        :src="serviceIcon(row.item)!.src"
                        :alt="serviceIcon(row.item)!.label"
                      />
                      <img
                        v-else-if="
                          row.item.imageUrl &&
                          !row.item.isJasaMurni &&
                          !imgFailed[row.item.kode + (row.item.sd_nomor || '')]
                        "
                        :src="row.item.imageUrl"
                        :alt="row.item.nama"
                        loading="lazy"
                        @error="imgFailed[row.item.kode + (row.item.sd_nomor || '')] = true"
                      />
                      <v-icon v-else size="26">{{
                        row.item.isJasaMurni ? "mdi-cog-outline" : "mdi-tshirt-crew"
                      }}</v-icon>
                    </div>

                    <div class="it-main">
                      <div class="it-name">
                        {{ row.label }}
                        <span v-if="row.item.isFullyScanned" class="it-ready"
                          ><v-icon size="12">mdi-check</v-icon> Siap</span
                        >
                      </div>
                      <div v-if="row.item.nama_spk" class="it-sub">
                        SPK: {{ row.item.nama_spk }}
                      </div>
                      <div class="it-sub">Ukuran: {{ row.item.ukuran || "-" }}</div>
                      <div v-if="row.item.sd_nomor && isStaff" class="it-sub">
                        SO DTF: <b>{{ row.item.sd_nomor }}</b>
                      </div>
                    </div>

                    <v-tooltip v-if="row.item.hasHoverDetail && row.item.breakdown" location="top">
                      <template #activator="{ props }">
                        <div v-bind="props" class="it-price">
                          <small>{{ row.item.qty }} pcs</small>
                          <b>{{ formatRupiah(row.item.subtotal) }}</b>
                        </div>
                      </template>
                      <div class="text-caption text-left pa-1">
                        <div class="font-weight-bold mb-1 border-b pb-1">Rincian Harga:</div>
                        <div
                          v-for="(b, bIdx) in row.item.breakdown"
                          :key="bIdx"
                          class="mb-1"
                          style="white-space: nowrap"
                        >
                          {{ b.qty }}x Size {{ b.ukuran }}: {{ formatRupiah(b.harga - b.diskon) }}
                          <span v-if="b.diskon > 0" class="text-red-lighten-2"
                            >(Disc {{ formatRupiah(b.diskon) }})</span
                          >
                        </div>
                      </div>
                    </v-tooltip>
                  </li>
                </template>
              </ul>

              <div class="sum">
                <div class="sum-row">
                  <span>Subtotal produk</span><b>{{ formatRupiah(orderSummary.totalBruto) }}</b>
                </div>
                <div v-if="orderSummary.diskonFaktur > 0" class="sum-row">
                  <span>Diskon faktur</span
                  ><b class="neg">-{{ formatRupiah(orderSummary.diskonFaktur) }}</b>
                </div>
                <div v-if="orderSummary.biayaKirim > 0" class="sum-row">
                  <span>Biaya pengiriman</span><b>{{ formatRupiah(orderSummary.biayaKirim) }}</b>
                </div>
                <div v-if="orderSummary.ppn > 0" class="sum-row">
                  <span>Pajak (PPN)</span><b>{{ formatRupiah(orderSummary.ppn) }}</b>
                </div>
                <div v-if="orderSummary.totalDibayar > 0" class="sum-row">
                  <span>Telah dibayar</span
                  ><b class="pos">-{{ formatRupiah(orderSummary.totalDibayar) }}</b>
                </div>

                <div class="sum-total">
                  <span>Total pesanan</span><b>{{ formatRupiah(orderSummary.grandTotal) }}</b>
                </div>

                <div v-if="orderSummary.sisaTagihan > 0" class="sum-due">
                  <span>Sisa tagihan</span>
                  <b><CountUp :to="orderSummary.sisaTagihan" before="Rp " /></b>
                </div>
              </div>
            </div>
          </aside>
          <section v-if="!isStaff && contactLoaded" class="st-help">
            <div class="st-help-eyebrow">Butuh bantuan?</div>
            <h2>{{ contact ? `Hubungi ${contact.nama}` : "Hubungi store Kaosan" }}</h2>
            <p v-if="contact">
              <span v-if="contact.alamat">{{ contact.alamat }}</span>
              <span v-if="contact.telepon" class="st-help-tel">{{ contact.telepon }}</span>
            </p>
            <p v-else>Pesanan ini ditangani oleh store Kaosan. Cari kontaknya di Pusat Bantuan.</p>
            <div class="st-help-actions">
              <a v-if="waLink" :href="waLink" target="_blank" rel="noopener" class="st-help-btn">
                <v-icon size="18">mdi-whatsapp</v-icon> Chat WhatsApp
              </a>
              <router-link
                :to="{ path: '/tracking', query: { bantuan: '1' } }"
                class="st-help-link"
              >
                {{ contact ? "Lihat store lain" : "Buka Pusat Bantuan" }}
              </router-link>
            </div>
          </section>
        </div>

        <p class="st-foot">Terima kasih telah berbelanja di Kaosan!</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.st {
  --st-red: #b71c1c;
  --st-ink: #1f1a19;
  --st-muted: #6f6663;
  --st-line: #eadfda;
  --st-ease: cubic-bezier(0.22, 1, 0.36, 1);
  min-height: 100vh;
  color: var(--st-ink);
  background: #faf6f4;
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
.st-wrap {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 16px;
}

/* ---------- Header + hero ---------- */
.st-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  color: #fff;
  background: var(--st-red);
}
.st-bar-in {
  max-width: 1180px;
  height: 56px;
  margin: 0 auto;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.st-bar-title {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
}
.st-icon-btn {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  color: #fff;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.12s ease;
}
.st-icon-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
.st-icon-btn:active {
  transform: scale(0.92);
}

.st-hero {
  position: relative;
  overflow: hidden;
  padding: 18px 0 100px;
  color: #fff;
  background: radial-gradient(700px 320px at 90% -20%, rgba(255, 255, 255, 0.16), transparent 70%),
    var(--st-red);
}
.st-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  opacity: 0.85;
}
.st-status {
  margin: 8px 0 10px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: clamp(34px, 6vw, 64px);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.st-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 13px;
  opacity: 0.92;
}
.st-meta-sep::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-right: 14px;
  vertical-align: middle;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}
.st-resi {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 8px 8px 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  font-family: inherit;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.12s ease;
}
.st-resi:hover {
  background: rgba(255, 255, 255, 0.2);
}
.st-resi:active {
  transform: scale(0.97);
}
.st-resi small {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  opacity: 0.8;
}
.st-resi b {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}
.st-resi-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: var(--st-red);
  background: #fff;
}
.st-stripe {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  background-image: repeating-linear-gradient(
    45deg,
    #6fa6d6,
    #6fa6d6 33px,
    transparent 33px,
    transparent 41px,
    #f18d9b 41px,
    #f18d9b 74px,
    transparent 74px,
    transparent 82px
  );
}

/* ---------- Langkah ---------- */
.st-steps-card {
  position: relative;
  margin-top: -64px;
  padding: 28px 8px 22px;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(60, 20, 15, 0.12);
  animation: st-rise 0.8s var(--st-ease) 0.25s both;
}
.st-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
}
.st-track {
  position: absolute;
  top: 26px;
  left: calc(100% / (var(--n) * 2));
  right: calc(100% / (var(--n) * 2));
  height: 4px;
  border-radius: 2px;
  background: var(--st-line);
  transform: translateY(-50%);
}
.st-track-fill {
  display: block;
  width: calc(var(--p) * 1%);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #b71c1c, #e53935);
  transform-origin: left center;
  animation: st-fill 1.3s var(--st-ease) 0.6s both;
}
.st-step {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 4px;
  text-align: center;
  animation: st-pop 0.6s var(--st-ease) both;
  animation-delay: calc(var(--i) * 120ms + 0.35s);
}
.st-node {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--st-line);
  border-radius: 50%;
  color: #c9bcb7;
  background: #fff;
  transition: all 0.3s ease;
}
.st-step.active .st-node {
  border-color: var(--st-red);
  color: var(--st-red);
}
.st-step.current .st-node {
  color: #fff;
  background: var(--st-red);
  animation: st-ring 2s ease-in-out infinite;
}
.st-step-title {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--st-muted);
}
.st-step.active .st-step-title {
  color: var(--st-ink);
}
.st-step.current .st-step-title {
  color: var(--st-red);
}
.st-step-time {
  margin-top: 3px;
  font-size: 11px;
  color: var(--st-muted);
}
.st-step-kind {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 800;
}

/* ---------- Kartu ---------- */
.st-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 20px;
  margin-top: 20px;
  align-items: start;
}
.st-card {
  overflow: hidden;
  border: 1px solid var(--st-line);
  border-radius: 20px;
  background: #fff;
  animation: st-rise 0.8s var(--st-ease) 0.4s both;
}
.st-card-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--st-line);
}
.st-card-h h2 {
  margin: 0;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 22px;
  font-weight: 600;
}
.st-chip-ok,
.st-chip-due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}
.st-chip-ok {
  color: #fff;
  background: #2e9e5b;
}
.st-chip-due {
  color: #b45309;
  background: #fff1e0;
}

/* ---------- Riwayat ---------- */
.tl {
  margin: 0;
  padding: 10px 22px 8px;
  list-style: none;
}
.tl-item {
  position: relative;
  display: grid;
  grid-template-columns: 92px 28px minmax(0, 1fr);
  grid-template-areas: "time rail body";
  column-gap: 10px;
  padding-bottom: 22px;
  animation: st-slide 0.55s var(--st-ease) both;
  animation-delay: calc(0.55s + var(--d, 0ms));
}
.tl-time {
  grid-area: time;
  padding-top: 2px;
  text-align: right;
  font-size: 12px;
  line-height: 1.4;
  color: var(--st-muted);
}
.tl-time b {
  display: block;
  font-weight: 700;
  color: var(--st-ink);
}
.tl-rail {
  grid-area: rail;
  position: relative;
  display: flex;
  justify-content: center;
}
.tl-rail::before {
  content: "";
  position: absolute;
  top: 26px;
  bottom: -22px;
  width: 2px;
  background: var(--st-line);
  transform-origin: top;
  animation: st-draw 0.6s ease both;
  animation-delay: calc(0.7s + var(--d, 0ms));
}
.tl-item:last-child .tl-rail::before {
  display: none;
}
.tl-dot {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: #2e9e5b;
}
.is-now > .tl-rail .tl-dot {
  background: #f59e0b;
  animation: st-ping 1.8s ease-out infinite;
}
.tl-body h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
  color: #1f6f43;
}
.is-now > .tl-body h3 {
  color: #b45309;
}
.tl-body {
  grid-area: body;
  min-width: 0;
}
.tl-body p {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-line;
  color: var(--st-muted);
}
.is-now > .tl-body p {
  color: var(--st-ink);
}
.tl-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  padding: 6px 12px;
  border: 1px solid var(--st-line);
  border-radius: 999px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  color: #6d4c41;
  background: #f6efec;
  cursor: pointer;
  transition: background 0.2s ease;
}
.tl-toggle:hover {
  background: #efe3de;
}
.tl-sub {
  margin-top: 14px;
  border: 1px solid var(--st-line);
  border-radius: 14px;
  background: #fdf9f7;
}
.tl--sub {
  padding: 14px 14px 0;
}
.tl--sub .tl-item {
  grid-template-columns: 78px 28px minmax(0, 1fr);
  animation: none;
}
.tl--sub .tl-body h3 {
  font-size: 13px;
}
.tl--sub .tl-rail::before {
  animation: none;
}

/* ---------- Barang ---------- */
.it-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.it-group {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px 8px;
  border-top: 1px solid var(--st-line);
  background: #fdf9f7;
}
.it-list > .it-group:first-child {
  border-top: none;
}
.it-group b {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.it-group span {
  font-size: 11px;
  white-space: nowrap;
  color: var(--st-muted);
}
.it--sub {
  padding-top: 10px;
  padding-bottom: 10px;
}
.it--sub .it-img {
  width: 52px;
  height: 52px;
  border-radius: 10px;
}
.it--sub .it-name {
  font-size: 15px;
}
.it {
  display: flex;
  gap: 14px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--st-line);
  animation: st-slide 0.55s var(--st-ease) both;
  animation-delay: calc(0.6s + var(--d, 0ms));
}
.it.is-ready {
  background: #f1faf4;
}
.it-img {
  width: 68px;
  height: 68px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px;
  color: #c9bcb7;
  background: #f3ebe7;
}
.it-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
}
.it-img--svc {
  width: 96px;
  height: 68px;
  padding: 6px;
  background: #fff;
  border: 1px solid var(--st-line);
}
.it-img--svc img {
  object-fit: contain;
  object-position: center;
}
.it--sub .it-img--svc {
  width: 78px;
  height: 52px;
  padding: 4px;
}
.it-main {
  flex: 1;
  min-width: 0;
}
.it-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}
.it-ready {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  vertical-align: middle;
  color: #1f6f43;
  background: #dff3e6;
}
.it-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--st-muted);
}
.it-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  align-self: flex-start;
  border-bottom: 1px dashed #bdb2ad;
  cursor: help;
}
.it-price small {
  font-size: 11px;
  color: var(--st-muted);
}
.it-price b {
  font-size: 14px;
  font-weight: 800;
}

/* ---------- Ringkasan ---------- */
.sum {
  padding: 18px 22px 22px;
  background: #fdf9f7;
}
.sum-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
  font-size: 13px;
  color: var(--st-muted);
}
.sum-row b {
  font-weight: 700;
  color: var(--st-ink);
}
.sum-row .neg {
  color: #c62828;
}
.sum-row .pos {
  color: #1f6f43;
}
.sum-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px dashed #d9ccc6;
  font-weight: 700;
}
.sum-total b {
  font-size: 18px;
}
.sum-due {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 8px;
  color: var(--st-red);
  font-weight: 800;
}
.sum-due b {
  font-family: "Playfair Display", Georgia, serif;
  font-size: 30px;
  font-weight: 600;
}
.st-foot {
  margin: 26px 0 40px;
  text-align: center;
  font-size: 12px;
  color: var(--st-muted);
}

/* ---------- Tampilan umum (desktop): rincian di kanan hero ---------- */
@media (min-width: 900px) {
  /* Teks hero tidak boleh masuk ke area kartu rincian */
  .st-hero--public .st-hero-in {
    padding-right: calc(460px + 36px);
  }
  .st-body--public {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 460px);
    column-gap: 20px;
    align-items: start;
    grid-template-rows: auto 1fr;
  }
  .st-body--public .st-steps-card {
    grid-column: 1;
    grid-row: 1;
  }
  .st-body--public .st-grid {
    display: contents;
  }
  .st-body--public .st-grid > .st-card {
    position: relative;
    z-index: 2;
    grid-column: 2;
    grid-row: 1 / 3;
    /* naik ke puncak hero: sejajar dengan "Status pesanan" */
    margin-top: calc(18px - var(--hero-h, 0px));
    box-shadow: 0 18px 40px rgba(60, 20, 15, 0.18);
  }
  .st-body--public .st-grid > .st-card {
    display: flex;
    flex-direction: column;
    max-height: min(calc(100vh - 110px), 780px);
  }
  .st-body--public .st-card .st-detail {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .st-body--public .st-card .it-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .st-body--public .st-card .sum {
    flex-shrink: 0;
    border-top: 1px solid var(--st-line);
  }
  .st-body--public > .st-help {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
  }
}

/* ---------- Kartu bantuan ---------- */
.st-help {
  margin-top: 20px;
  padding: 22px;
  border: 1px solid var(--st-line);
  border-radius: 20px;
  background: #fff;
  animation: st-rise 0.8s var(--st-ease) 0.5s both;
}
.st-help-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--st-muted);
}
.st-help h2 {
  margin: 6px 0 8px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 22px;
  font-weight: 600;
}
.st-help p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--st-muted);
}
.st-help-tel {
  display: block;
  margin-top: 4px;
  font-weight: 700;
  color: var(--st-ink);
}
.st-help-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  margin-top: 16px;
}
.st-help-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
  color: #fff;
  background: #1f9d55;
  transition: background 0.2s ease, transform 0.12s ease;
}
.st-help-btn:hover {
  background: #17803f;
}
.st-help-btn:active {
  transform: scale(0.97);
}
.st-help-link {
  font-size: 12px;
  font-weight: 700;
  color: var(--st-red);
  text-decoration: none;
}
.st-help-link:hover {
  text-decoration: underline;
}

/* ---------- Skeleton ---------- */
.st-skel {
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.14) 25%,
    rgba(255, 255, 255, 0.28) 50%,
    rgba(255, 255, 255, 0.14) 75%
  );
  background-size: 200% 100%;
  animation: st-shimmer 1.3s linear infinite;
}
.st-skel--light {
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
}

/* ---------- Animasi ---------- */
.st-rise {
  animation: st-rise 0.9s var(--st-ease) both;
  animation-delay: var(--d, 0ms);
}
@keyframes st-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
@keyframes st-pop {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.9);
  }
}
@keyframes st-slide {
  from {
    opacity: 0;
    transform: translateX(-14px);
  }
}
@keyframes st-draw {
  from {
    transform: scaleY(0);
  }
}
@keyframes st-fill {
  from {
    transform: scaleX(0);
  }
}
@keyframes st-ring {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(183, 28, 28, 0.35);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(183, 28, 28, 0);
  }
}
@keyframes st-ping {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55);
  }
  80%,
  100% {
    box-shadow: 0 0 0 10px rgba(245, 158, 11, 0);
  }
}
@keyframes st-shimmer {
  to {
    background-position: -200% 0;
  }
}

/* ---------- Responsif ---------- */
@media (max-width: 899px) {
  .st-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 599px) {
  .st-hero {
    padding-bottom: 88px;
  }
  .st-node {
    width: 40px;
    height: 40px;
  }
  .st-track {
    top: 20px;
  }
  .st-step-title {
    font-size: 11px;
  }
  .st-step-time,
  .st-step-kind {
    display: none;
  }
  .tl,
  .tl--sub {
    padding-left: 16px;
    padding-right: 16px;
  }
  .tl-item,
  .tl--sub .tl-item {
    grid-template-columns: 28px minmax(0, 1fr);
    grid-template-areas:
      "rail time"
      "rail body";
  }
  .tl-time {
    display: flex;
    gap: 6px;
    text-align: left;
  }
  .it {
    padding: 14px 16px;
  }
  .st-card-h,
  .sum,
  .it-group {
    padding-left: 16px;
    padding-right: 16px;
  }
  .it-img--svc {
    width: 80px;
    height: 60px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .st-rise,
  .st-steps-card,
  .st-card,
  .st-step,
  .st-help,
  .st-track-fill,
  .tl-item,
  .tl-rail::before,
  .it,
  .st-step.current .st-node,
  .is-now > .tl-rail .tl-dot,
  .st-skel {
    animation: none;
  }
}
</style>
