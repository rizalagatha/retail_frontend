// src/composables/useManualProgramDialog.ts
import { ref } from "vue";

const showManualDialog = ref(false);

export function useManualProgramDialog() {
  const openManualDialog = () => {
    showManualDialog.value = true;
  };
  const closeManualDialog = () => {
    showManualDialog.value = false;
  };

  return {
    showManualDialog,
    openManualDialog,
    closeManualDialog,
  };
}
