<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useToast } from "vue-toastification";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import api from "@/services/api";
import { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";
import { formatRupiah } from "@/utils/formatRupiah";

// Update Interface sesuai kolom baru
interface OtorisasiItem {
  nomor: string;
  transaksi: string;
  jenis: string;
  nominal: number;
  approver: string;
  requester: string;
  keterangan: string; // Alasan masuk sini
  tanggal: string;
  barcode: string;
  uniqueId: string;
}

interface OtorisasiDetail {
  o_nomor: string;
  o_jenis: string;
  o_nominal: number;
  o_ket: string;
  o_barcode: string;
  o_tanggal: string;
}

const toast = useToast();
const isLoading = ref(false);
const masterData = ref<OtorisasiItem[]>([]);
const expanded = ref<OtorisasiItem[]>([]);
const details = ref<Record<string, OtorisasiDetail[]>>({}); // Menghilangkan 'details' not found
const loadingDetails = ref(new Set<string>());

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
});

const selectedFilterField = ref("nomor");
const filterSearchValue = ref("");

// Update Opsi Filter
const filterOptions = [
  { title: "Nomor", value: "nomor" },
  { title: "Transaksi", value: "transaksi" },
  { title: "Jenis", value: "jenis" },
  { title: "Approver", value: "approver" },
  { title: "Requester", value: "requester" },
  { title: "Keterangan/Alasan", value: "keterangan" },
];

// Update Headers Tabel
const headers = [
  { title: "", key: "data-table-expand", width: "40px" },
  { title: "Nomor Otorisasi", key: "nomor", fixed: true, width: "180px" },
  { title: "Tanggal", key: "tanggal", width: "160px" },
  { title: "Jenis", key: "jenis", width: "130px" },
  { title: "Nominal", key: "nominal", align: "end" as const, width: "130px" },
  { title: "Requester", key: "requester", width: "120px" },
  { title: "Status", key: "approver", width: "150px" },
];

const detailHeaders = [
  { title: "NO. TRANSAKSI RIIL", key: "o_nomor", width: "160px" },
  { title: "JENIS", key: "o_jenis", width: "120px" },
  { title: "NOMINAL", key: "o_nominal", align: "end" as const, width: "120px" },
  /* Dipisah menjadi 2 kolom */
  { title: "KETERANGAN", key: "keterangan" },
  { title: "ALASAN", key: "alasan", width: "200px" },
  { title: "TANGGAL", key: "o_tanggal", width: "160px" },
];

const getRowTextColor = (item: OtorisasiItem) => {
  return item.approver === "-" ? "text-error font-weight-bold" : "";
};

