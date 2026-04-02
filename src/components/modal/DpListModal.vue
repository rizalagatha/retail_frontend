<script setup lang="ts">
import { ref } from "vue"; // Tambahkan ref
import { formatRupiah } from "@/utils/formatRupiah";
import UnpaidDpSearchModal from "@/components/lookup/UnpaidDpSearchModal.vue"; // Import Modal Pencarian

// 1. Definisikan Interface
interface DpItem {
  nomor: string;
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
      <v-toolbar color="teal" density="compact">
        <v-toolbar-title>Rincian Uang Muka (DP)</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')"></v-btn>
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
            <v-text-field
              :model-value="item.nomor"
              variant="underlined"
              density="compact"
              hide-details
              readonly
              filled
            />
          </template>
          <template #[`item.jenis`]="{ item }">
            <v-text-field
              :model-value="item.jenis"
              variant="underlined"
              density="compact"
              hide-details
              readonly
              filled
            />
          </template>
          <template #[`item.nominal`]="{ item }">
            <v-text-field
              :model-value="formatRupiah(item.nominal)"
              variant="underlined"
              density="compact"
              hide-details
              class="text-end"
              readonly
              filled
            />
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

/* Style agar input terlihat jelas bisa diklik */
.search-input :deep(input) {
  cursor: pointer;
}
</style>
