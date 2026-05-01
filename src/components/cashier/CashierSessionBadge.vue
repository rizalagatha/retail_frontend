<script setup lang="ts">
import { useCashierSessionStore } from "@/stores/cashierSessionStore";
import { computed } from "vue";

const sessionStore = useCashierSessionStore();

const badgeProps = computed(() => {
  if (!sessionStore.session) {
    return { color: "error", text: "LACI DITUTUP", icon: "mdi-lock" };
  }
  if (sessionStore.session.status === "PAUSED") {
    return {
      color: "orange-darken-3",
      text: `LACI: ${sessionStore.session.active_pengganti || "PENGGANTI"} (ISTIRAHAT)`,
      icon: "mdi-coffee",
    };
  }
  return {
    color: "success",
    text: `LACI: ${sessionStore.session.kasir_utama} (AKTIF)`,
    icon: "mdi-cash-register",
  };
});

const handleAction = (action: "pause" | "resume" | "end") => {
  sessionStore.openHandoverModal(action);
};
</script>

<template>
  <v-menu v-if="sessionStore.session" open-on-hover>
    <template v-slot:activator="{ props }">
      <v-btn
        v-bind="props"
        :color="badgeProps.color"
        variant="flat"
        size="small"
        :prepend-icon="badgeProps.icon"
        class="font-weight-bold"
      >
        {{ badgeProps.text }}
      </v-btn>
    </template>

    <v-list density="compact">
      <v-list-item
        v-if="sessionStore.session.status === 'OPEN'"
        prepend-icon="mdi-coffee-outline"
        title="Istirahat / Serah Terima"
        @click="handleAction('pause')"
      />
      <v-list-item
        v-if="sessionStore.session.status === 'PAUSED'"
        prepend-icon="mdi-account-arrow-left"
        title="Selesai Istirahat (Ambil Alih)"
        @click="handleAction('resume')"
      />
      <v-divider v-if="sessionStore.session.status === 'OPEN'" />
      <v-list-item
        v-if="sessionStore.session.status === 'OPEN'"
        prepend-icon="mdi-store-clock"
        title="Tutup Shift (End Session)"
        base-color="error"
        @click="handleAction('end')"
      />
    </v-list>
  </v-menu>

  <v-btn
    v-else
    color="error"
    variant="flat"
    size="small"
    prepend-icon="mdi-lock"
    @click="sessionStore.isStartModalVisible = true"
  >
    LACI DITUTUP
  </v-btn>
</template>
