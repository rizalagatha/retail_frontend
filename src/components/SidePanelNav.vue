<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/authStore";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const STORAGE_KEY = "sidePanelNavCollapsed";
const collapsed = ref(true);

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) collapsed.value = saved === "true";
});

const toggleCollapse = () => {
  collapsed.value = !collapsed.value;
  localStorage.setItem(STORAGE_KEY, String(collapsed.value));
};

const goBack = () => router.push({ name: "Home" });

interface ShortcutItem {
  routeName: string;
  label: string;
  icon: string;
  menuId: string;
}
interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Transaksi",
    items: [
      {
        routeName: "frmBrowPenawaran",
        label: "Penawaran",
        icon: "mdi-handshake-outline",
        menuId: "42",
      },
      {
        routeName: "frmBrowseSo",
        label: "Surat Pesanan",
        icon: "mdi-file-document-edit-outline",
        menuId: "26",
      },
      {
        routeName: "frmBrowSODTF",
        label: "SO DTF Pesanan",
        icon: "mdi-printer-3d-nozzle-outline",
        menuId: "35",
      },
      { routeName: "Invoice", label: "Invoice", icon: "mdi-receipt-text-outline", menuId: "27" },
    ],
  },
  {
    title: "Kasir",
    items: [
      {
        routeName: "SetoranBayar",
        label: "Setoran Pembayaran",
        icon: "mdi-cash-multiple",
        menuId: "51",
      },
      { routeName: "Fsk", label: "Form Setoran Kasir", icon: "mdi-cash-register", menuId: "54" },
    ],
  },
];

const visibleGroups = computed(() =>
  shortcutGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => authStore.can(item.menuId, "view")),
    }))
    .filter((group) => group.items.length > 0)
);

const isActive = (routeName: string) => route.name === routeName;
const goTo = (routeName: string) => router.push({ name: routeName });
</script>

<template>
  <v-navigation-drawer
    permanent
    :rail="collapsed"
    rail-width="60"
    width="220"
    class="side-panel-drawer"
  >
    <div class="side-nav-top">
      <button class="side-nav-back" @click="goBack" aria-label="Kembali ke Dashboard">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <span v-if="!collapsed" class="side-nav-title-flat">Ringkasan Kerja</span>
    </div>

    <div v-if="collapsed" class="side-nav-title-vertical">RINGKASAN KERJA</div>

    <div class="side-nav-shortcuts" :class="{ 'side-nav-shortcuts--collapsed': collapsed }">
      <div v-for="group in visibleGroups" :key="group.title" class="shortcut-group">
        <div v-if="!collapsed" class="shortcut-group-title">{{ group.title }}</div>
        <button
          v-for="item in group.items"
          :key="item.routeName"
          class="shortcut-item"
          :class="{
            'shortcut-item--active': isActive(item.routeName),
            'shortcut-item--collapsed': collapsed,
          }"
          @click="goTo(item.routeName)"
          :title="collapsed ? item.label : undefined"
        >
          <v-icon size="20">{{ item.icon }}</v-icon>
          <span v-if="!collapsed" class="shortcut-label">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <template #append>
      <div class="side-nav-toggle-wrap">
        <button
          class="side-nav-toggle"
          @click="toggleCollapse"
          :aria-label="collapsed ? 'Perluas panel' : 'Ciutkan panel'"
        >
          <v-icon size="18">{{ collapsed ? "mdi-chevron-right" : "mdi-chevron-left" }}</v-icon>
        </button>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.side-panel-drawer {
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.side-nav-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16px 10px 12px;
  gap: 8px;
}
.side-nav-back {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.side-nav-back:hover {
  background: rgba(var(--v-theme-primary), 0.2);
}
.side-nav-title-flat {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: rgba(var(--v-theme-on-surface), 0.75);
  white-space: nowrap;
}
.side-nav-title-vertical {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin: 8px auto 4px;
  text-align: center;
}

.side-nav-shortcuts {
  padding: 8px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.side-nav-shortcuts--collapsed {
  align-items: center;
  padding: 8px 6px 16px;
}
.shortcut-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}
.shortcut-group-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.4);
  padding: 6px 8px 2px;
}
.shortcut-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 8px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.75);
  transition: background 0.15s ease;
  text-align: left;
}
.shortcut-item--collapsed {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
}
.shortcut-item:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}
.shortcut-item--active {
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}
.shortcut-label {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-nav-toggle-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.side-nav-toggle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.side-nav-toggle:hover {
  background: rgba(var(--v-theme-primary), 0.1);
}
</style>
