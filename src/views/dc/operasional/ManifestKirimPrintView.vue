<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { format } from "date-fns";
import QrcodeVue from "qrcode.vue";
import Logo from "@/assets/logo.png";

interface ManifestKirimHeader {
  nomor?: string;
  Nomor?: string;
  tanggal?: string;
  Tanggal?: string;
  jam?: string;
  Jam?: string;
  gudang?: string;
  Gudang?: string;
  tujuan?: string;
  Tujuan?: string;
  namaGudang?: string;
  NamaGudang?: string;
  jenisKirim?: string;
  JenisKirim?: string;
  driver?: string;
  Driver?: string;
  platNomor?: string;
  PlatNomor?: string;
  ekspedisi?: string;
  Ekspedisi?: string;
  noResi?: string;
  NoResi?: string;
  totalSj?: number;
  TotalSj?: number;
  totalKoli?: number;
  TotalKoli?: number;
  totalQty?: number;
  TotalQty?: number;
  beratKg?: number;
  BeratKg?: number;
  keterangan?: string;
  Keterangan?: string;
  status?: string;
  Status?: string;
  usr?: string;
  Usr?: string;
  userCreate?: string;
  dateCreate?: string;
  DateCreate?: string;
  ttdPengirim?: string;
  ttdDriver?: string;
  [key: string]: unknown;
}

interface ManifestKirimItem {
  idDrec?: string;
  manifestNomor?: string;
  sjNomor: string;
  sjTanggal?: string;
  noPackingList?: string;
  storeKode: string;
  storeNama?: string;
  koli: number;
  qty: number;
  keterangan?: string;
  referensiGabung?: string;
  [key: string]: unknown;
}

const route = useRoute();
const isLoading = ref(true);
const header = ref<ManifestKirimHeader>({});
const items = ref<ManifestKirimItem[]>([]);
const cabangList = ref<{ kode: string; nama: string }[]>([]);

const fetchCabangList = async () => {
  try {
    const response = await api.get<{ kode: string; nama: string }[]>("/surat-jalan/lookup/cabang");
    cabangList.value = response.data;
  } catch (e) {
    console.error("Gagal memuat cabang list", e);
  }
};

const getCabangTitle = (kodeCabang?: string): string => {
  if (!kodeCabang) return "-";
  const match = cabangList.value.find((c) => c.kode.toUpperCase() === kodeCabang.toUpperCase());
  if (match) return `${match.kode} - ${match.nama}`;
  return kodeCabang;
};

const displayManifestNomor = computed(() => {
  return String(header.value.nomor || header.value.Nomor || route.params.nomor || "");
});

const displayGudangAsal = computed(() => {
  const gKode = (header.value.gudang || header.value.Gudang) as string;
  const gNama = (header.value.namaGudang || header.value.NamaGudang) as string;
  if (gKode && gNama) return `${gKode} - ${gNama}`;
  return getCabangTitle(gKode);
});

const displayGudangTujuan = computed(() => {
  const tKode = (header.value.tujuan || header.value.Tujuan) as string;
  const tNama = (header.value.namaTujuan || header.value.NamaTujuan) as string;
  if (tKode && tNama) return `${tKode} - ${tNama}`;
  return getCabangTitle(tKode);
});

const formattedFullDate = computed(() => {
  const tgl = (header.value.tanggal || header.value.Tanggal) as string;
  if (!tgl) return "";
  try {
    return format(new Date(tgl), "dd MMMM yyyy");
  } catch {
    return tgl;
  }
});

const formattedDateCreate = computed(() => {
  const d = (header.value.dateCreate || header.value.DateCreate) as string;
  if (!d) return "-";
  try {
    return format(new Date(d), "dd/MM/yyyy HH:mm") + " WIB";
  } catch {
    return d;
  }
});

const totalKoliFisik = computed(() => {
  return items.value.reduce((acc, cur) => acc + (Number(cur.koli) || 0), 0);
});

const totalQtyPcs = computed(() => {
  return items.value.reduce((acc, cur) => acc + (Number(cur.qty) || 0), 0);
});

const totalPlCount = computed(() => {
  const plSet = new Set<string>();
  items.value.forEach((item) => {
    const pl = String(item.noPackingList || "");
    if (pl.trim()) {
      pl.split(",").forEach((p: string) => {
        const trimmed = p.trim();
        if (trimmed) plSet.add(trimmed);
      });
    } else {
      plSet.add(item.sjNomor);
    }
  });
  return plSet.size;
});

