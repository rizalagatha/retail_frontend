<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MintaBarangSearchModal from "@/components/lookup/MintaBarangSearchModal.vue";
import type { AxiosError } from "axios";
import axios from "axios";

// ─── Types ────────────────────────────────────────────────
interface Header {
  nomor: string;
  judul: string;
  tanggal1: string;
  tanggal2: string;
  jenis: number;
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

// ─── Init ─────────────────────────────────────────────────
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "205";

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => (isEditMode.value ? "Ubah Promo" : "Buat Promo"));
const tab = ref("detail");

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
const levelExcludeList = ref<CabangLevelItem[]>([]);

const isLoading = ref(true);
const isSaving = ref(false);

const isBonusSearchVisible = ref(false);
const isMultiBonusSearch = ref(false);
const activeBonusRowIndex = ref(0);
const isApplicableSearchVisible = ref(false);
const isMultiApplicableSearch = ref(false);
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

// ─── Headers ──────────────────────────────────────────────
const cabangHeaders = [
  { title: "Cabang", key: "cab", width: "90px" },
  { title: "Berlaku", key: "berlaku", align: "center" as const, width: "70px" },
];
const levelHeaders = [
  { title: "Kode", key: "kode", width: "50px" },
  { title: "Level Customer", key: "level" },
  { title: "Berlaku", key: "berlaku", align: "center" as const, width: "70px" },
];
const applicableHeaders = [
  { title: "Kode", key: "kode", width: "130px" },
  { title: "Nama", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "60px" },
  { title: "Qty", key: "qty", width: "55px", align: "end" as const },
  { title: "Harga", key: "harga", width: "80px", align: "end" as const },
  { title: "Disc %", key: "disc", width: "60px", align: "end" as const },
  { title: "Diskon Rp", key: "diskon", width: "80px", align: "end" as const },
  { title: "", key: "actions", sortable: false, width: "36px" },
];
const bonusHeaders = [
  { title: "Kode", key: "kode", width: "160px" },
  { title: "Nama", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "70px" },
  { title: "Qty", key: "qty", width: "55px" },
  { title: "", key: "actions", sortable: false, width: "36px" },
];

// ─── Computed ─────────────────────────────────────────────
const tabBarangLabel = computed(() =>
  header.modeBarang === "DISCOUNT" ? "Barang Dapat Diskon" : "Barang Pemicu"
);
const tabBarangHint = computed(() =>
  header.modeBarang === "DISCOUNT"
    ? "Item berikut akan mendapat potongan harga otomatis sesuai Disc % / Diskon Rp."
    : "Item berikut wajib dibeli agar promo berlaku."
);

// ─── Row Methods ──────────────────────────────────────────
const addNewBonusRow = () => {
  const last = bonusItems.value[bonusItems.value.length - 1];
  if (!last || last.kode)
    bonusItems.value.push({ id: Date.now(), kode: "", nama: "", ukuran: "", qty: 1 });
};

const removeBonusRow = (id: number) => {
  bonusItems.value = bonusItems.value.filter((i) => i.id !== id);
  if (!bonusItems.value.length) addNewBonusRow();
};

const addNewApplicableRow = (setDirty = true) => {
  if (setDirty) applicableItemsDirty.value = true;
  const last = applicableItems.value[applicableItems.value.length - 1];
  if (!last || last.kode)
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
};

const removeApplicableRow = (id: number) => {
  applicableItems.value = applicableItems.value.filter((i) => i.id !== id);
  if (!applicableItems.value.length) addNewApplicableRow();
};

// ─── Search Modal ─────────────────────────────────────────
const openApplicableSearch = (index: number, multi = false) => {
  activeApplicableRowIndex.value = index;
  isMultiApplicableSearch.value = multi;
  isApplicableSearchVisible.value = true;
};

