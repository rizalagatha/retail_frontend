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
import PriceProposalView from '@/views/PriceProposalView.vue';
import PriceProposalCreateView from '@/views/PriceProposalCreateView.vue';

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
    path: '/manual',
    name: 'Manual Program',
    component: ManualProgramView,
    meta: { 
      title: 'Petunjuk Penggunaan',
      requiresAuth: true,
      public: true 
    }
  },
  {
    path: '/history-updates',
    name: 'Riwayat Update',
    component: HistoryUpdateView,
    meta: { 
      title: 'Riwayat Update',
      requiresAuth: true,
      public: true 
    }
  },
  {
    path: '/update-program',
    name: 'Cek Versi',
    component: VersionCheckView,
    meta: { 
      title : 'Cek Versi',
      requiresAuth: true,
      public: true
    }
  },
  {
    path: '/update-buffer-stock',
    name: 'Update Buffer Stok',
    component: UpdateBufferStockView,
    meta: { 
      title: 'Update Buffer Stok',
      requiresAuth: true,
      public: true 
    }
  },
  {
    path: '/settings',
    name: 'frmPengaturan',
    component: SettingsProcessView,
    meta: { 
      title: 'Setting',
      requiresAuth: true,
      menuId: '3' 
    }
  },
  {
    path: '/users',
    name: 'frmUser',
    component: UserManagementView,
    meta: { 
      title: 'Master User',
      requiresAuth: true,
      menuId: '1' 
    }
  },
  {
    path: '/ganti-password',
    name: 'Ganti Password',
    component: ChangePasswordView,
    meta: { 
      title: 'Ganti Password',
      requiresAuth: true,
      public: true 
    }
  },
  {
    path: '/customers',
    name: 'frmBrowCus',
    component: CustomerView,
    meta: {
      requiresAuth: true,
      title: 'Master Customer',
      menuId: '9'
    },
  },
  {
    path: '/members',
    name: 'frmBrowMember',
    component: MemberView,
    meta: {
      requiresAuth: true,
      title: 'Master Member',
      menuId: '7',
    },
  },
  {
    path: '/suppliers',
    name: 'frmBrowSupplier',
    component: SupplierView,
    meta: {
      requiresAuth: true,
      title: 'Master Supplier',
      menuId: '8'
    },
  },
  {
    path: '/sales-counters',
    name: 'frmBrowSC',
    component: SalesCounterView,
    meta: {
      requiresAuth: true,
      title: 'Master Sales Counter',
      menuId: '10'
    },
  },
  {
    path: '/cetak-barcode',
    name: 'frmBrowBcd',
    component: BarcodePrintView,
    meta: {
      requiresAuth: true,
      title: 'Cetak Barcode',
      menuId: '11'
    },
  },
  {
    path: '/cetak-barcode/new', // Rute untuk form baru
    name: 'Buat Barcode',
    component: BarcodeCreateView,
    meta: { 
      title: 'Buat Barcode',
      requiresAuth: true 
    }
  },
  {
    path: '/penawaran',
    name: 'frmBrowPenawaran',
    component: OfferView,
    meta: {
      requiresAuth: true,
      title: 'Penawaran',
      menuId: '42'
    },
  },
  {
    path: '/penawaran/new', // Rute untuk form baru
    name: 'Buat Penawaran',
    component: OfferCreateView,
    meta: { 
      title: 'Buat Penawaran',
      requiresAuth: true 
    }
  },
  {
    path: '/penawaran/ubah/:nomor', // Halaman ubah
    name: 'Ubah Penawaran',
    component: OfferCreateView,
    meta: { 
      title: 'Ubah Penawaran',
      requiresAuth: true 
    }
  },
  {
    path: '/pengajuan-harga',
    name: 'frmBrowPengajuanHarga',
    component: PriceProposalView,
    meta: { 
      title: 'Pengajuan Harga',
      requiresAuth: true,
      menuId: '38' 
    }
  },
  {
    path: '/pengajuan-harga/new',
    name: 'Buat Pengajuan Harga',
    component: PriceProposalCreateView,
    meta: { 
      title: 'Buat Pengajuan Harga',
      requiresAuth: true 
    }
  },
  {
    path: '/pengajuan-harga/ubah/:nomor',
    name: 'Ubah Pengajuan Harga',
    component: PriceProposalCreateView,
    meta: { 
      title: 'Ubah Pengajuan Harga',
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
