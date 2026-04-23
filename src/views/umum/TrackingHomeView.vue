<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";

// Import logo secara aman untuk Vite/Webpack
import LogoKaosan from "@/assets/logo.png";

const router = useRouter();

const searchInput = ref("");
const isLoading = ref(false);
const errorMessage = ref("");

const isPromoDialogVisible = ref(false);
const selectedPromo = ref<PromoItem | null>(null);

// --- TIPE DATA ---
interface SearchItem {
  title: string;
  value: string;
}

interface SoData {
  nomorSo: string;
  penerima: string;
  items: SearchItem[];
}

interface PromoItem {
  pro_jenis: string;
  pro_judul: string;
  pro_diskon: number;
  pro_disrp: number;
  pro_rpvoucher: number;
  pro_totalqty: number;
  pro_keterangan: string;
  pro_tanggal2: string;
}

// State hasil pencarian
const isFound = ref(false);
const soData = ref<SoData | null>(null);
const selectedItem = ref<string | null>(null);

// State Promo
const activePromos = ref<PromoItem[]>([]);
const isLoadingPromo = ref(true);

const fetchPromos = async () => {
  try {
    isLoadingPromo.value = true;
    // Panggil endpoint public yang baru kita buat
    const response = await api.get(`/so/public/active-promos?cabang=K01`);
    activePromos.value = response.data;
  } catch (error) {
    console.error("Gagal memuat promo:", error);
  } finally {
    isLoadingPromo.value = false;
  }
};

// --- 2. FUNGSI DECODE UNTUK BACA RESI ---
const decodeResi = (resi: string) => {
  try {
    const raw = resi.trim().toUpperCase();

    // Cek apakah dia pakai awalan KSN (Resi Kaosan)
    if (!raw.startsWith("KSN")) return raw;

    // Pisahkan: KSN (3 huruf) + Cabang (3 huruf) + Sisanya angka rahasia
    const cabang = raw.substring(3, 6); // "K01"
    const encodedNum = raw.substring(6); // "30FRTS"

    // Kembalikan dari Alfanumerik ke angka
    const secretVal = parseInt(encodedNum, 36);
    if (isNaN(secretVal)) return raw;

    // Balikkan rumus obfuscation tadi
    const origNum = (secretVal - 456789) / 7;

    // Pastikan hasilnya bulat sempurna
    if (!Number.isInteger(origNum)) return raw;

    let numStr = origNum.toString();
    // Jaga-jaga kalau kurang dari 8 digit (misal: 26040001)
    if (numStr.length < 8) {
      numStr = numStr.padStart(8, "0");
    }

    // Pecah jadi: 2604 . 0001
    const part1 = numStr.substring(0, 4);
    const part2 = numStr.substring(4);

    // Rangkai kembali jadi nomor SO asli
    return `${cabang}.SO.${part1}.${part2}`;
  } catch (e) {
    // Kalau gagal decode, biarkan backend yang pusing nolak
    return resi;
  }
};

const cariPesanan = async () => {
  if (!searchInput.value) return;

  isLoading.value = true;
  errorMessage.value = "";
  isFound.value = false;
  selectedItem.value = null;

  try {
    // 1. Ambil ketikan Customer (Contoh: KSNK0130FRTS)
    const rawInput = searchInput.value;

    // 2. Sulap kembali jadi SO Asli (K01.SO.2604.0001)
    const realSoNumber = decodeResi(rawInput);

    // 3. Tembak ke API menggunakan SO Asli
    const response = await api.get(`/so/search-track/${realSoNumber}`);
    soData.value = response.data;

    if (soData.value) {
      soData.value.items.unshift({
        title: "🔍 Lacak Semua (Keseluruhan)",
        value: "UMUM",
      });
    }

    isFound.value = true;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    errorMessage.value = err.response?.data?.message || "Pesanan tidak ditemukan.";
  } finally {
    isLoading.value = false;
  }
};

