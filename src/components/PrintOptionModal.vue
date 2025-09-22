<script setup lang="ts">
const emit = defineEmits(['close', 'select']);
</script>

<template>
    <v-dialog :model-value="true" persistent max-width="400px">
        <v-card>
            <v-card-title>Pilih Jenis Cetak</v-card-title>
            <v-card-text>
                <v-list>
                    <v-list-item @click="emit('select', 'a4')" prepend-icon="mdi-file-pdf-box">
                        <v-list-item-title>Invoice A4</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="emit('select', 'kasir')" prepend-icon="mdi-receipt-text">
                        <v-list-item-title>Struk Kasir (POS)</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="emit('select', 'wa')" prepend-icon="mdi-whatsapp">
                        <v-list-item-title>Kirim via WhatsApp</v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn text @click="emit('close')">Batal</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>