// src/composables/useMemoInternalDialog.ts
import { ref } from "vue";

const showMemoDialog = ref(false);

export function useMemoInternalDialog() {
  const openMemoDialog = () => {
    showMemoDialog.value = true;
  };
  const closeMemoDialog = () => {
    showMemoDialog.value = false;
  };

  return {
    showMemoDialog,
    openMemoDialog,
    closeMemoDialog,
  };
}
