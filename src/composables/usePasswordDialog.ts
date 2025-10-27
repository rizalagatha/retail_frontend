import { ref } from "vue";

const showPasswordDialog = ref(false);

export function usePasswordDialog() {
  const openPasswordDialog = () => {
    showPasswordDialog.value = true;
  };

  const closePasswordDialog = () => {
    showPasswordDialog.value = false;
  };

  return {
    showPasswordDialog,
    openPasswordDialog,
    closePasswordDialog,
  };
}
