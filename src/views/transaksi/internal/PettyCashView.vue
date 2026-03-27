<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, subDays, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import AppDataTable from "@/components/AppDataTable.vue";
import type { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

// --- Interfaces ---
interface PettyCashItem {
  idrec: string;
  nomor_utama: string;
  pck_nomor?: string;
  bkm_nomor?: string;
  tanggal: string;
  cabang: string;
  namaCabang: string;
  modal: number;
  terpakai: number;
  receive_nominal?: number;
  saldo: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  keterangan: string;
  userCreate: string;
  jumlah_nota: number;
}

interface PettyCashDetail {
  pc_nomor: string; // <-- Tambahkan nomor PC di detail untuk memudahkan preview nota
  pcd_idrec: string;
  pcd_tanggal: string;
  pcd_pcv: number | string;
  pcd_kategori: string;
  pcd_keterangan: string;
  pcd_nominal: number;
  pcd_file?: string;
}
const router = useRouter();

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "58";

// --- State ---
const filters = reactive({
  startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});

const cabangList = ref<{ kode: string; nama: string }[]>([]);
const isKdc = computed(() => authStore.user?.cabang === "KDC");

const loading = ref(true);
const masterData = ref<PettyCashItem[]>([]);
const selected = ref<PettyCashItem[]>([]);
const dialogConfirm = reactive({ show: false, title: "", text: "", onConfirm: () => {} });
const dialogReceive = reactive({
  show: false,
  pck_nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"), // Default hari ini
  nominal: 0,
  isProcessing: false,
});

// --- STATE UNTUK EXPAND DETAIL ---
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, PettyCashDetail[]>>({});
const dialogPreview = ref(false);
const previewImageSrc = ref("");

const getStaticBaseUrl = () => {
  // Ganti let menjadi const
  const apiUrl = (api.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || "") as string;
  return apiUrl.replace(/\/api\/?$/, "");
};

const headers = ref([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "No. Pengajuan / Dokumen", key: "nomor_utama", width: 220, fixed: true }, // Ubah judul
  { title: "Tgl Pengajuan", key: "tanggal", width: 120 },
  { title: "Cabang", key: "cabang", width: 150 },
  { title: "Jml Nota", key: "jumlah_nota", align: "center", width: 100 }, // Kolom baru
  { title: "Keterangan Klaim", key: "keterangan", width: 300 },
  { title: "Total Terpakai", key: "terpakai", align: "end", width: 130 },
  { title: "Sisa Saldo", key: "saldo", align: "end", width: 130 },
  { title: "Nilai Klaim (Masuk)", key: "receive_nominal", align: "end", width: 140 },
  { title: "Status", key: "status", align: "center", width: 130 },
  { title: "User", key: "userCreate", width: 100 },
]);

// --- Methods ---
const fetchCabangList = async () => {
  if (!isKdc.value) return;
  try {
    const response = await api.get("/minta-barang/lookup/cabang");
    cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...response.data];
  } catch (error) {
    console.error("Gagal memuat cabang", error);
  }
};

const fetchMasterData = async () => {
  loading.value = true;
  selected.value = [];
  expanded.value = []; // Reset expand saat refresh
  try {
    const response = await api.get("/petty-cash", { params: filters });
    masterData.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data Petty Cash.");
  } finally {
    loading.value = false;
  }
};

