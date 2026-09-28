<script setup lang="ts">
import { computed } from "vue";
import { formatRupiah } from "@/utils/formatRupiah";

interface DP {
  nomor: string;
  jenis: string;
  nominal: number;
  tanggal?: string; // Format: YYYY-MM-DD atau ISO string
}

const props = defineProps<{
  dps: DP[];
}>();

const emit = defineEmits(["close"]);

const formatTanggal = (tanggal?: string) => {
  if (!tanggal) return "-";
  const date = new Date(tanggal);
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const totalNominal = computed(() =>
  props.dps.reduce((sum, dp) => sum + (Number(dp.nominal) || 0), 0)
);

const getJenisColor = (jenis: string) => {
  const j = (jenis || "").toUpperCase();
  if (j.includes("TUNAI") || j.includes("CASH")) return "green-darken-2";
  if (j.includes("TRANSFER")) return "blue-darken-2";
  if (j.includes("VOUCHER")) return "purple-darken-2";
  return "blue-grey-darken-1";
};

const getJenisIcon = (jenis: string) => {
  const j = (jenis || "").toUpperCase();
  if (j.includes("TUNAI") || j.includes("CASH")) return "mdi-cash";
  if (j.includes("TRANSFER")) return "mdi-bank-transfer";
  if (j.includes("VOUCHER")) return "mdi-ticket-percent";
  return "mdi-cash-multiple";
};
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="640px" persistent>
    <v-card rounded="lg" class="dp-modal-card">
      <div class="dp-modal-header">
        <div class="header-icon-circle">
          <v-icon icon="mdi-cash-multiple" size="20" color="white" />
        </div>
        <div class="header-text">
          <div class="header-title">DP Terkait</div>
          <div class="header-subtitle">{{ props.dps.length }} setoran ditemukan</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="$emit('close')" />
      </div>

      <v-card-text class="pa-0">
        <div v-if="props.dps.length === 0" class="empty-dp-state">
          <v-icon size="40">mdi-cash-remove</v-icon>
          <div class="empty-title">Belum ada DP</div>
          <div class="empty-subtitle">Setoran yang ditambahkan akan tampil di sini</div>
        </div>

        <div v-else class="dp-list">
          <div v-for="(dp, idx) in props.dps" :key="dp.nomor + idx" class="dp-row">
            <div class="dp-icon-wrapper" :class="`bg-${getJenisColor(dp.jenis)}`">
              <v-icon :icon="getJenisIcon(dp.jenis)" size="18" color="white" />
            </div>

            <div class="dp-info">
              <div class="dp-nomor">{{ dp.nomor }}</div>
              <div class="dp-meta">
                <v-chip
                  size="x-small"
                  :color="getJenisColor(dp.jenis)"
                  variant="flat"
                  class="font-weight-bold text-white mr-2"
                >
                  {{ dp.jenis }}
                </v-chip>
                <span class="dp-tanggal">{{ formatTanggal(dp.tanggal) }}</span>
              </div>
            </div>

            <div class="dp-nominal">{{ formatRupiah(dp.nominal) }}</div>
          </div>
        </div>
      </v-card-text>

      <v-divider v-if="props.dps.length > 0" />

      <div v-if="props.dps.length > 0" class="dp-total-footer">
        <span class="total-label">Total DP</span>
        <span class="total-value">{{ formatRupiah(totalNominal) }}</span>
      </div>

      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="tonal" color="grey-darken-1" @click="$emit('close')">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dp-modal-card {
  overflow: hidden;
}

.dp-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 16px 20px;
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
}

.header-icon-circle {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.header-text {
  flex-grow: 1;
  min-width: 0;
}

.header-title {
  color: white;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.3;
}

.header-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 500;
  margin-top: 1px;
}

.empty-dp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: rgba(0, 0, 0, 0.4);
  text-align: center;
}

.empty-dp-state .v-icon {
  color: rgba(183, 28, 28, 0.25);
  margin-bottom: 8px;
}

.empty-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.55);
}

.empty-subtitle {
  font-size: 12px;
  margin-top: 2px;
}

.dp-list {
  max-height: 420px;
  overflow-y: auto;
  padding: 8px 12px;
}

.dp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.dp-row:hover {
  background-color: rgba(183, 28, 28, 0.04);
}

.dp-row:not(:last-child) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.dp-icon-wrapper {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dp-info {
  flex-grow: 1;
  min-width: 0;
}

.dp-nomor {
  font-size: 13px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dp-meta {
  display: flex;
  align-items: center;
  margin-top: 3px;
}

.dp-tanggal {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
}

.dp-nominal {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 800;
  color: #b71c1c;
  text-align: right;
}

.dp-total-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(135deg, rgba(183, 28, 28, 0.06) 0%, rgba(142, 0, 0, 0.02) 100%);
}

.total-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(0, 0, 0, 0.6);
}

.total-value {
  font-size: 18px;
  font-weight: 900;
  color: #b71c1c;
}
</style>
