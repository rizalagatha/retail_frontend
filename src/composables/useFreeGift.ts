import { ref, reactive, nextTick } from "vue";
import { useToast } from "vue-toastification";
import api from "@/services/api";
import {
  PROMO_GRAND_OPENING_K12,
  isEligibleFreeGiftItem,
  calcFreeGiftEligibleSubtotal,
  isFreeGiftSizeAllowed,
} from "@/constants/promoConfig";

interface FreeGiftItemLike {
  kode?: string;
  nama?: string;
  ukuran?: string;
  jumlah?: number;
  harga?: number;
  total?: number;
  isFreeGift?: boolean;
  [key: string]: unknown;
}

interface FreeGiftProduct {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
  barcode: string;
}

interface FreeGiftOptions<T extends FreeGiftItemLike> {
  /** prefix endpoint modul: 'offer-form' | 'so-form' | 'invoice-form' */
  endpointPrefix: string;
  /** bangun objek item baru sesuai interface modul masing-masing */
  buildItem: (product: FreeGiftProduct) => T;
  /** cara nyisipkan item baru ke array items (splice ke baris kosong / push) */
  addItemToList: (item: T) => void;
  getCabang: () => string;
  getCustomerKode: () => string;
  getCustomerNama: () => string;
  getActivePromoNomors: () => string[];
  setProNomorFreeItem: (nomor: string) => void;
  audioSuccess?: HTMLAudioElement;
  audioError?: HTMLAudioElement;
}

export function useFreeGift<T extends FreeGiftItemLike>(
  items: { value: T[] },
  options: FreeGiftOptions<T>
) {
  const toast = useToast();

  const freeGiftQuota = reactive({
    available: false,
    sisaKuota: 0,
    reason: null as string | null,
  });
  const isFreeGiftScanDialogOpen = ref(false);
  const freeGiftScanBarcode = ref("");
  const isFreeGiftScanning = ref(false);
  const freeGiftScanInputRef = ref<HTMLInputElement | null>(null);

  const checkFreeGiftQuota = async () => {
    const cabang = options.getCabang();
    const activeNomors = options.getActivePromoNomors();
    const isCampaignActive =
      cabang === PROMO_GRAND_OPENING_K12.cabang &&
      activeNomors.includes(PROMO_GRAND_OPENING_K12.proNomor);

    const custKode = options.getCustomerKode();
    const custNama = (options.getCustomerNama() || "").toUpperCase();
    const isRetailCustomer = custNama.includes("RETAIL");

    if (!isCampaignActive || !custKode || isRetailCustomer) {
      freeGiftQuota.available = false;
      freeGiftQuota.sisaKuota = 0;
      freeGiftQuota.reason = isRetailCustomer ? "CUSTOMER_RETAIL" : null;
      return;
    }

    if (items.value.some((i) => i.isFreeGift)) {
      freeGiftQuota.available = false;
      return;
    }

    const eligibleSubtotal = calcFreeGiftEligibleSubtotal(items.value as never);
    if (eligibleSubtotal < PROMO_GRAND_OPENING_K12.minBelanjaFreeItem) {
      freeGiftQuota.available = false;
      freeGiftQuota.sisaKuota = 0;
      freeGiftQuota.reason = "BELUM_MEMENUHI_MINIMAL_BELANJA";
      return;
    }

    try {
      const { data } = await api.get(`/${options.endpointPrefix}/lookup/free-item-quota`, {
        params: { proNomor: PROMO_GRAND_OPENING_K12.proNomor, cusKode: custKode },
      });
      freeGiftQuota.available = data.available;
      freeGiftQuota.sisaKuota = data.sisaKuota;
      freeGiftQuota.reason = data.reason;
    } catch (err) {
      console.error("[FreeGift] Gagal cek kuota:", err);
      freeGiftQuota.available = false;
    }
  };

  let freeGiftCheckTimer: ReturnType<typeof setTimeout>;
  const debouncedCheckFreeGiftQuota = (): void => {
    clearTimeout(freeGiftCheckTimer);
    freeGiftCheckTimer = setTimeout(() => checkFreeGiftQuota(), 400);
  };

  const openFreeGiftScanDialog = () => {
    freeGiftScanBarcode.value = "";
    isFreeGiftScanDialogOpen.value = true;
    nextTick(() => freeGiftScanInputRef.value?.focus());
  };

  const handleFreeGiftScan = async () => {
    const barcode = freeGiftScanBarcode.value;
    if (!barcode) return;
    isFreeGiftScanning.value = true;
    try {
      const response = await api.get(`/${options.endpointPrefix}/by-barcode/${barcode}`, {
        params: { gudang: options.getCabang() },
      });
      const product = response.data;

      if (!isEligibleFreeGiftItem(product)) {
        options.audioError?.play().catch(() => {});
        toast.error(
          `${product.nama} bukan barang COMBED 24S. Scan barang lain untuk hadiah gratis.`
        );
        nextTick(() => freeGiftScanInputRef.value?.select());
        return;
      }

      if (!isFreeGiftSizeAllowed(product.ukuran, items.value as never)) {
        options.audioError?.play().catch(() => {});
        toast.error(
          `Ukuran hadiah (${product.ukuran}) tidak boleh lebih besar dari ukuran produk yang dibeli.`
        );
        nextTick(() => freeGiftScanInputRef.value?.select());
        return;
      }

      const newItem = options.buildItem(product);
      options.addItemToList(newItem);

      options.setProNomorFreeItem(PROMO_GRAND_OPENING_K12.proNomor);
      freeGiftQuota.available = false;
      isFreeGiftScanDialogOpen.value = false;
      options.audioSuccess?.play().catch(() => {});
      toast.success(`🎁 Hadiah gratis ditambahkan: ${product.nama}`);
    } catch {
      options.audioError?.play().catch(() => {});
      toast.error(`Barcode ${barcode} tidak valid.`);
      nextTick(() => freeGiftScanInputRef.value?.select());
    } finally {
      isFreeGiftScanning.value = false;
      freeGiftScanBarcode.value = "";
      if (isFreeGiftScanDialogOpen.value) {
        nextTick(() => freeGiftScanInputRef.value?.focus());
      }
    }
  };

  return {
    freeGiftQuota,
    isFreeGiftScanDialogOpen,
    freeGiftScanBarcode,
    isFreeGiftScanning,
    freeGiftScanInputRef,
    checkFreeGiftQuota,
    debouncedCheckFreeGiftQuota,
    openFreeGiftScanDialog,
    handleFreeGiftScan,
  };
}