// --- FUNGSI MENGAMBIL DETAIL SAAT DIKLIK PANAH ---
const loadDetails = async (newlyExpandedItems: PettyCashItem[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.nomor_utama] && !loadingDetails.value.has(item.nomor_utama)
  );
  if (!itemToLoad) return;

  const kunciLoad = itemToLoad.nomor_utama;
  loadingDetails.value.add(kunciLoad);

  try {
    // Jika item adalah Pengajuan (KPC), pakai API rincian klaim
    if (itemToLoad.pck_nomor) {
      // Asumsi API ini memanggil "getDetailKlaimFinance" dari backend
      const response = await api.get(`/petty-cash-form/klaim-detail/${itemToLoad.pck_nomor}`);
      // Sesuaikan mapping data dengan struktur tabel detail Anda
      details.value[kunciLoad] = response.data.map((d) => ({
        pcd_tanggal: d.pcd_tanggal,
        pcd_pcv: d.pcd_pcv,
        pc_nomor: d.pc_nomor, // <-- Tambahkan properti ini
        pcd_kategori: d.pcd_kategori, // <-- Kembalikan jadi murni kategori saja
        pcd_keterangan: d.pcd_keterangan,
        pcd_nominal: d.pcd_nominal,
        pcd_file: d.pcd_file,
      }));
    } else {
      // Jika item masih DRAFT (PC biasa), pakai API detail nota biasa
      const response = await api.get(`/petty-cash-form/${kunciLoad}`);
      details.value[kunciLoad] = response.data.details;
    }
  } catch (error) {
    toast.error(`Gagal memuat detail nota untuk ${kunciLoad}`, error);
  } finally {
    loadingDetails.value.delete(kunciLoad);
  }
};

// --- Actions ---
const handleNew = () => router.push({ path: "/transaksi/internal/petty-cash/create" });

const handleEdit = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];
  if (item.status !== "DRAFT" && item.status !== "REJECTED") {
    toast.warning("Hanya dokumen DRAFT atau REJECTED yang bisa diubah.");
    return;
  }
  router.push({ path: `/transaksi/internal/petty-cash/edit/${item.nomor_utama}` });
};

const handleDelete = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];
  if (item.status !== "DRAFT") {
    return toast.warning("Hanya dokumen status DRAFT yang bisa dihapus.");
  }

  dialogConfirm.title = "Konfirmasi Hapus";
  dialogConfirm.text = `Yakin menghapus laporan Petty Cash ${item.nomor_utama}? Semua data nota akan ikut terhapus.`;
  dialogConfirm.onConfirm = async () => {
    try {
      await api.delete(`/petty-cash/${item.nomor_utama}`);
      toast.success("Petty Cash berhasil dihapus.");
      fetchMasterData();
    } catch (error) {
      toast.error("Gagal menghapus data.", error);
    }
  };
  dialogConfirm.show = true;
};

