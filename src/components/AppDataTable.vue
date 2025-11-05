<script setup lang="ts">
import { computed } from 'vue';
import LottieVuePlayer from 'vue-lottie-player'; // <-- Impor Lottie Player
import emptyDataAnimation from '@/assets/empty-state.json'; // <-- Impor file animasi Lottie Anda
import { VDataTable, VDataTableServer } from 'vuetify/components/VDataTable';

const props = defineProps({
  server: {
    type: Boolean,
    default: false,
  },
});

const tableComponent = computed(() => {
  return props.server ? VDataTableServer : VDataTable;
});
</script>

<template>
  <component :is="tableComponent" v-bind="$attrs">

    <template #no-data>
      <slot v-if="$slots['no-data']" name="no-data"></slot>
      <div v-else class="empty-data-wrapper">

        <div class="lottie-container">
          <LottieVuePlayer :animation-data="emptyDataAnimation" :width="120" :height="120" :loop="true"
            :autoplay="true" />
        </div>

        <h4 class="text-h7 text-grey-darken-1">Tidak Ada Data Ditemukan</h4>
        <p class="text-body-3 text-grey-lighten-1 mt-2"> Coba ubah filter atau tanggal pencarian Anda.
        </p>
      </div>
    </template>

    <template v-for="(_, name) in $slots" v-slot:[name]="scope">
      <slot v-if="name !== 'no-data'" :name="name" v-bind="scope" />
    </template>

  </component>
</template>

<style scoped>
.empty-data-wrapper {
  padding: 48px 32px;
  text-align: center;
  background-color: #fafafa;
  border-top: 1px solid #e0e0e0;
}

.lottie-container {
  display: inline-block;
  /* Membuat div 'shrink-wrap' ke kontennya */
  width: 120px;
  /* Atur lebar di sini */
  height: 120px;
  /* Atur tinggi di sini */
  margin-bottom: 16px;
  /* Jarak ke teks */
}

.empty-data-wrapper h4 {
  font-size: 1.1rem;
  /* Sesuaikan ukuran font H4 */
}

.empty-data-wrapper p {
  font-size: 0.85rem;
  /* Sesuaikan ukuran font P */
}
</style>
