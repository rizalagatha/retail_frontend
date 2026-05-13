<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import PageLayout from "@/components/PageLayout.vue";

interface KatalogItem {
  kode: string;
  nama: string;
  gambar_url: string | null;
  urutan: number;
  jenis_kain: string;
  lengan: string;
}

interface GallerySlot {
  index: number;
  url: string | null;
}

interface GalleryImage {
  img_index: number;
  img_url: string;
}

const toast = useToast();
const items = ref<KatalogItem[]>([]);
const originalUrutanMap = ref<Record<string, number>>({});
const search = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const isDirty = ref(false);
const page = ref(1);
const itemsPerPage = ref(100);
// State Galeri
const isGalleryModalVisible = ref(false);
const selectedItemForGallery = ref<KatalogItem | null>(null);
const gallerySlots = ref<GallerySlot[]>([]);
const isUploadingGallery = ref(false);
const isDeletingGallery = ref<number | null>(null);

const selectedKategori = ref("ALL");
const selectedLengan = ref("ALL");
const multiFileInput = ref<HTMLInputElement | null>(null);
const isSwapping = ref(false);

const dialogConfirmDelete = reactive({
  show: false,
  index: null as number | null,
});

const headers = [
  { title: "Gambar Utama", key: "gambar_url", width: 100, sortable: false },
  { title: "Kode", key: "kode", width: 180 },
  { title: "Nama Barang", key: "nama" },
  { title: "Urutan", key: "urutan", width: 120, align: "center" as const },
  { title: "Aksi", key: "actions", width: 150, sortable: false, align: "center" as const },
];

const filteredItems = computed(() => {
  let result = items.value;

  if (selectedKategori.value !== "ALL") {
    result = result.filter((i) => i.jenis_kain === selectedKategori.value);
  }

  if (selectedLengan.value !== "ALL") {
    result = result.filter((i) => i.lengan === selectedLengan.value);
  }

  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(
      (i) => i.kode.toLowerCase().includes(q) || i.nama.toLowerCase().includes(q)
    );
  }

  return result;
});

// Stats
const totalItems = computed(() => items.value.length);
const withImage = computed(() => items.value.filter((i) => i.gambar_url).length);
const withoutImage = computed(() => items.value.filter((i) => !i.gambar_url).length);

const kategoriList = computed(() => {
  const set = new Set(items.value.map((i) => i.jenis_kain));
  return ["ALL", ...Array.from(set).sort()];
});

const lenganList = computed(() => {
  const set = new Set(items.value.map((i) => i.lengan));
  return ["ALL", ...Array.from(set).sort()];
});

const triggerSlotUpload = (index: number) => {
  // Pakai window.document supaya aman dan pasti terbaca
  const el = window.document.getElementById(`slot-file-${index}`);
  if (el) el.click();
};

const fetchKatalog = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/katalog/list");
    items.value = response.data;
    originalUrutanMap.value = {};
    response.data.forEach((item: KatalogItem) => {
      originalUrutanMap.value[item.kode] = item.urutan;
    });
    isDirty.value = false;
  } catch {
    toast.error("Gagal memuat daftar katalog.");
  } finally {
    isLoading.value = false;
  }
};

const saveUrutan = async () => {
  const changedItems = items.value.filter((item) => {
    return Number(item.urutan) !== originalUrutanMap.value[item.kode];
  });

  if (changedItems.length === 0) {
    toast.info("Tidak ada perubahan urutan yang perlu disimpan.");
    isDirty.value = false;
    return;
  }

  isSaving.value = true;
  try {
    const payload = changedItems.map((item) => ({
      kode: item.kode,
      urutan: Number(item.urutan) || 9999,
    }));
    await api.put("/katalog/update-urutan", { urutanList: payload });
    toast.success("Urutan berhasil diperbarui!");
    isDirty.value = false;
    fetchKatalog();
  } catch {
    toast.error("Gagal menyimpan urutan.");
  } finally {
    isSaving.value = false;
  }
};