const encodeResi = (nomorSo: string) => {
  try {
    const parts = nomorSo.split(".SO.");
    if (parts.length !== 2) return nomorSo;

    const cabang = parts[0];
    const numPart = parts[1].replace(".", "");
    const num = Number(numPart);
    if (isNaN(num)) return nomorSo;

    const secretVal = num * 7 + 456789;
    const encodedNum = secretVal.toString(36).toUpperCase();
    return `KSN${cabang}${encodedNum}`;
  } catch (e) {
    return nomorSo;
  }
};

const lanjutLacak = () => {
  const target = selectedItem.value || "UMUM";

  if (soData.value) {
    // ENCODE nomor SO nya sebelum dilempar ke URL
    const secureNomor = encodeResi(soData.value.nomorSo);

    router.push({
      path: `/transaksi/penjualan/surat-pesanan/track/${secureNomor}`,
      query: { target: target },
    });
  }
};

const klaimPromo = (promo: PromoItem) => {
  selectedPromo.value = promo;
  isPromoDialogVisible.value = true;
};

const formatPromoValue = (promo: PromoItem): string => {
  if (promo.pro_diskon > 0) return `Diskon ${promo.pro_diskon}%`;
  if (promo.pro_disrp > 0) return `Potongan ${formatRupiah(promo.pro_disrp)}`;
  if (promo.pro_rpvoucher > 0) return `Voucher ${formatRupiah(promo.pro_rpvoucher)}`;
  if (promo.pro_totalqty > 0) return `Beli ${promo.pro_totalqty} Lebih Hemat`;
  return "Harga Spesial";
};

onMounted(() => {
  fetchPromos();
});
</script>

