<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { format, addDays } from "date-fns";
import WorkshopSearchModal from "@/components/lookup/WorkshopSearchModal.vue";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";

interface Props {
  modelValue: boolean;
  refSo: string;
  initialData: any;
}

const props = defineProps<Props>();
const emit = defineEmits(["update:modelValue", "saved"]);

const tab = ref("spk");
const authStore = useAuthStore();
const isWorkshopSearchVisible = ref(false);

const lookups = reactive({
  divisi: [] as any[],
  jenisOrder: [] as any[],
  kepentingan: [] as string[],
  sizes: [] as string[],
  komponen: [] as any[]
});

const komponenList = ref<any[]>([]);

const form = reactive({
  divisi: "3", // Default Kaosan
  jenisOrderKode: "",
  kepentingan: "NORMAL",
  isMo: true,
  userMo: authStore.user?.nama || "",
  isCmo: false,
  nomorSpk: "<Otomatis>",
  tanggalSpk: format(new Date(), "yyyy-MM-dd"),
  perusahaan: "SM", // Default SM
  refSo: "",
  customerNama: "",
  customerKode: "",
  workshopKode: "",
  workshopNama: "",
  projectNama: "",
  datelineCustomer: "",
  sizeQty: {} as Record<string, number>,
  ketProduksi: "",
  itemsSo: [] as any[]
});

const fetchAllLookups = async () => {
  try {
    const resDiv = await api.get("/spk-form/lookup/divisi");
    lookups.divisi = resDiv.data;

    const resMain = await api.get("/spk-form/lookups");
    lookups.kepentingan = resMain.data.kepentingan.map((k: any) => k.nama);
    lookups.sizes = resMain.data.sizes.map((s: any) => s.ukuran);

    lookups.sizes.forEach((s: any) => { if (form.sizeQty[s] === undefined) form.sizeQty[s] = 0; });
    komponenList.value = resMain.data.komponen.map((c: any) => ({ ...c, pakai: false, ket: '' }));
  } catch (e) { console.error(e); }
};

// [BARU] Fungsi Ambil Jenis Order berdasarkan Divisi
const fetchJenisOrder = async (divId: string) => {
  try {
    const { data } = await api.get(`/spk-form/lookup/jenis-order/${divId}`);
    lookups.jenisOrder = data;
    // Reset pilihan jika divisi ganti
    if (!isOpenInitialLoad.value) form.jenisOrderKode = "";
  } catch (e) { console.error(e); }
};

const isOpenInitialLoad = ref(false);

watch(() => props.modelValue, async (isOpen) => {
  if (isOpen) {
    isOpenInitialLoad.value = true;
    form.refSo = props.refSo;

    // Ambil Nama & Kode Customer dari data SO
    form.customerNama = props.initialData.customer?.nama || "";
    form.customerKode = props.initialData.customer?.kode || "";

    // Load Jenis Order awal (Divisi 3)
    await fetchJenisOrder(form.divisi);
    isOpenInitialLoad.value = false;
    tab.value = "spk";
  }
});

// Watcher: Jika Divisi diubah, perbarui list Jenis Order
watch(() => form.divisi, (newDiv) => {
  if (!isOpenInitialLoad.value) fetchJenisOrder(newDiv);
});

const totalQtySize = computed(() => Object.values(form.sizeQty).reduce((a, b) => a + (Number(b) || 0), 0));
const onWorkshopSelected = (ws: any) => { form.workshopKode = ws.kode; form.workshopNama = ws.nama; isWorkshopSearchVisible.value = false; };
const handleSave = () => { emit("saved", { ...form, komponen: komponenList.value.filter(k => k.pakai) }); };

onMounted(fetchAllLookups);
</script>

