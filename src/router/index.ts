import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import api from "@/services/api";

// --- CORE & AUTH ---
const LoginView = () => import("../views/user/LoginView.vue");
const HomeView = () => import("../views/home/HomeView.vue");
const DaftarIndex = () => import("@/views/home/DaftarIndex.vue");
const TransaksiIndex = () => import("@/views/home/TransaksiIndex.vue");
const PiutangIndex = () => import("@/views/home/PiutangIndex.vue");
const TransaksiSectionIndex = () => import("@/views/home/TransaksiSectionIndex.vue");
const LaporanIndex = () => import("@/views/home/LaporanIndex.vue");
const LaporanSectionIndex = () => import("@/views/home/LaporanSectionIndex.vue");
const DcIndex = () => import("@/views/home/DcIndex.vue");
const DcSectionIndex = () => import("@/views/home/DcSectionIndex.vue");

// --- SYSTEM & USER ---
const NotFoundView = () => import("@/views/file/NotFoundView.vue");
const UnauthorizedView = () => import("@/views/file/UnauthorizedView.vue");
const ManualProgramView = () => import("../views/file/ManualProgramView.vue");
const HistoryUpdateView = () => import("../views/user/HistoryUpdateView.vue");
const VersionCheckView = () => import("../views/user/VersionCheckView.vue");
const UpdateBufferStockView = () => import("../views/file/UpdateBufferStockView.vue");
const SettingsProcessView = () => import("../views/file/SettingsProcessView.vue");
const UserManagementView = () => import("../views/file/UserManagementView.vue");
const ChangePasswordView = () => import("../views/user/ChangePasswordView.vue");
const WhatsappLinkView = () => import("@/views/user/WhatsappLinkView.vue");

// --- MASTER DATA ---
const CustomerView = () => import("@/views/daftar/CustomerView.vue");
const MemberView = () => import("@/views/daftar/MemberView.vue");
const SupplierView = () => import("@/views/daftar/SupplierView.vue");
const SalesCounterView = () => import("@/views/daftar/SalesCounterView.vue");
const BarcodePrintView = () => import("@/views/daftar/BarcodePrintView.vue");
const BarcodeCreateView = () => import("../views/daftar/BarcodeCreateView.vue");

// --- PENJUALAN & INVOICE ---
const InvoiceView = () => import("@/views/transaksi/penjualan/InvoiceView.vue");
const InvoiceCreateView = () => import("@/views/transaksi/penjualan/InvoiceCreateView.vue");
const InvoicePrintView = () => import("@/views/transaksi/penjualan/InvoicePrintView.vue");
const InvoicePrintKasirView = () => import("@/views/transaksi/penjualan/InvoicePrintKasirView.vue");
const InvoicePrintImageView = () => import("@/views/transaksi/penjualan/InvoicePrintImageView.vue");
const InvoiceAsSjPrintView = () => import("@/views/transaksi/penjualan/InvoiceAsSjPrintView.vue");
const OfferView = () => import("@/views/transaksi/penjualan/OfferView.vue");
const OfferCreateView = () => import("@/views/transaksi/penjualan/OfferCreateView.vue");
const OfferPrintView = () => import("@/views/transaksi/penjualan/OfferPrintView.vue");
const SoView = () => import("@/views/transaksi/penjualan/SoView.vue");
const SoCreateView = () => import("@/views/transaksi/penjualan/SoCreateView.vue");
const SoPrintView = () => import("@/views/transaksi/penjualan/SoPrintView.vue");
const DpPrintView = () => import("@/views/transaksi/penjualan/DpPrintView.vue");
const ProformaView = () => import("@/views/transaksi/penjualan/ProformaView.vue");
const ProformaCreateView = () => import("@/views/transaksi/penjualan/ProformaCreateView.vue");
const ProformaPrintView = () => import("@/views/transaksi/penjualan/ProformaPrintView.vue");

const TrackingHomeView = () => import("@/views/umum/TrackingHomeView.vue");

// --- DTF & PESANAN ---
const SoDtfTrialView = () => import("@/views/transaksi/penjualan/dtf/SoDtfTrialView.vue");
const SoDtfTrialCreateView = () =>
  import("@/views/transaksi/penjualan/dtf/SoDtfTrialCreateView.vue");
const SoDtfTrialPrintView = () => import("@/views/transaksi/penjualan/dtf/SoDtfTrialPrintView.vue");
const SoDtfView = () => import("@/views/transaksi/penjualan/dtf/SoDtfView.vue");
const SoDtfCreateView = () => import("@/views/transaksi/penjualan/dtf/SoDtfCreateView.vue");
const SoDtfPrintView = () => import("@/views/transaksi/penjualan/dtf/SoDtfPrintView.vue");
const LhkSoDtfView = () => import("@/views/transaksi/penjualan/dtf/LhkSoDtfView.vue");
const LhkSoDtfCreateView = () => import("@/views/transaksi/penjualan/dtf/LhkSoDtfCreateView.vue");
const DasborDtfView = () => import("@/views/transaksi/penjualan/dtf/DasborDtfView.vue");
const DasborBordirView = () => import("@/views/transaksi/penjualan/dtf/DasborBordirView.vue");
const SoDtfStokView = () => import("@/views/transaksi/penjualan/dtf/SoDtfStokView.vue");
const SoDtfStokCreateView = () => import("@/views/transaksi/penjualan/dtf/SoDtfStokCreateView.vue");
const SoDtfStokPrintView = () => import("@/views/transaksi/penjualan/dtf/SoDtfStokPrintView.vue");
const LhkSoDtfStokView = () => import("@/views/transaksi/penjualan/dtf/LhkSoDtfStokView.vue");
const LhkSoDtfStokCreateView = () =>
  import("@/views/transaksi/penjualan/dtf/LhkSoDtfStokCreateView.vue");
const DtfMachineLogView = () => import("@/views/transaksi/penjualan/dtf/DtfMachineLogView.vue");

// --- MUTASI & INTERNAL ---
const MutasiOutView = () => import("@/views/transaksi/mutasi/MutasiOutView.vue");
const MutasiOutCreateView = () => import("@/views/transaksi/mutasi/MutasiOutCreateView.vue");
const MutasiOutPrintView = () => import("@/views/transaksi/mutasi/MutasiOutPrintView.vue");
const MutasiInView = () => import("@/views/transaksi/mutasi/MutasiInView.vue");
const MutasiInCreateView = () => import("@/views/transaksi/mutasi/MutasiInCreateView.vue");
const MutasiInPrintView = () => import("@/views/transaksi/mutasi/MutasiInPrintView.vue");
const MutasiStokView = () => import("@/views/transaksi/mutasi/MutasiStokView.vue");
const MutasiStokCreateView = () => import("@/views/transaksi/mutasi/MutasiStokCreateView.vue");
const MutasiStokPrintView = () => import("@/views/transaksi/mutasi/MutasiStokPrintView.vue");
const MintaBarangView = () => import("@/views/transaksi/internal/MintaBarangView.vue");
const MintaBarangCreateView = () => import("@/views/transaksi/internal/MintaBarangCreateView.vue");
const TerimaSjView = () => import("@/views/transaksi/internal/TerimaSJView.vue");
const TerimaSjFormView = () => import("@/views/transaksi/internal/TerimaSJFormView.vue");

// --- WORKSHOP ---
const MutasiWorkshopView = () => import("@/views/operasional/workshop/MutasiWorkshopView.vue");
const MutasiWorkshopCreateView = () =>
  import("@/views/operasional/workshop/MutasiWorkshopCreateView.vue");
const MutasiWorkshopPrintView = () =>
  import("@/views/operasional/workshop/MutasiWorkshopPrintView.vue");
const TerimaMutasiWorkshopView = () =>
  import("@/views/operasional/workshop/TerimaMutasiWorkshopView.vue");
// const TerimaMutasiWorkshopCreateView = () =>
//   import("@/views/operasional/workshop/TerimaMutasiWorkshopCreateView.vue");

// --- PIUTANG & FINANCE ---
const SetoranBayarView = () => import("@/views/piutang/SetoranBayarView.vue");
const SetoranBayarCreateView = () => import("@/views/piutang/SetoranBayarCreateView.vue");
const FskView = () => import("@/views/piutang/FskView.vue");
const FskCreateView = () => import("@/views/piutang/FskCreateView.vue");
const FskPrintView = () => import("@/views/piutang/FskPrintView.vue");
const KartuPiutangView = () => import("@/views/piutang/KartuPiutangView.vue");
const PotonganView = () => import("@/views/piutang/PotonganView.vue");
const PotonganCreateView = () => import("@/views/piutang/PotonganCreateView.vue");
const RefundView = () => import("@/views/piutang/RefundView.vue");
const RefundCreateView = () => import("@/views/piutang/RefundCreateView.vue");
const RefundPrintView = () => import("@/views/piutang/RefundPrintView.vue");
const KlaimPettyCashView = () => import("@/views/piutang/KlaimPettyCashView.vue");
const KlaimPettyCashProsesView = () => import("@/views/piutang/KlaimPettyCashProsesView.vue");
const KlaimPettyCashPrintView = () => import("@/views/piutang/KlaimPettyCashPrintView.vue");

// --- LAPORAN ---
const LaporanStokView = () => import("@/views/laporan/stok/LaporanStokView.vue");
const LaporanMutasiStokView = () => import("@/views/laporan/stok/LaporanMutasiStokView.vue");
const LaporanKartuStokView = () => import("@/views/laporan/stok/LaporanKartuStokView.vue");
const LaporanInvoiceView = () => import("@/views/laporan/penjualan/LaporanInvoiceView.vue");
const LaporanSalesVsTargetView = () =>
  import("@/views/laporan/penjualan/LaporanSalesVsTargetView.vue");
const LaporanStokPivotView = () => import("@/views/laporan/analisa/LaporanStokPivotView.vue");
const LaporanStokGrafikView = () => import("@/views/laporan/analisa/LaporanStokGrafikView.vue");
const AuditLogView = () => import("@/views/admin/AuditLogView.vue");

// --- DC OPERASIONAL ---
const PackingListView = () => import("@/views/dc/operasional/PackingListView.vue");
const PackingListCreateView = () => import("@/views/dc/operasional/PackingListCreateView.vue");
const PackingListPrintView = () => import("@/views/dc/operasional/PackingListPrintView.vue");
const SuratJalanView = () => import("@/views/dc/operasional/SuratJalanView.vue");
const SuratJalanCreateView = () => import("@/views/dc/operasional/SuratJalanCreateView.vue");
const SuratJalanPrintView = () => import("@/views/dc/operasional/SuratJalanPrintView.vue");

// --- STOK OPNAME ---
const HitungStokView = () => import("@/views/transaksi/stok-opname/HitungStokView.vue");
const HitungStokCreateView = () => import("@/views/transaksi/stok-opname/HitungStokCreateView.vue");

// --- PENJUALAN & HARGA ---
const PriceProposalView = () => import("@/views/transaksi/penjualan/PriceProposalView.vue");
const PriceProposalCreateView = () =>
  import("@/views/transaksi/penjualan/PriceProposalCreateView.vue");
