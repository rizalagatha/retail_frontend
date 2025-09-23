import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';

// Impor semua komponen View/halaman Anda
import DaftarIndex from '@/views/DaftarIndex.vue';
import LoginView from '../views/LoginView.vue';
import HomeView from '../views/HomeView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import UnauthorizedView from '@/views/UnauthorizedView.vue';
import ManualProgramView from '../views/ManualProgramView.vue';
import HistoryUpdateView from '../views/HistoryUpdateView.vue';
import VersionCheckView from '../views/VersionCheckView.vue';
import UpdateBufferStockView from '../views/UpdateBufferStockView.vue';
import SettingsProcessView from '../views/SettingsProcessView.vue';
import UserManagementView from '../views/UserManagementView.vue';
import ChangePasswordView from '../views/ChangePasswordView.vue';
import CustomerView from '@/views/CustomerView.vue';
import MemberView from '@/views/MemberView.vue';
import SupplierView from '@/views/SupplierView.vue';
import SalesCounterView from '@/views/SalesCounterView.vue';
import BarcodePrintView from '@/views/BarcodePrintView.vue';
import BarcodeCreateView from '../views/BarcodeCreateView.vue';
import OfferView from '@/views/OfferView.vue';
import OfferCreateView from '@/views/OfferCreateView.vue';
import OfferPrintView from '@/views/OfferPrintView.vue';
import PriceProposalView from '@/views/PriceProposalView.vue';
import PriceProposalCreateView from '@/views/PriceProposalCreateView.vue';
import SettingHargaView from '@/views/SettingHargaView.vue';
import SoDtfView from '@/views/SoDtfView.vue';
import SoDtfCreateView from '@/views/SoDtfCreateView.vue';
import SoDtfPrintView from '@/views/SoDtfPrintView.vue';
import LhkSoDtfView from '@/views/LhkSoDtfView.vue';
import LhkSoDtfCreateView from '@/views/LhkSoDtfCreateView.vue';
import DasborDtfView from '@/views/DasborDtfView.vue';
import SoDtfStokView from '@/views/SoDtfStokView.vue';
import SoDtfStokCreateView from '@/views/SoDtfStokCreateView.vue';
import SoDtfStokPrintView from '@/views/SoDtfStokPrintView.vue';
import LhkSoDtfStokView from '@/views/LhkSoDtfStokView.vue';
import LhkSoDtfStokCreateView from '@/views/LhkSoDtfStokCreateView.vue';
import SoView from '@/views/SoView.vue';
import SoPrintView from '@/views/SoPrintView.vue';
import SoCreateView from '@/views/SoCreateView.vue';
import DpPrintView from '@/views/DpPrintView.vue';
import BufferStokView from '@/views/BufferStokView.vue';
import MutasiOutView from '@/views/MutasiOutView.vue';
import MutasiOutPrintView from '@/views/MutasiOutPrintView.vue';
import MutasiOutCreateView from '@/views/MutasiOutCreateView.vue';
import MintaBarangView from '@/views/MintaBarangView.vue';
import MintaBarangCreateView from '@/views/MintaBarangCreateView.vue';
import SuratJalanView from '@/views/SuratJalanView.vue';
import SuratJalanPrintView from '@/views/SuratJalanPrintView.vue';
import SuratJalanCreateView from '@/views/SuratJalanCreateView.vue';
import TerimaSjView from '@/views/TerimaSJView.vue';
import TerimaSjFormView from '@/views/TerimaSJFormView.vue';
import MutasiInView from '@/views/MutasiInView.vue';
import MutasiInPrintView from '@/views/MutasiInPrintView.vue';
import MutasiInCreateView from '@/views/MutasiInCreateView.vue';
import MutasiStokView from '@/views/MutasiStokView.vue';
import MutasiStokCreateView from '@/views/MutasiStokCreateView.vue';
import MutasiStokPrintView from '@/views/MutasiStokPrintView.vue';
import SetoranBayarView from '@/views/SetoranBayarView.vue';
import SetoranBayarCreateView from '@/views/SetoranBayarCreateView.vue';
import FskView from '@/views/FskView.vue';
import FskCreateView from '@/views/FskCreateView.vue';
import FskPrintView from '@/views/FskPrintView.vue';
import InvoiceView from '@/views/InvoiceView.vue';
import InvoiceCreateView from '@/views/InvoiceCreateView.vue';
import InvoicePrintView from '@/views/InvoicePrintView.vue';
import InvoicePrintKasirView from '@/views/InvoicePrintKasirView.vue';
import InvoicePrintImageView from '@/views/InvoicePrintImageView.vue';
import InvoiceAsSjPrintView from '@/views/InvoiceAsSjPrintView.vue';
import LaporanStokView from '@/views/LaporanStokView.vue';
import WhatsappLinkView from '@/views/WhatsappLinkView.vue';
import KuponPrintView from '@/views/KuponPrintView.vue';
import VoucherPrintView from '@/views/VoucherPrintView.vue';
import MutasiStoreKirimView from '@/views/MutasiStoreKirimView.vue';


