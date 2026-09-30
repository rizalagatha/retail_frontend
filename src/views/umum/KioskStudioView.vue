<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import LogoKaosan from "@/assets/logo.png";
import { STUDIO_URL } from "@/composables/useKiosk";

const router = useRouter();

const src = `${STUDIO_URL}${STUDIO_URL.includes("?") ? "&" : "?"}kiosk=1`;
const frameKey = ref(0);
const loaded = ref(false);
const slow = ref(false);
let slowTimer: ReturnType<typeof setTimeout> | undefined;

const armSlow = () => {
  clearTimeout(slowTimer);
  slow.value = false;
  slowTimer = setTimeout(() => {
    if (!loaded.value) slow.value = true;
  }, 10_000);
};

const onLoad = () => {
  loaded.value = true;
  slow.value = false;
  clearTimeout(slowTimer);
};

// Mulai ulang = iframe dibuat baru, jadi desain pelanggan sebelumnya terhapus
const restart = () => {
  loaded.value = false;
  frameKey.value++;
  armSlow();
};

onMounted(() => {
  document.title = "Kaos Studio - Kaosan";
  armSlow();
});
onUnmounted(() => clearTimeout(slowTimer));
</script>

<template>
  <div class="ks">
    <header class="ks-bar">
      <button class="ks-btn" @click="router.push('/kiosk')">
        <v-icon size="26">mdi-home-outline</v-icon>Beranda
      </button>
      <div class="ks-title">
        <span class="ks-logo"><img :src="LogoKaosan" height="26" alt="Kaosan" /></span>
        Kaos Studio
      </div>
      <button class="ks-btn ks-btn--ghost" @click="restart">
        <v-icon size="26">mdi-restart</v-icon>Mulai ulang
      </button>
    </header>

    <div class="ks-stage">
      <iframe
        :key="frameKey"
        :src="src"
        title="Kaos Studio"
        allow="clipboard-write"
        @load="onLoad"
      ></iframe>

      <Transition name="ks-fade">
        <div v-if="!loaded" class="ks-loading">
          <v-progress-circular indeterminate color="#b71c1c" size="44" />
          <p>Menyiapkan Kaos Studio...</p>
          <template v-if="slow">
            <small>Lebih lama dari biasanya. Periksa koneksi internet.</small>
            <button class="ks-btn ks-btn--solid" @click="restart">Coba lagi</button>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ks {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #faf6f4;
  font-family: "Manrope Variable", "Plus Jakarta Sans", system-ui, sans-serif;
}
.ks-bar {
  flex-shrink: 0;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  color: #fff;
  background: #b71c1c;
}
.ks-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: "Bricolage Grotesque Variable", "Plus Jakarta Sans", system-ui, sans-serif;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.ks-logo {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
}
.ks-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 20px 0 14px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 16px;
  font-weight: 800;
  color: #b71c1c;
  background: #fff;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.ks-btn:active {
  transform: scale(0.95);
}
.ks-btn--ghost {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}
.ks-btn--solid {
  color: #fff;
  background: #b71c1c;
}
.ks-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ks-stage iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
.ks-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  color: #1f1a19;
  background: #faf6f4;
}
.ks-loading p {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.ks-loading small {
  font-size: 14px;
  color: #6f6663;
}
.ks-fade-enter-active,
.ks-fade-leave-active {
  transition: opacity 0.3s ease;
}
.ks-fade-enter-from,
.ks-fade-leave-to {
  opacity: 0;
}
</style>
