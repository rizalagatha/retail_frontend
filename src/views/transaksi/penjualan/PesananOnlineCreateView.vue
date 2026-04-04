<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import api from "@/services/api";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import ProductSearchModal from "@/components/lookup/ProductSearchModal.vue";
import axios from "axios";

interface StockInfo {
  kode: string;
  ukuran: string;
  stok: number;
}

interface SelectedProduct {
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  stok?: number; // opsional (kadang modal bawa stok)
}

// --- INITIALIZATION ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const { markAsSaved } = useUnsavedChanges();
// Gunakan Menu ID yang sesuai untuk hak akses (misal 56 sesuai request sebelumnya)
const MENU_ID = "56";

// --- STATE ---
const isLoading = ref(false);
const isSaving = ref(false);
const scannedBarcode = ref("");

// Dropdown Data
const marketplaceList = ["SHOPEE", "TIKTOK SHOP"];
const sourceGudangList = ref<{ kode: string; nama: string }[]>([]);

const form = reactive({
  tanggal: format(new Date(), "yyyy-MM-dd"),
  mpNama: "SHOPEE",
  noPesanan: "",
  noResi: "",
  sourceGudang: authStore.user?.cabang === "KDC" ? "KDC" : authStore.user?.cabang || "K01",
  biayaPlatform: 0,
  customerKode: "",
});

interface OrderItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number;
  barcode: string;
  stokAsal: number; // Stok Real-time di Gudang Sumber
}

const items = ref<OrderItem[]>([]);
const dialogs = reactive({
  productSearch: false,
});

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// Computed
const totalQty = computed(() => items.value.reduce((sum, i) => sum + (Number(i.jumlah) || 0), 0));

// --- METHODS ---

// 1. Mapping Customer (Otomatis)
// Pastikan kode customer ini ada di database tcustomer Anda
const updateCustomerKode = () => {
  const map: Record<string, string> = {
    SHOPEE: "CUS-SHOPEE", // Sesuaikan dengan kode di DB Anda
    TOKOPEDIA: "CUS-TOKOPEDIA",
    "TIKTOK SHOP": "CUS-TIKTOK",
    LAZADA: "CUS-LAZADA",
    WEBSITE: "CUS-WEB",
  };
  // Default fallback ke SHOPEE jika tidak ketemu
  form.customerKode = map[form.mpNama] || "CUS-SHOPEE";
};

watch(() => form.mpNama, updateCustomerKode, { immediate: true });

// [UPDATE] Watcher: Update stok massal saat gudang diganti
watch(
  () => form.sourceGudang,
  async (newGudang) => {
    if (items.value.length === 0 || !newGudang) return;

    isLoading.value = true;

    try {
      // Siapkan payload: hanya kode dan ukuran
      const payloadItems = items.value.map((i) => ({ kode: i.kode, ukuran: i.ukuran }));

      // Panggil endpoint check-stock (Batch)
      const { data } = await api.post("/pesanan-online-form/check-stock", {
        gudang: newGudang,
        items: payloadItems,
      });

      // Update tabel lokal berdasarkan response
      data.forEach((stockInfo: StockInfo) => {
        const match = items.value.find(
          (i) => i.kode === stockInfo.kode && i.ukuran === stockInfo.ukuran
        );
        if (match) {
          match.stokAsal = stockInfo.stok;
        }
      });

      toast.success(`Stok diperbarui dari gudang ${newGudang}`);
    } catch (error) {
      console.error(error);
      toast.error("Gagal memperbarui info stok.");
    } finally {
      isLoading.value = false;
    }
  }
);

// 2. Handle Scan Barcode
const handleBarcodeScan = async () => {
  const barcode = scannedBarcode.value;
  if (!barcode) return;

  try {
    // Cari barang & stok di GUDANG SUMBER (Bukan KON)
    const res = await api.get(`/invoice-form/by-barcode/${barcode}`, {
      params: { gudang: form.sourceGudang },
    });

    const product = res.data;

    // Cek duplikat di tabel
    const existing = items.value.find(
      (i) => i.kode === product.kode && i.ukuran === product.ukuran
    );

    if (existing) {
      existing.jumlah++;
      toast.info(`Jumlah ${existing.nama} ditambahkan.`);
    } else {
      items.value.push({
        id: Date.now(),
        kode: product.kode,
        nama: product.nama,
        ukuran: product.ukuran,
        jumlah: 1,
        barcode: product.barcode,
        stokAsal: Number(product.stok || 0),
      });
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      toast.error(err.response?.data?.message ?? err.message);
    } else {
      toast.error("Barang tidak ditemukan atau tidak aktif.");
    }
  } finally {
    scannedBarcode.value = "";
  }
};

