<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO, isBefore } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import type { AxiosError } from "axios";

// --- Tipe Data ---
interface Header {
  nomor: string;
  tanggal: string;
  nomorStbj: string;
  tanggalStbj: string;
  asalStbj: string;
  nomorSjGarmen: string;
  tanggalSjGarmen: string;
  nomorMutasiKps: string;
  tanggalMutasiKps: string;
  nomorMutasiKbs: string;
  tanggalMutasiKbs: string;
}
interface SummaryItem {
  spk: string;
  packing: string; // nomor packing (bisa lebih dari satu, dipisah koma)
  gudang: string; // gdg_nama tujuan
  nama: string;
  ukuran: string;
  jumlah: number;
  koli: number;
  keterangan: string;
}
type StatusTerima = "BELUM" | "SEBAGIAN" | "SEMUA";
interface Ringkasan {
  totalQty: number;
  diterima: number;
  kekurangan: number;
  persen: number;
  statusTerima: StatusTerima;
}
// Baris dari server: satu baris per packing + SPK + kode + ukuran
interface AllocationApiItem {
  packing: string;
  spk: string;
  kode: string;
  nama: string;
  ukuran: string;
  jumlah: number; // isi packing menurut STBJ
  diterima: number; // sudah diterima di penerimaan sebelumnya
  sisa: number;
}
interface AllocationItem extends AllocationApiItem {
  id: string;
  terima: number; // qty yang diterima pada penerimaan ini
  kdc: number;
  kbs: number;
  kps: number;
  kpr: number;
  kf1: number;
  total: number;
}
interface LoadResponse {
  header: { stbj_nomor: string; stbj_tanggal: string };
  summaryItems: SummaryItem[];
  allocationItems: AllocationApiItem[];
  ringkasan: Ringkasan;
}
interface SaveResponse {
  message: string;
  nomor: string;
  ringkasan: Ringkasan;
}
interface ResultItem {
  cab: string; // Store
  sj: string; // No. SJ
  terima: string; // No. Terima
  tglterima: string; // Tgl Terima
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "211";

const pageTitle = "Terima STBJ";

const header = reactive<Header>({
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorStbj: "",
  tanggalStbj: "",
  asalStbj: "P04", // <-- Nilai fixed
  // Field baru untuk input
  nomorSjGarmen: "",
  tanggalSjGarmen: format(new Date(), "yyyy-MM-dd"),
  nomorMutasiKps: "",
  tanggalMutasiKps: format(new Date(), "yyyy-MM-dd"),
  nomorMutasiKbs: "",
  tanggalMutasiKbs: format(new Date(), "yyyy-MM-dd"),
});
const summaryItems = ref<SummaryItem[]>([]);
const allocationItems = ref<AllocationItem[]>([]);
const resultItems = ref<ResultItem[]>([]);
const ringkasan = ref<Ringkasan | null>(null);
const packingTerpilih = ref<string[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isLeftColumnVisible = ref(true);
const dialogHasil = ref(false);
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

const summaryHeaders = [
  { title: "SPK", key: "spk" },
  { title: "No. Packing", key: "packing" },
  { title: "Gudang", key: "gudang" },
  { title: "Nama", key: "nama" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Jumlah", key: "jumlah", align: "end" },
  { title: "Koli", key: "koli", align: "end" },
  { title: "Keterangan", key: "keterangan" },
] as const;

const allocationHeaders = [
  { title: "No. Packing", key: "packing", width: "150px" },
  { title: "SPK", key: "spk", width: "100px" },
  { title: "Kode Barang", key: "kode", width: "100px" },
  { title: "Nama Barang", key: "nama", minWidth: "300px" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Isi Packing", key: "jumlah", align: "end", width: "80px" },
  { title: "Sudah Diterima", key: "diterima", align: "end", width: "90px" },
  { title: "Sisa", key: "sisa", align: "end", width: "70px" },
  { title: "Qty Terima", key: "terima", align: "end", width: "100px" },
  { title: "KDC", key: "kdc", align: "end", width: "70px" },
  { title: "KBS", key: "kbs", align: "end", width: "70px" },
  { title: "KPS", key: "kps", align: "end", width: "70px" },
  { title: "KPR", key: "kpr", align: "end", width: "70px" },
  { title: "KF1", key: "kf1", align: "end", width: "70px" },
  { title: "Total Alokasi", key: "total", align: "end", width: "90px" },
] as const;

const resultHeaders = [
  { title: "Store", key: "cab" },
  { title: "No. SJ", key: "sj" },
  { title: "No. Terima", key: "terima" },
  { title: "Tgl Terima", key: "tglterima" },
] as const;

const angka = (v: unknown) => Number(v) || 0;
const fmtQty = (n: unknown) => angka(n).toLocaleString("id-ID");

// --- Computed: Total Ringkasan Garmen ---
const totalSummary = computed(() => {
  return summaryItems.value.reduce(
    (acc, item) => {
      acc.jumlah += angka(item.jumlah);
      acc.koli += angka(item.koli);
      return acc;
    },
    { jumlah: 0, koli: 0 }
  );
});

// --- Computed: Total Penerimaan & Alokasi ---
const totalAllocation = computed(() => {
  return allocationItems.value.reduce(
    (acc, item) => {
      acc.jumlah += angka(item.jumlah);
      acc.diterima += angka(item.diterima);
      acc.sisa += angka(item.sisa);
      acc.terima += angka(item.terima);
      acc.kdc += angka(item.kdc);
      acc.kbs += angka(item.kbs);
      acc.kps += angka(item.kps);
      acc.kpr += angka(item.kpr);
      acc.kf1 += angka(item.kf1);
      acc.total += angka(item.total);
      return acc;
    },
    { jumlah: 0, diterima: 0, sisa: 0, terima: 0, kdc: 0, kbs: 0, kps: 0, kpr: 0, kf1: 0, total: 0 }
  );
});

// Posisi STBJ setelah penerimaan ini (perkiraan tampilan; angka resmi dihitung server)
const ringkasanAkhir = computed(() => {
  const r = ringkasan.value;
  if (!r) return null;
  const diterima = r.diterima + totalAllocation.value.terima;
  const kekurangan = Math.max(r.totalQty - diterima, 0);
  const statusTerima: StatusTerima =
    diterima <= 0 ? "BELUM" : kekurangan <= 0 ? "SEMUA" : "SEBAGIAN";
  return { diterima, kekurangan, statusTerima };
});

// --- Pilih Packing ---
const packingOptions = computed(() => {
  const sisaPerPacking = new Map<string, number>();
  for (const item of allocationItems.value) {
    if (item.sisa > 0) {
      sisaPerPacking.set(item.packing, (sisaPerPacking.get(item.packing) ?? 0) + item.sisa);
    }
  }
  return Array.from(sisaPerPacking, ([packing, sisa]) => ({
    packing,
    label: `${packing || "(tanpa packing)"} — sisa ${fmtQty(sisa)}`,
  }));
});

const pilihSemuaPacking = () => {
  packingTerpilih.value = packingOptions.value.map((o) => o.packing);
};

const ringkasanPilihan = computed(() =>
  packingTerpilih.value.length === 0
    ? ""
    : `${packingTerpilih.value.length} dari ${packingOptions.value.length} packing dipilih`
);

// Pilih packing mengisi Qty Terima = sisa; lepas packing mengosongkan qty dan alokasinya
watch(packingTerpilih, (dipilih) => {
  for (const item of allocationItems.value) {
    if (item.sisa <= 0) continue;
    const aktif = dipilih.includes(item.packing);
    if (aktif && !(angka(item.terima) > 0)) {
      item.terima = item.sisa;
    } else if (!aktif && angka(item.terima) > 0) {
      item.terima = 0;
      item.kbs = 0;
      item.kps = 0;
      item.kpr = 0;
      item.kf1 = 0;
    }
  }
});

const save = () => {
  if (!authStore.can(MENU_ID, "insert")) {
    return toast.error("Anda tidak memiliki hak akses untuk menyimpan data ini.");
  }

  if (isBefore(new Date(header.tanggal), parseISO(header.tanggalStbj))) {
    return toast.error("Tanggal terima tidak boleh mundur dari tanggal STBJ.");
  }

  const rowsTerima = allocationItems.value.filter((item) => angka(item.terima) > 0);
  if (rowsTerima.length === 0) {
    return toast.error("Pilih minimal satu packing dengan qty diterima.");
  }

  const itemMelebihi = rowsTerima.find((item) => item.kdc < 0);
  if (itemMelebihi) {
    return toast.error(
      `Alokasi untuk ${itemMelebihi.nama} (${itemMelebihi.ukuran}) melebihi qty yang diterima. Tidak bisa disimpan.`
    );
  }

  const akhir = ringkasanAkhir.value;
  const dampak =
    akhir && akhir.kekurangan > 0
      ? `Setelah ini STBJ masih kurang ${fmtQty(akhir.kekurangan)} pcs (Sebagian).`
      : "Setelah ini STBJ diterima seluruhnya.";

  showConfirmation(
    "Konfirmasi Simpan",
    `Terima ${rowsTerima.length} baris (${fmtQty(
      totalAllocation.value.terima
    )} pcs). ${dampak} Aksi ini akan membuat dokumen SJ dan Mutasi secara otomatis.`,
    executeSave
  );
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const payload = {
      header,
      allocationItems: allocationItems.value
        .filter((item) => angka(item.terima) > 0)
        .map((item) => ({
          packing: item.packing,
          spk: item.spk,
          kode: item.kode,
          ukuran: item.ukuran,
          jumlah: angka(item.terima),
          kbs: angka(item.kbs),
          kps: angka(item.kps),
          kpr: angka(item.kpr),
          kf1: angka(item.kf1),
        })),
    };
    const response = await api.post<SaveResponse>("/terima-stbj-form/save", payload);
    const status = response.data.ringkasan;
    const info =
      status.statusTerima === "SEMUA"
        ? "STBJ diterima seluruhnya."
        : `STBJ masih kurang ${fmtQty(status.kekurangan)} pcs.`;
    toast.success(`${response.data.message}. ${info}`);
    router.push({ name: "TerimaStbj" });
  } catch (err) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeForm = () => router.push({ name: "TerimaStbj" });

onMounted(async () => {
  if (!authStore.can(MENU_ID, "view")) {
    toast.error("Anda tidak memiliki hak akses untuk membuka halaman ini.");
    return router.push("/"); // Redirect ke halaman utama
  }

  const nomorKirim = route.query.nomorKirim as string;
  if (!nomorKirim) {
    toast.error("Nomor STBJ Kirim tidak valid.");
    return router.back();
  }

  isLoading.value = true;
  try {
    const response = await api.get<LoadResponse>("/terima-stbj-form/load-from-stbj", {
      params: { nomorStbj: nomorKirim },
    });
    const data = response.data;

    header.nomorStbj = data.header.stbj_nomor;
    header.tanggalStbj = format(parseISO(data.header.stbj_tanggal), "yyyy-MM-dd");

    summaryItems.value = data.summaryItems;
    ringkasan.value = data.ringkasan;
    allocationItems.value = data.allocationItems.map((item) => ({
      ...item,
      id: `${item.packing}|${item.spk}|${item.kode}|${item.ukuran}`,
      terima: 0,
      kdc: 0,
      kbs: 0,
      kps: 0,
      kpr: 0,
      kf1: 0,
      total: 0,
    }));
  } catch (error) {
    const err = error as AxiosError<{ message: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data STBJ.");
    router.back();
  } finally {
    isLoading.value = false;
  }
});

watch(
  allocationItems,
  (newItems) => {
    newItems.forEach((item) => {
      // Qty terima tidak boleh melebihi sisa packing
      if (angka(item.terima) > item.sisa) item.terima = item.sisa;
      if (angka(item.terima) < 0) item.terima = 0;

      const totalAlokasiStore =
        angka(item.kbs) + angka(item.kps) + angka(item.kpr) + angka(item.kf1);
      item.total = totalAlokasiStore;
      item.kdc = angka(item.terima) - totalAlokasiStore;
    });
  },
  { deep: true }
);
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode>
    <template #header-actions>
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        :prepend-icon="isLeftColumnVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        @click="isLeftColumnVisible = !isLeftColumnVisible"
      >
        {{ isLeftColumnVisible ? "Sembunyikan Header" : "Tampilkan Header" }}
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-file-document-multiple-outline"
        @click="dialogHasil = true"
      >
        Hasil SJ / Mutasi
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="flat"
        class="btn-primary-red"
        prepend-icon="mdi-content-save"
        @click="save"
        :loading="isSaving"
      >
        Simpan
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        class="btn-header-action"
        prepend-icon="mdi-refresh"
        @click="
          showConfirmation(
            'Konfirmasi Batal',
            'Tutup form? Perubahan yang belum disimpan akan hilang.',
            closeForm
          )
        "
      >
        Batal
      </v-btn>
    </template>

    <div class="form-grid-container" :class="{ 'hide-left': !isLeftColumnVisible }">
      <div class="left-column">
        <div class="desktop-form-section header-section">
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                label="No. Terima"
                v-model="header.nomor"
                readonly
                filled
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. Terima"
                v-model="header.tanggal"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. STBJ"
                v-model="header.nomorStbj"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. STBJ"
                v-model="header.tanggalStbj"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="12"
              ><v-text-field
                label="Asal STBJ"
                v-model="header.asalStbj"
                readonly
                filled
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. SJ Garmen"
                v-model="header.nomorSjGarmen"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. SJ Garmen"
                v-model="header.tanggalSjGarmen"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. Mutasi KPS"
                v-model="header.nomorMutasiKps"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. Mutasi KPS"
                v-model="header.tanggalMutasiKps"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>

            <v-col cols="6"
              ><v-text-field
                label="No. Mutasi KBS"
                v-model="header.nomorMutasiKbs"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                label="Tgl. Mutasi KBS"
                v-model="header.tanggalMutasiKbs"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
            /></v-col>
          </v-row>
        </div>
        <div class="desktop-form-section panel-ringkasan d-flex flex-column">
          <div class="panel-title">Ringkasan dari Garmen</div>
          <v-data-table
            :headers="summaryHeaders"
            :items="summaryItems"
            :loading="isLoading"
            class="desktop-table flex-grow-1"
            :items-per-page="-1"
            density="compact"
            fixed-header
          >
            <template #[`body.append`]>
              <tr class="sticky-footer-row">
                <td colspan="5" class="text-end font-weight-bold">TOTAL :</td>
                <td class="text-end font-weight-bold">
                  {{ totalSummary.jumlah.toLocaleString("id-ID") }}
                </td>
                <td class="text-end font-weight-bold">
                  {{ totalSummary.koli.toLocaleString("id-ID") }}
                </td>
                <td></td>
              </tr>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>

      <div class="right-column">
        <div class="desktop-form-section panel-terima d-flex flex-column">
          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <div class="panel-title panel-title-inline">Penerimaan per Packing</div>
            <v-spacer />
            <template v-if="ringkasan">
              <v-chip size="small" variant="tonal" color="grey-darken-1">
                Total STBJ: {{ fmtQty(ringkasan.totalQty) }}
              </v-chip>
              <v-chip size="small" variant="tonal" color="grey-darken-1">
                Sudah diterima: {{ fmtQty(ringkasan.diterima) }}
              </v-chip>
              <v-chip size="small" variant="tonal" color="grey-darken-1">
                Diterima sekarang: {{ fmtQty(totalAllocation.terima) }}
              </v-chip>
              <v-chip
                v-if="ringkasanAkhir"
                size="small"
                variant="tonal"
                :color="ringkasanAkhir.kekurangan > 0 ? 'orange-darken-4' : 'green'"
              >
                Sisa setelah ini: {{ fmtQty(ringkasanAkhir.kekurangan) }} ({{
                  ringkasanAkhir.statusTerima === "SEMUA" ? "Semua" : "Sebagian"
                }})
              </v-chip>
            </template>
          </div>

          <div class="d-flex align-center ga-2 mb-2">
            <v-select
              v-model="packingTerpilih"
              :items="packingOptions"
              item-title="label"
              item-value="packing"
              label="Packing yang diterima"
              multiple
              density="compact"
              variant="outlined"
              hide-details
              class="packing-select"
              :menu-props="{ class: 'form-select-menu', maxHeight: 320 }"
            >
              <template #selection="{ index }">
                <span v-if="index === 0" class="packing-selection-text">{{
                  ringkasanPilihan
                }}</span>
              </template>
            </v-select>
            <v-btn
              size="small"
              variant="tonal"
              class="btn-header-action"
              @click="pilihSemuaPacking"
            >
              Pilih Semua
            </v-btn>
            <v-btn size="small" variant="text" class="btn-refresh" @click="packingTerpilih = []"
              >Kosongkan</v-btn
            >
          </div>

          <v-data-table
            :headers="allocationHeaders"
            :items="allocationItems"
            :loading="isLoading"
            item-value="id"
            class="desktop-table flex-grow-1"
            :items-per-page="-1"
            density="compact"
            fixed-header
          >
            <template #[`item.packing`]="{ item }">
              {{ item.packing || "(tanpa packing)" }}
            </template>
            <template #[`item.jumlah`]="{ item }">
              <div class="text-end">{{ fmtQty(item.jumlah) }}</div>
            </template>
            <template #[`item.diterima`]="{ item }">
              <div class="text-end">{{ fmtQty(item.diterima) }}</div>
            </template>
            <template #[`item.sisa`]="{ item }">
              <div class="text-end font-weight-bold">{{ fmtQty(item.sisa) }}</div>
            </template>
            <template #[`item.terima`]="{ item }">
              <v-text-field
                v-model.number="item.terima"
                type="number"
                min="0"
                :max="item.sisa"
                :disabled="item.sisa <= 0"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.kdc`]="{ item }">
              <div class="text-end font-weight-bold" :class="item.kdc < 0 ? 'qty-over' : ''">
                {{ item.kdc || 0 }}
              </div>
            </template>
            <template #[`item.kbs`]="{ item }">
              <v-text-field
                v-model.number="item.kbs"
                type="number"
                :disabled="!(item.terima > 0)"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.kps`]="{ item }">
              <v-text-field
                v-model.number="item.kps"
                type="number"
                :disabled="!(item.terima > 0)"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.kpr`]="{ item }">
              <v-text-field
                v-model.number="item.kpr"
                type="number"
                :disabled="!(item.terima > 0)"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.kf1`]="{ item }">
              <v-text-field
                v-model.number="item.kf1"
                type="number"
                :disabled="!(item.terima > 0)"
                variant="underlined"
                density="compact"
                hide-details
                class="text-end"
              />
            </template>
            <template #[`item.total`]="{ item }">
              <div class="text-end font-weight-bold">{{ item.total || 0 }}</div>
            </template>
            <template #[`body.append`]>
              <tr class="sticky-footer-row">
                <td colspan="5" class="text-end font-weight-bold bg-blue-lighten-5">
                  TOTAL KESELURUHAN :
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.jumlah) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.diterima) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.sisa) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.terima) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.kdc) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.kbs) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.kps) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.kpr) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.kf1) }}
                </td>
                <td class="text-end font-weight-bold bg-blue-lighten-5 text-blue-darken-4">
                  {{ fmtQty(totalAllocation.total) }}
                </td>
              </tr>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <v-dialog v-model="dialogHasil" max-width="640px">
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">Hasil SJ / Mutasi Otomatis</v-card-title>
        <v-card-text class="pa-3">
          <v-data-table
            :headers="resultHeaders"
            :items="resultItems"
            :items-per-page="-1"
            density="compact"
            class="hasil-table"
          >
            <template #no-data>
              <div class="text-caption py-4">
                Belum ada hasil. SJ dan mutasi otomatis terbentuk setelah penerimaan disimpan.
              </div>
            </template>
            <template #bottom></template>
          </v-data-table>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogHasil = false">Tutup</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text class="pt-4">{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn
            variant="flat"
            class="btn-primary-red"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* ══════════ TOMBOL (slot header-actions & dialog berada di luar wadah form) ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}
