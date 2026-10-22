export interface BagianDiskonInput {
  diskonSo: number;
  diskonMapsSo: number;
  brutoNetSo: number;
  netDiambil: number;
  diskonTerpakai: number;
  isTerakhir: boolean;
}

export interface BagianDiskon {
  total: number;
  maps: number;
  base: number;
}

export const hitungBagianDiskonInvoice = (p: BagianDiskonInput): BagianDiskon => {
  const sisaDiskon = Math.max(0, p.diskonSo - p.diskonTerpakai);
  let total = p.isTerakhir
    ? sisaDiskon
    : p.brutoNetSo > 0
    ? Math.round((p.diskonSo * p.netDiambil) / p.brutoNetSo)
    : 0;
  total = Math.min(total, sisaDiskon);
  const maps = p.diskonSo > 0 ? Math.round((total * p.diskonMapsSo) / p.diskonSo) : 0;
  return { total, maps, base: total - maps };
};
