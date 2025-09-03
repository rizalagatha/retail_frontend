<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/services/api';

const props = defineProps({
  title: { type: String, default: 'Otorisasi' },
});
const emit = defineEmits(['close', 'success']);

const code = ref('');
const pin = ref('');
const isLoading = ref(false);
const errorMessage = ref('');

const generateCode = () => {
    // Meniru logika pembuatan kode dari Delphi
    code.value = (Math.floor(Math.random() * 900) + 100).toString();
};

const submit = async () => {
    isLoading.value = true;
    errorMessage.value = '';
    try {
        await api.post('/auth-pin/validate', {
            code: code.value,
            pin: pin.value,
        });
        emit('success', pin.value); // Kirim PIN yang valid kembali
    } catch (error) {
        errorMessage.value = 'Otorisasi salah.';
    } finally {
        isLoading.value = false;
    }
};

onMounted(generateCode);
</script>

<template>
  <v-dialog :model-value="true" persistent max-width="400px">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <v-text-field label="Kode" v-model="code" readonly variant="filled"></v-text-field>
        <v-text-field 
            label="Otorisasi" 
            v-model="pin" 
            type="password" 
            @keyup.enter="submit" 
            autofocus
        ></v-text-field>
        <v-alert v-if="errorMessage" type="error" density="compact">{{ errorMessage }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="emit('close')">Batal</v-btn>
        <v-btn color="primary" @click="submit" :loading="isLoading">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>