const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: {
      title: 'Login'
    }
  },
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: {
      title: 'Beranda',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/unauthorized',
    name: 'Unauthorized',
    component: UnauthorizedView,
    meta: {
      requiresAuth: true
    }
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFoundView
  },
  {
    path: '/file/manual',
    name: 'Manual Program',
    component: ManualProgramView,
    meta: {
      title: 'Petunjuk Penggunaan',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/file/history-updates',
    name: 'Riwayat Update',
    component: HistoryUpdateView,
    meta: {
      title: 'Riwayat Update',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/user/update-program',
    name: 'Cek Versi',
    component: VersionCheckView,
    meta: {
      title: 'Cek Versi',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/file/update-buffer-stock',
    name: 'Update Buffer Stok',
    component: UpdateBufferStockView,
    meta: {
      title: 'Update Buffer Stok',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/file/settings',
    name: 'frmPengaturan',
    component: SettingsProcessView,
    meta: {
      title: 'Setting',
      requiresAuth: true,
      menuId: '3'
    }
  },
  {
    path: '/file/users',
    name: 'frmUser',
    component: UserManagementView,
    meta: {
      title: 'Master User',
      requiresAuth: true,
      menuId: '1'
    }
  },
  {
    path: '/user/ganti-password',
    name: 'Ganti Password',
    component: ChangePasswordView,
    meta: {
      title: 'Ganti Password',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/daftar',
    name: 'DaftarIndex',
    component: DaftarIndex,
    meta: {
      title: 'Menu Master Data',
      requiresAuth: true
      // menuId tidak diperlukan di sini karena ini adalah halaman navigasi
    }
  },
  {
    path: '/daftar/customers',
    name: 'frmBrowCus',
    component: CustomerView,
    meta: {
      requiresAuth: true,
      title: 'Master Customer',
      menuId: '9'
    },
  },
  {
    path: '/daftar/members',
    name: 'frmBrowMember',
    component: MemberView,
    meta: {
      requiresAuth: true,
      title: 'Master Member',
      menuId: '7',
    },
  },
  {
    path: '/daftar/suppliers',
    name: 'frmBrowSupplier',
    component: SupplierView,
    meta: {
      requiresAuth: true,
      title: 'Master Supplier',
      menuId: '8'
    },
  },
  {
    path: '/daftar/sales-counters',
    name: 'frmBrowSC',
    component: SalesCounterView,
    meta: {
      requiresAuth: true,
      title: 'Master Sales Counter',
      menuId: '10'
    },
  },
  {
    path: '/daftar/cetak-barcode',
    name: 'frmBrowBcd',
    component: BarcodePrintView,
    meta: {
      requiresAuth: true,
      title: 'Cetak Barcode',
      menuId: '11'
    },
  },
  {
    path: '/daftar/cetak-barcode/new', // Rute untuk form baru
    name: 'Buat Barcode',
    component: BarcodeCreateView,
    meta: {
      title: 'Buat Barcode',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/penawaran',
    name: 'frmBrowPenawaran',
    component: OfferView,
    meta: {
      requiresAuth: true,
      title: 'Penawaran',
      menuId: '42'
    },
  },
  {
    path: '/transaksi/penjualan/penawaran/new', // Rute untuk form baru
    name: 'Buat Penawaran',
    component: OfferCreateView,
    meta: {
      title: 'Buat Penawaran',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/penawaran/ubah/:nomor', // Halaman ubah
    name: 'Ubah Penawaran',
    component: OfferCreateView,
    meta: {
      title: 'Ubah Penawaran',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/penawaran/print/:nomor',
    name: 'Cetak Penawaran',
    component: OfferPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/pengajuan/pengajuan-harga',
    name: 'frmBrowPengajuanHarga',
    component: PriceProposalView,
    meta: {
      title: 'Pengajuan Harga',
      requiresAuth: true,
      menuId: '38'
    }
  },
  {
    path: '/transaksi/penjualan/pengajuan/pengajuan-harga/new',
    name: 'Buat Pengajuan Harga',
    component: PriceProposalCreateView,
    meta: {
      title: 'Buat Pengajuan Harga',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/pengajuan/pengajuan-harga/ubah/:nomor',
    name: 'Ubah Pengajuan Harga',
    component: PriceProposalCreateView,
    meta: {
      title: 'Ubah Pengajuan Harga',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/pengajuan/setting-harga',
    name: 'frmBrowSettingHarga',
    component: SettingHargaView,
    meta: {
      title: 'Setting Harga',
      requiresAuth: true,
      menuId: '39'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf',
    name: 'frmBrowSODTF',
    component: SoDtfView,
    meta: {
      title: 'SO DTF Pesanan',
      requiresAuth: true,
      menuId: '35'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf/new',
    name: 'Buat SO DTF Pesanan',
    component: SoDtfCreateView,
    meta: {
      title: 'Buat SO DTF Pesanan',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf/ubah/:nomor',
    name: 'Ubah SO DTF Pesanan',
    component: SoDtfCreateView,
    meta: {
      title: 'Ubah SO DTF Pesanan',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf/print/:nomor',
    name: 'Cetak SO DTF',
    component: SoDtfPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/dtf/lhk-so-dtf',
    name: 'frmBrowDTF',
    component: LhkSoDtfView,
    meta: {
      title: 'LHK SO DTF',
      requiresAuth: true,
      menuId: '41'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/lhk-so-dtf/edit',
    name: 'LhkSoDtfCreate',
    component: LhkSoDtfCreateView,
    meta: {
      title: 'Form LHK SO DTF',
      requiresAuth: true,
      menuId: '41'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/dasbor-dtf',
    name: 'frmLapDasborDtf',
    component: DasborDtfView,
    meta: {
      title: 'Dasbor DTF',
      requiresAuth: true,
      menuId: '40'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf-stok',
    name: 'SoDtfStok',
    component: SoDtfStokView,
    meta: {
      title: 'SO DTF Stok',
      requiresAuth: true,
      menuId: '36'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf-stok/new',
    name: 'SoDtfStokCreate',
    component: SoDtfStokCreateView,
    meta: {
      title: 'Buat SO DTF Stok',
      requiresAuth: true,
      menuId: '36'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf-stok/ubah/:nomor',
    name: 'SoDtfStokEdit',
    component: SoDtfStokCreateView,
    meta: {
      title: 'Ubah SO DTF Stok',
      requiresAuth: true,
      menuId: '36'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/so-dtf-stok/print/:nomor',
    name: 'Cetak SO DTF Stok',
    component: SoDtfStokPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/dtf/lhk-so-dtf-stok',
    name: 'LhkSoDtfStok',
    component: LhkSoDtfStokView,
    meta: {
      title: 'LHK SO DTF Stok',
      requiresAuth: true,
      menuId: '48'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/lhk-so-dtf-stok/new',
    name: 'LhkSoDtfStokCreate',
    component: LhkSoDtfStokCreateView,
    meta: {
      title: 'Buat LHK SO DTF Stok',
      requiresAuth: true,
      menuId: '48'
    }
  },
  {
    path: '/transaksi/penjualan/dtf/lhk-so-dtf-stok/ubah/:nomor',
    name: 'LhkSoDtfStokEdit',
    component: LhkSoDtfStokCreateView,
    meta: {
      title: 'Ubah LHK SO DTF Stok',
      requiresAuth: true,
      menuId: '48'
    }
  },
  {
    path: '/transaksi/penjualan/surat-pesanan',
    name: 'frmBrowseSo',
    component: SoView,
    meta: {
      title: 'Surat Pesanan',
      requiresAuth: true,
      menuId: '26'
    }
  },
  {
    path: '/transaksi/penjualan/surat-pesanan/print/:nomor',
    name: 'Cetak Surat Pesanan',
    component: SoPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/surat-pesanan/new',
    name: 'SuratPesananCreate',
    component: SoCreateView,
    meta: {
      title: 'Buat Surat Pesanan',
      requiresAuth: true,
      menuId: '26'
    }
  },
  {
    path: '/transaksi/penjualan/surat-pesanan/ubah/:nomor',
    name: 'SuratPesananEdit',
    component: SoCreateView,
    meta: {
      title: 'Ubah Surat Pesanan',
      requiresAuth: true,
      menuId: '26'
    }
  },
  {
    path: '/transaksi/penjualan/surat-pesanan/print-dp/:nomor',
    name: 'Cetak DP',
    component: DpPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/internal/buffer-stok',
    name: 'BufferStok',
    component: BufferStokView,
    meta: {
      title: 'Buffer Stok',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/mutasi/out-produksi',
    name: 'frmBrowMutasiOut',
    component: MutasiOutView,
    meta: {
      title: 'Mutasi Out ke Produksi',
      requiresAuth: true,
      menuId: '43'
    }
  },
  {
    path: '/transaksi/mutasi/out-produksi/new',
    name: 'MutasiOutProduksiCreate',
    component: MutasiOutCreateView,
    meta: {
      title: 'Buat Mutasi Out',
      requiresAuth: true,
      menuId: '43'
    }
  },
  {
    path: '/transaksi/mutasi/out-produksi/ubah/:nomor',
    name: 'MutasiOutProduksiEdit',
    component: MutasiOutCreateView,
    meta: {
      title: 'Ubah Mutasi Out',
      requiresAuth: true,
      menuId: '43'
    }
  },
  {
    path: '/transaksi/mutasi/out-produksi/print/:nomor',
    name: 'Cetak Mutasi Out',
    component: MutasiOutPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true // Flag untuk layout khusus cetak
    }
  },
  {
    path: '/transaksi/internal/minta-barang', // Sesuaikan path jika perlu
    name: 'ufrmBrowMintaBarang',
    component: MintaBarangView,
    meta: {
      title: 'Minta Barang ke DC',
      requiresAuth: true,
      menuId: '37'
    }
  },
  {
    path: '/transaksi/internal/minta-barang/new',
    name: 'MintaBarangCreate',
    component: MintaBarangCreateView,
    meta: {
      title: 'Buat Minta Barang ke DC',
      requiresAuth: true,
      menuId: '37'
    }
  },
  {
    path: '/transaksi/internal/minta-barang/ubah/:nomor',
    name: 'MintaBarangEdit',
    component: MintaBarangCreateView,
    meta: {
      title: 'Ubah Minta Barang ke DC',
      requiresAuth: true,
      menuId: '37'
    }
  },
  {
    path: '/gudang-dc/operasional/surat-jalan-store',
    name: 'SuratJalanStore',
    component: SuratJalanView,
    meta: {
      title: 'Surat Jalan ke Store',
      requiresAuth: true,
      menuId: '213'
    }
  },
  {
    path: '/gudang-dc/operasional/surat-jalan-store/print/:nomor',
    name: 'Cetak Surat Jalan',
    component: SuratJalanPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true // Flag untuk layout khusus cetak
    }
  },
  {
    path: '/gudang-dc/operasional/surat-jalan-store/new',
    name: 'SuratJalanCreate',
    component: SuratJalanCreateView,
    meta: {
      title: 'Buat Surat Jalan ke Store',
      requiresAuth: true,
      menuId: '213'
    }
  },
  {
    path: '/gudang-dc/operasional/surat-jalan-store/ubah/:nomor',
    name: 'SuratJalanEdit',
    component: SuratJalanCreateView,
    meta: {
      title: 'Ubah Surat Jalan ke Store',
      requiresAuth: true,
      menuId: '213'
    }
  },
  {
    path: '/transaksi/internal/terima-sj',
    name: 'TerimaSj',
    component: TerimaSjView,
    meta: {
      title: 'Terima SJ dari DC',
      requiresAuth: true,
      menuId: '31'
    }
  },
  {
    path: '/transaksi/internal/terima-sj/create/:nomor',
    name: 'TerimaSjCreate',
    component: TerimaSjFormView,
    meta: {
      title: 'Buat Terima SJ',
      requiresAuth: true,
      menuId: '31'
    }
  },
  {
    path: '/transaksi/mutasi/in-produksi',
    name: 'MutasiIn',
    component: MutasiInView,
    meta: {
      title: 'Mutasi In dari Produksi',
      requiresAuth: true,
      menuId: '44'
    }
  },
  {
    path: '/transaksi/mutasi/in-produksi/new',
    name: 'MutasiInCreate',
    component: MutasiInCreateView,
    meta: {
      title: 'Buat Mutasi In',
      requiresAuth: true,
      menuId: '44'
    }
  },
  {
    path: '/transaksi/mutasi/in-produksi/edit/:nomor',
    name: 'MutasiInEdit',
    component: MutasiInCreateView,
    meta: {
      title: 'Ubah Mutasi In',
      requiresAuth: true,
      menuId: '44'
    }
  },
  {
    path: '/transaksi/mutasi/in-produksi/print/:nomor',
    name: 'Cetak Mutasi In',
    component: MutasiInPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/mutasi/stok',
    name: 'MutasiStok',
    component: MutasiStokView,
    meta: {
      title: 'Mutasi Stok',
      requiresAuth: true,
      menuId: '45'
    }
  },
  {
    path: '/transaksi/mutasi/stok/new',
    name: 'MutasiStokCreate',
    component: MutasiStokCreateView,
    meta: {
      title: 'Buat Mutasi Stok',
      requiresAuth: true,
      menuId: '45'
    }
  },
  {
    path: '/transaksi/mutasi/stok/edit/:nomor',
    name: 'MutasiStokEdit',
    component: MutasiStokCreateView,
    meta: {
      title: 'Ubah Mutasi Stok',
      requiresAuth: true,
      menuId: '45'
    }
  },
  {
    path: '/transaksi/mutasi/stok/print/:nomor',
    name: 'Cetak Mutasi Stok',
    component: MutasiStokPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/piutang/setoran-pembayaran',
    name: 'SetoranBayar',
    component: SetoranBayarView,
    meta: {
      title: 'Setoran Pembayaran',
      requiresAuth: true,
      menuId: '51'
    }
  },
  {
    path: '/piutang/setoran-pembayaran/new',
    name: 'SetoranBayarCreate',
    component: SetoranBayarCreateView,
    meta: {
      title: 'Buat Setoran Pembayaran',
      requiresAuth: true,
      menuId: '51'
    }
  },
  {
    path: '/piutang/setoran-pembayaran/edit/:nomor',
    name: 'SetoranBayarEdit',
    component: SetoranBayarCreateView,
    meta: {
      title: 'Ubah Setoran Pembayaran',
      requiresAuth: true,
      menuId: '51'
    }
  },
  {
    path: '/piutang/setoran-pembayaran/print/:nomor',
    name: 'CetakSetoranBayar',
    component: DpPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/piutang/fsk',
    name: 'Fsk',
    component: FskView,
    meta: {
      title: 'Form Setoran Kasir',
      requiresAuth: true,
      menuId: '54'
    }
  },
  {
    path: '/piutang/fsk/new',
    name: 'FskCreate',
    component: FskCreateView,
    meta: {
      title: 'Buat Form Setoran Kasir',
      requiresAuth: true,
      menuId: '54'
    }
  },
  {
    path: '/piutang/fsk/edit/:nomor',
    name: 'FskEdit',
    component: FskCreateView,
    meta: {
      title: 'Ubah Form Setoran Kasir',
      requiresAuth: true,
      menuId: '54'
    }
  },
  {
    path: '/piutang/fsk/print/:nomor',
    name: 'FskPrint',
    component: FskPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/invoice',
    name: 'Invoice',
    component: InvoiceView,
    meta: {
      title: 'Invoice',
      requiresAuth: true,
      menuId: '27'
    }
  },
  {
    path: '/transaksi/penjualan/invoice/new',
    name: 'InvoiceCreate',
    component: InvoiceCreateView,
    meta: {
      title: 'Buat Invoice Baru',
      requiresAuth: true,
      menuId: '27'
    }
  },
  {
    path: '/transaksi/penjualan/invoice/edit/:nomor',
    name: 'InvoiceEdit',
    component: InvoiceCreateView,
    meta: {
      title: 'Ubah Invoice',
      requiresAuth: true,
      menuId: '27'
    }
  },
  {
    path: '/transaksi/penjualan/invoice/print/:nomor',
    name: 'InvoicePrint',
    component: InvoicePrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/invoice/print-kasir/:nomor',
    name: 'InvoicePrintKasir',
    component: InvoicePrintKasirView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/penjualan/invoice/image-kasir/:nomor',
    name: 'InvoicePrintImageView',
    component: InvoicePrintImageView,
    meta: {
      printLayout: true,
    }
  },
  {
    path: '/invoice/print-kupon/:nomor',
    name: 'CetakKupon',
    component: KuponPrintView,
    meta: { printLayout: true, requiresAuth: true }
  },
  {
    path: '/invoice/print-voucher/:nomor',
    name: 'CetakVoucher',
    component: VoucherPrintView,
    meta: { printLayout: true, requiresAuth: true }
  },
  {
    path: '/transaksi/penjualan/invoice/print-sj/:nomor',
    name: 'CetakInvoiceAsSJ',
    component: InvoiceAsSjPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/mutasi/store-kirim',
    name: 'MutasiKirim',
    component: MutasiStoreKirimView,
    meta: {
      title: 'Mutasi Antar Store Kirim',
      requiresAuth: true,
      menuId: '46' // Pastikan ID ini sesuai dengan yang ada di database
    }
  },
  {
    path: '/laporan/stok',
    name: 'frmRptStok',
    component: LaporanStokView,
    meta: {
      title: 'Laporan Stok Real Time',
      requiresAuth: true,
      menuId: '501'
    }
  },
  {
    path: '/pengaturan/whatsapp',
    name: 'WhatsappLink',
    component: WhatsappLinkView,
    meta: {
      title: 'Tautkan Perangkat WhatsApp',
      requiresAuth: true
    }
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation Guard (Satpam Router)
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const allowedMenus = authStore.allowedMenus || [];

  // Hindari infinite loop - jangan proses route yang sama berulang
  if (from.path === to.path) {
    return next();
  }

  // console.log("[ROUTER] Navigating to:", to.name, "path:", to.path);

  const title = to.meta?.title || to.name || 'Retail';
  document.title = `${title} - Retail Kaosan`;

  const loggedIn = authStore.isAuthenticated;

  // Izinkan akses ke halaman cetak manapun, terutama jika dari backend
  if (to.meta.printLayout) {
    return next();
  }

  // Route yang tidak memerlukan auth
  if (!to.meta?.requiresAuth) {
    return next();
  }

  // Belum login, redirect ke login
  if (!loggedIn) {
    // console.log("[ROUTER] Not logged in, redirect to login");
    return next('/login');
  }

  // Sudah login tapi akses login page
  if (to.name === 'Login' && loggedIn) {
    // console.log("[ROUTER] Already logged in, redirect to home");
    return next('/');
  }

  // Cek akses untuk route yang memerlukan permission
  if (to.meta?.menuId) {
    const hasPermission = allowedMenus.includes(to.meta.menuId);
    if (!hasPermission) {
      // console.log("[ROUTER] No permission for menuId:", to.meta.menuId);
      return next({ name: 'Unauthorized' }); // redirect ke home, bukan unauthorized
    }
  }

  // Route public atau sudah punya akses
  // console.log("[ROUTER] Access granted to:", to.name);
  next();
});

export default router;