.btn-primary-red:disabled {
  opacity: 0.4;
}
.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:disabled {
  opacity: 0.4;
}
.btn-primary-red:focus-visible,
.btn-header-action:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}
.btn-refresh {
  color: #b71c1c !important;
}

/* ══════════ LAYOUT FORM + tema merah lokal (DESIGN.md 10.3) ══════════ */
.form-grid-container {
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;

  display: grid;
  grid-template-columns: 25% 1fr;
  gap: 16px;
  padding: 16px;
  height: calc(100vh - 120px);
  transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-grid-container.hide-left {
  grid-template-columns: 0px 1fr;
}

.left-column {
  overflow: hidden;
  transition: opacity 0.25s ease, visibility 0.25s ease, transform 0.35s ease;
  transform-origin: left center;
}

.form-grid-container.hide-left .left-column {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  width: 0;
  padding: 0;
  transform: translateX(-20px);
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  min-width: 0;
}

/* ══════════ PANEL ══════════ */
.desktop-form-section {
  background-color: rgb(var(--v-theme-surface));
  padding: 10px 12px;
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.header-section {
  flex-shrink: 0;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.panel-title-inline {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

/* ══════════ FIELD ══════════ */
/* Field editable: tint merah. Field readonly (variant filled): abu, tanpa border merah */
.desktop-form-section :deep(.v-field--variant-outlined) {
  --v-field-border-radius: 8px;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  box-shadow: none !important;
}
.desktop-form-section :deep(.v-field--variant-outlined .v-field__outline) {
  color: #b71c1c;
  --v-field-border-opacity: 0.3;
}
.desktop-form-section :deep(.v-field--variant-outlined.v-field--focused) {
  background-color: rgba(183, 28, 28, 0.07) !important;
}
.desktop-form-section :deep(.v-field--variant-outlined.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}
.desktop-form-section :deep(.v-field--variant-filled) {
  font-size: 11px;
  border-radius: 8px !important;
}
.desktop-form-section :deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgba(var(--v-theme-on-surface), 0.05) !important;
  opacity: 1;
}

.packing-select {
  flex: 1 1 auto;
  max-width: 420px;
}
.packing-selection-text {
  font-size: 11px;
  font-weight: 600;
}

/* Ringkasan garmen (kolom kiri bawah): mengambil sisa tinggi kolom */
.panel-ringkasan {
  flex: 1 1 0;
}
/* Penerimaan per packing: mengambil seluruh sisa tinggi */
.panel-terima {
  flex: 1 1 0;
}

/* ══════════ TABEL ══════════ */
.desktop-table {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.desktop-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto !important;
}

.desktop-table :deep(td) {
  font-size: 11px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.hasil-table :deep(td) {
  font-size: 11px !important;
}

.desktop-table :deep(.text-start) {
  white-space: nowrap !important;
}

/* Input di dalam tabel dibuat ramping */
.desktop-table :deep(.v-field__input) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 24px !important;
  font-size: 11px !important;
}

.desktop-table :deep(thead tr th),
.hasil-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #8e0000 !important;
  box-shadow: none !important;
}

/* Tint baris memakai background-image agar latar opaque bawaan tetap ada */
.desktop-table :deep(tbody tr:nth-child(even) > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.03), rgba(183, 28, 28, 0.03));
}
.desktop-table :deep(tbody tr:hover > td) {
  background-image: linear-gradient(rgba(183, 28, 28, 0.08), rgba(183, 28, 28, 0.08));
}

/* Baris total: menimpa class bg-blue-lighten-5 / text-blue-darken-4 di template */
.sticky-footer-row td {
  position: sticky;
  bottom: 0;
  z-index: 3;
  background-color: #f9ecec !important;
  background-image: none !important;
  color: #8e0000 !important;
  border-top: 2px solid #b71c1c !important;
  border-bottom: none !important;
  height: 36px !important;
}

/* Qty melebihi: amber, bukan merah (merah sudah menjadi warna kerangka) */
.qty-over {
  color: #b26a00;
}

/* ══════════ DIALOG ══════════ */
.dialog-card {
  border-radius: 12px;
  overflow: hidden;
}
.confirm-title {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
</style>

<style>
/* Menu dropdown di-teleport ke luar halaman, jadi tidak bisa memakai scoped */
.form-select-menu .v-list-item--active {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
.form-select-menu .v-list-item:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}
</style>