// 3. Handle Product Search Manual (Updated with Real-time Stock Check)
const handleProductSelected = async (selectedProducts: SelectedProduct[]): Promise<void> => {
  dialogs.productSearch = false;

  if (selectedProducts.length === 0) return;

  try {
    const payloadItems = selectedProducts.map((p) => ({ kode: p.kode, ukuran: p.ukuran }));

    const { data } = await api.post<StockInfo[]>("/pesanan-online-form/check-stock", {
      gudang: form.sourceGudang,
      items: payloadItems,
    });

    selectedProducts.forEach((p) => {
      // perhatikan: data adalah StockInfo[]
      const stockInfo = data.find((s: StockInfo) => s.kode === p.kode && s.ukuran === p.ukuran);
      const realStock = stockInfo ? Number(stockInfo.stok) : 0;

      const existing = items.value.find((i) => i.kode === p.kode && i.ukuran === p.ukuran);
      if (existing) {
        existing.jumlah++;
        existing.stokAsal = realStock;
      } else {
        items.value.push({
          id: Date.now() + Math.random(),
          kode: p.kode,
          nama: p.nama,
          ukuran: p.ukuran,
          jumlah: 1,
          barcode: p.barcode,
          stokAsal: realStock,
        });
      }
    });
  } catch {
    // Fallback pakai data modal saja
    selectedProducts.forEach((p) => {
      const existing = items.value.find((i) => i.kode === p.kode && i.ukuran === p.ukuran);
      if (existing) {
        existing.jumlah++;
      } else {
        items.value.push({
          id: Date.now() + Math.random(),
          kode: p.kode,
          nama: p.nama,
          ukuran: p.ukuran,
          jumlah: 1,
          barcode: p.barcode,
          stokAsal: Number(p.stok ?? 0),
        });
      }
    });
  }
};

const removeItem = (index: number) => {
  items.value.splice(index, 1);
};

const handleReset = () => {
  if (items.value.length > 0) {
    if (!confirm("Reset form? Data barang akan hilang.")) return;
  }
  form.noPesanan = "";
  form.noResi = "";
  form.biayaPlatform = 0;
  items.value = [];
};

// [BARU] Fetch Data Gudang dari Backend
const fetchGudangOptions = async () => {
  try {
    const { data } = await api.get("/pesanan-online-form/gudang-options");

    // Cek: Jika data ada isinya, pakai data API.
    // Jika kosong (array []), gunakan fallback manual.
    if (Array.isArray(data) && data.length > 0) {
      sourceGudangList.value = data;
    } else {
      throw new Error("Data gudang kosong"); // Lempar ke catch agar pakai fallback
    }

    // Set default value
    if (!form.sourceGudang && sourceGudangList.value.length > 0) {
      const userCabang = authStore.user?.cabang;
      const defaultGudang =
        sourceGudangList.value.find((g) => g.kode === userCabang) ||
        sourceGudangList.value.find((g) => g.kode === "K01") ||
        sourceGudangList.value[0];
      form.sourceGudang = defaultGudang.kode;
    }
  } catch {
    console.warn("Gagal load gudang dari API, menggunakan data lokal.");
    if (!form.sourceGudang) form.sourceGudang = "K01";
  }
};

