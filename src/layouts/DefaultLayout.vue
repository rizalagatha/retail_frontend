<script setup lang="ts">
import Navbar from '@/components/Navbar.vue'; // Sesuaikan path jika perlu
</script>

<template>
    <div>
        <Navbar />
        <v-main>
            <router-view />
        </v-main>
    </div>
</template>