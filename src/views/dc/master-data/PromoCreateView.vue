<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MintaBarangSearchModal from "@/components/lookup/MintaBarangSearchModal.vue";
import type { AxiosError } from "axios";
import axios from "axios";

// ─── Tipe Data ────────────────────────────────────────────
interface Header {
  nomor: string;
  judul: string;
  tanggal1: string;
  tanggal2: string;
  jenis: number; // 1: Total Rp, 2: Total Qty, 3: Lain-lain, 4: Diskon Item
  totalRp: number;
  totalQty: number;
  diskonRp: number;
  diskonPersen: number;
  kelipatan: "Y" | "N";
  generate: "N" | "K" | "V";
  jenisKupon: "" | "BELANJA" | "UNDIAN";
  cetakKupon: "Y" | "N";
  rpVoucher: number;
  keterangan: string;
  note: string;
  f1: "Y" | "N";
  // [BARU] Aturan Lanjutan
  basis: "ALL" | "KATEGORI" | "TIPE" | "ITEM";
  excludeKode: string;
  includeKata: string;
  modeBarang: "TRIGGER" | "DISCOUNT";
  noMaps: boolean;
  noDiscMember: boolean;
}
interface BonusItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qty: number;
}
interface CabangLevelItem {
  berlaku: boolean;
  [key: string]: unknown;
}
interface ApplicableItem {
  id: number;
  kode: string;
  nama: string;
  ukuran: string;
  qty: number;
  harga: number;
  disc: number;
  diskon: number;
}
interface ProductItem {
  kode: string;
  nama: string;
  ukuran: string;
  harga?: number;
}

// ─── Inisialisasi & State ─────────────────────────────────
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "205";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? "Ubah Promo" : "Buat Promo"));
const tab = ref("detail-promo");

const header = reactive<Header>({
  nomor: "",
  judul: "",
  tanggal1: format(new Date(), "yyyy-MM-dd"),
  tanggal2: format(new Date(), "yyyy-MM-dd"),
  jenis: 1,
  totalRp: 0,
  totalQty: 0,
  diskonRp: 0,
  diskonPersen: 0,
  kelipatan: "N",
  generate: "N",
  jenisKupon: "",
  cetakKupon: "N",
  rpVoucher: 0,
  keterangan: "",
  note: "",
  f1: "N",
  // [BARU]
  basis: "ALL",
  excludeKode: "",
  includeKata: "",
  modeBarang: "TRIGGER",
  noMaps: false,
  noDiscMember: false,
});

const bonusItems = ref<BonusItem[]>([]);
const cabangList = ref<CabangLevelItem[]>([]);
const levelList = ref<CabangLevelItem[]>([]);
// [BARU] Daftar level untuk seksi "Level Dikecualikan"
const levelExcludeList = ref<CabangLevelItem[]>([]);

const isLoading = ref(true);
const isSaving = ref(false);

const isBonusSearchVisible = ref(false);
const activeBonusRowIndex = ref(0);
const isApplicableSearchVisible = ref(false);
const activeApplicableRowIndex = ref(0);
const applicableItemsPage = ref(1);
const applicableItemsPerPage = ref(10);
const applicableItemsTotal = ref(0);
const applicableItemsDirty = ref(false);
const applicableItems = ref<ApplicableItem[]>([]);

const dialogConfirm = reactive({
  show: false,
  title: "",
  text: "",
  onConfirm: () => {},
});