const onApplicableSelected = (products: ApplicableItem[]) => {
  isApplicableSearchVisible.value = false;
  if (!products.length) return;
  applicableItemsDirty.value = true;

  if (isMultiApplicableSearch.value) {
    // Multi: tambahkan semua yang belum ada
    products.forEach((selected) => {
      const isDup = applicableItems.value.some(
        (i) => i.kode === selected.kode && i.ukuran === selected.ukuran
      );
      if (!isDup) {
        // Masukkan sebelum baris kosong terakhir
        const emptyIdx = applicableItems.value.findIndex((i) => !i.kode);
        const newItem = {
          id: Date.now() + Math.random(),
          kode: selected.kode,
          nama: selected.nama,
          ukuran: selected.ukuran,
          qty: 0,
          harga: selected.harga || 0,
          disc: 0,
          diskon: 0,
        };
        if (emptyIdx !== -1) applicableItems.value.splice(emptyIdx, 0, newItem);
        else applicableItems.value.push(newItem);
      }
    });
    addNewApplicableRow(false);
  } else {
    const selected = products[0];
    const isDup = applicableItems.value.some(
      (i) => i.kode === selected.kode && i.ukuran === selected.ukuran
    );
    if (isDup) return toast.warning("Barang ini sudah ada di daftar.");
    const target = applicableItems.value[activeApplicableRowIndex.value];
    target.kode = selected.kode;
    target.nama = selected.nama;
    target.ukuran = selected.ukuran;
    target.harga = selected.harga || 0;
    addNewApplicableRow();
  }
};

const openBonusSearch = (index: number, multi = false) => {
  activeBonusRowIndex.value = index;
  isMultiBonusSearch.value = multi;
  isBonusSearchVisible.value = true;
};

const onBonusSelected = (products: ProductItem[]) => {
  isBonusSearchVisible.value = false;
  if (!products.length) return;

  if (isMultiBonusSearch.value) {
    products.forEach((selected) => {
      const isDup = bonusItems.value.some(
        (b) => b.kode === selected.kode && b.ukuran === selected.ukuran
      );
      if (!isDup) {
        const emptyIdx = bonusItems.value.findIndex((i) => !i.kode);
        const newItem = {
          id: Date.now() + Math.random(),
          kode: selected.kode,
          nama: selected.nama,
          ukuran: selected.ukuran,
          qty: 1,
        };
        if (emptyIdx !== -1) bonusItems.value.splice(emptyIdx, 0, newItem);
        else bonusItems.value.push(newItem);
      }
    });
    addNewBonusRow();
  } else {
    const selected = products[0];
    const isDup = bonusItems.value.some(
      (b) => b.kode === selected.kode && b.ukuran === selected.ukuran
    );
    if (isDup) return toast.warning("Barang bonus ini sudah ada.");
    const target = bonusItems.value[activeBonusRowIndex.value];
    target.kode = selected.kode;
    target.nama = selected.nama;
    target.ukuran = selected.ukuran;
    addNewBonusRow();
  }
};

const setApplicableDirty = () => {
  applicableItemsDirty.value = true;
};

// ─── Dialog Confirm ───────────────────────────────────────
const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  Object.assign(dialogConfirm, { title, text, onConfirm, show: true });
};

const closeForm = () => router.push({ name: "Promo" });
const resetForm = () => router.go(0);
const handleCancel = () =>
  showConfirmation("Konfirmasi Batal", "Batalkan semua perubahan?", resetForm);

// ─── Save ─────────────────────────────────────────────────
const save = () => {
  const perm = isEditMode.value ? "edit" : "insert";
  if (!authStore.can(MENU_ID, perm)) return toast.error("Tidak memiliki hak akses.");
  if (new Date(header.tanggal1) > new Date(header.tanggal2))
    return toast.error("Periode tidak valid.");
  if (!header.judul.trim()) return toast.error("Judul promo tidak boleh kosong.");
  if (header.jenis === 1 && (header.totalRp || 0) <= 0)
    return toast.error("Minimal Belanja (Rp) harus diisi.");
  if (header.jenis === 2 && (header.totalQty || 0) <= 0)
    return toast.error("Minimal Qty harus diisi.");
  if (header.generate === "K" && !header.jenisKupon) return toast.error("Pilih jenis kupon.");
  if (authStore.user?.kode !== "ADMIN")
    return toast.error("Anda tidak berhak menyimpan data promo.");
  showConfirmation("Konfirmasi Simpan", "Simpan data promo ini?", executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const sendItems =
      applicableItemsDirty.value && applicableItemsTotal.value <= applicableItems.value.length;
    const payload = {
      header,
      applicableItems: sendItems ? applicableItems.value.filter((i) => i.kode) : null,
      bonusItems: bonusItems.value.filter((i) => i.kode),
      cabang: cabangList.value.filter((c) => c.berlaku).map((c) => c.cab),
      level: levelList.value.filter((l) => l.berlaku).map((l) => l.kode),
      isNew: !isEditMode.value,
    };
    const res = await api.post("/promo-form/save", payload);
    toast.success(res.data.message);
    router.push({ name: "Promo" });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menyimpan data.");
  } finally {
    isSaving.value = false;
  }
};

