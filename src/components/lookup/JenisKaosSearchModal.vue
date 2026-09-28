<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";

interface JenisKaos {
  JenisKaos: string;
}

const emit = defineEmits(["close", "select"]);
const items = ref<JenisKaos[]>([]);
const loading = ref(true);

// 🔍 Input filter
const search = ref("");

// List terfilter otomatis
const filteredItems = computed(() => {
  if (!search.value) return items.value;

  const keyword = search.value.toLowerCase();
  return items.value.filter((i) => i.JenisKaos.toLowerCase().includes(keyword));
});

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/setting-harga/search-jenis-kaos");
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data Jenis Kaos:", error);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: JenisKaos) => {
  emit("select", item.JenisKaos);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="920px" persistent>
    <v-card class="jk-modal-card">
      <div class="jk-modal-header">
        <div class="header-icon-circle">
          <v-icon icon="mdi-tshirt-crew-outline" size="20" color="white" />
        </div>
        <div class="header-text">
          <div class="header-title">Pilih Jenis Kaos</div>
          <div class="header-subtitle">{{ filteredItems.length }} jenis ditemukan</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="emit('close')" />
      </div>

      <v-card-text class="pa-4">
        <v-text-field
          v-model="search"
          label="Cari jenis kaos..."
          variant="outlined"
          density="compact"
          hide-details
          prepend-inner-icon="mdi-magnify"
          clearable
          autofocus
          class="mb-3 jk-search-field"
        />

        <div v-if="loading" class="jk-loading-state">
          <v-progress-circular indeterminate color="#b71c1c" size="28" />
        </div>

        <div v-else-if="filteredItems.length === 0" class="jk-empty-state">
          <v-icon size="40">mdi-tshirt-crew-outline</v-icon>
          <div class="empty-title">Tidak ditemukan</div>
          <div class="empty-subtitle">Coba kata kunci lain</div>
        </div>

        <div v-else class="jk-grid">
          <div
            v-for="item in filteredItems"
            :key="item.JenisKaos"
            class="jk-card"
            @click="selectItem(item)"
          >
            <div class="jk-icon-wrapper">
              <v-icon icon="mdi-tshirt-crew" size="18" color="white" />
            </div>
            <div class="jk-name">{{ item.JenisKaos }}</div>
            <v-icon size="16" color="grey-lighten-1" class="jk-chevron">mdi-chevron-right</v-icon>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.jk-modal-card {
  overflow: hidden;
}

/* ══════════════ HEADER ══════════════ */
.jk-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 14px 20px;
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
}

.header-icon-circle {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.header-text {
  flex-grow: 1;
  min-width: 0;
}

.header-title {
  color: white;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
}

.header-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 11.5px;
  font-weight: 500;
  margin-top: 1px;
}

/* ══════════════ SEARCH FIELD ══════════════ */
.jk-search-field :deep(.v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.03);
  border: 1px solid rgba(183, 28, 28, 0.25);
  box-shadow: none;
}

.jk-search-field :deep(.v-field__outline) {
  display: none;
}

.jk-search-field :deep(.v-field--focused) {
  border-color: #b71c1c;
  background-color: rgba(183, 28, 28, 0.07);
}

.jk-search-field :deep(.v-field__prepend-inner .v-icon) {
  color: #b71c1c;
  opacity: 1;
}

/* ══════════════ GRID CARD ══════════════ */
.jk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  max-height: 460px;
  overflow-y: auto;
  padding: 4px 2px;
}

.jk-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(183, 28, 28, 0.15);
  background-color: rgba(183, 28, 28, 0.02);
  cursor: pointer;
  transition: all 0.15s ease;
}

.jk-card:hover {
  background-color: rgba(183, 28, 28, 0.08);
  border-color: rgba(183, 28, 28, 0.35);
  transform: translateY(-1px);
}

.jk-card:active {
  background-color: rgba(183, 28, 28, 0.14);
  transform: translateY(0);
}

.jk-icon-wrapper {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.jk-name {
  flex-grow: 1;
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.8);
  white-space: normal;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.jk-chevron {
  flex-shrink: 0;
}

/* ══════════════ STATES ══════════════ */
.jk-loading-state,
.jk-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: rgba(0, 0, 0, 0.4);
  text-align: center;
}

.jk-empty-state .v-icon {
  color: rgba(183, 28, 28, 0.25);
  margin-bottom: 8px;
}

.empty-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.55);
}

.empty-subtitle {
  font-size: 12px;
  margin-top: 2px;
}
</style>
