<script setup lang="ts">
import QrcodeVue from "qrcode.vue";
import { format, parseISO } from "date-fns";

interface LokasiItem {
  lo_idrec: string;
  lo_cab: string;
  lo_lokasi: string;
  lo_jenis_nama: string | null;
  cab_nama?: string; // TAMBAHKAN '?' agar menjadi opsional (matching dengan parent)
  user_create: string; // Tambahkan ini agar struktur objek identik
  date_create: string;
}

defineProps<{
  items: LokasiItem[];
}>();

const emit = defineEmits(["close"]);

// Helper untuk format tanggal pendek agar muat di label
const formatDateShort = (dateStr: string) => {
  try {
    return dateStr ? format(parseISO(dateStr), "dd/MM/yy") : "-";
  } catch {
    return "-";
  }
};

const triggerPrint = () => {
  const printContent = document.getElementById("label-print-area");
  if (!printContent) return;

  const printWindow = window.open("", "_blank", "width=1280,height=720");
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>Cetak Label Lokasi</title>
        <style>
          @page { size: 50mm 40mm; margin: 0; }
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
          .label-page {
            width: 50mm; height: 40mm; padding: 1.5mm;
            box-sizing: border-box; display: flex;
            flex-direction: column; justify-content: space-between;
            align-items: center; page-break-after: always; text-align: center;
          }
          .branch-info { font-size: 7pt; font-weight: bold; border-bottom: 0.2mm solid black; width: 100%; padding-bottom: 0.5mm; }
          .qr-wrapper { margin: 0.5mm 0; }
          .loc-code { font-size: 13pt; font-weight: 900; line-height: 1; }

          /* Layout Samping-sampingan untuk Jenis & Tanggal */
          .footer-row {
            display: flex;
            justify-content: space-between;
            width: 100%;
            font-size: 6pt;
            text-transform: uppercase;
            border-top: 0.1mm solid #eee;
            padding-top: 0.5mm;
          }
          .loc-detail { font-weight: bold; text-align: left; flex: 1; white-space: nowrap; overflow: hidden; }
          .loc-date { text-align: right; color: #333; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        ${printContent.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  emit("close");
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="450px" @update:model-value="$emit('close')">
    <v-card>
      <v-toolbar color="blue-grey-darken-3" density="compact">
        <v-toolbar-title class="text-subtitle-1">Pratinjau Label ({{ items.length }})</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" />
      </v-toolbar>

      <v-card-text class="pa-4 bg-grey-lighten-3">
        <div id="label-print-area" class="preview-scroll">
          <div v-for="(loc, index) in items" :key="index" class="label-page">
            <div class="branch-info">{{ loc.lo_cab }} - {{ loc.cab_nama }}</div>

            <div class="qr-wrapper">
              <qrcode-vue :value="loc.lo_lokasi" :size="80" level="H" render-as="svg" />
            </div>

            <div class="location-info" style="width: 100%">
              <div class="loc-code">{{ loc.lo_lokasi }}</div>
              <div class="footer-row">
                <span class="loc-detail">{{ loc.lo_jenis_nama || "NON-KATEGORI" }}</span>
                <span class="loc-date">{{ formatDateShort(loc.date_create) }}</span>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" size="small" @click="$emit('close')">Batal</v-btn>
        <v-btn color="primary" size="small" prepend-icon="mdi-printer" @click="triggerPrint">
          Cetak ke XP-360B
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.preview-scroll {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.label-page {
  background: white;
  width: 50mm;
  height: 40mm;
  padding: 2mm;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
}

.branch-info {
  font-size: 9px;
  font-weight: bold;
  border-bottom: 1px solid #000;
  width: 100%;
  text-align: center;
  padding-bottom: 2px;
}

.loc-code {
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 2px;
}

.footer-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 8px;
  border-top: 1px solid #eee;
  padding-top: 2px;
}

.loc-detail {
  text-transform: uppercase;
  font-weight: bold;
}

.loc-date {
  font-style: italic;
}
</style>
