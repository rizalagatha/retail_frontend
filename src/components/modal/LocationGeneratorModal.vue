<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";

defineProps({
  cabang: { type: String, required: true },
});

const emit = defineEmits(["generate", "close"]);
const toast = useToast();

// State Data Master
const masterLokasi = ref([]);
const isLoadingMaster = ref(false);

const config = reactive({
  base: null, // Mulai dengan null, akan diisi setelah fetch
  turunan: "",
  useLetter: false,
  start: 1,
  end: 5,
  charStart: "A",
  charEnd: "C",
});

// Fetch data master dari backend
const fetchMasterLocations = async () => {
  isLoadingMaster.value = true;
  try {
    const response = await api.get("/lokasi-opname/master");
    masterLokasi.value = response.data;

    // Set default ke 'BX' atau item pertama jika ditemukan
    if (masterLokasi.value.length > 0) {
      const defaultItem =
        masterLokasi.value.find((item) => item.kode === "BX") || masterLokasi.value[0];
      config.base = defaultItem;
    }
  } catch (error) {
    toast.error("Gagal memuat master lokasi.", error);
  } finally {
    isLoadingMaster.value = false;
  }
};

const previewLocations = computed(() => {
  if (!config.base) return []; // Guard jika data belum dimuat

  const locs = [];
  const prefix = `${config.base.kode}${config.turunan}`.toUpperCase();

  if (!config.useLetter) {
    for (let i = config.start; i <= config.end; i++) {
      const result = `${prefix}${i}`;
      if (result.length <= 6) locs.push(result);
    }
  } else {
    const s = config.charStart.toUpperCase().charCodeAt(0);
    const e = config.charEnd.toUpperCase().charCodeAt(0);
    for (let char = s; char <= e; char++) {
      const result = `${prefix}${String.fromCharCode(char)}`;
      if (result.length <= 6) locs.push(result);
    }
  }
  return locs;
});

const handleGenerate = () => {
  if (previewLocations.value.length === 0 || !config.base) return;

  // Kirim objek yang berisi lokasi dan nama jenisnya untuk disimpan di tlokasi_opname
  emit("generate", {
    locations: previewLocations.value,
    jenisNama: config.base.jenis,
  });
};

onMounted(() => {
  fetchMasterLocations();
});
</script>

<template>
  <v-dialog model-value persistent max-width="450px">
    <v-card :loading="isLoadingMaster">
      <v-toolbar color="primary" density="compact" title="Generator Lokasi" />

      <v-card-text class="pa-4">
        <v-alert v-if="config.base" type="info" variant="tonal" density="compact" class="mb-4 text-caption">
          Cabang: <strong>{{ cabang }}</strong> | Status: <strong>{{ config.base.status }}</strong>
        </v-alert>

        <v-row dense>
          <v-col cols="12">
            <v-select v-model="config.base" :items="masterLokasi" item-title="jenis" return-object label="Jenis Lokasi"
              density="compact" variant="outlined" :loading="isLoadingMaster">
              <template #item="{ props, item }">
                <v-list-item v-bind="props" :subtitle="`Kode: ${item.raw.kode} (${item.raw.status})`"></v-list-item>
              </template>
            </v-select>
          </v-col>

          <v-col cols="12">
            <v-text-field v-model="config.turunan" label="Kode Turunan (Contoh: 1, 6, A)"
              placeholder="Kosongkan jika tidak ada" density="compact" variant="outlined" maxlength="3" />
          </v-col>

          <v-col cols="12">
            <v-radio-group v-model="config.useLetter" inline hide-details class="mt-0">
              <v-radio :value="false" label="Akhiran Angka (BX3)" />
              <v-radio :value="true" label="Akhiran Huruf (RGB)" />
            </v-radio-group>
          </v-col>

          <template v-if="!config.useLetter">
            <v-col cols="6">
              <v-text-field v-model.number="config.start" type="number" label="Mulai" density="compact"
                variant="outlined" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model.number="config.end" type="number" label="Selesai" density="compact"
                variant="outlined" />
            </v-col>
          </template>

          <template v-else>
            <v-col cols="6">
              <v-text-field v-model="config.charStart" label="Dari (A-Z)" density="compact" variant="outlined"
                maxlength="1" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="config.charEnd" label="Sampai (A-Z)" density="compact" variant="outlined"
                maxlength="1" />
            </v-col>
          </template>
        </v-row>

        <div class="mt-4 pa-2 bg-grey-lighten-4 rounded border">
          <div class="text-caption font-weight-bold mb-1">Hasil Preview (Maks 6 Karakter):</div>
          <div class="d-flex flex-wrap ga-1">
            <v-chip v-for="l in previewLocations" :key="l" size="x-small" label color="primary" variant="flat">{{ l
              }}</v-chip>
          </div>
          <div v-if="previewLocations.length === 0 && !isLoadingMaster" class="text-caption text-error">
            Kombinasi tidak valid.
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" size="small" @click="$emit('close')">Batal</v-btn>
        <v-btn color="primary" size="small" variant="flat" :disabled="previewLocations.length === 0 || isLoadingMaster"
          @click="handleGenerate">Terapkan Lokasi</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
