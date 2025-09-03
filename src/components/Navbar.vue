<!-- src/components/Navbar.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useDisplay } from 'vuetify'
import logoSrc from '@/assets/logo.png'

const authStore = useAuthStore()
const router = useRouter()
const { mobile, mdAndUp } = useDisplay()

// Mobile drawer state
const drawer = ref(false)
const scrolled = ref(false)

// Menu states
const fileMenu = ref(false)
const daftarMenu = ref(false)
const transaksiMenu = ref(false)
const piutangMenu = ref(false)
const gudangMenu = ref(false)
const laporanMenu = ref(false)
const userMenu = ref(false)

// Computed
const appBarElevation = computed(() => scrolled.value ? 4 : 0)
const appBarClass = computed(() => ({
  'navbar-scrolled': scrolled.value
}))

const hasAccess = (routeNameOrPath?: string) => {
  if (!routeNameOrPath) return true;

  const authStore = useAuthStore();
  const allowedMenus = authStore.allowedMenus ?? [];

  const route = router.getRoutes().find(
    r => r.name === routeNameOrPath || r.path === routeNameOrPath
  );

  if (!route) return false;

  // Jika route punya meta.public, langsung return true
  if (route.meta?.public) return true;

  // Cek berdasarkan menuId jika ada
  if (route.meta?.menuId) {
    return allowedMenus.includes(route.meta.menuId as string);
  }

  // Cek berdasarkan route name (fallback untuk compatibility)
  return allowedMenus.includes(route.name as string);
};