// --- LOGIKA GALERI ---
const openGalleryManager = async (item: KatalogItem) => {
  selectedItemForGallery.value = item;
  gallerySlots.value = Array.from({ length: 6 }, (_, i) => ({ index: i + 1, url: null }));

  try {
    const res = await api.get(`/katalog/gallery/${item.kode}`);
    res.data.forEach((img: GalleryImage) => {
      const slot = gallerySlots.value.find((s: GallerySlot) => s.index === img.img_index);

      if (slot) {
        slot.url = img.img_url;
      }
    });
  } catch {
    console.error("Gagal load galeri");
  }
  isGalleryModalVisible.value = true;
};

const handleGalleryUpload = async (event: Event, index: number) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !selectedItemForGallery.value) return;

  const formData = new FormData();
  formData.append("image", file);
  formData.append("index", index.toString());

  isUploadingGallery.value = true;
  try {
    const response = await api.post(
      `/katalog/upload/${selectedItemForGallery.value.kode}`,
      formData
    );
    const slot = gallerySlots.value.find((s) => s.index === index);
    if (slot) slot.url = response.data.imageUrl;
    toast.success(`Gambar ${index} berhasil diupload!`);
    fetchKatalog(); // Supaya thumbnail di tabel update jika yang diupload slot 1
  } catch {
    toast.error("Gagal upload gambar.");
  } finally {
    isUploadingGallery.value = false;
    target.value = "";
  }
};

const onUrutanChange = () => {
  isDirty.value = items.value.some(
    (item) => Number(item.urutan) !== originalUrutanMap.value[item.kode]
  );
};

const promptDeleteGallery = (index: number) => {
  dialogConfirmDelete.index = index;
  dialogConfirmDelete.show = true;
};

const executeGalleryDelete = async () => {
  const index = dialogConfirmDelete.index;
  if (!selectedItemForGallery.value || index === null) return;

  isDeletingGallery.value = index;
  dialogConfirmDelete.show = false; // Tutup dialog

  try {
    await api.delete(`/katalog/gallery/${selectedItemForGallery.value.kode}/${index}`);

    // Kosongkan URL di UI secara instan
    const slot = gallerySlots.value.find((s) => s.index === index);
    if (slot) slot.url = null;

    toast.success(`Gambar ${index} dihapus!`);
    fetchKatalog(); // Refresh thumbnail tabel belakang
  } catch {
    toast.error("Gagal menghapus gambar.");
  } finally {
    isDeletingGallery.value = null;
  }
};

const triggerMultiUpload = () => {
  if (multiFileInput.value) multiFileInput.value.click();
};

const handleMultiUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0 || !selectedItemForGallery.value) return;

  // Cari slot yang masih kosong
  const emptySlots = gallerySlots.value.filter((s) => !s.url);
  if (emptySlots.length === 0) {
    toast.warning("Semua slot galeri sudah penuh!");
    target.value = "";
    return;
  }

  const filesToUpload = Array.from(files).slice(0, emptySlots.length);
  if (files.length > emptySlots.length) {
    toast.warning(`Hanya ${emptySlots.length} slot kosong tersedia. Sisa gambar diabaikan.`);
  }

  isUploadingGallery.value = true;
  try {
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const targetSlot = emptySlots[i].index; // Ambil index slot kosong terdekat

      const formData = new FormData();
      formData.append("image", file);
      formData.append("index", targetSlot.toString());

      const response = await api.post(
        `/katalog/upload/${selectedItemForGallery.value.kode}`,
        formData
      );
      const slot = gallerySlots.value.find((s) => s.index === targetSlot);
      if (slot) slot.url = response.data.imageUrl;
    }
    toast.success(`${filesToUpload.length} gambar berhasil diupload!`);
    fetchKatalog();
  } catch {
    toast.error("Gagal mengupload sebagian gambar.");
  } finally {
    isUploadingGallery.value = false;
    target.value = "";
  }
};

