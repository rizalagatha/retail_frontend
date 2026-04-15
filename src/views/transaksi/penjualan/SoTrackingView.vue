<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";
import { useAuthStore } from "@/stores/authStore";

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

// --- STATE ---
const logs = ref<TrackingLog[]>([]);
const activePanels = ref<string[]>([targetSpk || "UMUM"]);
const milestones = ref<Milestone[]>([]);
const resiAwb = ref("");
const penerima = ref("");
const datelineCustomer = ref<string | null>(null);
const estimasiSelesai = ref<string | null>(null);
const orderItems = ref<any[]>([]);
const orderSummary = ref<any>({});

const expandedSpks = ref<number[]>([]);
const toggleSpk = (id: number) => {
  if (expandedSpks.value.includes(id)) {
    expandedSpks.value = expandedSpks.value.filter((x) => x !== id);
  } else {
    expandedSpks.value.push(id);
  }
};

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

// --- DATA FETCHING ---
const fetchTrackingData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get(`/so/track/${nomorSo.value}`);
    const data = response.data;

    // [PERBAIKAN FINAL]: Pisah Jalur Staff vs Customer
    logs.value = data.logs.map((log: any) => {
      const gabunganUtama = log.detail ? `${log.subtitle} • ${log.detail}` : log.subtitle;

      if (isStaff.value) {
        // ==========================================
        // TAMPILAN KASIR / STAFF (FULL DETAIL & ASLI)
        // ==========================================
        return {
          id: log.id,
          waktu: log.waktu,
          status: log.title,
          originalDeskripsi: gabunganUtama,
          deskripsi: gabunganUtama,
          aktor: log.status,
          isSpkGroup: log.isSpkGroup,
          children: log.children
            ? log.children.map((c: any) => {
                const gabunganChild = c.detail ? `${c.subtitle} • ${c.detail}` : c.subtitle;
                return {
                  id: c.id,
                  waktu: c.waktu,
                  status: c.title,
                  originalDeskripsi: gabunganChild,
                  deskripsi: gabunganChild,
                  aktor: c.status,
                  color: c.color,
                };
              })
            : [],
        };
      } else {
        // ==========================================
        // TAMPILAN CUSTOMER UMUM (BERSIH & PROFESIONAL)
        // ==========================================
        // 1. Bersihkan Judul Parent
        const simpleTitle = log.title
          .replace(/\s*\(\s*LHK\s*\)/i, "")
          .replace(/\s*\(\s*SPK PABRIK\s*\)/i, "");

        // 2. Buat Deskripsi Parent yang Ramah Pelanggan
        let simpleDesc = "";
        const titleLower = log.title.toLowerCase();

        if (titleLower.includes("penawaran")) simpleDesc = "Dokumen penawaran harga telah dibuat.";
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

        // =========================================================================
        // [TAMBAHAN BARU]: Munculkan kembali hanya NAMA SPK jika ini adalah grup SPK
        // =========================================================================
        if (log.isSpkGroup && log.subtitle) {
          // log.subtitle isinya biasanya: "Nama SPK: KAOSAN... • No SPK: SM-..."
          // Kita split berdasarkan titik tengah (•) dan ambil bagian pertamanya saja
          const namaSpkOnly = log.subtitle.split("•")[0].trim();
          simpleDesc = `${namaSpkOnly}\n${simpleDesc}`;
        }

        // 3. Bersihkan Deskripsi Anak-Anak (Tahapan Pabrik)
        let filteredChildren = [];
        if (log.children && log.children.length > 0) {
          filteredChildren = log.children.map((c: any) => {
            // Bersihkan tulisan (LHK) atau (Gabungan) dari judul
            let cTitle = c.title
              .replace(/\s*\(\s*LHK\s*\)/i, "")
              .replace(/\s*\(\s*Gabungan\s*\)/i, "")
              .replace(/\s*\(\s*SPK PABRIK\s*\)/i, "");

            // Ganti nama "Diterima DC" / "Masuk Koli" jadi Barang Jadi sesuai request
            if (
              cTitle.toLowerCase().includes("diterima dc") ||
              cTitle.toLowerCase().includes("masuk koli")
            ) {
              cTitle = "Barang Jadi";
            }

            // Ganti Detailnya dengan teks profesional
            let cDesc = "";
            const ctLower = cTitle.toLowerCase();

            if (c.status === "ACTIVE" || ctLower.includes("menunggu")) {
              if (ctLower.includes("bahan")) cDesc = "Menunggu persiapan bahan produksi.";
              else if (ctLower.includes("potong")) cDesc = "Dalam antrian proses pemotongan.";
              else if (ctLower.includes("jahit")) cDesc = "Dalam antrian proses penjahitan.";
              else if (ctLower.includes("lipat")) cDesc = "Dalam antrian proses pelipatan & QC.";
              else if (
                ctLower.includes("stbj") ||
                ctLower.includes("dc") ||
                ctLower.includes("koli")
              )
                cDesc = "Menunggu pengiriman ke gudang pusat.";
              else cDesc = "Menunggu antrian proses selanjutnya.";
            } else {
              if (ctLower.includes("minta") || ctLower.includes("bahan"))
                cDesc = "Tahap persiapan bahan produksi berjalan.";
              else if (ctLower.includes("potong")) cDesc = "Tahap pemotongan bahan berjalan.";
              else if (ctLower.includes("cetak") || ctLower.includes("sablon"))
                cDesc = "Tahap cetak/sablon berjalan.";
              else if (ctLower.includes("jahit")) cDesc = "Tahap penjahitan pakaian berjalan.";
              else if (ctLower.includes("lipat"))
                cDesc = "Tahap pelipatan dan Quality Control berjalan.";
              else if (ctLower.includes("stbj"))
                cDesc = "Pengiriman barang dari pabrik ke gudang pusat.";
              else if (ctLower.includes("barang jadi"))
                cDesc = "Barang telah selesai diproduksi dan masuk gudang.";
              else cDesc = "Tahap produksi selesai.";
            }

            return {
              id: c.id,
              waktu: c.waktu,
              status: cTitle,
              originalDeskripsi: c.detail ? `${c.subtitle} • ${c.detail}` : c.subtitle,
              deskripsi: cDesc, // <-- Ini yang akan muncul ke customer!
              aktor: c.status,
              color: c.color,
            };
          });
        }

        return {
          id: log.id,
          waktu: log.waktu,
          status: simpleTitle,
          originalDeskripsi: gabunganUtama,
          deskripsi: simpleDesc,
          aktor: log.status,
          // [PERBAIKAN]: Kembalikan nilai isSpkGroup agar tombol dropdown muncul lagi!
          isSpkGroup: log.isSpkGroup,
          children: filteredChildren,
        };
      }
    });
    resiAwb.value = data.resiAwb;
    penerima.value = data.penerima || "Umum";
    estimasiSelesai.value = data.estimasiSelesai;
    datelineCustomer.value = data.datelineCustomer;
    orderItems.value = data.orderItems;
    orderSummary.value = data.orderSummary;

    const isMurniReadyStock =
      !data.orderItems.some((item: any) => {
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
        // <--- PERBAIKAN 1: Gunakan logs.value yang sudah di-mapping
        (l: any) => l.status?.includes("Produksi") || l.deskripsi?.includes("SPK PABRIK") // <--- PERBAIKAN 2: Tambah tanda tanya (?.) pengaman
      );

    // [PERBAIKAN 1]: Saring dan buang "PENAWARAN" jika tidak ada
    const filteredMilestones = data.milestones.filter((m: any) => {
      if (m.kode === "PENAWARAN" && !m.isActive) return false;
      if (m.kode === "PRODUKSI" && isMurniReadyStock) return false; // <-- Langsung lompat ke Selesai!
      return true;
    });

    const currentIdx = filteredMilestones.findIndex((m: any) => m.isCurrent);

    milestones.value = filteredMilestones.map((m: any, idx: number) => {
      const skippedText = "";
      // Karena Produksi sudah disembunyikan kalau tidak ada, kita tidak perlu label "Tanpa Jasa" lagi
      return {
        ...m,
        skippedText,
      };
    });
    // [PERBAIKAN 3]: FILTER LOG BERDASARKAN TARGET SPK DARI URL
    if (targetSpk && targetSpk !== "UMUM") {
      logs.value = logs.value.filter((log) => {
        if (!log.isSpkGroup) return true;
        // HARUS menggunakan originalDeskripsi agar tidak error!
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

onMounted(() => {
  fetchTrackingData();
});
</script>

<template>
  <div class="tracking-page bg-grey-lighten-4">
    <v-toolbar color="white" elevation="1" class="px-2 px-sm-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="goBackToHome" class="mr-1"></v-btn>

      <div class="font-weight-bold text-grey-darken-3 text-subtitle-1 text-truncate">
        Lacak Pesanan
      </div>

      <v-spacer></v-spacer>

      <div class="d-none d-sm-flex align-center">
        <div class="text-caption text-grey-darken-1 mr-4">
          NOMOR SO. <span class="font-weight-bold text-black">{{ nomorSo }}</span>
        </div>

        <v-divider vertical class="mx-3 my-3"></v-divider>

        <div v-if="datelineCustomer" class="text-right mr-4">
          <div class="text-caption text-grey-darken-1" style="line-height: 1">
            Dateline Customer
          </div>
          <div class="text-caption font-weight-bold text-blue-darken-2">{{ datelineCustomer }}</div>
        </div>

        <v-divider vertical class="mx-3 my-3" v-if="datelineCustomer"></v-divider>

        <div
          v-if="estimasiSelesai && milestones.find((m) => m.kode === 'PRODUKSI' && m.isCurrent)"
          class="text-right mr-4"
        >
          <div class="text-caption text-grey-darken-1" style="line-height: 1">
            Standar Pelayanan
          </div>
          <div class="text-caption font-weight-bold text-teal-darken-2">{{ estimasiSelesai }}</div>
        </div>

        <v-divider
          vertical
          class="mx-3 my-3"
          v-if="estimasiSelesai && milestones.find((m) => m.kode === 'PRODUKSI' && m.isCurrent)"
        ></v-divider>

        <div class="text-caption font-weight-bold text-brand">
          STATUS: {{ milestones.find((m) => m.isCurrent)?.title?.toUpperCase() || "DIPROSES" }}
        </div>
      </div>

      <div class="d-flex d-sm-none flex-column align-end justify-center text-right">
        <div
          v-if="datelineCustomer"
          class="font-weight-medium text-blue-darken-2 mb-n1"
          style="font-size: 0.65rem"
        >
          Dateline: <span class="font-weight-bold">{{ datelineCustomer }}</span>
        </div>

        <div
          v-if="estimasiSelesai && milestones.find((m) => m.kode === 'PRODUKSI' && m.isCurrent)"
          class="font-weight-medium text-teal-darken-2 mb-n1"
          style="font-size: 0.75rem"
        >
          Estimasi: <span class="font-weight-bold">{{ estimasiSelesai }}</span>
        </div>

        <div class="font-weight-bold text-brand mt-1" style="font-size: 0.85rem">
          {{ milestones.find((m) => m.isCurrent)?.title?.toUpperCase() || "DIPROSES" }}
        </div>
      </div>
    </v-toolbar>

    <v-container max-width="1200" class="mt-4 pb-10">
      <div v-if="isLoading" class="d-flex flex-column align-center justify-center py-16 mt-16">
        <v-progress-circular
          indeterminate
          color="#D32F2F"
          size="64"
          width="4"
        ></v-progress-circular>
        <div class="mt-4 text-subtitle-2 text-grey-darken-1">Memuat jejak pesanan...</div>
      </div>

      <div v-else>
        <v-card elevation="0" class="rounded-lg border mb-4">
          <v-card-text class="pa-8">
            <div class="d-flex w-100">
              <div
                v-for="(step, index) in milestones"
                :key="step.id"
                class="stepper-item"
                :class="{ active: step.isActive, current: step.isCurrent }"
              >
                <div class="step-line line-left" v-if="index !== 0"></div>
                <div class="step-line line-right" v-if="index !== milestones.length - 1"></div>

                <div class="step-icon-wrapper">
                  <div class="step-icon">
                    <v-icon size="28">{{ step.icon }}</v-icon>
                  </div>
                </div>

                <div class="step-title mt-3">{{ step.title }}</div>

                <div class="step-time" v-if="step.waktu">
                  {{ step.waktu }}
                  <div v-if="step.jenisProduksi" class="font-weight-bold mt-1 text-black">
                    {{ step.jenisProduksi }}
                  </div>
                </div>
                <div
                  class="step-time font-italic text-grey opacity-70"
                  v-else-if="step.skippedText"
                >
                  {{ step.skippedText }}
                </div>
                <div class="step-time" v-else>&nbsp;</div>
              </div>
            </div>
          </v-card-text>

          <v-divider></v-divider>

          <v-card-actions class="pa-4 bg-grey-lighten-5 justify-end">
            <div class="text-caption text-grey-darken-1 mr-auto">
              Terima kasih telah berbelanja di Kaosan!
            </div>
            <v-btn
              color="grey-darken-2"
              variant="outlined"
              class="text-caption px-6 mr-2 bg-white"
              @click="goBackToHome"
              >Kembali ke Beranda</v-btn
            >
            <v-btn
              color="#D32F2F"
              variant="flat"
              class="text-caption px-6 text-white font-weight-bold"
              @click="fetchTrackingData"
              >Muat Ulang</v-btn
            >
          </v-card-actions>
        </v-card>

        <div class="mail-border mb-4"></div>

        <v-row align="start">
          <v-col cols="12" md="5" class="order-last order-md-first mt-4 mt-md-0">
            <v-card elevation="0" class="rounded-lg border fill-height d-flex flex-column">
              <v-card-title
                class="pa-4 border-b bg-white d-flex justify-space-between align-center flex-wrap gap-2"
              >
                <span class="text-subtitle-1 font-weight-bold">Rincian Pesanan</span>

                <div v-if="orderSummary.sisaTagihan > 0" class="d-flex flex-column align-end">
                  <span
                    class="text-caption text-grey-darken-1 font-weight-medium"
                    style="line-height: 1"
                    >Belum Lunas</span
                  >
                  <span class="text-subtitle-2 font-weight-bold text-error"
                    >Sisa: {{ formatRupiah(orderSummary.sisaTagihan) }}</span
                  >
                </div>
                <v-chip
                  v-else
                  color="green"
                  size="small"
                  variant="flat"
                  class="font-weight-bold px-4"
                >
                  <v-icon start size="small">mdi-check-decagram</v-icon>
                  LUNAS
                </v-chip>
              </v-card-title>

              <v-card-text class="pa-0 flex-grow-1">
                <v-list lines="two" class="py-0">
                  <template v-for="(item, i) in orderItems" :key="i">
                    <v-list-item
                      class="px-5 py-4 transition-swing"
                      :class="item.isFullyScanned ? 'bg-green-lighten-5' : 'bg-white'"
                    >
                      <div class="d-flex w-100 align-start">
                        <v-img
                          v-if="!item.isJasaMurni"
                          :src="item.imageUrl"
                          width="65"
                          height="65"
                          class="rounded-lg border flex-shrink-0 position-relative"
                          :class="item.isFullyScanned ? 'bg-white' : 'bg-grey-lighten-4'"
                          cover
                        >
                          <template #placeholder>
                            <div class="d-flex align-center justify-center fill-height">
                              <v-icon color="grey-lighten-1" size="24">mdi-tshirt-crew</v-icon>
                            </div>
                          </template>
                          <template #error>
                            <div class="d-flex align-center justify-center fill-height">
                              <v-icon color="grey-lighten-1" size="24">mdi-tshirt-crew</v-icon>
                            </div>
                          </template>
                        </v-img>

                        <div class="ml-3 flex-grow-1">
                          <div
                            class="text-subtitle-2 font-weight-bold text-wrap"
                            :class="
                              item.isFullyScanned ? 'text-green-darken-3' : 'text-grey-darken-3'
                            "
                            style="line-height: 1.2"
                          >
                            {{ item.nama }}
                            <v-icon
                              v-if="item.isFullyScanned"
                              color="success"
                              size="x-small"
                              class="ml-1 mb-1"
                              >mdi-check-circle</v-icon
                            >
                          </div>

                          <div
                            v-if="item.nama_spk"
                            class="text-caption mt-1"
                            :class="
                              item.isFullyScanned ? 'text-green-darken-2' : 'text-grey-darken-1'
                            "
                            style="line-height: 1.1"
                          >
                            SPK: {{ item.nama_spk }}
                          </div>

                          <div
                            class="text-caption mt-1"
                            :class="
                              item.isFullyScanned ? 'text-green-darken-2' : 'text-grey-darken-1'
                            "
                          >
                            Ukuran: {{ item.ukuran || "-" }}
                          </div>

                          <div
                            class="text-caption mt-1"
                            v-if="item.sd_nomor && isStaff"
                            :class="
                              item.isFullyScanned ? 'text-green-darken-2' : 'text-grey-darken-1'
                            "
                          >
                            SO DTF:
                            <span
                              class="font-weight-medium"
                              :class="item.isFullyScanned ? 'text-green-darken-4' : 'text-black'"
                              >{{ item.sd_nomor }}</span
                            >
                          </div>
                        </div>

                        <div
                          class="text-right d-flex flex-column justify-start ml-2 position-relative"
                        >
                          <v-tooltip location="top" v-if="item.hasHoverDetail && item.breakdown">
                            <template v-slot:activator="{ props }">
                              <div
                                v-bind="props"
                                class="text-subtitle-2 font-weight-bold text-grey-darken-3 cursor-pointer d-flex flex-column align-end"
                                style="border-bottom: 1px dashed #bdbdbd"
                              >
                                <span style="font-size: 0.75rem">{{ item.qty }} pcs</span>
                                <span>{{ formatRupiah(item.subtotal) }}</span>
                              </div>
                            </template>

                            <div class="text-caption text-left pa-1">
                              <div class="font-weight-bold mb-1 border-b pb-1">Rincian Harga:</div>
                              <div
                                v-for="(b, bIdx) in item.breakdown"
                                :key="bIdx"
                                class="mb-1"
                                style="white-space: nowrap"
                              >
                                {{ b.qty }}x Size {{ b.ukuran }}:
                                {{ formatRupiah(b.harga - b.diskon) }}
                                <span v-if="b.diskon > 0" class="text-red-lighten-2"
                                  >(Disc {{ formatRupiah(b.diskon) }})</span
                                >
                              </div>
                            </div>
                          </v-tooltip>
                        </div>
                      </div>
                    </v-list-item>
                    <v-divider v-if="i !== orderItems.length - 1"></v-divider>
                  </template>
                </v-list>
              </v-card-text>

              <div class="bg-grey-lighten-5 pa-5 border-t mt-auto">
                <div class="d-flex justify-space-between mb-1 text-caption">
                  <span class="text-grey-darken-1">Subtotal Produk</span>
                  <span class="font-weight-medium text-black">{{
                    formatRupiah(orderSummary.totalBruto)
                  }}</span>
                </div>
                <div
                  class="d-flex justify-space-between mb-1 text-caption"
                  v-if="orderSummary.diskonFaktur > 0"
                >
                  <span class="text-grey-darken-1">Diskon Faktur</span>
                  <span class="text-error font-weight-medium"
                    >-{{ formatRupiah(orderSummary.diskonFaktur) }}</span
                  >
                </div>
                <div
                  class="d-flex justify-space-between mb-1 text-caption"
                  v-if="orderSummary.biayaKirim > 0"
                >
                  <span class="text-grey-darken-1">Biaya Pengiriman</span>
                  <span class="font-weight-medium text-black">{{
                    formatRupiah(orderSummary.biayaKirim)
                  }}</span>
                </div>
                <div
                  class="d-flex justify-space-between mb-1 text-caption"
                  v-if="orderSummary.ppn > 0"
                >
                  <span class="text-grey-darken-1">Pajak (PPN)</span>
                  <span class="font-weight-medium text-black">{{
                    formatRupiah(orderSummary.ppn)
                  }}</span>
                </div>

                <div
                  class="d-flex justify-space-between mb-1 text-caption mt-2"
                  v-if="orderSummary.totalDibayar > 0"
                >
                  <span class="text-grey-darken-1 font-weight-bold">Telah Dibayar</span>
                  <span class="text-green-darken-2 font-weight-bold"
                    >-{{ formatRupiah(orderSummary.totalDibayar) }}</span
                  >
                </div>

                <v-divider class="my-2 border-opacity-50"></v-divider>

                <div class="d-flex justify-space-between mt-2 align-center mb-1">
                  <span class="text-subtitle-1 font-weight-bold text-grey-darken-3"
                    >Total Pesanan</span
                  >
                  <span class="text-subtitle-1 font-weight-bold text-black">{{
                    formatRupiah(orderSummary.grandTotal)
                  }}</span>
                </div>

                <div
                  class="d-flex justify-space-between align-center mt-2"
                  v-if="orderSummary.sisaTagihan > 0"
                >
                  <span class="text-subtitle-1 font-weight-bold text-error">Sisa Tagihan</span>
                  <span class="text-h5 font-weight-black text-brand">{{
                    formatRupiah(orderSummary.sisaTagihan)
                  }}</span>
                </div>
                <div class="d-flex justify-space-between align-center mt-2" v-else>
                  <span class="text-subtitle-1 font-weight-bold text-green-darken-2"
                    >Status Pembayaran</span
                  >
                  <v-chip color="green" size="small" variant="flat" class="font-weight-bold px-4">
                    LUNAS
                  </v-chip>
                </div>
              </div>
            </v-card>
          </v-col>

          <v-col cols="12" md="7" class="order-first order-md-last">
            <v-card elevation="0" class="rounded-lg border fill-height">
              <v-card-title
                class="pa-4 border-b bg-white d-flex align-center justify-space-between flex-wrap gap-2"
              >
                <span class="text-subtitle-1 font-weight-bold">Rincian Pelacakan per Proses</span>
                <div class="d-flex align-center">
                  <span class="text-caption text-grey-darken-1 mr-2 d-none d-sm-inline"
                    >Pelanggan: {{ penerima }}</span
                  >
                  <v-chip
                    size="small"
                    variant="outlined"
                    color="grey-darken-2"
                    class="font-weight-bold"
                  >
                    {{ resiAwb }}
                  </v-chip>
                </div>
              </v-card-title>

              <v-card-text class="pa-6 bg-grey-lighten-5">
                <v-timeline
                  align="start"
                  side="end"
                  density="comfortable"
                  line-color="grey-lighten-2"
                  truncate-line="both"
                >
                  <v-timeline-item
                    v-for="(log, i) in logs"
                    :key="log.id"
                    :dot-color="isOngoing(log, i, true) ? 'warning' : 'success'"
                    :size="i === 0 ? 'small' : 'small'"
                    fill-dot
                  >
                    <template #opposite>
                      <div
                        class="text-caption text-right mt-1 d-none d-sm-block"
                        style="white-space: nowrap"
                        :class="
                          isOngoing(log, i, true)
                            ? 'text-warning font-weight-bold'
                            : 'text-grey-darken-1'
                        "
                      >
                        {{ log.waktu.split(" ")[0] || log.waktu }}<br />
                        {{ log.waktu.split(" ")[1] || "" }}
                      </div>
                    </template>

                    <div class="ml-2 mt-n1 pb-4">
                      <div
                        class="d-block d-sm-none text-caption font-weight-bold mb-1"
                        :class="isOngoing(log, i, true) ? 'text-warning' : 'text-grey-darken-1'"
                      >
                        {{ log.waktu }}
                      </div>

                      <div
                        class="text-subtitle-1 font-weight-bold mb-1"
                        :class="
                          isOngoing(log, i, true) ? 'text-warning-darken-2' : 'text-green-darken-3'
                        "
                      >
                        {{ log.status }}
                      </div>
                      <div
                        class="text-caption"
                        :class="
                          isOngoing(log, i, true)
                            ? 'font-weight-medium text-black'
                            : 'text-grey-darken-2'
                        "
                        style="white-space: pre-line; line-height: 1.4"
                      >
                        {{ log.deskripsi }}
                      </div>
                      <div
                        v-if="log.isSpkGroup && log.children && log.children.length > 0"
                        class="mt-3"
                      >
                        <v-btn
                          size="small"
                          variant="tonal"
                          color="brown-darken-2"
                          @click="toggleSpk(log.id)"
                          class="text-caption font-weight-bold"
                        >
                          {{
                            expandedSpks.includes(log.id)
                              ? "Tutup Detail SPK"
                              : "Lihat Detail Pabrik"
                          }}
                          <v-icon right class="ml-1">{{
                            expandedSpks.includes(log.id) ? "mdi-chevron-up" : "mdi-chevron-down"
                          }}</v-icon>
                        </v-btn>

                        <v-expand-transition>
                          <div
                            v-show="expandedSpks.includes(log.id)"
                            class="mt-4 pa-4 bg-white border rounded-lg shadow-sm"
                          >
                            <v-timeline
                              align="start"
                              side="end"
                              density="comfortable"
                              line-color="grey-lighten-3"
                              truncate-line="both"
                            >
                              <v-timeline-item
                                v-for="(child, childIdx) in log.children"
                                :key="child.id"
                                :dot-color="
                                  isOngoing(child, childIdx, false) ? 'warning' : 'success'
                                "
                                size="x-small"
                                fill-dot
                              >
                                <template #opposite>
                                  <div
                                    class="text-caption text-right mt-1 d-none d-sm-block"
                                    style="line-height: 1.2; white-space: nowrap"
                                    :class="
                                      isOngoing(child, childIdx, false)
                                        ? 'text-warning font-weight-bold'
                                        : 'text-grey-darken-1'
                                    "
                                  >
                                    {{ child.waktu.split(" ")[0] || child.waktu }}<br />
                                    {{ child.waktu.split(" ")[1] || "" }}
                                  </div>
                                </template>

                                <div class="ml-2 mt-n1 pb-2">
                                  <div
                                    class="d-block d-sm-none text-caption font-weight-bold mb-1"
                                    :class="
                                      isOngoing(child, childIdx, false)
                                        ? 'text-warning'
                                        : 'text-grey-darken-1'
                                    "
                                  >
                                    {{ child.waktu }}
                                  </div>

                                  <div
                                    class="text-body-2 font-weight-bold mb-1"
                                    :class="
                                      isOngoing(child, childIdx, false)
                                        ? 'text-warning-darken-2'
                                        : 'text-green-darken-3'
                                    "
                                  >
                                    {{ child.status }}
                                  </div>
                                  <div
                                    class="text-caption"
                                    :class="
                                      isOngoing(child, childIdx, false)
                                        ? 'text-black'
                                        : 'text-grey-darken-1'
                                    "
                                    style="white-space: pre-line; line-height: 1.4"
                                  >
                                    {{ child.deskripsi }}
                                  </div>
                                </div>
                              </v-timeline-item>
                            </v-timeline>
                          </div>
                        </v-expand-transition>
                      </div>
                    </div>
                  </v-timeline-item>
                </v-timeline>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </v-container>
  </div>
</template>

<style scoped>
.tracking-page {
  min-height: 100vh;
}

.text-brand {
  color: #d32f2f !important;
}

.border {
  border: 1px solid #e0e0e0;
}

.gap-2 {
  gap: 8px;
}

.mail-border {
  height: 3px;
  width: 100%;
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

/* --- CSS STEPPER HORIZONTAL MENDATAR (BRAND STYLE) --- */
.stepper-item {
  flex: 1;
  position: relative;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.step-line {
  position: absolute;
  top: 30px;
  height: 4px;
  background-color: #e0e0e0;
  width: 50%;
  z-index: 1;
  transition: background-color 0.3s ease;
}

.line-left {
  left: 0;
}

.line-right {
  right: 0;
}

.stepper-item.active .line-left {
  background-color: #d32f2f;
}
.stepper-item.active:not(.current) .line-right {
  background-color: #d32f2f;
}

.step-icon-wrapper {
  position: relative;
  z-index: 2;
  background-color: white;
  padding: 0 10px;
}

.step-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bdbdbd;
  background-color: white;
  transition: all 0.3s ease;
}

.step-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #757575;
  margin-top: 12px;
}

.step-time {
  font-size: 0.75rem;
  color: #9e9e9e;
  margin-top: 4px;
}

.stepper-item.active .step-icon {
  border-color: #d32f2f;
  color: #d32f2f;
}
.stepper-item.active .step-title {
  color: #d32f2f;
}

.stepper-item.current .step-icon {
  background-color: #d32f2f;
  border-color: #d32f2f;
  color: white;
  box-shadow: 0 4px 10px rgba(211, 47, 47, 0.3);
}
.stepper-item.current .step-title {
  color: #d32f2f;
  font-weight: bold;
}
.stepper-item.current .step-time {
  color: #d32f2f;
}

@media (max-width: 600px) {
  .step-icon {
    width: 40px;
    height: 40px;
  }
  .step-line {
    top: 20px;
  }
  .step-title {
    font-size: 0.7rem;
  }
  .step-time {
    font-size: 0.65rem;
  }
  .v-timeline-item__opposite {
    display: none;
  }
}
</style>
