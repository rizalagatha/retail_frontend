<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import logoSrc from '@/assets/logo.png'

interface NavItem {
  title: string
  to?: string
  icon?: string
  divider?: boolean
  subItems?: NavItem[]  // <— penting
}

// Stores and composables
const authStore = useAuthStore()
const router = useRouter()

// Component state
const scrolled = ref(false)
const fileMenu = ref(false)
const daftarMenu = ref(false)
const transaksiMenu = ref(false)
const piutangMenu = ref(false)
const gudangMenu = ref(false)
const laporanMenu = ref(false)
const userMenu = ref(false)

// Computed properties
const appBarElevation = computed(() => scrolled.value ? 2 : 0)
const appBarClass = computed(() => ({
  'navbar-scrolled': scrolled.value
}))

// Access control helper
const hasAccess = (routeNameOrPath?: string) => {
  if (!routeNameOrPath) return true;

  const authStore = useAuthStore();
  const route = router.getRoutes().find(
    r => r.name === routeNameOrPath || r.path === routeNameOrPath
  );

  if (!route) return false;

  // Jika route tidak memerlukan login sama sekali, selalu tampilkan.
  if (!route.meta.requiresAuth) {
    return true;
  }

  // Jika route butuh login, cek apakah user sudah login.
  if (!authStore.isAuthenticated) {
    return false;
  }

  // Jika route butuh izin spesifik (punya menuId), cek izinnya.
  if (route.meta.menuId) {
    return authStore.allowedMenus.includes(route.meta.menuId as string);
  }

  // Jika sampai di sini, artinya route butuh login tapi tidak butuh izin spesifik.
  // Karena user sudah login, maka tampilkan menunya.
  return true;
};

