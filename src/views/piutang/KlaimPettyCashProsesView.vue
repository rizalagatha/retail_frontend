<script setup lang="ts">
import { ref, onMounted, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import { format, parseISO } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

interface KlaimHeader {
  pck_nomor: string;
  pck_tanggal: string;
  pck_cab: string;
  gdg_nama: string;
  pck_total: number;
  pck_keterangan: string;
  pck_acc: string;
  pck_status: string;
  [key: string]: string | number; // Fallback untuk properti tambahan
}

interface KlaimDetail {
  pc_nomor: string;
  pcd_tanggal: string;
  pcd_pcv: number | string;
  pcd_kategori: string;
  pcd_keterangan: string;
  pcd_no_transaksi?: string;
  pcd_nominal: number;
  pcd_file?: string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const MENU_ID = "59";

const loading = ref(true);
const isProcessing = ref(false);
const header = ref<Partial<KlaimHeader>>({});
const details = ref<KlaimDetail[]>([]);

const form = ref({ catatanFinance: "" });

const dialogConfirm = reactive({ show: false, onConfirm: () => {} });
const dialogPrint = reactive({ show: false, nomor: "" });
const dialogRejectItem = reactive({
  show: false,
  pc_nomor: "",
  alasan: "",
  isProcessing: false,
});

const fetchKlaimData = async () => {
  try {
    const response = await api.get(`/petty-cash/klaim-finance/proses/${route.params.nomor}`);
    header.value = response.data.header;
    details.value = response.data.details;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal memuat data pengajuan.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
    router.back();
  } finally {
    loading.value = false;
  }
};

const getImageUrl = (fileName: string) => {
  if (!fileName) return "";

  // Ambil baseURL dari api.defaults yang sudah disetting di axios config (misal: /api atau https://domain/api)
  const apiUrl = (api.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || "") as string;

  // Hapus tulisan "/api" di akhir URL karena folder uploads biasanya ada di root sejajar dengan api
  // (misal: https://103.94.238.252/api -> https://103.94.238.252)
  const cleanBaseUrl = apiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");

  const cleanFileName = fileName.trim();

  // Gabungkan baseUrl dengan path uploads
  return `${cleanBaseUrl}/uploads/pettycash/${cleanFileName}`;
};

const openImageInNewTab = (url: string) => {
  window.open(url, "_blank");
};

const handleApprove = () => {
  dialogConfirm.onConfirm = async () => {
    isProcessing.value = true;
    try {
      // [UPDATE] Memanggil endpoint Approve PCK
      await api.put(`/petty-cash/klaim-finance/approve/${header.value.pck_nomor}`, {
        catatan: form.value.catatanFinance,
      });
      toast.success("Pengajuan berhasil di-Approve.");

      dialogConfirm.show = false;
      dialogPrint.nomor = header.value.pck_nomor || "";
      dialogPrint.show = true;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Gagal menyetujui klaim.");
    } finally {
      isProcessing.value = false;
    }
  };
  dialogConfirm.show = true;
};

const executePrint = (nomor: string) => {
  dialogPrint.show = false;
  const routeData = router.resolve({ name: "KlaimPettyCashPrint", params: { nomor } });
  window.open(routeData.href, "_blank");
  router.push("/piutang/klaim-petty-cash");
};

const openRejectItem = (pc_nomor: string) => {
  dialogRejectItem.pc_nomor = pc_nomor;
  dialogRejectItem.alasan = "";
  dialogRejectItem.show = true;
};

const handleRejectItem = async () => {
  if (!dialogRejectItem.alasan || dialogRejectItem.alasan.trim() === "") {
    return toast.warning("Alasan penolakan nota wajib diisi!");
  }

  dialogRejectItem.isProcessing = true;
  try {
    await api.put(
      `/petty-cash/klaim-finance/reject-item/${header.value.pck_nomor}/${dialogRejectItem.pc_nomor}`,
      {
        alasan: dialogRejectItem.alasan,
      }
    );

    toast.success(`Nota ${dialogRejectItem.pc_nomor} berhasil dikembalikan ke Store.`);
    dialogRejectItem.show = false;

    // Refresh data untuk mendapatkan Total Nominal yang baru dan list nota yang ter-update
    await fetchKlaimData();
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || "Gagal menolak nota.");
  } finally {
    dialogRejectItem.isProcessing = false;
  }
};

onMounted(() => {
  fetchKlaimData();
});
</script>

<template>
  <PageLayout title="Proses Klaim Petty Cash" :menu-id="MENU_ID" icon="mdi-file-document-check">
    <template #header-actions>
      <v-btn size="small" variant="plain" prepend-icon="mdi-arrow-left" @click="router.back()"
        >Kembali</v-btn
      >
    </template>

    <div v-if="loading" class="text-center pa-10">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>

    <div v-else-if="header && header.pck_nomor" class="pa-4 form-container">
      <v-row>
        <v-col cols="12" md="4">
          <v-card class="rounded-lg mb-4" variant="outlined">
            <v-card-text>
              <div class="text-caption text-grey">Nomor Pengajuan</div>
              <div class="text-h6 font-weight-bold text-primary mb-3">{{ header.pck_nomor }}</div>

              <div class="text-caption text-grey">Tanggal Pengajuan</div>
              <div class="font-weight-medium mb-3">
                {{ header.pck_tanggal ? format(parseISO(header.pck_tanggal), "dd MMMM yyyy") : "" }}
              </div>

              <div class="text-caption text-grey">Cabang / Store</div>
              <div class="font-weight-medium mb-3">
                {{ header.pck_cab }} - {{ header.gdg_nama }}
              </div>

              <div class="text-caption text-grey">Total Klaim Diajukan</div>
              <div class="text-h5 font-weight-black text-error mb-3">
                {{ formatRupiah(header.pck_total || 0) }}
              </div>

              <div class="text-caption text-grey">Keterangan Store</div>
              <div class="font-weight-medium mb-3">{{ header.pck_keterangan || "-" }}</div>

              <v-divider class="my-4"></v-divider>

              <div class="d-flex align-center gap-2 mb-4 bg-blue-lighten-5 pa-3 rounded">
                <v-icon color="primary" size="30">mdi-shield-check</v-icon>
                <div>
                  <div class="text-caption text-grey-darken-1">Diotorisasi Oleh:</div>
                  <div class="font-weight-bold text-primary">{{ header.pck_acc }}</div>
                </div>
              </div>

              <v-textarea
                v-model="form.catatanFinance"
                label="Catatan Finance (Opsional)"
                variant="outlined"
                density="compact"
                rows="3"
              />

              <v-btn
                color="success"
                block
                size="large"
                class="mt-2 text-none font-weight-bold"
                prepend-icon="mdi-check-decagram"
                :loading="isProcessing"
                :disabled="header.pck_status !== 'ACC'"
                @click="handleApprove"
              >
                Approve & Cairkan Dana
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" md="8">
          <v-card class="rounded-lg" variant="outlined">
            <v-card-title class="bg-grey-lighten-4 text-subtitle-1 font-weight-bold py-3"
              >Rincian Dokumen & Bukti Nota</v-card-title
            >
            <v-divider></v-divider>
            <v-card-text class="pa-0 bg-grey-lighten-5">
              <div
                v-for="(item, idx) in details"
                :key="idx"
                class="ma-3 pa-3 bg-white border rounded-lg shadow-sm"
              >
                <div class="d-flex justify-space-between align-start mb-2 border-b pb-2">
                  <div>
                    <v-chip size="small" color="grey-darken-2" class="font-weight-bold mb-1">{{
                      item.pc_nomor
                    }}</v-chip>
                    <div class="text-caption font-weight-bold text-primary">
                      {{ item.pcd_kategori }}
                    </div>
                    <div class="text-body-2">{{ item.pcd_keterangan }}</div>

                    <div
                      v-if="item.pcd_no_transaksi"
                      class="text-caption text-blue-darken-3 mt-1 d-flex align-center bg-blue-lighten-5 pa-1 rounded"
                      style="width: max-content"
                    >
                      <v-icon size="small" class="mr-1">mdi-barcode-scan</v-icon>
                      <b>Resi:</b> &nbsp;{{ item.pcd_no_transaksi }}
                    </div>
                  </div>

                  <div class="text-right">
                    <div class="text-caption text-grey mb-1">
                      Tgl Nota: {{ format(parseISO(item.pcd_tanggal), "dd/MM/yyyy") }} (PCV:
                      {{ item.pcd_pcv }})
                    </div>
                    <div class="text-subtitle-1 font-weight-bold text-error mb-2">
                      {{ formatRupiah(item.pcd_nominal) }}
                    </div>

                    <v-btn
                      v-if="header.pck_status === 'ACC'"
                      size="x-small"
                      color="error"
                      variant="tonal"
                      prepend-icon="mdi-close-circle"
                      @click="openRejectItem(item.pc_nomor)"
                    >
                      Tolak Nota
                    </v-btn>
                  </div>
                </div>

                <div class="mt-3 d-flex flex-wrap gap-2">
                  <template v-if="item.pcd_file">
                    <div
                      v-for="(fName, fIdx) in item.pcd_file.split(',')"
                      :key="fIdx"
                      class="text-center border rounded pa-1 bg-white"
                    >
                      <div
                        v-if="fName.toLowerCase().endsWith('.pdf')"
                        class="pa-4 bg-grey-lighten-4 rounded text-caption d-flex flex-column align-center justify-center"
                        style="width: 140px; height: 180px"
                      >
                        <v-icon color="error" size="40" class="mb-2">mdi-file-pdf-box</v-icon>
                        <a
                          :href="getImageUrl(fName)"
                          target="_blank"
                          class="text-decoration-none font-weight-bold text-primary"
                        >
                          Buka PDF {{ Number(fIdx) + 1 }}
                        </a>
                      </div>
                      <img
                        v-else
                        :src="getImageUrl(fName)"
                        class="nota-img rounded cursor-pointer"
                        :alt="'Bukti Nota ' + (Number(fIdx) + 1)"
                        @click="openImageInNewTab(getImageUrl(fName))"
                        title="Klik untuk perbesar"
                      />
                    </div>
                  </template>
                  <div
                    v-else
                    class="pa-4 bg-grey-lighten-4 rounded text-caption text-grey w-100 text-center"
                  >
                    Tidak ada lampiran foto
                  </div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold py-3 bg-grey-lighten-4"
          >Konfirmasi Approve</v-card-title
        >
        <v-card-text class="pa-5"
          >Yakin ingin menyetujui pengajuan ini dan mencairkan dana sebesar
          <b>{{ formatRupiah(header.pck_total || 0) }}</b
          >?</v-card-text
        >
        <v-card-actions class="pa-3">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="success" variant="flat" @click="dialogConfirm.onConfirm">Ya, Approve</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogPrint.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="bg-success text-white">Approve Berhasil</v-card-title>
        <v-card-text class="pa-5"
          >Klaim telah disetujui.<br /><br />Cetak tanda bukti batch sekarang?</v-card-text
        >
        <v-card-actions class="pa-3">
          <v-btn variant="text" @click="router.push('/piutang/klaim-petty-cash')">Tutup</v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            prepend-icon="mdi-printer"
            variant="flat"
            @click="executePrint(dialogPrint.nomor)"
            >Cetak Bukti</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogRejectItem.show" max-width="450px" persistent>
      <v-card class="rounded-lg">
        <v-card-title class="bg-error text-white font-weight-bold py-3 d-flex align-center">
          <v-icon start>mdi-file-cancel</v-icon> Tolak Nota {{ dialogRejectItem.pc_nomor }}
        </v-card-title>
        <v-card-text class="pa-5">
          <p class="text-body-2 mb-4">
            Nota ini akan dilepaskan dari pengajuan dan dikembalikan ke Store. Sisa pengajuan
            lainnya tetap dapat diproses.
          </p>
          <v-textarea
            v-model="dialogRejectItem.alasan"
            label="Alasan Penolakan / Catatan Revisi (Wajib)"
            variant="outlined"
            rows="3"
            auto-grow
            autofocus
            placeholder="Contoh: Bukti foto kurang jelas / salah nominal..."
            hide-details
          ></v-textarea>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            color="grey-darken-1"
            @click="dialogRejectItem.show = false"
            :disabled="dialogRejectItem.isProcessing"
            >Batal</v-btn
          >
          <v-btn
            color="error"
            variant="flat"
            :loading="dialogRejectItem.isProcessing"
            @click="handleRejectItem"
            >Kembalikan ke Store</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-container {
  max-width: 1200px;
  margin: 0 auto;
}
.nota-img {
  width: 140px;
  height: 180px;
  object-fit: cover;
  border: 1px solid #e0e0e0;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
