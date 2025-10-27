import { ref } from 'vue';

const isSettingsProcessDialogOpen = ref(false);

export function useSettingsProcessDialog() {
  const openSettingsProcessDialog = () => {
    isSettingsProcessDialogOpen.value = true;
  };
  const closeSettingsProcessDialog = () => {
    isSettingsProcessDialogOpen.value = false;
  };

  return {
    isSettingsProcessDialogOpen,
    openSettingsProcessDialog,
    closeSettingsProcessDialog,
  };
}