// Menu configuration
const menuItems = [
  {
    title: 'File',
    icon: 'mdi-file-outline',
    model: fileMenu,
    items: [
      { title: 'Manual Program', to: '/file/manual', icon: 'mdi-book-open-outline' },
      { title: 'History Update Program', to: '/file/history-updates', icon: 'mdi-history' },
      { title: 'Update Buffer Stok', to: '/file/update-buffer-stock', icon: 'mdi-database-sync' },
      { title: 'Setting', to: '/file/settings', icon: 'mdi-cog-outline' },
      { divider: true },
      { title: 'User', to: '/file/users', icon: 'mdi-account-group-outline' }
    ]
  },
  {
    title: 'Daftar',
    icon: 'mdi-clipboard-list-outline',
    model: daftarMenu,
    items: [
      { title: 'Customer', to: '/daftar/customers', icon: 'mdi-account-outline' },
      { title: 'Member', to: '/daftar/members', icon: 'mdi-card-account-details-star-outline' },
      { title: 'Supplier', to: '/daftar/suppliers', icon: 'mdi-truck-outline' },
      { title: 'Sales Counter', to: '/daftar/sales-counters', icon: 'mdi-counter' },
      { title: 'Cetak Barcode', to: '/daftar/cetak-barcode', icon: 'mdi-barcode' }
    ]
  },
  {
    title: 'Transaksi',
    icon: 'mdi-cash-register',
    model: transaksiMenu,
    isLarge: true,
    sections: [
      {
        title: 'Penjualan',
        icon: 'mdi-cart-outline',
        items: [
          { title: 'Penawaran', to: '/transaksi/penjualan/penawaran', icon: 'mdi-handshake-outline' },
          {
            title: 'Pengajuan Harga',
            icon: 'mdi-currency-usd',
            subItems: [
              {
                title: 'Pengajuan',
                to: '/transaksi/penjualan/pengajuan/pengajuan-harga',
                icon: 'mdi-file-document-plus-outline'
              },
              {
                title: 'Setting Harga',
                to: '/transaksi/penjualan/pengajuan/setting-harga',
                icon: 'mdi-tune-variant'
              }
            ]
          },
          {
            title: 'DTF Pesanan',
            icon: 'mdi-printer',
            subItems: [
              {
                title: 'SO DTF Pesanan',
                to: '/transaksi/penjualan/dtf/so-dtf',
                icon: 'mdi-clipboard-list-outline'
              },
              {
                title: 'LHK SO DTF',
                to: '/transaksi/penjualan/dtf/lhk-so-dtf',
                icon: 'mdi-file-chart-outline'
              },
              {
                title: 'Dasbor DTF',
                to: '/transaksi/penjualan/dtf/dasbor-dtf',
                icon: 'mdi-view-dashboard-outline'
              }
            ]
          },
          {
            title: 'DTF Stok',
            icon: 'mdi-package-variant',
            subItems: [
              {
                title: 'SO DTF Stok',
                to: '/transaksi/penjualan/dtf/so-dtf-stok',
                icon: 'mdi-package-variant'
              },
              {
                title: 'LHK SO DTF Stok',
                to: '/transaksi/penjualan/dtf/lhk-so-dtf-stok',
                icon: 'mdi-chart-box-outline'
              }
            ]
          },
          { title: 'Surat Pesanan', to: '/transaksi/penjualan/surat-pesanan', icon: 'mdi-file-document-edit-outline' },
          { title: 'Proforma Invoice', to: '/transaksi/penjualan/proforma', icon: 'mdi-receipt-text-outline' },
          { title: 'Invoice', to: '/transaksi/penjualan/invoice', icon: 'mdi-receipt' },
          { title: 'Retur Jual', to: '/transaksi/penjualan/retur-jual', icon: 'mdi-keyboard-return' }
        ]
      },
      {
        title: 'Internal',
        icon: 'mdi-office-building-outline',
        items: [
          { title: 'Buffer Stok', to: '/transaksi/internal/buffer-stok', icon: 'mdi-database-outline' },
          { title: 'Minta Barang ke DC', to: '/transaksi/internal/minta-barang', icon: 'mdi-arrow-up-bold-circle-outline' },
          { title: 'Terima SJ dari DC', to: '/transaksi/internal/terima-sj', icon: 'mdi-arrow-down-bold-circle-outline' },
          { title: 'Retur Barang ke DC', to: '/transaksi/internal/retur-dc', icon: 'mdi-undo-variant' },
          { title: 'Koreksi Stok', to: '/transaksi/internal/koreksi-stok', icon: 'mdi-pencil-outline' },
          { title: 'Pengajuan Barcode Baru', to: '/transaksi/internal/pengajuan-barcode', icon: 'mdi-barcode' },
          { title: 'Klerek', to: '/transaksi/internal/klerek', icon: 'mdi-clipboard-check-outline' }
        ]
      },
      {
        title: 'Mutasi',
        icon: 'mdi-swap-horizontal',
        items: [
          { title: 'Mutasi Out ke Produksi', to: '/transaksi/mutasi/out-produksi', icon: 'mdi-export' },
          { title: 'Mutasi In dari Produksi', to: '/transaksi/mutasi/in-produksi', icon: 'mdi-import' },
          { title: 'Mutasi Stok', to: '/transaksi/mutasi/stok', icon: 'mdi-swap-vertical' },
          { title: 'Mutasi Antar Store (Kirim)', to: '/transaksi/mutasi/store-kirim', icon: 'mdi-send' },
          { title: 'Mutasi Antar Store (Terima)', to: '/transaksi/mutasi/store-terima', icon: 'mdi-inbox-arrow-down' }
        ]
      },
      {
        title: 'Stok Opname',
        icon: 'mdi-clipboard-list-outline', // ikon umum untuk stok opname / pencatatan stok
        items: [
          {
            title: 'List HPP Kosong Ada Stok',
            to: '/transaksi/stok-opname/hpp-kosong',
            icon: 'mdi-currency-usd-off', // menunjukkan harga (HPP) kosong
          },
          {
            title: 'Setting Tanggal',
            to: '/transaksi/stok-opname/setting-tanggal',
            icon: 'mdi-calendar-edit-outline', // pengaturan tanggal
          },
          {
            title: 'Input Hitung Stok',
            to: '/transaksi/stok-opname/input-hitung-stok',
            icon: 'mdi-clipboard-edit-outline', // input data stok
          },
          {
            title: 'Hitung Stok per Lokasi',
            to: '/transaksi/stok-opname/hitung-per-lokasi',
            icon: 'mdi-map-marker-multiple-outline', // lokasi-lokasi stok
          },
          {
            title: 'Cek Selisih',
            to: '/transaksi/stok-opname/cek-selisih',
            icon: 'mdi-scale-balance', // perbandingan/selisih stok
          },
          {
            title: 'Proses',
            to: '/transaksi/stok-opname/proses',
            icon: 'mdi-progress-check', // proses atau eksekusi perhitungan
          },
        ],
      }

    ]
  },
  {
    title: 'Piutang',
    icon: 'mdi-credit-card-outline',
    model: piutangMenu,
    items: [
      { title: 'Setoran Pembayaran', to: '/piutang/setoran-pembayaran', icon: 'mdi-bank-transfer' },
      { title: 'Form Setoran Kasir', to: '/piutang/fsk', icon: 'mdi-cash-multiple' },
      { title: 'Kartu Piutang', to: '/piutang/kartu-piutang', icon: 'mdi-credit-card-outline' },
      { divider: true },
      { title: 'Potongan', to: '/receivables/discounts', icon: 'mdi-tag-minus-outline' },
      { title: 'Refund', to: '/receivables/refunds', icon: 'mdi-cash-refund' }
    ]
  },
  {
    title: 'Gudang DC',
    icon: 'mdi-warehouse',
    model: gudangMenu,
    isLarge: true,
    sections: [
      {
        title: 'Master Data',
        icon: 'mdi-database-outline',
        items: [
          { title: 'Jenis Kain', to: '/gudang-dc/master-data/jenis-kain', icon: 'mdi-texture' },
          { title: 'Warna Kain', to: '/gudang-dc/master-data/warna-kain', icon: 'mdi-palette-outline' },
          { title: 'Lengan', to: '/gudang-dc/master-data/lengan', icon: 'mdi-tshirt-crew-outline' },
          { title: 'Barang', to: '/gudang-dc/master-data/barang-dc', icon: 'mdi-package-variant-closed' },
          { title: 'Price List', to: '/gudang-dc/master-data/price-list', icon: 'mdi-receipt-text-outline' },
          { title: 'Promo', to: '/gudang-dc/master-data/promo', icon: 'mdi-percent-outline' },
          { title: 'Master Barang External', to: '/dc/external-products', icon: 'mdi-link-variant' }
        ]
      },
      {
        title: 'Operasional Gudang',
        icon: 'mdi-forklift',
        items: [
          { title: 'Terima STBJ', to: '/gudang-dc/operasional/terima-stbj', icon: 'mdi-inbox-arrow-down' },
          { title: 'Terima dari Gudang Repair', to: '/gudang-dc/operasional/terima-repair', icon: 'mdi-tools' },
          { title: 'Surat Jalan ke Store', to: '/gudang-dc/operasional/surat-jalan-store', icon: 'mdi-truck-delivery-outline' },
          { title: 'Pengambilan Barang', to: '/gudang-dc/operasional/ambil-barang', icon: 'mdi-package-up' },
          { title: 'Terima Retur dari Store', to: '/gudang-dc/operasional/terima-rb', icon: 'mdi-package-down' },
          { title: 'QC ke Garmen', to: '/dc/qc-to-garment', icon: 'mdi-quality-high' },
          { title: 'Mutasi Stok Antar Gudang', to: '/dc/inter-warehouse-mutation', icon: 'mdi-swap-horizontal-circle-outline' }
        ]
      },
      {
        title: 'Produksi & Supplier',
        icon: 'mdi-factory',
        items: [
          { title: 'Pengajuan Produksi', to: '/dc/production-proposal', icon: 'mdi-clipboard-text-outline' },
          { title: 'Approve Produksi', to: '/dc/approve-production-proposal', icon: 'mdi-clipboard-check-outline' },
          { title: 'PO ke Supplier', to: '/dc/po-to-supplier', icon: 'mdi-file-send-outline' },
          { title: 'BPB dari Supplier', to: '/dc/bpb-from-supplier', icon: 'mdi-file-receive-outline' }
        ]
      },
      {
        title: 'Finansial',
        icon: 'mdi-calculator-variant-outline',
        items: [
          { title: 'Voucher Pembayaran', to: '/dc/payment-voucher', icon: 'mdi-ticket-confirmation-outline' },
          { title: 'Kartu Hutang', to: '/dc/accounts-payable-card', icon: 'mdi-credit-card-outline' }
        ]
      }
    ]
  },
  {
    title: 'Laporan',
    icon: 'mdi-chart-box-outline',
    model: laporanMenu,
    isLarge: true,
    sections: [
      {
        title: 'Stok',
        icon: 'mdi-archive-outline',
        items: [
          { title: 'Laporan Stok', to: '/laporan/stok', icon: 'mdi-package-variant' },
          { title: 'Mutasi Stok', to: '/laporan/mutasi-stok', icon: 'mdi-swap-horizontal' },
          { title: 'Kartu Stok', to: '/reports/stock-card', icon: 'mdi-card-text-outline' },
          { title: 'Stok Stagnan', to: '/reports/stagnant-stock', icon: 'mdi-clock-outline' },
          { title: 'Dead Stok', to: '/reports/dead-stock', icon: 'mdi-alert-circle-outline' }
        ]
      },
      {
        title: 'Penjualan',
        icon: 'mdi-trending-up',
        items: [
          { title: 'Laporan Invoice', to: '/reports/invoice', icon: 'mdi-receipt' },
          { title: 'Pareto Barang', to: '/reports/pareto', icon: 'mdi-chart-bar' },
          { title: 'Sales vs Target', to: '/reports/sales-vs-target', icon: 'mdi-target' },
          { title: 'Target Achievement', to: '/reports/achievement-monitoring', icon: 'mdi-trophy-outline' }
        ]
      },
      {
        title: 'Analisa',
        icon: 'mdi-chart-timeline-variant',
        items: [
          { title: 'Penjualan Pivot', to: '/reports/sales-pivot', icon: 'mdi-table-pivot' },
          { title: 'Stok Pivot', to: '/reports/stock-pivot', icon: 'mdi-table-large' }
        ]
      },
      {
        title: 'Lain-lain',
        icon: 'mdi-dots-horizontal',
        items: [
          { title: 'List Otorisasi', to: '/reports/authorization-list', icon: 'mdi-shield-check-outline' },
          { title: 'Saldo Kasir', to: '/reports/cashier-balance', icon: 'mdi-cash-register' }
        ]
      }
    ]
  }
]

