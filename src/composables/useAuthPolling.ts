import api from "@/services/api";
import { useToast } from "vue-toastification";

type StatusOtorisasi = "APPROVED" | "REJECTED";

interface PollOptions {
  pesanDisetujui?: (approver: string) => string;
  pesanDitolak?: string;
}

interface PollEntry {
  onDone?: (status: StatusOtorisasi) => void;
  options: PollOptions;
  mulai: number;
}

const MAKS_UMUR_POLLING_MS = 8 * 60 * 60 * 1000;

// STATE GLOBAL: di luar fungsi agar hidup selama tab terbuka
const activePolls = new Map<string, PollEntry>();
let globalInterval: ReturnType<typeof setInterval> | null = null;

export const useAuthPolling = () => {
  const toast = useToast();

  const startGlobalPolling = (
    authNomor: string,
    onDone?: (status: StatusOtorisasi) => void,
    options: PollOptions = {}
  ) => {
    activePolls.set(authNomor, { onDone, options, mulai: Date.now() });

    if (globalInterval) return;

    globalInterval = setInterval(async () => {
      if (activePolls.size === 0) {
        if (globalInterval) clearInterval(globalInterval);
        globalInterval = null;
        return;
      }

      for (const [nomor, entry] of Array.from(activePolls.entries())) {
        if (Date.now() - entry.mulai > MAKS_UMUR_POLLING_MS) {
          activePolls.delete(nomor);
          continue;
        }

        try {
          const res = await api.get<{ status: string; approver?: string }>(
            `/auth-pin/status/${nomor}`
          );

          if (res.data.status === "APPROVED") {
            const approver = res.data.approver || "SPV";
            activePolls.delete(nomor);
            toast.success(
              entry.options.pesanDisetujui
                ? entry.options.pesanDisetujui(approver)
                : `Klaim disetujui oleh ${approver} & masuk ke Finance!`
            );
            entry.onDone?.("APPROVED");
          } else if (res.data.status === "REJECTED") {
            activePolls.delete(nomor);
            toast.error(entry.options.pesanDitolak || "Otorisasi ditolak oleh Supervisor.");
            entry.onDone?.("REJECTED");
          } else if (res.data.status === "NOT_FOUND") {
            activePolls.delete(nomor);
          }
        } catch (e) {
          console.error("Global polling error", e);
        }
      }
    }, 3000);
  };

  return { startGlobalPolling };
};
