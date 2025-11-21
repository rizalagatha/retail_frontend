<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';

const toast = useToast();
const emit = defineEmits(['close', 'customer-saved']);

const defaultItem = {
  kode: '',
  nama: '',
  alamat: '',
  kota: '',
  telp: '',
  namaKontak: '',
  tglLahir: null,
  top: 0,
  status: 'AKTIF',
  level: null,
  npwp: '',
  namaNpwp: '',
  alamatNpwp: '',
  kotaNpwp: '',
};

const editedItem = ref({ ...defaultItem });
const availableLevels = ref([]);
const isSaving = ref(false);

const save = async () => {
  // TODO: Tambahkan validasi di sini jika perlu
  if (!editedItem.value.nama) {
    return toast.error("Nama Customer harus diisi.");
  }

  isSaving.value = true;
  try {
    const response = await api.post('/customers', editedItem.value);
    toast.success(response.data.message);
    const saved = response.data.newCustomer;

    const mappedCustomer = {
      ...saved,
      level_kode: saved.levelKode,  // samakan field ke snake_case
      level_nama: saved.levelNama,
    };
    emit('customer-saved', mappedCustomer);
    emit('close');
  } catch (error: unknown) {
    if (error instanceof Error) {
      // pesan bawaan Error
      toast.error(error.message);
    } else {
      toast.error('Gagal menyimpan customer.');
    }
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  try {
    const levelsResponse = await api.get('/customers/levels');
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
              <v-text-field v-model="editedItem.kode" label="Kode" readonly variant="filled" density="compact"
                placeholder="(Otomatis)" hide-details class="mb-2"></v-text-field>
              <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined" density="compact" hide-details
                class="mb-2"></v-text-field>
              <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" density="compact" rows="2"
                hide-details class="mb-2"></v-textarea>
              <v-text-field v-model="editedItem.kota" label="Kota" variant="outlined" density="compact" hide-details
                class="mb-2"></v-text-field>
              <v-text-field v-model="editedItem.telp" label="No Telp/Hp" variant="outlined" density="compact"
                hide-details class="mb-2"></v-text-field>
              <v-text-field v-model="editedItem.namaKontak" label="Kontak Person" variant="outlined" density="compact"
                hide-details class="mb-2"></v-text-field>
              <v-text-field v-model="editedItem.tglLahir" label="Tanggal Lahir" type="date" variant="outlined"
                density="compact" hide-details class="mb-2"></v-text-field>
              <v-text-field v-model="editedItem.top" label="TOP" type="number" suffix="hari" variant="outlined"
                density="compact" hide-details class="mb-2"></v-text-field>
              <v-select v-model="editedItem.level" :items="availableLevels" item-title="nama" item-value="kode"
                label="Level" variant="outlined" density="compact" hide-details class="mb-2"></v-select>
              <v-radio-group v-model="editedItem.status" inline label="Status" density="compact" hide-details
                class="mb-2">
                <v-radio label="Aktif" value="AKTIF" color="success"></v-radio>
                <v-radio label="Pasif" value="PASIF" color="error"></v-radio>
              </v-radio-group>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="editedItem.npwp" label="NPWP" variant="outlined" density="compact" hide-details
                class="mb-2"></v-text-field>
              <v-text-field v-model="editedItem.namaNpwp" label="Nama NPWP" variant="outlined" density="compact"
                hide-details class="mb-2"></v-text-field>
              <v-textarea v-model="editedItem.alamatNpwp" label="Alamat NPWP" variant="outlined" density="compact"
                rows="2" hide-details class="mb-2"></v-textarea>
              <v-text-field v-model="editedItem.kotaNpwp" label="Kota NPWP" variant="outlined" density="compact"
                hide-details class="mb-2"></v-text-field>
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
</style>
