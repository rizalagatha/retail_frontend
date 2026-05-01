import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import axios from "axios";

type SessionStatus = "OPEN" | "PAUSED" | "CLOSED";

interface CashierSession {
  sesi_id: string;
  saldo_sistem: number;

  status: SessionStatus;
  kasir_utama: string;
  active_pengganti?: string | null;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
};

export const useCashierSessionStore = defineStore("cashierSession", () => {
  const toast = useToast();

  // State
  const session = ref<CashierSession | null>(null);
  const isLoading = ref(false);
  const isStartModalVisible = ref(false);
  const isHandoverModalVisible = ref(false);
  const handoverMode = ref<"pause" | "resume" | "end">("pause");

  // Cek sesi aktif
  const fetchCurrentSession = async () => {
    isLoading.value = true;
    try {
      const response = await api.get("/cashier-session/current");
      session.value = response.data.data;
    } catch (error: unknown) {
      console.error("Gagal memuat sesi kasir", error);
    } finally {
      isLoading.value = false;
    }
  };

  const startSession = async (modalAwal: number) => {
    try {
      const response = await api.post("/cashier-session/start", { modalAwal });
      toast.success(response.data.message);
      isStartModalVisible.value = false;
      await fetchCurrentSession(); // Refresh data
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gagal membuka shift"));
      return false;
    }
  };

  const pauseSession = async (kasirPengganti: string, pinPengganti: string, keterangan: string) => {
    if (!session.value) {
      toast.error("Sesi tidak ditemukan");
      return false;
    }

    try {
      const response = await api.post("/cashier-session/pause", {
        sesiId: session.value.sesi_id,
        kasirPengganti,
        pinPengganti,
        keterangan,
      });
      toast.success(response.data.message);
      isHandoverModalVisible.value = false;
      await fetchCurrentSession();
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gagal serah terima laci"));
      return false;
    }
  };

  const resumeSession = async (pinUtama: string) => {
    if (!session.value) {
      toast.error("Sesi tidak ditemukan");
      return false;
    }

    try {
      const response = await api.post("/cashier-session/resume", {
        sesiId: session.value.sesi_id,
        pinUtama,
      });
      toast.success(response.data.message);
      isHandoverModalVisible.value = false;
      await fetchCurrentSession();
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gagal mengambil alih laci"));
      return false;
    }
  };

  const endSession = async (
    kasirPenerima: string,
    pinPenerima: string,
    saldoFisik: number,
    keteranganSelisih: string
  ) => {
    if (!session.value) {
      toast.error("Sesi tidak ditemukan");
      return false;
    }
    try {
      const response = await api.post("/cashier-session/end", {
        sesiId: session.value.sesi_id,
        kasirPenerima,
        pinPenerima,
        saldoFisik,
        saldoSistem: session.value.saldo_sistem || 0, // Fallback, pastikan backend juga crosscheck
        keteranganSelisih,
      });
      toast.success(response.data.message);
      isHandoverModalVisible.value = false;
      await fetchCurrentSession(); // Akan me-reset session menjadi null dan memunculkan Start Modal buat kasir baru
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gagal tutup shift"));
      return false;
    }
  };

  const openHandoverModal = (mode: "pause" | "resume" | "end") => {
    handoverMode.value = mode;
    isHandoverModalVisible.value = true;
  };

  return {
    session,
    isLoading,
    isStartModalVisible,
    isHandoverModalVisible,
    handoverMode,
    fetchCurrentSession,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    openHandoverModal,
  };
});
