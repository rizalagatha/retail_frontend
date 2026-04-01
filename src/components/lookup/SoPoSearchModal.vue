<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import api from "@/services/api";
import { format, isValid, parseISO } from "date-fns";

interface SoPoItem {
  kode: string;
  nama: string;
  jumlah: number;
  tanggal: string;
  tipe: string;
  sudah_lhk?: number; // [BARU] Flag dari backend: 1 = Sudah, 0 = Belum
}

const props = defineProps({
  cabang: { type: String, required: true },
  tipe: { type: String, default: "ALL" },
  prefix: { type: String, default: "" },
});
const emit = defineEmits(["close", "selected"]);

const dialogTitle = computed(() => {
  if (props.tipe === "SPK") return "Bantuan - Pilih SPK Produksi (Jeron)";
  if (props.tipe === "PO") return "Bantuan - Pilih PO DTF";
  return "Bantuan - Pilih SO DTF";
});

const formatDate = (dateStr: string) => {
  const date = parseISO(dateStr);
  return isValid(date) ? format(date, "dd/MM/yyyy") : "-";
};

const items = ref<SoPoItem[]>([]);
const loading = ref(true);
const search = ref("");
const page = ref(1);
const itemsPerPage = 50;
const totalItems = ref(0);

// [PERBAIKAN] Tambahkan Header Status LHK
const headers = [
  { title: "Nomor", key: "kode", sortable: false, width: "180px" },
  { title: "Nama", key: "nama", sortable: false, width: "35%" },
  { title: "Jumlah", key: "jumlah", sortable: false, align: "end" as const },
  { title: "Tanggal", key: "tanggal", sortable: false },
  { title: "Tipe", key: "tipe", sortable: false },
  { title: "Status LHK", key: "sudah_lhk", sortable: false, align: "center" as const },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/lhk-so-dtf-form/search/so-po", {
      params: {
        term: search.value,
        cabang: props.cabang,
        tipe: props.tipe,
        prefix: props.prefix,
        page: page.value,
        limit: itemsPerPage,
      },
    });

    const result = response.data;
    items.value = result.data || [];
    totalItems.value = result.total || 0;
  } catch (error) {
    console.error("Gagal memuat data SO/PO:", error);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: SoPoItem) => {
  emit("selected", item);
  emit("close");
};

let searchTimeout: number;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1; // reset ke halaman pertama saat search
    loadItems();
  }, 500);
});

watch(page, () => loadItems());

onUnmounted(() => clearTimeout(searchTimeout));
onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1200px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">{{ dialogTitle }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan Nomor atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
          autofocus
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
          :items-per-page="itemsPerPage"
          :page="page"
          :hide-default-footer="true"
          :server-items-length="totalItems"
        >
          <template #item="{ item }">
            <tr @click="selectItem(item)" style="cursor: pointer">
              <td class="font-weight-bold text-primary">{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td class="text-end font-weight-bold">{{ item.jumlah }}</td>
              <td>{{ formatDate(item.tanggal) }}</td>
              <td>
                <v-chip
                  size="x-small"
                  :color="item.tipe.includes('SPK') ? 'orange' : 'blue'"
                  variant="flat"
                >
                  {{ item.tipe }}
                </v-chip>
              </td>
              <td class="text-center">
                <v-chip
                  size="x-small"
                  :color="item.sudah_lhk === 1 ? 'success' : 'grey-darken-1'"
                  :variant="item.sudah_lhk === 1 ? 'flat' : 'outlined'"
                  class="font-weight-bold"
                >
                  <v-icon start size="12">{{
                    item.sudah_lhk === 1 ? "mdi-check-circle" : "mdi-clock-outline"
                  }}</v-icon>
                  {{ item.sudah_lhk === 1 ? "SUDAH LHK" : "BELUM" }}
                </v-chip>
              </td>
            </tr>
          </template>

          <template #bottom>
            <div class="pa-2 border-t">
              <v-pagination
                v-model="page"
                :length="Math.ceil(totalItems / itemsPerPage)"
                total-visible="7"
              />
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-card {
  font-size: 12px;
}

.desktop-table {
  font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 32px !important; /* Sedikit dilonggarkan agar chip tidak terpotong */
}
</style>
