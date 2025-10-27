import { ref } from "vue";

const showBufferStockDialog = ref(false);

export function useBufferStockDialog() {
  const openBufferStockDialog = () => {
    showBufferStockDialog.value = true;
  };

  const closeBufferStockDialog = () => {
    showBufferStockDialog.value = false;
  };

  return {
    showBufferStockDialog,
    openBufferStockDialog,
    closeBufferStockDialog,
  };
}
