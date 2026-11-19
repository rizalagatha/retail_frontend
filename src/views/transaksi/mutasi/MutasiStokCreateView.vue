<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import SoSearchModalForMutasi from "@/components/lookup/SoSearchModalForMutasi.vue";
import ProductSidePanel, {
  type ProductPanelSelection,
} from "@/components/panel/ProductSidePanel.vue";
import type { AxiosError } from "axios";

// --- Tipe Data ---
interface Item {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qtyso: number;
  produksi: number;
  pesan: number;
  ready: number;
  showroom: number;
  kurang: number;
  jumlah: number;
  barcode: string;
  masuk: number;
  keluar: number;
  serials?: string[];
}

interface HasilScanBs {
  kode: string;
  nama: string;
  ukuran: string;
  barcode: string;
  showroom: number;
  unitSerial: string | null;
}

interface TambahBsInput extends HasilScanBs {
  jumlah: number;
}

// --- Inisialisasi ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();
const MENU_ID = "45";

const JENIS_BS = ["BC", "BP"];
const LABEL_JENIS: Record<string, string> = {
  SP: "Showroom ke Pesanan",
  PS: "Pesanan ke Showroom",
  BC: "BS Cetak",
  BP: "BS Produksi",
};
const KETERANGAN_JENIS: Record<string, string> = {
  SP: "Stok showroom dipindah menjadi stok pesanan.",
  PS: "Stok pesanan dikembalikan ke showroom.",
  BC: "Stok showroom dipindah ke bad stock BS Cetak.",
  BP: "Stok showroom dipindah ke bad stock BS Produksi.",
};

const num = (v: unknown): number => Number(v) || 0;

// ID baris buatan lokal bernilai negatif supaya tidak bentrok dengan ID server
let localId = 0;
const newLocalId = (): number => --localId;

// --- State ---
const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? "Ubah Mutasi Stok" : "Buat Mutasi Stok"));
const requiredPermission = computed(() => (isEditMode.value ? "edit" : "insert"));

const initialHeaderState = {
  nomor: "",
  tanggal: format(new Date(), "yyyy-MM-dd"),
  nomorSo: "",
  jenisMutasi: "SP", // SP / PS / BC (BS Cetak) / BP (BS Produksi)
  keterangan: "",
};
const header = reactive({ ...initialHeaderState });
const items = ref<Item[]>([]);
const soLoaded = ref(""); // nomor SO yang benar-benar termuat

const isBs = computed(() => JENIS_BS.includes(header.jenisMutasi));

// Toggle atas: SP / PS / BS. BS punya sub pilihan BC / BP.
const tipeMutasi = computed({
  get: () => (isBs.value ? "BS" : header.jenisMutasi),
  set: (v: string) => {
    header.jenisMutasi = v === "BS" ? "BC" : v;
  },
});

const isLoading = ref(true);
const isSaving = ref(false);
const isDataSaved = ref(false);

const dialog = reactive({ soSearch: false, produk: false });
const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  icon: "mdi-help-circle-outline",
  onConfirm: () => {},
});

const scanTerm = ref("");
const isScanning = ref(false);
const scanInput = ref<{ focus: () => void } | null>(null);
const lastAddedId = ref<number | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | null = null;