// Menu items configuration
const menuItems = [
  {
    title: 'File',
    icon: 'mdi-file-outline',
    model: fileMenu,
    items: [
      { title: 'Manual Program', to: '/manual', icon: 'mdi-book-open-outline' },
      { title: 'History Update Program', to: '/history-updates', icon: 'mdi-history' },
      { title: 'Update Buffer Stok', to: '/update-buffer-stock', icon: 'mdi-database-sync' },
      { title: 'Setting', to: '/settings', icon: 'mdi-cog-outline' },
      { divider: true },
      { title: 'User', to: '/users', icon: 'mdi-account-group-outline' }
    ]
  },
  {
    title: 'Daftar',
    icon: 'mdi-clipboard-list-outline',
    model: daftarMenu,
    items: [
      { title: 'Customer', to: '/customers', icon: 'mdi-account-outline' },
      { title: 'Member', to: '/members', icon: 'mdi-card-account-details-star-outline' },
      { title: 'Supplier', to: '/suppliers', icon: 'mdi-truck-outline' },
      { title: 'Sales Counter', to: '/sales-counters', icon: 'mdi-counter' },
      { title: 'Cetak Barcode', to: '/cetak-barcode', icon: 'mdi-barcode' }
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
          { title: 'Penawaran', to: '/penawaran', icon: 'mdi-handshake-outline' },
          {
            title: 'Pengajuan Harga',
            icon: 'mdi-currency-usd', // atau 'mdi-tag-plus' untuk pengajuan harga
            subItems: [
              {
                title: 'Pengajuan',
                to: '/pengajuan-harga',
                icon: 'mdi-file-document-plus-outline' // untuk membuat pengajuan baru
              },
              {
                title: 'Setting Harga',
                to: '/setting-harga',
                icon: 'mdi-tune-variant' // untuk pengaturan/konfigurasi harga
              }
            ]
          },
          { title: 'Surat Pesanan', to: '/sales-orders', icon: 'mdi-file-document-edit-outline' },
          { title: 'Proforma Invoice', to: '/proforma-invoices', icon: 'mdi-receipt-text-outline' },
          { title: 'Invoice', to: '/invoices', icon: 'mdi-receipt' },
          { title: 'Retur Jual', to: '/returns', icon: 'mdi-keyboard-return' }
        ]
      },
      {
        title: 'Internal',
        icon: 'mdi-office-building-outline',
        items: [
          { title: 'Buffer Stok', to: '/buffer-stock', icon: 'mdi-database-outline' },
          { title: 'Minta Barang ke DC', to: '/request-to-dc', icon: 'mdi-arrow-up-bold-circle-outline' },
          { title: 'Terima SJ dari DC', to: '/receive-from-dc', icon: 'mdi-arrow-down-bold-circle-outline' },
          { title: 'Retur Barang ke DC', to: '/return-to-dc', icon: 'mdi-undo-variant' },
          { title: 'Koreksi Stok', to: '/stock-corrections', icon: 'mdi-pencil-outline' },
          { title: 'Klerek', to: '/klerek', icon: 'mdi-clipboard-check-outline' }
        ]
      },
      {
        title: 'Mutasi',
        icon: 'mdi-swap-horizontal',
        items: [
          { title: 'Mutasi Out ke Produksi', to: '/mutation/out-production', icon: 'mdi-export' },
          { title: 'Mutasi In dari Produksi', to: '/mutation/in-production', icon: 'mdi-import' },
          { title: 'Mutasi Stok', to: '/mutation/stock', icon: 'mdi-swap-vertical' },
          { title: 'Mutasi Antar Store (Kirim)', to: '/mutation/store-send', icon: 'mdi-send' },
          { title: 'Mutasi Antar Store (Terima)', to: '/mutation/store-receive', icon: 'mdi-inbox-arrow-down' }
        ]
      }
    ]
  },
  {
    title: 'Piutang',
    icon: 'mdi-credit-card-outline',
    model: piutangMenu,
    items: [
      { title: 'Setoran Pembayaran', to: '/receivables/payment-deposits', icon: 'mdi-bank-transfer' },
      { title: 'Form Setoran Kasir', to: '/receivables/cashier-deposits', icon: 'mdi-cash-multiple' },
      { title: 'Kartu Piutang', to: '/receivables/card', icon: 'mdi-credit-card-outline' },
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
          { title: 'Jenis Kain', to: '/dc/fabric-types', icon: 'mdi-texture' },
          { title: 'Warna Kain', to: '/dc/fabric-colors', icon: 'mdi-palette-outline' },
          { title: 'Lengan', to: '/dc/sleeves', icon: 'mdi-tshirt-crew-outline' },
          { title: 'Barang', to: '/dc/products', icon: 'mdi-package-variant-closed' },
          { title: 'Promo', to: '/dc/promos', icon: 'mdi-percent-outline' },
          { title: 'Master Barang External', to: '/dc/external-products', icon: 'mdi-link-variant' }
        ]
      },
      {
        title: 'Operasional Gudang',
        icon: 'mdi-forklift',
        items: [
          { title: 'Terima STBJ', to: '/dc/receive-stbj', icon: 'mdi-inbox-arrow-down' },
          { title: 'Terima dari Gudang Repair', to: '/dc/receive-from-repair', icon: 'mdi-tools' },
          { title: 'Surat Jalan ke Store', to: '/dc/delivery-to-store', icon: 'mdi-truck-delivery-outline' },
          { title: 'Pengambilan Barang', to: '/dc/goods-pickup', icon: 'mdi-package-up' },
          { title: 'Terima Retur dari Store', to: '/dc/receive-return-from-store', icon: 'mdi-package-down' },
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
          { title: 'Laporan Stok', to: '/reports/stock', icon: 'mdi-package-variant' },
          { title: 'Mutasi Stok', to: '/reports/stock-mutation', icon: 'mdi-swap-horizontal' },
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

// Methods
const closeMenus = () => {
  // Tutup semua menu dengan mengset model value ke false
  menuItems.forEach(menu => {
    if (menu.model && menu.model.value) {
      menu.model.value = false
    }
  })
}

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}

const closeAllMenus = () => {
  fileMenu.value = false
  daftarMenu.value = false
  transaksiMenu.value = false
  piutangMenu.value = false
  gudangMenu.value = false
  laporanMenu.value = false
  userMenu.value = false
}

const handleScroll = () => {
  scrolled.value = window.scrollY > 20
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div>
    <!-- Main App Bar -->
    <v-app-bar flat color="white" height="72" :elevation="appBarElevation" :class="appBarClass" fixed>
      <!-- Mobile Menu Button -->
      <v-app-bar-nav-icon v-if="mobile" @click="drawer = !drawer" color="primary" />

      <!-- Logo -->
      <RouterLink to="/" class="d-flex align-center text-decoration-none logo-container">
        <v-avatar size="48" class="mr-3 logo-avatar">
          <v-img :src="logoSrc" alt="Kaosan Logo" cover />
        </v-avatar>
        <div v-if="mdAndUp" class="d-flex flex-column brand-text">
          <span class="brand-title">Kaosan</span>
          <span class="brand-subtitle">Retail Management System</span>
        </div>
      </RouterLink>

      <v-spacer />

      <!-- Desktop Navigation Menu -->
      <div v-if="mdAndUp" class="d-flex align-center">
        <template v-for="menu in menuItems" :key="menu.title">
          <!-- Regular Menus -->
          <v-menu
            v-if="!menu.isLarge && (!menu.to || hasAccess(menu.to))"
            v-model="menu.model.value"
            offset-y
            :close-on-content-click="false"
            transition="slide-y-transition"
          >
            <template #activator="{ props }">
              <v-btn variant="text" v-bind="props" :prepend-icon="menu.icon" class="mx-1 nav-btn" size="default">
                <span class="nav-text">{{ menu.title }}</span>
              </v-btn>
            </template>
            <v-list>
              <template v-for="(item, index) in menu.items.filter(i => !i.to || hasAccess(i.to))" :key="index">
                <v-divider v-if="item.divider" />

                <!-- Sub menu items -->
                <v-list-group v-else-if="item.subItems" :value="item.title">
                  <template #activator="{ props }">
                    <v-list-item v-bind="props" :prepend-icon="item.icon" class="px-4">
                      <v-list-item-title>{{ item.title }}</v-list-item-title>
                    </v-list-item>
                  </template>

                  <template v-for="subItem in item.subItems.filter(si => hasAccess(si.to))" :key="subItem.title">
                    <!-- Sub sub menu -->
                    <v-list-group v-if="subItem.subItems" :value="subItem.title" class="ml-4">
                      <template #activator="{ props }">
                        <v-list-item v-bind="props" :prepend-icon="subItem.icon" class="pl-8">
                          <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                        </v-list-item>
                      </template>
                      <v-list-item
                        v-for="subSubItem in subItem.subItems.filter(ssi => hasAccess(ssi.to))"
                        :key="subSubItem.title"
                        :to="subSubItem.to"
                        :prepend-icon="subSubItem.icon"
                        class="pl-12"
                        @click="closeMenus"
                      >
                        <v-list-item-title>{{ subSubItem.title }}</v-list-item-title>
                      </v-list-item>
                    </v-list-group>

                    <!-- Regular sub item -->
                    <v-list-item
                      v-else
                      v-if="hasAccess(subItem.to)"
                      :to="subItem.to"
                      :prepend-icon="subItem.icon"
                      class="pl-8"
                      @click="closeMenus"
                    >
                      <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                    </v-list-item>
                  </template>
                </v-list-group>

                <!-- Regular item -->
                <v-list-item
                  v-else
                  v-if="hasAccess(item.to)"
                  :to="item.to"
                  :prepend-icon="item.icon"
                  class="px-4"
                  @click="closeMenus"
                >
                  <v-list-item-title>{{ item.title }}</v-list-item-title>
                </v-list-item>
              </template>
            </v-list>
          </v-menu>

          <!-- Large Menus with Sections -->
          <v-menu
            v-else-if="menu.isLarge"
            v-model="menu.model.value"
            offset-y
            :max-width="menu.title === 'Gudang DC' ? 1200 : 1000"
            transition="slide-y-transition"
            :close-on-content-click="false"
          >
            <template #activator="{ props }">
              <v-btn variant="text" v-bind="props" :prepend-icon="menu.icon" class="mx-1 nav-btn" size="default">
                <span class="nav-text">{{ menu.title }}</span>
              </v-btn>
            </template>
            <v-card class="pa-2">
              <v-container fluid>
                <v-row>
                  <v-col v-for="section in menu.sections" :key="section.title" :cols="12 / menu.sections.length">
                    <div class="section-header">
                      <v-icon :icon="section.icon" size="20" class="mr-2 text-primary" />
                      <h4 class="section-title">{{ section.title }}</h4>
                    </div>
                    <v-list density="compact">
                      <template v-for="item in section.items.filter(i => !i.to || hasAccess(i.to))" :key="item.title">
                        <!-- Sub items -->
                        <v-list-group v-if="item.subItems" :value="item.title">
                          <template #activator="{ props }">
                            <v-list-item v-bind="props" :prepend-icon="item.icon" :title="item.title" class="px-2" />
                          </template>
                          <template v-for="subItem in item.subItems.filter(si => hasAccess(si.to))" :key="subItem.title">
                            <!-- Sub sub items -->
                            <v-list-group v-if="subItem.subItems" :value="subItem.title" class="ml-2">
                              <template #activator="{ props }">
                                <v-list-item v-bind="props" :prepend-icon="subItem.icon" class="pl-6">
                                  <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                                </v-list-item>
                              </template>
                              <v-list-item
                                v-for="subSubItem in subItem.subItems.filter(ssi => hasAccess(ssi.to))"
                                :key="subSubItem.title"
                                :to="subSubItem.to"
                                :prepend-icon="subSubItem.icon"
                                class="pl-10"
                                @click="closeMenus"
                              >
                                <v-list-item-title>{{ subSubItem.title }}</v-list-item-title>
                              </v-list-item>
                            </v-list-group>

                            <!-- Regular sub item -->
                            <v-list-item
                              v-else
                              v-if="hasAccess(subItem.to)"
                              :to="subItem.to"
                              :prepend-icon="subItem.icon"
                              class="pl-6"
                              @click="closeMenus"
                            >
                              <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                            </v-list-item>
                          </template>
                        </v-list-group>

                        <!-- Regular item -->
                        <v-list-item
                          v-else
                          v-if="hasAccess(item.to)"
                          :to="item.to"
                          :prepend-icon="item.icon"
                          class="px-2"
                          @click="closeMenus"
                        >
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
      </div>

      <v-spacer />

      <!-- User Menu -->
      <v-menu v-model="userMenu" offset-y transition="slide-y-transition">
        <template #activator="{ props }">
          <v-btn variant="text" v-bind="props" class="mr-2 user-btn">
            <v-avatar color="primary" size="36" class="mr-2 user-avatar">
              <span class="user-initial">{{ authStore.userInitial }}</span>
            </v-avatar>
            <span v-if="mdAndUp" class="user-name">{{ authStore.userName }}</span>
            <v-icon v-if="mdAndUp" icon="mdi-chevron-down" size="16" class="ml-1" />
          </v-btn>
        </template>
        <v-list>
          <v-list-item>
            <template #prepend>
              <v-avatar color="primary" size="32">
                <span class="text-white text-caption font-weight-bold">{{ authStore.userInitial }}</span>
              </v-avatar>
            </template>
            <v-list-item-title class="user-profile-name">{{ authStore.userName }}</v-list-item-title>
          </v-list-item>
          <v-divider />
          <v-list-item to="/ganti-password" prepend-icon="mdi-lock-outline">
            <v-list-item-title>Ganti Password</v-list-item-title>
          </v-list-item>
          <v-list-item to="/update-program" prepend-icon="mdi-update">
            <v-list-item-title>Cek Versi</v-list-item-title>
          </v-list-item>
          <v-divider />
          <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="text-error">
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <!-- Mobile Navigation Drawer -->
    <v-navigation-drawer v-model="drawer" temporary location="left" width="320" class="mobile-drawer">
      <!-- Drawer Header -->
      <div class="pa-4 bg-primary text-center drawer-header">
        <v-avatar size="64" class="mb-2 drawer-logo">
          <v-img :src="logoSrc" alt="Kaosan Logo" />
        </v-avatar>
        <h3 class="drawer-title">Kaosan</h3>
        <p class="drawer-subtitle">Retail Management System</p>
      </div>

      <!-- Mobile Menu Items -->
      <v-list nav>
        <template v-for="menu in menuItems" :key="menu.title">
          <template v-if="!menu.isLarge && (!menu.to || hasAccess(menu.to))">
            <v-list-group :value="menu.title">
              <template #activator="{ props }">
                <v-list-item v-bind="props" :prepend-icon="menu.icon" :title="menu.title" />
              </template>
              <template v-for="(item, index) in menu.items.filter(i => !i.to || hasAccess(i.to))" :key="index">
                <v-divider v-if="item.divider" />
                <v-list-group v-else-if="item.subItems" :value="item.title" class="pl-4">
                  <template #activator="{ props }">
                    <v-list-item v-bind="props" :prepend-icon="item.icon" :title="item.title" />
                  </template>
                  <template v-for="subItem in item.subItems.filter(si => hasAccess(si.to))" :key="subItem.title">
                    <v-list-group v-if="subItem.subItems" :value="subItem.title" class="pl-8">
                      <template #activator="{ props }">
                        <v-list-item v-bind="props" :prepend-icon="subItem.icon" :title="subItem.title" />
                      </template>
                      <v-list-item
                        v-for="subSubItem in subItem.subItems.filter(ssi => hasAccess(ssi.to))"
                        :key="subSubItem.title"
                        :to="subSubItem.to"
                        :prepend-icon="subSubItem.icon"
                        :title="subSubItem.title"
                        class="pl-12"
                        @click="drawer = false"
                      />
                    </v-list-group>

                    <v-list-item
                      v-else
                      v-if="hasAccess(subItem.to)"
                      :to="subItem.to"
                      :prepend-icon="subItem.icon"
                      :title="subItem.title"
                      class="pl-8"
                      @click="drawer = false"
                    />
                  </template>
                </v-list-group>

                <v-list-item
                  v-else
                  v-if="hasAccess(item.to)"
                  :to="item.to"
                  :prepend-icon="item.icon"
                  :title="item.title"
                  @click="drawer = false"
                />
              </template>
            </v-list-group>
          </template>

          <!-- Large Menu Items with Sections -->
          <template v-else-if="menu.isLarge">
            <v-list-group :value="menu.title">
              <template #activator="{ props }">
                <v-list-item v-bind="props" :prepend-icon="menu.icon" :title="menu.title" />
              </template>
              <template v-for="section in menu.sections" :key="section.title">
                <v-list-subheader class="text-primary font-weight-bold">
                  <v-icon :icon="section.icon" size="16" class="mr-2" />
                  {{ section.title }}
                </v-list-subheader>
                <template v-for="item in section.items.filter(i => !i.to || hasAccess(i.to))" :key="item.title">
                  <v-list-group v-if="item.subItems" :value="item.title" class="pl-4">
                    <template #activator="{ props }">
                      <v-list-item v-bind="props" :prepend-icon="item.icon" :title="item.title" />
                    </template>
                    <template v-for="subItem in item.subItems.filter(si => hasAccess(si.to))" :key="subItem.title">
                      <v-list-group v-if="subItem.subItems" :value="subItem.title" class="pl-8">
                        <template #activator="{ props }">
                          <v-list-item v-bind="props" :prepend-icon="subItem.icon" :title="subItem.title" />
                        </template>
                        <v-list-item
                          v-for="subSubItem in subItem.subItems.filter(ssi => hasAccess(ssi.to))"
                          :key="subSubItem.title"
                          :to="subSubItem.to"
                          :prepend-icon="subSubItem.icon"
                          :title="subSubItem.title"
                          class="pl-12"
                          @click="drawer = false"
                        />
                      </v-list-group>
                      <v-list-item
                        v-else
                        v-if="hasAccess(subItem.to)"
                        :to="subItem.to"
                        :prepend-icon="subItem.icon"
                        :title="subItem.title"
                        class="pl-8"
                        @click="drawer = false"
                      />
                    </template>
                  </v-list-group>
                  <v-list-item
                    v-else
                    v-if="hasAccess(item.to)"
                    :to="item.to"
                    :prepend-icon="item.icon"
                    :title="item.title"
                    class="pl-8"
                    @click="drawer = false"
                  />
                </template>
              </template>
            </v-list-group>
          </template>
        </template>

        <v-divider class="my-2" />

        <!-- User Actions in Mobile -->
        <v-list-item to="/change-password" prepend-icon="mdi-lock-outline" title="Ganti Password" @click="drawer = false" />
        <v-list-item to="/update-program" prepend-icon="mdi-update" title="Cek Versi" @click="drawer = false" />
        <v-list-item @click="handleLogout" prepend-icon="mdi-logout" title="Logout" class="text-error" />
      </v-list>
    </v-navigation-drawer>
  </div>
</template>

<style scoped>
.logo-container:hover {
  text-decoration: none !important;
}

.brand-text {
  line-height: 1.2;
}

.brand-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #1976d2;
  letter-spacing: -0.025em;
}

.brand-subtitle {
  font-size: 0.75rem;
  color: #666;
  font-weight: 500;
}

.nav-btn {
  border-radius: 8px;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  background-color: rgba(25, 118, 210, 0.08);
}

.nav-text {
  font-weight: 500;
  font-size: 0.875rem;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: rgba(25, 118, 210, 0.05);
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1976d2;
  margin: 0;
}

.menu-item-title {
  font-size: 0.8125rem;
  font-weight: 500;
}

.user-btn {
  border-radius: 20px;
  transition: all 0.2s ease;
}

.user-btn:hover {
  background-color: rgba(25, 118, 210, 0.08);
}

.user-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.user-initial {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
}

.user-profile-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.user-profile-role {
  font-size: 0.8125rem;
  opacity: 0.7;
}

.drawer-header {
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  color: white;
}

.drawer-title {
  font-weight: 700;
  margin: 0;
  font-size: 1.5rem;
}

.drawer-subtitle {
  margin: 0;
  opacity: 0.9;
  font-size: 0.8125rem;
}

/* Enhanced styling for sub menu levels */
.v-list-group--sub-group {
  --indent-padding: 16px;
}

.v-list-group--sub-group .v-list-item {
  padding-inline-start: calc(var(--indent-padding) + 16px) !important;
}

.v-list-group--sub-group .v-list-group--sub-group .v-list-item {
  padding-inline-start: calc(var(--indent-padding) + 32px) !important;
}

/* Mobile responsive adjustments */
@media (max-width: 960px) {
  .brand-title {
    font-size: 1.1rem;
  }
  
  .brand-subtitle {
    font-size: 0.7rem;
  }
}
</style>