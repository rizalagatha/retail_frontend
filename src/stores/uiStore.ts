import { defineStore } from "pinia";
import { ref } from "vue";
import type { RouteLocationNormalized } from "vue-router";

export const useUiStore = defineStore("ui", () => {
  // --- STATE 1: UNSAVED CHANGES & NAVIGATION ---
  const hasUnsavedChanges = ref(false);
  const isLeaveDialogVisible = ref(false);
  const pendingRoute = ref<RouteLocationNormalized | null>(null);

  // --- STATE 2: DARK MODE (BARU) ---
  // Cek localStorage saat inisialisasi. Jika tidak ada, default false (Light Mode)
  const isDark = ref(localStorage.getItem('user_theme') === 'dark');

  // --- ACTIONS: NAVIGATION ---
  const setUnsavedChanges = (value: boolean) => {
    hasUnsavedChanges.value = value;
  };

  const openLeaveDialog = (to: RouteLocationNormalized) => {
    pendingRoute.value = to;
    isLeaveDialogVisible.value = true;
  };

  const closeLeaveDialog = () => {
    isLeaveDialogVisible.value = false;
    pendingRoute.value = null;
  };

  // --- ACTIONS: DARK MODE (BARU) ---
  const toggleTheme = () => {
    isDark.value = !isDark.value;
    // Simpan preferensi user ke browser agar tidak reset saat refresh
    localStorage.setItem('user_theme', isDark.value ? 'dark' : 'light');
  };

  return {
    // Navigation Exports
    hasUnsavedChanges,
    isLeaveDialogVisible,
    pendingRoute,
    setUnsavedChanges,
    openLeaveDialog,
    closeLeaveDialog,

    // Dark Mode Exports (Wajib di-return agar bisa dipakai di App.vue & Footer)
    isDark,
    toggleTheme,
  };
});