// Menu control methods
const closeMenus = () => {
  menuItems.forEach(menu => {
    if (menu.model && menu.model.value) {
      menu.model.value = false
    }
  })
}

// Event handlers
const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}

const handleScroll = () => {
  scrolled.value = window.scrollY > 10
}

// Lifecycle hooks
onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <v-app-bar flat color="white" height="64" :elevation="appBarElevation" :class="appBarClass" fixed
    class="desktop-navbar">
    <!-- Logo Section -->
    <RouterLink to="/" class="logo-section">
      <v-avatar size="32" class="logo-avatar">
        <v-img :src="logoSrc" alt="Kaosan Logo" cover />
      </v-avatar>
      <div class="brand-info">
        <span class="brand-title">Kaosan</span>
        <span class="brand-subtitle">Retail Management System</span>
      </div>
    </RouterLink>

    <v-spacer />

    <!-- Main Navigation Menu -->
    <nav class="main-navigation">
      <template v-for="menu in menuItems" :key="menu.title">
        <!-- Standard Menu Items -->
        <v-menu v-if="!menu.isLarge && (!('to' in menu) || hasAccess(menu.to as string))" v-model="menu.model.value"
          offset-y :close-on-content-click="false"
          :max-width="menu.title === 'Transaksi' ? 1200 : menu.title === 'Gudang DC' ? 1200 : 1000"
          transition="fade-transition" class="nav-menu large" location="bottom center" origin="top center">
          <template #activator="{ props }">
            <v-btn variant="text" v-bind="props" :prepend-icon="menu.icon" class="nav-button" size="default">
              {{ menu.title }}
            </v-btn>
          </template>

          <v-card class="nav-dropdown" elevation="8">
            <v-list class="nav-list" density="comfortable">
              <template v-for="(item, index) in menu.items.filter(i => !i.to || hasAccess(i.to))" :key="index">
                <v-divider v-if="item.divider" class="nav-divider" />

                <!-- Sub Menu Group -->
                <v-list-group v-else-if="'subItems' in item" :value="item.title" class="nav-list-group">
                  <template #activator="{ props }">
                    <v-list-item v-bind="props" :prepend-icon="item.icon" class="nav-list-item">
                      <v-list-item-title>{{ item.title }}</v-list-item-title>
                    </v-list-item>
                  </template>

                  <template
                    v-for="subItem in ((item.subItems as NavItem[] | undefined) ?? []).filter(si => hasAccess(si.to))"
                    :key="subItem.title">
                    <!-- Nested Sub Menu -->
                    <v-list-group v-if="subItem.subItems" :value="subItem.title" class="nav-list-group nested">
                      <template #activator="{ props }">
                        <v-list-item v-bind="props" :prepend-icon="subItem.icon" class="nav-list-item nested">
                          <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                        </v-list-item>
                      </template>
                      <v-list-item v-for="subSubItem in subItem.subItems.filter(ssi => hasAccess(ssi.to))"
                        :key="subSubItem.title" :to="subSubItem.to" :prepend-icon="subSubItem.icon"
                        class="nav-list-item deep-nested" @click="closeMenus">
                        <v-list-item-title>{{ subSubItem.title }}</v-list-item-title>
                      </v-list-item>
                    </v-list-group>

                    <!-- Regular Sub Item -->
                    <v-list-item v-else :to="subItem.to" :prepend-icon="subItem.icon" class="nav-list-item sub"
                      @click="closeMenus">
                      <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                    </v-list-item>
                  </template>
                </v-list-group>

                <!-- Regular Menu Item -->
                <v-list-item v-else :to="item.to" :prepend-icon="item.icon" class="nav-list-item" @click="closeMenus">
                  <v-list-item-title>{{ item.title }}</v-list-item-title>
                </v-list-item>
              </template>
            </v-list>
          </v-card>
        </v-menu>

        <!-- Large Menu Items with Sections -->
        <v-menu v-else-if="menu.isLarge" v-model="menu.model.value" offset-y
          :max-width="menu.title === 'Gudang DC' ? 1200 : 1000" transition="fade-transition"
          :close-on-content-click="false" class="nav-menu large">
          <template #activator="{ props }">
            <v-btn variant="text" v-bind="props" :prepend-icon="menu.icon" class="nav-button" size="default">
              {{ menu.title }}
            </v-btn>
          </template>

          <v-card class="large-nav-dropdown" elevation="8">
            <v-container fluid class="pa-4">
              <v-row>
                <v-col v-for="section in menu.sections" :key="section.title" :cols="12 / menu.sections.length"
                  class="section-col">
                  <div class="section-header">
                    <v-icon :icon="section.icon" size="18" class="section-icon" />
                    <h4 class="section-title">{{ section.title }}</h4>
                  </div>

                  <v-list density="compact" class="section-list">
                    <template v-for="item in section.items.filter(i => !i.to || hasAccess(i.to))" :key="item.title">
                      <!-- Section Sub Items -->
                      <v-list-group v-if="item.subItems" :value="item.title" class="section-list-group">
                        <template #activator="{ props }">
                          <v-list-item v-bind="props" :prepend-icon="item.icon" :title="item.title"
                            class="section-list-item" />
                        </template>
                        <template v-for="subItem in item.subItems.filter(si => hasAccess(si.to))" :key="subItem.title">
                          <!-- Nested Section Sub Items -->
                          <v-list-group v-if="'subItems' in subItem && Array.isArray((subItem as any).subItems)"
                            :value="subItem.title" class="section-list-group nested">
                            <template #activator="{ props }">
                              <v-list-item v-bind="props" :prepend-icon="subItem.icon" class="section-list-item nested">
                                <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                              </v-list-item>
                            </template>
                            <v-list-item
                              v-for="subSubItem in ((subItem.subItems as NavItem[] | undefined) ?? []).filter(ssi => hasAccess(ssi.to))"
                              :key="subSubItem.title" :to="subSubItem.to" :prepend-icon="subSubItem.icon"
                              class="section-list-item deep-nested" @click="closeMenus">
                              <v-list-item-title>{{ subSubItem.title }}</v-list-item-title>
                            </v-list-item>
                          </v-list-group>

                          <!-- Regular Section Sub Item -->
                          <v-list-item v-else :to="subItem.to" :prepend-icon="subItem.icon"
                            class="section-list-item sub" @click="closeMenus">
                            <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                          </v-list-item>
                        </template>
                      </v-list-group>

                      <!-- Regular Section Item -->
                      <v-list-item v-else :to="item.to" :prepend-icon="item.icon" class="section-list-item"
                        @click="closeMenus">
                        <v-list-item-title>{{ item.title }}</v-list-item-title>
                      </v-list-item>
                    </template>
                  </v-list>
                </v-col>
              </v-row>
            </v-container>
          </v-card>
        </v-menu>
      </template>
    </nav>

    <v-spacer />

    <!-- User Menu -->
    <v-menu v-model="userMenu" offset-y transition="fade-transition" class="user-menu">
      <template #activator="{ props }">
        <v-btn variant="text" v-bind="props" class="user-button">
          <v-avatar color="primary" size="28" class="user-avatar">
            <span class="user-initial">{{ authStore.userInitial }}</span>
          </v-avatar>
          <span class="user-name">{{ authStore.userName }}</span>
          <v-icon icon="mdi-chevron-down" size="16" class="user-chevron" />
        </v-btn>
      </template>

      <v-card class="user-dropdown" elevation="8">
        <v-list class="user-list">
          <v-list-item class="user-profile-item">
            <template #prepend>
              <v-avatar color="primary" size="32">
                <span class="user-profile-initial">{{ authStore.userInitial }}</span>
              </v-avatar>
            </template>
            <v-list-item-title class="user-profile-name">{{ authStore.userName }}</v-list-item-title>
            <v-list-item-subtitle class="user-profile-branch">{{ authStore.userCabang }}</v-list-item-subtitle>
          </v-list-item>

          <v-divider class="user-divider" />

          <v-list-item prepend-icon="mdi-whatsapp" title="Tautkan WhatsApp" to="/pengaturan/whatsapp"></v-list-item>

          <v-list-item to="/user/ganti-password" prepend-icon="mdi-lock-outline" class="user-menu-item">
            <v-list-item-title>Ganti Password</v-list-item-title>
          </v-list-item>

          <v-list-item to="/user/update-program" prepend-icon="mdi-update" class="user-menu-item">
            <v-list-item-title>Cek Versi</v-list-item-title>
          </v-list-item>

          <v-divider class="user-divider" />

          <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="user-menu-item logout">
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu>
  </v-app-bar>
