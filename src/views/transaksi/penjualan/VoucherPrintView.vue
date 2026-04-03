<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api"; // axios instance yang sudah ada
import type { AxiosError } from "axios";

interface Voucher {
  invk_kupon: string;
  invk_nominal: number;
  namamember: string;
  berlaku: string;
  pro_syarat: string;
}

const route = useRoute();
const printData = ref<Voucher[]>([]);

const fetchVoucher = async () => {
  try {
    const nomor = route.params.nomor as string;
    const { data } = await api.get(`/print-voucher/${nomor}`);
    printData.value = data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    console.error("Gagal ambil data voucher:", err["response"]?.["data"] || err["message"]);
  }
};

onMounted(fetchVoucher);
</script>

<template>
  <div class="print-container">
    <div v-for="voucher in printData" :key="voucher.invk_kupon" class="voucher-page">
      <h3>VOUCHER BELANJA</h3>
      <div class="nominal">
        Rp {{ new Intl.NumberFormat("id-ID").format(voucher.invk_nominal) }}
      </div>
      <div class="nomor">{{ voucher.invk_kupon }}</div>
      <div>Nama: {{ voucher.namamember }}</div>
      <div>Berlaku s/d: {{ voucher.berlaku }}</div>
      <div class="note">{{ voucher.pro_syarat }}</div>
    </div>
  </div>
</template>

<style scoped>
.voucher-page {
  border: 2px solid black;
  padding: 10mm;
  margin-bottom: 10mm;
  text-align: center;
}

.nominal {
  font-size: 20pt;
  font-weight: bold;
  margin: 5px 0;
  color: green;
}

.nomor {
  font-size: 12pt;
  font-family: "Courier New", monospace;
  margin: 5px 0;
}

.note {
  font-style: italic;
  margin-top: 10px;
  font-size: 8pt;
}
</style>