const swapSlot = async (indexA: number, indexB: number) => {
  if (!selectedItemForGallery.value || isSwapping.value) return;
  if (indexB < 1 || indexB > 6) return;

  const slotA = gallerySlots.value.find((s) => s.index === indexA);
  const slotB = gallerySlots.value.find((s) => s.index === indexB);
  if (!slotA || !slotB) return;

  // Tukar secara optimis di UI biar terasa instan tanpa nunggu loading
  const tempUrl = slotA.url;
  slotA.url = slotB.url;
  slotB.url = tempUrl;

  isSwapping.value = true;
  try {
    await api.put(`/katalog/gallery/swap/${selectedItemForGallery.value.kode}/${indexA}/${indexB}`);
    fetchKatalog(); // Refresh thumbnail latar belakang
  } catch {
    toast.error("Gagal menukar urutan gambar.");
    // Rollback kalau gagal
    const revertTemp = slotA.url;
    slotA.url = slotB.url;
    slotB.url = revertTemp;
  } finally {
    isSwapping.value = false;
  }
};

onMounted(() => {
  fetchKatalog();
});
</script>

<template>
  <PageLayout title="Admin Panel — Katalog Cek Stok" icon="mdi-view-dashboard-edit" desktop-mode>
    <template #header-actions>
      <v-btn
        v-if="isDirty"
        size="small"
        variant="tonal"
        color="warning"
        prepend-icon="mdi-alert-circle-outline"
        disabled
        class="mr-1"
      >
        Ada perubahan belum disimpan
      </v-btn>
      <v-btn
        color="primary"
        size="small"
        prepend-icon="mdi-content-save"
        @click="saveUrutan"
        :loading="isSaving"
        :disabled="!isDirty"
      >
        Simpan Urutan
      </v-btn>
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-refresh"
        @click="fetchKatalog"
        :loading="isLoading"
      >
        Refresh
      </v-btn>
    </template>

    <div class="katalog-layout">
      <!-- STAT BAR -->
      <div class="stat-bar">
        <div class="stat-item">
          <v-icon size="14" color="primary" class="mr-1">mdi-database-outline</v-icon>
          <span class="stat-label">Total Barang:</span>
          <span class="stat-value">{{ totalItems.toLocaleString("id-ID") }}</span>
        </div>
        <v-divider vertical class="mx-2 stat-divider" />
        <div class="stat-item">
          <v-icon size="14" color="success" class="mr-1">mdi-image-check-outline</v-icon>
          <span class="stat-label">Ada Gambar:</span>
          <span class="stat-value text-success">{{ withImage }}</span>
        </div>
        <v-divider vertical class="mx-2 stat-divider" />
        <div class="stat-item">
          <v-icon size="14" color="error" class="mr-1">mdi-image-off-outline</v-icon>
          <span class="stat-label">Belum Ada Gambar:</span>
          <span class="stat-value text-error">{{ withoutImage }}</span>
        </div>
        <v-divider vertical class="mx-2 stat-divider" />
        <div class="stat-item">
          <v-icon size="14" color="grey-darken-1" class="mr-1">mdi-information-outline</v-icon>
          <span class="stat-label text-grey-darken-1" style="font-style: italic">
            Angka urutan lebih kecil = tampil lebih atas di Cek Stok publik.
          </span>
        </div>

        <v-spacer />

        <div class="d-flex align-center gap-2">
          <div style="width: 120px">
            <v-select
              v-model="selectedLengan"
              :items="lenganList"
              density="compact"
              variant="outlined"
              hide-details
              bg-color="white"
              class="filter-select-small"
              label="Filter Lengan"
            ></v-select>
          </div>
          <div style="width: 140px">
            <v-select
              v-model="selectedKategori"
              :items="kategoriList"
              density="compact"
              variant="outlined"
              hide-details
              bg-color="white"
              class="filter-select-small"
              label="Filter Jenis Kain"
            ></v-select>
          </div>
          <div class="search-wrap ml-1">
            <v-icon size="14" color="grey-darken-1" class="mr-1">mdi-magnify</v-icon>
            <input v-model="search" class="stat-search" placeholder="Cari kode atau nama..." />
          </div>
        </div>
      </div>

      <!-- TABLE -->
      <div class="table-container">
        <v-data-table
          v-model:page="page"
          v-model:items-per-page="itemsPerPage"
          :headers="headers"
          :items="filteredItems"
          :loading="isLoading"
          class="katalog-table header-browse-blue"
          density="compact"
          fixed-header
          height="100%"
          :loading-text="'Memuat data katalog...'"
          no-data-text="Tidak ada data katalog."
        >
          <!-- Gambar -->
          <template #[`item.gambar_url`]="{ item }">
            <div class="img-cell">
              <v-img
                v-if="item.gambar_url"
                :src="item.gambar_url"
                width="48"
                height="48"
                cover
                class="rounded img-thumb"
              >
                <template #error>
                  <div class="img-placeholder">
                    <v-icon size="18" color="grey-lighten-1">mdi-image-broken-variant</v-icon>
                  </div>
                </template>
              </v-img>
              <div v-else class="img-placeholder">
                <v-icon size="18" color="grey-lighten-2">mdi-image-off-outline</v-icon>
              </div>
            </div>
          </template>

          <!-- Kode -->
          <template #[`item.kode`]="{ item }">
            <span class="kode-text">{{ item.kode }}</span>
          </template>

          <!-- Nama -->
          <template #[`item.nama`]="{ item }">
            <span class="nama-text">{{ item.nama }}</span>
          </template>

          <!-- Urutan -->
          <template #[`item.urutan`]="{ item }">
            <div class="urutan-cell">
              <input
                v-model.number="item.urutan"
                type="number"
                class="urutan-input"
                :class="{ 'urutan-default': item.urutan >= 9999 }"
                min="1"
                @input="onUrutanChange"
              />
            </div>
          </template>

          <!-- Aksi -->
          <template #[`item.actions`]="{ item }">
            <v-btn
              size="x-small"
              color="primary"
              variant="flat"
              prepend-icon="mdi-image-multiple"
              @click="openGalleryManager(item as KatalogItem)"
            >
              Kelola Gambar
            </v-btn>
          </template>

          <!-- Footer pagination -->
          <template #bottom="{ pageCount }">
            <div class="table-footer">
              <div class="footer-left">
                <span class="footer-meta">Tampilkan</span>
                <select class="footer-select" v-model.number="itemsPerPage">
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                  <option :value="200">200</option>
                  <option :value="-1">Semua</option>
                </select>
                <span class="footer-meta">baris</span>
              </div>

              <div class="footer-pages">
                <button class="fp-btn" :disabled="page === 1" @click="page = 1">
                  <v-icon size="13">mdi-page-first</v-icon>
                </button>
                <button class="fp-btn" :disabled="page === 1" @click="page--">
                  <v-icon size="13">mdi-chevron-left</v-icon>
                </button>
                <span class="fp-info">Hal. {{ page }} / {{ pageCount }}</span>
                <button class="fp-btn" :disabled="page >= pageCount" @click="page++">
                  <v-icon size="13">mdi-chevron-right</v-icon>
                </button>
                <button class="fp-btn" :disabled="page >= pageCount" @click="page = pageCount">
                  <v-icon size="13">mdi-page-last</v-icon>
                </button>
              </div>

              <div class="footer-right">
                <span class="footer-meta">
                  <strong>{{ filteredItems.length }}</strong> barang
                </span>
              </div>
            </div>
          </template>
        </v-data-table>
      </div>
    </div>
  </PageLayout>

  <v-dialog v-model="isGalleryModalVisible" max-width="600px">
    <v-card class="rounded-xl overflow-hidden elevation-10">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-body-2 font-weight-bold">
          <v-icon start size="18">mdi-image-multiple</v-icon>
          Kelola Galeri: {{ selectedItemForGallery?.kode }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          size="small"
          variant="flat"
          color="white"
          class="text-primary font-weight-bold ml-4 mr-2"
          @click="triggerMultiUpload"
          :loading="isUploadingGallery"
          prepend-icon="mdi-image-plus"
        >
          Upload Multiple
        </v-btn>
        <input
          type="file"
          multiple
          accept="image/jpeg, image/png, image/jpg"
          class="d-none"
          ref="multiFileInput"
          @change="handleMultiUpload"
        />
        <v-btn
          icon="mdi-close"
          @click="isGalleryModalVisible = false"
          variant="text"
          size="small"
        />
      </v-toolbar>
      <v-card-text class="pa-4 bg-grey-lighten-5">
        <v-row dense>
          <v-col v-for="slot in gallerySlots" :key="slot.index" cols="4">
            <v-card
              variant="flat"
              class="rounded-lg border pa-2 d-flex flex-column align-center bg-white h-100 position-relative card-gallery-slot"
              height="165"
              style="
                border-style: dashed !important;
                border-width: 1px !important;
                border-color: #ddd !important;
              "
            >
              <div class="text-caption font-weight-bold text-grey-darken-2 mb-1">
                Slot {{ slot.index }}
              </div>

              <div
                class="gallery-img-container flex-grow-1 d-flex align-center justify-center w-100 bg-grey-lighten-4 rounded mb-2 position-relative"
              >
                <v-img
                  v-if="slot.url"
                  :src="slot.url"
                  width="100%"
                  height="80"
                  cover
                  class="rounded"
                />
                <v-icon v-else size="32" color="grey-lighten-2">mdi-image-plus</v-icon>

                <div
                  class="swap-overlay d-flex align-center justify-space-between w-100 px-1 position-absolute"
                  style="top: 50%; transform: translateY(-50%); z-index: 2"
                >
                  <v-btn
                    v-if="slot.index > 1"
                    icon="mdi-chevron-left"
                    size="x-small"
                    color="rgba(0,0,0,0.6)"
                    class="text-white swap-btn"
                    @click.stop="swapSlot(slot.index, slot.index - 1)"
                    :disabled="isSwapping"
                  ></v-btn>
                  <div v-else></div>
                  <v-btn
                    v-if="slot.index < 6"
                    icon="mdi-chevron-right"
                    size="x-small"
                    color="rgba(0,0,0,0.6)"
                    class="text-white swap-btn"
                    @click.stop="swapSlot(slot.index, slot.index + 1)"
                    :disabled="isSwapping"
                  ></v-btn>
                </div>
              </div>

              <input
                type="file"
                :id="`slot-file-${slot.index}`"
                class="d-none"
                accept="image/jpeg, image/png, image/jpg"
                @change="(e) => handleGalleryUpload(e, slot.index)"
              />

              <div class="d-flex w-100 gap-1 mt-auto">
                <v-btn
                  size="x-small"
                  :color="slot.url ? 'blue-grey' : 'primary'"
                  variant="flat"
                  class="flex-grow-1 text-none font-weight-bold"
                  @click="triggerSlotUpload(slot.index)"
                  :loading="isUploadingGallery"
                >
                  <v-icon start size="14">{{
                    slot.url ? "mdi-image-edit-outline" : "mdi-upload"
                  }}</v-icon>
                  {{ slot.url ? "Ganti" : "Upload" }}
                </v-btn>

                <v-btn
                  v-if="slot.url"
                  size="x-small"
                  color="error"
                  variant="tonal"
                  icon
                  width="28"
                  height="28"
                  :loading="isDeletingGallery === slot.index"
                  @click="promptDeleteGallery(slot.index)"
                >
                  <v-icon size="16">mdi-delete-outline</v-icon>
                </v-btn>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-dialog v-model="dialogConfirmDelete.show" max-width="400px">
    <v-card class="rounded-xl overflow-hidden">
      <v-card-title
        class="text-h6 font-weight-bold d-flex align-center py-3 bg-red-darken-1 text-white"
      >
        <v-icon start class="mr-2">mdi-alert-octagon-outline</v-icon>
        Konfirmasi Hapus
      </v-card-title>
      <v-card-text class="pt-4 text-body-1 bg-white">
        Apakah Anda yakin ingin menghapus gambar pada
        <strong>Slot {{ dialogConfirmDelete.index }}</strong
        >? <br /><br />Gambar yang dihapus tidak dapat dikembalikan.
      </v-card-text>
      <v-card-actions class="px-4 py-3 bg-grey-lighten-5 border-t">
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-3" variant="text" @click="dialogConfirmDelete.show = false"
          >Batal</v-btn
        >
        <v-btn
          color="red"
          variant="flat"
          class="px-4 font-weight-bold"
          @click="executeGalleryDelete"
          prepend-icon="mdi-delete"
          >Hapus</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ===== LAYOUT ===== */
.katalog-layout {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

/* ===== STAT BAR ===== */
.stat-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 11px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.stat-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
}

.stat-value {
  font-weight: 700;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

.stat-divider {
  height: 14px !important;
  opacity: 0.3;
}

/* ===== SEARCH IN STAT BAR ===== */
.search-wrap {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  padding: 3px 8px;
  background: rgb(var(--v-theme-surface));
}

.stat-search {
  border: none;
  outline: none;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
  background: transparent;
  width: 220px;
}

.stat-search::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* ===== TABLE CONTAINER ===== */
.table-container {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
}

/* ===== TABLE STYLES ===== */
.katalog-table {
  height: 100%;
  font-size: 11px !important;
}

.katalog-table :deep(.v-table__wrapper) {
  height: 100% !important;
  overflow-y: auto !important;
}

/* Header — biru seperti SO Browse */
.katalog-table :deep(thead tr th) {
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 36px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 10px !important;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

/* Row */
.katalog-table :deep(tbody tr td) {
  font-size: 11px !important;
  height: 52px !important;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  padding: 4px 10px !important;
  vertical-align: middle;
}

.katalog-table :deep(tbody tr:hover td) {
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
}

/* ===== CELL CONTENT ===== */
.img-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-thumb {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.img-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kode-text {
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: 600;
  color: #0d47a1;
  background: #e3f2fd;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}

.nama-text {
  font-size: 11px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.3;
}

/* ===== URUTAN INPUT ===== */
.urutan-cell {
  display: flex;
  justify-content: center;
}

.urutan-input {
  width: 72px;
  height: 28px;
  border: 1px solid rgba(var(--v-border-color), 0.6);
  border-radius: 4px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
  outline: none;
  transition: border-color 0.15s;
  -moz-appearance: textfield;
  appearance: textfield;
}

.urutan-input::-webkit-inner-spin-button,
.urutan-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.urutan-input:focus {
  border-color: #1976d2;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.15);
}

.urutan-input.urutan-default {
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-weight: 500;
}

/* ===== TABLE FOOTER ===== */
.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  gap: 12px;
  font-size: 11px;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-meta {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.footer-select {
  appearance: none;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 2px 20px 2px 8px;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 5px center;
}

.footer-pages {
  display: flex;
  align-items: center;
  gap: 2px;
}

.fp-btn :deep(.v-icon) {
  color: #555;
}

.fp-info {
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  padding: 0 8px;
  white-space: nowrap;
}

.footer-right strong {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 700;
}

/* ===== MODAL GALLERY ===== */
.gallery-img-container {
  height: 80px;
  border: 1px solid #eee;
  overflow: hidden;
}

.gap-1 {
  gap: 4px;
}

/* ===== SWAP BUTTON ===== */
.swap-btn {
  width: 22px !important;
  height: 22px !important;
}
.swap-btn :deep(.v-icon) {
  font-size: 16px !important;
}

/* ===== CUSTOM FILTER SELECT MINI ===== */
.filter-select-small :deep(.v-field__input) {
  font-size: 11px !important;
  padding-top: 2px !important;
  padding-bottom: 2px !important;
  min-height: 28px !important;
}

.filter-select-small :deep(.v-field__append-inner) {
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}

.filter-select-small :deep(.v-label) {
  font-size: 11px !important;
  top: 4px !important;
}
</style>
