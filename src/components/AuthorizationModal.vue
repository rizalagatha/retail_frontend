<script setup lang="ts">
import { ref } from 'vue';

const { title, challengeCode } = defineProps<{
  title?: string
  challengeCode: string
}>();
const emit = defineEmits(['close', 'success']);

const pin = ref('');
const errorMessage = ref('');

const submit = () => {
  // Hanya kirim PIN yang diinput ke parent, jangan panggil API di sini
  emit('success', pin.value);
};

const setFailed = (message: string) => {
  errorMessage.value = message;
  pin.value = ''; // Kosongkan input
};

defineExpose({ setFailed });
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="350px">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <div class="text-center mb-4">
            <div class="text-caption">Kode</div>
            <div class="text-h4 font-weight-bold">{{ challengeCode }}</div>
        </div>
        <v-text-field
            v-model="pin"
            label="Otorisasi"
            variant="outlined"
            density="compact"
            @keyup.enter="submit"
            autofocus
            :error-messages="errorMessage"
        ></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="emit('close')">Batal</v-btn>
        <v-btn color="primary" @click="submit">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
