<script setup lang="ts">
import { ref, reactive } from "vue";
import api from "@/services/api";
import { VForm } from "vuetify/components";
import { useToast } from "vue-toastification";
import axios from "axios";

// Props untuk membuatnya generik
const props = defineProps({
  title: { type: String, required: true },
  apiUrl: { type: String, required: true },
  label1: { type: String, required: true },
  field1: { type: String, required: true },
  // Props untuk field kedua sekarang opsional
  label2: { type: String, default: "" },
  field2: { type: String, default: "" },
  // Prop untuk menampilkan/menyembunyikan field kedua
  showField2: { type: Boolean, default: true },
});

const emit = defineEmits(["close", "saved"]);
const toast = useToast();

const form = reactive({
  [props.field1]: "",
  // Hanya tambahkan field2 ke form jika akan ditampilkan
  ...(props.showField2 && { [props.field2]: "" }),
});

const isSaving = ref(false);
const formRef = ref<VForm | null>(null);

const rules = {
  required: (v: string) => !!v || "Field harus diisi",
};

const save = async () => {
  // [PERBAIKAN 1] Tambahkan baris ini sebagai pengaman
  if (!formRef.value) return;

  const { valid } = await formRef.value.validate();
  if (!valid) return;

  isSaving.value = true;
  try {
    const response = await api.post(props.apiUrl, form);
    toast.success(response.data.message);
    emit("saved");
    emit("close");
  } catch (err: unknown) {
    // [PERBAIKAN 2] Gunakan unknown agar konsisten
    let msg = "Gagal menyimpan data.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="500px" persistent>
    <v-card>
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>{{ props.title }}</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" />
      </v-toolbar>
      <v-card-text class="pt-4">
        <v-form ref="formRef" @submit.prevent="save">
          <v-text-field
            v-model="form[props.field1]"
            :label="props.label1"
            :rules="[rules.required]"
            autofocus
            variant="outlined"
          />
          <v-text-field
            v-if="props.showField2"
            v-model="form[props.field2]"
            :label="props.label2"
            :rules="[rules.required]"
            variant="outlined"
          />
        </v-form>
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn text @click="$emit('close')">Batal</v-btn>
        <v-btn color="primary" @click="save" :loading="isSaving">Simpan</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
