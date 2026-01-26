<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import { formatRupiah } from "@/utils/formatRupiah";
const fr = (v: number) => formatRupiah(v);

/**
 * ======== 1️⃣ Props definition ========
 */
interface PenawaranItem {
  kodeBarang: string;
  namaBarang: string;
}

const props = defineProps<{
  modelValue: boolean;
  penawaranDetails?: { kodeBarang: string; namaBarang: string; ukuran?: string }[];
  penawaranBarangList?: { kodeBarang: string; namaBarang: string }[];
}>();

const emit = defineEmits(["close", "saved"]);

/**
 * ======== 2️⃣ Data type definition ========
 */
interface UkuranRow {
  ukuran: string;
  jumlah: number | null;
  harga: number;
}

interface TitikRow {
  keterangan: string;
  sizeCetak: string;
  panjang: number | null;
  lebar: number | null;
}

interface JenisOrderForm {
  jenisOrder: string;
  namaOrder: string;
  kodeBarang: string;
  namaBarang: string;
  hargaPerCm: number;
  ukuranKaos: UkuranRow[];
  titikCetak: TitikRow[];
  totalJumlah: number;
  totalHarga: number;
}

interface JenisOrderSaved {
  namaOrder: string;
  jenisOrder: string;
  namaBarang: string;
  kodeBarang: string;
  totalJumlah: number;
  totalHarga: number;

  // Gunakan penamaan generik untuk data teknis
  customData: {
    ukuranKaos: UkuranRow[];
    titikCetak: TitikRow[];
    hargaPerCm: number;
  };
}

const toast = useToast();

const form = ref<JenisOrderForm>({
  jenisOrder: "",
  namaOrder: "",
  namaBarang: "",
  kodeBarang: "",
  hargaPerCm: 0,
  ukuranKaos: [{ ukuran: "", jumlah: null, harga: 0 }],
  titikCetak: [{ keterangan: "", sizeCetak: "", panjang: null, lebar: null }],
  totalJumlah: 0,
  totalHarga: 0,
});

const detailsTitik = ref([
  { keterangan: "", sizeCetak: "", panjang: 0, lebar: 0 },
]);

const jenisOrderList = ref<{ kode: string; nama: string }[]>([]);
const ukuranList = ref<string[]>([]);
const sizeCetakList = ref<string[]>([]);
const selectedPenawaran = ref<PenawaranItem | null>(null);

const validUkuranList = computed(() => {
  if (!props.penawaranDetails || props.penawaranDetails.length === 0) {
    console.warn('[JenisOrderModal] Tidak ada data ukuran dari penawaran!');
    return [];
  }

  // Filter hanya ukuran unik untuk kodeBarang yang aktif
  const ukuranSet = new Set<string>();
  props.penawaranDetails.forEach((p) => {
    if (p.ukuran && p.kodeBarang === form.value.kodeBarang) {
      ukuranSet.add(p.ukuran.trim().toUpperCase());
    }
  });

  const hasil = Array.from(ukuranSet);
  console.log('[JenisOrderModal] validUkuranList:', hasil);
  return hasil;
});

const updateValidUkuranList = () => {
  console.log('[JenisOrderModal] 🔄 updateValidUkuranList called dengan kodeBarang:', form.value.kodeBarang);
  if (!props.penawaranDetails || props.penawaranDetails.length === 0) {
    console.warn('[JenisOrderModal] Tidak ada data ukuran dari penawaran!');
    return;
  }

  const ukuranSet = new Set<string>();
  props.penawaranDetails.forEach((p) => {
    if (p.ukuran && p.kodeBarang === form.value.kodeBarang) {
      ukuranSet.add(p.ukuran.trim().toUpperCase());
    }
  });

  const hasil = Array.from(ukuranSet);
  console.log('[JenisOrderModal] ✅ hasil ukuranSet:', hasil);
  ukuranList.value = hasil;
};

