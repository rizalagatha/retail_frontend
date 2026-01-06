<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import type { AxiosError } from 'axios';

interface KaryawanSearchResult {
  kar_nik: string;
  kar_nama: string;
  kar_alamat?: string; // Optional jika dari backend bisa null
}

const props = defineProps({
  initialHp: { type: String, default: '' },
  // Tambahkan prop mode karyawan (diaktifkan jika cust = K-00079)
  isKaryawanMode: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'member-saved']);
const toast = useToast();

const member = ref({
  hp: '',
  nik: '',          // Field baru untuk NIK
  nama: '',         // Digunakan bersama (Nama Member / Nama Karyawan)
  alamat: '',
  gender: 'Pria',
  usia: '20-25',
  referensi: 'Teman',
});

const isLoading = ref(false);
const isSaving = ref(false);
const isNewMember = ref(true);

// State untuk Pencarian Karyawan (Potong Gaji style)
const karyawanList = ref<KaryawanSearchResult[]>([]);
const isSearchingKaryawan = ref(false);

const genderOptions = ['Pria', 'Wanita'];
const usiaOptions = ['< 20', '20-25', '26-30', '31-35', '36-40', '> 40'];
const referensiOptions = ['Teman', 'Instagram', 'Facebook', 'Tiktok', 'Lainnya'];

// Helper Debounce untuk pencarian karyawan
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  // timeoutId bertipe number di browser (atau ReturnType dari setTimeout)
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Fungsi cari karyawan ke backend
const onSearchKaryawan = debounce(async (v: string) => {
  if (!v || v.length < 3) return;
  isSearchingKaryawan.value = true;
  try {
    const { data } = await api.get<KaryawanSearchResult[]>('/hrd/search', {
      params: { term: v }
    });
    karyawanList.value = data;
  } finally {
    isSearchingKaryawan.value = false;
  }
}, 400);

// Handler saat karyawan dipilih dari list
const onSelectKaryawan = (selected: KaryawanSearchResult | null) => {
  if (selected) {
    member.value.nik = selected.kar_nik;
    member.value.nama = selected.kar_nama;
    member.value.alamat = selected.kar_alamat || '';
    isNewMember.value = false;
  }
};

const searchMemberByHp = async () => {
  if (!member.value.hp) return;
  isLoading.value = true;
  try {
    const response = await api.get(`/invoice-form/lookup/member/${member.value.hp}`);
    Object.assign(member.value, response.data);
    isNewMember.value = false;
    toast.success('Data member ditemukan.');
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    if (error.response?.status === 404) {
      isNewMember.value = true;
      toast.info('No. HP belum terdaftar, silakan lengkapi data member baru.');
    } else {
      toast.error(error.response?.data?.message || 'Gagal mencari data member.');
    }
  } finally {
    isLoading.value = false;
  }
};

const saveMember = async () => {
  // Validasi berdasarkan mode
  if (props.isKaryawanMode) {
    if (!member.value.nik || !member.value.nama) {
      return toast.error('Data Karyawan (NIK & Nama) wajib diisi.');
    }
  } else {
    if (!member.value.hp) {
      return toast.error('No. HP harus diisi.');
    }
  }

  emit('member-saved', member.value);
  emit('close');
};

onMounted(() => {
  if (props.initialHp && !props.isKaryawanMode) {
    member.value.hp = props.initialHp;
    searchMemberByHp();
  }
});
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="600px">
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>{{ isKaryawanMode ? 'Form Data Karyawan' : 'Form Member' }}</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4">
        <div v-if="isKaryawanMode">
          <v-autocomplete label="Cari Karyawan (NIK / Nama)" placeholder="Ketik minimal 3 karakter..."
            :items="karyawanList" :loading="isSearchingKaryawan" item-title="kar_nama" return-object variant="outlined"
            density="compact" class="mb-2" hide-details @update:search="onSearchKaryawan"
            @update:model-value="onSelectKaryawan">
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.kar_nama" :subtitle="item.raw.kar_nik" />
            </template>
          </v-autocomplete>

          <v-text-field v-model="member.nik" label="NIK Karyawan" variant="outlined" density="compact" hide-details
            readonly class="mb-2" bg-color="grey-lighten-4" />
          <v-text-field v-model="member.nama" label="Nama Karyawan" variant="outlined" density="compact" hide-details
            readonly class="mb-2" bg-color="grey-lighten-4" />
        </div>

        <div v-else>
          <div class="d-flex align-center mb-4">
            <v-text-field v-model="member.hp" label="No. HP Member" variant="outlined" density="compact" hide-details
              :loading="isLoading" placeholder="Ketik No. HP lalu tekan Enter"
              @keydown.enter.prevent="searchMemberByHp" />
            <v-chip v-if="!isLoading && member.hp" :color="isNewMember ? 'green' : 'blue'" class="ms-4">
              {{ isNewMember ? 'Member Baru' : 'Member Terdaftar' }}
            </v-chip>
          </div>
          <v-text-field v-model="member.nama" label="Nama Member" variant="outlined" density="compact" hide-details
            class="mb-2" />
        </div>

        <v-textarea v-model="member.alamat" label="Alamat" variant="outlined" density="compact" rows="2" hide-details
          class="mb-2" />

        <template v-if="!isKaryawanMode">
          <v-select v-model="member.gender" :items="genderOptions" label="Gender" variant="outlined" density="compact"
            hide-details class="mb-2" />
          <v-select v-model="member.usia" :items="usiaOptions" label="Range Usia" variant="outlined" density="compact"
            hide-details class="mb-2" />
          <v-select v-model="member.referensi" :items="referensiOptions" label="Referensi" variant="outlined"
            density="compact" hide-details class="mb-2" />
        </template>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn size="small" @click="$emit('close')">Batal</v-btn>
        <v-btn size="small" color="primary" @click="saveMember" :loading="isSaving">Konfirmasi Data</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Style tetap sama sesuai permintaan */
.v-card :deep(.v-label) {
  font-size: 11px !important;
}

.v-card :deep(input),
.v-card :deep(textarea),
.v-card :deep(.v-select__selection-text) {
  font-size: 12px !important;
}

.v-card-text :deep(.v-text-field),
.v-card-text :deep(.v-textarea),
.v-card-text :deep(.v-select) {
  margin-bottom: 8px;
}
</style>
