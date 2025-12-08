import { defineStore } from "pinia";
import { ref } from "vue";
import type { RouteLocationNormalized } from "vue-router"; // Import tipe route

export const useUiStore = defineStore("ui", () => {
  // State Dirty (Ada perubahan belum disimpan)
  const hasUnsavedChanges = ref(false);

  // State Dialog & Navigasi
  const isLeaveDialogVisible = ref(false);
  const pendingRoute = ref<RouteLocationNormalized | null>(null);

  // Actions
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

  return {
    hasUnsavedChanges,
    isLeaveDialogVisible,
    pendingRoute,
    setUnsavedChanges,
    openLeaveDialog,
    closeLeaveDialog,
  };
});
