<script setup lang="ts">
import { computed } from "vue";
import { formatRupiah } from "@/utils/formatRupiah";

export interface ItemDiscount {
  nama: string;
  persen: number;
}

const props = defineProps<{
  modelValue: boolean;
  customerLevel?: string;
  diskonPersenMember?: number;
  diskonNominalMember?: number;
  promoNama?: string;
  promoNominal?: number;
  itemDiscounts?: ItemDiscount[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "use-member"): void;
  (e: "use-promo"): void;
  (e: "ignore"): void;
}>();

// [BARU] Deteksi promo yang murni diskon per-item (mis. Grand Opening K12),
// tanpa diskon faktur sama sekali (pro_disrp/pro_dispersen = 0)
const isPurelyItemDiscount = computed(() => {
  return (props.promoNominal || 0) === 0 && (props.itemDiscounts?.length || 0) > 0;
});

const closeDialog = () => emit("update:modelValue", false);
const handleIgnore = () => {
  emit("ignore");
  closeDialog();
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="860px"
    persistent
  >
    <v-card class="rounded-lg dialog-card">
      <!-- Header -->
      <v-card-title
        class="bg-primary text-white text-h6 pa-4 d-flex justify-space-between align-center flex-shrink-0"
      >
        <div>
          <v-icon start color="white">mdi-ticket-percent</v-icon>
          Pilih Jenis Diskon
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="closeDialog" />
      </v-card-title>

      <!-- Body -->
      <v-card-text class="pa-4 pb-2">
        <v-row dense align="stretch">
          <!-- Kolom Kiri: Diskon Member -->
          <v-col cols="6" class="d-flex flex-column">
            <div class="choice-card choice-card--member d-flex flex-column h-100">
              <div class="choice-title mb-3">
                <v-icon color="primary" size="20" class="mr-1">mdi-account-star</v-icon>
                <span class="text-primary font-weight-bold">Diskon Member</span>
              </div>
              <div v-if="(diskonPersenMember || 0) > 0" class="info-block info-block--blue mb-3">
                <div class="info-label">Diskon Level {{ customerLevel || "Standar" }}</div>
                <div class="info-sublabel">{{ diskonPersenMember }}% dari total belanja</div>
                <div class="info-nominal">− {{ formatRupiah(diskonNominalMember || 0) }}</div>
              </div>
              <div v-else class="info-block info-block--grey mb-3">
                <div class="info-sublabel">Tidak ada diskon member aktif</div>
              </div>
              <div v-if="itemDiscounts && itemDiscounts.length > 0" class="item-disc-section mb-3">
                <div class="item-disc-header">
                  <v-icon size="15" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                  Tetap dapat diskon item otomatis:
                </div>
                <div class="item-disc-list">
                  <div v-for="(disc, idx) in itemDiscounts" :key="idx" class="item-disc-row">
                    <span class="item-disc-nama" :title="disc.nama">{{ disc.nama }}</span>
                    <span class="item-disc-persen">−{{ disc.persen }}%</span>
                  </div>
                </div>
              </div>
              <div class="mt-auto">
                <v-btn
                  block
                  color="primary"
                  variant="flat"
                  class="choice-btn"
                  @click="emit('use-member')"
                >
                  <v-icon start size="16">mdi-check-circle-outline</v-icon>
                  Gunakan Diskon Member
                </v-btn>
              </div>
            </div>
          </v-col>

          <!-- Kolom Kanan: Promo Bulanan -->
          <v-col cols="6" class="d-flex flex-column">
            <div class="choice-card choice-card--promo d-flex flex-column h-100">
              <div class="choice-title mb-3">
                <v-icon color="orange-darken-2" size="20" class="mr-1">mdi-percent-circle</v-icon>
                <span class="text-orange-darken-2 font-weight-bold">Promo Bulanan</span>
              </div>

              <!-- [UBAH] Blok nominal promo — kondisional -->
              <div v-if="!isPurelyItemDiscount" class="info-block info-block--orange mb-3">
                <div class="info-label">{{ promoNama }}</div>
                <div class="info-sublabel">Potongan faktur langsung:</div>
                <div class="info-nominal info-nominal--orange">
                  − {{ formatRupiah(promoNominal || 0) }}
                </div>
              </div>

              <!-- [BARU] Kalau murni diskon per-item, tampilkan judul promo + daftar diskon langsung -->
              <div v-else class="info-block info-block--orange mb-3">
                <div class="info-label">{{ promoNama }}</div>
                <div class="info-sublabel">Diskon otomatis berlaku per item:</div>
              </div>

              <!-- Info item discount -->
              <div v-if="itemDiscounts && itemDiscounts.length > 0" class="item-disc-section mb-3">
                <div class="item-disc-header">
                  <v-icon size="15" color="orange-darken-2" class="mr-1"
                    >mdi-tag-multiple-outline</v-icon
                  >
                  {{ isPurelyItemDiscount ? "Rincian diskon item:" : "Diskon item otomatis:" }}
                </div>

                <!-- [UBAH] Kalau murni item discount, tampilkan list rinci; kalau tidak, tampilkan ringkasan -->
                <div v-if="isPurelyItemDiscount" class="item-disc-list">
                  <div v-for="(disc, idx) in itemDiscounts" :key="idx" class="item-disc-row">
                    <span class="item-disc-nama" :title="disc.nama">{{ disc.nama }}</span>
                    <span class="item-disc-persen item-disc-persen--orange"
                      >−{{ disc.persen }}%</span
                    >
                  </div>
                </div>
                <div v-else class="item-disc-summary">
                  {{ itemDiscounts.length }} jenis barang dapat diskon khusus
                </div>
              </div>

              <p class="text-caption text-medium-emphasis mt-1 mb-3">
                Diskon Member (Reseller) akan dinonaktifkan secara otomatis.
              </p>
              <div class="mt-auto">
                <v-btn
                  block
                  color="orange-darken-2"
                  variant="flat"
                  class="choice-btn"
                  @click="emit('use-promo')"
                >
                  <v-icon start size="16">mdi-tag-check-outline</v-icon>
                  Gunakan Promo Bulanan
                </v-btn>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <!-- Footer -->
      <v-divider />
      <v-card-actions class="pa-3 px-5 bg-grey-lighten-4">
        <div class="text-caption text-grey-darken-1 d-flex align-center">
          <v-icon size="14" class="mr-1">mdi-alert-circle-outline</v-icon>
          <i>Klik "Abaikan" untuk melanjutkan tanpa menerapkan diskon atau promo.</i>
        </div>
        <v-spacer />
        <v-btn
          variant="outlined"
          color="grey-darken-2"
          class="text-none font-weight-bold bg-white"
          @click="handleIgnore"
        >
          Abaikan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Dialog card tidak boleh overflow hidden agar konten tidak terpotong */
.dialog-card {
  overflow: visible !important;
}
.choice-card {
  border: 1.5px solid;
  border-radius: 10px;
  padding: 16px;
  height: 100%;
  box-sizing: border-box;
}
.choice-card--member {
  border-color: #1976d2;
  background-color: #f8fbff;
}
.choice-card--promo {
  border-color: #e65100;
  background-color: #fff8f0;
}
.choice-title {
  display: flex;
  align-items: center;
  font-size: 0.95rem;
}
.info-block {
  border-radius: 8px;
  padding: 10px 12px;
}
.info-block--blue {
  background-color: #e3f0fd;
  border-left: 3px solid #1976d2;
}
.info-block--orange {
  background-color: #fff3e0;
  border-left: 3px solid #e65100;
}
.info-block--grey {
  background-color: #f5f5f5;
}
.info-label {
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.4;
  color: #333;
  word-break: break-word;
  white-space: normal;
}
.info-sublabel {
  font-size: 0.75rem;
  color: #666;
  margin-top: 2px;
}
.info-nominal {
  font-size: 1.45rem;
  font-weight: 900;
  letter-spacing: -0.5px;
  margin-top: 6px;
  color: #1b5e20;
  line-height: 1;
}
.info-nominal--orange {
  color: #bf360c;
}
.item-disc-section {
  flex-shrink: 0;
}
.item-disc-header {
  font-size: 0.75rem;
  color: #555;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}
.item-disc-list {
  max-height: 112px;
  overflow-y: auto;
  padding-right: 2px;
}
.item-disc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  gap: 8px;
}
.item-disc-nama {
  font-size: 0.76rem;
  font-weight: 500;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-disc-persen {
  font-size: 0.76rem;
  font-weight: 700;
  color: #c62828;
  flex-shrink: 0;
}
/* [BARU] Warna beda untuk kolom promo (oranye) agar konsisten dengan tema kartu */
.item-disc-persen--orange {
  color: #bf360c;
}
.item-disc-summary {
  font-size: 0.8rem;
  font-weight: 700;
  color: #e65100;
}
.choice-btn {
  font-size: 0.82rem !important;
  font-weight: 700 !important;
  letter-spacing: 0.2px !important;
  height: 40px !important;
  text-transform: none !important;
}
.item-disc-list::-webkit-scrollbar {
  width: 4px;
}
.item-disc-list::-webkit-scrollbar-track {
  background: transparent;
}
.item-disc-list::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
.item-disc-list::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.4);
}
</style>
