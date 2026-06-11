<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { kotaIndonesia } from "@/data/kotaIndonesia";

const toast = useToast();
const emit = defineEmits(["close", "customer-saved"]);

interface KotaItem {
  nama: string;
  provinsi: string;
}

const defaultItem = {
  kode: "",
  nama: "",
  alamat: "",
  kota: "",
  telp: "",
  namaKontak: "",
  tglLahir: null,
  top: 0,
  status: "AKTIF",
  level: null,
  limitTrans: 0,
  npwp: "",
  namaNpwp: "",
  alamatNpwp: "",
  kotaNpwp: "",
};

const editedItem = ref({ ...defaultItem });
const availableLevels = ref([]);
const isSaving = ref(false);

// --- State Kota ---
const allKotaList = ref<KotaItem[]>([]);
const kotaSearchTerm = ref("");

const filteredKotaList = computed(() => {
  if (!kotaSearchTerm.value || kotaSearchTerm.value.length < 2) return [];
  const q = kotaSearchTerm.value.toLowerCase();
  return allKotaList.value
    .filter((k) => k.nama.toLowerCase().includes(q) || k.provinsi.toLowerCase().includes(q))
    .slice(0, 30);
});

const onKotaSearch = (val: string) => {
  kotaSearchTerm.value = val || "";
};

// --- Validasi HP ---
const validatePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/\s+/g, "");
  if (/[^0-9+]/.test(cleaned))
    return "Nomor HP hanya boleh berisi angka, tidak boleh ada strip atau karakter lain.";
  if (!/^(08|628|\+628)/.test(cleaned)) return "Nomor HP harus dimulai dengan 08, 628, atau +628.";
  const digitsOnly = cleaned.replace(/^\+/, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) return "Nomor HP harus antara 10–15 digit.";
  return null;
};

const phoneError = computed(() =>
  editedItem.value.telp ? validatePhone(editedItem.value.telp) ?? "" : ""
);

const save = async () => {
  if (!editedItem.value.nama) {
    return toast.error("Nama Customer harus diisi.");
  }

  // Validasi HP
  const phoneErr = validatePhone(editedItem.value.telp);
  if (phoneErr) {
    toast.error(phoneErr);
    return;
  }

  // Validasi Kota
  if (editedItem.value.kota && allKotaList.value.length > 0) {
    const kotaValid = allKotaList.value.some(
      (k) => k.nama.toLowerCase() === editedItem.value.kota?.toLowerCase()
    );
    if (!kotaValid) {
      toast.error(
        `Kota "${editedItem.value.kota}" tidak valid. Pilih dari daftar kota/kabupaten Indonesia.`
      );
      return;
    }
  }

  isSaving.value = true;
  try {
    const response = await api.post("/customers", editedItem.value);
    toast.success(response.data.message);
    const saved = response.data.newCustomer;
    const mappedCustomer = {
      ...saved,
      level_kode: saved.levelKode,
      level_nama: saved.levelNama,
    };
    emit("customer-saved", mappedCustomer);
    emit("close");
  } catch (error: unknown) {
    if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error("Gagal menyimpan customer.");
    }
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  allKotaList.value = kotaIndonesia;
  try {
    const levelsResponse = await api.get("/customers/levels");
    availableLevels.value = levelsResponse.data;
  } catch {
    toast.error("Gagal memuat data level customer.");
  }
});
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="900px">
    <v-card class="dialog-card">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Tambah Customer Baru</v-toolbar-title>
      </v-toolbar>
      <v-card-text class="pa-4">
        <v-container>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="editedItem.kode"
                label="Kode"
                readonly
                variant="filled"
                density="compact"
                placeholder="(Otomatis)"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-text-field
                v-model="editedItem.nama"
                label="Nama"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-textarea
                v-model="editedItem.alamat"
                label="Alamat"
                variant="outlined"
                density="compact"
                rows="2"
                hide-details
                class="mb-2"
              ></v-textarea>
              <v-combobox
                :model-value="editedItem.kota"
                @update:model-value="(val: any) => {
    editedItem.kota = typeof val === 'object' && val !== null ? (val as KotaItem).nama : val
  }"
                label="Kota / Kabupaten"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
                :items="filteredKotaList"
                placeholder="Cari kota atau kabupaten..."
                no-data-text="Ketik minimal 2 huruf..."
                item-title="nama"
                clearable
                auto-select-first
                @update:search="onKotaSearch"
              >
                <template #item="{ item, props }">
                  <v-list-item v-bind="props" :subtitle="item.raw.provinsi" />
                </template>
              </v-combobox>

              <v-text-field
                v-model="editedItem.telp"
                label="No Telp/Hp"
                variant="outlined"
                density="compact"
                hide-details="auto"
                class="mb-2"
                placeholder="08xxx atau 628xxx"
                :error-messages="phoneError"
              ></v-text-field>
              <v-text-field
                v-model="editedItem.namaKontak"
                label="Kontak Person"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-text-field
                v-model="editedItem.tglLahir"
                label="Tanggal Lahir"
                type="date"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-text-field
                v-model="editedItem.top"
                label="TOP"
                type="number"
                suffix="hari"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-select
                v-model="editedItem.level"
                :items="availableLevels"
                item-title="nama"
                item-value="kode"
                label="Level"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-select>
              <v-radio-group
                v-model="editedItem.status"
                inline
                label="Status"
                density="compact"
                hide-details
                class="mb-2"
              >
                <v-radio label="Aktif" value="AKTIF" color="success"></v-radio>
                <v-radio label="Pasif" value="PASIF" color="error"></v-radio>
              </v-radio-group>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="editedItem.limitTrans"
                label="Limit Transaksi"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
                prepend-inner-icon="mdi-cash-lock"
              ></v-text-field>
              <v-text-field
                v-model="editedItem.npwp"
                label="NPWP"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-text-field
                v-model="editedItem.namaNpwp"
                label="Nama NPWP"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
              <v-textarea
                v-model="editedItem.alamatNpwp"
                label="Alamat NPWP"
                variant="outlined"
                density="compact"
                rows="2"
                hide-details
                class="mb-2"
              ></v-textarea>
              <v-text-field
                v-model="editedItem.kotaNpwp"
                label="Kota NPWP"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-2"
              ></v-text-field>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
      <v-card-actions class="dialog-footer">
        <v-spacer />
        <v-btn size="small" @click="emit('close')">Batal</v-btn>
        <v-btn size="small" color="primary" @click="save" :loading="isSaving">Simpan</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-card,
.dialog-footer {
  font-size: 11px;
}

.dialog-footer {
  background-color: #f5f5f5;
}

/* Mengatur font untuk label (Nama, Alamat, dll.) */
.dialog-card :deep(.v-label) {
  font-size: 11px !important;
}

/* Mengatur font untuk teks yang diinput */
.dialog-card :deep(input),
.dialog-card :deep(textarea),
.dialog-card :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

/* Mengatur jarak antar field agar lebih rapat */
.dialog-card :deep(.v-text-field),
.dialog-card :deep(.v-textarea),
.dialog-card :deep(.v-select),
.dialog-card :deep(.v-radio-group) {
  margin-bottom: 4px;
}

.dialog-card :deep(.v-combobox .v-field__input),
.dialog-card :deep(.v-combobox input) {
  font-size: 12px !important;
}

.dialog-card :deep(.v-list-item-title) {
  font-size: 12px !important;
}

.dialog-card :deep(.v-list-item-subtitle) {
  font-size: 10px !important;
}
</style>
