import { ref } from "vue";

const showWhatsAppDialog = ref(false);

export function useWhatsAppDialog() {
  const openWhatsAppDialog = () => {
    showWhatsAppDialog.value = true;
  };

  const closeWhatsAppDialog = () => {
    showWhatsAppDialog.value = false;
  };

  return {
    showWhatsAppDialog,
    openWhatsAppDialog,
    closeWhatsAppDialog,
  };
}
