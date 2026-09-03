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
  userModified?: string;
  dateModified?: string;
  DateModified?: string;
  ttdPengirim?: string;
  ttdDriver?: string;
  [key: string]: unknown;
}

interface ManifestKirimItem {
  idDrec?: string;
  manifestNomor?: string;
  sjNomor?: string;
  namaBarang?: string;
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

const formattedDateConfirm = computed(() => {
  const d = (header.value.dateModified || header.value.DateModified || header.value.dateCreate || header.value.DateCreate) as string;
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

// Status aktual dari header
const displayStatus = computed(() => {
  return String(header.value.status || header.value.Status || "").toUpperCase();
});

// True jika status sudah dikonfirmasi (DIKIRIM/SELESAI) namun TTD digital tidak ada
// → berarti TTD dilakukan secara basah di kertas cetak
const isWetSignaturePengirim = computed(() => {
  const hasTtd = !!header.value.ttdPengirim;
  const confirmed = ["DIKIRIM", "SELESAI"].includes(displayStatus.value);
  return !hasTtd && confirmed;
});

const isWetSignatureDriver = computed(() => {
  const hasTtd = !!header.value.ttdDriver;
  const confirmed = ["DIKIRIM", "SELESAI"].includes(displayStatus.value);
  return !hasTtd && confirmed;
});

const sjItems = computed(() =>
  items.value.filter((i) => i.sjNomor && String(i.sjNomor).trim() !== "")
);

const sortedItems = computed(() => {
  return [...items.value].sort((a, b) => {
    const aCustom = !a.sjNomor || String(a.sjNomor).trim() === "";
    const bCustom = !b.sjNomor || String(b.sjNomor).trim() === "";
    if (!aCustom && bCustom) return -1;
    if (aCustom && !bCustom) return 1;
    return 0;
  });
});

const isFirstCustomItem = (item: ManifestKirimItem, idx: number): boolean => {
  const isCustom = !item.sjNomor || String(item.sjNomor).trim() === "";
  if (!isCustom) return false;
  const firstIdx = sortedItems.value.findIndex(
    (i) => !i.sjNomor || String(i.sjNomor).trim() === ""
  );
  return idx === firstIdx;
};

const totalPlCount = computed(() => {
  const plSet = new Set<string>();
  sjItems.value.forEach((item) => {
    const pl = String(item.noPackingList || "");
    if (pl.trim()) {
      pl.split(",").forEach((p: string) => {
        const trimmed = p.trim();
        if (trimmed) plSet.add(trimmed);
      });
    } else if (item.sjNomor) {
      plSet.add(item.sjNomor);
    }
  });
  return plSet.size;
});

const getAttachedList = (key?: string): string[] => {
  if (!key) return [];
  return items.value
    .filter((i) => i.referensiGabung === key)
    .map((i) => (i.sjNomor || i.namaBarang || "Item") as string);
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
              <div class="font-weight-bold text-subtitle-2">{{ sjItems.length }}</div>
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

      <!-- Table: DAFTAR SURAT JALAN & MUATAN MANIFEST -->
      <div class="mb-4">
        <div class="text-caption font-weight-bold text-uppercase mb-2 text-grey-darken-3">
          DAFTAR SURAT JALAN & MUATAN MANIFEST
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
            <template v-for="(item, idx) in sortedItems" :key="idx">
              <!-- Pembatas Baris jika memasuki kelompok Barang Lain-lain -->
              <tr
                v-if="isFirstCustomItem(item, idx) && sjItems.length > 0"
                class="bg-grey-lighten-3 font-weight-bold border-b"
              >
                <td
                  colspan="8"
                  class="py-1 px-2 text-uppercase text-grey-darken-4"
                  style="font-size: 10px; letter-spacing: 0.5px"
                >
                  BARANG LAIN-LAIN (NON-SJ / CUSTOM)
                </td>
              </tr>

              <tr class="border-b">
                <td class="text-center py-2 border-e">{{ idx + 1 }}</td>

                <!-- Jika Item Surat Jalan: 2 kolom (No Surat Jalan & No Packing List) -->
                <template v-if="item.sjNomor && String(item.sjNomor).trim() !== ''">
                  <td class="font-weight-bold py-2 border-e px-2">{{ item.sjNomor }}</td>
                  <td class="py-2 border-e px-2">{{ item.noPackingList || "-" }}</td>
                </template>

                <!-- Jika Barang Lain-lain: Kolom No. SJ & No. PL dijadikan SATU untuk Nama Barang (Colspan 2) -->
                <template v-else>
                  <td colspan="2" class="font-weight-bold py-2 border-e px-2 text-grey-darken-4">
                    {{ item.namaBarang || "Barang Lain-lain" }}
                  </td>
                </template>

                <!-- Qty -->
                <td class="text-end font-weight-bold py-2 border-e px-2">{{ item.qty }}</td>

                <!-- Koli -->
                <td class="text-center font-weight-bold py-2 border-e">{{ item.koli }}</td>

                <!-- Status Koli -->
                <td class="text-center font-weight-bold py-2 border-e">
                  {{ Number(item.koli) > 0 ? "MANDIRI" : "DIGABUNG" }}
                </td>

                <!-- Digabung dengan Koli -->
                <td class="text-center py-2 border-e px-2">
                  {{
                    item.referensiGabung
                      ? item.referensiGabung
                      : getAttachedList(item.sjNomor || item.namaBarang).length > 0
                      ? "Menampung " + getAttachedList(item.sjNomor || item.namaBarang).length + " Item"
                      : "-"
                  }}
                </td>

                <!-- Keterangan -->
                <td class="py-2 px-2">
                  {{
                    item.keterangan ||
                    (item.referensiGabung ? "Digabung ke koli " + item.referensiGabung : "-")
                  }}
                </td>
              </tr>
            </template>

            <!-- Total Footer -->
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
        <div class="d-flex gap-3" style="align-items: stretch">
          <!-- Box 1: Diserahkan Oleh -->
          <div
            class="border rounded-lg pa-3 flex-grow-1 d-flex flex-column"
            style="flex: 1; min-height: 180px"
          >
            <div class="font-weight-bold text-caption text-grey-darken-3 border-b pb-1 mb-2">
              Diserahkan Oleh
            </div>
            <!-- Info section -->
            <div>
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
            </div>
            <!-- TTD section: selalu di bawah -->
            <div class="mt-auto">
              <div class="text-caption mt-3 mb-1">Tanda Tangan :</div>
              <div
                class="text-center my-2 d-flex align-center justify-center"
                style="min-height: 55px"
              >
                <!-- TTD Digital -->
                <img
                  v-if="header.ttdPengirim"
                  :src="String(header.ttdPengirim)"
                  style="max-height: 50px; border-bottom: 1px solid #000"
                />
                <!-- TTD Basah (status DIKIRIM/SELESAI tanpa TTD digital) -->
                <div
                  v-else-if="isWetSignaturePengirim"
                  class="wet-signature-badge"
                >
                  <span class="font-weight-bold">Sudah konfirmasi tanda tangan</span>
                  <span class="confirm-time">pada {{ formattedDateConfirm }}</span>
                </div>
                <!-- Belum ditandatangani -->
                <div v-else style="border-bottom: 1px solid #000; margin-top: 35px; width: 80%"></div>
              </div>
            </div>
          </div>

          <!-- Box 2: Diterima Oleh -->
          <div
            class="border rounded-lg pa-3 flex-grow-1 d-flex flex-column"
            style="flex: 1; min-height: 180px"
          >
            <div class="font-weight-bold text-caption text-grey-darken-3 border-b pb-1 mb-2">
              Diterima Oleh
            </div>
            <!-- Info section -->
            <div>
              <div class="text-caption mb-1">
                Driver:
                <span class="font-weight-medium">{{
                  String(header.driver || header.Driver || "-")
                }}</span>
              </div>
              <div class="text-caption mb-1">
                Ekspedisi/Armada :
                {{
                  (header.jenisKirim || header.JenisKirim) === "EKSPEDISI"
                    ? "Ekspedisi"
                    : (header.jenisKirim || header.JenisKirim) === "AMBIL_SENDIRI"
                    ? "Ambil Sendiri"
                    : "Armada Sendiri"
                }}
              </div>
              <div class="text-caption mb-1">
                Plat Nomer :
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
            </div>
            <!-- TTD section: selalu di bawah -->
            <div class="mt-auto">
              <div class="text-caption mt-3 mb-1">Tanda Tangan :</div>
              <div
                class="text-center my-2 d-flex align-center justify-center"
                style="min-height: 55px"
              >
                <!-- TTD Digital -->
                <img
                  v-if="header.ttdDriver"
                  :src="String(header.ttdDriver)"
                  style="max-height: 50px; border-bottom: 1px solid #000"
                />
                <!-- TTD Basah (status DIKIRIM/SELESAI tanpa TTD digital) -->
                <div
                  v-else-if="isWetSignatureDriver"
                  class="wet-signature-badge"
                >
                  <span class="font-weight-bold">Sudah konfirmasi tanda tangan</span>
                  <span class="confirm-time">pada {{ formattedDateConfirm }}</span>
                </div>
                <!-- Belum ditandatangani -->
                <div v-else style="border-bottom: 1px solid #000; margin-top: 35px; width: 80%"></div>
              </div>
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

.wet-signature-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px dashed #1565c0;
  border-radius: 4px;
  padding: 4px 10px;
  background: #f0f7ff;
  color: #1565c0;
  font-size: 9.5px;
  line-height: 1.25;
  letter-spacing: 0.2px;
}

.wet-signature-badge .confirm-time {
  font-size: 8.5px;
  color: #374151;
  font-weight: 500;
}
</style>
