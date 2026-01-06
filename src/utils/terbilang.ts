export function terbilang(nominal: number): string {
  const bilangan = [
    "",
    "SATU",
    "DUA",
    "TIGA",
    "EMPAT",
    "LIMA",
    "ENAM",
    "TUJUH",
    "DELAPAN",
    "SEMBILAN",
    "SEPULUH",
    "SEBELAS",
  ];

  if (nominal < 12) return bilangan[nominal];
  if (nominal < 20) return bilangan[nominal - 10] + " BELAS";
  if (nominal < 100) return bilangan[Math.floor(nominal / 10)] + " PULUH " + bilangan[nominal % 10];
  if (nominal < 200) return "SERATUS " + terbilang(nominal - 100);
  if (nominal < 1000)
    return bilangan[Math.floor(nominal / 100)] + " RATUS " + terbilang(nominal % 100);
  if (nominal < 2000) return "SERIBU " + terbilang(nominal - 1000);
  if (nominal < 1000000)
    return terbilang(Math.floor(nominal / 1000)) + " RIBU " + terbilang(nominal % 1000);
  if (nominal < 1000000000)
    return terbilang(Math.floor(nominal / 1000000)) + " JUTA " + terbilang(nominal % 1000000);

  return "";
}