const refreshSizeCetakList = async () => {
  if (!form.value.jenisOrder) return;
  try {
    const res = await api.get('/so-dtf-form/lookup/size-cetak', {
      params: { jenisOrder: form.value.jenisOrder },
    });
    sizeCetakList.value = [...res.data, "Custom"];
    console.log("[JenisOrderModal] ✅ sizeCetakList refreshed:", sizeCetakList.value);
  } catch {
    toast.error("Gagal memuat size cetak.");
  }
};

watch(
  () => props.penawaranDetails,
  (val) => {
    console.log('[JenisOrderModal] props.penawaranDetails changed:', val);
    if (Array.isArray(val) && val.length > 0) {
      // ✅ Tidak perlu mapping ulang di sini
      // props.penawaranBarangList sudah dikirim dari parent
      selectedPenawaran.value = props.penawaranBarangList?.[0] || null;
      form.value.namaBarang = selectedPenawaran.value?.namaBarang || '';
      form.value.kodeBarang = selectedPenawaran.value?.kodeBarang || '';
      console.log('[JenisOrderModal] received penawaranBarangList =', props.penawaranBarangList);
    } else {
      selectedPenawaran.value = null;
      form.value.namaBarang = '';
      form.value.kodeBarang = '';
      console.log('[JenisOrderModal] penawaranDetails empty or undefined');
    }
  },
  { immediate: true }
);


watch(
  () => props.modelValue,
  (open) => {
    console.log('[JenisOrderModal] modelValue (open) =', open);
    if (open) {
      console.log('[JenisOrderModal] current form:', JSON.parse(JSON.stringify(form.value)));
      console.log('[JenisOrderModal] current penawaranBarangList:', props.penawaranBarangList);
    }
  },
  { immediate: false }
);

/* when user selects from dropdown (selectedPenawaran is an object via return-object) */
watch(selectedPenawaran, async (val) => {
  console.log('[JenisOrderModal] 🧩 selectedPenawaran changed:', val);

  if (val && typeof val === "object" && val.kodeBarang) {
    form.value.namaBarang = val.namaBarang;
    form.value.kodeBarang = val.kodeBarang;
    if (!form.value.namaOrder) form.value.namaOrder = val.namaBarang;

    updateValidUkuranList();
    await refreshSizeCetakList();
  } else {
    console.warn('[JenisOrderModal] selectedPenawaran kosong atau bukan object:', val);
    form.value.namaBarang = '';
    form.value.kodeBarang = '';
    ukuranList.value = [];
    sizeCetakList.value = [];
  }
});

onMounted(() => {
  if (props.penawaranBarangList?.length) {
    const first = props.penawaranBarangList[0];
    form.value.namaBarang = first.namaBarang;
    form.value.kodeBarang = first.kodeBarang;
  }
});

const loading = ref(false);

const addUkuranRowIfNeeded = (index: number) => {
  const row = form.value.ukuranKaos[index];
  const isLast = index === form.value.ukuranKaos.length - 1;
  const isFilled = row.ukuran && row.jumlah > 0;
  if (isLast && isFilled) {
    form.value.ukuranKaos.push({ ukuran: "", jumlah: 0, harga: 0 });
  }
};

const addTitikRowIfNeeded = (index: number) => {
  const row = form.value.titikCetak[index];
  const isLast = index === form.value.titikCetak.length - 1;
  const isFilled = row.keterangan && row.sizeCetak;
  if (isLast && isFilled) {
    form.value.titikCetak.push({ keterangan: "", sizeCetak: "", panjang: 0, lebar: 0 });
  }
};

const removeUkuranRow = (index: number) => {
  if (form.value.ukuranKaos.length > 1) form.value.ukuranKaos.splice(index, 1);
};

const removeTitikRow = (index: number) => {
  if (form.value.titikCetak.length > 1) form.value.titikCetak.splice(index, 1);
};

watch(
  [
    () => form.value.jenisOrder, refreshSizeCetakList,
    () => form.value.ukuranKaos.map(u => [u.ukuran, u.jumlah]),
    () => form.value.titikCetak.map(t => [t.sizeCetak, t.panjang, t.lebar]),
  ],
  () => calculatePrices(),
  { deep: true }
);