</template>

<style scoped>
/* Main navbar styling */
.desktop-navbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.navbar-scrolled {
  background-color: rgba(255, 255, 255, 0.95) !important;
}

/* Logo section */
.logo-section {
  display: flex;
  align-items: center;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.logo-section:hover {
  background-color: rgba(25, 118, 210, 0.04);
  text-decoration: none !important;
}

.logo-avatar {
  margin-right: 12px;
}

.brand-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1976d2;
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
}

/* Main navigation */
.main-navigation {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-button {
  height: 40px;
  padding: 0 16px;
  font-weight: 500;
  font-size: 0.875rem;
  color: #374151;
  border-radius: 6px;
  text-transform: none;
  letter-spacing: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-button:hover {
  background-color: rgba(25, 118, 210, 0.06);
  color: #1976d2;
}

.nav-button.v-btn--active {
  background-color: rgba(25, 118, 210, 0.1);
  color: #1976d2;
}

/* Dropdown styling */
.nav-dropdown,
.large-nav-dropdown {
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.nav-list,
.section-list,
.user-list {
  padding: 8px;
}

.nav-list-item,
.section-list-item,
.user-menu-item {
  min-height: 36px;
  border-radius: 6px;
  margin: 2px 0;
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.nav-list-item:hover,
.section-list-item:hover,
.user-menu-item:hover {
  background-color: rgba(25, 118, 210, 0.06);
}

.nav-list-item.sub {
  padding-left: 48px;
}

.nav-list-item.nested {
  padding-left: 32px;
}

.nav-list-item.deep-nested {
  padding-left: 64px;
}

.section-list-item.sub {
  padding-left: 48px;
}

.section-list-item.nested {
  padding-left: 32px;
}

.section-list-item.deep-nested {
  padding-left: 64px;
}

.nav-divider,
.user-divider {
  margin: 8px 0;
  opacity: 0.6;
}

/* Large dropdown sections */
.section-col {
  padding: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, rgba(25, 118, 210, 0.06) 0%, rgba(25, 118, 210, 0.02) 100%);
  border-radius: 6px;
  border-left: 3px solid #1976d2;
}

.section-icon {
  color: #1976d2;
  margin-right: 8px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1976d2;
  margin: 0;
  letter-spacing: -0.01em;
}

/* User menu styling */
.user-button {
  height: 40px;
  padding: 0 12px;
  border-radius: 20px;
  text-transform: none;
  font-weight: 500;
  transition: all 0.2s ease;
}

.user-button:hover {
  background-color: rgba(25, 118, 210, 0.06);
}

.user-avatar {
  margin-right: 8px;
}

.user-initial,
.user-profile-initial {
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
}

.user-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin: 0 4px;
}

.user-chevron {
  color: #6b7280;
  transition: transform 0.2s ease;
}

.user-button:hover .user-chevron {
  transform: rotate(180deg);
}

.user-dropdown {
  min-width: 200px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.user-profile-item {
  padding: 12px 16px;
  background-color: rgba(25, 118, 210, 0.02);
}

.user-profile-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1f2937;
}

.user-menu-item.logout {
  color: #dc2626;
}

.user-menu-item.logout:hover {
  background-color: rgba(220, 38, 38, 0.06);
  color: #dc2626;
}

/* List group styling */
.nav-list-group,
.section-list-group {
  border-radius: 6px;
}

.nav-list-group .v-list-group__items,
.section-list-group .v-list-group__items {
  background-color: rgba(0, 0, 0, 0.02);
  border-radius: 0 0 6px 6px;
}

/* Animations and transitions */
.fade-transition-enter-active,
.fade-transition-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-transition-enter-from,
.fade-transition-leave-to {
  opacity: 0;
}

/* Focus and active states */
.nav-button:focus-visible,
.nav-list-item:focus-visible,
.section-list-item:focus-visible,
.user-menu-item:focus-visible {
  outline: 2px solid #1976d2;
  outline-offset: 2px;
}

.nav-list-item.v-list-item--active,
.section-list-item.v-list-item--active {
  background-color: rgba(25, 118, 210, 0.12);
  color: #1976d2;
}

.nav-list-item.v-list-item--active .v-icon,
.section-list-item.v-list-item--active .v-icon {
  color: #1976d2;
}

/* Typography consistency */
.v-list-item-title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
}

/* Menu positioning adjustments */
.nav-menu .v-overlay__content {
  margin-top: 8px;
}

.user-menu .v-overlay__content {
  margin-top: 8px;
}

/* Styling khusus untuk menu Transaksi yang lebih besar */
.nav-menu.large .v-overlay__content {
  position: fixed !important;
  top: 64px !important;
  /* tinggi app-bar */
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: 1100px;
  /* konsisten untuk semua */
  max-width: 90vw;
  /* supaya tetap responsif */
}

/* Untuk semua menu dropdown */
.nav-menu .v-overlay__content {
  position: fixed !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  top: 72px !important;
}

.section-col {
  min-width: 400px;
  flex: 1;
}

/* Override untuk menu Transaksi */
.nav-menu.large .section-col {
  min-width: 450px;
  max-width: 500px;
}

.centered-menu {
  left: 50% !important;
  transform: translateX(-50%) !important;
}

/* Konsistensi font size untuk semua item */
.nav-list-item .v-list-item-title,
.section-list-item .v-list-item-title {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
  line-height: 1.4 !important;
}

/* Khusus untuk list group activator (yang memiliki sub item) */
.nav-list-group .v-list-group__activator .v-list-item-title,
.section-list-group .v-list-group__activator .v-list-item-title {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}

/* Override default Vuetify list group styling */
.v-list-group .v-list-group__activator .v-list-item-title {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}

/* Ensure consistent height for all items */
.nav-list-item,
.section-list-item,
.nav-list-group .v-list-group__activator,
.section-list-group .v-list-group__activator {
  min-height: 36px !important;
}

/* Responsive adjustments for desktop only */
@media (min-width: 1200px) {
  .large-nav-dropdown {
    max-width: none;
  }

  .section-col {
    min-width: 250px;
  }
}

/* Subtle shadows and elevation */
.nav-dropdown {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.large-nav-dropdown {
  box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.user-dropdown {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Icon consistency */
.v-icon {
  font-size: 18px;
}

.nav-button .v-icon {
  font-size: 20px;
  margin-right: 8px;
}

/* Improved spacing */
.v-app-bar .v-toolbar__content {
  padding: 0 24px;
}

/* Clean borders and dividers */
.v-divider {
  border-color: rgba(0, 0, 0, 0.06);
}

/* Menu item states */
.nav-list-item:not(.v-list-item--active):hover,
.section-list-item:not(.v-list-item--active):hover {
  color: #1976d2;
}

.nav-list-item:not(.v-list-item--active):hover .v-icon,
.section-list-item:not(.v-list-item--active):hover .v-icon {
  color: #1976d2;
}
</style>