const headersSo = [
  { title: "Kode Barang", key: "kode", width: "160px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "70px" },
  { title: "Qty Pesan", key: "qtyso", align: "end", width: "90px" },
  { title: "Produksi", key: "produksi", align: "end", width: "90px" },
  { title: "Stok Pesan", key: "pesan", align: "end", width: "90px" },
  { title: "Ready", key: "ready", align: "end", width: "80px" },
  { title: "Stok Showroom", key: "showroom", align: "end", width: "110px" },
  { title: "Kurang", key: "kurang", align: "end", width: "80px" },
  { title: "Qty Mutasi", key: "jumlah", align: "end", width: "110px" },
  { title: "Barcode", key: "barcode", width: "140px" },
] as const;

const headersBs = [
  { title: "Kode Barang", key: "kode", width: "160px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "70px" },
  { title: "Stok Showroom", key: "showroom", align: "end", width: "110px" },
  { title: "Qty Mutasi", key: "jumlah", align: "end", width: "110px" },
  { title: "Barcode", key: "barcode", width: "140px" },
  { title: "", key: "aksi", sortable: false, width: "44px" },
] as const;

const tableHeaders = computed(() => (isBs.value ? headersBs : headersSo));

const getQtyMutasiClass = (item: Item): string => {
  const qty = num(item.jumlah);
  if (header.jenisMutasi === "PS") return qty > item.pesan ? "qty-warn" : "";
  return qty > item.showroom ? "qty-warn" : ""; // SP, BC, BP: boleh minus, tapi ditandai
};

const summaryTotals = computed(() => ({
  totalJumlah: items.value.reduce((s, i) => s + num(i.jumlah), 0),
  totalShowroom: items.value.reduce((s, i) => s + num(i.showroom), 0),
  totalPesan: items.value.reduce((s, i) => s + num(i.pesan), 0),
  overCount: items.value.filter((i) => num(i.jumlah) > 0 && getQtyMutasiClass(i) !== "").length,
}));

const emptyState = computed(() => {
  if (isBs.value) {
    return {
      mode: "bs" as const,
      icon: "mdi-barcode-scan",
      title: `Belum ada barang untuk ${LABEL_JENIS[header.jenisMutasi]}`,
      text: "Scan barcode atau QR barang yang rusak, atau pilih dari daftar produk. Satu scan menambah 1 pcs.",
      cta: "",
      hint: "Stok showroom berkurang saat disimpan. Stok minus diperbolehkan.",
    };
  }
  if (!soLoaded.value) {
    return {
      mode: "so" as const,
      icon: "mdi-clipboard-search-outline",
      title: "Belum ada pesanan dipilih",
      text: "Pilih No. Pesanan untuk memuat barang yang akan dimutasi.",
      cta: "Pilih No. Pesanan",
      hint: "",
    };
  }
  return {
    mode: "so" as const,
    icon: "mdi-package-variant-remove",
    title: "Pesanan ini tidak punya barang untuk dimutasi",
    text: `Tidak ada barang berstok pada pesanan ${soLoaded.value}.`,
    cta: "Pilih pesanan lain",
    hint: "",
  };
});

// --- Methods ---
const focusScan = () => {
  nextTick(() => scanInput.value?.focus());
};

const bukaCariSo = () => {
  if (isEditMode.value) return; // mode ubah: sumber SO terkunci
  dialog.soSearch = true;
};

const loadDataFromSo = async (nomorSo: string) => {
  isLoading.value = true;
  try {
    const response = await api.get<Item[]>(`/mutasi-stok-form/load-from-so/${nomorSo}`);
    items.value = response.data.map((item) => ({
      ...item,
      id: newLocalId(),
      jumlah: 0,
      masuk: item.masuk || 0,
      keluar: item.keluar || 0,
    }));
    soLoaded.value = nomorSo;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat detail SO.");
    header.nomorSo = "";
    soLoaded.value = "";
    items.value = []; // jangan biarkan data SO sebelumnya menempel
  } finally {
    isLoading.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/mutasi-stok-form/${nomor}`);
    const { header: msoHeader, items: msoItems } = response.data;
    header.nomor = msoHeader.nomor;
    header.tanggal = format(parseISO(msoHeader.tanggal), "yyyy-MM-dd");
    header.nomorSo = msoHeader.nomorSo;
    header.jenisMutasi = msoHeader.jenisMutasi;
    header.keterangan = msoHeader.keterangan;
    soLoaded.value = msoHeader.nomorSo;
    items.value = msoItems.map((item: Item) => ({ ...item, id: newLocalId() }));
    isDataSaved.value = true;
    await nextTick();
    markAsSaved();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat data.");
    router.back();
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  Object.assign(header, initialHeaderState);
  items.value = [];
  soLoaded.value = "";
  isDataSaved.value = false;
  markAsSaved();
  toast.info("Form telah dibersihkan.");
};

// --- Barang BS: scan & panel produk ---
const tambahItemBs = (hasil: TambahBsInput) => {
  const baris = items.value.find((i) => i.kode === hasil.kode && i.ukuran === hasil.ukuran);

  if (hasil.unitSerial && baris?.serials?.includes(hasil.unitSerial)) {
    toast.warning("Unit ini sudah di-scan.");
    return;
  }

  let target: Item;
  if (baris) {
    baris.jumlah = num(baris.jumlah) + hasil.jumlah;
    if (hasil.unitSerial) baris.serials = [...(baris.serials ?? []), hasil.unitSerial];
    target = baris;
  } else {
    target = {
      id: newLocalId(),
      kode: hasil.kode,
      nama: hasil.nama,
      ukuran: hasil.ukuran,
      barcode: hasil.barcode,
      showroom: hasil.showroom,
      qtyso: 0,
      produksi: 0,
      pesan: 0,
      ready: 0,
      kurang: 0,
      masuk: 0,
      keluar: 0,
      jumlah: hasil.jumlah,
      serials: hasil.unitSerial ? [hasil.unitSerial] : [],
    };
    items.value.push(target);
  }

  lastAddedId.value = target.id;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (lastAddedId.value = null), 1200);
};

const onScanBs = async () => {
  const term = scanTerm.value.trim();
  if (!term || isScanning.value) return;
  isScanning.value = true;
  try {
    const response = await api.get<HasilScanBs>("/mutasi-stok-form/bs-lookup", {
      params: { term },
    });
    tambahItemBs({ ...response.data, jumlah: 1 });
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Barang tidak ditemukan.");
  } finally {
    scanTerm.value = "";
    isScanning.value = false;
    focusScan();
  }
};

const onProductsAdded = (list: ProductPanelSelection[]) => {
  list.forEach((p) =>
    tambahItemBs({
      kode: p.kode,
      nama: p.nama,
      ukuran: p.ukuran,
      barcode: p.barcode,
      showroom: p.stok,
      jumlah: p.jumlah,
      unitSerial: null,
    })
  );
};

const hapusBaris = (id: number) => {
  items.value = items.value.filter((i) => i.id !== id);
};

const selectAll = (e: FocusEvent) => (e.target as HTMLInputElement).select();

const rowProps = ({ item }: { item: Item }) => ({
  class: item.id === lastAddedId.value ? "row-flash" : "",
});

// --- Simpan ---
const showConfirmation = (
  title: string,
  text: string,
  onConfirm: () => void,
  icon = "mdi-help-circle-outline"
) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.icon = icon;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const buildPayload = () => ({
  header: {
    nomor: header.nomor,
    tanggal: header.tanggal,
    nomorSo: isBs.value ? "" : header.nomorSo,
    jenisMutasi: header.jenisMutasi,
    keterangan: header.keterangan,
  },
  items: items.value
    .filter((i) => i.kode && num(i.jumlah) > 0)
    .map((i) => ({
      kode: i.kode,
      ukuran: i.ukuran,
      jumlah: num(i.jumlah),
      ...(isBs.value ? { serials: i.serials ?? [] } : {}),
    })),
  isNew: !isEditMode.value,
});

const executeSave = async () => {
  isSaving.value = true;
  try {
    const response = await api.post("/mutasi-stok-form/save", buildPayload());
    toast.success(response.data.message);
    markAsSaved();

    const url = router.resolve({
      name: "Cetak Mutasi Stok",
      params: { nomor: response.data.nomor },
    }).href;
    window.open(url, "_blank");
    router.push({ name: "MutasiStok" });
  } catch (err: unknown) {
    const error = err as AxiosError<{ message: string }>;
    toast.error(error.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const buildConfirmText = (): string => {
  const aktif = items.value.filter((i) => i.kode && num(i.jumlah) > 0);
  const kosong = items.value.length - aktif.length;
  const lines: string[] = [];

  if (isBs.value) {
    lines.push(
      `Mutasi ${summaryTotals.value.totalJumlah} pcs (${aktif.length} baris) ke ${
        LABEL_JENIS[header.jenisMutasi]
      }.`
    );
    lines.push("Stok showroom akan berkurang.");
  } else {
    lines.push(
      `${LABEL_JENIS[header.jenisMutasi]} untuk pesanan ${header.nomorSo}: ${
        summaryTotals.value.totalJumlah
      } pcs (${aktif.length} baris).`
    );
    if (kosong > 0) lines.push(`${kosong} baris ber-Qty 0 tidak ikut disimpan.`);
  }
  if (header.jenisMutasi !== "PS" && summaryTotals.value.overCount > 0) {
    lines.push(`${summaryTotals.value.overCount} baris melebihi stok showroom (stok akan minus).`);
  }
  return lines.join("\n");
};

const handleSave = () => {
  if (!isBs.value && (!header.nomorSo || header.nomorSo !== soLoaded.value)) {
    return toast.error("No. Pesanan harus dipilih dari daftar.");
  }
  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) return toast.error("Detail barang harus diisi.");
  if (summaryTotals.value.totalJumlah <= 0) return toast.error("Qty Mutasi kosong semua.");

  for (const item of validItems) {
    const qty = num(item.jumlah);
    if (qty < 0)
      return toast.error(`Qty Mutasi ${item.nama} (${item.ukuran}) tidak boleh negatif.`);
    if (header.jenisMutasi === "PS" && qty > item.pesan) {
      return toast.error(`Qty Mutasi untuk ${item.nama} (${item.ukuran}) melebihi Stok Pesanan.`);
    }
    if (isBs.value && (item.serials?.length ?? 0) > qty) {
      return toast.error(
        `Qty ${item.nama} (${item.ukuran}) lebih kecil dari jumlah unit QR yang di-scan.`
      );
    }
  }

  showConfirmation(
    "Konfirmasi simpan",
    buildConfirmText(),
    executeSave,
    "mdi-content-save-outline"
  );
};

const handleCancel = () => {
  showConfirmation(
    "Konfirmasi batal",
    "Data yang belum disimpan akan hilang. Lanjutkan?",
    resetForm,
    "mdi-refresh"
  );
};

const handleClose = () => {
  showConfirmation(
    "Konfirmasi tutup",
    "Tutup form dan kembali ke halaman browse?",
    () => router.push({ name: "MutasiStok" }),
    "mdi-close-circle-outline"
  );
};

const onSoSelected = (so: { Nomor: string }) => {
  dialog.soSearch = false;
  if (isEditMode.value) return;
  header.nomorSo = so.Nomor;
  loadDataFromSo(so.Nomor);
};

// --- WATCHERS ---
watch(
  [header, items],
  () => {
    if (isLoading.value || isSaving.value) return;
    const hasHeader = header.nomorSo !== "" || header.keterangan.trim() !== "";
    uiStore.setUnsavedChanges(hasHeader || items.value.length > 0);
  },
  { deep: true }
);

// Pindah antara kelompok SO <-> BS: isi daftar tidak berlaku lagi
watch(
  () => header.jenisMutasi,
  (baru, lama) => {
    if (isEditMode.value || isLoading.value) return;
    if (JENIS_BS.includes(baru) === JENIS_BS.includes(lama)) return;
    items.value = [];
    header.nomorSo = "";
    soLoaded.value = "";
    if (JENIS_BS.includes(baru)) focusScan();
  }
);

onMounted(() => {
  markAsSaved();

  if (!authStore.can(MENU_ID, requiredPermission.value)) {
    toast.error(`Anda tidak memiliki izin.`);
    router.push({ name: "MutasiStok" });
    return;
  }

  const refSo = route.query.refSo as string;
  const refJenis = route.query.jenis as string;

  if (refSo) {
    header.nomorSo = refSo;
    header.jenisMutasi = refJenis || "SP";
    loadDataFromSo(refSo);
  }

  const nomor = route.params.nomor as string;
  if (isEditMode.value && nomor) {
    loadDataForEdit(nomor);
  } else if (!refSo) {
    isLoading.value = false;
  }
});
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-swap-horizontal-bold">
    <template #header-actions>
      <v-btn
        size="small"
        class="btn-primary-red"
        prepend-icon="mdi-content-save"
        @click="handleSave"
        :loading="isSaving"
        :disabled="isSaving || !authStore.can(MENU_ID, requiredPermission)"
      >
        Simpan
      </v-btn>
      <v-btn
        size="small"
        class="btn-header-action"
        @click="handleCancel"
        prepend-icon="mdi-refresh"
      >
        Batal
      </v-btn>
      <v-btn size="small" class="btn-header-action" @click="handleClose" prepend-icon="mdi-close">
        Tutup
      </v-btn>
    </template>

    <div class="form-page">
      <!-- ══════════ KIRI: DOKUMEN ══════════ -->
      <div class="left-column">
        <section class="panel">
          <div class="panel-title">Dokumen</div>
          <div class="left-body">
            <div class="kv">
              <span class="kv-label">Nomor</span>
              <span class="kv-value doc-no">
                {{ isEditMode ? header.nomor : "Otomatis saat disimpan" }}
              </span>
            </div>

            <v-text-field
              v-model="header.tanggal"
              class="form-field"
              label="Tanggal"
              type="date"
              variant="outlined"
              density="compact"
              hide-details
            />

            <div class="field-block">
              <div class="field-label">Jenis mutasi</div>
              <v-btn-toggle
                v-model="tipeMutasi"
                mandatory
                divided
                density="compact"
                class="seg"
                :disabled="isEditMode"
              >
                <v-btn value="SP" size="small">Ke Pesanan</v-btn>
                <v-btn value="PS" size="small">Ke Showroom</v-btn>
                <v-btn value="BS" size="small">Bad Stock</v-btn>
              </v-btn-toggle>
              <div class="field-note">{{ KETERANGAN_JENIS[header.jenisMutasi] }}</div>
            </div>

            <div v-if="isBs" class="field-block">
              <div class="field-label">Lokasi bad stock</div>
              <v-btn-toggle
                v-model="header.jenisMutasi"
                mandatory
                divided
                density="compact"
                class="seg"
                :disabled="isEditMode"
              >
                <v-btn value="BC" size="small">BS Cetak</v-btn>
                <v-btn value="BP" size="small">BS Produksi</v-btn>
              </v-btn-toggle>
            </div>

            <v-text-field
              v-else
              :model-value="header.nomorSo"
              class="form-field"
              :class="{ 'is-locked': isEditMode, 'is-target': !header.nomorSo && !isEditMode }"
              label="No. Pesanan"
              variant="outlined"
              density="compact"
              hide-details
              readonly
              append-inner-icon="mdi-magnify"
              @click="bukaCariSo"
              @click:append-inner="bukaCariSo"
              @keydown.enter.prevent="bukaCariSo"
              @keydown.f1.prevent="bukaCariSo"
            />

            <v-textarea
              v-model="header.keterangan"
              class="form-field"
              label="Keterangan"
              variant="outlined"
              rows="3"
              density="compact"
              hide-details
            />
          </div>
        </section>
      </div>

      <!-- ══════════ KANAN: DETAIL BARANG ══════════ -->
      <div class="right-column">
        <section class="panel panel-detail">
          <div class="panel-head">
            <div class="panel-title head-title">Detail barang</div>
            <v-chip size="x-small" variant="tonal" color="grey-darken-1" class="mr-2">
              {{ items.length }} baris
            </v-chip>
            <v-spacer />
            <template v-if="isBs">
              <v-text-field
                ref="scanInput"
                v-model="scanTerm"
                class="form-field scan-field"
                placeholder="Scan barcode / QR lalu Enter"
                prepend-inner-icon="mdi-barcode-scan"
                variant="outlined"
                density="compact"
                hide-details
                autofocus
                :loading="isScanning"
                @keyup.enter="onScanBs"
              />
              <v-btn
                size="small"
                class="btn-header-action ml-2"
                prepend-icon="mdi-view-list-outline"
                @click="dialog.produk = true"
              >
                Pilih barang
              </v-btn>
            </template>
          </div>

          <v-data-table
            :headers="tableHeaders"
            :items="items"
            :loading="isLoading"
            :row-props="rowProps"
            density="compact"
            class="detail-table"
            fixed-header
            :items-per-page="-1"
          >
            <template #[`item.nama`]="{ item }">
              <span class="nama-barang-cell">{{ item.nama }}</span>
              <v-chip
                v-if="item.serials?.length"
                size="x-small"
                variant="tonal"
                color="grey-darken-1"
                class="ml-1"
              >
                {{ item.serials.length }} QR
              </v-chip>
            </template>
            <template #[`item.kurang`]="{ item }">
              <span :class="{ 'text-warn': item.kurang > 0 }">{{ item.kurang }}</span>
            </template>
            <template #[`item.jumlah`]="{ item }">
              <v-text-field
                v-model.number="item.jumlah"
                type="number"
                min="0"
                variant="underlined"
                density="compact"
                hide-details
                class="qty-input"
                :class="getQtyMutasiClass(item)"
                @focus="selectAll"
              />
            </template>
            <template #[`item.aksi`]="{ item }">
              <v-btn
                icon="mdi-delete-outline"
                size="x-small"
                variant="text"
                color="grey-darken-1"
                title="Hapus baris"
                @click="hapusBaris(item.id)"
              />
            </template>

            <template #loading>
              <div class="empty-state">
                <v-progress-circular indeterminate size="24" color="primary" />
                <div class="empty-text">Memuat data…</div>
              </div>
            </template>

            <template #no-data>
              <div class="empty-state">
                <div class="empty-icon">
                  <v-icon size="30">{{ emptyState.icon }}</v-icon>
                </div>
                <div class="empty-title">{{ emptyState.title }}</div>
                <div class="empty-text">{{ emptyState.text }}</div>
                <div class="empty-actions">
                  <template v-if="emptyState.mode === 'bs'">
                    <v-btn
                      size="small"
                      class="btn-primary-red"
                      prepend-icon="mdi-barcode-scan"
                      @click="focusScan"
                    >
                      Scan barcode / QR
                    </v-btn>
                    <v-btn
                      size="small"
                      class="btn-header-action"
                      prepend-icon="mdi-view-list-outline"
                      @click="dialog.produk = true"
                    >
                      Pilih dari daftar
                    </v-btn>
                  </template>
                  <v-btn
                    v-else-if="!isEditMode"
                    size="small"
                    class="btn-primary-red"
                    prepend-icon="mdi-magnify"
                    @click="bukaCariSo"
                  >
                    {{ emptyState.cta }}
                  </v-btn>
                </div>
                <div v-if="emptyState.hint" class="empty-hint">{{ emptyState.hint }}</div>
              </div>
            </template>

            <template #bottom></template>
          </v-data-table>

          <div class="detail-footer">
            <div class="summary-items">
              <span v-if="!isBs" class="sum">
                Stok pesan <b>{{ summaryTotals.totalPesan }}</b>
              </span>
              <span class="sum">
                Stok showroom <b>{{ summaryTotals.totalShowroom }}</b>
              </span>
              <span
                v-if="summaryTotals.overCount > 0"
                class="sum sum-warn"
                :title="
                  header.jenisMutasi === 'PS'
                    ? 'Qty melebihi stok pesanan, tidak bisa disimpan'
                    : 'Qty melebihi stok showroom, stok akan minus'
                "
              >
                {{ summaryTotals.overCount }} baris melebihi stok
              </span>
            </div>
            <div class="grand-bar">
              <span class="grand-label">Total qty mutasi</span>
              <span class="grand-value">{{ summaryTotals.totalJumlah }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <SoSearchModalForMutasi
      v-if="dialog.soSearch"
      @close="dialog.soSearch = false"
      @so-selected="onSoSelected"
    />

    <ProductSidePanel
      v-if="isBs"
      v-model="dialog.produk"
      theme="red"
      :gudang="authStore.user?.cabang || ''"
      @products-added="onProductsAdded"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="420px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="confirm-title">
          <v-icon size="20" class="mr-2">{{ dialogConfirm.icon }}</v-icon>
          {{ dialogConfirm.title }}
        </v-card-title>
        <v-card-text class="confirm-text">{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn size="small" variant="text" @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            size="small"
            class="btn-primary-red"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
          >
            Ya, lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Tema merah lokal (DESIGN.md 10.3) */
.form-page,
.dialog-card {
  --v-theme-primary: 183, 28, 28;
  --v-theme-on-primary: 255, 255, 255;
}

/* ══════════ TATA LETAK ══════════ */
.form-page {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
  font-size: 11px;
}
.left-column {
  min-height: 0;
  overflow-y: auto;
}
.right-column {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ══════════ PANEL ══════════ */
.panel {
  border: 1px solid rgba(183, 28, 28, 0.15);
  border-radius: 10px;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}
.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: #b71c1c;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
}
.panel-detail {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.panel-head {
  display: flex;
  align-items: center;
  padding: 0 10px 0 0;
  border-bottom: 1px solid rgba(183, 28, 28, 0.15);
  background: rgba(183, 28, 28, 0.03);
  flex-shrink: 0;
}
.head-title {
  border-bottom: none;
}
.left-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

/* ══════════ TOMBOL (konsisten dengan KomplainCustomerView) ══════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
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

/* ══════════ BLOK INFO & FIELD ══════════ */
.kv {
  border-left: 3px solid #b71c1c;
  padding: 4px 10px;
  background: rgba(183, 28, 28, 0.03);
  display: flex;
  flex-direction: column;
}
.kv-label,
.field-label {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.doc-no {
  font-size: 13px;
  font-weight: 700;
}
.field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-note {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.form-field :deep(.v-field) {
  --v-field-border-radius: 8px;
  font-size: 11px;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  box-shadow: none !important;
}
.form-field :deep(.v-field__outline) {
  color: #b71c1c;
  --v-field-border-opacity: 0.3;
}
.form-field :deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}
.form-field.is-locked :deep(.v-field) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
}
.form-field.is-locked :deep(.v-field__outline) {
  color: rgb(var(--v-theme-on-surface));
  --v-field-border-opacity: 0.15;
}
.form-field.is-target :deep(.v-field__outline) {
  --v-field-border-opacity: 1;
  --v-field-border-width: 2px;
}
.scan-field {
  flex: none;
  width: 260px;
}

/* Toggle pilihan: aktif merah solid */
.seg {
  width: 100%;
  height: 30px !important;
  border: 1px solid rgba(183, 28, 28, 0.3);
}
.seg :deep(.v-btn) {
  flex: 1;
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  color: #b71c1c;
}
.seg :deep(.v-btn--active) {
  background: #b71c1c !important;
  color: #ffffff !important;
}

/* ══════════ TABEL DETAIL ══════════ */
.detail-table {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  font-size: 11px;
}
.detail-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.detail-table :deep(thead tr th) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 36px !important;
  border-bottom: 2px solid #8e0000 !important;
  white-space: nowrap;
}
.detail-table :deep(tbody td) {
  font-size: 11px !important;
  white-space: nowrap;
  vertical-align: middle !important;
}
.detail-table :deep(tbody tr:nth-child(even) td) {
  background-color: rgba(183, 28, 28, 0.025);
}
.detail-table :deep(tbody tr:hover td) {
  background-color: rgba(183, 28, 28, 0.07);
}
.detail-table :deep(tbody tr.row-flash td) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.detail-table :deep(.v-data-table-column--align-end) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.nama-barang-cell {
  display: inline-block;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.text-warn {
  color: #b26a00;
  font-weight: 700;
}

.qty-input {
  max-width: 90px;
  margin-left: auto;
}
.qty-input :deep(input) {
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-height: 26px;
  padding: 0;
}
.qty-input.qty-warn :deep(input) {
  color: #b26a00;
  font-weight: 700;
}

/* ══════════ EMPTY STATE ══════════ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  text-align: center;
}
.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(183, 28, 28, 0.08);
  color: #b71c1c;
}
.empty-title {
  font-size: 13px;
  font-weight: 700;
}
.empty-text {
  font-size: 11px;
  max-width: 360px;
  color: rgba(var(--v-theme-on-surface), 0.65);
}
.empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.empty-hint {
  font-size: 10px;
  color: #b26a00;
}

/* ══════════ FOOTER TOTAL ══════════ */
.detail-footer {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  flex-shrink: 0;
  border-top: 1px solid rgba(183, 28, 28, 0.15);
  background: rgba(183, 28, 28, 0.03);
}
.summary-items {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  font-size: 11px;
}
.sum b {
  font-variant-numeric: tabular-nums;
}
.sum-warn {
  color: #b26a00;
  font-weight: 700;
}
.grand-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #b71c1c;
  color: #ffffff;
}
.grand-label {
  font-size: 12px;
  font-weight: 600;
}
.grand-value {
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

/* ══════════ DIALOG KONFIRMASI ══════════ */
.dialog-card {
  border-radius: 12px;
}
.confirm-title {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #b71c1c;
}
.confirm-text {
  font-size: 12px;
  white-space: pre-line;
}
</style>