// 4. Simpan Transaksi
const handleSave = async () => {
  // Validasi... (sama seperti kode Anda)
  if (!form.noPesanan) return toast.error("Nomor Pesanan wajib diisi.");
  if (items.value.length === 0) return toast.error("Belum ada barang.");

  // Cek Stok Minus (Warning)
  const minusItems = items.value.filter((i) => i.jumlah > i.stokAsal);
  let warningText = "";
  if (minusItems.length > 0) {
    warningText =
      "\n\n⚠️ PERINGATAN: Beberapa stok barang tidak mencukupi di gudang asal. Stok akan menjadi MINUS.";
  }

  // Tampilkan Konfirmasi
  showConfirmation(
    "Proses Pesanan",
    `Anda akan memproses pesanan ${form.mpNama} dengan ${items.value.length} item.${warningText}\n\nLanjutkan?`,
    executeSave // Panggil fungsi eksekusi sebenarnya
  );
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      sourceGudang: form.sourceGudang,
      targetGudang: "KON", // Hardcode Gudang Online
      tanggal: form.tanggal,
      mpInfo: {
        mpNama: form.mpNama,
        noPesanan: form.noPesanan,
        noResi: form.noResi,
        customerKode: form.customerKode,
        biayaPlatform: form.biayaPlatform,
      },
      items: items.value,
    };
    const res = await api.post("/pesanan-online-form/save", payload);
    toast.success(res.data.message);
    markAsSaved();
    router.push({ name: "PesananOnline" });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      toast.error(err.response?.data?.message ?? err.message ?? "Gagal memproses pesanan.");
    } else {
      toast.error("Gagal memproses pesanan.");
    }
  } finally {
    isSaving.value = false;
    dialogConfirm.show = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const handleClose = () => {
  if (items.value.length > 0 || form.noPesanan) {
    if (!confirm("Data belum disimpan. Yakin ingin keluar?")) return;
  }
  router.back();
};

// Watcher untuk Unsaved Changes
watch(
  [form, items],
  () => {
    if (form.noPesanan || items.value.length > 0) {
      // Trigger logic unsaved changes jika perlu
    }
  },
  { deep: true }
);

onMounted(async () => {
  if (!authStore.can(MENU_ID, "insert")) {
    toast.error("Akses ditolak.");
    router.back();
    return;
  }

  // [PANGGIL FUNGSI INI]
  await fetchGudangOptions();
});
</script>

<template>
  <PageLayout title="Input Pesanan Marketplace" icon="mdi-cart-arrow-down" desktop-mode>
    <template #header-actions>
      <v-btn
        color="success"
        size="small"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        :disabled="items.length === 0"
        @click="handleSave"
      >
        Proses Pesanan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" variant="text" @click="handleReset">
        Reset
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close" @click="handleClose"> Tutup </v-btn>
    </template>

    <div class="form-grid-container">
      <div class="left-column">
        <div class="desktop-form-section header-section d-flex flex-column h-100">
          <div class="text-subtitle-2 font-weight-bold mb-3 text-primary d-flex align-center">
            <v-icon size="small" class="mr-1">mdi-file-document-outline</v-icon>
            DATA PESANAN
          </div>

          <v-text-field
            label="Tanggal Transaksi"
            v-model="form.tanggal"
            type="date"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          />

          <v-select
            label="Marketplace"
            v-model="form.mpNama"
            :items="marketplaceList"
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-store"
            hide-details
            class="mb-3"
          />

          <v-text-field
            label="No. Pesanan / Order ID"
            v-model="form.noPesanan"
            prepend-inner-icon="mdi-clipboard-text"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
            placeholder="Paste No. Pesanan..."
            autocomplete="off"
          />

          <v-text-field
            label="No. Resi (AWB)"
            v-model="form.noResi"
            prepend-inner-icon="mdi-barcode"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
            placeholder="Scan/Ketik Resi..."
            autocomplete="off"
          />

          <v-text-field
            label="Biaya Layanan (Admin MP)"
            v-model.number="form.biayaPlatform"
            type="number"
            prefix="Rp"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          />

          <v-divider class="my-3 border-dashed" />

          <div class="text-subtitle-2 font-weight-bold mb-3 text-primary d-flex align-center">
            <v-icon size="small" class="mr-1">mdi-warehouse</v-icon>
            SUMBER BARANG
          </div>

          <v-select
            label="Ambil Barang Dari"
            v-model="form.sourceGudang"
            :items="sourceGudangList"
            item-title="nama"
            item-value="kode"
            variant="outlined"
            density="compact"
            hide-details
            bg-color="yellow-lighten-5"
            :loading="sourceGudangList.length === 0"
            no-data-text="Data gudang tidak ditemukan"
          />
          <div class="text-caption text-grey mt-2 lh-1">
            *Stok fisik akan dipotong dari gudang ini dan dipindahkan ke Online Shop untuk dijual.
          </div>
        </div>
      </div>

      <div class="right-column">
        <div class="d-flex align-center gap-2 mb-2 px-1">
          <v-text-field
            v-model="scannedBarcode"
            label="Scan Barcode Barang di Sini..."
            prepend-inner-icon="mdi-barcode-scan"
            variant="outlined"
            density="compact"
            hide-details
            class="flex-grow-1"
            @keydown.enter.prevent="handleBarcodeScan"
            autofocus
            placeholder="Tekan Enter setelah scan"
          />
          <v-btn
            color="secondary"
            variant="tonal"
            height="40"
            prepend-icon="mdi-magnify"
            @click="dialogs.productSearch = true"
          >
            Cari Barang
          </v-btn>
        </div>

        <div class="table-wrapper flex-grow-1 border rounded bg-white elevation-1">
          <v-table density="compact" fixed-header height="100%" hover>
            <thead>
              <tr>
                <th class="text-left bg-blue-grey-lighten-5 font-weight-bold">Kode Barang</th>
                <th class="text-left bg-blue-grey-lighten-5 font-weight-bold">Nama Barang</th>
                <th class="text-center bg-blue-grey-lighten-5 font-weight-bold">Ukuran</th>
                <th class="text-right bg-blue-grey-lighten-5 font-weight-bold">Stok Asal</th>
                <th
                  class="text-center bg-blue-grey-lighten-5 font-weight-bold"
                  style="width: 100px"
                >
                  Qty
                </th>
                <th class="text-center bg-blue-grey-lighten-5 font-weight-bold" style="width: 50px">
                  #
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in items" :key="item.id">
                <td class="text-caption font-weight-medium">{{ item.kode }}</td>
                <td class="py-1">
                  <div class="text-body-2 text-truncate" style="max-width: 300px">
                    {{ item.nama }}
                  </div>
                  <div class="text-caption text-grey">{{ item.barcode }}</div>
                </td>
                <td class="text-center">{{ item.ukuran }}</td>
                <td class="text-right">
                  <span :class="{ 'text-red font-weight-bold': item.stokAsal <= 0 }">
                    {{ item.stokAsal }}
                  </span>
                </td>
                <td class="text-center pa-1">
                  <v-text-field
                    v-model.number="item.jumlah"
                    type="number"
                    min="1"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="centered-input"
                  />
                </td>
                <td class="text-center">
                  <v-btn
                    icon="mdi-delete"
                    size="x-small"
                    color="error"
                    variant="text"
                    @click="removeItem(idx)"
                    tabindex="-1"
                  />
                </td>
              </tr>
              <tr v-if="items.length === 0">
                <td colspan="6" class="text-center text-grey py-10">
                  <v-icon size="40" class="mb-2 text-grey-lighten-2">mdi-basket-outline</v-icon>
                  <div>Belum ada barang. Scan barcode untuk memulai.</div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <div
          class="mt-2 pa-3 bg-blue-grey-lighten-5 rounded border d-flex justify-space-between align-center"
        >
          <div class="text-caption text-grey-darken-2">
            Pastikan stok di gudang asal mencukupi sebelum memproses pesanan.
          </div>
          <div class="text-h6 font-weight-bold text-primary">Total Qty: {{ totalQty }} Pcs</div>
        </div>
      </div>
    </div>

    <ProductSearchModal
      v-if="dialogs.productSearch"
      :gudang="form.sourceGudang"
      category="ALL"
      :multi="true"
      source="invoice-cash"
      @close="dialogs.productSearch = false"
      @products-selected="handleProductSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400">
      <v-card>
        <v-card-title class="text-h6">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text style="white-space: pre-wrap">{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="dialogConfirm.onConfirm">Ya, Proses</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Grid Kiri-Kanan */
.form-grid-container {
  display: flex;
  gap: 16px;
  height: calc(100vh - 64px - 48px);
  overflow: hidden;
}

.left-column {
  flex: 0 0 320px;
  /* Lebar fixed panel kiri */
  display: flex;
  flex-direction: column;
}

.right-column {
  flex: 1;
  /* Sisa lebar panel kanan */
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header-section {
  border: 1px solid #e0e0e0;
  padding: 16px;
  border-radius: 8px;
  background-color: #fff;
  /* height: 100%; */
  /* Optional */
}

.table-wrapper {
  overflow-y: auto;
}

/* CSS Helper untuk input qty rata tengah */
:deep(.centered-input input) {
  text-align: center;
}

.lh-1 {
  line-height: 1.4;
}

.border-dashed {
  border-style: dashed;
}
</style>
