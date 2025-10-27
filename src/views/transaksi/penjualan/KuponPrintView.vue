<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api' // axios instance
import type { AxiosError } from 'axios';

interface Kupon {
  invk_kupon: string
  namamember: string
  hp: string
  berlaku: string
  invk_note: string
}

const route = useRoute()
const printData = ref<Kupon[]>([])

const fetchKupon = async () => {
  try {
    const nomor = route.params.nomor as string
    const { data } = await api.get(`/print-kupon/${nomor}`)
    printData.value = data
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      // Error dari server (status code 4xx/5xx)
      console.error('Gagal ambil data kupon:', axiosError.response.data);
    } else if (axiosError.request) {
      // Request dibuat tapi tidak ada respons
      console.error('Request dibuat tapi tidak ada respons:', axiosError.request);
    } else {
      // Error lain
      console.error('Terjadi kesalahan:', axiosError.message);
    }
  }
}

onMounted(fetchKupon)
</script>

<template>
  <div class="print-container">
    <div v-for="kupon in printData" :key="kupon.invk_kupon" class="kupon-page">
      <h3>KUPON UNDIAN</h3>
      <div class="nomor">{{ kupon.invk_kupon }}</div>
      <div>Nama: {{ kupon.namamember }}</div>
      <div>No. HP: {{ kupon.hp }}</div>
      <div>Berlaku s/d: {{ kupon.berlaku }}</div>
      <div class="note">{{ kupon.invk_note }}</div>
    </div>
  </div>
</template>

<style scoped>
.kupon-page {
  border: 1px dashed black;
  padding: 10mm;
  margin-bottom: 10mm;
  text-align: center;
}

.nomor {
  font-size: 16pt;
  font-weight: bold;
  margin: 10px 0;
}

.note {
  font-style: italic;
  margin-top: 10px;
  font-size: 8pt;
}
</style>