// ─── Load ─────────────────────────────────────────────────
const loadApplicableItems = async (nomor: string, page = 1) => {
  try {
    const res = await api.get(`/promo-form/${nomor}/applicable-items`, {
      params: { page, itemsPerPage: applicableItemsPerPage.value },
    });
    applicableItems.value = res.data.items.map((i: ApplicableItem) => ({
      ...i,
      id: Math.random(),
    }));
    applicableItemsTotal.value = res.data.total;
  } catch {
    toast.error("Gagal memuat data barang.");
  }
};

const loadDataForEdit = async (nomor: string) => {
  try {
    const res = await api.get(`/promo-form/${nomor}`);
    const d = res.data;
    Object.assign(header, d.header);
    header.nomor = nomor;
    header.judul = d.header.pro_judul;
    header.tanggal1 = format(parseISO(d.header.pro_tanggal1), "yyyy-MM-dd");
    header.tanggal2 = format(parseISO(d.header.pro_tanggal2), "yyyy-MM-dd");
    header.jenis = d.header.pro_jenis;
    header.totalRp = d.header.pro_totalrp;
    header.totalQty = d.header.pro_totalqty;
    header.diskonRp = d.header.pro_disrp;
    header.diskonPersen = d.header.pro_dispersen;
    header.rpVoucher = d.header.pro_rpvoucher;
    header.kelipatan = d.header.pro_lipat;
    header.generate = d.header.pro_generate;
    header.f1 = d.header.pro_f1;
    header.jenisKupon = d.header.pro_jenis_kupon;
    header.cetakKupon = d.header.pro_cetak_kupon;
    header.keterangan = d.header.pro_keterangan;
    header.note = d.header.pro_note;
    header.basis = d.header.pro_basis || "ALL";
    header.excludeKode = d.header.pro_exclude_kode || "";
    header.includeKata = d.header.pro_include_kata || "";
    header.modeBarang = d.header.pro_mode_barang || "TRIGGER";
    header.noMaps = !!d.header.pro_no_maps;

    applicableItemsTotal.value = d.applicableItemsCount || d.applicableItems.length;
    applicableItems.value = d.applicableItems.map((i: ApplicableItem) => ({
      ...i,
      id: Math.random(),
    }));
    bonusItems.value = d.bonusItems.map((i: BonusItem) => ({ ...i, id: Math.random() }));

    cabangList.value.forEach((c) => {
      if (d.cabangBerlaku.includes(c.cab)) c.berlaku = true;
    });
    levelList.value.forEach((l) => {
      if (d.levelBerlaku.includes(l.kode)) l.berlaku = true;
    });
    levelExcludeList.value.forEach((l) => {
      if ((d.levelExclude || []).includes(l.kode)) l.berlaku = true;
    });
  } catch (err) {
    const e = err as AxiosError<{ message?: string }>;
    toast.error(e.response?.data?.message || "Gagal memuat data promo.");
    router.back();
  } finally {
    addNewApplicableRow(false);
    addNewBonusRow();
    isLoading.value = false;
  }
};

const handleApplicableKeydown = (e: KeyboardEvent, index: number) => {
  if (e.key === "F1") {
    e.preventDefault();
    openApplicableSearch(index, false);
  } else if (e.key === "F2") {
    e.preventDefault();
    openApplicableSearch(index, true);
  }
};

const handleBonusKeydown = (e: KeyboardEvent, index: number) => {
  if (e.key === "F1") {
    e.preventDefault();
    openBonusSearch(index, false);
  } else if (e.key === "F2") {
    e.preventDefault();
    openBonusSearch(index, true);
  }
};