onMounted(async () => {
  try {
    loading.value = true;
    const [jenisRes, ukuranRes] = await Promise.all([
      api.get('/so-form/lookup/jenis-order'),
      api.get('/so-dtf-form/lookup/ukuran-kaos'),
    ]);
    jenisOrderList.value = jenisRes.data;
    ukuranList.value = ukuranRes.data;
  } catch (err) {
    toast.error('Gagal memuat data.', err);
  } finally {
    loading.value = false;
  }
});

watch(
  () => form.value.jenisOrder,
  async (val) => {
    if (!val) return;
    try {
      const res = await api.get('/so-dtf-form/lookup/size-cetak', {
        params: { jenisOrder: val },
      });

      // Tambahkan opsi Custom di akhir
      sizeCetakList.value = [...res.data, "Custom"];
      console.log("[JenisOrderModal] sizeCetakList loaded:", sizeCetakList.value);
    } catch {
      toast.error('Gagal memuat size cetak.');
    }
  }
);

const save = () => {
  if (!form.value.jenisOrder || !form.value.namaOrder) {
    toast.error('Isi semua data terlebih dahulu.');
    return;
  }

  // Validasi tambahan: pastikan ada titik cetak dan ukuran
  const filteredUkuran = form.value.ukuranKaos.filter(u => u.ukuran && (u.jumlah ?? 0) > 0);
  const filteredTitik = form.value.titikCetak.filter(t => t.keterangan && t.sizeCetak);

  if (filteredUkuran.length === 0) {
    toast.error('Minimal satu ukuran kaos harus diisi.');
    return;
  }

  // Susun payload lengkap
  const payload: JenisOrderSaved = {
    namaOrder: form.value.namaOrder,
    jenisOrder: form.value.jenisOrder,
    namaBarang: form.value.namaBarang,
    kodeBarang: form.value.kodeBarang,
    totalJumlah: form.value.totalJumlah,
    totalHarga: form.value.totalHarga,

    // Satukan data teknis dalam satu object 'customData'
    customData: {
      ukuranKaos: filteredUkuran, // TypeScript otomatis mengenali ini sebagai UkuranRow[]
      titikCetak: filteredTitik,  // TypeScript otomatis mengenali ini sebagai TitikRow[]
      hargaPerCm: form.value.hargaPerCm,
    }
  };

  console.log('[JenisOrderModal] saving payload lengkap:', payload);

  emit('saved', payload); // kirim ke parent (SoCreateView)
  emit('close');
};


/**
 * Hitung harga DTG (backend)
 */
const getHargaDTG = async () => {
  try {
    const response = await api.post("/so-dtf-form/calculate-dtg-price", {
      detailsTitik: detailsTitik.value,
      totalJumlahKaos: form.value.totalJumlah,
    });
    return response.data.harga || 0;
  } catch (error) {
    toast.error("Gagal menghitung harga DTG.", error);
    return 0;
  }
};

/**
 * Fungsi utama: Hitung harga berdasarkan jenis order
 */
