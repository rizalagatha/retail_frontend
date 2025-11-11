<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import MintaBarangSearchModal from '@/components/lookup/MintaBarangSearchModal.vue';
import type { AxiosError } from 'axios';

// --- Tipe Data ---
interface Header {
  nomor: string;
  judul: string;
  tanggal1: string;
  tanggal2: string;
  jenis: number; // 1: Total Rp, 2: Total Qty, 3: Lain-lain
  totalRp: number;
  totalQty: number;
  diskonRp: number;
  diskonPersen: number;
  kelipatan: 'Y' | 'N';
  generate: 'N' | 'K' | 'V'; // N:None, K:Kupon, V:Voucher
  jenisKupon: '' | 'BELANJA' | 'UNDIAN';
  cetakKupon: 'Y' | 'N';
  rpVoucher: number;
  keterangan: string;
  note: string;
  f1: 'Y' | 'N';
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
}

// --- Inisialisasi & State ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '205';

const isEditMode = computed(() => !!route.params.nomor);
const pageTitle = computed(() => isEditMode.value ? 'Ubah Promo' : 'Buat Promo');
const tab = ref('promo');

const header = reactive<Header>({
  nomor: '', judul: '', tanggal1: format(new Date(), 'yyyy-MM-dd'), tanggal2: format(new Date(), 'yyyy-MM-dd'),
  jenis: 1, totalRp: 0, totalQty: 0, diskonRp: 0, diskonPersen: 0, kelipatan: 'N',
  generate: 'N', jenisKupon: '', cetakKupon: 'N', rpVoucher: 0, keterangan: '', note: '', f1: 'N'
});
const bonusItems = ref<BonusItem[]>([]);
const cabangList = ref<CabangLevelItem[]>([]);
const levelList = ref<CabangLevelItem[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isBonusSearchVisible = ref(false);
const activeBonusRowIndex = ref(0);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });
const applicableItems = ref<ApplicableItem[]>([]);
const isApplicableSearchVisible = ref(false);
const activeApplicableRowIndex = ref(0);
const applicableItemsPage = ref(1);
const applicableItemsPerPage = ref(10);
const applicableItemsTotal = ref(0);
const applicableItemsDirty = ref(false);