onMounted(async () => {
  isLoading.value = true;
  try {
    const res = await api.get("/promo-form/initial-data");
    cabangList.value = res.data.cabang;
    levelList.value = res.data.level;
    levelExcludeList.value = (res.data.levelExclude || res.data.level).map(
      (l: CabangLevelItem) => ({ ...l, berlaku: false })
    );
    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) await loadDataForEdit(nomor);
    else {
      addNewApplicableRow(false);
      addNewBonusRow();
      isLoading.value = false;
    }
  } catch (err: unknown) {
    let msg = "Gagal memuat data awal.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
    isLoading.value = false;
  }
});

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
            'Tutup Form',
            'Tutup? Perubahan yang belum disimpan akan hilang.',
            closeForm
          )
        "
      >
        Tutup
      </v-btn>
    </template>

    <div class="promo-root">
      <!-- ── Tabs ─────────────────────────────────────── -->
      <v-tabs v-model="tab" density="compact" class="promo-tabs">
        <v-tab value="detail">Detail Promo</v-tab>
        <v-tab value="barang">{{ tabBarangLabel }}</v-tab>
      </v-tabs>

      <div class="promo-body">
        <!-- ══ TAB DETAIL ══════════════════════════════ -->
        <div v-show="tab === 'detail'" class="detail-grid">
          <!-- ── Kolom 1: Data Utama (tanpa Aturan Lanjutan) ── -->
          <div class="panel col-left">
            <div class="panel-title">Data Promo</div>
            <v-row dense class="cf">
              <v-col cols="12">
                <v-text-field
                  label="Nomor"
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
                  label="Tgl Mulai"
                  v-model="header.tanggal1"
                  type="date"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  label="Tgl Selesai"
                  v-model="header.tanggal2"
                  type="date"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>

              <v-col cols="12">
                <div class="field-label">Jenis Promo</div>
                <div class="inline-radio-group">
                  <label
                    v-for="opt in [
                      { l: 'Total Rp', v: 1 },
                      { l: 'Total Qty', v: 2 },
                      { l: 'Lain-lain', v: 3 },
                      { l: 'Diskon Item', v: 4 },
                    ]"
                    :key="opt.v"
                    class="radio-chip"
                    :class="{ active: header.jenis === opt.v }"
                  >
                    <input type="radio" v-model="header.jenis" :value="opt.v" hidden />{{ opt.l }}
                  </label>
                </div>
              </v-col>

              <v-col cols="6">
                <v-text-field
                  label="Min. Belanja (Rp)"
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
                  label="Min. Qty"
                  v-model.number="header.totalQty"
                  type="number"
                  variant="outlined"
                  :disabled="header.jenis === 1"
                  hide-details
                  density="compact"
                />
              </v-col>

              <v-col cols="12">
                <div class="toggle-row">
                  <span class="field-label">Berlaku Kelipatan</span>
                  <div class="toggle-chips">
                    <span
                      class="toggle-chip"
                      :class="{ on: header.kelipatan === 'Y' }"
                      @click="header.kelipatan = 'Y'"
                      >Ya</span
                    >
                    <span
                      class="toggle-chip"
                      :class="{ on: header.kelipatan === 'N' }"
                      @click="header.kelipatan = 'N'"
                      >Tidak</span
                    >
                  </div>
                </div>
              </v-col>

              <v-col cols="6">
                <v-text-field
                  label="Diskon Rp"
                  v-model.number="header.diskonRp"
                  type="number"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  label="Diskon %"
                  v-model.number="header.diskonPersen"
                  type="number"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>

              <v-col cols="12">
                <div class="field-label">Generate Otomatis</div>
                <div class="inline-radio-group">
                  <label
                    v-for="opt in [
                      { l: 'Tidak Ada', v: 'N' },
                      { l: 'Kupon', v: 'K' },
                      { l: 'Voucher', v: 'V' },
                    ]"
                    :key="opt.v"
                    class="radio-chip"
                    :class="{ active: header.generate === opt.v }"
                  >
                    <input type="radio" v-model="header.generate" :value="opt.v" hidden />{{
                      opt.l
                    }}
                  </label>
                </div>
              </v-col>

              <template v-if="header.generate === 'K'">
                <v-col cols="12">
                  <div class="field-label">Jenis Kupon</div>
                  <div class="inline-radio-group">
                    <label
                      v-for="opt in [
                        { l: 'Undian', v: 'UNDIAN' },
                        { l: 'Belanja', v: 'BELANJA' },
                      ]"
                      :key="opt.v"
                      class="radio-chip"
                      :class="{ active: header.jenisKupon === opt.v }"
                    >
                      <input type="radio" v-model="header.jenisKupon" :value="opt.v" hidden />{{
                        opt.l
                      }}
                    </label>
                  </div>
                </v-col>
                <v-col cols="12">
                  <div class="toggle-row">
                    <span class="field-label">Cetak Kupon Otomatis</span>
                    <div class="toggle-chips">
                      <span
                        class="toggle-chip"
                        :class="{ on: header.cetakKupon === 'Y' }"
                        @click="header.cetakKupon = 'Y'"
                        >Ya</span
                      >
                      <span
                        class="toggle-chip"
                        :class="{ on: header.cetakKupon === 'N' }"
                        @click="header.cetakKupon = 'N'"
                        >Tidak</span
                      >
                    </div>
                  </div>
                </v-col>
              </template>

              <template v-if="header.generate === 'V'">
                <v-col cols="12">
                  <v-text-field
                    label="Nominal Voucher"
                    v-model.number="header.rpVoucher"
                    type="number"
                    variant="outlined"
                    hide-details
                    density="compact"
                  />
                </v-col>
              </template>
            </v-row>
          </div>

          <!-- ── Kolom 2: Cabang & Level Berlaku ──────── -->
          <div class="col-mid">
            <div class="two-col-tables">
              <div class="panel small-panel">
                <div class="panel-title">Cabang Berlaku</div>
                <v-data-table
                  :headers="cabangHeaders"
                  :items="cabangList"
                  class="compact-table"
                  :items-per-page="-1"
                  density="compact"
                  fixed-header
                  hide-default-footer
                >
                  <template #[`item.berlaku`]="{ item }">
                    <v-checkbox-btn v-model="item.berlaku" hide-details density="compact" />
                  </template>
                </v-data-table>
              </div>
              <div class="panel small-panel">
                <div class="panel-title">Level Berlaku</div>
                <v-data-table
                  :headers="levelHeaders"
                  :items="levelList"
                  class="compact-table"
                  :items-per-page="-1"
                  density="compact"
                  fixed-header
                  hide-default-footer
                >
                  <template #[`item.berlaku`]="{ item }">
                    <v-checkbox-btn v-model="item.berlaku" hide-details density="compact" />
                  </template>
                </v-data-table>
              </div>
            </div>
          </div>

          <!-- ── Kolom 3: Aturan Lanjutan ──────────── -->
          <div class="panel col-right">
            <div class="panel-title">Aturan Lanjutan</div>
            <v-row dense class="cf">
              <v-col cols="12">
                <v-select
                  label="Basis Item"
                  v-model="header.basis"
                  density="compact"
                  hide-details
                  variant="outlined"
                  :items="[
                    { title: 'Semua Item', value: 'ALL' },
                    { title: 'Hanya Item di Tab Barang', value: 'ITEM' },
                    { title: 'Filter Kategori (REGULER)', value: 'KATEGORI' },
                    { title: 'Filter Tipe Barang', value: 'TIPE' },
                  ]"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  label="Kode Dikecualikan (pisah koma)"
                  v-model="header.excludeKode"
                  placeholder="KO-CB24-001, KO-CB24-002"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  label="Hanya Nama Mengandung (pisah koma)"
                  v-model="header.includeKata"
                  placeholder="COMBED 24S, POLO, HOODIE"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>

              <v-col cols="12">
                <v-divider class="my-1" />
                <div class="field-label mt-1">Fungsi Tab "{{ tabBarangLabel }}"</div>
                <div class="inline-radio-group">
                  <label class="radio-chip" :class="{ active: header.modeBarang === 'TRIGGER' }">
                    <input type="radio" v-model="header.modeBarang" value="TRIGGER" hidden />
                    Syarat Pemicu
                  </label>
                  <label
                    class="radio-chip green"
                    :class="{ active: header.modeBarang === 'DISCOUNT' }"
                  >
                    <input type="radio" v-model="header.modeBarang" value="DISCOUNT" hidden />
                    Diskon Otomatis
                  </label>
                </div>
                <div class="hint-text">{{ tabBarangHint }}</div>
              </v-col>

              <v-col cols="12">
                <v-divider class="my-1" />
                <div class="flag-group mt-1">
                  <label class="flag-item" :class="{ flagged: header.noMaps }">
                    <input type="checkbox" v-model="header.noMaps" hidden />
                    <v-icon size="13" :color="header.noMaps ? 'orange-darken-2' : 'grey-lighten-1'">
                      {{ header.noMaps ? "mdi-checkbox-marked" : "mdi-checkbox-blank-outline" }}
                    </v-icon>
                    Tidak bisa digabung Maps 5%
                  </label>
                  <label class="flag-item" :class="{ flagged: header.noDiscMember }">
                    <input type="checkbox" v-model="header.noDiscMember" hidden />
                    <v-icon
                      size="13"
                      :color="header.noDiscMember ? 'orange-darken-2' : 'grey-lighten-1'"
                    >
                      {{
                        header.noDiscMember ? "mdi-checkbox-marked" : "mdi-checkbox-blank-outline"
                      }}
                    </v-icon>
                    Tidak bisa digabung Diskon Member
                  </label>
                </div>
              </v-col>

              <!-- Keterangan & Note dipindah ke sini -->
              <v-col cols="12"><v-divider class="my-1" /></v-col>
              <v-col cols="12">
                <v-textarea
                  label="Keterangan"
                  v-model="header.keterangan"
                  rows="3"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  label="Note (muncul di struk)"
                  v-model="header.note"
                  rows="3"
                  variant="outlined"
                  hide-details
                  density="compact"
                />
              </v-col>
            </v-row>
          </div>
        </div>

        <!-- ══ TAB BARANG ══════════════════════════════ -->
        <div v-show="tab === 'barang'" class="barang-grid">
          <!-- Barang Pemicu / Dapat Diskon -->
          <div class="panel flex-panel">
            <div class="d-flex align-center gap-2 mb-2">
              <div class="panel-title mb-0">{{ tabBarangLabel }}</div>
              <v-chip
                size="x-small"
                :color="header.modeBarang === 'DISCOUNT' ? 'green-darken-2' : 'blue-darken-2'"
                variant="flat"
                class="font-weight-bold text-white"
              >
                {{ header.modeBarang === "DISCOUNT" ? "DISKON ITEM" : "PEMICU" }}
              </v-chip>
            </div>
            <div class="hint-text mb-2">
              {{ tabBarangHint }}
              <template v-if="header.modeBarang === 'DISCOUNT'">
                Kolom <strong>Disc %</strong> dan <strong>Diskon Rp</strong> diterapkan otomatis ke
                invoice.
              </template>
            </div>
            <div class="table-hint-bar">
              <span>F1 = pilih satu</span>
              <span>F2 = pilih banyak (multi-select)</span>
            </div>
            <v-data-table-server
              :headers="applicableHeaders"
              :items="applicableItems"
              class="compact-table flex-grow-1"
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
                  placeholder="F1 / F2"
                  @keydown="handleApplicableKeydown($event, index)"
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

          <!-- Barang Bonus -->
          <div class="panel flex-panel">
            <div class="panel-title">Detail Barang Bonus</div>
            <div class="hint-text mb-2">Item gratis diberikan saat promo terpenuhi.</div>
            <div class="table-hint-bar">
              <span>F1 = pilih satu</span>
              <span>F2 = pilih banyak</span>
            </div>
            <v-data-table
              :headers="bonusHeaders"
              :items="bonusItems"
              class="compact-table flex-grow-1"
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
                  placeholder="F1 / F2"
                  @keydown="handleBonusKeydown($event, index)"
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
                <div class="pa-1 text-right">
                  <v-btn size="x-small" variant="tonal" @click="addNewBonusRow">+ Baris</v-btn>
                </div>
              </template>
            </v-data-table>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Modals ────────────────────────────────────── -->
    <MintaBarangSearchModal
      v-if="isApplicableSearchVisible"
      source="promo-applicable"
      :gudang="authStore.user?.cabang || ''"
      :multi="isMultiApplicableSearch"
      @close="isApplicableSearchVisible = false"
      @products-selected="onApplicableSelected"
    />
    <MintaBarangSearchModal
      v-if="isBonusSearchVisible"
      source="promo-bonus"
      :gudang="authStore.user?.cabang || ''"
      :multi="isMultiBonusSearch"
      @close="isBonusSearchVisible = false"
      @products-selected="onBonusSelected"
    />

    <v-dialog v-model="dialogConfirm.show" max-width="380px" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-3">{{
          dialogConfirm.title
        }}</v-card-title>
        <v-card-text class="pa-3 pt-0">{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions class="pa-3 pt-0">
          <v-spacer />
          <v-btn size="small" variant="text" @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            @click="
              dialogConfirm.onConfirm();
              dialogConfirm.show = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* ─── Global 11px ─────────────────────────────────────── */
.promo-root,
.promo-root :deep(*) {
  font-size: 11px;
}

/* ─── Layout ──────────────────────────────────────────── */
.promo-root {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 112px);
  overflow: hidden;
}