const calculatePrices = async () => {
  const totalJumlahKaos = form.value.ukuranKaos.reduce((sum, row) => sum + (row.jumlah || 0), 0);
  form.value.totalJumlah = totalJumlahKaos;

  if (totalJumlahKaos <= 0) {
    form.value.hargaPerCm = 0;
    form.value.totalHarga = 0;
    form.value.ukuranKaos.forEach((i) => (i.harga = 0));
    return;
  }

  const jenis = form.value.jenisOrder;
  const totalLuas = form.value.titikCetak.reduce(
    (sum, item) => sum + ((item.panjang || 0) * (item.lebar || 0)),
    0
  );

  let hargaPerCm = 0;
  let hargaSatuan = 0;

  switch (jenis) {
    case "SB": // [TAMBAHAN] Sablon Plastisol (Sesuai logic SoDtfCreateView)
      hargaPerCm = 0; // SB menggunakan harga tetap per ukuran, bukan per cm2
      form.value.titikCetak.forEach(t => {
        if (t.sizeCetak === 'A3') hargaSatuan += 35000;
        else if (t.sizeCetak === 'A4') hargaSatuan += 20000;
        else if (t.sizeCetak === 'A5') hargaSatuan += 10000;
        // Jika Custom atau lainnya, logic hargaSatuan tetap 0 atau bisa ditambah sesuai kebutuhan
      });
      break;

    case "SD": // Sablon DTF
      hargaPerCm = 25;
      hargaSatuan = totalLuas * hargaPerCm;
      break;

    case "DP": // DTF Premium
      hargaPerCm = 35;
      hargaSatuan = totalLuas * hargaPerCm;
      break;

    case "BR": // Bordir
      hargaPerCm = 100;
      hargaSatuan = totalLuas * hargaPerCm;
      break;

    case "TG": // DTG
      hargaSatuan = await getHargaDTG();
      break;

    default:
      hargaPerCm = 0;
      hargaSatuan = 0;
      break;
  }

  // simpan harga/cm²
  form.value.hargaPerCm = hargaPerCm;

  // update harga di setiap ukuran kaos
  form.value.ukuranKaos.forEach((row) => {
    if (row.ukuran && (row.jumlah ?? 0) > 0) {
      row.harga = hargaSatuan;
    } else {
      row.harga = 0;
    }
  });

  // hitung total harga keseluruhan
  const totalHarga = form.value.ukuranKaos.reduce(
    (sum, row) => sum + ((row.jumlah || 0) * row.harga),
    0
  );

  form.value.totalHarga = totalHarga;
};

const getUkuranSodtfDetail = async (jenisOrder: string, ukuran: string) => {
  try {
    const res = await api.get("/so-dtf-form/lookup/ukuran-sodtf-detail", {
      params: { jenisOrder, ukuran },
    });
    return res.data || null;
  } catch {
    toast.error("Gagal memuat detail ukuran SODTF.");
    return null;
  }
};

const handleSizeCetakChange = async (row: TitikRow) => {
  if (!row.sizeCetak) return;

  // Jika "Custom", biarkan user isi manual
  if (row.sizeCetak.toLowerCase() === "custom") {
    row.panjang = 0;
    row.lebar = 0;
    return;
  }

  // Selain itu, ambil otomatis dari DB
  const ukuran = await getUkuranSodtfDetail(form.value.jenisOrder, row.sizeCetak);
  if (ukuran) {
    row.panjang = ukuran.panjang;
    row.lebar = ukuran.lebar;
  }
  calculatePrices();
};

const onUkuranChanged = (row: UkuranRow, val: string) => {
  if (!validUkuranList.value.includes(val)) {
    toast.error(`Ukuran ${val} tidak ada pada penawaran ini.`);
    row.ukuran = '';
  } else {
    row.ukuran = val;
  }
};

const formatAngka = (val: unknown): number | null => {
  if (val === null || val === undefined || val === "") return null;
  const cleaned = String(val).replace(/\D/g, "");
  return cleaned === "" ? null : Number(cleaned);
};

const finalizeAngka = <T extends Record<string, number | null | string>>(
  row: T,
  key: keyof T
) => {
  const v = row[key];

  if (v === null || v === "") {
    row[key] = 0 as T[keyof T];
  } else {
    row[key] = Number(v) as T[keyof T];
  }
};

/**
 * ======== 6️⃣ Auto-watch perubahan ========
 */
watch(
  [() => form.value.jenisOrder, () => form.value.ukuranKaos, () => form.value.titikCetak],
  () => calculatePrices(),
  { deep: true }
);

/* === DEFAULT SIZE CETAK UNTUK SD & DP === */
watch(
  () => form.value.jenisOrder,
  (jenis) => {
    form.value.titikCetak.forEach((t) => {
      if (jenis === "SD" || jenis === "DP") {
        t.sizeCetak = "Custom";     // default otomatis
      } else {
        t.sizeCetak = "";           // yang lain kosong
      }
    });
  },
  { immediate: true }
);

</script>

