import { ref } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";

// STATE GLOBAL: Ditaruh di luar fungsi agar hidup terus di memori browser
const activePolls = ref(new Map());
let globalInterval: ReturnType<typeof setInterval> | null = null;

export const useAuthPolling = () => {
  const toast = useToast();

  const startGlobalPolling = (authNomor: string, onDoneCallback?: () => void) => {
    // Masukkan nomor otorisasi ke antrean
    activePolls.value.set(authNomor, onDoneCallback);

    // Nyalakan mesin polling jika belum menyala
    if (!globalInterval) {
      globalInterval = setInterval(async () => {
        // Kalau antrean kosong, matikan mesin biar hemat RAM
        if (activePolls.value.size === 0) {
          clearInterval(globalInterval!);
          globalInterval = null;
          return;
        }

        // Cek semua nomor yang lagi ngantre
        for (const [nomor, callback] of activePolls.value.entries()) {
          try {
            const res = await api.get(`/auth-pin/status/${nomor}`);

            if (res.data.status === "APPROVED") {
              toast.success(`Klaim disetujui oleh ${res.data.approver} & masuk ke Finance!`);
              if (callback) callback(); // Refresh halaman (jika kasir masih di halaman PC)
              activePolls.value.delete(nomor); // Hapus dari antrean
            } else if (res.data.status === "REJECTED") {
              toast.error("Otorisasi ditolak oleh Supervisor.");
              if (callback) callback();
              activePolls.value.delete(nomor);
            }
          } catch (e) {
            console.error("Global polling error", e);
          }
        }
      }, 3000);
    }
  };

  return { startGlobalPolling };
};