<template>
  <v-dialog :model-value="modelValue" @update:modelValue="v => $emit('update:modelValue', v)" max-width="1100px"
    persistent>
    <v-card class="manksi-compact rounded-lg overflow-hidden">
      <v-toolbar color="indigo-darken-4" density="compact">
        <v-toolbar-title class="font-weight-bold"><v-icon size="18" start>mdi-hammer-wrench</v-icon> SURAT PERINTAH
          KERJA</v-toolbar-title>
        <v-spacer /><v-btn icon="mdi-close" size="small" @click="$emit('update:modelValue', false)" />
      </v-toolbar>

      <v-tabs v-model="tab" bg-color="indigo-lighten-5" color="indigo-darken-4" density="compact">
        <v-tab value="spk">1. SPK Utama</v-tab>
        <v-tab value="lain">2. Lain-Lain (Size & Komponen)</v-tab>
        <v-tab value="kaosan">3. Item Kaosan (Ref SO)</v-tab>
      </v-tabs>

      <v-window v-model="tab" style="height: 520px; overflow-y: auto;" class="bg-grey-lighten-4">
        <v-window-item value="spk" class="pa-4">
          <div class="bg-white pa-4 rounded border mb-4 shadow-sm">
            <v-row dense align="center">
              <v-col cols="3"><v-select v-model="form.divisi" :items="lookups.divisi" item-title="nama"
                  item-value="kode" label="Divisi" density="compact" variant="outlined" hide-details /></v-col>
              <v-col cols="3">
                <v-text-field :model-value="form.customerNama" label="Customer (Auto dari SO)" readonly variant="filled"
                  density="compact" hide-details />
              </v-col>
              <v-col cols="3" class="d-flex align-center"><v-checkbox v-model="form.isMo" label="MO" density="compact"
                  hide-details color="primary" readonly /><span class="ml-1 text-grey">({{ form.userMo
                  }})</span></v-col>
              <v-col cols="3" class="d-flex align-center"><v-checkbox v-model="form.isCmo" label="CMO" density="compact"
                  hide-details disabled /><span class="ml-1 text-grey">(Wait Approval)</span></v-col>
              <v-col cols="3"><v-text-field v-model="form.tanggalSpk" label="Tanggal SPK" type="date" variant="outlined"
                  density="compact" hide-details /></v-col>
              <v-col cols="3"><v-text-field v-model="form.nomorSpk" label="Nomor SPK" readonly variant="filled"
                  density="compact" hide-details prefix="<-- Baru" class="placeholder-red" /></v-col>
              <v-col cols="3"><v-text-field v-model="form.perusahaan" label="Perusahaan" readonly variant="filled"
                  density="compact" hide-details /></v-col>
              <v-col cols="6"><v-text-field :model-value="form.refSo" label="Referensi SO" readonly variant="filled"
                  density="compact" hide-details color="indigo" prepend-inner-icon="mdi-link-variant" /></v-col>
            </v-row>
          </div>

          <v-row dense>
            <v-col cols="6">
              <v-text-field label="Nama Customer" v-model="form.customerNama" readonly variant="outlined"
                density="compact" class="mb-2" bg-color="white" hide-details />
              <v-text-field label="Nama Project / Desain" v-model="form.projectNama" variant="outlined"
                density="compact" bg-color="white" hide-details />
            </v-col>
            <v-col cols="6">
              <v-select v-model="form.jenisOrderKode" :items="lookups.jenisOrder" item-title="nama" item-value="kode"
                label="Jenis Order" density="compact" variant="outlined" bg-color="white" class="mb-2" hide-details
                placeholder="Pilih Jenis Order..." />
              <v-text-field label="Nama Project" v-model="form.projectNama" variant="outlined" density="compact"
                bg-color="white" hide-details />
            </v-col>
            <v-col cols="6">
              <v-text-field label="Workshop / Pabrik" v-model="form.workshopNama" readonly variant="outlined"
                density="compact" append-inner-icon="mdi-magnify" @click="isWorkshopSearchVisible = true" class="mb-2"
                bg-color="white" hide-details />
              <v-select v-model="form.kepentingan" :items="lookups.kepentingan" label="Kepentingan" density="compact"
                variant="outlined" bg-color="white" hide-details />
            </v-col>
            <v-col cols="12" class="mt-2">
              <v-text-field label="Dateline Produksi (Bebas)" v-model="form.datelineCustomer" type="date"
                variant="outlined" density="compact" bg-color="white" hide-details />
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="lain" class="pa-4">
          <v-row dense>
            <v-col cols="2">
              <div class="font-weight-bold mb-1">QTY PER SIZE</div>
              <v-table density="compact" class="border rounded bg-white manksi-table">
                <tbody>
                  <tr v-for="s in lookups.sizes" :key="s">
                    <td>{{ s }}</td>
                    <td><v-text-field v-model.number="form.sizeQty[s]" type="number" variant="underlined"
                        density="compact" hide-details /></td>
                  </tr>
                  <tr class="bg-grey-lighten-3 font-weight-bold">
                    <td>TOTAL</td>
                    <td class="text-right">{{ totalQtySize }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-col>
            <v-col cols="5">
              <div class="font-weight-bold mb-1">KET. PRODUKSI</div>
              <v-textarea v-model="form.ketProduksi" rows="18" variant="outlined" density="compact" bg-color="white"
                placeholder="Instruksi pengerjaan..." hide-details />
            </v-col>
            <v-col cols="5">
              <div class="font-weight-bold mb-1">KET. KOMPONEN</div>
              <v-table density="compact" class="border rounded bg-white manksi-table">
                <thead>
                  <tr>
                    <th style="width: 30px;">V</th>
                    <th>Komponen</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="comp in komponenList" :key="comp.kode">
                    <td><v-checkbox-btn v-model="comp.pakai" density="compact" /></td>
                    <td>{{ comp.nama }}</td>
                    <td><v-text-field v-model="comp.ket" variant="underlined" density="compact" hide-details
                        :disabled="!comp.pakai" /></td>
                  </tr>
                </tbody>
              </v-table>
            </v-col>
          </v-row>
        </v-window-item>

        <v-window-item value="kaosan" class="pa-4">
          <v-table density="compact" fixed-header height="440px" class="border rounded bg-white manksi-table">
            <thead>
              <tr class="bg-indigo-lighten-4">
                <th>Kode</th>
                <th>Nama Barang</th>
                <th>Ukuran</th>
                <th class="text-end">Qty SO</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in form.itemsSo" :key="item.id">
                <td>{{ item.kode }}</td>
                <td>{{ item.nama }}</td>
                <td>{{ item.ukuran }}</td>
                <td class="text-end font-weight-bold">{{ item.jumlah }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-window-item>
      </v-window>

      <v-divider />
      <v-card-actions class="pa-3 bg-white"><v-spacer /><v-btn variant="text" size="small"
          @click="$emit('update:modelValue', false)">Batal</v-btn>
        <v-btn color="indigo-darken-4" variant="flat" size="small" prepend-icon="mdi-check-all"
          @click="handleSave">Simpan SPK</v-btn>
      </v-card-actions>
    </v-card>
    <WorkshopSearchModal v-if="isWorkshopSearchVisible" @close="isWorkshopSearchVisible = false"
      @workshop-selected="onWorkshopSelected" />
  </v-dialog>
</template>

<style scoped>
.manksi-compact {
  font-size: 11px !important;
}

.manksi-compact :deep(input),
.manksi-compact :deep(.v-label),
.manksi-compact :deep(td),
.manksi-compact :deep(th),
.manksi-compact :deep(.v-field__input) {
  font-size: 11px !important;
}

.manksi-table :deep(td) {
  height: 24px !important;
  padding: 0 4px !important;
}

.placeholder-red :deep(.v-field__input::placeholder) {
  color: red !important;
  opacity: 1;
}
</style>