const SettingHargaView = () => import("@/views/transaksi/penjualan/SettingHargaView.vue");
const PelunasanInvoiceView = () => import("@/views/transaksi/penjualan/PelunasanInvoiceView.vue");
const PelunasanInvoiceCreateView = () =>
  import("@/views/transaksi/penjualan/PelunasanInvoiceCreateView.vue");
const PesananOnlineView = () => import("@/views/transaksi/penjualan/PesananOnlineView.vue");
const PesananOnlineCreateView = () =>
  import("@/views/transaksi/penjualan/PesananOnlineCreateView.vue");

// --- INTERNAL & STOK ---
const BufferStokView = () => import("@/views/transaksi/internal/BufferStokView.vue");
const KoreksiStokView = () => import("@/views/transaksi/internal/KoreksiStokView.vue");
const KoreksiStokCreateView = () => import("@/views/transaksi/internal/KoreksiStokCreateView.vue");
const KoreksiStokPrintView = () => import("@/views/transaksi/internal/KoreksiStokPrintView.vue");
const ReturDcView = () => import("@/views/transaksi/internal/ReturDcView.vue");
const ReturDcCreateView = () => import("@/views/transaksi/internal/ReturDcCreateView.vue");
const ReturDcPrintView = () => import("@/views/transaksi/internal/ReturDcPrintView.vue");
const PengajuanBarcodeView = () => import("@/views/transaksi/internal/PengajuanBarcodeView.vue");
const PengajuanBarcodeCreateView = () =>
  import("@/views/transaksi/internal/PengajuanBarcodeCreateView.vue");
const PengajuanBarcodePrintView = () =>
  import("@/views/transaksi/internal/PengajuanBarcodePrintView.vue");
const CetakBarcodeBaruView = () => import("@/views/transaksi/penjualan/CetakBarcodeBaruView.vue");
const KlerekView = () => import("@/views/transaksi/internal/KlerekView.vue");
const PeminjamanBarangView = () => import("@/views/transaksi/internal/PeminjamanBarangView.vue");
const PeminjamanBarangCreateView = () =>
  import("@/views/transaksi/internal/PeminjamanBarangCreateView.vue");
const PeminjamanBarangPrintView = () =>
  import("@/views/transaksi/internal/PeminjamanBarangPrintView.vue");
const PeminjamanBarangReturnView = () =>
  import("@/views/transaksi/internal/PeminjamanBarangReturnView.vue");
const PettyCashView = () => import("@/views/transaksi/internal/PettyCashView.vue");
const PettyCashCreateView = () => import("@/views/transaksi/internal/PettyCashCreateView.vue");
const PettyCashPengajuanView = () =>
  import("@/views/transaksi/internal/PettyCashPengajuanView.vue");

// --- MUTASI STORE ---
const MutasiStoreKirimView = () => import("@/views/transaksi/mutasi/MutasiStoreKirimView.vue");
const MutasiStoreKirimCreateView = () =>
  import("@/views/transaksi/mutasi/MutasiStoreKirimCreateView.vue");
const MutasiStoreKirimPrintView = () =>
  import("@/views/transaksi/mutasi/MutasiStoreKirimPrintView.vue");
const MutasiStoreTerimaView = () => import("@/views/transaksi/mutasi/MutasiStoreTerimaView.vue");
const MutasiStoreTerimaCreateView = () =>
  import("@/views/transaksi/mutasi/MutasiStoreTerimaCreateView.vue");

// --- RETUR JUAL ---
const ReturJualView = () => import("@/views/transaksi/penjualan/ReturJualView.vue");
const ReturJualCreateView = () => import("@/views/transaksi/penjualan/ReturJualCreateView.vue");
const ReturJualPrintView = () => import("@/views/transaksi/penjualan/ReturJualPrintView.vue");
const ReturJualPrintKasirView = () =>
  import("@/views/transaksi/penjualan/ReturJualPrintKasirView.vue");

// --- KOMPLAIN CUSTOMER ---
const KomplainCustomerView = () => import("@/views/transaksi/penjualan/KomplainCustomerView.vue");
const KomplainCustomerCreateView = () =>
  import("@/views/transaksi/penjualan/KomplainCustomerCreateView.vue");
const KomplainCustomerPrintView = () =>
  import("@/views/transaksi/penjualan/KomplainCustomerPrintView.vue");

// --- DC & PRODUKSI ---
const QckeGarmenView = () => import("@/views/dc/operasional/QckeGarmenView.vue");
const QckeGarmenCreateView = () => import("@/views/dc/operasional/QckeGarmenCreateView.vue");
const QckeGarmenPrintView = () => import("@/views/dc/operasional/QckeGarmenPrintView.vue");
const TerimaReturView = () => import("@/views/dc/operasional/TerimaReturView.vue");
const TerimaReturCreateView = () => import("@/views/dc/operasional/TerimaReturCreateView.vue");
const JenisKainView = () => import("@/views/dc/master-data/JenisKainView.vue");
const WarnaKainView = () => import("@/views/dc/master-data/WarnaKainView.vue");
const LenganView = () => import("@/views/dc/master-data/LenganView.vue");
const BarangDcView = () => import("@/views/dc/master-data/BarangDcView.vue");
const BarangDcCreateView = () => import("@/views/dc/master-data/BarangDcCreateView.vue");
const PriceListView = () => import("@/views/dc/master-data/PriceListView.vue");
const PromoView = () => import("@/views/dc/master-data/PromoView.vue");
const PromoCreateView = () => import("@/views/dc/master-data/PromoCreateView.vue");
const TerimaStbjView = () => import("@/views/dc/operasional/TerimaStbjView.vue");
const TerimaStbjCreateView = () => import("@/views/dc/operasional/TerimaStbjCreateView.vue");
const TolakStbjCreateView = () => import("@/views/dc/operasional/TolakStbjCreateView.vue");
const TerimaRepairView = () => import("@/views/dc/operasional/TerimaRepairView.vue");
const TerimaRepairCreateView = () => import("@/views/dc/operasional/TerimaRepairCreateView.vue");
const AmbilBarangView = () => import("@/views/dc/operasional/AmbilBarangView.vue");
const AmbilBarangCreateView = () => import("@/views/dc/operasional/AmbilBarangCreateView.vue");
const MutasiAntarGudangView = () => import("@/views/dc/operasional/MutasiAntarGudangView.vue");
const MutasiAntarGudangCreateView = () =>
  import("@/views/dc/operasional/MutasiAntarGudangCreateView.vue");
const MutasiAntarGudangPrintView = () =>
  import("@/views/dc/operasional/MutasiAntarGudangPrintView.vue");
const PengajuanProduksiView = () =>
  import("@/views/dc/produksi-supplier/PengajuanProduksiView.vue");
const PengajuanProduksiCreateView = () =>
  import("@/views/dc/produksi-supplier/PengajuanProduksiCreateView.vue");
const PengajuanProduksiPrintView = () =>
  import("@/views/dc/produksi-supplier/PengajuanProduksiPrintView.vue");
const ApprovePengajuanProduksiView = () =>
  import("@/views/dc/produksi-supplier/ApprovePengajuanProduksiView.vue");
const ApprovePengajuanProduksiCreateView = () =>
  import("@/views/dc/produksi-supplier/ApprovePengajuanProduksiCreateView.vue");
const BarangExternalView = () => import("@/views/dc/master-data/BarangExternalView.vue");
const BarangExternalCreateView = () =>
  import("@/views/dc/master-data/BarangExternalCreateView.vue");
const PoKaosanView = () => import("@/views/dc/produksi-supplier/PoKaosanView.vue");
const PoKaosanCreateView = () => import("@/views/dc/produksi-supplier/PoKaosanCreateView.vue");
const PoKaosanPrintView = () => import("@/views/dc/produksi-supplier/PoKaosanPrintView.vue");
const BpbKaosanView = () => import("@/views/dc/produksi-supplier/BpbKaosanView.vue");
const BpbKaosanCreateView = () => import("@/views/dc/produksi-supplier/BpbKaosanCreateView.vue");
const BpbKaosanPrintView = () => import("@/views/dc/produksi-supplier/BpbKaosanPrintView.vue");
const MintaAccesoriesView = () => import("@/views/dc/operasional/MintaAccesoriesView.vue");
const MintaAccesoriesCreateView = () =>
  import("@/views/dc/operasional/MintaAccesoriesCreateView.vue");
const MintaAccesoriesPrintView = () =>
  import("@/views/dc/operasional/MintaAccesoriesPrintView.vue");

// --- LAPORAN & SO ---
const LaporanListOtorisasiView = () =>
  import("@/views/laporan/lain-lain/LaporanListOtorisasiView.vue");
const LaporanPettyCashView = () => import("@/views/laporan/lain-lain/PettyCashReportView.vue");
const LaporanStokStagnanView = () => import("@/views/laporan/stok/LaporanStokStagnanView.vue");
const LaporanDeadStokView = () => import("@/views/laporan/stok/LaporanDeadStokView.vue");
const LaporanSaldoKasirView = () => import("@/views/laporan/lain-lain/LaporanSaldoKasirView.vue");
const LaporanPenjualanPivotView = () =>
  import("@/views/laporan/analisa/LaporanPenjualanPivotView.vue");
const LaporanPenjualanGrafikView = () =>
  import("@/views/laporan/analisa/LaporanPenjualanGrafikView.vue");
const MonitoringAchievementView = () =>
  import("@/views/laporan/penjualan/MonitoringAchievementView.vue");
const LaporanHppKosongView = () => import("@/views/transaksi/stok-opname/LaporanHppKosongView.vue");
const LaporanStokMinusView = () => import("@/views/laporan/stok/LaporanStokMinusView.vue");
const ParetoView = () => import("@/views/laporan/penjualan/ParetoView.vue");
const ParetoPrintView = () => import("@/views/laporan/penjualan/ParetoPrintView.vue");

// --- STOK OPNAME ---
const StokOpnameSettingTanggalView = () =>
  import("@/views/transaksi/stok-opname/StokOpnameSettingTanggalView.vue");
const LokasiOpnameView = () => import("@/views/transaksi/stok-opname/LokasiOpnameView.vue");
const HitungStokLokasiView = () => import("@/views/transaksi/stok-opname/HitungStokLokasiView.vue");
const HitungStokOperatorView = () =>
  import("@/views/transaksi/stok-opname/HitungStokOperatorView.vue");
const CekSelisihView = () => import("@/views/transaksi/stok-opname/CekSelisihView.vue");
const ProsesStokOpnameView = () => import("@/views/transaksi/stok-opname/ProsesStokOpnameView.vue");
const ProsesStokOpnameCreateView = () =>
  import("@/views/transaksi/stok-opname/ProsesStokOpnameCreateView.vue");

// --- PRINT KHUSUS ---
const KuponPrintView = () => import("@/views/transaksi/penjualan/KuponPrintView.vue");
const VoucherPrintView = () => import("@/views/transaksi/penjualan/VoucherPrintView.vue");

// --- PRIORITAS ---
const BiayaKirimView = () => import("@/views/transaksi/penjualan/BiayaKirimView.vue");
const BiayaKirimCreateView = () => import("@/views/transaksi/penjualan/BiayaKirimCreateView.vue");
const BiayaKirimPrintView = () => import("@/views/transaksi/penjualan/BiayaKirimPrintView.vue");

