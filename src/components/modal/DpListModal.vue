<script setup lang="ts">
import { ref } from "vue"; // Tambahkan ref
import { formatRupiah } from "@/utils/formatRupiah";
import UnpaidDpSearchModal from "@/components/lookup/UnpaidDpSearchModal.vue"; // Import Modal Pencarian

// 1. Definisikan Interface
interface DpItem {
  nomor: string;
  tanggal?: string;
  jenis: string;
  posting: string;
  fsk: string;
  nominal: number;
}

// Interface untuk DP yang dipilih dari UnpaidDpSearchModal
interface SelectedDp {
  nomor: string;
  jenis: string;
  nominal: number;
}

// 2. Tentukan Props
const props = defineProps({
  dpItems: {
    type: Array as () => DpItem[],
    required: true,
  },
  customerKode: {
    // [BARU] Perlu customer kode untuk filter DP
    type: String,
    required: true,
  },
});

// 3. Tentukan Emits
// [BARU] 'add-dp' untuk mengirim DP baru ke parent
const emit = defineEmits(["close", "remove-dp", "add-dp"]);

// 4. State Lokal
const isDpSearchVisible = ref(false); // Kontrol modal pencarian DP
const newDpNomor = ref(""); // Model untuk input pencarian (visual saja)

// 5. Headers Tabel
const dpTableHeaders = [
  { title: "No. Setoran", key: "nomor", width: "200px" },
  { title: "Tanggal", key: "tanggal", width: "110px" },
  { title: "Jenis", key: "jenis", width: "100px" },
  { title: "Nominal", key: "nominal", align: "end", width: "150px" },
  { title: "Posting", key: "posting", width: "100px" },
  { title: "Actions", key: "actions", sortable: false, width: "50px" },
] as const;

// 6. Methods
const requestRemoveDp = (item: DpItem) => {
  if (item.posting === "SUDAH") {
    alert("DP yang sudah diposting tidak dapat dihapus.");
    return;
  }
  emit("remove-dp", item);
};

// [BARU] Handler saat DP dipilih dari modal pencarian
const onDpSelected = (dp: SelectedDp) => {
  // Kirim data DP ke parent (SoCreateView) untuk diproses/ditambahkan
  emit("add-dp", dp);
  // Reset input visual (opsional)
  newDpNomor.value = "";
};

// [BARU] Handler trigger pencarian (F1 atau Klik)
const openDpSearch = () => {
  if (!props.customerKode) {
    alert("Kode customer tidak valid. Pastikan customer sudah dipilih.");
    return;
  }
  isDpSearchVisible.value = true;
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="800px">
    <v-card>
      <v-toolbar density="compact" class="modal-toolbar">
        <v-toolbar-title class="font-weight-bold">
          <v-icon start size="18">mdi-cash-multiple</v-icon>
          Rincian Uang Muka (DP)
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-0">
        <v-data-table
          :headers="dpTableHeaders"
          :items="props.dpItems"
          density="compact"
          class="desktop-table header-browse-blue"
          :items-per-page="-1"
          fixed-header
        >
          <template #[`item.nomor`]="{ item }">
            <div class="dp-cell dp-cell--bold">{{ item.nomor }}</div>
          </template>
          <template #[`item.tanggal`]="{ item }">
            <div class="dp-cell text-center">{{ item.tanggal || "-" }}</div>
          </template>
          <template #[`item.jenis`]="{ item }">
            <v-chip size="x-small" color="red-darken-2" variant="flat" class="font-weight-bold">
              {{ item.jenis }}
            </v-chip>
          </template>
          <template #[`item.nominal`]="{ item }">
            <div class="dp-cell dp-cell--nominal text-end">{{ formatRupiah(item.nominal) }}</div>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn
              icon="mdi-delete"
              size="x-small"
              variant="text"
              color="error"
              @click="requestRemoveDp(item)"
              title="Hapus DP"
              :disabled="item.posting === 'SUDAH'"
            />
          </template>

          <template #[`body.append`]>
            <tr>
              <td>
                <v-text-field
                  v-model="newDpNomor"
                  placeholder="Cari DP (F1)..."
                  variant="underlined"
                  density="compact"
                  hide-details
                  append-inner-icon="mdi-magnify"
                  @click="openDpSearch"
                  @keydown.f1.prevent="openDpSearch"
                  class="search-input"
                />
              </td>
              <td></td>
              <!-- kolom tanggal -->
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </template>

          <template #bottom></template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <UnpaidDpSearchModal
      v-if="isDpSearchVisible"
      :customer-kode="props.customerKode"
      @close="isDpSearchVisible = false"
      @selected="onDpSelected"
    />
  </v-dialog>
</template>

<style scoped>
.desktop-table {
  max-height: 400px;
}

.text-end :deep(input) {
  text-align: right;
}

.text-center :deep(input) {
  text-align: center;
}

/* Style agar input terlihat jelas bisa diklik */
.search-input :deep(input) {
  cursor: pointer;
}

.modal-toolbar {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.modal-toolbar :deep(.v-toolbar-title) {
  color: #ffffff;
}
.modal-toolbar :deep(.v-btn) {
  color: #ffffff !important;
}

.desktop-table {
  max-height: 400px;
}

.desktop-table :deep(thead tr th) {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 10.5px !important;
}

.desktop-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

/* Sel readonly - bukan field, biar gak keliatan editable */
.dp-cell {
  font-size: 12px;
  height: 32px;
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.75);
}
.dp-cell--bold {
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}
.dp-cell--nominal {
  font-weight: 700;
  justify-content: flex-end;
  color: #b71c1c;
}
.text-center {
  justify-content: center;
}
.text-end {
  justify-content: flex-end;
}

/* Search field row - fokus merah */
.search-input :deep(input) {
  cursor: pointer;
}
.search-input :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}
</style>