const fetchMasterData = async () => {
  isLoading.value = true;
  masterData.value = [];
  try {
    const response = await api.get("/laporan-list-otorisasi/list-otorisasi", {
      params: { startDate: filters.startDate, endDate: filters.endDate },
    });

    const rows = (response.data?.data ?? response.data ?? []) as Record<string, unknown>[];

    masterData.value = rows.map((item, idx) => {
      // 1. Ambil mentahan dari database
      // Contoh: "Cust: SRI\nDiskon: 325.000\n\nAlasan: PROMO DESEMBER"
      const rawText = String(item.keterangan ?? item.raw_keterangan ?? "");

      // 2. Tentukan Kata Kunci Pemisah
      const keyword = "Alasan:";

      let ketClean = rawText;
      let reasonClean = "-";

      // 3. Logika Split Berdasarkan Kata Kunci
      // Cari posisi di mana kata "Alasan:" dimulai
      const index = rawText.indexOf(keyword);

      if (index !== -1) {
        // --- BAGIAN KETERANGAN (Sebelum kata "Alasan:") ---
        // Ambil dari karakter 0 sampai index ditemukan
        const ketPart = rawText.substring(0, index).trim();

        // Opsional: Ganti Enter (\n) dengan Koma agar rapi di tabel
        ketClean = ketPart.replace(/\n+/g, ", ").trim();
        // Jika hasil akhirnya berakhiran koma, hapus komanya
        if (ketClean.endsWith(",")) ketClean = ketClean.slice(0, -1);

        // --- BAGIAN ALASAN (Setelah kata "Alasan:") ---
        // Ambil dari index + panjang kata kunci sampai akhir
        const reasonPart = rawText.substring(index + keyword.length).trim();
        reasonClean = reasonPart.replace(/\n+/g, " ").trim();
      } else {
        // Jika tidak ada kata "Alasan:", maka bersihkan enter saja
        ketClean = rawText.replace(/\n+/g, ", ").trim();
      }

      return {
        nomor: String(item.nomor ?? ""),
        transaksi: String(item.transaksi ?? ""),
        jenis: String(item.jenis ?? ""),
        nominal: Number(item.nominal ?? 0),
        approver: String(item.approver ?? "-"),
        requester: String(item.requester ?? "-"),

        // Masukkan hasil split
        keterangan: ketClean,
        alasan: reasonClean,

        tanggal: String(item.tanggal ?? ""),
        barcode: String(item.barcode ?? ""),
        uniqueId: `${item.nomor}-${idx}`,
      };
    });
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat daftar otorisasi.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpanded: OtorisasiItem[]) => {
  const item = newlyExpanded.find((i) => i && !details.value[i.nomor]);
  if (!item || item.approver === "-") return;

  loadingDetails.value.add(item.nomor);
  try {
    const response = await api.get<OtorisasiDetail[]>(`/laporan-list-otorisasi/detail-transaksi`, {
      params: { auth_nomor: item.nomor },
    });

    // Petakan data detail untuk memisahkan keterangan dan alasan
    details.value[item.nomor] = response.data.map((d) => {
      const rawText = d.o_ket || "";
      const keyword = "Alasan:";
      const index = rawText.indexOf(keyword);

      let ketClean = rawText;
      let reasonClean = "-";

      if (index !== -1) {
        ketClean = rawText.substring(0, index).replace(/\n+/g, ", ").trim();
        if (ketClean.endsWith(",")) ketClean = ketClean.slice(0, -1);
        reasonClean = rawText.substring(index + keyword.length).replace(/\n+/g, " ").trim();
      } else {
        ketClean = rawText.replace(/\n+/g, ", ").trim();
      }

      return {
        ...d,
        keterangan: ketClean,
        alasan: reasonClean,
      };
    });
  } catch (error) {
    console.error("Gagal memuat detail", error);
  } finally {
    loadingDetails.value.delete(item.nomor);
  }
};

const filteredData = computed(() => {
  const keyword = filterSearchValue.value.trim().toLowerCase();
  const field = selectedFilterField.value;

  if (!keyword) return masterData.value;

  return masterData.value.filter((item) => {
    const val = item[field as keyof OtorisasiItem];
    return val?.toString().toLowerCase().includes(keyword);
  });
});

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Daftar Otorisasi" icon="mdi-shield-account-outline">
    <div class="browse-content">
      <div class="filter-section">
        <v-label class="font-weight-bold">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          class="ms-2" style="max-width: 150px" />
        <span class="mx-2 align-self-center">-</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px" />

        <v-spacer />

        <v-select v-model="selectedFilterField" :items="filterOptions" item-title="title" item-value="value"
          label="Cari Berdasarkan" density="compact" hide-details variant="outlined" style="max-width: 200px"
          class="me-2" />

        <v-text-field v-model="filterSearchValue" label="Kata kunci pencarian..." density="compact" hide-details
          variant="outlined" style="max-width: 300px" clearable prepend-inner-icon="mdi-magnify" />
      </div>

      <div class="table-wrapper">
        <AppDataTable v-model:expanded="expanded" :headers="headers" :items="filteredData" item-value="nomor"
          return-object show-expand @update:expanded="loadDetails" :item-class="getRowTextColor"
          class="desktop-table header-browse-blue">
          <template #[`item.nominal`]="{ value }">
            {{ formatRupiah(value) }}
          </template>

          <template #[`item.approver`]="{ item }">
            <v-chip v-if="item.approver !== '-'" size="x-small" color="success" variant="tonal">
              <v-icon start icon="mdi-check-circle"></v-icon>
              {{ item.approver }}
            </v-chip>
            <v-chip v-else size="x-small" color="error" variant="flat" class="font-weight-bold">
              BELUM ACC
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0 bg-grey-lighten-4">
                <div class="detail-container pa-4">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center pa-4 text-caption">
                      Memuat transaksi riil...
                    </div>

                    <div v-else>
                      <v-data-table :headers="detailHeaders" :items="details[item.nomor] || []" density="compact"
                        class="detail-table-card" hide-default-footer>
                        <template #[`item.o_nominal`]="{ value }">
                          {{ formatRupiah(value) }}
                        </template>
                        <template #[`item.o_nomor`]="{ value }">
                          <span class="text-primary font-weight-bold">{{ value }}</span>
                        </template>
                      </v-data-table>

                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.detail-container {
  display: flex;
  justify-content: flex-start;
  background-color: #f5f5f5;
  border-left: 4px solid #d32f2f;
  /* Aksen merah otorisasi */
}

.detail-table-wrapper {
  width: 100%;
  max-width: 1200px;
  background-color: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Header Tabel Detail Biru Tua */
.detail-table-card :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  font-size: 11px !important;
  text-transform: uppercase !important;
  height: 32px !important;
}

.detail-table-card :deep(tbody tr td) {
  font-size: 11px !important;
  height: 28px !important;
}
</style>
