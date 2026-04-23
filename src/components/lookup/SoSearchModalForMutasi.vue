<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";

interface So {
  Nomor: string;
  Tanggal: string;
  Customer: string;
  Kota: string;
}

const emit = defineEmits(["close", "so-selected"]);
const toast = useToast();

const items = ref<So[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 15 });

const headers = [
  { title: "No. Pesanan", key: "Nomor" },
  { title: "Tanggal", key: "Tanggal" },
  { title: "Customer", key: "Customer" },
  { title: "Kota", key: "Kota" },
];

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get("/mutasi-stok-form/search/so", {
      params: {
        term: search.value,
        page: page,
        itemsPerPage: itemsPerPage,
      },
    });
    if (response.data && Array.isArray(response.data.items)) {
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      items.value = [];
      totalItems.value = 0;
    }
  } catch (error) {
    let message = "Gagal memuat data SO.";

    if (error instanceof Error) {
      message += " " + error.message;
    }

    toast.error(message);
    items.value = [];
    totalItems.value = 0;
  }
};

const selectSo = (item: So) => {
  emit("so-selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.value.page = 1;
    loadItems(options.value);
  }, 500);
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
    <v-card class="d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih No. Pesanan</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan nomor SO atau nama customer..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
          autofocus
        ></v-text-field>
        <v-data-table-server
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          @update:options="loadItems"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectSo(item)" style="cursor: pointer">
              <td>{{ item.Nomor }}</td>
              <td>{{ item.Tanggal ? format(parseISO(item.Tanggal), "dd/MM/yyyy") : "" }}</td>
              <td>{{ item.Customer }}</td>
              <td>{{ item.Kota }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