<template>
  <div class="tracking-layout bg-grey-lighten-4">
    <header
      class="bg-white elevation-1 px-4 px-md-10 py-3 d-flex align-center position-relative z-10"
    >
      <img :src="LogoKaosan" height="40" alt="Logo Kaosan" class="cursor-pointer" />
      <v-spacer></v-spacer>
      <div class="d-none d-sm-flex gap-4 text-body-2 font-weight-medium text-grey-darken-3">
        <a href="#" class="text-decoration-none text-grey-darken-3">Beranda</a>
        <a href="#" class="text-decoration-none text-grey-darken-3">Layanan</a>
        <a href="#" class="text-decoration-none text-grey-darken-3">Pusat Bantuan</a>
      </div>
    </header>

    <div class="hero-banner d-flex flex-column align-center justify-center text-center px-4">
      <h1
        class="text-h4 text-md-h3 font-weight-black text-white mb-2"
        style="text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2)"
      >
        Lacak Pesanan Kaosan
      </h1>
      <p class="text-subtitle-1 text-md-h6 text-white opacity-90 font-weight-regular">
        Pantau status produksi dan pengiriman pesanan Anda dengan mudah
      </p>
    </div>

    <v-container class="search-container mb-10">
      <v-card class="rounded-lg elevation-4 pa-2 pa-sm-4 bg-white mb-8" max-width="800" mx-auto>
        <div class="d-flex flex-column flex-sm-row gap-2 align-start">
          <v-text-field
            v-model="searchInput"
            placeholder="Masukkan Nomor Resi Pesanan (Contoh: KSNK...)"
            variant="outlined"
            color="#D32F2F"
            bg-color="white"
            hide-details="auto"
            class="flex-grow-1 w-100 search-field-red"
            density="comfortable"
            prepend-inner-icon="mdi-magnify"
            :error-messages="errorMessage"
            @keyup.enter="cariPesanan"
          ></v-text-field>

          <v-btn
            color="#D32F2F"
            height="48"
            class="text-white px-8 font-weight-bold text-subtitle-1 w-100 w-sm-auto mt-2 mt-sm-0"
            :loading="isLoading"
            @click="cariPesanan"
          >
            Lacak
          </v-btn>
        </div>

        <v-expand-transition>
          <div v-if="isFound && soData" class="mt-6 border-t pt-6 px-2">
            <div class="d-flex justify-space-between align-center mb-4 flex-wrap gap-2">
              <div>
                <div class="text-caption text-grey-darken-1">Pelanggan</div>
                <div class="text-h6 font-weight-bold text-grey-darken-3" style="line-height: 1.2">
                  {{ soData.penerima }}
                </div>
              </div>
              <v-chip color="success" variant="flat" class="font-weight-bold">
                <v-icon start size="small">mdi-check-circle</v-icon>
                Pesanan Ditemukan
              </v-chip>
            </div>

            <p class="text-subtitle-2 font-weight-bold text-grey-darken-2 mb-2">
              Pilih Barang yang Ingin Dilacak Spesifik:
            </p>

            <v-select
              v-model="selectedItem"
              :items="soData.items"
              item-title="title"
              item-value="value"
              placeholder="-- Pilih Barang --"
              variant="outlined"
              density="comfortable"
              color="#D32F2F"
              hide-details="auto"
              class="mb-4 search-field-red"
            ></v-select>

            <v-btn
              block
              size="large"
              color="#D32F2F"
              class="font-weight-bold text-white mt-2"
              :disabled="!selectedItem"
              @click="lanjutLacak"
            >
              Lihat Rincian Proses
              <v-icon right class="ml-2">mdi-arrow-right</v-icon>
            </v-btn>
          </div>
        </v-expand-transition>
      </v-card>

      <v-expand-transition>
        <div
          v-if="!isLoadingPromo && activePromos.length > 0"
          class="promo-section mb-10"
          style="max-width: 900px; margin: 0 auto"
        >
          <div class="d-flex align-center mb-4 px-2">
            <v-icon color="#D32F2F" size="28" class="mr-2">mdi-ticket-percent</v-icon>
            <h2 class="text-h6 font-weight-bold text-grey-darken-3 mb-0">
              Promo Spesial Buat Kamu!
            </h2>
          </div>

          <v-row>
            <v-col cols="12" sm="6" md="4" v-for="(promo, index) in activePromos" :key="index">
              <v-card
                elevation="2"
                class="promo-card rounded-xl h-100 d-flex flex-column position-relative overflow-hidden bg-white"
              >
                <div
                  class="bg-brand py-2 px-4 text-white text-caption font-weight-bold text-uppercase d-flex justify-space-between"
                >
                  <span>{{ promo.pro_jenis === "VOUCHER" ? "Voucher" : "Diskon Spesial" }}</span>
                  <v-icon size="small" color="white">mdi-star-four-points</v-icon>
                </div>

                <v-card-text class="pa-4 flex-grow-1 d-flex flex-column">
                  <div
                    class="text-subtitle-1 font-weight-black text-grey-darken-4 mb-1"
                    style="line-height: 1.2"
                  >
                    {{ promo.pro_judul }}
                  </div>

                  <div class="text-h5 font-weight-black text-brand mb-2">
                    <template v-if="promo.pro_diskon > 0">
                      Diskon {{ promo.pro_diskon }}%
                    </template>
                    <template v-else-if="promo.pro_disrp > 0">
                      Potongan {{ formatRupiah(promo.pro_disrp) }}
                    </template>
                    <template v-else-if="promo.pro_rpvoucher > 0">
                      Voucher {{ formatRupiah(promo.pro_rpvoucher) }}
                    </template>
                    <template v-else-if="promo.pro_totalqty > 0">
                      Beli {{ promo.pro_totalqty }} Lebih Hemat
                    </template>
                    <template v-else> Harga Spesial </template>
                  </div>

                  <div class="text-caption text-grey-darken-1 mb-3">
                    {{ promo.pro_keterangan || "Berlaku untuk pemesanan di Kaosan." }}
                  </div>

                  <v-spacer></v-spacer>

                  <div
                    class="mt-auto pt-3 border-t border-dashed d-flex align-center justify-space-between"
                  >
                    <div class="d-flex flex-column">
                      <span class="text-grey-darken-1" style="font-size: 0.65rem"
                        >Berlaku hingga:</span
                      >
                      <span class="text-caption font-weight-bold text-grey-darken-3">{{
                        promo.pro_tanggal2.split("T")[0]
                      }}</span>
                    </div>
                    <v-btn
                      size="small"
                      color="#D32F2F"
                      variant="flat"
                      class="text-white font-weight-bold text-none rounded-pill px-5"
                      @click="klaimPromo(promo)"
                    >
                      Klaim
                    </v-btn>
                  </div>
                </v-card-text>

                <div class="coupon-cutout left"></div>
                <div class="coupon-cutout right"></div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-expand-transition>

      <v-row justify="center" style="max-width: 900px; margin: 0 auto">
        <v-col cols="12" sm="4">
          <v-card
            elevation="0"
            class="border rounded-lg pa-4 d-flex align-center h-100 bg-white card-hover"
          >
            <v-icon size="40" color="#D32F2F" class="mr-4">mdi-store-search-outline</v-icon>
            <div>
              <div class="font-weight-bold text-subtitle-2">Cek Stok Store</div>
              <div class="text-caption text-grey-darken-1">Lihat ketersediaan barang ready</div>
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card
            elevation="0"
            class="border rounded-lg pa-4 d-flex align-center h-100 bg-white card-hover"
          >
            <v-icon size="40" color="#D32F2F" class="mr-4">mdi-truck-fast-outline</v-icon>
            <div>
              <div class="font-weight-bold text-subtitle-2">Estimasi Pengiriman</div>
              <div class="text-caption text-grey-darken-1">Cek waktu tiba paket Anda</div>
            </div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card
            elevation="0"
            class="border rounded-lg pa-4 d-flex align-center h-100 bg-white card-hover"
          >
            <v-icon size="40" color="#D32F2F" class="mr-4">mdi-help-circle-outline</v-icon>
            <div>
              <div class="font-weight-bold text-subtitle-2">Pusat Bantuan</div>
              <div class="text-caption text-grey-darken-1">Hubungi CS Kaosan 24/7</div>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <v-dialog v-model="isPromoDialogVisible" max-width="400px" :scrim="true">
      <v-card v-if="selectedPromo" rounded="xl" class="overflow-hidden">
        <!-- Header Merah -->
        <div
          style="
            background: linear-gradient(135deg, #d32f2f 0%, #ef5350 100%);
            padding: 28px 24px 20px;
            text-align: center;
            position: relative;
          "
        >
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            style="position: absolute; top: 8px; right: 8px; color: rgba(255, 255, 255, 0.8)"
            @click="isPromoDialogVisible = false"
          ></v-btn>

          <div
            style="
              width: 64px;
              height: 64px;
              border-radius: 50%;
              background: rgba(255, 255, 255, 0.2);
              border: 2px solid rgba(255, 255, 255, 0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 12px;
            "
          >
            <v-icon size="32" color="white">mdi-ticket-percent</v-icon>
          </div>
          <div class="text-h6 font-weight-bold text-white mb-1">Promo ini untukmu!</div>
          <div class="text-caption text-white opacity-80">Kunjungi store terdekat untuk klaim</div>
        </div>

        <!-- Strip Warna-warni -->
        <div
          style="
            height: 5px;
            background: repeating-linear-gradient(
              90deg,
              #ffd700 0px,
              #ffd700 12px,
              #ff6b6b 12px,
              #ff6b6b 24px,
              #4ecdc4 24px,
              #4ecdc4 36px
            );
          "
        ></div>

        <v-card-text class="pa-5">
          <!-- Badge Terbatas -->
          <div class="text-center mb-4">
            <v-chip color="orange-lighten-4" size="small" class="font-weight-medium">
              <v-icon start size="10" color="orange-darken-3">mdi-circle</v-icon>
              <span class="text-orange-darken-3">Terbatas — segera klaim sebelum habis</span>
            </v-chip>
          </div>

          <!-- Info Promo -->
          <v-card variant="tonal" color="red-lighten-5" rounded="lg" class="mb-4 pa-3">
            <div class="text-subtitle-2 font-weight-bold text-grey-darken-3 mb-1">
              {{ selectedPromo.pro_judul }}
            </div>
            <div class="text-h6 font-weight-black" style="color: #d32f2f">
              {{ formatPromoValue(selectedPromo) }}
            </div>
            <div class="text-caption text-grey-darken-1 mt-1">
              Berlaku hingga: {{ selectedPromo.pro_tanggal2.split("T")[0] }}
            </div>
          </v-card>

          <!-- Card Store -->
          <v-card variant="outlined" rounded="lg" class="mb-5 pa-3">
            <div class="d-flex align-center gap-3">
              <div
                style="
                  width: 44px;
                  height: 44px;
                  border-radius: 10px;
                  background: #ffebee;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  flex-shrink: 0;
                "
              >
                <v-icon color="#D32F2F">mdi-store</v-icon>
              </div>
              <div>
                <div class="text-subtitle-2 font-weight-bold">Store Kaosan Terdekat</div>
                <div class="text-caption text-grey-darken-1">
                  Tunjukkan halaman ini ke kasir saat tiba
                </div>
              </div>
            </div>
          </v-card>

          <!-- 3 Langkah -->
          <div class="d-flex justify-space-around mb-5">
            <div
              v-for="(step, i) in [
                { icon: 'mdi-store-marker', label: 'Kunjungi store' },
                { icon: 'mdi-card-account-details', label: 'Tunjukkan ke kasir' },
                { icon: 'mdi-tag-heart', label: 'Nikmati diskonnya' },
              ]"
              :key="i"
              class="text-center"
              style="flex: 1"
            >
              <div
                style="
                  width: 36px;
                  height: 36px;
                  border-radius: 50%;
                  background: #ffebee;
                  border: 1.5px solid #ef9e9e;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0 auto 6px;
                "
              >
                <span class="text-caption font-weight-bold" style="color: #d32f2f">{{
                  i + 1
                }}</span>
              </div>
              <div class="text-caption text-grey-darken-1" style="line-height: 1.3">
                {{ step.label }}
              </div>
            </div>
          </div>

          <!-- Tombol Utama -->
          <v-btn
            block
            size="large"
            color="#D32F2F"
            class="text-white font-weight-bold mb-2"
            rounded="lg"
            prepend-icon="mdi-map-marker"
          >
            Cari Store Terdekat
          </v-btn>
          <v-btn
            block
            variant="text"
            size="small"
            class="text-grey"
            @click="isPromoDialogVisible = false"
          >
            Nanti saja
          </v-btn>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.tracking-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.z-10 {
  z-index: 10;
}

.gap-2 {
  gap: 8px;
}
.gap-4 {
  gap: 16px;
}

/* [PERBAIKAN] Gradient disesuaikan dengan merah pekat #D32F2F dan #EF5350 */
.bg-brand {
  background: linear-gradient(135deg, #d32f2f 0%, #ef5350 100%);
}

.text-brand {
  color: #d32f2f !important;
}

.border-dashed {
  border-top-style: dashed !important;
}

/* HERO BANNER */
.hero-banner {
  height: 320px;
  background: linear-gradient(135deg, #d32f2f 0%, #ef5350 100%);
  position: relative;
}

/* Bikin kotak search naik menindih banner (Overlap) */
.search-container {
  margin-top: -60px;
  position: relative;
  z-index: 5;
  max-width: 900px;
}

/* [PERBAIKAN] Border saat field difokuskan ikut warna merah */
.search-field-red :deep(.v-field--focused) {
  border-color: #d32f2f !important;
}

/* --- KUPON PROMO STYLE --- */
.promo-card {
  transition: all 0.3s ease;
  border: 1px solid #ffebee !important; /* warna merah sangat muda */
}
.promo-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(211, 47, 47, 0.15) !important;
  border-color: #d32f2f !important;
}

/* Bikin efek bolong di pinggiran kupon */
.coupon-cutout {
  position: absolute;
  width: 20px;
  height: 20px;
  background-color: #f5f5f5; /* sama dengan warna background grey-lighten-4 */
  border-radius: 50%;
  bottom: 40px; /* Sejajar dengan garis putus-putus */
}
.coupon-cutout.left {
  left: -10px;
  border-right: 1px solid #ffebee;
}
.coupon-cutout.right {
  right: -10px;
  border-left: 1px solid #ffebee;
}

.card-hover {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

/* Responsif untuk layar HP */
@media (max-width: 600px) {
  .hero-banner {
    height: 250px;
  }
  .search-container {
    margin-top: -40px;
  }
}
</style>
