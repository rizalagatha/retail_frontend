<script setup lang="ts">
import { ref } from 'vue';

const { title, challengeCode } = defineProps<{
  title?: string
  challengeCode: string
}>();
const emit = defineEmits(['close', 'success']);

const pin = ref('');

const submit = () => {
  // Hanya kirim PIN yang diinput ke parent, jangan panggil API di sini
  emit('success', pin.value);
};
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="350px">
    <v-card>
      <v-card-title class="text-subtitle-1 font-weight-bold">{{ title }}</v-card-title>
      <v-card-text>
        <div class="text-center mb-4">
            <div class="text-caption">Kode</div>
            <div class="text-h4 font-weight-bold">{{ challengeCode }}</div>
        </div>
        <v-otp-input
            v-model="pin"
            :length="6"
            @finish="submit"
            autofocus
        ></v-otp-input>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="emit('close')">Batal</v-btn>
        <v-btn color="primary" @click="submit">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Optional: styling untuk OTP input */
</style>