.promo-tabs {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.promo-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  /* Tab detail: no scroll. Tab barang: tabel punya flex-grow sendiri */
}

/* ─── Detail Grid: 3 kolom fixed ─────────────────────── */
.detail-grid {
  display: grid;
  grid-template-columns: 280px 440px 1fr;
  gap: 10px;
  height: 100%;
  align-items: start;
  overflow: hidden;
}

/* Kolom tengah: Cabang + Level berdampingan */
.col-mid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.two-col-tables {
  display: grid;
  grid-template-columns: 170px 260px;
  gap: 8px;
  min-width: 0;
}

/* Kolom kanan: Aturan Lanjutan — ambil semua sisa, scroll jika overflow */
.col-right {
  min-width: 0;
  max-height: calc(100vh - 145px);
  overflow-y: auto;
}

/* ─── Barang Grid ─────────────────────────────────────── */
.barang-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  height: calc(100vh - 155px);
}

.flex-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.flex-panel .compact-table {
  flex: 1 1 auto;
  min-height: 0;
}

/* Pastikan v-data-table wrapper bisa scroll */
.flex-panel .compact-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  overflow-y: auto !important;
}

/* ─── Panel ───────────────────────────────────────────── */
.panel {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 6px;
  padding: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.small-panel {
  padding: 8px;
}

.panel-title {
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.8);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.red-title {
  color: rgb(var(--v-theme-error)) !important;
}

/* ─── Compact form ────────────────────────────────────── */
.cf {
  row-gap: 5px !important;
}
.cf :deep(.v-col) {
  padding: 2px 5px !important;
}
.cf :deep(.v-field__input) {
  padding: 6px 10px !important;
  min-height: 32px !important;
}
.cf :deep(.v-label) {
  font-size: 11px !important;
}
.cf :deep(.v-textarea .v-field__input) {
  padding: 6px 10px !important;
}

/* ─── Radio chips ─────────────────────────────────────── */
.field-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 4px;
}