// --- Konfigurasi Tabel ---
const bonusHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '250px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '150px' },
  { title: 'Qty', key: 'qty', width: '150px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];
const cabangHeaders = [{ title: 'Cabang', key: 'cab' }, { title: 'Berlaku', key: 'berlaku', align: 'center' }] as const;
const levelHeaders = [{ title: 'Kode', key: 'kode' }, { title: 'Level Customer', key: 'level' }, { title: 'Berlaku', key: 'berlaku', align: 'center' }] as const;
const applicableHeaders = [
  { title: 'Kode Barang', key: 'kode', width: '120px' },
  { title: 'Nama Barang', key: 'nama' },
  { title: 'Ukuran', key: 'ukuran', width: '60px' },
  { title: 'Qty', key: 'qty', width: '60px' },
  { title: 'Harga', key: 'harga', width: '80px' },
  { title: 'Disc %', key: 'disc', width: '60px' },
  { title: 'Diskon Rp', key: 'diskon', width: '80px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '50px' },
];

// --- Methods ---
const addNewBonusRow = () => {
  const last = bonusItems.value[bonusItems.value.length - 1];
  if (!last || last.kode) bonusItems.value.push({ id: Date.now(), kode: '', nama: '', ukuran: '', qty: 1 });
};
const removeBonusRow = (id: number) => {
  bonusItems.value = bonusItems.value.filter(i => i.id !== id);
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
    b => b.kode === selected.kode && b.ukuran === selected.ukuran
  );
  if (isDuplicate) return toast.warning('Barang bonus ini sudah ada di daftar.');

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
const closeForm = () => {
  router.push({ name: 'Promo' });
};
const resetForm = () => {
  // Logika untuk membersihkan form, bisa Anda kembangkan lebih lanjut
  router.go(0); // Cara sederhana untuk me-reload halaman
};
const handleCancel = () => {
  showConfirmation('Konfirmasi Batal', 'Batalkan semua perubahan dan kosongkan form?', resetForm);
};

const save = () => {
  const requiredPermission = isEditMode.value ? 'edit' : 'insert';
  if (!authStore.can(MENU_ID, requiredPermission)) {
    return toast.error('Anda tidak memiliki hak akses untuk menyimpan data ini.');
  }

  // --- VALIDASI DARI DELPHI (btnSimpanClick) ---
  if (new Date(header.tanggal1) > new Date(header.tanggal2)) {
    return toast.error('Periode promo tidak valid.');
  }
  if (!header.judul.trim()) {
    return toast.error('Judul promo tidak boleh kosong.');
  }
  if (header.jenis === 1 && (header.totalRp || 0) <= 0) {
    return toast.error('Total Rp Belanja harus diisi jika jenis promo adalah Total Rp.');
  }
  if (header.jenis === 2 && (header.totalQty || 0) <= 0) {
    return toast.error('Total Qty Belanja harus diisi jika jenis promo adalah Total Qty.');
  }
  if (header.generate === 'K' && !header.jenisKupon) {
    return toast.error('Silakan pilih jenis kupon (Undian atau Belanja).');
  }
  // Otorisasi sederhana meniru 'ADMIN' di Delphi
  if (authStore.user?.kode !== 'ADMIN') {
    return toast.error('Anda tidak berhak menyimpan data promo.');
  }
  // --- AKHIR VALIDASI ---

  // Jika semua validasi lolos, panggil dialog konfirmasi
  showConfirmation('Konfirmasi Simpan', 'Anda yakin ingin menyimpan data promo ini?', executeSave);
};

const executeSave = async () => {
  isSaving.value = true;
  try {
    const shouldSendApplicableItems =
      applicableItemsDirty.value && applicableItemsTotal.value <= applicableItems.value.length;

    const payload = {
      header,
      applicableItems: shouldSendApplicableItems
        ? applicableItems.value.filter(i => i.kode)
        : null,
      bonusItems: bonusItems.value.filter(i => i.kode),
      cabang: cabangList.value.filter(c => c.berlaku).map(c => c.cab),
      level: levelList.value.filter(l => l.berlaku).map(l => l.kode),
      isNew: !isEditMode.value
    };
    const response = await api.post('/promo-form/save', payload);
    toast.success(response.data.message);
    router.push({ name: 'Promo' });
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menyimpan data.');
  } finally {
    isSaving.value = false;
  }
};

const loadDataForEdit = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/promo-form/${nomor}`);
    const data = response.data;

    // --- ISI DATA HEADER ---
    // Menggunakan Object.assign untuk field yang namanya sama
    Object.assign(header, data.header);

    header.nomor = nomor;

    header.judul = data.header.pro_judul;

    // Konversi format tanggal dari server untuk input type="date"
    header.tanggal1 = format(parseISO(data.header.pro_tanggal1), 'yyyy-MM-dd');
    header.tanggal2 = format(parseISO(data.header.pro_tanggal2), 'yyyy-MM-dd');

    // Menyesuaikan nama field dari database ke state
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

    // --- ISI GRID-GRID ---
    // Gunakan .map untuk menambahkan 'id' unik di frontend
    applicableItemsTotal.value = data.applicableItemsCount || data.applicableItems.length;

    // Map items dengan id unik
    applicableItems.value = data.applicableItems.map((item: ApplicableItem) => ({
      ...item,
      id: Math.random(),
    }));
    bonusItems.value = data.bonusItems.map((item: BonusItem) => ({
      ...item,
      id: Math.random(),
    }));

    // --- ISI CHECKBOX DI TAB CABANG & LEVEL ---
    cabangList.value.forEach(cabang => {
      if (data.cabangBerlaku.includes(cabang.cab)) {
        cabang.berlaku = true;
      }
    });

    levelList.value.forEach(level => {
      if (data.levelBerlaku.includes(level.kode)) {
        level.berlaku = true;
      }
    });

  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    const message =
      axiosError.response?.data?.message || 'Gagal memuat data promo.';
    toast.error(message);
    router.back();
  } finally {
    // --- UBAH BARIS INI ---
    addNewApplicableRow(false); // Kirim 'false' agar TIDAK set flag dirty
    // --- BATAS PERUBAHAN ---

    addNewBonusRow(); // (Anda mungkin perlu melakukan hal yang sama untuk bonus)
    isLoading.value = false;
  }
};

const addNewApplicableRow = (setDirty = true) => {
  if (setDirty) { // <-- TAMBAHKAN IF INI
    applicableItemsDirty.value = true;
  }

  const last = applicableItems.value[applicableItems.value.length - 1];
  if (!last || last.kode) {
    applicableItems.value.push({
      id: Date.now() + Math.random(),
      kode: '', nama: '', ukuran: '', qty: 0, harga: 0, disc: 0, diskon: 0
    });
  }
};

const removeApplicableRow = (id: number) => {
  applicableItems.value = applicableItems.value.filter(i => i.id !== id);
  if (applicableItems.value.length === 0) addNewApplicableRow();
};

const loadApplicableItems = async (nomor: string, page: number = 1) => {
  try {
    const response = await api.get(`/promo-form/${nomor}/applicable-items`, {
      params: {
        page,
        itemsPerPage: applicableItemsPerPage.value
      }
    });

    applicableItems.value = response.data.items.map((item: ApplicableItem) => ({
      ...item,
      id: Math.random(),
    }));
    applicableItemsTotal.value = response.data.total;

  } catch (error) {
    console.error('Error loading applicable items:', error);
    toast.error('Gagal memuat data barang pemicu promo.');
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
    item => item.kode === selected.kode && item.ukuran === selected.ukuran
  );
  if (isDuplicate) return toast.warning('Barang ini sudah ada di daftar pemicu promo.');

  const targetRow = applicableItems.value[activeApplicableRowIndex.value];
  targetRow.kode = selected.kode;
  targetRow.nama = selected.nama;
  targetRow.ukuran = selected.ukuran;
  targetRow.harga = selected.harga;

  addNewApplicableRow();
};

const setApplicableDirty = () => {
  applicableItemsDirty.value = true;
}

onMounted(async () => {
  isLoading.value = true;
  try {
    const res = await api.get('/promo-form/initial-data');
    cabangList.value = res.data.cabang;
    levelList.value = res.data.level;

    const nomor = route.params.nomor as string;
    if (isEditMode.value && nomor) {
      await loadDataForEdit(nomor);
    } else {
      // --- UBAH BAGIAN INI ---
      addNewApplicableRow(false); // Kirim 'false'
      addNewBonusRow(); // (Asumsi ini juga diubah agar menerima 'setDirty = false')
    }
  } catch (err) {
    toast.error('Gagal memuat data awal.', err);
  } finally {
    isLoading.value = false;
  }
});

watch(() => header.generate, (val) => {
  if (val !== 'K') header.jenisKupon = '';
});

// Untuk mendeteksi perubahan manual di field (Qty, Harga, Disc)
watch(applicableItems, () => {
  // Hanya tandai 'dirty' jika kita tidak sedang loading data
  if (!isLoading.value) {
    applicableItemsDirty.value = true;
  }
}, { deep: true });
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-gift">
    <template #header-actions>
      <v-btn size="small" color="primary" prepend-icon="mdi-content-save" @click="save" :loading="isSaving">
        Simpan
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-refresh" @click="handleCancel">
        Batal
      </v-btn>
      <v-btn size="small" prepend-icon="mdi-close"
        @click="showConfirmation('Konfirmasi Tutup', 'Tutup form? Perubahan yang belum disimpan akan hilang.', closeForm)">
        Tutup
      </v-btn>
    </template>
    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="detail-promo">Detail Promo</v-tab>
      <v-tab value="barang-bonus">Barang Bonus</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="detail-promo">
        <div class="form-grid-container">
          <div class="header-main">
            <div class="desktop-form-section fill-height">
              <div class="text-subtitle-1 font-weight-bold mb-3">Data Promo</div>
              <v-row dense class="compact-form">
                <v-col cols="12">
                  <v-text-field label="Nomor Promo" variant="outlined" v-model="header.nomor" readonly filled
                    hide-details density="compact" />
                </v-col>

                <v-col cols="12">
                  <v-text-field label="Judul" v-model="header.judul" variant="outlined" hide-details
                    density="compact" />
                </v-col>

                <v-col cols="6">
                  <v-text-field label="Tanggal Mulai" v-model="header.tanggal1" type="date" variant="outlined"
                    hide-details density="compact" style="padding-right: 2px;" />
                </v-col>

                <v-col cols="6">
                  <v-text-field label="Tanggal Selesai" v-model="header.tanggal2" type="date" variant="outlined"
                    hide-details density="compact" style="padding-left: 2px;" />
                </v-col>

                <v-col cols="12">
                  <v-radio-group v-model="header.jenis" inline label="Jenis Promo" hide-details density="compact">
                    <v-radio label="Total Rp" :value="1"></v-radio>
                    <v-radio label="Total Qty" :value="2"></v-radio>
                    <v-radio label="Lain-lain" :value="3"></v-radio>
                    <v-radio label="Diskon Item" :value="4"></v-radio>
                  </v-radio-group>
                </v-col>

                <v-col cols="6">
                  <v-text-field label="Total Rp Belanja" v-model.number="header.totalRp" type="number"
                    variant="outlined" :disabled="header.jenis !== 1" hide-details density="compact"
                    style="padding-right: 2px;" />
                </v-col>

                <v-col cols="6">
                  <v-text-field label="Total Qty Belanja" v-model.number="header.totalQty" type="number"
                    variant="outlined" :disabled="header.jenis !== 2" hide-details density="compact"
                    style="padding-left: 2px;" />
                </v-col>

                <v-col cols="12">
                  <v-select label="Berlaku Kelipatan" v-model="header.kelipatan" :items="['Y', 'N']" variant="outlined"
                    hide-details density="compact" />
                </v-col>

                <v-col cols="12">
                  <v-textarea label="Keterangan" v-model="header.keterangan" rows="3" variant="outlined" hide-details
                    density="compact" />
                </v-col>

                <v-col cols="12">
                  <v-textarea label="Note (muncul di struk)" v-model="header.note" rows="3" variant="outlined"
                    hide-details density="compact" />
                </v-col>
              </v-row>
            </div>
          </div>

          <div class="sub-sections">
            <div class="top-row">
              <div class="desktop-form-section fill-height">
                <div class="text-subtitle-1 font-weight-bold mb-2">Cabang Berlaku</div>
                <v-data-table :headers="cabangHeaders" :items="cabangList" class="desktop-table" :items-per-page="-1"
                  density="compact" fixed-header>
                  <template #[`item.berlaku`]="{ item }">
                    <v-checkbox-btn v-model="item.berlaku" hide-details />
                  </template>
                  <template #bottom></template>
                </v-data-table>
              </div>
              <div class="desktop-form-section fill-height">
                <div class="text-subtitle-1 font-weight-bold mb-2">Level Berlaku</div>
                <v-data-table :headers="levelHeaders" :items="levelList" class="desktop-table" :items-per-page="-1"
                  density="compact" fixed-header>
                  <template #[`item.berlaku`]="{ item }">
                    <v-checkbox-btn v-model="item.berlaku" hide-details />
                  </template>
                  <template #bottom></template>
                </v-data-table>
              </div>
            </div>
            <div class="bottom-row">
              <div class="desktop-form-section fill-height">
                <div class="text-subtitle-1 font-weight-bold mb-3">Diskon / Bonus</div>
                <v-row dense class="compact-form">
                  <v-col cols="6">
                    <v-text-field label="Diskon Faktur Rp" v-model.number="header.diskonRp" type="number"
                      variant="outlined" hide-details density="compact" />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field label="Diskon Faktur %" v-model.number="header.diskonPersen" type="number"
                      variant="outlined" hide-details density="compact" />
                  </v-col>
                </v-row>
                <v-divider class="my-4" />

                <v-radio-group v-model="header.generate" label="Generate Otomatis" hide-details density="compact">
                  <v-radio label="Tidak Ada" value="N" />
                  <v-radio label="Kupon" value="K" />
                  <v-radio label="Voucher" value="V" />
                </v-radio-group>

                <div v-if="header.generate === 'K'" class="pl-8 mt-2">
                  <v-radio-group v-model="header.jenisKupon" label="Jenis Kupon" hide-details density="compact">
                    <v-radio label="Kupon Undian" value="UNDIAN" />
                    <v-radio label="Kupon Belanja" value="BELANJA" />
                  </v-radio-group>
                  <v-checkbox v-model="header.cetakKupon" true-value="Y" false-value="N" label="Cetak Kupon Otomatis"
                    hide-details density="compact" />
                </div>

                <div v-if="header.generate === 'V'" class="pl-8 mt-2">
                  <v-text-field label="Nominal Voucher Pembayaran" v-model.number="header.rpVoucher" type="number"
                    variant="outlined" hide-details density="compact" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-window-item>

      <v-window-item value="barang-bonus">
        <div class="form-grid-container">
          <div class="desktop-form-section d-flex flex-column" style="min-height: 400px;">
            <div class="text-subtitle-1 font-weight-bold mb-2">
              Barang Pemicu Promo (Item yang harus dibeli)
            </div>
            <v-data-table-server :headers="applicableHeaders" :items="applicableItems" class="desktop-table flex-grow-1"
              v-model:page="applicableItemsPage" :items-per-page="applicableItemsPerPage"
              :items-length="applicableItemsTotal" density="compact" fixed-header
              @update:page="isEditMode && loadApplicableItems(header.nomor, $event)"
              @update:items-per-page="applicableItemsPerPage = $event; isEditMode && loadApplicableItems(header.nomor, 1)">
              <template #[`item.kode`]="{ item, index }">
                <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                  placeholder="F1..." @keydown.f1.prevent="openApplicableSearch(index)" />
              </template>
              <template #[`item.qty`]="{ item }">
                <v-text-field v-model.number="item.qty" @change="setApplicableDirty" type="number" variant="underlined"
                  density="compact" hide-details class="text-end" />
              </template>
              <template #[`item.harga`]="{ item }">
                <v-text-field v-model.number="item.harga" @change="setApplicableDirty" type="number"
                  variant="underlined" density="compact" hide-details class="text-end" />
              </template>
              <template #[`item.disc`]="{ item }">
                <v-text-field v-model.number="item.disc" @change="setApplicableDirty" type="number" variant="underlined"
                  density="compact" hide-details class="text-end" />
              </template>
              <template #[`item.diskon`]="{ item }">
                <v-text-field v-model.number="item.diskon" @change="setApplicableDirty" type="number"
                  variant="underlined" density="compact" hide-details class="text-end" />
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                  @click="removeApplicableRow(item.id)" />
              </template>
            </v-data-table-server>
          </div>

          <div class="desktop-form-section d-flex flex-column" style="min-height: 400px;">
            <div class="text-subtitle-1 font-weight-bold mb-2">Detail Barang Bonus</div>
            <v-data-table :headers="bonusHeaders" :items="bonusItems" class="desktop-table flex-grow-1"
              :items-per-page="-1" density="compact" fixed-header>
              <template #[`item.kode`]="{ item, index }">
                <v-text-field v-model="item.kode" variant="underlined" density="compact" hide-details
                  placeholder="F1..." @keydown.f1.prevent="openBonusSearch(index)" />
              </template>
              <template #[`item.qty`]="{ item }">
                <v-text-field v-model.number="item.qty" type="number" variant="underlined" class="text-end"
                  density="compact" hide-details />
              </template>
              <template #[`item.actions`]="{ item }">
                <v-btn v-if="item.kode" icon="mdi-delete" size="x-small" variant="text" color="error"
                  @click="removeBonusRow(item.id)" />
              </template>
              <template #bottom>
                <div class="pa-2 text-right"><v-btn size="small" @click="addNewBonusRow">Tambah
                    Bonus</v-btn></div>
              </template>
            </v-data-table>
          </div>
        </div>
      </v-window-item>
    </v-window>

    <MintaBarangSearchModal v-if="isApplicableSearchVisible" source="promo-applicable"
      :gudang="authStore.user?.cabang || ''" @close="isApplicableSearchVisible = false"
      @products-selected="onApplicableSelected" />
    <MintaBarangSearchModal v-if="isBonusSearchVisible" source="promo-bonus" :gudang="authStore.user?.cabang || ''"
      @close="isBonusSearchVisible = false" @products-selected="onBonusSelected" />

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">
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
  gap: 16px;
}

.top-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
}

.bottom-row {
  flex: 1;
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

.header-main .desktop-form-section {
  padding: 12px;
}

.header-main .desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
  opacity: 0.9;
}

.header-main .desktop-form-section :deep(input),
.header-main .desktop-form-section :deep(.v-select__selection-text),
.header-main .desktop-form-section :deep(textarea) {
  font-size: 13px !important;
}

.header-main .desktop-form-section .v-radio-group {
  margin: -8px 0 -8px 0 !important;
}

.header-main .desktop-form-section :deep(.v-radio-group .v-selection-control-group) {
  gap: 16px;
}

.header-main .desktop-form-section :deep(.v-radio-group label) {
  font-size: 13px !important;
}

.compact-form {
  row-gap: 6px !important;
  column-gap: 0 !important;
  margin: 0 !important;
}

.compact-form :deep(.v-col) {
  padding: 3px 6px !important;
}

.compact-form :deep(.v-input) {
  margin: 0 !important;
}

.compact-form :deep(.v-input__control) {
  min-height: auto !important;
}

.compact-form :deep(.v-field) {
  margin: 0 !important;
}

.compact-form :deep(.v-field__outline) {
  margin-top: 0 !important;
}

.compact-form :deep(.v-field__input) {
  padding: 8px 12px !important;
  min-height: 36px !important;
}

.compact-form :deep(.v-text-field),
.compact-form :deep(.v-textarea),
.compact-form :deep(.v-select) {
  margin: 0 !important;
}

.compact-form :deep(.v-label) {
  font-size: 11px !important;
  opacity: 0.9;
}

.compact-form :deep(.v-radio) {
  margin-right: 8px !important;
}

.compact-form :deep(.v-textarea) {
  margin: 0 !important;
}

.compact-form :deep(.v-textarea .v-field__input) {
  padding: 8px 12px !important;
  min-height: auto !important;
}

.text-subtitle-1 {
  font-size: 13px !important;
  margin: 0 0 8px 0 !important;
  padding: 0 !important;
  font-weight: 600;
}

.mb-3 {
  margin-bottom: 8px !important;
}

.mb-2 {
  margin-bottom: 6px !important;
}

.my-4 {
  margin: 12px 0 !important;
}

.form-grid-container .desktop-form-section :deep(.v-label) {
  font-size: 11px !important;
  margin-bottom: 2px;
  opacity: 1;
}

.form-grid-container .desktop-form-section :deep(input),
.form-grid-container .desktop-form-section :deep(.v-select__selection-text),
.form-grid-container .desktop-form-section :deep(textarea) {
  font-size: 12px !important;
}

.form-grid-container .desktop-form-section .v-radio-group {
  margin-top: -8px;
}
</style>
