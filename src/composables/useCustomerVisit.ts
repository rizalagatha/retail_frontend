import { ref } from "vue";
import api from "@/services/api";

export function useCustomerVisit() {
  const isVisitDialogVisible = ref(false);
  const isCheckingVisit = ref(false);
  const visitResolveCallback = ref<((value: "STORE" | "WA" | null | "CANCEL") => void) | null>(
    null
  );

  const checkAndPromptVisit = async (
    customerKode: string,
    tanggal: string,
    isEditMode: boolean = false,
    customerNama: string = ""
  ): Promise<"STORE" | "WA" | null | "CANCEL"> => {
    // Jika mode edit atau data customer kosong, skip pendeteksian kunjungan baru
    if (isEditMode || !customerKode) return null;

    const kodeUp = customerKode.toUpperCase();
    const namaUp = customerNama.toUpperCase();

    //  [KUNCI BARU]: Jika akun RETAIL/RETAILER, skip pengecekan DB harian.
    // Ini memaksa sistem untuk selalu membuka dialog / mencatat kunjungan baru per NOTA.
    const isRetail = kodeUp.includes("RETAIL") || namaUp.includes("RETAIL");

    isCheckingVisit.value = true;
    try {
      if (!isRetail) {
        const formattedDate = tanggal.split("T")[0];
        const response = await api.get("/customer-visit/check", {
          params: { customerKode, tanggal: formattedDate },
        });

        // Member reguler yang sudah berkunjung hari ini langsung di-skip dialognya
        if (response.data.hasVisited) {
          return null;
        }
      }

      // Jika belum berkunjung ATAU dia adalah customer RETAIL, gantung proses untuk buka dialog
      return new Promise((resolve) => {
        visitResolveCallback.value = resolve;
        isVisitDialogVisible.value = true;
      });
    } catch (error) {
      console.error("Gagal memeriksa kunjungan customer:", error);
      return null;
    } finally {
      isCheckingVisit.value = false;
    }
  };

  const handleSelectVisit = (tipe: "STORE" | "WA") => {
    if (visitResolveCallback.value) {
      visitResolveCallback.value(tipe);
    }
    isVisitDialogVisible.value = false;
  };

  const handleCancelVisit = () => {
    if (visitResolveCallback.value) {
      visitResolveCallback.value("CANCEL");
    }
    isVisitDialogVisible.value = false;
  };

  return {
    isVisitDialogVisible,
    isCheckingVisit,
    checkAndPromptVisit,
    handleSelectVisit,
    handleCancelVisit,
  };
}
