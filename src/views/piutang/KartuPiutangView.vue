<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import CustomerSearchModal from '@/components/lookup/CustomerSearchModal.vue';
import KartuPiutangDetailModal from '@/components/modal/KartuPiutangDetailModal.vue';

// --- Tipe Data ---
interface PiutangItem {
    kode: string;
    nama: string;
    alamat: string;
    kota: string;
    nominalNota: number;
    terbayar: number;
    sisaPiutang: number;
    status: 'Aktif' | 'Pasif';
}

// --- Inisialisasi & State ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '52';

const masterData = ref<PiutangItem[]>([]);
const loading = ref(true);
const cabangList = ref<{ kode: string, nama: string }[]>([]);
const dialogs = reactive({ customerSearch: false, detailModal: false });
const selected = ref<PiutangItem[]>([]);

const filters = reactive({
    cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang,
    customerKode: '',
    customerNama: '',
});

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<PiutangItem | null>(() => isSingleSelected.value ? selected.value[0] : null);

// --- Konfigurasi Tabel ---
const headers = [
    { title: 'Kode', key: 'kode', width: '120px' },
    { title: 'Nama Customer', key: 'nama', width: '300px' },
    { title: 'Alamat', key: 'alamat' },
    { title: 'Kota', key: 'kota', width: '150px' },
    { title: 'Nominal Nota', key: 'nominalNota', align: 'end' },
    { title: 'Terbayar', key: 'terbayar', align: 'end' },
    { title: 'Sisa Piutang', key: 'sisaPiutang', align: 'end', cellProps: { class: 'font-weight-bold' } },
    { title: 'Status', key: 'status', align: 'center' },
];

// --- Methods ---
const formatRupiah = (value: number) => new Intl.NumberFormat('id-ID').format(value || 0);

const getRowTextColor = (item: PiutangItem) => {
    if (item.status === 'Pasif') return 'text-red';
    return '';
};

const fetchCabangList = async () => {
    try {
        const response = await api.get('/kartu-piutang/lookup/cabang');
        cabangList.value = response.data;
    } catch (error) {
        toast.error('Gagal memuat daftar cabang.');
    }
};

const fetchMasterData = async () => {
    loading.value = true;
    selected.value = []; // Reset pilihan saat data dimuat ulang
    try {
        const response = await api.get('/kartu-piutang', { params: filters });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal mengambil data.');
    } finally {
        loading.value = false;
    }
};

const onCustomerSelected = (customer: { kode: string; nama: string; }) => {
    filters.customerKode = customer.kode;
    filters.customerNama = customer.nama;
    dialogs.customerSearch = false;
};

const handleViewDetails = () => {
    if (isSingleSelected.value) {
        dialogs.detailModal = true;
    }
};

// --- Lifecycle & Watchers ---
onMounted(async () => {
    await fetchCabangList();
});

watch(filters, fetchMasterData, { deep: true, immediate: true });
</script>

<template>
    <PageLayout title="Browse Kartu Piutang" icon="mdi-account-cash-outline">
        <template #header-actions>
        </template>

        <div class="browse-content">
            <div class="filter-section">
                <v-label class="filter-label">Filter Customer:</v-label>
                <v-text-field v-model="filters.customerKode" placeholder="Semua Customer" density="compact" hide-details
                    variant="outlined" style="max-width: 180px;" append-inner-icon="mdi-magnify" readonly
                    @click="dialogs.customerSearch = true" clearable
                    @click:clear="filters.customerKode = ''; filters.customerNama = ''" />
                <v-text-field :model-value="filters.customerNama" readonly filled density="compact" hide-details
                    style="max-width: 300px;" />

                <v-label class="filter-label ms-4">Cabang:</v-label>
                <v-select v-model="filters.cabang" :items="cabangList" item-title="nama" item-value="kode"
                    density="compact" hide-details variant="outlined" style="max-width: 200px;" />
                <v-spacer />
                <v-btn color="primary" @click="handleViewDetails" :disabled="!isSingleSelected"
                    prepend-icon="mdi-file-document-outline">
                    Lihat Detail
                </v-btn>
            </div>

            <div class="table-container">
                <v-data-table v-model="selected" :headers="headers" :items="masterData" :loading="loading"
                    class="desktop-table" density="compact" fixed-header show-select single-select return-object
                    item-value="kode">
                    <template #item.nominalNota="{ item }">
                        <td :class="getRowTextColor(item)" class="text-end">{{ formatRupiah(item.nominalNota) }}</td>
                    </template>
                    <template #item.terbayar="{ item }">
                        <td :class="getRowTextColor(item)" class="text-end">{{ formatRupiah(item.terbayar) }}</td>
                    </template>
                    <template #item.sisaPiutang="{ item }">
                        <td :class="getRowTextColor(item)" class="text-end font-weight-bold">{{
                            formatRupiah(item.sisaPiutang) }}</td>
                    </template>
                    <template #item.status="{ item }">
                        <td :class="getRowTextColor(item)" class="text-center">
                            <v-chip :color="item.status === 'Aktif' ? 'success' : 'error'" size="small"
                                variant="tonal">{{ item.status }}</v-chip>
                        </td>
                    </template>

                    <template #item.kode="{ item }">
                        <td :class="getRowTextColor(item)">{{ item.kode }}</td>
                    </template>
                    <template #item.nama="{ item }">
                        <td :class="getRowTextColor(item)">{{ item.nama }}</td>
                    </template>
                    <template #item.alamat="{ item }">
                        <td :class="getRowTextColor(item)">{{ item.alamat }}</td>
                    </template>
                    <template #item.kota="{ item }">
                        <td :class="getRowTextColor(item)">{{ item.kota }}</td>
                    </template>
                </v-data-table>
            </div>
        </div>

        <CustomerSearchModal v-if="dialogs.customerSearch" @close="dialogs.customerSearch = false"
            @customer-selected="onCustomerSelected" />
        <KartuPiutangDetailModal v-if="dialogs.detailModal && selectedRow" :customer-kode="selectedRow.kode"
            :cabang="filters.cabang" @close="dialogs.detailModal = false" />
    </PageLayout>
</template>