const handleExport = () => {
  if (masterData.value.length === 0) {
    toast.warning("Tidak ada data untuk diexport.");
    return;
  }

  let csvContent = "Nomor Dokumen,Tanggal,Cabang,Keterangan,Modal PC,Terpakai,Saldo,Status,User\n";
  masterData.value.forEach((item) => {
    const tanggal = format(parseISO(item.tanggal), "dd/MM/yyyy");
    const cabangStr = `"${item.cabang} - ${item.namaCabang}"`;
    const keteranganStr = `"${(item.keterangan || "").replace(/"/g, '""')}"`;

    csvContent += `${item.nomor_utama},${tanggal},${cabangStr},${keteranganStr},${item.modal},${item.terpakai},${item.saldo},${item.status},${item.userCreate}\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `Export_PettyCash_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast.success("Data berhasil diexport ke CSV.");
};

// const handleSubmit = () => {
//   if (selected.value.length !== 1) return;
//   const item = selected.value[0];

//   // Validasi: Hanya DRAFT atau REJECTED yang boleh disubmit
//   if (item.status !== "DRAFT" && item.status !== "REJECTED") {
//     return toast.warning(
//       "Hanya dokumen berstatus DRAFT atau REJECTED yang bisa dikirim ke Finance."
//     );
//   }

//   dialogConfirm.title = "Kirim ke Finance?";
//   dialogConfirm.text = `Yakin ingin mengirim laporan Petty Cash ${item.nomor} ke Pusat? Setelah dikirim, dokumen ini akan terkunci dan tidak bisa diedit lagi oleh Toko.`;
//   dialogConfirm.onConfirm = async () => {
//     try {
//       await api.put(`/petty-cash/submit/${item.nomor}`);
//       toast.success("Laporan berhasil dikirim ke Finance.");
//       fetchMasterData(); // Refresh tabel
//     } catch (error) {
//       toast.error("Gagal mengirim laporan ke Finance.", error);
//     }
//   };
//   dialogConfirm.show = true;
// };

const showPreview = (fileName: string) => {
  if (!fileName) return;

  const staticBaseUrl = getStaticBaseUrl();
  const fileUrl = `${staticBaseUrl}/uploads/pettycash/${fileName}`;
  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    // Jika PDF, buka di tab baru
    window.open(fileUrl, "_blank");
  } else {
    // Jika Gambar, munculkan di modal
    previewImageSrc.value = fileUrl;
    dialogPreview.value = true;
  }
};

const handleRowClick = (_event: MouseEvent, { item }: { item: PettyCashItem }) => {
  selected.value = [item];
};

// Fungsi buka dialog
const openReceiveDialog = () => {
  if (selected.value.length !== 1) return;
  const item = selected.value[0];

  if (item.status !== "APPROVED" || !item.pck_nomor) {
    return toast.warning("Hanya dokumen yang berstatus APPROVED yang bisa diterima.");
  }

  dialogReceive.pck_nomor = item.pck_nomor;
  dialogReceive.tanggal = format(new Date(), "yyyy-MM-dd");
  dialogReceive.nominal = 0; // Store isi manual
  dialogReceive.show = true;
};

// Fungsi proses API
const processReceive = async () => {
  if (!dialogReceive.nominal || dialogReceive.nominal <= 0) {
    return toast.error("Nominal asli yang diterima harus lebih dari 0.");
  }

  dialogReceive.isProcessing = true;
  try {
    const payload = {
      tanggal: dialogReceive.tanggal,
      nominal: dialogReceive.nominal,
    };

    const response = await api.put(`/petty-cash/receive-klaim/${dialogReceive.pck_nomor}`, payload);

    toast.success(response.data.message);
    dialogReceive.show = false;
    selected.value = [];
    fetchMasterData(); // Refresh tabel
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal memproses penerimaan dana.");
  } finally {
    dialogReceive.isProcessing = false;
  }
};

onMounted(() => {
  fetchCabangList();
  fetchMasterData();
});
</script>

<template>
  <PageLayout title="Monitoring Petty Cash Store" :menu-id="MENU_ID" icon="mdi-wallet-outline">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        color="orange-darken-2"
        prepend-icon="mdi-pencil"
        :disabled="selected.length !== 1"
        @click="handleEdit"
        >Edit</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        prepend-icon="mdi-delete"
        :disabled="selected.length !== 1"
        @click="handleDelete"
        >Hapus</v-btn
      >

      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="info"
        prepend-icon="mdi-file-send"
        to="/petty-cash/pengajuan"
      >
        Form Pengajuan Klaim
      </v-btn>

      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        color="success"
        prepend-icon="mdi-cash-check"
        :disabled="selected.length !== 1 || selected[0].status !== 'APPROVED'"
        @click="openReceiveDialog"
      >
        Terima Dana
      </v-btn>

      <v-btn
        size="small"
        color="success"
        prepend-icon="mdi-file-excel"
        :disabled="masterData.length === 0"
        @click="handleExport"
        >Export</v-btn
      >
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label>Periode:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          @change="fetchMasterData"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          @change="fetchMasterData"
        />

        <template v-if="isKdc">
          <v-label class="ms-4">Cabang:</v-label>
          <v-select
            v-model="filters.cabang"
            :items="cabangList"
            item-title="nama"
            item-value="kode"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 220px"
            class="ms-2"
            @update:model-value="fetchMasterData"
          />
        </template>

        <v-spacer />
        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="loading"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="masterData"
          :loading="loading"
          item-value="nomor_utama"
          density="compact"
          class="desktop-table custom-highlight-table header-browse-blue"
          show-select
          show-expand
          single-select
          return-object
          @click:row="handleRowClick"
          @update:expanded="loadDetails"
        >
          <template #[`item.nomor_utama`]="{ item }">
            <div v-if="item.pck_nomor">
              <span class="text-primary font-weight-bold">{{ item.pck_nomor }}</span>
            </div>
            <span v-else class="text-grey-darken-3 font-weight-bold">{{ item.nomor_utama }}</span>
          </template>

          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), "dd/MM/yyyy") }}
          </template>

          <template #[`item.cabang`]="{ item }">
            <b>{{ item.cabang }}</b> - {{ item.namaCabang }}
          </template>

          <template #[`item.modal`]="{ item }">
            <span class="font-weight-bold">{{ formatRupiah(item.modal) }}</span>
          </template>

          <template #[`item.terpakai`]="{ item }">
            <span class="text-error font-weight-medium">{{ formatRupiah(item.terpakai) }}</span>
          </template>

          <template #[`item.receive_nominal`]="{ item }">
            <span v-if="item.receive_nominal" class="text-teal-darken-3 font-weight-bold">
              {{ formatRupiah(item.receive_nominal) }}
            </span>
            <span v-else class="text-grey-lighten-1">-</span>
          </template>

          <template #[`item.saldo`]="{ item }">
            <span class="text-success font-weight-bold">{{ formatRupiah(item.saldo) }}</span>
          </template>

          <template #[`item.status`]="{ item }">
            <v-chip
              size="x-small"
              variant="flat"
              class="font-weight-bold"
              :color="
                item.status === 'APPROVED'
                  ? 'success'
                  : item.status === 'SUBMITTED'
                  ? 'info'
                  : item.status === 'REJECTED'
                  ? 'error'
                  : 'grey-darken-1'
              "
            >
              {{ item.status }}
            </v-chip>

            <div
              v-if="item.bkm_nomor && item.status === 'RECEIVED'"
              class="text-teal-darken-3 mt-1 d-flex flex-column align-center justify-center font-weight-bold"
              style="font-size: 10px !important; line-height: 1.2"
            >
              <div style="font-size: 8px" class="text-grey-darken-1">No. Bukti Terima:</div>
              <div class="d-flex align-center">
                <v-icon size="x-small" class="mr-1">mdi-check-decagram</v-icon>
                {{ item.bkm_nomor }}
              </div>
            </div>
          </template>

          <template #[`item.jumlah_nota`]="{ item }">
            <v-chip size="x-small" color="grey-darken-2" variant="tonal">
              {{ item.jumlah_nota }} Nota
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="pa-3 bg-grey-lighten-4 border-b">
                  <div v-if="loadingDetails.has(item.nomor_utama)" class="text-center pa-2">
                    <v-progress-circular
                      indeterminate
                      size="24"
                      color="primary"
                    ></v-progress-circular>
                    <span class="ml-2 text-caption">Memuat rincian nota...</span>
                  </div>

                  <div
                    v-else-if="details[item.nomor_utama] && details[item.nomor_utama].length > 0"
                    class="detail-wrapper"
                  >
                    <table class="w-100 detail-table bg-white">
                      <thead>
                        <tr>
                          <th width="60" class="text-center">PCV</th>
                          <th width="100">TANGGAL</th>
                          <th width="140">NO. NOTA (PC)</th>
                          <th width="200">KATEGORI</th>
                          <th>KETERANGAN</th>
                          <th width="120" class="text-right">NOMINAL</th>
                          <th width="80" class="text-center">NOTA</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(d, idx) in details[item.nomor_utama]" :key="idx">
                          <td class="text-center font-weight-bold text-grey-darken-2">
                            {{ d.pcd_pcv }}
                          </td>
                          <td>{{ format(parseISO(d.pcd_tanggal), "dd/MM/yyyy") }}</td>
                          <td class="font-weight-bold text-primary">{{ d.pc_nomor }}</td>
                          <td class="text-caption font-weight-bold">{{ d.pcd_kategori }}</td>
                          <td class="text-caption">{{ d.pcd_keterangan }}</td>
                          <td class="text-right font-weight-bold text-error">
                            {{ formatRupiah(d.pcd_nominal) }}
                          </td>
                          <td class="text-center">
                            <div
                              v-if="d.pcd_file"
                              class="d-flex align-center justify-center flex-wrap"
                              style="gap: 4px"
                            >
                              <template v-for="(fName, fIdx) in d.pcd_file.split(',')" :key="fIdx">
                                <v-btn
                                  icon
                                  size="x-small"
                                  color="info"
                                  variant="tonal"
                                  :title="'Lihat Preview Nota ' + (Number(fIdx) + 1)"
                                  @click="showPreview(fName)"
                                >
                                  <v-icon size="small">{{
                                    fName.toLowerCase().endsWith(".pdf")
                                      ? "mdi-file-pdf-box"
                                      : "mdi-eye"
                                  }}</v-icon>
                                </v-btn>
                              </template>
                            </div>
                            <span v-else class="text-grey-lighten-1">-</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div v-else class="text-center text-caption text-grey pa-2">
                    Belum ada rincian nota yang diinput.
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text class="pa-5 text-body-1">{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            color="error"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Hapus</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogPreview" max-width="850px">
      <v-card class="rounded-lg">
        <v-card-title
          class="bg-grey-darken-3 text-white text-subtitle-1 font-weight-bold d-flex justify-space-between align-center py-2 px-4"
        >
          <div class="d-flex align-center">
            <v-icon size="small" class="me-2">mdi-image-search</v-icon>
            Preview Nota
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            size="small"
            @click="dialogPreview = false"
          ></v-btn>
        </v-card-title>
        <v-card-text
          class="pa-4 bg-grey-lighten-3 text-center d-flex justify-center align-center"
          style="min-height: 400px"
        >
          <img
            :src="previewImageSrc"
            alt="Preview Nota"
            style="
              max-width: 100%;
              max-height: 75vh;
              object-fit: contain;
              border: 1px solid #ccc;
              background: white;
              border-radius: 4px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            "
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogReceive.show" max-width="400px" persistent>
      <v-card class="rounded-lg">
        <v-card-title
          class="bg-success text-white text-subtitle-1 font-weight-bold d-flex align-center"
        >
          <v-icon start>mdi-cash-multiple</v-icon> Konfirmasi Terima Dana
        </v-card-title>

        <v-card-text class="pa-5">
          <div class="mb-4 text-body-2">
            Anda akan mengonfirmasi penerimaan dana untuk pengajuan
            <b>{{ dialogReceive.pck_nomor }}</b
            >.
          </div>

          <v-text-field
            v-model="dialogReceive.tanggal"
            type="date"
            label="Tanggal Uang Diterima"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <v-text-field
            v-model.number="dialogReceive.nominal"
            type="number"
            label="Nominal Asli Diterima (Rp)"
            variant="outlined"
            density="compact"
            placeholder="Contoh: 150000"
            hide-details
          />
        </v-card-text>

        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            color="grey-darken-1"
            @click="dialogReceive.show = false"
            :disabled="dialogReceive.isProcessing"
            >Batal</v-btn
          >
          <v-btn
            color="success"
            variant="flat"
            :loading="dialogReceive.isProcessing"
            @click="processReceive"
            >Terima & Selesai</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.custom-highlight-table :deep(.v-data-table__tr--selected) {
  background-color: #e3f2fd !important;
}
.custom-highlight-table :deep(.v-data-table__tr:hover) {
  background-color: #f5f5f5 !important;
  cursor: pointer;
}

.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 110px);
  overflow: hidden;
}

.filter-section {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0 12px 12px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}

.desktop-table {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.desktop-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
}
.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* --- STYLING UNTUK TABEL EXPAND --- */
.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.detail-wrapper {
  max-width: 900px; /* Batasi lebar agar rapi */
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border: 1px solid #e0e0e0;
}
.detail-table {
  border-collapse: collapse;
  font-size: 11px;
}
.detail-table th {
  background-color: #f1f8ff;
  color: #0d47a1;
  font-weight: bold;
  padding: 6px 8px;
  text-align: left;
  border-bottom: 2px solid #1976d2;
}
.detail-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #eeeeee;
}
.detail-table tbody tr:hover {
  background-color: #fafafa;
}
</style>
