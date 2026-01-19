<script setup lang="ts">
import { computed, ref, watch } from "vue";
import LottieVuePlayer from "vue-lottie-player";
import emptyDataAnimation from "@/assets/empty-state.json";
import { VDataTable, VDataTableServer } from "vuetify/components/VDataTable";

const props = defineProps({
  server: { type: Boolean, default: false }, // Mode server aktif?
  items: { type: Array, default: () => [] },
  itemsPerPageOptions: { type: Array, default: () => [10, 25, 50, 100] },
  search: { type: String, default: "" },

  // [BARU] Total data keseluruhan di database (misal: 5000)
  itemsLength: { type: Number, default: 0 },
});

// Emit event ke parent saat user ganti halaman/limit
const emit = defineEmits(["update:options", "update:page", "update:itemsPerPage"]);

const tableComponent = computed(() => (props.server ? VDataTableServer : VDataTable));

const page = ref(1);
const itemsPerPage = ref(50); // Default

// --- Filter Client Side (Hanya jalan jika BUKAN server side) ---
const filteredItems = computed(() => {
  if (props.server) return props.items;

  if (!props.items) return [];
  if (!props.search) return props.items;

  const searchLower = props.search.toLowerCase();

  // [FIX] Ganti 'any' dengan 'Record<string, unknown>'
  // Artinya: item adalah object dengan key string dan value apa saja
  return props.items.filter((item: Record<string, unknown>) => {
    return Object.values(item).some((val) => {
      // Pastikan val tidak null/undefined sebelum di-string-kan agar aman
      return val && String(val).toLowerCase().includes(searchLower);
    });
  });
});

// --- Pagination Items ---
const paginatedItems = computed(() => {
  if (props.server) return props.items; // Kalau server, jangan slice lagi
  const start = (page.value - 1) * itemsPerPage.value;
  return filteredItems.value.slice(start, start + itemsPerPage.value);
});

// --- Hitung Total Halaman ---
const pageCount = computed(() => {
  // Jika server, hitung dari itemsLength. Jika client, hitung dari array length.
  const total = props.server ? props.itemsLength : filteredItems.value.length;
  if (total === 0) return 0;
  return Math.ceil(total / itemsPerPage.value);
});

// --- Teks Pagination (1-50 of 5000) ---
const paginationText = computed(() => {
  const total = props.server ? props.itemsLength : filteredItems.value.length;
  if (total === 0) return "0-0 of 0";

  const start = (page.value - 1) * itemsPerPage.value + 1;
  const end = Math.min(page.value * itemsPerPage.value, total);

  return `${start}-${end} of ${total}`;
});

// --- Watchers: Beritahu Parent jika user ganti halaman ---
watch([page, itemsPerPage], () => {
  // Ini yang akan memicu fetch data baru di InvoiceBrowse
  emit("update:options", { page: page.value, itemsPerPage: itemsPerPage.value });
});

// Reset page ke 1 jika search berubah (Khusus Client Side)
watch(
  () => props.search,
  () => {
    if (!props.server) page.value = 1;
  }
);
</script>

<template>
  <div class="app-data-table-wrapper">
    <component :is="tableComponent" v-bind="{ ...$attrs, items: paginatedItems }" hide-default-footer
      :items-per-page="itemsPerPage" :items-length="server ? itemsLength : undefined" class="bg-surface">
      <template #no-data>
        <slot v-if="$slots['no-data']" name="no-data"></slot>
        <div v-else class="empty-data-wrapper">
          <div class="lottie-container">
            <LottieVuePlayer :animation-data="emptyDataAnimation" :width="120" :height="120" :loop="true"
              :autoplay="true" />
          </div>
          <h4 class="text-h7 text-medium-emphasis">Tidak Ada Data Ditemukan</h4>
          <p class="text-body-3 text-disabled mt-2">
            Coba ubah filter atau tanggal pencarian Anda.
          </p>
        </div>
      </template>

      <template v-for="(_, name) in $slots" v-slot:[name]="scope">
        <slot v-if="name !== 'no-data'" :name="name" v-bind="scope" />
      </template>
    </component>

    <div v-if="server || (items && items.length > 0)" class="custom-pagination-footer">
      <div class="items-per-page">
        <span class="text-caption text-medium-emphasis">Items per page:</span>
        <v-select v-model="itemsPerPage" :items="itemsPerPageOptions" density="compact" variant="outlined" hide-details
          class="items-per-page-select"></v-select>
      </div>
      <span class="pagination-text text-caption">{{ paginationText }}</span>
      <v-pagination v-model="page" :length="pageCount" :total-visible="5" density="compact" size="small"></v-pagination>
    </div>
  </div>
</template>

<style scoped>
.app-data-table-wrapper {
  width: 100%;
}

.empty-data-wrapper {
  padding: 48px 32px;
  text-align: center;
  /* [FIX] Background dinamis */
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.lottie-container {
  display: inline-block;
  width: 120px;
  height: 120px;
  margin-bottom: 16px;
}

.custom-pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 16px;
  /* [FIX] Background footer pagination dinamis */
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.items-per-page {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 150px;
}

.items-per-page .v-select {
  max-width: 80px;
}

.custom-pagination-footer :deep(.v-field__input) {
  min-height: 32px !important;
  padding-top: 0;
  padding-bottom: 0;
}

.pagination-text {
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
  font-size: 0.875rem;
}

/* Tombol Pagination */
.custom-pagination-footer :deep(.v-pagination__item),
.custom-pagination-footer :deep(.v-pagination__prev),
.custom-pagination-footer :deep(.v-pagination__next) {
  min-width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 14px;
  box-shadow: none;
  /* [FIX] Tombol pagination ikut tema */
  background-color: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

.custom-pagination-footer :deep(.v-pagination__item--is-active) {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
  border: none !important;
}

.custom-pagination-footer :deep(.v-pagination__item:disabled) {
  opacity: 0.3;
}

@media (max-width: 768px) {
  .custom-pagination-footer {
    flex-direction: column;
    gap: 12px;
  }

  .items-per-page {
    width: 100%;
    justify-content: center;
  }

  .pagination-text {
    order: -1;
  }
}
</style>