<template>
  <v-dialog :model-value="props.modelValue" @update:modelValue="emit('close')" max-width="1000px" persistent>
    <v-card class="jenis-order-dialog">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Input Jenis Order</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small" />
      </v-toolbar>

      <v-card-text>
        <!-- Header Fields -->
        <v-row dense>
          <v-col cols="6">
            <v-select v-model="form.jenisOrder" :items="jenisOrderList" item-title="nama" item-value="kode"
              label="Jenis Order" variant="outlined" density="compact" hide-details class="text-xs" />
          </v-col>

          <v-col cols="6">
            <v-text-field v-model="form.namaOrder" label="Nama Order Custom" variant="outlined" density="compact"
              hide-details class="text-xs" />
          </v-col>

          <v-col cols="9">
            <v-select v-if="props.penawaranBarangList?.length > 1" v-model="selectedPenawaran"
              :items="props.penawaranBarangList" item-title="namaBarang" item-value="kodeBarang" label="Nama Barang"
              variant="outlined" density="compact" hide-details clearable return-object />
            <v-text-field v-else v-model="form.namaBarang" label="Nama Barang" variant="outlined" density="compact"
              hide-details readonly />
            <div class="caption-note">Diambil otomatis dari grid Penawaran</div>
          </v-col>

          <v-col cols="3">
            <v-text-field v-model="form.kodeBarang" label="Kode Barang" variant="outlined" density="compact"
              hide-details readonly />
          </v-col>
        </v-row>

        <v-divider class="my-2" />

        <!-- Dua Kolom Kiri-Kanan -->
        <div class="grid-section">
          <!-- KIRI -->
          <div class="section-box">
            <div class="section-title">Ukuran Kaos</div>
            <v-row dense class="table-header">
              <v-col cols="3">Ukuran</v-col>
              <v-col cols="4">Jumlah</v-col>
              <v-col cols="4">Harga/Pcs</v-col>
              <v-col cols="1" class="text-center">#</v-col>
            </v-row>
            <div v-for="(row, i) in form.ukuranKaos" :key="i" class="row-line">
              <v-row dense align="center">
                <v-col cols="3">
                  <v-select v-model="row.ukuran" :items="validUkuranList" label="Ukuran Kaos" variant="outlined"
                    density="compact" hide-details="auto" :error="row.ukuran && !validUkuranList.includes(row.ukuran)"
                    @update:model-value="(val) => onUkuranChanged(row, val)" />
                </v-col>
                <v-col cols="4">
                  <v-text-field v-model="row.jumlah" type="text" placeholder="0" density="compact" variant="outlined"
                    hide-details class="text-xs text-end" @input="row.jumlah = formatAngka($event.target.value)" @blur="
                      finalizeAngka(row, 'jumlah');
                    addUkuranRowIfNeeded(i);
                    " />
                </v-col>
                <v-col cols="4" class="text-end">
                  {{ fr(row.harga || 0) }}
                </v-col>
                <v-col cols="1" class="text-center">
                  <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error"
                    @click="removeUkuranRow(i)" />
                </v-col>
              </v-row>
            </div>
          </div>

          <!-- KANAN -->
          <div class="section-box">
            <div class="section-title">Titik Bordir/Cetak</div>
            <v-row dense class="table-header">
              <v-col cols="3">Keterangan</v-col>
              <v-col cols="3">Size Cetak</v-col>
              <v-col cols="2">P (cm)</v-col>
              <v-col cols="2">L (cm)</v-col>
              <v-col cols="2" class="text-center">#</v-col>
            </v-row>
            <div v-for="(row, i) in form.titikCetak" :key="i" class="row-line">
              <v-row dense align="center">
                <v-col cols="3">
                  <v-text-field v-model="row.keterangan" density="compact" variant="outlined" hide-details
                    @blur="() => addTitikRowIfNeeded(i)" />
                </v-col>
                <v-col cols="3">
                  <v-select v-model="row.sizeCetak" :items="sizeCetakList" density="compact" hide-details
                    variant="outlined" class="text-xs" @update:modelValue="() => handleSizeCetakChange(row)"
                    @blur="() => addTitikRowIfNeeded(i)" />
                </v-col>
                <v-col cols="2">
                  <v-text-field v-model="row.panjang" type="text" placeholder="0" density="compact" variant="outlined"
                    hide-details class="text-xs text-end"
                    :readonly="row.sizeCetak && row.sizeCetak.toLowerCase() !== 'custom'"
                    @input="row.panjang = formatAngka($event.target.value)" @blur="finalizeAngka(row, 'panjang')" />
                </v-col>
                <v-col cols="2">
                  <v-text-field v-model="row.lebar" type="text" placeholder="0" density="compact" variant="outlined"
                    hide-details class="text-xs text-end"
                    :readonly="row.sizeCetak && row.sizeCetak.toLowerCase() !== 'custom'"
                    @input="row.lebar = formatAngka($event.target.value)" @blur="finalizeAngka(row, 'lebar')" />
                </v-col>
                <v-col cols="2" class="text-center">
                  <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error"
                    @click="removeTitikRow(i)" />
                </v-col>
              </v-row>
            </div>
          </div>
        </div>

        <v-divider class="my-2" />

        <v-row dense>
          <v-col cols="6">
            <v-text-field label="Total Jumlah" :model-value="form.totalJumlah" readonly density="compact"
              variant="outlined" hide-details class="text-xs" />
          </v-col>
          <v-col cols="6">
            <v-text-field label="Total Harga" :model-value="fr(form.totalHarga)" readonly density="compact"
              variant="outlined" hide-details class="text-xs" />
          </v-col>
          <v-col cols="6">
            <v-text-field label="Harga per cm²" :model-value="fr(form.hargaPerCm)" readonly density="compact"
              variant="outlined" hide-details class="text-xs" />
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions class="justify-end">
        <v-btn variant="tonal" @click="emit('close')">Batal</v-btn>
        <v-btn color="primary" variant="tonal" @click="save">Simpan</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Field scale konsisten */