const isTrackingMode = import.meta.env.VITE_APP_MODE === "TRACKING";

const routes = [
  {
    path: "/login",
    name: "Login",
    component: LoginView,
    meta: {
      title: "Login",
      layout: "AuthLayout",
    },
  },
  {
    path: "/",
    name: "Home",
    component: isTrackingMode ? TrackingHomeView : HomeView,
    meta: {
      title: isTrackingMode ? "Lacak Pesanan" : "Beranda",
      layout: "DefaultLayout",
      requiresAuth: false,
      public: true,
    },
  },
  {
    path: "/unauthorized",
    name: "Unauthorized",
    component: UnauthorizedView,
    meta: {
      requiresAuth: true,
    },
  },

  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: NotFoundView,
  },
  {
    path: "/tracking",
    name: "Tracking Beranda",
    component: TrackingHomeView,
    meta: {
      title: "Lacak Pesanan",
      layout: "PrintLayout", // Pakai PrintLayout agar bersih tanpa sidebar/header admin
      requiresAuth: false, // <-- PENTING: Bebas akses untuk pelanggan
      public: true,
    },
  },
  {
    path: "/file/manual",
    name: "Manual Program",
    component: ManualProgramView,
    meta: {
      title: "Petunjuk Penggunaan",
      requiresAuth: true,
      public: true,
    },
  },
  {
    path: "/file/history-updates",
    name: "Riwayat Update",
    component: HistoryUpdateView,
    meta: {
      title: "Riwayat Update",
      requiresAuth: true,
      public: true,
    },
  },
  {
    path: "/user/update-program",
    name: "Cek Versi",
    component: VersionCheckView,
    meta: {
      title: "Cek Versi",
      requiresAuth: true,
      public: true,
    },
  },
  {
    path: "/file/update-buffer-stock",
    name: "Update Buffer Stok",
    component: UpdateBufferStockView,
    meta: {
      title: "Update Buffer Stok",
      requiresAuth: true,
      public: true,
    },
  },
  {
    path: "/file/settings",
    name: "frmPengaturan",
    component: SettingsProcessView,
    meta: {
      title: "Setting",
      requiresAuth: true,
      menuId: "3",
    },
  },
  {
    path: "/file/users",
    name: "frmUser",
    component: UserManagementView,
    meta: {
      title: "Master User",
      requiresAuth: true,
      menuId: "1",
    },
  },
  {
    path: "/user/ganti-password",
    name: "Ganti Password",
    component: ChangePasswordView,
    meta: {
      title: "Ganti Password",
      requiresAuth: true,
      public: true,
    },
  },
  {
    path: "/daftar",
    name: "DaftarIndex",
    component: DaftarIndex,
    meta: {
      title: "Menu Master Data",
      requiresAuth: true,
      // menuId tidak diperlukan di sini karena ini adalah halaman navigasi
    },
  },
  {
    path: "/transaksi",
    name: "Transaksi",
    component: TransaksiIndex,
    meta: {
      title: "Menu Transaksi",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/:section", // Halaman dinamis untuk setiap seksi
    name: "TransaksiSection",
    component: TransaksiSectionIndex,
    meta: { title: "Section Transaksi", requiresAuth: true }, // Judul akan diatur di dalam komponen
  },
  {
    path: "/piutang",
    name: "Piutang",
    component: PiutangIndex,
    meta: {
      title: "Menu Piutang",
      requiresAuth: true,
    },
  },
  {
    path: "/Laporan",
    name: "Laporan",
    component: LaporanIndex,
    meta: {
      title: "Menu Laporan",
      requiresAuth: true,
    },
  },
  {
    path: "/laporan/:section", // Halaman dinamis untuk setiap seksi
    name: "LaporanSection",
    component: LaporanSectionIndex,
    meta: { title: "Section Laporan", requiresAuth: true }, // Judul akan diatur di dalam komponen
  },
  {
    path: "/gudang-dc",
    name: "Gudang DC",
    component: DcIndex,
    meta: {
      title: "Menu Gudang DC",
      requiresAuth: true,
    },
  },
  {
    path: "/gudang-dc/:section", // Halaman dinamis untuk setiap seksi
    name: "DcSection",
    component: DcSectionIndex,
    meta: { title: "Section Gudang DC", requiresAuth: true }, // Judul akan diatur di dalam komponen
  },
  {
    path: "/daftar/customers",
    name: "frmBrowCus",
    component: CustomerView,
    meta: {
      requiresAuth: true,
      title: "Master Customer",
      menuId: "9",
    },
  },
  {
    path: "/daftar/members",
    name: "frmBrowMember",
    component: MemberView,
    meta: {
      requiresAuth: true,
      title: "Master Member",
      menuId: "7",
    },
  },
  {
    path: "/daftar/suppliers",
    name: "frmBrowSupplier",
    component: SupplierView,
    meta: {
      requiresAuth: true,
      title: "Master Supplier",
      menuId: "8",
    },
  },
  {
    path: "/daftar/sales-counters",
    name: "frmBrowSC",
    component: SalesCounterView,
    meta: {
      requiresAuth: true,
      title: "Master Sales Counter",
      menuId: "10",
    },
  },
  {
    path: "/daftar/cetak-barcode",
    name: "frmBrowBcd",
    component: BarcodePrintView,
    meta: {
      requiresAuth: true,
      title: "Cetak Barcode",
      menuId: "11",
    },
  },
  {
    path: "/daftar/cetak-barcode/edit/:nomor",
    name: "Ubah Barcode",
    component: BarcodeCreateView, // Menggunakan komponen yang sama dengan form Baru
    meta: {
      title: "Ubah Barcode",
      requiresAuth: true,
    },
  },
  {
    path: "/daftar/cetak-barcode/new", // Rute untuk form baru
    name: "Buat Barcode",
    component: BarcodeCreateView,
    meta: {
      title: "Buat Barcode",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/penawaran",
    name: "frmBrowPenawaran",
    component: OfferView,
    meta: {
      requiresAuth: true,
      title: "Penawaran",
      menuId: "42",
    },
  },
  {
    path: "/transaksi/penjualan/penawaran/new", // Rute untuk form baru
    name: "Buat Penawaran",
    component: OfferCreateView,
    meta: {
      title: "Buat Penawaran",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/penawaran/ubah/:nomor", // Halaman ubah
    name: "Ubah Penawaran",
    component: OfferCreateView,
    meta: {
      title: "Ubah Penawaran",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/penawaran/print/:nomor",
    name: "Cetak Penawaran",
    component: OfferPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/pengajuan/pengajuan-harga",
    name: "frmBrowPengajuanHarga",
    component: PriceProposalView,
    meta: {
      title: "Pengajuan Harga",
      requiresAuth: true,
      menuId: "38",
    },
  },
  {
    path: "/transaksi/penjualan/pengajuan/pengajuan-harga/new",
    name: "Buat Pengajuan Harga",
    component: PriceProposalCreateView,
    meta: {
      title: "Buat Pengajuan Harga",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/pengajuan/pengajuan-harga/ubah/:nomor",
    name: "Ubah Pengajuan Harga",
    component: PriceProposalCreateView,
    meta: {
      title: "Ubah Pengajuan Harga",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/pengajuan/setting-harga",
    name: "frmBrowSettingHarga",
    component: SettingHargaView,
    meta: {
      title: "Setting Harga",
      requiresAuth: true,
      menuId: "39",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-trial",
    name: "frmBrowSODTFTrial",
    component: SoDtfTrialView,
    meta: {
      title: "SO DTF Trial Pesanan",
      requiresAuth: true,
      menuId: "61",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-trial/new",
    name: "Buat SO DTF Trial Pesanan",
    component: SoDtfTrialCreateView,
    meta: {
      title: "Buat SO DTF Trial Pesanan",
      requiresAuth: true,
      menuId: "61",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-trial/ubah/:nomor",
    name: "Ubah SO DTF Trial Pesanan",
    component: SoDtfTrialCreateView,
    meta: {
      title: "Ubah SO DTF Trial Pesanan",
      requiresAuth: true,
      menuId: "61",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-trial/print/:nomor",
    name: "Cetak SO DTF Trial",
    component: SoDtfTrialPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf",
    name: "frmBrowSODTF",
    component: SoDtfView,
    meta: {
      title: "SO DTF Pesanan",
      requiresAuth: true,
      menuId: "35",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf/new",
    name: "Buat SO DTF Pesanan",
    component: SoDtfCreateView,
    meta: {
      title: "Buat SO DTF Pesanan",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf/ubah/:nomor",
    name: "Ubah SO DTF Pesanan",
    component: SoDtfCreateView,
    meta: {
      title: "Ubah SO DTF Pesanan",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf/print/:nomor",
    name: "Cetak SO DTF",
    component: SoDtfPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/lhk-so-dtf",
    name: "frmBrowDTF",
    component: LhkSoDtfView,
    meta: {
      title: "LHK Jasa",
      requiresAuth: true,
      menuId: "41",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/lhk-so-dtf/edit",
    name: "LhkSoDtfCreate",
    component: LhkSoDtfCreateView,
    meta: {
      title: "Form LHK Jasa",
      requiresAuth: true,
      menuId: "41",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/log-mesin",
    name: "LogMesinDtf",
    component: DtfMachineLogView,
    meta: {
      title: "Log Mesin DTF",
      requiresAuth: true,
      menuId: "62",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/dasbor-dtf",
    name: "frmLapDasborDtf",
    component: DasborDtfView,
    meta: {
      title: "Dasbor DTF",
      requiresAuth: true,
      menuId: "40",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/dasbor-bordir",
    name: "dasborBordir",
    component: DasborBordirView,
    meta: {
      title: "Dasbor Bordir",
      requiresAuth: true,
      menuId: "57",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-stok",
    name: "SoDtfStok",
    component: SoDtfStokView,
    meta: {
      title: "SO DTF Stok",
      requiresAuth: true,
      menuId: "36",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-stok/new",
    name: "SoDtfStokCreate",
    component: SoDtfStokCreateView,
    meta: {
      title: "Buat SO DTF Stok",
      requiresAuth: true,
      menuId: "36",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-stok/ubah/:nomor",
    name: "SoDtfStokEdit",
    component: SoDtfStokCreateView,
    meta: {
      title: "Ubah SO DTF Stok",
      requiresAuth: true,
      menuId: "36",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/so-dtf-stok/print/:nomor",
    name: "Cetak SO DTF Stok",
    component: SoDtfStokPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/lhk-so-dtf-stok",
    name: "LhkSoDtfStok",
    component: LhkSoDtfStokView,
    meta: {
      title: "LHK SO DTF Stok",
      requiresAuth: true,
      menuId: "48",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/lhk-so-dtf-stok/new",
    name: "LhkSoDtfStokCreate",
    component: LhkSoDtfStokCreateView,
    meta: {
      title: "Buat LHK SO DTF Stok",
      requiresAuth: true,
      menuId: "48",
    },
  },
  {
    path: "/transaksi/penjualan/dtf/lhk-so-dtf-stok/ubah/:nomor",
    name: "LhkSoDtfStokEdit",
    component: LhkSoDtfStokCreateView,
    meta: {
      title: "Ubah LHK SO DTF Stok",
      requiresAuth: true,
      menuId: "48",
    },
  },
  {
    path: "/transaksi/penjualan/surat-pesanan",
    name: "frmBrowseSo",
    component: SoView,
    meta: {
      title: "Surat Pesanan",
      requiresAuth: true,
      menuId: "26",
    },
  },
  {
    path: "/transaksi/penjualan/surat-pesanan/print/:nomor",
    name: "Cetak Surat Pesanan",
    component: SoPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/surat-pesanan/new",
    name: "SuratPesananCreate",
    component: SoCreateView,
    meta: {
      title: "Buat Surat Pesanan",
      requiresAuth: true,
      menuId: "26",
    },
  },
  {
    path: "/transaksi/penjualan/surat-pesanan/ubah/:nomor",
    name: "SuratPesananEdit",
    component: SoCreateView,
    meta: {
      title: "Ubah Surat Pesanan",
      requiresAuth: true,
      menuId: "26",
    },
  },
  {
    path: "/transaksi/penjualan/surat-pesanan/track/:nomor",
    name: "Lacak Surat Pesanan",
    component: () => import("@/views/transaksi/penjualan/SoTrackingView.vue"), // File baru yang akan kita buat
    meta: {
      title: "Tracking Pesanan",
      requiresAuth: false, // Bebas akses untuk pelanggan
      printLayout: true, // Pakai printLayout agar bersih tanpa sidebar/header utama
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/surat-pesanan/print-dp/:nomor",
    name: "Cetak DP",
    component: DpPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/proforma",
    name: "Proforma",
    component: ProformaView,
    meta: {
      title: "Proforma Invoice",
      requiresAuth: true, // Asumsi perlu login
      menuId: "28",
    },
  },
  {
    path: "/transaksi/penjualan/proforma/create",
    name: "ProformaCreate",
    component: ProformaCreateView,
    meta: { title: "Buat Proforma Invoice", requiresAuth: true, menuId: "28" },
  },
  {
    path: "/transaksi/penjualan/proforma/edit/:id",
    name: "ProformaEdit",
    component: ProformaCreateView, // Menggunakan komponen yang sama
    meta: { title: "Ubah Proforma Invoice", requiresAuth: true, menuId: "28" },
  },
  {
    path: "/transaksi/penjualan/proforma/print/:nomor",
    name: "ProformaPrint",
    component: ProformaPrintView,
    meta: {
      title: "Cetak Proforma Invoice",
      requiresAuth: true,
      menuId: "28",
      layout: "PrintLayout",
      printLayout: true,
    },
  },
  {
    path: "/transaksi/internal/buffer-stok",
    name: "BufferStok",
    component: BufferStokView,
    meta: {
      title: "Buffer Stok",
      requiresAuth: true,
    },
  },
  {
    path: "/transaksi/internal/peminjaman-barang",
    name: "PeminjamanBarang",
    component: PeminjamanBarangView,
    meta: {
      title: "Peminjaman Barang",
      requiresAuth: true,
      menuId: "56",
    },
  },
  {
    path: "/transaksi/internal/peminjaman-barang/create",
    name: "PeminjamanBarangCreate",
    component: PeminjamanBarangCreateView,
    meta: {
      title: "Buat Peminjaman Barang",
      requiresAuth: true,
      menuId: "56",
    },
  },
  {
    path: "/transaksi/internal/peminjaman-barang/edit/:id",
    name: "PeminjamanBarangEdit",
    component: PeminjamanBarangCreateView,
    meta: {
      title: "Ubah Peminjaman Barang",
      requiresAuth: true,
      menuId: "56",
    },
  },
  {
    path: "/transaksi/internal/peminjaman-barang/print/:nomor",
    name: "PeminjamanBarangPrint",
    component: PeminjamanBarangPrintView,
    meta: {
      title: "Cetak Peminjaman Barang",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/peminjaman-barang/return/:nomor",
    name: "Pengembalian Barang",
    component: PeminjamanBarangReturnView,
    meta: { requiresAuth: true, menuId: "56" },
  },
  {
    path: "/transaksi/internal/petty-cash",
    name: "Petty Cash Store",
    component: PettyCashView,
    meta: { requiresAuth: true, menuId: "58" },
  },
  {
    path: "/transaksi/internal/petty-cash/create",
    name: "PettyCashCreate",
    component: PettyCashCreateView,
    meta: {
      title: "Input Petty Cash",
      requiresAuth: true,
      menuId: "58", // Samakan menuId dengan halaman browse
    },
  },
  {
    path: "/transaksi/internal/petty-cash/edit/:nomor",
    name: "PettyCashEdit",
    component: PettyCashCreateView,
    meta: {
      title: "Ubah Petty Cash",
      requiresAuth: true,
      menuId: "58",
    },
  },
  {
    path: "/petty-cash/pengajuan",
    name: "PettyCashPengajuan",
    component: PettyCashPengajuanView,
    meta: {
      title: "Pengajuan Klaim PC",
      requiresAuth: true,
      menuId: "58", // Samakan dengan menu Store
    },
  },
  {
    path: "/transaksi/mutasi/out-produksi",
    name: "frmBrowMutasiOut",
    component: MutasiOutView,
    meta: {
      title: "Mutasi Out ke Produksi",
      requiresAuth: true,
      menuId: "43",
    },
  },
  {
    path: "/transaksi/mutasi/out-produksi/new",
    name: "MutasiOutProduksiCreate",
    component: MutasiOutCreateView,
    meta: {
      title: "Buat Mutasi Out",
      requiresAuth: true,
      menuId: "43",
    },
  },
  {
    path: "/transaksi/mutasi/out-produksi/ubah/:nomor",
    name: "MutasiOutProduksiEdit",
    component: MutasiOutCreateView,
    meta: {
      title: "Ubah Mutasi Out",
      requiresAuth: true,
      menuId: "43",
    },
  },
  {
    path: "/transaksi/mutasi/out-produksi/print/:nomor",
    name: "Cetak Mutasi Out",
    component: MutasiOutPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true, // Flag untuk layout khusus cetak
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/internal/minta-barang", // Sesuaikan path jika perlu
    name: "ufrmBrowMintaBarang",
    component: MintaBarangView,
    meta: {
      title: "Minta Barang ke DC",
      requiresAuth: true,
      menuId: "37",
    },
  },
  {
    path: "/transaksi/internal/minta-barang/new",
    name: "MintaBarangCreate",
    component: MintaBarangCreateView,
    meta: {
      title: "Buat Minta Barang ke DC",
      requiresAuth: true,
      menuId: "37",
    },
  },
  {
    path: "/transaksi/internal/minta-barang/ubah/:nomor",
    name: "MintaBarangEdit",
    component: MintaBarangCreateView,
    meta: {
      title: "Ubah Minta Barang ke DC",
      requiresAuth: true,
      menuId: "37",
    },
  },
  // Di dalam children dari path '/gudang-dc'
  {
    path: "/gudang-dc/operasional/packing-list",
    name: "PackingList",
    component: PackingListView,
    meta: {
      title: "Packing List / Pra-SJ",
      requiresAuth: true,
      menuId: "224", // Sesuaikan dengan ID di database
    },
  },
  {
    path: "/gudang-dc/operasional/packing-list/new",
    name: "PackingListCreate",
    // Pastikan file ini dibuat nanti
    component: PackingListCreateView,
    meta: {
      title: "Buat Packing List",
      requiresAuth: true,
      menuId: "224",
    },
  },
  {
    path: "/gudang-dc/operasional/packing-list/edit/:nomor",
    name: "PackingListEdit",
    // Menggunakan komponen yang sama dengan Create
    component: PackingListCreateView,
    meta: {
      title: "Ubah Packing List",
      requiresAuth: true,
      menuId: "224",
    },
  },
  {
    path: "/gudang-dc/operasional/packing-list/print/:nomor",
    name: "PackingListPrint", // <-- Nama route yang dipanggil di CreateView
    component: PackingListPrintView,
    meta: {
      title: "Cetak Packing List",
      requiresAuth: true,
      printLayout: true, // Flag untuk layout khusus cetak
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/operasional/surat-jalan-store",
    name: "SuratJalanStore",
    component: SuratJalanView,
    meta: {
      title: "Surat Jalan ke Store",
      requiresAuth: true,
      menuId: "213",
    },
  },
  {
    path: "/gudang-dc/operasional/surat-jalan-store/print/:nomor",
    name: "Cetak Surat Jalan",
    component: SuratJalanPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true, // Flag untuk layout khusus cetak
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/operasional/surat-jalan-store/new",
    name: "SuratJalanCreate",
    component: SuratJalanCreateView,
    meta: {
      title: "Buat Surat Jalan ke Store",
      requiresAuth: true,
      menuId: "213",
    },
  },
  {
    path: "/gudang-dc/operasional/surat-jalan-store/ubah/:nomor",
    name: "SuratJalanEdit",
    component: SuratJalanCreateView,
    meta: {
      title: "Ubah Surat Jalan ke Store",
      requiresAuth: true,
      menuId: "213",
    },
  },
  {
    path: "/gudang-dc/operasional/qc-garmen",
    name: "QCkeGarmen",
    component: QckeGarmenView,
    meta: {
      title: "QC ke Garmen",
      requiresAuth: true,
      menuId: "215",
    },
  },
  {
    path: "/gudang-dc/operasional/qc-garmen/create",
    name: "QCkeGarmenCreate",
    component: QckeGarmenCreateView,
    meta: {
      title: "Buat QC Garmen",
      requiresAuth: true,
      menuId: "215", // Asumsi
    },
  },
  {
    path: "/gudang-dc/operasional/qc-garmen/edit/:nomor",
    name: "QCkeGarmenEdit",
    component: QckeGarmenCreateView,
    meta: {
      title: "Ubah QC Garmen",
      requiresAuth: true,
      menuId: "215",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/qc-garmen/print/:nomor",
    name: "QcGarmenPrint",
    component: QckeGarmenPrintView,
    meta: {
      title: "Cetak QC Garmen",
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/internal/terima-sj",
    name: "TerimaSj",
    component: TerimaSjView,
    meta: {
      title: "Terima SJ dari DC",
      requiresAuth: true,
      menuId: "31",
    },
  },
  {
    path: "/transaksi/internal/terima-sj/create/:nomor",
    name: "TerimaSjCreate",
    component: TerimaSjFormView,
    meta: {
      title: "Buat Terima SJ",
      requiresAuth: true,
      menuId: "31",
    },
  },
  {
    path: "/transaksi/mutasi/in-produksi",
    name: "MutasiIn",
    component: MutasiInView,
    meta: {
      title: "Mutasi In dari Produksi",
      requiresAuth: true,
      menuId: "44",
    },
  },
  {
    path: "/transaksi/mutasi/in-produksi/new",
    name: "MutasiInCreate",
    component: MutasiInCreateView,
    meta: {
      title: "Buat Mutasi In",
      requiresAuth: true,
      menuId: "44",
    },
  },
  {
    path: "/transaksi/mutasi/in-produksi/edit/:nomor",
    name: "MutasiInEdit",
    component: MutasiInCreateView,
    meta: {
      title: "Ubah Mutasi In",
      requiresAuth: true,
      menuId: "44",
    },
  },
  {
    path: "/transaksi/mutasi/in-produksi/print/:nomor",
    name: "Cetak Mutasi In",
    component: MutasiInPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/mutasi/stok",
    name: "MutasiStok",
    component: MutasiStokView,
    meta: {
      title: "Mutasi Stok",
      requiresAuth: true,
      menuId: "45",
    },
  },
  {
    path: "/transaksi/mutasi/stok/new",
    name: "MutasiStokCreate",
    component: MutasiStokCreateView,
    meta: {
      title: "Buat Mutasi Stok",
      requiresAuth: true,
      menuId: "45",
    },
  },
  {
    path: "/transaksi/mutasi/stok/edit/:nomor",
    name: "MutasiStokEdit",
    component: MutasiStokCreateView,
    meta: {
      title: "Ubah Mutasi Stok",
      requiresAuth: true,
      menuId: "45",
    },
  },
  {
    path: "/transaksi/mutasi/stok/print/:nomor",
    name: "Cetak Mutasi Stok",
    component: MutasiStokPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/piutang/setoran-pembayaran",
    name: "SetoranBayar",
    component: SetoranBayarView,
    meta: {
      title: "Setoran Pembayaran",
      requiresAuth: true,
      menuId: "51",
    },
  },
  {
    path: "/piutang/setoran-pembayaran/new",
    name: "SetoranBayarCreate",
    component: SetoranBayarCreateView,
    meta: {
      title: "Buat Setoran Pembayaran",
      requiresAuth: true,
      menuId: "51",
    },
  },
  {
    path: "/piutang/setoran-pembayaran/edit/:nomor",
    name: "SetoranBayarEdit",
    component: SetoranBayarCreateView,
    meta: {
      title: "Ubah Setoran Pembayaran",
      requiresAuth: true,
      menuId: "51",
    },
  },
  {
    path: "/piutang/setoran-pembayaran/print/:nomor",
    name: "CetakSetoranBayar",
    component: DpPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/piutang/fsk",
    name: "Fsk",
    component: FskView,
    meta: {
      title: "Form Setoran Kasir",
      requiresAuth: true,
      menuId: "54",
    },
  },
  {
    path: "/piutang/fsk/new",
    name: "FskCreate",
    component: FskCreateView,
    meta: {
      title: "Buat Form Setoran Kasir",
      requiresAuth: true,
      menuId: "54",
    },
  },
  {
    path: "/piutang/fsk/edit/:nomor",
    name: "FskEdit",
    component: FskCreateView,
    meta: {
      title: "Ubah Form Setoran Kasir",
      requiresAuth: true,
      menuId: "54",
    },
  },
  {
    path: "/piutang/fsk/print/:nomor",
    name: "FskPrint",
    component: FskPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/piutang/potongan",
    name: "Potongan",
    component: PotonganView,
    meta: {
      title: "Potongan Pembayaran",
      requiresAuth: true,
      menuId: "53",
    },
  },
  {
    path: "/piutang/potongan/new",
    name: "PotonganCreate",
    component: PotonganCreateView,
    meta: {
      title: "Buat Potongan Baru",
      requiresAuth: true,
      menuId: "53",
    },
  },
  {
    path: "/piutang/potongan/edit/:nomor",
    name: "PotonganEdit",
    component: PotonganCreateView,
    meta: {
      title: "Ubah Potongan",
      requiresAuth: true,
      menuId: "53",
    },
  },
  {
    path: "/piutang/refund",
    name: "Refund",
    component: RefundView,
    meta: {
      title: "Refund",
      requiresAuth: true,
      menuId: "55",
    },
  },
  {
    path: "/piutang/refund/new",
    name: "refundCreate",
    component: RefundCreateView,
    meta: {
      title: "Buat Refund Baru",
      requiresAuth: true,
      menuId: "55",
    },
  },
  {
    path: "/piutang/refund/edit/:nomor",
    name: "RefundEdit",
    component: RefundCreateView,
    meta: {
      title: "Buat Refund Baru",
      requiresAuth: true,
      menuId: "55",
    },
  },
  {
    path: "/piutang/refund/print/:nomor",
    name: "RefundPrint",
    component: RefundPrintView,
    meta: {
      title: "Cetak Pengajuan Refund",
      requiresAuth: true,
      menuId: "55",
      layout: "PrintLayout",
    },
  },
  {
    path: "/piutang/klaim-petty-cash",
    name: "KlaimPettyCash",
    component: KlaimPettyCashView,
    meta: {
      title: "Klaim Petty Cash",
      requiresAuth: true,
      menuId: "59",
    },
  },
  {
    path: "/piutang/klaim-petty-cash/proses/:nomor",
    name: "KlaimPettyCashProses",
    component: KlaimPettyCashProsesView,
    meta: {
      title: "Verifikasi Klaim Petty Cash",
      requiresAuth: true,
      menuId: "59",
    },
  },
  {
    path: "/piutang/klaim-petty-cash/print/:nomor",
    name: "KlaimPettyCashPrint",
    component: KlaimPettyCashPrintView,
    meta: {
      title: "Cetak Klaim Petty Cash",
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/invoice",
    name: "Invoice",
    component: InvoiceView,
    meta: {
      title: "Invoice",
      requiresAuth: true,
      menuId: "27",
    },
  },
  {
    path: "/transaksi/penjualan/invoice/new",
    name: "InvoiceCreate",
    component: InvoiceCreateView,
    meta: {
      title: "Buat Invoice Baru",
      requiresAuth: true,
      menuId: "27",
    },
  },
  {
    path: "/transaksi/penjualan/invoice/edit/:nomor",
    name: "InvoiceEdit",
    component: InvoiceCreateView,
    meta: {
      title: "Ubah Invoice",
      requiresAuth: true,
      menuId: "27",
    },
  },
  {
    path: "/transaksi/penjualan/invoice/print/:nomor",
    name: "InvoicePrint",
    component: InvoicePrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/invoice/print-kasir/:nomor",
    name: "InvoicePrintKasir",
    component: InvoicePrintKasirView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/invoice/image-kasir/:nomor",
    name: "InvoicePrintImageView",
    component: InvoicePrintImageView,
    meta: {
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/invoice/print-kupon/:nomor",
    name: "CetakKupon",
    component: KuponPrintView,
    meta: { printLayout: true, requiresAuth: true, layout: "PrintLayout" },
  },
  {
    path: "/invoice/print-voucher/:nomor",
    name: "CetakVoucher",
    component: VoucherPrintView,
    meta: { printLayout: true, requiresAuth: true, layout: "PrintLayout" },
  },
  {
    path: "/transaksi/penjualan/invoice/print-sj/:nomor",
    name: "CetakInvoiceAsSJ",
    component: InvoiceAsSjPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/biaya-kirim",
    name: "biaya-kirim-browse",
    component: BiayaKirimView,
    meta: {
      requiresAuth: true,
      menuId: "49",
      title: "Browse Biaya Kirim",
    },
  },
  {
    path: "/transaksi/penjualan/biaya-kirim/baru",
    name: "biaya-kirim-create",
    component: BiayaKirimCreateView,
    meta: {
      requiresAuth: true,
      menuId: "49",
      title: "Input Biaya Kirim",
    },
  },
  {
    path: "/transaksi/penjualan/biaya-kirim/edit/:nomor",
    name: "biaya-kirim-edit",
    component: BiayaKirimCreateView,
    meta: {
      requiresAuth: true,
      menuId: "49",
      title: "Edit Biaya Kirim",
    },
  },
  {
    path: "/transaksi/penjualan/biaya-kirim/print/:nomor",
    name: "Cetak Biaya Kirim",
    component: BiayaKirimPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/pelunasan-invoice",
    name: "PelunasanInvoice",
    component: PelunasanInvoiceView,
    meta: {
      requiresAuth: true,
      title: "Browse Pelunasan Marketplace",
      menuId: "50", // Sesuai database
    },
  },
  {
    path: "/transaksi/penjualan/pelunasan-invoice/form/:nomor?", // :nomor? opsional (create/view)
    name: "PelunasanInvoiceForm",
    component: PelunasanInvoiceCreateView,
    meta: { requiresAuth: true, title: "Form Pelunasan Marketplace", menuId: "50" },
  },
  {
    path: "/transaksi/penjualan/pesanan-online",
    name: "PesananOnline",
    component: PesananOnlineView,
    meta: { requiresAuth: true, title: "Daftar Pesanan Online", menuId: "56" },
  },
  {
    path: "/transaksi/penjualan/pesanan-online/create",
    name: "PesananOnlineCreate", // Nama ini dipanggil di handleCreate() di atas
    component: PesananOnlineCreateView,
    meta: { requiresAuth: true, title: "Input Pesanan Baru", menuId: "56" },
  },
  {
    path: "/transaksi/mutasi/store-kirim",
    name: "MutasiKirim",
    component: MutasiStoreKirimView,
    meta: {
      title: "Mutasi Antar Store Kirim",
      requiresAuth: true,
      menuId: "46", // Pastikan ID ini sesuai dengan yang ada di database
    },
  },
  {
    path: "/transaksi/mutasi/store-kirim/new",
    name: "MutasiKirimCreate",
    component: MutasiStoreKirimCreateView,
    meta: {
      title: "Buat Mutasi Antar Store",
      requiresAuth: true,
      menuId: "46", // Sesuaikan
    },
  },
  {
    path: "/transaksi/mutasi/store-kirim/edit/:nomor",
    name: "MutasiKirimEdit",
    component: MutasiStoreKirimCreateView,
    meta: {
      title: "Ubah Mutasi Antar Store",
      requiresAuth: true,
      menuId: "46", // Sesuaikan
    },
  },
  {
    path: "/transaksi/mutasi/store-kirim/print/:nomor",
    name: "MutasiKirimPrint",
    component: MutasiStoreKirimPrintView,
    meta: {
      title: "Cetak Mutasi Antar Store",
      printLayout: true, // Bypass layout utama & nav guard
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/mutasi/store-terima",
    name: "MutasiTerima",
    component: MutasiStoreTerimaView,
    meta: {
      title: "Mutasi Antar Store Terima",
      requiresAuth: true,
      menuId: "47",
    },
  },
  {
    path: "/transaksi/mutasi/store-terima/new", // Mode 'create' untuk penerimaan
    name: "MutasiTerimaCreate",
    component: MutasiStoreTerimaCreateView,
    meta: {
      title: "Buat Mutasi Antar Store Terima",
      requiresAuth: true,
      menuId: "47",
    },
  },
  {
    path: "/transaksi/internal/koreksi-stok",
    name: "KoreksiStok",
    component: KoreksiStokView,
    meta: {
      title: "Koreksi Stok",
      requiresAuth: true,
      menuId: "25",
    },
  },
  {
    path: "/transaksi/internal/koreksi-stok/create",
    name: "KoreksiStokCreate",
    component: KoreksiStokCreateView,
    meta: { title: "Buat Koreksi Stok", requiresAuth: true, menuId: "25" },
  },
  {
    path: "/transaksi/internal/koreksi-stok/edit/:nomor",
    name: "KoreksiStokEdit",
    component: KoreksiStokCreateView,
    meta: { title: "Ubah Koreksi Stok", requiresAuth: true, menuId: "25" },
  },
  {
    path: "/transaksi/internal/koreksi-stok/print/:nomor",
    name: "KoreksiStokPrint",
    component: KoreksiStokPrintView,
    meta: {
      title: "Cetak Koreksi Stok",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/retur-jual",
    name: "ReturJual",
    component: ReturJualView,
    meta: {
      title: "Retur Jual",
      requiresAuth: true,
      menuId: "29",
    },
  },
  {
    path: "/transaksi/penjualan/retur-jual/create",
    name: "ReturJualCreate",
    component: ReturJualCreateView,
    meta: { title: "Buat Retur Jual", requiresAuth: true, menuId: "29" },
  },
  {
    path: "/transaksi/penjualan/retur-jual/edit/:nomor",
    name: "ReturJualEdit",
    component: ReturJualCreateView,
    meta: { title: "Ubah Retur Jual", requiresAuth: true, menuId: "29" },
  },
  {
    path: "/transaksi/penjualan/retur-jual/print/:nomor",
    name: "ReturJualPrint",
    component: ReturJualPrintView,
    meta: {
      title: "Cetak Retur Jual",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/retur-jual/print-kasir/:nomor",
    name: "ReturJualPrintKasir",
    component: ReturJualPrintKasirView,
    meta: {
      title: "Cetak Struk Retur",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/penjualan/komplain-customer",
    name: "KomplainCustomer",
    component: KomplainCustomerView,
    meta: {
      title: "Komplain Customer",
      requiresAuth: true,
      menuId: "60",
    },
  },
  {
    path: "/transaksi/penjualan/komplain-customer/new",
    name: "KomplainCustomerCreate",
    component: KomplainCustomerCreateView,
    meta: {
      title: "Buat Komplain Baru",
      requiresAuth: true,
      menuId: "60",
    },
  },
  {
    path: "/transaksi/penjualan/komplain-customer/edit/:nomor",
    name: "KomplainCustomerEdit",
    component: KomplainCustomerCreateView, // Menggunakan komponen form yang sama
    meta: {
      title: "Detail / Ubah Komplain",
      requiresAuth: true,
      menuId: "60",
    },
  },
  {
    path: "/transaksi/penjualan/komplain-customer/print/:nomor",
    name: "KomplainCustomerPrint",
    component: KomplainCustomerPrintView,
    meta: {
      title: "Cetak Bukti Komplain",
      requiresAuth: true,
      menuId: "60",
      printLayout: true, // Bypass layout utama
      layout: "PrintLayout", // Gunakan layout kosongan
    },
  },
  {
    path: "/transaksi/internal/retur-dc",
    name: "ReturDc",
    component: ReturDcView,
    meta: {
      title: "Retur Barang ke DC",
      requiresAuth: true,
      menuId: "32",
    },
  },
  {
    path: "/transaksi/internal/retur-dc/create",
    name: "ReturDcCreate",
    component: ReturDcCreateView,
    meta: { title: "Buat Retur Barang ke DC", requiresAuth: true, menuId: "32" },
  },
  {
    path: "/transaksi/internal/retur-dc/edit/:nomor",
    name: "ReturDcEdit",
    component: ReturDcCreateView,
    meta: { title: "Ubah Retur Barang ke DC", requiresAuth: true, menuId: "32" },
  },
  {
    path: "/transaksi/internal/retur-dc/print/:nomor",
    name: "ReturDcPrint",
    component: ReturDcPrintView,
    meta: {
      title: "Cetak Retur Barang ke DC",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/operasional/terima-rb",
    name: "TerimaRetur",
    component: TerimaReturView,
    meta: {
      title: "Terima Retur dari Store",
      requiresAuth: true,
      menuId: "214",
    },
  },
  {
    path: "/gudang-dc/operasional/terima-rb/create",
    name: "TerimaReturCreate",
    component: TerimaReturCreateView,
    meta: { title: "Buat Terima Retur", requiresAuth: true, menuId: "214" },
  },
  {
    path: "/gudang-dc/operasional/terima-rb/edit/:nomor",
    name: "TerimaReturEdit",
    component: TerimaReturCreateView,
    meta: { title: "Ubah Terima Retur", requiresAuth: true, menuId: "214" },
  },
  {
    path: "/piutang/kartu-piutang",
    name: "KartuPiutang",
    component: KartuPiutangView,
    meta: {
      title: "Kartu Piutang",
      requiresAuth: true,
      menuId: "52",
    },
  },
  {
    path: "/transaksi/internal/pengajuan-barcode",
    name: "PengajuanBarcode",
    component: PengajuanBarcodeView,
    meta: {
      title: "Pengajuan Barcode Baru",
      requiresAuth: true,
      menuId: "33",
      layout: "DefaultLayout",
    },
  },
  {
    path: "/transaksi/internal/pengajuan-barcode/create",
    name: "PengajuanBarcodeCreate",
    component: PengajuanBarcodeCreateView,
    meta: { title: "Buat Pengajuan Barcode", requiresAuth: true, menuId: "33" },
  },
  {
    path: "/transaksi/internal/pengajuan-barcode/edit/:nomor",
    name: "PengajuanBarcodeEdit",
    component: PengajuanBarcodeCreateView,
    meta: { title: "Ubah Pengajuan Barcode", requiresAuth: true, menuId: "33" },
  },
  {
    path: "/transaksi/internal/pengajuan-barcode/print-barcode/:nomor",
    name: "CetakBarcodeBaru",
    component: CetakBarcodeBaruView,
    meta: {
      title: "Cetak Barcode Baru",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/internal/pengajuan-barcode/print-barcode-a4/:nomor",
    name: "CetakBarcodeBaruA4",
    component: PengajuanBarcodePrintView,
    meta: {
      title: "Cetak Barcode Baru A4",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/master-data/jenis-kain",
    name: "JenisKain",
    component: JenisKainView,
    meta: {
      title: "Jenis Kain",
      requiresAuth: true,
      menuId: "201",
    },
  },
  {
    path: "/gudang-dc/master-data/warna-kain",
    name: "WarnaKain",
    component: WarnaKainView,
    meta: {
      title: "Warna Kain",
      requiresAuth: true,
      menuId: "202",
    },
  },
  {
    path: "/gudang-dc/master-data/lengan",
    name: "Lengan",
    component: LenganView,
    meta: {
      title: "Lengan",
      requiresAuth: true,
      menuId: "203",
    },
  },
  {
    path: "/gudang-dc/master-data/barang-dc",
    name: "BarangDc",
    component: BarangDcView,
    meta: {
      title: "Barang DC",
      requiresAuth: true,
      menuId: "204",
    },
  },
  {
    path: "/gudang-dc/master-data/barang-dc/create",
    name: "BarangDcCreate",
    component: BarangDcCreateView,
    meta: { title: "Buat Barang DC", requiresAuth: true, menuId: "204" },
  },
  {
    path: "/gudang-dc/master-data/barang-dc/edit/:kode",
    name: "BarangDcEdit",
    component: BarangDcCreateView,
    meta: { title: "Ubah Barang DC", requiresAuth: true, menuId: "204" },
  },
  {
    path: "/gudang-dc/master-data/price-list",
    name: "PriceList",
    component: PriceListView,
    meta: {
      title: "Price List",
      requiresAuth: true,
      menuId: "206",
    },
  },
  {
    path: "/gudang-dc/master-data/promo",
    name: "Promo",
    component: PromoView,
    meta: {
      title: "Promo",
      requiresAuth: true,
      menuId: "205",
    },
  },
  {
    path: "/gudang-dc/master-data/promo/create",
    name: "PromoCreate",
    component: PromoCreateView,
    meta: { title: "Buat Promo", requiresAuth: true, menuId: "205" },
  },
  {
    path: "/gudang-dc/master-data/promo/edit/:nomor",
    name: "PromoEdit",
    component: PromoCreateView,
    meta: { title: "Ubah Promo", requiresAuth: true, menuId: "205" },
  },
  {
    path: "/gudang-dc/operasional/terima-stbj",
    name: "TerimaStbj",
    component: TerimaStbjView,
    meta: {
      title: "Terima STBJ",
      requiresAuth: true,
      menuId: "211",
    },
  },
  {
    path: "/gudang-dc/operasional/terima-stbj/create",
    name: "TerimaStbjCreate",
    component: TerimaStbjCreateView,
    meta: { title: "Buat Terima STBJ", requiresAuth: true, menuId: "211" },
  },
  {
    path: "/gudang-dc/operasional/tolak-stbj/create",
    name: "TolakStbjCreate",
    component: TolakStbjCreateView,
    meta: { title: "Buat Tolak STBJ", requiresAuth: true, menuId: "211" },
  },
  {
    path: "/gudang-dc/operasional/terima-repair",
    name: "TerimaRepair",
    component: TerimaRepairView,
    meta: {
      title: "Terima dari Gudang Repair",
      requiresAuth: true,
      menuId: "212",
    },
  },
  {
    path: "/gudang-dc/operasional/terima-repair/create",
    name: "TerimaRepairCreate",
    component: TerimaRepairCreateView,
    meta: { title: "Buat Terima dari Gudang Repair", requiresAuth: true, menuId: "212" },
  },
  {
    path: "/gudang-dc/operasional/ambil-barang",
    name: "AmbilBarang",
    component: AmbilBarangView,
    meta: {
      title: "Pengambilan Barang",
      requiresAuth: true,
      menuId: "253",
    },
  },

  {
    path: "/gudang-dc/operasional/ambil-barang/create",
    name: "AmbilBarangCreate",
    component: AmbilBarangCreateView,
    meta: {
      title: "Buat Pengambilan Barang",
      requiresAuth: true,
      menuId: "253",
    },
  },
  {
    path: "/gudang-dc/operasional/ambil-barang/edit/:id",
    name: "AmbilBarangEdit",
    component: AmbilBarangCreateView,
    meta: {
      title: "Ubah Pengambilan Barang",
      requiresAuth: true,
      menuId: "253",
    },
  },
  {
    path: "/laporan/stok/real-time",
    name: "frmRptStok",
    component: LaporanStokView,
    meta: {
      title: "Laporan Stok Real Time",
      requiresAuth: true,
      menuId: "501",
    },
  },
  {
    path: "/laporan/stok/mutasi-stok",
    name: "LaporanMutasiStok",
    component: LaporanMutasiStokView,
    meta: {
      title: "Laporan Mutasi Stok",
      requiresAuth: true,
      menuId: "502",
    },
  },
  {
    path: "/laporan/stok/kartu-stok",
    name: "LaporanKartuStok",
    component: LaporanKartuStokView,
    meta: {
      title: "Laporan Kartu Stok",
      requiresAuth: true,
      menuId: "502",
    },
  },
  {
    path: "/laporan/lain-lain/list-otorisasi",
    name: "LaporanListOtorisasi",
    component: LaporanListOtorisasiView,
    meta: {
      title: "Laporan List Otorisasi",
      requiresAuth: true,
      menuId: "502",
    },
  },
  {
    path: "/laporan/lain-lain/audit-log",
    name: "AuditLog",
    component: AuditLogView,
    meta: {
      title: "Audit Trail Log",
      requiresAuth: true,
      menuId: "602", // Sesuai permintaan
    },
  },
  {
    path: "/laporan/penjualan/invoice",
    name: "LaporanInvoice",
    component: LaporanInvoiceView,
    meta: {
      title: "Laporan Invoice",
      requiresAuth: true,
      menuId: "502",
    },
  },
  {
    path: "/laporan/penjualan/sales-vs-target",
    name: "SalesVsTarget",
    component: LaporanSalesVsTargetView,
    meta: {
      title: "Laporan Sales VS Target",
      requiresAuth: true,
      menuId: "509",
    },
  },
  {
    path: "/laporan/analisa/stok-pivot",
    name: "LaporanStokPivot",
    component: LaporanStokPivotView,
    meta: {
      title: "Laporan Stok (Pivot)",
      requiresAuth: true,
      menuId: "507",
    },
  },
  {
    path: "/laporan/analisa/stok-pivot/chart",
    name: "LaporanStokChart",
    component: LaporanStokGrafikView,
    meta: {
      title: "Grafik Laporan Stok",
      requiresAuth: true,
      menuId: "507",
    },
  },
  {
    path: "/laporan/stok/stagnan",
    name: "LaporanStokStagnan",
    component: LaporanStokStagnanView,
    meta: {
      title: "Laporan Stok Stagnan",
      requiresAuth: true,
      menuId: "508",
    },
  },
  {
    path: "/transaksi/stok-opname/setting-tanggal",
    name: "StokOpnameSettingTanggal",
    component: StokOpnameSettingTanggalView,
    meta: {
      title: "Setting Tanggal Stok Opname",
      requiresAuth: true,
      menuId: "21",
    },
  },
  {
    path: "/transaksi/stok-opname/lokasi-opname",
    name: "LokasiOpname",
    component: LokasiOpnameView,
    meta: {
      title: "Master Lokasi Opname",
      requiresAuth: true,
      menuId: "18",
    },
  },
  {
    path: "/transaksi/stok-opname/hitung-stok",
    name: "HitungStok",
    component: HitungStokView,
    meta: {
      title: "Browse Hitung Stok",
      requiresAuth: true,
      menuId: "23",
    },
  },
  {
    path: "/transaksi/stok-opname/hitung-stok/form",
    name: "HitungStokForm",
    component: HitungStokCreateView,
    meta: {
      title: "Form Hitung Stok",
      requiresAuth: true,
      menuId: "23",
    },
  },
  {
    path: "/transaksi/stok-opname/hitung-per-lokasi",
    name: "HitungStokLokasi",
    component: HitungStokLokasiView,
    meta: {
      title: "Browse Hitung Stok per Lokasi",
      requiresAuth: true,
      menuId: "20",
    },
  },
  {
    path: "/transaksi/stok-opname/hitung-per-operator",
    name: "HitungStokOperator",
    component: HitungStokOperatorView,
    meta: {
      title: "Browse Hitung Stok per Operator",
      requiresAuth: true,
      menuId: "19", // Sesuai permintaan
    },
  },
  {
    path: "/transaksi/stok-opname/cek-selisih",
    name: "CekSelisih",
    component: CekSelisihView,
    meta: {
      title: "Cek Selisih Stok Opname",
      requiresAuth: true,
      menuId: "22",
    },
  },
  {
    path: "/transaksi/stok-opname/proses",
    name: "ProsesStokOpname",
    component: ProsesStokOpnameView,
    meta: {
      title: "Proses Stok Opname",
      requiresAuth: true,
      menuId: "24",
    },
  },
  {
    path: "/transaksi/stok-opname/proses/create",
    name: "ProsesStokOpnameCreate",
    component: ProsesStokOpnameCreateView,
    meta: {
      title: "Buat Proses Stok Opname",
      requiresAuth: true,
      menuId: "24",
    },
  },
  {
    path: "/transaksi/stok-opname/proses/edit/:nomor",
    name: "ProsesStokOpnameEdit",
    component: ProsesStokOpnameCreateView,
    meta: { title: "Ubah Proses Stok Opname", requiresAuth: true, menuId: "24" },
  },
  {
    path: "/laporan/penjualan/pareto",
    name: "LaporanPareto",
    component: ParetoView,
    meta: {
      title: "Laporan Pareto Barang Terjual",
      requiresAuth: true,
      menuId: "511",
    },
  },
  {
    path: "/laporan/penjualan/pareto/print",
    name: "LaporanParetoPrint",
    component: ParetoPrintView,
    meta: {
      title: "Cetak Laporan Pareto",
      requiresAuth: true,
      menuId: "511", // Gunakan menuId yang sama
      layout: "PrintLayout",
    },
  },
  {
    path: "/laporan/analisa/with-pivot",
    name: "LaporanPenjualanPivot",
    component: LaporanPenjualanPivotView,
    meta: {
      title: "Laporan Penjualan (Pivot)",
      requiresAuth: true,
      menuId: "506",
    },
  },
  {
    path: "/laporan/analisa/penjualan-grafik",
    name: "LaporanPenjualanChart",
    component: LaporanPenjualanGrafikView,
    meta: { title: "Grafik Laporan Penjualan", requiresAuth: true, menuId: "506" },
  },
  {
    path: "/laporan/penjualan/monitoring-achievement",
    name: "MonitoringAchievement",
    component: MonitoringAchievementView,
    meta: {
      title: "Monitoring Achievement",
      requiresAuth: true,
      menuId: "705",
    },
  },
  {
    path: "/laporan/stok/dead-stok",
    name: "LaporanDeadStok",
    component: LaporanDeadStokView,
    meta: {
      title: "Laporan Dead Stock",
      requiresAuth: true,
      menuId: "510",
    },
  },
  {
    path: "/laporan/lain-lain/saldo-kasir",
    name: "LaporanSaldoKasir",
    component: LaporanSaldoKasirView,
    meta: {
      title: "Laporan Saldo Kasir",
      requiresAuth: true,
      menuId: "601",
    },
  },
  {
    path: "/laporan/lain-lain/petty-cash",
    name: "LaporanPettyCash",
    component: LaporanPettyCashView,
    meta: {
      title: "Laporan Mutasi Petty Cash",
      requiresAuth: true,
      menuId: "603",
    },
  },
  {
    path: "/gudang-dc/operasional/mutasi-antar-gudang",
    name: "MutasiAntarGudang",
    component: MutasiAntarGudangView,
    meta: {
      title: "Mutasi Antar Gudang",
      requiresAuth: true,
      menuId: "216",
    },
  },
  {
    path: "/gudang-dc/operasional/mutasi-antar-gudang/create",
    name: "MutasiAntarGudangCreate",
    component: MutasiAntarGudangCreateView,
    meta: {
      title: "Buat Mutasi Antar Gudang",
      requiresAuth: true,
      menuId: "216",
    },
  },
  {
    path: "/gudang-dc/operasional/mutasi-antar-gudang/edit/:nomor",
    name: "MutasiAntarGudangEdit",
    component: MutasiAntarGudangCreateView,
    meta: {
      title: "Ubah Mutasi Antar Gudang",
      requiresAuth: true,
      menuId: "216",
    },
  },
  {
    path: "/gudang-dc/operasional/mutasi-antar-gudang/print/:nomor",
    name: "MutasiAntarGudangPrint",
    component: MutasiAntarGudangPrintView,
    meta: {
      title: "Cetak Mutasi Antar Gudang",
      requiresAuth: true,
      menuId: "216",
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/operasional/minta-accesories",
    name: "MintaAccesories",
    component: MintaAccesoriesView,
    meta: {
      title: "Permintaan Accesories (Kebutuhan Kaosan)",
      requiresAuth: true,
      menuId: "225",
    },
  },
  // ... (taruh di bawah route MintaAccesories Browse yang sebelumnya dibuat)
  {
    path: "/gudang-dc/operasional/minta-accesories/new",
    name: "MintaAccesoriesCreate",
    component: MintaAccesoriesCreateView,
    meta: {
      title: "Buat Permintaan Kebutuhan",
      requiresAuth: true,
      menuId: "225",
    },
  },
  {
    path: "/gudang-dc/operasional/minta-accesories/ubah/:nomor",
    name: "MintaAccesoriesEdit",
    component: MintaAccesoriesCreateView,
    meta: {
      title: "Ubah Permintaan Kebutuhan",
      requiresAuth: true,
      menuId: "225",
    },
  },
  {
    path: "/gudang-dc/operasional/minta-accesories/print/:nomor",
    name: "MintaAccesoriesPrint",
    component: MintaAccesoriesPrintView,
    meta: {
      title: "Cetak Permintaan Accesories",
      requiresAuth: true,
      menuId: "225",
      layout: "PrintLayout",
      printLayout: true,
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/pengajuan-produksi",
    name: "PengajuanProduksi",
    component: PengajuanProduksiView,
    meta: {
      title: "Browse Pengajuan Produksi",
      requiresAuth: true,
      menuId: "217",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/pengajuan-produksi/create",
    name: "PengajuanProduksiCreate",
    component: PengajuanProduksiCreateView,
    meta: {
      title: "Buat Pengajuan Produksi",
      requiresAuth: true,
      menuId: "217",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/pengajuan-produksi/edit/:nomor",
    name: "PengajuanProduksiEdit",
    component: PengajuanProduksiCreateView,
    meta: {
      title: "Ubah Pengajuan Produksi",
      requiresAuth: true,
      menuId: "217",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/pengajuan-produksi/print/:nomor",
    name: "PengajuanProduksiPrint",
    component: PengajuanProduksiPrintView,
    meta: {
      title: "Cetak Pengajuan Produksi",
      requiresAuth: true,
      menuId: "217",
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/apv-pengajuan-produksi",
    name: "ApprovePengajuanProduksi",
    component: ApprovePengajuanProduksiView,
    meta: {
      title: "Approve Pengajuan Produksi",
      requiresAuth: true,
      menuId: "218",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/approve-pengajuan/form/:nomor",
    name: "ApprovePengajuanProduksiForm",
    component: ApprovePengajuanProduksiCreateView,
    meta: {
      title: "Form Approve Pengajuan Produksi",
      requiresAuth: true,
      menuId: "218",
    },
  },
  {
    path: "/gudang-dc/master-data/barang-external",
    name: "BarangExternal",
    component: BarangExternalView,
    meta: {
      title: "Master Barang External",
      requiresAuth: true,
      menuId: "219",
    },
  },
  {
    path: "/gudang-dc/master-data/barang-external/create",
    name: "BarangExternalCreate",
    component: BarangExternalCreateView,
    meta: {
      title: "Buat Barang External",
      requiresAuth: true,
      menuId: "219",
    },
  },
  {
    path: "/gudang-dc/master-data/barang-external/edit/:kode",
    name: "BarangExternalEdit",
    component: BarangExternalCreateView, // Menggunakan form yang sama
    meta: {
      title: "Ubah Barang External",
      requiresAuth: true,
      menuId: "219",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/po-kaosan",
    name: "PoKaosan",
    component: PoKaosanView,
    meta: {
      title: "Browse PO ke Supplier",
      requiresAuth: true,
      menuId: "220",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/po-kaosan/create",
    name: "PoKaosanCreate",
    component: PoKaosanCreateView,
    meta: {
      title: "Buat PO Kaosan",
      requiresAuth: true,
      menuId: "220",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/po-kaosan/edit/:nomor",
    name: "PoKaosanEdit",
    component: PoKaosanCreateView, // Menggunakan form yang sama
    meta: {
      title: "Ubah PO Kaosan",
      requiresAuth: true,
      menuId: "220",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/po-kaosan/print/:nomor",
    name: "PoKaosanPrint",
    component: PoKaosanPrintView,
    meta: {
      title: "Cetak PO Kaosan",
      requiresAuth: true,
      menuId: "220",
      layout: "PrintLayout",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/bpb-kaosan",
    name: "BpbKaosan",
    component: BpbKaosanView,
    meta: {
      title: "Browse BPB Kaosan",
      requiresAuth: true,
      menuId: "221",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/bpb-kaosan/create",
    name: "BpbKaosanCreate",
    component: BpbKaosanCreateView,
    meta: {
      title: "Buat BPB Kaosan",
      requiresAuth: true,
      menuId: "221",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/bpb-kaosan/edit/:nomor",
    name: "BpbKaosanEdit",
    component: BpbKaosanCreateView, // Menggunakan form yang sama
    meta: {
      title: "Ubah BPB Kaosan",
      requiresAuth: true,
      menuId: "221",
    },
  },
  {
    path: "/gudang-dc/produksi-supplier/bpb-kaosan/print/:nomor",
    name: "BpbKaosanPrint",
    component: BpbKaosanPrintView,
    meta: {
      title: "Cetak BPB Kaosan",
      requiresAuth: true,
      menuId: "221",
      layout: "PrintLayout",
    },
  },
  {
    path: "/transaksi/stok-opname/hpp-kosong",
    name: "LaporanHppKosong",
    component: LaporanHppKosongView,
    meta: {
      title: "List HPP 0 Ada Stok",
      requiresAuth: true,
      menuId: "704",
    },
  },
  {
    path: "/transaksi/internal/klerek",
    name: "Klerek",
    component: KlerekView,
    meta: {
      title: "Klerek (Transfer Invoice Bazar)",
      requiresAuth: true,
      menuId: "34",
    },
  },
  {
    path: "/laporan/stok/stok-minus",
    name: "LaporanStokMinus",
    component: LaporanStokMinusView,
    meta: {
      title: "Laporan Stok Minus",
      requiresAuth: true,
    },
  },
  {
    path: "/operasional/workshop/mutasi-workshop",
    name: "MutasiWorkshop",
    component: MutasiWorkshopView,
    meta: {
      title: "Mutasi ke Workshop",
      requiresAuth: true,
      menuId: "801",
    },
  },
  {
    path: "/operasional/workshop/mutasi-workshop/new",
    name: "MutasiWorkshopCreate",
    component: MutasiWorkshopCreateView, // Asumsi komponen belum dibuat, siapkan dulu route-nya
    meta: {
      title: "Buat Mutasi ke Workshop",
      requiresAuth: true,
      menuId: "801",
    },
  },
  {
    path: "/operasional/workshop/mutasi-workshop/edit/:nomor",
    name: "MutasiWorkshopEdit",
    component: MutasiWorkshopCreateView,
    meta: {
      title: "Ubah Mutasi ke Workshop",
      requiresAuth: true,
      menuId: "801",
    },
  },
  {
    path: "/operasional/workshop/mutasi-workshop/print/:nomor",
    name: "MutasiWorkshopPrint",
    component: MutasiWorkshopPrintView, // Asumsi komponen belum dibuat, siapkan dulu route-nya
    meta: {
      title: "Cetak Mutasi Workshop",
      printLayout: true,
      requiresAuth: true,
      layout: "PrintLayout",
    },
  },
  {
    path: "/operasional/workshop/terima-workshop",
    name: "TerimaMutasiWorkshop",
    component: TerimaMutasiWorkshopView,
    meta: {
      title: "Terima Mutasi Workshop",
      requiresAuth: true,
      menuId: "802", // Sesuai kesepakatan
    },
  },
  // {
  //   path: "/operasional/workshop/terima-workshop/create",
  //   name: "TerimaMutasiWorkshopCreate",
  //   component: TerimaMutasiWorkshopCreateView, // Komponen ini akan kita buat setelah ini
  //   meta: {
  //     title: "Terima Barang Workshop",
  //     requiresAuth: true,
  //     menuId: "802",
  //   },
  // },
  {
    path: "/pengaturan/whatsapp",
    name: "WhatsappLink",
    component: WhatsappLinkView,
    meta: {
      title: "Tautkan Perangkat WhatsApp",
      requiresAuth: true,
    },
  },
];

// 1. Filter rute: Jika Mode Tracking, buang rute yang bukan untuk umum
const filteredRoutes = routes.filter((r) => {
  if (isTrackingMode) {
    // Daftar rute yang BOLEH diakses di subdomain tracking
    const allowedPaths = ["/", "/tracking", "/:pathMatch(.*)*", "/unauthorized"];

    // Khusus untuk rute tracking pesanan yang dinamis
    const isTrackingDetail = r.path.includes("/transaksi/penjualan/surat-pesanan/track");

    return allowedPaths.includes(r.path) || isTrackingDetail;
  }

  // Jika bukan mode tracking (Retail Utama), berikan semua rute
  return true;
});

const router = createRouter({
  // Gunakan rute yang sudah difilter
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: filteredRoutes,
});

const getSmartIcon = (routeObj: RouteLocationNormalized) => {
  // Casting meta agar TS tidak komplain properti 'icon' tidak ada
  const meta = routeObj.meta as { icon?: string; title?: string };

  // Jika di meta sudah ada icon, pakai itu
  if (meta && meta.icon) {
    return meta.icon;
  }

  const path = (routeObj.path || "").toLowerCase();
  // Name bisa berupa symbol, jadi pastikan convert string
  const name = (routeObj.name || "").toString().toLowerCase();
  const fullString = `${path} ${name}`;

  // Logika Penebak Icon
  if (fullString.includes("invoice")) return "mdi-receipt-text";
  if (fullString.includes("so") || fullString.includes("pesanan")) return "mdi-file-document-edit";
  if (fullString.includes("dtf")) return "mdi-printer-3d-nozzle";
  if (fullString.includes("penawaran")) return "mdi-handshake";
  if (fullString.includes("pengajuan")) return "mdi-file-clock";
  if (fullString.includes("stok") || fullString.includes("stock")) return "mdi-package-variant";
  if (fullString.includes("mutasi")) return "mdi-transfer";
  if (fullString.includes("piutang") || fullString.includes("bayar")) return "mdi-cash-multiple";
  if (fullString.includes("laporan")) return "mdi-chart-line";
  if (fullString.includes("gudang") || fullString.includes("dc")) return "mdi-warehouse";
  if (fullString.includes("daftar") || fullString.includes("master")) return "mdi-database";
  if (fullString.includes("user") || fullString.includes("pengguna")) return "mdi-account-group";
  if (fullString.includes("setting") || fullString.includes("pengaturan")) return "mdi-cog";
  if (fullString.includes("retur")) return "mdi-keyboard-return";
  if (fullString.includes("surat-jalan")) return "mdi-truck-delivery";

  // Default
  return "mdi-star-circle-outline";
};

// Navigation Guard (Satpam Router)
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const loggedIn = authStore.isAuthenticated;
  const allowedMenus = authStore.allowedMenus || [];

  if (loggedIn && authStore.isTokenExpired) {
    authStore.logout(); // Panggil aksi logout
    return; // Hentikan navigasi lebih lanjut, karena logout akan redirect ke /login
  }

  // Hindari infinite loop - jangan proses route yang sama berulang
  if (from.path === to.path) {
    return next();
  }

  // console.log("[ROUTER] Navigating to:", to.name, "path:", to.path);

  const title = to.meta?.title || to.name || "Retail";
  document.title = `${title} - Retail Kaosan`;

  // Izinkan akses ke halaman cetak manapun, terutama jika dari backend
  if (to.meta.printLayout) {
    return next();
  }

  // Route yang tidak memerlukan auth
  if (!to.meta?.requiresAuth) {
    return next();
  }

  // [TAMBAHKAN INI]
  // Jika di mode tracking tapi mencoba akses halaman yang butuh login
  if (isTrackingMode && to.meta?.requiresAuth) {
    return next("/"); // Lempar balik ke home tracking
  }

  // Belum login, redirect ke login
  if (!loggedIn) {
    // console.log("[ROUTER] Not logged in, redirect to login");
    return next("/login");
  }

  // Sudah login tapi akses login page
  if (to.name === "Login" && loggedIn) {
    // console.log("[ROUTER] Already logged in, redirect to home");
    return next("/");
  }

  // Cek akses untuk route yang memerlukan permission
  if (to.meta?.menuId) {
    const hasPermission = allowedMenus.includes(to.meta.menuId);
    if (!hasPermission) {
      // console.log("[ROUTER] No permission for menuId:", to.meta.menuId);
      return next({ name: "Unauthorized" }); // redirect ke home, bukan unauthorized
    }
  }
  next();
});

// --- NAVIGATION LOGGING ---
// Mencatat setiap perpindahan halaman ke backend untuk fitur "Sering Diakses"
router.afterEach((to) => {
  const authStore = useAuthStore();

  // Syarat pencatatan:
  // 1. User sedang login (isAuthenticated)
  // 2. Halaman memiliki judul (meta.title)
  // 3. Bukan halaman Login, Home (Dashboard), atau Unauthorized
  // 4. Bukan halaman cetak (printLayout)
  if (
    authStore.isAuthenticated &&
    to.meta &&
    to.meta.title &&
    to.name !== "Login" &&
    to.name !== "Home" &&
    to.name !== "Unauthorized" &&
    !to.meta.printLayout
  ) {
    // Kirim data secara background (tanpa await) agar transisi halaman tetap ngebut
    // Gunakan fullPath agar parameter query string (jika ada) tidak membuat duplikat
    // Tapi untuk grouping menu, lebih baik pakai 'path' atau 'name'.
    // Di sini kita pakai 'path' untuk konsistensi.

    // Tentukan icon: Bisa ambil dari meta.icon (jika nanti Anda tambahkan)
    // atau biarkan backend/frontend handle default icon.
    // Di sini kita kirim default string jika meta.icon tidak ada.
    const autoIcon = getSmartIcon(to);

    api
      .post("/activity/log-menu", {
        title: to.meta.title,
        path: to.path,
        icon: autoIcon,
      })
      .catch(() => {
        // Error logging diabaikan saja (silent fail) agar tidak mengganggu user
      });
  }
});

// [TAMBAHKAN DI SINI] --- AUTO RELOAD ON CHUNK ERROR ---
// Menangani error MIME type "text/html" saat ada update aplikasi
router.onError((error, to) => {
  const errors = [
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "Expected a JavaScript-or-Wasm module script",
  ];

  if (errors.some((msg) => error.message.includes(msg))) {
    // Paksa browser memuat ulang halaman ke tujuan yang dimaksud
    // Ini akan mengambil peta file (manifest) yang paling baru dari server
    window.location.href = to.fullPath;
  }
});

export default router;
