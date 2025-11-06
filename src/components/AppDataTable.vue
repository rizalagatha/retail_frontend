<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import LottieVuePlayer from 'vue-lottie-player';
import emptyDataAnimation from '@/assets/empty-state.json';
import { VDataTable, VDataTableServer } from 'vuetify/components/VDataTable';

const props = defineProps({
  server: {
    type: Boolean,
    default: false,
  },
  items: {
    type: Array,
    default: () => []
  },
  itemsPerPageOptions: {
    type: Array,
    default: () => [10, 25, 50, 100]
  },
  search: {
    type: String,
    default: ''
  }
});

const tableComponent = computed(() => {
  return props.server ? VDataTableServer : VDataTable;
});

// State pagination untuk mode client-side
const page = ref(1);
const itemsPerPage = ref(10);

// Computed untuk filtered items (handle search)
const filteredItems = computed(() => {
  if (!props.items) return [];
  if (!props.search) return props.items;

  const searchLower = props.search.toLowerCase();
  return props.items.filter((item: Record<string, unknown>) => {
    return Object.values(item).some(val =>
      String(val).toLowerCase().includes(searchLower)
    );
  });
});

// Computed untuk items yang ditampilkan per halaman
const paginatedItems = computed(() => {
  if (props.server) return props.items;

  const filtered = filteredItems.value;
  const start = (page.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;

  return filtered.slice(start, end);
});

// Computed untuk total halaman
const pageCount = computed(() => {
  if (props.server) return 0;
  return Math.ceil(filteredItems.value.length / itemsPerPage.value);
});

// Computed untuk info "1-25 of 120"
const paginationText = computed(() => {
  const total = filteredItems.value.length;
  if (total === 0) return '0-0 of 0';
  const start = (page.value - 1) * itemsPerPage.value + 1;
  const end = Math.min(page.value * itemsPerPage.value, total);
  return `${start}-${end} of ${total}`;
});

// Reset page saat search berubah
watch(() => props.search, () => {
  page.value = 1;
});

// Reset page saat items per page berubah
watch(itemsPerPage, () => {
  page.value = 1;
});

// Debug logs
watch(itemsPerPage, (newVal) => {
  console.log('✅ Items per page:', newVal);
  console.log('📊 Paginated items count:', paginatedItems.value.length);
});
</script>

<template>
  <div class="app-data-table-wrapper">
    <component :is="tableComponent" v-bind="{ ...$attrs, items: paginatedItems }" hide-default-footer
      :items-per-page="-1">
      <template #no-data>
        <slot v-if="$slots['no-data']" name="no-data"></slot>
        <div v-else class="empty-data-wrapper">
          <div class="lottie-container">
            <LottieVuePlayer :animation-data="emptyDataAnimation" :width="120" :height="120" :loop="true"
              :autoplay="true" />
          </div>
          <h4 class="text-h7 text-grey-darken-1">Tidak Ada Data Ditemukan</h4>
          <p class="text-body-3 text-grey-lighten-1 mt-2">
            Coba ubah filter atau tanggal pencarian Anda.
          </p>
        </div>
      </template>

      <template v-for="(_, name) in $slots" v-slot:[name]="scope">
        <slot v-if="name !== 'no-data'" :name="name" v-bind="scope" />
      </template>
    </component>

    <!-- Custom Footer dengan Pagination (hanya untuk mode client) -->
    <div v-if="!server && items && items.length > 0" class="custom-pagination-footer">
      <div class="items-per-page">
        <span class="text-caption">Items per page:</span>
        <v-select v-model="itemsPerPage" :items="itemsPerPageOptions" density="compact" variant="outlined"
          hide-details></v-select>
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
  background-color: #fafafa;
  border-top: 1px solid #e0e0e0;
}

.lottie-container {
  display: inline-block;
  width: 120px;
  height: 120px;
  margin-bottom: 16px;
}

.empty-data-wrapper h4 {
  font-size: 1.1rem;
}

.empty-data-wrapper p {
  font-size: 0.85rem;
}

/* Custom Pagination Footer */
.custom-pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 16px;
  background-color: white;
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

.pagination-text {
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
  font-size: 0.875rem;
}

/* Custom styling untuk v-pagination agar mirip gambar 1 */
.custom-pagination-footer :deep(.v-pagination) {
  gap: 4px;
}

.custom-pagination-footer :deep(.v-pagination__item),
.custom-pagination-footer :deep(.v-pagination__prev),
.custom-pagination-footer :deep(.v-pagination__next),
.custom-pagination-footer :deep(.v-pagination__first),
.custom-pagination-footer :deep(.v-pagination__last) {
  min-width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid #e0e0e0;
  background-color: white;
  font-size: 14px;
  box-shadow: none;
}

.custom-pagination-footer :deep(.v-pagination__item--is-active) {
  background-color: #2196F3 !important;
  color: white !important;
  border-color: #2196F3 !important;
}

.custom-pagination-footer :deep(.v-pagination__item:hover:not(.v-pagination__item--is-active)),
.custom-pagination-footer :deep(.v-pagination__prev:hover),
.custom-pagination-footer :deep(.v-pagination__next:hover) {
  background-color: rgba(0, 0, 0, 0.04);
}

.custom-pagination-footer :deep(.v-pagination__item:disabled),
.custom-pagination-footer :deep(.v-pagination__prev:disabled),
.custom-pagination-footer :deep(.v-pagination__next:disabled) {
  opacity: 0.3;
}

/* Responsive */
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
