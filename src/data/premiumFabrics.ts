export interface PremiumFabric {
  id: string;
  nama: string;
  judul: string;
  isi: string;
  cocok: string;
  perawatan?: string;
  kata: string[]; // kata kunci pada nama produk di katalog (salah satu cocok sudah cukup)
}

export const PREMIUM_FABRICS: PremiumFabric[] = [
  {
    id: "dbf-signature",
    nama: "DBF Signature",
    judul: "Lentur, lembut, dan jatuh elegan.",
    isi: "Bahan terasa halus dan adem di kulit, dengan elastisitas tinggi yang mengikuti bentuk tubuh. Tidak mudah kusut, cukup tebal, tidak mudah menerawang, dan cepat kering.",
    cocok: "Pakaian yang membutuhkan kenyamanan, fleksibilitas, dan tampilan rapi.",
    kata: ["DBF SIGNATURE"],
  },
  {
    id: "dbf-prima",
    nama: "DBF Prima",
    judul: "Nyaman dengan teknologi dua sisi bahan.",
    isi: "Memiliki struktur plating jersey dengan sisi luar berbahan cotton dan sisi dalam polyester. Membantu menyerap kelembapan dari tubuh dan mengalirkannya ke permukaan kain sehingga terasa lebih nyaman saat beraktivitas.",
    cocok: "Pakaian aktif dan penggunaan sehari-hari.",
    kata: ["DBF PRIMA"],
  },
  {
    id: "lacost-combed-30-stripe",
    nama: "Combed Stripe",
    judul: "Lembut, nyaman, dan fleksibel.",
    isi: "Menggunakan benang 30s yang menghasilkan handfeel lebih lembut dan jatuh. Memiliki stretch yang pas serta nyaman digunakan, termasuk untuk kulit sensitif.",
    cocok: "Polo shirt yang nyaman untuk aktivitas sehari-hari.",
    kata: ["COMBED STRIPE"],
  },
  {
    id: "lacost-pique-altima",
    nama: "Polo Ultimate",
    judul: "Rapi, clean, dan tidak mudah kusut.",
    isi: "Menggunakan kombinasi cotton dan polyester yang memberikan tampilan lebih bersih serta membantu menjaga pakaian tetap rapi. Nyaman digunakan dengan karakter kain yang lebih terstruktur.",
    cocok: "Polo shirt dengan tampilan smart dan rapi.",
    kata: ["POLO ULTIMATE"],
  },
  {
    id: "cotton-spx-enzym",
    nama: "Polo Soft Tee",
    judul: "Lembut, adem, dan tetap berbentuk.",
    isi: "Dominasi serat cotton memberikan kenyamanan dan daya serap keringat yang baik. Kandungan elastan membuat kain fleksibel, sementara tekstur pique memberikan tampilan rapi dan premium.",
    cocok: "Polo casual maupun semi-formal (Polo Soft Tee).",
    kata: ["POLO SOFT TEE"],
  },
  {
    id: "franco",
    nama: "Franco",
    judul: "Adem, cepat kering, dan fleksibel.",
    isi: "Memiliki teknologi Quick Dry dan Cool Touch yang membantu menjaga tubuh tetap nyaman saat beraktivitas. Bahannya ringan, lentur, dan mengikuti gerakan tubuh tanpa terasa membatasi.",
    cocok: "Aktivitas aktif dan pakaian yang membutuhkan kenyamanan ekstra.",
    kata: ["FRANCO"],
  },
  {
    id: "bycel-prime-30s",
    nama: "Hoodie Bycell",
    judul: "Halus, adem, dan nyaman dipakai bolak-balik.",
    isi: "Dilengkapi teknologi Cool Touch dengan permukaan luar dan dalam yang memiliki tekstur serupa. Menyerap keringat dengan baik, tidak mudah melar, serta memiliki karakter kain yang halus dan lembut.",
    cocok: "Hoodie, jaket kaos, dan berbagai garment casual.",
    kata: ["HOODIE BYCELL"],
  },
  {
    id: "fleece-cvc-biowash",
    nama: "Hoodie Fleece CVC",
    judul: "Hangat, lembut, dan premium.",
    isi: "Bagian dalamnya memiliki bulu yang empuk dan halus, sementara proses Biowash membuat permukaan kain terlihat lebih bersih dan rapi. Nyaman, tidak mudah berbulu, dan memiliki penyusutan yang lebih terkontrol.",
    cocok: "Hoodie, sweater, dan jaket yang membutuhkan rasa hangat.",
    kata: ["HOODIE FLEECE CVC"],
  },
  {
    id: "katun-victory-abu",
    nama: "Victory Cotton",
    judul: "Adem, natural, dan terasa sejuk.",
    isi: "Berbahan cotton dengan teknologi Cool Breeze yang membantu melepaskan panas tubuh. Memiliki sirkulasi udara yang baik serta nyaman digunakan dalam cuaca panas.",
    cocok: "Pakaian casual dan aktivitas sehari-hari di iklim tropis.",
    kata: ["VICTORY COTTON"],
  },
  {
    id: "spandex-cm30",
    nama: "SPX Cotton",
    judul: "Stretch, adem, dan nyaman bergerak.",
    isi: "Perpaduan cotton dan spandex memberikan elastisitas tinggi sekaligus tetap lembut dan adem. Mengikuti gerakan tubuh tanpa mudah kehilangan bentuk.",
    cocok: "Pakaian yang membutuhkan fleksibilitas dan kenyamanan tinggi.",
    kata: ["SPX COTTON"],
  },
  {
    id: "giordano",
    nama: "Pastel",
    judul: "Super lembut dengan jatuh yang bagus.",
    isi: "Menggunakan struktur interlock double knit yang memberikan ketebalan pas, lembut, dan tidak mudah menerawang. Berbahan cotton yang adem dan nyaman digunakan sehari-hari.",
    cocok: "Kaos premium dengan feel lembut dan nyaman.",
    kata: ["PASTEL"],
  },
  {
    id: "rayon-spandex",
    nama: "Smart Fit Tee",
    judul: "Dingin, elastis, dan jatuh mewah.",
    isi: "Dominasi rayon memberikan sensasi dingin dan lembut di kulit, sementara spandex membuat kain sangat fleksibel. Memiliki permukaan halus dengan efek jatuh yang elegan.",
    cocok: "Smart fit tee dan pakaian dengan tampilan stylish.",
    kata: ["SMART FITTEE"],
  },
  {
    id: "parasut-ryu",
    nama: "Jaket Ryu Parasut",
    judul: "Ringan, praktis, dan cepat kering.",
    isi: "Memiliki karakter ringan dan mudah dilipat. Bahan nylon memberikan kekuatan yang baik serta cepat kering setelah terkena air.",
    cocok: "Jaket ringan dan pakaian outdoor.",
    kata: ["JAKET RYU PARASUT"],
  },
  {
    id: "katun-air",
    nama: "Katun Air",
    judul: "Tebal, halus, dan nyaman.",
    isi: "Memiliki karakter kain yang cukup tebal namun tetap terasa halus. Dilengkapi proses anti-bacterial untuk memberikan kenyamanan dalam penggunaan sehari-hari.",
    cocok: "Pakaian casual yang membutuhkan bahan lebih berisi.",
    kata: ["KATUN AIR"],
  },
  {
    id: "spandex-motif",
    nama: "Spandex Motif",
    judul: "Elastis dengan tampilan motif yang menarik.",
    isi: "Memiliki karakter lentur dan fleksibel sehingga nyaman mengikuti gerakan tubuh. Motif memberikan tampilan yang lebih unik dan stylish.",
    cocok: "Pakaian fashion dengan tampilan lebih ekspresif.",
    kata: ["HYPERMOVE", "MAXENO", "ELASTIC", "ZIQQI", "FRACTION", "ZENIT"],
  },
  {
    id: "emboss-topo",
    nama: "Jersey Embozz",
    judul: "Bertekstur, unik, dan tampil lebih premium.",
    isi: "Memiliki detail tekstur embozz yang memberikan karakter visual berbeda pada permukaan kain.",
    cocok: "Pakaian casual dengan tampilan eksklusif.",
    kata: ["JERSEY EMBOZZ"],
  },
  {
    id: "monochrome-abu-tua",
    nama: "Monochrome",
    judul: "Minimalis, modern, dan mudah dipadukan.",
    isi: "Warna abu tua memberikan kesan clean dan modern sehingga mudah dikombinasikan dengan berbagai gaya dan warna lainnya.",
    cocok: "Outfit casual hingga smart casual.",
    kata: ["MONOCROM"],
  },
];