// ─── Konfigurasi Tabel ────────────────────────────────────
const bonusHeaders = [
  { title: "Kode Barang", key: "kode", width: "250px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "150px" },
  { title: "Qty", key: "qty", width: "150px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
];
const cabangHeaders = [
  { title: "Cabang", key: "cab" },
  { title: "Berlaku", key: "berlaku", align: "center" },
] as const;
const levelHeaders = [
  { title: "Kode", key: "kode" },
  { title: "Level Customer", key: "level" },
  { title: "Berlaku", key: "berlaku", align: "center" },
] as const;
const applicableHeaders = [
  { title: "Kode Barang", key: "kode", width: "120px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Qty", key: "qty", width: "60px" },
  { title: "Harga", key: "harga", width: "80px" },
  { title: "Disc %", key: "disc", width: "60px" },
  { title: "Diskon Rp", key: "diskon", width: "80px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
];

// ─── Label dinamis tab "Barang Pemicu" ────────────────────
const tabBarangLabel = computed(() =>
  header.modeBarang === "DISCOUNT" ? "Barang yang Dapat Diskon" : "Barang Pemicu Promo"
);
const tabBarangHint = computed(() =>
  header.modeBarang === "DISCOUNT"
    ? "Item di bawah ini akan mendapatkan potongan harga otomatis sesuai Disc % / Diskon Rp."
    : "Item di bawah ini wajib dibeli agar promo berlaku."
);

// ─── Methods ─────────────────────────────────────────────
const addNewBonusRow = () => {
  const last = bonusItems.value[bonusItems.value.length - 1];
  if (!last || last.kode)
    bonusItems.value.push({ id: Date.now(), kode: "", nama: "", ukuran: "", qty: 1 });
};

const removeBonusRow = (id: number) => {
  bonusItems.value = bonusItems.value.filter((i) => i.id !== id);
  if (bonusItems.value.length === 0) addNewBonusRow();
};

const openBonusSearch = (index: number) => {
  activeBonusRowIndex.value = index;
  isBonusSearchVisible.value = true;
};

const onBonusSelected = (products: ProductItem[]) => {
  isBonusSearchVisible.value = false;
  const selected = products[0];
  if (!selected) return;
  const isDuplicate = bonusItems.value.some(
    (b) => b.kode === selected.kode && b.ukuran === selected.ukuran
  );
  if (isDuplicate) return toast.warning("Barang bonus ini sudah ada di daftar.");
  const targetRow = bonusItems.value[activeBonusRowIndex.value];
  targetRow.kode = selected.kode;
  targetRow.nama = selected.nama;
  targetRow.ukuran = selected.ukuran;
  addNewBonusRow();
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeForm = () => router.push({ name: "Promo" });
const resetForm = () => router.go(0);
const handleCancel = () =>
  showConfirmation("Konfirmasi Batal", "Batalkan semua perubahan dan kosongkan form?", resetForm);

const save = () => {
  const requiredPermission = isEditMode.value ? "edit" : "insert";
  if (!authStore.can(MENU_ID, requiredPermission))
    return toast.error("Anda tidak memiliki hak akses untuk menyimpan data ini.");

  if (new Date(header.tanggal1) > new Date(header.tanggal2))
    return toast.error("Periode promo tidak valid.");
  if (!header.judul.trim()) return toast.error("Judul promo tidak boleh kosong.");
  if (header.jenis === 1 && (header.totalRp || 0) <= 0)
    return toast.error("Total Rp Belanja harus diisi jika jenis promo adalah Total Rp.");
  if (header.jenis === 2 && (header.totalQty || 0) <= 0)
    return toast.error("Total Qty Belanja harus diisi jika jenis promo adalah Total Qty.");
  if (header.generate === "K" && !header.jenisKupon)
    return toast.error("Silakan pilih jenis kupon (Undian atau Belanja).");
  if (authStore.user?.kode !== "ADMIN")
    return toast.error("Anda tidak berhak menyimpan data promo.");

  showConfirmation("Konfirmasi Simpan", "Anda yakin ingin menyimpan data promo ini?", executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const shouldSendApplicableItems =
      applicableItemsDirty.value && applicableItemsTotal.value <= applicableItems.value.length;

    const payload = {
      header,
      applicableItems: shouldSendApplicableItems
        ? applicableItems.value.filter((i) => i.kode)
        : null,
      bonusItems: bonusItems.value.filter((i) => i.kode),
      cabang: cabangList.value.filter((c) => c.berlaku).map((c) => c.cab),
      level: levelList.value.filter((l) => l.berlaku).map((l) => l.kode),
      // [BARU]
      levelExclude: levelExcludeList.value.filter((l) => l.berlaku).map((l) => l.kode),
      isNew: !isEditMode.value,
    };
    const response = await api.post("/promo-form/save", payload);
    toast.success(response.data.message);
    router.push({ name: "Promo" });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/promo-form/${nomor}`);
    const data = response.data;

    Object.assign(header, data.header);
    header.nomor = nomor;
    header.judul = data.header.pro_judul;
    header.tanggal1 = format(parseISO(data.header.pro_tanggal1), "yyyy-MM-dd");
    header.tanggal2 = format(parseISO(data.header.pro_tanggal2), "yyyy-MM-dd");
    header.jenis = data.header.pro_jenis;
    header.totalRp = data.header.pro_totalrp;
    header.totalQty = data.header.pro_totalqty;
    header.diskonRp = data.header.pro_disrp;
    header.diskonPersen = data.header.pro_dispersen;
    header.rpVoucher = data.header.pro_rpvoucher;
    header.kelipatan = data.header.pro_lipat;
    header.generate = data.header.pro_generate;
    header.f1 = data.header.pro_f1;
    header.jenisKupon = data.header.pro_jenis_kupon;
    header.cetakKupon = data.header.pro_cetak_kupon;
    header.keterangan = data.header.pro_keterangan;
    header.note = data.header.pro_note;
    // [BARU]
    header.basis = data.header.pro_basis || "ALL";
    header.excludeKode = data.header.pro_exclude_kode || "";
    header.includeKata = data.header.pro_include_kata || "";
    header.modeBarang = data.header.pro_mode_barang || "TRIGGER";
    header.noMaps = !!data.header.pro_no_maps;

    applicableItemsTotal.value = data.applicableItemsCount || data.applicableItems.length;
    applicableItems.value = data.applicableItems.map((item: ApplicableItem) => ({
      ...item,
      id: Math.random(),
    }));
    bonusItems.value = data.bonusItems.map((item: BonusItem) => ({
      ...item,
      id: Math.random(),
    }));

    // Cabang Berlaku
    cabangList.value.forEach((cabang) => {
      if (data.cabangBerlaku.includes(cabang.cab)) cabang.berlaku = true;
    });

    // Level Berlaku
    levelList.value.forEach((level) => {
      if (data.levelBerlaku.includes(level.kode)) level.berlaku = true;
    });

    // [BARU] Level Dikecualikan
    levelExcludeList.value.forEach((level) => {
      if ((data.levelExclude || []).includes(level.kode)) level.berlaku = true;
    });
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal memuat data promo.");
    router.back();
  } finally {
    addNewApplicableRow(false);
    addNewBonusRow();
    isLoading.value = false;
  }
};

const addNewApplicableRow = (setDirty = true) => {
  if (setDirty) applicableItemsDirty.value = true;
  const last = applicableItems.value[applicableItems.value.length - 1];
  if (!last || last.kode) {
    applicableItems.value.push({
      id: Date.now() + Math.random(),
      kode: "",
      nama: "",
      ukuran: "",
      qty: 0,
      harga: 0,
      disc: 0,
      diskon: 0,
    });
  }
};

const removeApplicableRow = (id: number) => {
  applicableItems.value = applicableItems.value.filter((i) => i.id !== id);
  if (applicableItems.value.length === 0) addNewApplicableRow();
};

const loadApplicableItems = async (nomor: string, page: number = 1) => {
  try {
    const response = await api.get(`/promo-form/${nomor}/applicable-items`, {
      params: { page, itemsPerPage: applicableItemsPerPage.value },
    });
    applicableItems.value = response.data.items.map((item: ApplicableItem) => ({
      ...item,
      id: Math.random(),
    }));
    applicableItemsTotal.value = response.data.total;
  } catch (error) {
    console.error("Error loading applicable items:", error);
    toast.error("Gagal memuat data barang pemicu promo.");
  }
};

const openApplicableSearch = (index: number) => {
  activeApplicableRowIndex.value = index;
  isApplicableSearchVisible.value = true;
};

const onApplicableSelected = (products: ApplicableItem[]) => {
  isApplicableSearchVisible.value = false;
  const selected = products[0];
  if (!selected) return;
  applicableItemsDirty.value = true;

  const isDuplicate = applicableItems.value.some(
    (item) => item.kode === selected.kode && item.ukuran === selected.ukuran
  );
  if (isDuplicate) return toast.warning("Barang ini sudah ada di daftar.");

  const targetRow = applicableItems.value[activeApplicableRowIndex.value];
  targetRow.kode = selected.kode;
  targetRow.nama = selected.nama;
  targetRow.ukuran = selected.ukuran;
  targetRow.harga = selected.harga || 0;
  addNewApplicableRow();
};

const setApplicableDirty = () => {
  applicableItemsDirty.value = true;
};

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  isLoading.value = true;
  try {
    const res = await api.get("/promo-form/initial-data");
    cabangList.value = res.data.cabang;
    levelList.value = res.data.level;
    // [BARU] Level exclude adalah salinan terpisah (array berbeda, berlaku = false semua)
    levelExcludeList.value = (res.data.levelExclude || res.data.level).map(
      (l: CabangLevelItem) => ({ ...l, berlaku: false })
    );

    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
      await loadDataForEdit(nomor);
    } else {
      addNewApplicableRow(false);
      addNewBonusRow();
    }
  } catch (err: unknown) {
    let msg = "Gagal memuat data awal.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    else if (err instanceof Error) msg = err.message;
    toast.error(msg);
  } finally {
    isLoading.value = false;
  }
});

// ─── Watchers ─────────────────────────────────────────────
watch(
  () => header.generate,
  (val) => {
    if (val !== "K") header.jenisKupon = "";
  }
);

watch(
  applicableItems,
  () => {
    if (!isLoading.value) applicableItemsDirty.value = true;
  },
  { deep: true }
);
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-gift">
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        prepend-icon="mdi-content-save"
        :loading="isSaving"
        @click="save"
      >
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">Batal</v-btn>
      <v-btn
        size="small"
        prepend-icon="mdi-close"
        @click="
          showConfirmation(
            'Konfirmasi Tutup',
            'Tutup form? Perubahan yang belum disimpan akan hilang.',
            closeForm
          )
        "
      >
        Tutup
      </v-btn>
    </template>

    <!-- ─── Tabs ─────────────────────────────────────────── -->
    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="detail-promo">Detail Promo</v-tab>
      <v-tab value="barang-bonus">{{ tabBarangLabel }}</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- ══════════════════════════════════════════════════
           TAB 1 — DETAIL PROMO
      ══════════════════════════════════════════════════ -->
      <v-window-item value="detail-promo">
        <div class="form-grid-container">
          <!-- ── Kolom Kiri: Data Utama Promo ──────────── -->
          <div class="header-main">
            <div class="desktop-form-section fill-height">
              <div class="text-subtitle-1 font-weight-bold mb-3">Data Promo</div>
              <v-row dense class="compact-form">
                <v-col cols="12">
                  <v-text-field
                    label="Nomor Promo"
                    v-model="header.nomor"
                    variant="outlined"
                    readonly
                    filled
                    hide-details
                    density="compact"
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    label="Judul"
                    v-model="header.judul"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    label="Tanggal Mulai"
                    v-model="header.tanggal1"
                    type="date"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    label="Tanggal Selesai"
                    v-model="header.tanggal2"
                    type="date"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>

                <v-col cols="12">
                  <v-radio-group
                    v-model="header.jenis"
                    inline
                    label="Jenis Promo"
                    hide-details
                    density="compact"
                  >
                    <v-radio label="Total Rp" :value="1" />
                    <v-radio label="Total Qty" :value="2" />
                    <v-radio label="Lain-lain" :value="3" />
                    <v-radio label="Diskon Item" :value="4" />
                  </v-radio-group>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    label="Minimal Belanja (Rp)"
                    v-model.number="header.totalRp"
                    type="number"
                    variant="outlined"
                    :disabled="header.jenis === 2"
                    hide-details
                    density="compact"
                  />
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    label="Minimal Qty"
                    v-model.number="header.totalQty"
                    type="number"
                    variant="outlined"
                    :disabled="header.jenis === 1"
                    hide-details
                    density="compact"
                  />
                </v-col>

                <v-col cols="12">
                  <v-select
                    label="Berlaku Kelipatan"
                    v-model="header.kelipatan"
                    :items="['Y', 'N']"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>

                <v-col cols="12">
                  <v-textarea
                    label="Keterangan"
                    v-model="header.keterangan"
                    rows="2"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>

                <v-col cols="12">
                  <v-textarea
                    label="Note (muncul di struk)"
                    v-model="header.note"
                    rows="2"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>

                <!-- ── [BARU] Aturan Lanjutan ────────── -->
                <v-col cols="12">
                  <v-divider class="my-2" />
                  <div class="section-label">Aturan Lanjutan</div>
                </v-col>

                <!-- Basis Perhitungan -->
                <v-col cols="12">
                  <v-select
                    label="Basis Item yang Dihitung"
                    v-model="header.basis"
                    :items="[
                      { title: 'Semua Item (default)', value: 'ALL' },
                      { title: 'Hanya Item di Tab Barang Pemicu', value: 'ITEM' },
                      { title: 'Filter Kategori (REGULER/SESIONAL)', value: 'KATEGORI' },
                      { title: 'Filter Tipe Barang (Polo, Hoodie…)', value: 'TIPE' },
                    ]"
                    variant="outlined"
                    hide-details
                    density="compact"
                  >
                    <template #item="{ item, props }">
                      <v-list-item v-bind="props">
                        <template #subtitle>
                          <span class="text-caption text-medium-emphasis">
                            <template v-if="item.value === 'ALL'">
                              Semua item masuk perhitungan diskon faktur
                            </template>
                            <template v-else-if="item.value === 'ITEM'">
                              Hanya item yang ada di tab "{{ tabBarangLabel }}"
                            </template>
                            <template v-else-if="item.value === 'KATEGORI'">
                              Hanya item berkategori REGULER
                            </template>
                            <template v-else-if="item.value === 'TIPE'">
                              Semua item kecuali yang ter-exclude
                            </template>
                          </span>
                        </template>
                      </v-list-item>
                    </template>
                  </v-select>
                </v-col>

                <!-- Exclude Kode -->
                <v-col cols="12">
                  <v-text-field
                    label="Kode Barang yang Dikecualikan (pisah koma)"
                    v-model="header.excludeKode"
                    placeholder="Contoh: KO-CB24-TRSD-001, KO-CB24-TRSD-002"
                    variant="outlined"
                    hide-details
                    density="compact"
                    hint="Kode barang yang tidak masuk basis diskon, pisah dengan koma"
                    persistent-hint
                  />
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    label="Hanya Berlaku untuk Nama Barang (pisah koma)"
                    v-model="header.includeKata"
                    placeholder="Contoh: COMBED 24S, POLO, KATUN AIR, HOODIE, ZIPPER"
                    variant="outlined"
                    hide-details
                    density="compact"
                    hint="Kosongkan = berlaku semua item. Isi = hanya item yang namanya mengandung kata ini."
                    persistent-hint
                  />
                </v-col>

                <!-- Mode Barang Pemicu -->
                <v-col cols="12">
                  <v-sheet class="pa-2 rounded" color="blue-lighten-5" border>
                    <div class="text-caption font-weight-bold text-blue-darken-3 mb-1">
                      Fungsi Tab "{{ tabBarangLabel }}"
                    </div>
                    <v-radio-group
                      v-model="header.modeBarang"
                      hide-details
                      density="compact"
                      inline
                    >
                      <v-radio
                        label="Syarat Pemicu (harus dibeli)"
                        value="TRIGGER"
                        color="blue-darken-2"
                      />
                      <v-radio
                        label="Item yang Dapat Diskon Otomatis"
                        value="DISCOUNT"
                        color="green-darken-2"
                      />
                    </v-radio-group>
                    <div class="text-caption text-medium-emphasis mt-1">
                      {{ tabBarangHint }}
                    </div>
                  </v-sheet>
                </v-col>

                <!-- No Maps -->
                <v-col cols="12">
                  <v-checkbox
                    v-model="header.noMaps"
                    color="orange-darken-2"
                    density="compact"
                    hide-details
                  >
                    <template #label>
                      <span class="text-body-2">
                        Tidak bisa digabung dengan
                        <strong class="text-orange-darken-2">Promo Maps Review 5%</strong>
                      </span>
                    </template>
                  </v-checkbox>
                </v-col>

                <v-checkbox
                  v-model="header.noDiscMember"
                  color="orange-darken-2"
                  density="compact"
                  hide-details
                >
                  <template #label>
                    <span class="text-body-2">
                      Tidak bisa digabung dengan
                      <strong class="text-orange-darken-2">Diskon Member (P1)</strong>
                    </span>
                  </template>
                </v-checkbox>
              </v-row>
            </div>
          </div>

          <!-- ── Kolom Kanan: Sub-sections ─────────────── -->
          <div class="sub-sections">
            <!-- Row atas: Cabang & Level Berlaku -->
            <div class="top-row">
              <div class="desktop-form-section fill-height">
                <div class="text-subtitle-1 font-weight-bold mb-2">Cabang Berlaku</div>
                <v-data-table
                  :headers="cabangHeaders"
                  :items="cabangList"
                  class="desktop-table header-browse-blue"
                  :items-per-page="-1"
                  density="compact"
                  fixed-header
                >
                  <template #[`item.berlaku`]="{ item }">
                    <v-checkbox-btn v-model="item.berlaku" hide-details />
                  </template>
                  <template #bottom />
                </v-data-table>
              </div>

              <div class="desktop-form-section fill-height">
                <div class="text-subtitle-1 font-weight-bold mb-2">Level Berlaku</div>
                <v-data-table
                  :headers="levelHeaders"
                  :items="levelList"
                  class="desktop-table header-browse-blue"
                  :items-per-page="-1"
                  density="compact"
                  fixed-header
                >
                  <template #[`item.berlaku`]="{ item }">
                    <v-checkbox-btn v-model="item.berlaku" hide-details />
                  </template>
                  <template #bottom />
                </v-data-table>
              </div>
            </div>

            <!-- Row tengah: [BARU] Level Dikecualikan -->
            <div class="desktop-form-section">
              <div class="d-flex align-center mb-2 gap-2">
                <v-icon color="red-darken-2" size="18">mdi-account-cancel</v-icon>
                <div class="text-subtitle-1 font-weight-bold text-red-darken-2">
                  Level TIDAK Dapat Promo
                </div>
                <v-tooltip location="top" max-width="260">
                  <template #activator="{ props }">
                    <v-icon v-bind="props" size="16" color="grey">mdi-information-outline</v-icon>
                  </template>
                  Customer dengan level yang dicentang di sini tidak akan mendapatkan promo ini,
                  meskipun total belanjaanya memenuhi syarat.
                </v-tooltip>
              </div>
              <v-data-table
                :headers="levelHeaders"
                :items="levelExcludeList"
                class="desktop-table"
                :items-per-page="-1"
                density="compact"
                fixed-header
                :height="160"
              >
                <template #[`item.berlaku`]="{ item }">
                  <v-checkbox-btn v-model="item.berlaku" hide-details color="red-darken-2" />
                </template>
                <template #bottom />
              </v-data-table>
            </div>

            <!-- Row bawah: Diskon & Generate -->
            <div class="bottom-row">
              <div class="desktop-form-section fill-height">
                <div class="text-subtitle-1 font-weight-bold mb-3">Diskon / Bonus</div>
                <v-row dense class="compact-form">
                  <v-col cols="6">
                    <v-text-field
                      label="Diskon Faktur Rp"
                      v-model.number="header.diskonRp"
                      type="number"
                      variant="outlined"
                      hide-details
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field
                      label="Diskon Faktur %"
                      v-model.number="header.diskonPersen"
                      type="number"
                      variant="outlined"
                      hide-details
                      density="compact"
                    />
                  </v-col>
                </v-row>

                <v-divider class="my-3" />

                <v-radio-group
                  v-model="header.generate"
                  label="Generate Otomatis"
                  hide-details
                  density="compact"
                >
                  <v-radio label="Tidak Ada" value="N" />
                  <v-radio label="Kupon" value="K" />
                  <v-radio label="Voucher" value="V" />
                </v-radio-group>

                <div v-if="header.generate === 'K'" class="pl-8 mt-2">
                  <v-radio-group
                    v-model="header.jenisKupon"
                    label="Jenis Kupon"
                    hide-details
                    density="compact"
                  >
                    <v-radio label="Kupon Undian" value="UNDIAN" />
                    <v-radio label="Kupon Belanja" value="BELANJA" />
                  </v-radio-group>
                  <v-checkbox
                    v-model="header.cetakKupon"
                    true-value="Y"
                    false-value="N"
                    label="Cetak Kupon Otomatis"
                    hide-details
                    density="compact"
                  />
                </div>

                <div v-if="header.generate === 'V'" class="pl-8 mt-2">
                  <v-text-field
                    label="Nominal Voucher Pembayaran"
                    v-model.number="header.rpVoucher"
                    type="number"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-window-item>

      <!-- ══════════════════════════════════════════════════
           TAB 2 — BARANG PEMICU / DAPAT DISKON + BONUS
      ══════════════════════════════════════════════════ -->
      <v-window-item value="barang-bonus">
        <div class="form-grid-container">
          <!-- ── Barang Pemicu / Dapat Diskon ─────────── -->
          <div class="desktop-form-section d-flex flex-column" style="min-height: 400px">
            <!-- Header seksi dengan badge mode -->
            <div class="d-flex align-center gap-2 mb-2">
              <div class="text-subtitle-1 font-weight-bold">{{ tabBarangLabel }}</div>
              <v-chip
                size="x-small"
                :color="header.modeBarang === 'DISCOUNT' ? 'green-darken-2' : 'blue-darken-2'"
                variant="flat"
                class="text-white font-weight-bold"
              >
                {{ header.modeBarang === "DISCOUNT" ? "MODE DISKON ITEM" : "MODE PEMICU" }}
              </v-chip>
            </div>

            <!-- Info hint -->
            <v-alert
              :type="header.modeBarang === 'DISCOUNT' ? 'success' : 'info'"
              variant="tonal"
              density="compact"
              class="mb-3 text-body-2"
            >
              {{ tabBarangHint }}
              <template v-if="header.modeBarang === 'DISCOUNT'">
                Kolom <strong>Disc %</strong> dan <strong>Diskon Rp</strong> akan diterapkan
                otomatis ke invoice saat item ini ada di keranjang.
              </template>
            </v-alert>

            <v-data-table-server
              :headers="applicableHeaders"
              :items="applicableItems"
              class="desktop-table flex-grow-1"
              v-model:page="applicableItemsPage"
              :items-per-page="applicableItemsPerPage"
              :items-length="applicableItemsTotal"
              density="compact"
              fixed-header
              @update:page="isEditMode && loadApplicableItems(header.nomor, $event)"
              @update:items-per-page="
                applicableItemsPerPage = $event;
                isEditMode && loadApplicableItems(header.nomor, 1);
              "
            >
              <template #[`item.kode`]="{ item, index }">
                <v-text-field
                  v-model="item.kode"
                  variant="underlined"
                  density="compact"
                  hide-details
                  placeholder="F1..."
                  @keydown.f1.prevent="openApplicableSearch(index)"
                />
              </template>
              <template #[`item.qty`]="{ item }">
                <v-text-field
                  v-model.number="item.qty"
                  @change="setApplicableDirty"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end"
                />
              </template>
              <template #[`item.harga`]="{ item }">
                <v-text-field
                  v-model.number="item.harga"
                  @change="setApplicableDirty"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end"
                />
              </template>
              <template #[`item.disc`]="{ item }">
                <v-text-field
                  v-model.number="item.disc"
                  @change="setApplicableDirty"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end"
                  :class="{
                    'text-green-darken-2 font-weight-bold':
                      header.modeBarang === 'DISCOUNT' && item.disc > 0,
                  }"
                />
              </template>
              <template #[`item.diskon`]="{ item }">
                <v-text-field
                  v-model.number="item.diskon"
                  @change="setApplicableDirty"
                  type="number"
                  variant="underlined"
                  density="compact"
                  hide-details
                  class="text-end"
                  :class="{
                    'text-green-darken-2 font-weight-bold':
                      header.modeBarang === 'DISCOUNT' && item.diskon > 0,
                  }"
                />
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn
                  v-if="item.kode"
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click="removeApplicableRow(item.id)"
                />
              </template>
            </v-data-table-server>
          </div>

          <!-- ── Barang Bonus ───────────────────────────── -->
          <div class="desktop-form-section d-flex flex-column" style="min-height: 400px">
            <div class="text-subtitle-1 font-weight-bold mb-2">Detail Barang Bonus</div>
            <v-alert type="info" variant="tonal" density="compact" class="mb-3 text-body-2">
              Item gratis yang diberikan saat promo terpenuhi (generate = Bonus Item).
            </v-alert>
            <v-data-table
              :headers="bonusHeaders"
              :items="bonusItems"
              class="desktop-table flex-grow-1"
              :items-per-page="-1"
              density="compact"
              fixed-header
            >
              <template #[`item.kode`]="{ item, index }">
                <v-text-field
                  v-model="item.kode"
                  variant="underlined"
                  density="compact"
                  hide-details
                  placeholder="F1..."
                  @keydown.f1.prevent="openBonusSearch(index)"
                />
              </template>
              <template #[`item.qty`]="{ item }">
                <v-text-field
                  v-model.number="item.qty"
                  type="number"
                  variant="underlined"
                  class="text-end"
                  density="compact"
                  hide-details
                />
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn
                  v-if="item.kode"
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click="removeBonusRow(item.id)"
                />
              </template>
              <template #bottom>
                <div class="pa-2 text-right">
                  <v-btn size="small" @click="addNewBonusRow">+ Tambah Bonus</v-btn>
                </div>
              </template>
            </v-data-table>
          </div>
        </div>
      </v-window-item>
    </v-window>

    <!-- ─── Modals ────────────────────────────────────── -->
    <MintaBarangSearchModal
      v-if="isApplicableSearchVisible"
      source="promo-applicable"
      :gudang="authStore.user?.cabang || ''"
      @close="isApplicableSearchVisible = false"
      @products-selected="onApplicableSelected"
    />
    <MintaBarangSearchModal
      v-if="isBonusSearchVisible"
      source="promo-bonus"
      :gudang="authStore.user?.cabang || ''"
      @close="isBonusSearchVisible = false"
      @products-selected="onBonusSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
          >
            Ya, Lanjutkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px;
}
.header-main {
  grid-column: 1 / 2;
}
.sub-sections {
  grid-column: 2 / 3;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.top-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.bottom-row {
  flex: 1;
}

.section-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(var(--v-theme-primary), 1);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.desktop-form-section {
  background-color: #fff;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}
.fill-height {
  height: 100%;
}
.desktop-table {
  flex-grow: 1;
}

.compact-form {
  row-gap: 6px !important;
  margin: 0 !important;
}
.compact-form :deep(.v-col) {
  padding: 3px 6px !important;
}
.compact-form :deep(.v-field__input) {
  padding: 8px 12px !important;
  min-height: 36px !important;
}
.compact-form :deep(.v-label) {
  font-size: 11px !important;
  opacity: 0.9;
}

.text-subtitle-1 {
  font-size: 13px !important;
  margin: 0 0 6px !important;
  font-weight: 600;
}

.desktop-table :deep(thead tr th) {
  background-color: #0d47a1 !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: none !important;
}
</style>