const getAttachedSjs = (sjNomor: string) => {
  return items.value.filter((i) => i.referensiGabung === sjNomor).map((i) => i.sjNomor);
};

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    await fetchCabangList();
    const response = await api.get<{ header: ManifestKirimHeader; items: ManifestKirimItem[] }>(
      `/manifest-kirim/${encodeURIComponent(nomor)}`
    );
    header.value = response.data.header || {};
    items.value = response.data.items || [];
    document.title = `${nomor}`;
  } catch (error) {
    alert("Gagal memuat data Manifest untuk dicetak.");
    console.error("Error fetching print data:", error);
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (newValue) => {
  if (newValue === false) {
    nextTick(() => {
      window.print();
    });
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) {
    fetchPrintData(nomor);
  }
});
</script>

<template>
  <div class="print-page font-sans bg-white text-grey-darken-4 pa-6">
    <div v-if="isLoading" class="text-center py-10 text-caption font-weight-bold">
      Memuat data cetak Manifest...
    </div>

    <div v-else class="print-area font-sans">
      <!-- Header section: Logo & Document Title -->
      <div class="d-flex justify-space-between align-center border-b pb-3 mb-4">
        <div class="d-flex align-center gap-3">
          <img :src="Logo" alt="Kaosan Logo" style="height: 48px; object-fit: contain" />
          <div class="company-info text-caption" style="line-height: 1.25">
            <div class="font-weight-bold text-subtitle-2 text-uppercase text-grey-darken-4">
              KAOSAN.OFFICIAL
            </div>
            <div class="text-grey-darken-2" style="font-size: 11px">
              Padokan RT 04 / 04 Sawahan Ngemplak
            </div>
            <div class="text-grey-darken-2" style="font-size: 11px">0271-740634</div>
          </div>
        </div>
        <div class="text-end">
          <h2
            class="text-h5 font-weight-black text-uppercase text-grey-darken-4 mb-1"
            style="letter-spacing: 1px"
          >
            MANIFEST PENGIRIMAN
          </h2>
          <div class="font-weight-bold text-subtitle-1 text-primary mb-1">
            {{ displayManifestNomor }}
          </div>
        </div>
      </div>

      <!-- Grid 1: Informations & Total Koli Box -->
      <div class="d-flex gap-4 mb-4">
        <!-- Left Box: INFORMASI PENGIRIMAN -->
        <div class="border rounded-lg pa-3 flex-grow-1" style="flex: 2">
          <div
            class="text-caption font-weight-bold text-uppercase border-b pb-1 mb-2 text-grey-darken-3 d-flex justify-space-between align-center"
          >
            <span>INFORMASI PENGIRIMAN</span>
            <span class="text-grey-darken-1 font-weight-regular" style="font-size: 11px"
              >Status: <strong>{{ header.status || header.Status || "POSTED" }}</strong></span
            >
          </div>
          <table class="info-table text-caption w-100" style="border-collapse: collapse">
            <tbody>
              <tr>
                <td class="text-grey-darken-1 py-1" style="width: 170px">
                  Tanggal & Jam Pengiriman
                </td>
                <td class="font-weight-bold py-1">
                  : {{ formattedFullDate }}
                  {{ header.jam || header.Jam ? (header.jam || header.Jam) + " WIB" : "" }}
                </td>
              </tr>
              <tr>
                <td class="text-grey-darken-1 py-1">Asal Pengiriman (DC)</td>
                <td class="font-weight-bold py-1">: {{ displayGudangAsal }}</td>
              </tr>
              <tr>
                <td class="text-grey-darken-1 py-1">Tujuan Pengiriman</td>
                <td class="font-weight-bold py-1">: {{ displayGudangTujuan }}</td>
              </tr>
              <tr>
                <td class="text-grey-darken-1 py-1">Metode Pengiriman</td>
                <td class="font-weight-bold py-1">
                  :
                  {{
                    (header.jenisKirim || header.JenisKirim) === "EKSPEDISI"
                      ? "Ekspedisi"
                      : (header.jenisKirim || header.JenisKirim) === "KURIR"
                      ? "Kurir"
                      : "Armada Sendiri"
                  }}
                </td>
              </tr>
              <tr v-if="(header.jenisKirim || header.JenisKirim) === 'EKSPEDISI'">
                <td class="text-grey-darken-1 py-1">Ekspedisi</td>
                <td class="font-weight-bold py-1">
                  : {{ header.ekspedisi || header.Ekspedisi || "-" }}
                </td>
              </tr>
              <tr v-if="(header.jenisKirim || header.JenisKirim) === 'EKSPEDISI'">
                <td class="text-grey-darken-1 py-1">No. Resi</td>
                <td class="font-weight-bold py-1">: {{ header.noResi || header.NoResi || "-" }}</td>
              </tr>
              <tr>
                <td class="text-grey-darken-1 py-1">Kendaraan (Plat No.)</td>
                <td class="font-weight-bold py-1">
                  : {{ header.platNomor || header.PlatNomor || "-" }}
                </td>
              </tr>
              <tr>
                <td class="text-grey-darken-1 py-1">Driver / PIC Pengirim</td>
                <td class="font-weight-bold py-1">: {{ header.driver || header.Driver || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Right Box: TOTAL KOLI FISIK & PENJELASAN -->
        <div
          class="border rounded-lg text-center d-flex flex-column justify-space-between"
          style="flex: 1; min-width: 230px; background: #fafafa"
        >
          <div class="pa-3">
            <div class="text-caption font-weight-bold text-uppercase text-grey-darken-2 mb-1">
              TOTAL KOLI FISIK
            </div>
            <div
              class="text-h2 font-weight-black my-1 text-grey-darken-4"
              style="font-size: 3.5rem !important; line-height: 1"
            >
              {{ totalKoliFisik }}
            </div>
            <div class="text-caption font-weight-bold text-grey-darken-2">KOLI FISIK</div>
          </div>
          <div class="border-t d-flex bg-white rounded-b-lg">
            <div class="flex-grow-1 border-e py-2 px-1">
              <div class="text-grey" style="font-size: 10px">Total SJ</div>
              <div class="font-weight-bold text-subtitle-2">{{ items.length }}</div>
            </div>
            <div class="flex-grow-1 border-e py-2 px-1">
              <div class="text-grey" style="font-size: 10px">Total PL</div>
              <div class="font-weight-bold text-subtitle-2">{{ totalPlCount }}</div>
            </div>
            <div class="flex-grow-1 py-2 px-1">
              <div class="text-grey" style="font-size: 10px">Total Qty</div>
              <div class="font-weight-bold text-subtitle-2">
                {{ totalQtyPcs }} <span style="font-size: 10px">Pcs</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Table: DAFTAR SJ / PL DALAM MANIFEST -->
      <div class="mb-4">
        <div class="text-caption font-weight-bold text-uppercase mb-2 text-grey-darken-3">
          DAFTAR SJ / PL DALAM MANIFEST
        </div>
        <table class="print-table w-100 border text-caption" style="border-collapse: collapse">
          <thead>
            <tr class="bg-grey-lighten-4 text-center font-weight-bold border-b">
              <th style="width: 35px" class="py-2 border-e">No.</th>
              <th style="width: 140px" class="py-2 border-e">No. Surat Jalan</th>
              <th style="width: 140px" class="py-2 border-e">No. Packing List</th>
              <th style="width: 85px" class="py-2 border-e text-end">Qty (Pcs)</th>
              <th style="width: 90px" class="py-2 border-e text-center">Koli</th>
              <th style="width: 90px" class="py-2 border-e text-center">Status Koli</th>
              <th class="py-2 border-e text-center">Digabung dengan Koli SJ/PL</th>
              <th style="width: 140px" class="py-2">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in items" :key="item.sjNomor" class="border-b">
              <td class="text-center py-2 border-e">{{ idx + 1 }}</td>
              <td class="font-weight-bold py-2 border-e px-2">{{ item.sjNomor }}</td>
              <td class="py-2 border-e px-2">{{ item.noPackingList || "-" }}</td>
              <td class="text-end font-weight-bold py-2 border-e px-2">{{ item.qty }}</td>
              <td class="text-center font-weight-bold py-2 border-e">{{ item.koli }}</td>
              <td class="text-center font-weight-bold py-2 border-e">
                {{ item.koli > 0 ? "MANDIRI" : "DIGABUNG" }}
              </td>
              <td class="text-center py-2 border-e px-2">
                {{
                  item.referensiGabung
                    ? item.referensiGabung
                    : getAttachedSjs(item.sjNomor).length > 0
                    ? "Menampung " + getAttachedSjs(item.sjNomor).length + " SJ"
                    : "-"
                }}
              </td>
              <td class="py-2 px-2">
                {{
                  item.keterangan ||
                  (item.referensiGabung ? "Digabung ke koli " + item.referensiGabung : "-")
                }}
              </td>
            </tr>
            <tr class="font-weight-bold bg-grey-lighten-4 border-t">
              <td colspan="3" class="text-end py-2 px-2 border-e">TOTAL</td>
              <td class="text-end py-2 px-2 border-e">{{ totalQtyPcs }}</td>
              <td class="text-center py-2 border-e">{{ totalKoliFisik }}</td>
              <td colspan="3" class="py-2 border-e"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer: BUKTI SERAH TERIMA -->
      <div>
        <div class="text-caption font-weight-bold text-uppercase mb-2 text-grey-darken-3">
          BUKTI SERAH TERIMA
        </div>
        <div class="d-flex gap-3">
          <!-- Box 1: Diserahkan Oleh -->
          <div class="border rounded-lg pa-3 flex-grow-1" style="flex: 1; min-height: 180px">
            <div class="font-weight-bold text-caption text-grey-darken-3 border-b pb-1 mb-2">
              Diserahkan Oleh
            </div>
            <div class="text-caption mb-1">
              Nama :
              <span class="font-weight-medium">{{
                String(header.userCreate || header.Usr || "-")
              }}</span>
            </div>
            <div class="text-caption mb-1">
              Waktu Pembuatan :
              <span class="font-weight-medium">{{ formattedDateCreate }}</span>
            </div>
            <div class="text-caption mt-3 mb-1">Tanda Tangan :</div>
            <div
              class="text-center my-2 d-flex align-center justify-center"
              style="min-height: 55px"
            >
              <img
                v-if="header.ttdPengirim"
                :src="String(header.ttdPengirim)"
                style="max-height: 50px; border-bottom: 1px solid #000"
              />
              <div v-else style="border-bottom: 1px solid #000; margin-top: 35px; width: 80%"></div>
            </div>
          </div>

          <!-- Box 2: Diterima Oleh -->
          <div class="border rounded-lg pa-3 flex-grow-1" style="flex: 1; min-height: 180px">
            <div class="font-weight-bold text-caption text-grey-darken-3 border-b pb-1 mb-2">
              Diterima Oleh
            </div>
            <div class="text-caption mb-1">
              Driver:
              <span class="font-weight-medium">{{
                String(header.driver || header.Driver || "-")
              }}</span>
            </div>
            <div class="text-caption mb-1">
              Ekspedisi / Armada :
              <span class="font-weight-medium">{{
                String(header.ekspedisi || header.Ekspedisi || "-")
              }}</span>
            </div>
            <div class="text-caption mb-1">
              Kendaraan (Plat No.) :
              <span class="font-weight-medium">{{
                String(header.platNomor || header.PlatNomor || "-")
              }}</span>
            </div>
            <div class="text-caption mb-1">
              Waktu Serah Terima :
              <span class="font-weight-medium">{{
                header.jam || header.Jam ? (header.jam || header.Jam) + " WIB" : "-"
              }}</span>
            </div>
            <div class="text-caption mt-2 mb-1">Tanda Tangan :</div>
            <div
              class="text-center my-2 d-flex align-center justify-center"
              style="min-height: 55px"
            >
              <img
                v-if="header.ttdDriver"
                :src="String(header.ttdDriver)"
                style="max-height: 50px; border-bottom: 1px solid #000"
              />
              <div v-else style="border-bottom: 1px solid #000; margin-top: 35px; width: 80%"></div>
            </div>
          </div>

          <!-- Box 3: QR CODE MANIFEST -->
          <div
            class="border rounded-lg pa-3 text-center d-flex flex-column align-center justify-center bg-white"
            style="width: 200px"
          >
            <div class="font-weight-bold text-caption text-grey-darken-3 mb-2">
              QR CODE MANIFEST
            </div>
            <QrcodeVue :value="displayManifestNomor" :size="95" level="M" render-as="svg" />
            <div class="font-weight-bold text-caption text-primary mt-2">
              {{ displayManifestNomor }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  body {
    margin: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .print-page {
    padding: 0 !important;
  }
  .print-area {
    padding: 5mm !important;
  }
}
</style>
