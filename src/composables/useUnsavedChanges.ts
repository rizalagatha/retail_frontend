import { onBeforeRouteLeave } from 'vue-router';
import { useUiStore } from '@/stores/uiStore';

export function useUnsavedChanges() {
  const uiStore = useUiStore();

  // Navigation Guard Otomatis
  onBeforeRouteLeave((to, from, next) => {
    if (uiStore.hasUnsavedChanges) {
      // 1. Tahan navigasi
      next(false);
      // 2. Buka dialog global lewat store
      uiStore.openLeaveDialog(to);
    } else {
      // Aman, lanjut
      next();
    }
  });

  // Helper untuk reset manual (dipanggil saat save sukses)
  const markAsSaved = () => {
    uiStore.setUnsavedChanges(false);
  };

  return {
    markAsSaved
  };
}
