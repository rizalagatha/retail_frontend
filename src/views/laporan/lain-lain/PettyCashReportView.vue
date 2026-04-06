<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import * as XLSX from "xlsx";
import { useToast } from "vue-toastification";
import axios from "axios";

// --- INTERFACES UNTUK MENGHILANGKAN ERROR 'ANY' ---
interface MutasiItem {
  mut_id: number;
  tanggal: string;
  nomor_bukti: string;
  tipe: "DEBET" | "KREDIT";
  nominal: number | string;
  keterangan: string | null;
  status_ref: string | null;
  kategori: string | null;
  pcv: number | string | null;
  running_balance?: number; // Dibuat opsional karena ini hasil computed
}

interface DetailNota {
  pcd_file: string | null;
  [key: string]: unknown; // Mengizinkan properti lain jika ada tanpa error
}

const MENU_ID = "603";
const toast = useToast();
const loading = ref(false);
const cabangOptions = ref<{ kode: string; nama: string }[]>([]);

const filter = reactive({
  startDate: format(new Date(), "yyyy-MM-01"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: "",
});

const reportData = ref({
  limit_saldo: 0,
  saldo_awal: 0,
  mutasi: [] as MutasiItem[], // <-- [FIX] Gunakan interface MutasiItem
});

// --- STATE UNTUK PREVIEW NOTA ---
const preview = reactive({
  show: false,
  loading: false,
  nomor: "",
  files: [] as string[],
});

// LOGIKA RUNNING BALANCE
const processedMutasi = computed(() => {
  let currentBalance = reportData.value.saldo_awal;
  return reportData.value.mutasi.map((m) => {
    if (m.tipe === "DEBET") currentBalance += Number(m.nominal);
    if (m.tipe === "KREDIT") currentBalance -= Number(m.nominal);
    return { ...m, running_balance: currentBalance };
  });
});

const fetchCabang = async () => {
  try {
    const resp = await api.get("/petty-cash-report/cabang");
    cabangOptions.value = resp.data;
    if (cabangOptions.value.length === 1) {
      filter.cabang = cabangOptions.value[0].kode;
      fetchReport();
    }
  } catch (e) {
    console.error("Gagal menarik daftar cabang:", e);
  }
};

const fetchReport = async () => {
  if (!filter.cabang) return;
  loading.value = true;
  try {
    const resp = await api.get("/petty-cash-report", { params: filter });
    reportData.value = resp.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const getStatusColor = (status: string) => {
  if (!status) return "grey";
  switch (status.toUpperCase()) {
    case "DRAFT":
      return "grey-darken-1";
    case "SUBMITTED":
      return "blue";
    case "ACC":
      return "warning";
    case "APPROVED":
      return "info";
    case "RECEIVED":
      return "success";
    case "REJECTED":
      return "error";
    default:
      return "grey";
  }
};

// --- FUNGSI MEMBUKA PREVIEW NOTA ---
const openPreview = async (nomorBukti: string) => {
  preview.nomor = nomorBukti;
  preview.show = true;
  preview.loading = true;
  preview.files = [];

  try {
    const response = await api.get(`/petty-cash-form/${nomorBukti}`);
    const details = response.data.details || [];

    let allFiles: string[] = [];
    details.forEach((d: DetailNota) => {
      if (d.pcd_file) {
        const fileArray = d.pcd_file.split(",").map((f: string) => f.trim());
        allFiles = [...allFiles, ...fileArray];
      }
    });

    preview.files = allFiles;
  } catch (error: unknown) {
    // [PERBAIKAN] Gunakan tipe unknown
    let msg = "Gagal memuat detail nota fisik.";

    // Gunakan axios.isAxiosError untuk mengekstrak pesan asli dari backend
    if (axios.isAxiosError(error)) {
      msg = error.response?.data?.message || msg;
    }

    // [PERBAIKAN] Cuma kirim satu parameter string
    toast.error(msg);
    preview.show = false;
  } finally {
    preview.loading = false;
  }
};

// Helper mendapatkan URL absolut file (sesuaikan dengan VITE_API_URL Anda)
const getFileUrl = (fileName: string) => {
  const baseUrl = (api.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || "") as string;

  // [PERBAIKAN] Jangan hapus /api, cukup pastikan tidak ada double slash di akhir URL
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const cleanFileName = fileName.trim();

  // Hasilnya akan menjadi: https://103.94.238.252/api/uploads/pettycash/nama_file.jpg
  return `${cleanBaseUrl}/uploads/pettycash/${cleanFileName}`;
};

const isPdf = (fileName: string) => fileName.toLowerCase().endsWith(".pdf");

// --- FUNGSI EXPORT KE EXCEL (XLSX) ---
const exportToExcel = () => {
  if (processedMutasi.value.length === 0) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  try {
    toast.info("Membuat file Excel...");

    const cabangName =
      cabangOptions.value.find((c) => c.kode === filter.cabang)?.nama || filter.cabang;
    const title = "LAPORAN BUKU BESAR PETTY CASH STORE";
    const infoCabang = `Cabang  : [${filter.cabang}] ${cabangName}`;
    const infoPeriode = `Periode : ${format(new Date(filter.startDate), "dd/MM/yyyy")} s/d ${format(
      new Date(filter.endDate),
      "dd/MM/yyyy"
    )}`;

    const tableHeaders = [
      "TANGGAL",
      "NOMOR BUKTI",
      "KATEGORI BIAYA",
      "KETERANGAN",
      "STATUS",
      "DEBET (+)",
      "KREDIT (-)",
      "SALDO AKHIR",
    ];
    const tableData = [];

    tableData.push([
      format(new Date(filter.startDate), "dd/MM/yyyy"),
      "SALDO AWAL SEBELUM PERIODE INI",
      "-",
      "-",
      "-",
      0,
      0,
      Number(reportData.value.saldo_awal),
    ]);

    processedMutasi.value.forEach((m) => {
      tableData.push([
        format(new Date(m.tanggal), "dd/MM/yyyy"),
        m.nomor_bukti || "-",
        m.kategori || "-",
        m.keterangan || "-",
        m.status_ref || "-",
        m.tipe === "DEBET" ? Number(m.nominal) : 0,
        m.tipe === "KREDIT" ? Number(m.nominal) : 0,
        Number(m.running_balance),
      ]);
    });

    const excelData = [[title], [infoCabang], [infoPeriode], [], tableHeaders, ...tableData];
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    const merge = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: tableHeaders.length - 1 } },
    ];
    worksheet["!merges"] = merge;

    worksheet["!cols"] = [
      { wch: 15 },
      { wch: 22 },
      { wch: 28 },
      { wch: 45 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Buku Besar PC");

    const fileName = `Buku_Besar_PC_${filter.cabang}_${format(
      new Date(filter.startDate),
      "yyyyMMdd"
    )}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    toast.success("File Laporan berhasil dibuat.");
  } catch (error) {
    toast.error("Gagal mengekspor data Excel.");
    console.error(error);
  }
};

watch(
  filter,
  () => {
    if (filter.cabang) fetchReport();
  },
  { deep: true }
);

onMounted(() => {
  fetchCabang();
});
</script>

<template>
  <PageLayout title="Laporan Mutasi Petty Cash" icon="mdi-book-open-variant" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn
        color="success"
        size="small"
        prepend-icon="mdi-microsoft-excel"
        :disabled="processedMutasi.length === 0"
        @click="exportToExcel"
      >
        Export Excel
      </v-btn>
    </template>

    <div class="report-wrapper pa-4">
      <v-card variant="outlined" class="mb-4 pa-3 bg-grey-lighten-5">
        <v-row density="compact">
          <v-col cols="12" md="3">
            <v-text-field
              v-model="filter.startDate"
              label="Dari Tanggal"
              type="date"
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="3">
            <v-text-field
              v-model="filter.endDate"
              label="Sampai Tanggal"
              type="date"
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model="filter.cabang"
              :items="cabangOptions"
              item-title="nama"
              item-value="kode"
              label="Pilih Cabang"
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="2" class="d-flex align-center">
            <v-btn
              color="primary"
              block
              prepend-icon="mdi-refresh"
              class="font-weight-bold"
              :loading="loading"
              @click="fetchReport"
            >
              Refresh
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <v-row v-if="filter.cabang" class="mb-2">
        <v-col cols="12" md="4">
          <v-card color="red-darken-4" theme="dark" class="pa-3 text-center rounded-lg elevation-2">
            <div class="text-caption font-weight-bold text-uppercase">PLAFON MODAL (TETAP)</div>
            <div class="text-h6 font-weight-black">{{ formatRupiah(reportData.limit_saldo) }}</div>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card
            color="blue-darken-3"
            theme="dark"
            class="pa-3 text-center rounded-lg elevation-2"
          >
            <div class="text-caption font-weight-bold text-uppercase">
              SALDO AWAL ({{ format(new Date(filter.startDate), "dd/MM/yyyy") }})
            </div>
            <div class="text-h6 font-weight-black">{{ formatRupiah(reportData.saldo_awal) }}</div>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card
            color="teal-darken-3"
            theme="dark"
            class="pa-3 text-center rounded-lg elevation-2"
          >
            <div class="text-caption font-weight-bold text-uppercase">
              SALDO AKHIR ({{ format(new Date(filter.endDate), "dd/MM/yyyy") }})
            </div>
            <div class="text-h6 font-weight-black">
              {{
                formatRupiah(
                  processedMutasi.length > 0
                    ? processedMutasi[processedMutasi.length - 1].running_balance
                    : reportData.saldo_awal
                )
              }}
            </div>
          </v-card>
        </v-col>
      </v-row>

      <div class="table-container border mt-2">
        <table class="w-100 report-table">
          <thead>
            <tr>
              <th width="80" class="text-center">TANGGAL</th>
              <th width="140">REF. DOKUMEN</th>
              <th width="160">KATEGORI BIAYA</th>
              <th>KETERANGAN</th>
              <th width="90" class="text-center">STATUS</th>
              <th width="100" class="text-right">DEBET (+)</th>
              <th width="100" class="text-right">KREDIT (-)</th>
              <th width="120" class="text-right bg-blue-lighten-5">SALDO AKHIR</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filter.cabang && processedMutasi.length === 0">
              <td colspan="8" class="text-center pa-4 text-grey">
                Pilih cabang untuk melihat data mutasi.
              </td>
            </tr>
            <tr v-if="filter.cabang" class="bg-grey-lighten-3 font-weight-bold">
              <td class="text-center">{{ format(new Date(filter.startDate), "dd/MM/yyyy") }}</td>
              <td colspan="6" class="text-right text-grey-darken-2">
                SALDO AWAL SEBELUM PERIODE INI
              </td>
              <td class="text-right font-weight-black bg-blue-lighten-5 text-primary">
                {{ formatRupiah(reportData.saldo_awal) }}
              </td>
            </tr>
            <tr v-for="(m, i) in processedMutasi" :key="i">
              <td class="text-center">{{ format(new Date(m.tanggal), "dd/MM/yyyy") }}</td>

              <td class="font-weight-bold">
                <span
                  v-if="m.nomor_bukti && m.nomor_bukti.includes('.PC.')"
                  class="text-primary text-decoration-underline cursor-pointer"
                  @click="openPreview(m.nomor_bukti)"
                  title="Klik untuk melihat struk/nota"
                >
                  {{ m.nomor_bukti }}
                </span>
                <span v-else class="text-primary">{{ m.nomor_bukti }}</span>
              </td>

              <td class="text-grey-darken-2">
                <span v-if="m.kategori">
                  <span v-if="m.pcv" class="font-weight-black text-black">PCV {{ m.pcv }}: </span>
                  {{ m.kategori }}
                </span>
                <span v-else class="text-grey">-</span>
              </td>

              <td>{{ m.keterangan || "-" }}</td>
              <td class="text-center">
                <v-chip
                  v-if="m.status_ref"
                  size="small"
                  :color="getStatusColor(m.status_ref)"
                  class="font-weight-bold text-caption px-2"
                  variant="flat"
                >
                  {{ m.status_ref }}
                </v-chip>
                <span v-else class="text-grey">-</span>
              </td>
              <td class="text-right text-success font-weight-bold">
                {{ m.tipe === "DEBET" ? formatRupiah(Number(m.nominal)) : "-" }}
              </td>
              <td class="text-right text-error font-weight-bold">
                {{ m.tipe === "KREDIT" ? formatRupiah(Number(m.nominal)) : "-" }}
              </td>
              <td class="text-right font-weight-black bg-blue-lighten-5">
                {{ formatRupiah(m.running_balance) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <v-dialog v-model="preview.show" max-width="600px">
      <v-card>
        <v-card-title
          class="bg-primary text-white d-flex justify-space-between align-center py-2 px-4"
        >
          <span class="text-subtitle-1 font-weight-bold">Bukti Nota: {{ preview.nomor }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="preview.show = false"></v-btn>
        </v-card-title>

        <v-card-text class="pa-4 bg-grey-lighten-4 text-center" style="min-height: 200px">
          <div v-if="preview.loading" class="pt-10">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
            <div class="text-caption mt-2">Menarik data nota...</div>
          </div>

          <div v-else-if="preview.files.length === 0" class="text-grey py-10">
            <v-icon size="48" color="grey-lighten-1" class="mb-2">mdi-image-off-outline</v-icon>
            <div>Tidak ada file bukti fisik yang dilampirkan pada dokumen ini.</div>
          </div>

          <v-carousel
            v-else
            hide-delimiters
            :show-arrows="preview.files.length > 1 ? 'hover' : false"
            height="auto"
            class="rounded elevation-2 bg-white"
          >
            <v-carousel-item v-for="(file, i) in preview.files" :key="i">
              <div class="pa-2 text-right">
                <v-chip size="x-small" color="primary"
                  >Lampiran {{ i + 1 }} dari {{ preview.files.length }}</v-chip
                >
              </div>

              <div v-if="isPdf(file)" class="py-10">
                <v-icon size="64" color="red">mdi-file-pdf-box</v-icon>
                <div class="mt-2 text-subtitle-2 font-weight-bold">File Dokumen PDF</div>
                <v-btn
                  color="primary"
                  variant="outlined"
                  class="mt-4"
                  prepend-icon="mdi-download"
                  :href="getFileUrl(file)"
                  target="_blank"
                >
                  Buka / Download PDF
                </v-btn>
              </div>

              <v-img
                v-else
                :src="getFileUrl(file)"
                max-height="450"
                class="bg-grey-lighten-2"
                contain
              >
                <template #placeholder>
                  <div class="d-flex align-center justify-center fill-height">
                    <v-progress-circular indeterminate color="grey-lighten-1"></v-progress-circular>
                  </div>
                </template>
              </v-img>
            </v-carousel-item>
          </v-carousel>
        </v-card-text>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.report-wrapper {
  font-size: 11px !important;
}
.font-11 {
  font-size: 11px !important;
}
:deep(.v-field__input),
:deep(.v-label) {
  font-size: 11px !important;
}
.table-container {
  border-radius: 4px;
  overflow: hidden;
  background: white;
}
.report-table {
  border-collapse: collapse;
  font-size: 11px;
}
.report-table th {
  background-color: #f5f5f5;
  color: #333;
  font-weight: bold;
  padding: 8px;
  border-bottom: 2px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  text-align: left;
}
.report-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #eeeeee;
  border-right: 1px solid #eeeeee;
}
.report-table tbody tr:hover {
  background-color: #fafafa;
}
:deep(.v-chip__content) {
  font-size: 10px !important;
}
.cursor-pointer {
  cursor: pointer;
}
.cursor-pointer:hover {
  color: #1565c0 !important;
}
</style>