.v-card :deep(.v-label) {
  font-size: var(--label-font-size, 11px) !important;
}

.v-card :deep(input),
.v-card :deep(textarea),
.v-card :deep(.v-select__selection-text) {
  font-size: var(--input-font-size, 12px) !important;
}

.v-card :deep(.v-field) {
  height: 32px !important;
  min-height: 32px !important;
}

.v-card :deep(.v-input__control) {
  --v-input-control-height: 32px !important;
}

/* Atur field panjang */
.v-col {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

.v-card :deep(.v-field__input) {
  font-size: 12px !important;
}

/* Dua kolom kanan kiri */
.grid-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
}

.section-box {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  padding: 8px;
  font-size: 11px;

  background-color: rgb(var(--v-theme-surface));
}

.section-title {
  font-weight: 600;
  font-size: 11px;
  margin-bottom: 4px;
}

.table-header {
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 4px;

  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.row-line {
  margin-bottom: 2px;
  padding-bottom: 2px;

  border-bottom: 1px dashed rgba(var(--v-theme-on-surface), 0.12);
}

.caption-note {
  font-size: 10px;
  margin-top: -2px;

  color: rgba(var(--v-theme-on-surface), 0.6);
}

.v-btn--icon {
  margin-top: -4px !important;
}

.text-end :deep(input) {
  text-align: right !important;
}

/* --- Seragamkan tinggi semua field --- */
.v-card :deep(.v-field) {
  height: 36px !important;
  min-height: 36px !important;
  align-items: center !important;
}

/* --- Pastikan konten input rata tengah vertikal --- */
.v-card :deep(.v-input__control),
.v-card :deep(.v-field__input),
.v-card :deep(.v-field__field) {
  display: flex !important;
  align-items: center !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

/* --- Label posisi tengah vertikal --- */
.v-card :deep(.v-label.v-field-label) {
  top: 50% !important;
  transform: translateY(-50%) !important;
  font-size: 11px !important;
}

/* --- Ikon dropdown (select) biar nggak terlalu tinggi --- */
.v-card :deep(.v-select__selection-text) {
  line-height: 1.2 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

/* Responsive */
@media (max-width: 1024px) {
  .grid-section {
    grid-template-columns: 1fr;
  }
}

.jenis-order-dialog {
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
</style>
