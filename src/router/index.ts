import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';

// Impor semua komponen View/halaman Anda
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
import LaporanStokView from '@/views/LaporanStokView.vue';

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
    meta: { requiresAuth: true }
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
    path: '/transaksi/penawaran',
    name: 'frmBrowPenawaran',
    component: OfferView,
    meta: {
      requiresAuth: true,
      title: 'Penawaran',
      menuId: '42'
    },
  },
  {
    path: '/transaksi/penawaran/new', // Rute untuk form baru
    name: 'Buat Penawaran',
    component: OfferCreateView,
    meta: {
      title: 'Buat Penawaran',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penawaran/ubah/:nomor', // Halaman ubah
    name: 'Ubah Penawaran',
    component: OfferCreateView,
    meta: {
      title: 'Ubah Penawaran',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/penawaran/print/:nomor',
    name: 'Cetak Penawaran',
    component: OfferPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/pengajuan/pengajuan-harga',
    name: 'frmBrowPengajuanHarga',
    component: PriceProposalView,
    meta: {
      title: 'Pengajuan Harga',
      requiresAuth: true,
      menuId: '38'
    }
  },
  {
    path: '/transaksi/pengajuan/pengajuan-harga/new',
    name: 'Buat Pengajuan Harga',
    component: PriceProposalCreateView,
    meta: {
      title: 'Buat Pengajuan Harga',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/pengajuan/pengajuan-harga/ubah/:nomor',
    name: 'Ubah Pengajuan Harga',
    component: PriceProposalCreateView,
    meta: {
      title: 'Ubah Pengajuan Harga',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/pengajuan/setting-harga',
    name: 'frmBrowSettingHarga',
    component: SettingHargaView,
    meta: {
      title: 'Setting Harga',
      requiresAuth: true,
      menuId: '39'
    }
  },
  {
    path: '/transaksi/dtf/so-dtf',
    name: 'frmBrowSODTF',
    component: SoDtfView,
    meta: {
      title: 'SO DTF Pesanan',
      requiresAuth: true,
      menuId: '35'
    }
  },
  {
    path: '/transaksi/dtf/so-dtf/new',
    name: 'Buat SO DTF Pesanan',
    component: SoDtfCreateView,
    meta: {
      title: 'Buat SO DTF Pesanan',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/dtf/so-dtf/ubah/:nomor',
    name: 'Ubah SO DTF Pesanan',
    component: SoDtfCreateView,
    meta: {
      title: 'Ubah SO DTF Pesanan',
      requiresAuth: true
    }
  },
  {
    path: '/transaksi/dtf/so-dtf/print/:nomor',
    name: 'Cetak SO DTF',
    component: SoDtfPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
    }
  },
  {
    path: '/transaksi/dtf/lhk-so-dtf',
    name: 'frmBrowDTF',
    component: LhkSoDtfView,
    meta: {
      title: 'LHK SO DTF',
      requiresAuth: true,
      menuId: '41'
    }
  },
  {
    path: '/transaksi/dtf/lhk-so-dtf/edit',
    name: 'LhkSoDtfCreate',
    component: LhkSoDtfCreateView,
    meta: {
      title: 'Form LHK SO DTF',
      requiresAuth: true,
      menuId: '41'
    }
  },
  {
    path: '/transaksi/dtf/dasbor-dtf',
    name: 'frmLapDasborDtf',
    component: DasborDtfView,
    meta: {
      title: 'Dasbor DTF',
      requiresAuth: true,
      menuId: '40'
    }
  },
  {
    path: '/transaksi/dtf/so-dtf-stok',
    name: 'SoDtfStok',
    component: SoDtfStokView,
    meta: {
      title: 'SO DTF Stok',
      requiresAuth: true,
      menuId: '36' // ID Menu untuk SO DTF Stok
    }
  },
  {
    path: '/transaksi/dtf/so-dtf-stok/new',
    name: 'SoDtfStokCreate',
    component: SoDtfStokCreateView,
    meta: {
      title: 'Buat SO DTF Stok',
      requiresAuth: true,
      menuId: '36'
    }
  },
  {
    path: '/transaksi/dtf/so-dtf-stok/ubah/:nomor',
    name: 'SoDtfStokEdit',
    component: SoDtfStokCreateView,
    meta: {
      title: 'Ubah SO DTF Stok',
      requiresAuth: true,
      menuId: '36'
    }
  },
  {
    path: '/transaksi/dtf/so-dtf-stok/print/:nomor',
    name: 'Cetak SO DTF Stok',
    component: SoDtfStokPrintView,
    meta: {
      requiresAuth: true,
      printLayout: true
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
