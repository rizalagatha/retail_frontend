<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';
import { useToast } from 'vue-toastification';
import type { AxiosError } from 'axios';

const props = defineProps({
    initialHp: { type: String, default: '' }
});
const emit = defineEmits(['close', 'member-saved']);
const toast = useToast();

const member = ref({
    hp: '',
    nama: '',
    alamat: '',
    gender: 'Pria',
    usia: '20-25',
    referensi: 'Teman',
});

const isLoading = ref(false);
const isSaving = ref(false);
const isNewMember = ref(true);

const genderOptions = ['Pria', 'Wanita'];
const usiaOptions = ['< 20', '20-25', '26-30', '31-35', '36-40', '> 40'];
const referensiOptions = ['Teman', 'Instagram', 'Facebook', 'Tiktok', 'Lainnya'];

const searchMemberByHp = async () => {
    if (!member.value.hp) return;
    isLoading.value = true;
    try {
        const response = await api.get(`/invoice-form/lookup/member/${member.value.hp}`);
        Object.assign(member.value, response.data);
        isNewMember.value = false;
        toast.success('Data member ditemukan.');
    } catch (err) {
        const error = err as AxiosError<{ message?: string }>; // tipe respons opsional
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
    if (!member.value.hp || !member.value.nama) {
        return toast.error('No. HP dan Nama Member harus diisi.');
    }
    isSaving.value = true;
    try {
        const response = await api.post('/invoice-form/save-member', member.value);
        toast.success(response.data.message);
        emit('member-saved', response.data.savedMember);
        emit('close');
    } catch (err) {
        const error = err as AxiosError<{ message?: string }>;
        toast.error(error.response?.data?.message || 'Gagal menyimpan data member.');
    } finally {
        isSaving.value = false;
    }
};

onMounted(() => {
    // Jika ada No. HP yang dikirim dari parent,
    // langsung isi ke field dan picu pencarian.
    if (props.initialHp) {
        member.value.hp = props.initialHp;
        searchMemberByHp();
    }
});
</script>

<template>
    <v-dialog :model-value="true" persistent max-width="600px">
        <v-card>
            <v-toolbar color="primary" density="compact">
                <v-toolbar-title>Form Member</v-toolbar-title>
                <v-spacer />
                <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
            </v-toolbar>
            <v-card-text class="pa-4">
                <div class="d-flex align-center mb-4">
                    <v-text-field v-model="member.hp" label="No. HP Member" variant="outlined" density="compact"
                        hide-details :loading="isLoading" placeholder="Ketik No. HP lalu tekan Enter"
                        @keydown.enter.prevent="searchMemberByHp" />
                    <v-chip v-if="!isLoading && member.hp" :color="isNewMember ? 'green' : 'blue'" class="ms-4">
                        {{ isNewMember ? 'Member Baru' : 'Member Terdaftar' }}
                    </v-chip>
                </div>
                <v-text-field v-model="member.nama" label="Nama Member" variant="outlined" density="compact"
                    hide-details class="mb-2" />
                <v-textarea v-model="member.alamat" label="Alamat" variant="outlined" density="compact" rows="2"
                    hide-details class="mb-2" />
                <v-select v-model="member.gender" :items="genderOptions" label="Gender" variant="outlined"
                    density="compact" hide-details class="mb-2" />
                <v-select v-model="member.usia" :items="usiaOptions" label="Range Usia" variant="outlined"
                    density="compact" hide-details class="mb-2" />
                <v-select v-model="member.referensi" :items="referensiOptions" label="Referensi" variant="outlined"
                    density="compact" hide-details class="mb-2" />
            </v-card-text>
            <v-divider />
            <v-card-actions class="pa-4">
                <v-spacer />
                <v-btn size="small" @click="$emit('close')">Batal</v-btn>
                <v-btn size="small" color="primary" @click="saveMember" :loading="isSaving">Simpan Member</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
/* Menargetkan semua komponen di dalam kartu dialog */
.v-card :deep(.v-label) {
    font-size: 11px !important;
}

.v-card :deep(input),
.v-card :deep(textarea),
.v-card :deep(.v-select__selection-text) {
    font-size: 11px !important;
}

/* Mengatur jarak antar field agar lebih rapat */
.v-card-text :deep(.v-text-field),
.v-card-text :deep(.v-textarea),
.v-card-text :deep(.v-select) {
    margin-bottom: 8px;
}
</style>