.inline-radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.radio-chip {
  padding: 3px 9px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  cursor: pointer;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: all 0.15s;
  user-select: none;
}

.radio-chip.active {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: #fff;
  font-weight: 600;
}

.radio-chip.green.active {
  background: #2e7d32;
  border-color: #2e7d32;
}

/* ─── Toggle chips ────────────────────────────────────── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.toggle-chips {
  display: flex;
  gap: 3px;
}

.toggle-chip {
  padding: 2px 10px;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.5);
  transition: all 0.15s;
  user-select: none;
}

.toggle-chip.on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: #fff;
  font-weight: 600;
}

/* ─── Flag checkboxes ─────────────────────────────────── */
.flag-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flag-item {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.15s;
  user-select: none;
}

.flag-item.flagged {
  background: rgba(var(--v-theme-warning), 0.08);
  border-color: rgba(var(--v-theme-warning), 0.3);
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
}

/* ─── Hints ───────────────────────────────────────────── */
.hint-text {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  line-height: 1.4;
}

.table-hint-bar {
  display: flex;
  gap: 12px;
  padding: 3px 6px;
  background: rgba(var(--v-theme-primary), 0.05);
  border-radius: 4px;
  margin-bottom: 6px;
  color: rgba(var(--v-theme-primary), 0.8);
  font-size: 10px;
  font-weight: 600;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 4px 0;
}

/* ─── Tables ──────────────────────────────────────────── */
.compact-table :deep(thead tr th) {
  background: rgb(13, 71, 161) !important;
  color: #fff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  height: 34px !important;
  padding: 0 8px !important;
}

.compact-table :deep(tbody td) {
  padding: 2px 8px !important;
  height: 34px !important;
  vertical-align: middle !important;
}

.compact-table :deep(.v-field__input) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 28px !important;
}
</style>
