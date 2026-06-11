<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import logo from "@/assets/logo.png";
import { usePasswordDialog } from "@/composables/usePasswordDialog";
import { useWhatsAppDialog } from "@/composables/useWhatsappDialog";
import { useBufferStockDialog } from "@/composables/useBufferStockDialog";
import { useSettingsProcessDialog } from "@/composables/useSettingsProcessDialog";
import { useManualProgramDialog } from "@/composables/useManualProgramDialog";
import { useMemoInternalDialog } from "@/composables/useMemoInternalDialog";
import { useDisplay } from "vuetify";

interface NavSection {
  title: string;
  icon: string;
  items: NavItem[];
}

interface NavItem {
  title?: string; // UBAH INI: Tambahkan '?' agar opsional
  icon?: string;
  to?: string;
  divider?: boolean; // Dibutuhkan untuk objek { divider: true }
  onClick?: () => void;
  badgeKey?: string;
  items?: NavItem[];
  subItems?: NavItem[];
  isLarge?: boolean;
  sections?: NavSection[];
  model?: { value: boolean };
}

// Stores and composables
const authStore = useAuthStore();
const router = useRouter();
const logoSrc = logo as string;
const { smAndDown } = useDisplay();

// Component state
const scrolled = ref(false);
const drawer = ref(false);
const daftarMenu = ref(false);
const transaksiMenu = ref(false);
const operasionalMenu = ref(false); // [BARU]
const piutangMenu = ref(false);
const gudangMenu = ref(false);
const laporanMenu = ref(false);
const fileMenu = ref(false);
const userMenu = ref(false);

// Computed properties
const appBarElevation = computed(() => (scrolled.value ? 2 : 0));
// [FIX DARK MODE] Hapus class manual, gunakan props color dinamis di template
const isScrolled = computed(() => scrolled.value);
const hasOperasionalNotif = computed(() => {
  const n = authStore.notifications;
  return n.sj > 0 || n.mutasi > 0 || n.retur > 0 || n.pinjam > 0;
});

const hasToolsNotif = computed(() => authStore.notifications.memo > 0);
const hasGudangNotif = computed(() => {
  // Hanya munculkan badge di menu 'Gudang DC' jika user di cabang KDC dan ada retur pending
  return authStore.userCabang === "KDC" && authStore.notifications.retur > 0;
});

// Tambahkan di dalam <script setup>
const userRoleConfig = computed(() => {
  const user = authStore.user;
  const cabang = authStore.userCabang?.toUpperCase() || "";
  const name = authStore.userName?.toUpperCase() || "";

  // 1. Administrator (Prioritas 1 - Merah)
  if (name.includes("ADMIN")) {
    return { icon: "mdi-shield-account", color: "red-darken-2" };
  }

  // 2. [FIX] Warehouse User (Prioritas 2 - Oranye)
  // ADIN & LUTFI akan selalu jadi Warehouse meski login di KDC
  if (user?.isWarehouseUser) {
    return { icon: "mdi-warehouse", color: "orange-darken-3" };
  }

  // 3. KDC / Pusat (Prioritas 3 - Indigo)
  // Staff office KDC lainnya (Finance, Admin Office)
  if (cabang === "KDC") {
    return { icon: "mdi-office-building", color: "indigo-darken-2" };
  }

  // 4. Store (Default - Teal)
  return { icon: "mdi-store", color: "teal-darken-1" };
});

// Access control helper
const hasAccess = (routeNameOrPath?: string) => {
  if (!routeNameOrPath) return true;
  const authStore = useAuthStore();
  const route = router
    .getRoutes()
    .find((r) => r.name === routeNameOrPath || r.path === routeNameOrPath);
  if (!route) return false;
  if (!route.meta.requiresAuth) return true;
  if (!authStore.isAuthenticated) return false;
  if (route.meta.menuId) return authStore.allowedMenus.includes(route.meta.menuId as string);
  return true;
};

const { openPasswordDialog } = usePasswordDialog();
const { openWhatsAppDialog } = useWhatsAppDialog();
const { openBufferStockDialog } = useBufferStockDialog();
const { openSettingsProcessDialog } = useSettingsProcessDialog();
const { openManualDialog } = useManualProgramDialog();
const { openMemoDialog } = useMemoInternalDialog();

// Menu configuration
// (DATA MENU TETAP SAMA SEPERTI KODE ASLI ANDA, SAYA TIDAK UBAH ISINYA)
const menuItems: NavItem[] = [
  {
    title: "Daftar",
    icon: "mdi-clipboard-list-outline",
    model: daftarMenu,
    items: [
      { title: "Customer", to: "/daftar/customers", icon: "mdi-account-outline" },
      { title: "Member", to: "/daftar/members", icon: "mdi-card-account-details-star-outline" },
      { title: "Supplier", to: "/daftar/suppliers", icon: "mdi-truck-outline" },
      { title: "Sales Counter", to: "/daftar/sales-counters", icon: "mdi-counter" },
      { title: "Cetak Barcode", to: "/daftar/cetak-barcode", icon: "mdi-barcode" },
    ],
  },
  {
    title: "Transaksi", // Sekarang murni fokus ke Penjualan
    icon: "mdi-cash-register",
    model: transaksiMenu,
    isLarge: true,
    sections: [
      {
        title: "Penjualan",
        icon: "mdi-cart-outline",
        items: [
          {
            title: "Penawaran",
            to: "/transaksi/penjualan/penawaran",
            icon: "mdi-handshake-outline",
          },
          {
            title: "Pengajuan Harga",
            icon: "mdi-currency-usd",
            subItems: [
              {
                title: "Pengajuan",
                to: "/transaksi/penjualan/pengajuan/pengajuan-harga",
                icon: "mdi-file-document-plus-outline",
              },
              {
                title: "Setting Harga",
                to: "/transaksi/penjualan/pengajuan/setting-harga",
                icon: "mdi-tune-variant",
              },
            ],
          },
          {
            title: "DTF Pesanan",
            icon: "mdi-printer",
            subItems: [
              {
                title: "SO DTF Trial Pesanan",
                to: "/transaksi/penjualan/dtf/so-dtf-trial",
                icon: "mdi-flask-outline", // Icon tabung reaksi / uji coba
              },
              {
                title: "SO DTF Pesanan",
                to: "/transaksi/penjualan/dtf/so-dtf",
                icon: "mdi-clipboard-list-outline",
              },
              {
                title: "LHK Jasa",
                to: "/transaksi/penjualan/dtf/lhk-so-dtf",
                icon: "mdi-file-chart-outline",
              },
              {
                title: "Log Mesin DTF",
                to: "/transaksi/penjualan/dtf/log-mesin",
                icon: "mdi-printer-3d",
              },
              {
                title: "Dasbor DTF",
                to: "/transaksi/penjualan/dtf/dasbor-dtf",
                icon: "mdi-view-dashboard-outline",
              },
              {
                title: "Dasbor Bordir",
                to: "/transaksi/penjualan/dtf/dasbor-bordir",
                icon: "mdi-tshirt-crew-outline",
              },
            ],
          },
          {
            title: "DTF Stok",
            icon: "mdi-package-variant",
            subItems: [
              {
                title: "SO DTF Stok",
                to: "/transaksi/penjualan/dtf/so-dtf-stok",
                icon: "mdi-package-variant",
              },
              {
                title: "LHK SO DTF Stok",
                to: "/transaksi/penjualan/dtf/lhk-so-dtf-stok",
                icon: "mdi-chart-box-outline",
              },
            ],
          },
          {
            title: "Surat Pesanan",
            to: "/transaksi/penjualan/surat-pesanan",
            icon: "mdi-file-document-edit-outline",
          },
          {
            title: "Proforma Invoice",
            to: "/transaksi/penjualan/proforma",
            icon: "mdi-receipt-text-outline",
          },
          { title: "Invoice", to: "/transaksi/penjualan/invoice", icon: "mdi-receipt" },
          {
            title: "Pelunasan Invoice",
            to: "/transaksi/penjualan/pelunasan-invoice",
            icon: "mdi-hand-coin",
          },
          {
            title: "Retur Jual",
            to: "/transaksi/penjualan/retur-jual",
            icon: "mdi-keyboard-return",
          },
          {
            title: "Komplain Customer",
            to: "/transaksi/penjualan/komplain-customer",
            icon: "mdi-comment-alert-outline",
          },
          {
            title: "Biaya Kirim",
            to: "/transaksi/penjualan/biaya-kirim",
            icon: "mdi-truck-delivery",
          },
        ],
      },
    ],
  },
  // ==========================================
  // [MENU BARU] OPERASIONAL STORE
  // ==========================================
  {
    title: "Operasional",
    icon: "mdi-store-cog-outline",
    model: operasionalMenu,
    isLarge: true,
    sections: [
      {
        title: "Internal Store",
        icon: "mdi-office-building-outline",
        items: [
          {
            title: "Panel Seting Buffer",
            to: "/transaksi/internal/panel-buffer-stok",
            icon: "mdi-database-sync-outline",
          },
          {
            title: "Buffer Stok",
            to: "/transaksi/internal/buffer-stok",
            icon: "mdi-database-outline",
          },
          {
            title: "Minta Barang ke DC",
            to: "/transaksi/internal/minta-barang",
            icon: "mdi-arrow-up-bold-circle-outline",
          },
          {
            title: "Terima Surat Jalan",
            to: "/transaksi/internal/terima-sj",
            icon: "mdi-arrow-down-bold-circle-outline",
            badgeKey: "sj",
          },
          {
            title: "Retur Barang ke DC",
            to: "/transaksi/internal/retur-dc",
            icon: "mdi-undo-variant",
            badgeKey: "retur",
          },
          {
            title: "Koreksi Stok",
            to: "/transaksi/internal/koreksi-stok",
            icon: "mdi-pencil-outline",
          },
          {
            title: "Pengajuan Barcode",
            to: "/transaksi/internal/pengajuan-barcode",
            icon: "mdi-barcode",
          },
          {
            title: "Peminjaman Barang",
            to: "/transaksi/internal/peminjaman-barang",
            icon: "mdi-hand-back-right-outline",
            badgeKey: "pinjam",
          },
          {
            title: "Petty Cash Store",
            to: "/transaksi/internal/petty-cash",
            icon: "mdi-wallet-outline",
          },
          {
            title: "Klerek",
            to: "/transaksi/internal/klerek",
            icon: "mdi-clipboard-check-outline",
          },
        ],
      },
      {
        title: "Mutasi",
        icon: "mdi-swap-horizontal",
        items: [
          {
            title: "Mutasi Out ke Produksi",
            to: "/transaksi/mutasi/out-produksi",
            icon: "mdi-export",
          },
          {
            title: "Mutasi In dari Produksi",
            to: "/transaksi/mutasi/in-produksi",
            icon: "mdi-import",
          },
          { title: "Mutasi Stok", to: "/transaksi/mutasi/stok", icon: "mdi-swap-vertical" },
          {
            title: "Mutasi Antar Store (Kirim)",
            to: "/transaksi/mutasi/store-kirim",
            icon: "mdi-send",
          },
          {
            title: "Mutasi Antar Store (Terima)",
            to: "/transaksi/mutasi/store-terima",
            icon: "mdi-inbox-arrow-down",
            badgeKey: "mutasi",
          },
        ],
      },
      {
        title: "Stok Opname",
        icon: "mdi-clipboard-check-multiple-outline",
        items: [
          {
            title: "List HPP Kosong",
            to: "/transaksi/stok-opname/hpp-kosong",
            icon: "mdi-currency-usd-off",
          },
          {
            title: "Setting Tanggal",
            to: "/transaksi/stok-opname/setting-tanggal",
            icon: "mdi-calendar-edit-outline",
          },
          {
            title: "Master Lokasi",
            to: "/transaksi/stok-opname/lokasi-opname",
            icon: "mdi-map-marker-plus-outline",
          },
          {
            title: "Input Hitung Stok",
            to: "/transaksi/stok-opname/hitung-stok",
            icon: "mdi-clipboard-edit-outline",
          },
          {
            title: "Hitung Stok per Lokasi",
            to: "/transaksi/stok-opname/hitung-per-lokasi",
            icon: "mdi-map-marker-multiple-outline",
          },
          {
            title: "Hitung Stok per Operator",
            to: "/transaksi/stok-opname/hitung-per-operator",
            icon: "mdi-account-details-outline",
          },
          {
            title: "Cek Selisih",
            to: "/transaksi/stok-opname/cek-selisih",
            icon: "mdi-scale-balance",
          },
          { title: "Proses", to: "/transaksi/stok-opname/proses", icon: "mdi-progress-check" },
        ],
      },
      // ==========================================
      // [PINDAHAN] WORKSHOP KAOSAN SEKARANG DI SINI
      // ==========================================
      {
        title: "Workshop Kaosan",
        icon: "mdi-factory",
        items: [
          {
            title: "Mutasi ke Workshop",
            to: "/operasional/workshop/mutasi-workshop",
            icon: "mdi-swap-horizontal",
          },
          {
            title: "Terima Workshop",
            to: "/operasional/workshop/terima-workshop",
            icon: "mdi-truck-check-outline",
          },
          {
            title: "Penyelesaian (LHK)",
            to: "/bordir/penyelesaian",
            icon: "mdi-check-decagram-outline",
          },
          {
            title: "Surat Jalan (Kirim Store)",
            to: "/operasional/workshop/sj-workshop",
            icon: "mdi-truck-fast-outline",
          },
          {
            title: "Stok Benang/Material",
            to: "/bordir/stok-material",
            icon: "mdi-palette-swatch-outline",
          },
        ],
      },
    ],
  },
  {
    title: "Finance",
    icon: "mdi-credit-card-outline",
    model: piutangMenu,
    items: [
      { title: "Setoran Pembayaran", to: "/piutang/setoran-pembayaran", icon: "mdi-bank-transfer" },
      { title: "Form Setoran Kasir", to: "/piutang/fsk", icon: "mdi-cash-multiple" },
      { title: "Kartu Piutang", to: "/piutang/kartu-piutang", icon: "mdi-credit-card-outline" },
      { divider: true },
      { title: "Potongan", to: "/piutang/potongan", icon: "mdi-tag-minus-outline" },
      { title: "Refund", to: "/piutang/refund", icon: "mdi-cash-refund" },
      { divider: true },
      { title: "Klaim Petty Cash", to: "/piutang/klaim-petty-cash", icon: "mdi-cash-check" },
    ],
  },
  {
    title: "Gudang DC",
    icon: "mdi-warehouse",
    model: gudangMenu,
    isLarge: true,
    sections: [
      {
        title: "Master Data",
        icon: "mdi-database-outline",
        items: [
          { title: "Jenis Kain", to: "/gudang-dc/master-data/jenis-kain", icon: "mdi-texture" },
          {
            title: "Warna Kain",
            to: "/gudang-dc/master-data/warna-kain",
            icon: "mdi-palette-outline",
          },
          { title: "Lengan", to: "/gudang-dc/master-data/lengan", icon: "mdi-tshirt-crew-outline" },
          {
            title: "Barang",
            to: "/gudang-dc/master-data/barang-dc",
            icon: "mdi-package-variant-closed",
          },
          {
            title: "Price List",
            to: "/gudang-dc/master-data/price-list",
            icon: "mdi-receipt-text-outline",
          },
          { title: "Promo", to: "/gudang-dc/master-data/promo", icon: "mdi-percent-outline" },
          {
            title: "Master Barang External",
            to: "/gudang-dc/master-data/barang-external",
            icon: "mdi-link-variant",
          },
        ],
      },
      {
        title: "Operasional Gudang",
        icon: "mdi-forklift",
        items: [
          {
            title: "Dasbor SPK Kaosan",
            to: "/gudang-dc/operasional/dasbor-spk",
            icon: "mdi-file-document-check-outline",
          },
          {
            title: "Terima STBJ",
            to: "/gudang-dc/operasional/terima-stbj",
            icon: "mdi-inbox-arrow-down",
          },
          {
            title: "Terima dari Gudang Repair",
            to: "/gudang-dc/operasional/terima-repair",
            icon: "mdi-tools",
          },
          {
            title: "Permintaan Kaosan",
            to: "/gudang-dc/operasional/minta-accesories",
            icon: "mdi-hand-extended-outline",
          },
          {
            title: "Packing List / Pra-SJ",
            to: "/gudang-dc/operasional/packing-list",
            icon: "mdi-package-variant-closed",
          },
          {
            title: "Surat Jalan ke Store",
            to: "/gudang-dc/operasional/surat-jalan-store",
            icon: "mdi-truck-delivery-outline",
          },
          {
            title: "Pengambilan Barang",
            to: "/gudang-dc/operasional/ambil-barang",
            icon: "mdi-package-up",
          },
          {
            title: "Terima Retur dari Store",
            to: "/gudang-dc/operasional/terima-rb",
            icon: "mdi-package-down",
            badgeKey: "retur",
          },
          {
            title: "QC ke Garmen",
            to: "/gudang-dc/operasional/qc-garmen",
            icon: "mdi-quality-high",
          },
          {
            title: "Mutasi Stok Antar Gudang",
            to: "/gudang-dc/operasional/mutasi-antar-gudang",
            icon: "mdi-swap-horizontal-circle-outline",
          },
        ],
      },
    ],
  },
  {
    title: "Laporan",
    icon: "mdi-chart-box-outline",
    model: laporanMenu,
    isLarge: true,
    sections: [
      {
        title: "Stok",
        icon: "mdi-archive-outline",
        items: [
          { title: "Laporan Stok", to: "/laporan/stok/real-time", icon: "mdi-package-variant" },
          { title: "Stok Bahan", to: "/laporan/stok/bahan", icon: "mdi-package-variant-closed" },
          { title: "Stok Minus", to: "/laporan/stok/stok-minus", icon: "mdi-trending-down" },
          { title: "Mutasi Stok", to: "/laporan/stok/mutasi-stok", icon: "mdi-swap-horizontal" },
          { title: "Kartu Stok", to: "/laporan/stok/kartu-stok", icon: "mdi-card-text-outline" },
          { title: "Stok Stagnan", to: "/laporan/stok/stagnan", icon: "mdi-clock-outline" },
          { title: "Dead Stok", to: "/laporan/stok/dead-stok", icon: "mdi-alert-circle-outline" },
        ],
      },
      {
        title: "Penjualan",
        icon: "mdi-trending-up",
        items: [
          { title: "Laporan Invoice", to: "/laporan/penjualan/invoice", icon: "mdi-receipt" },
          { title: "Pareto Barang", to: "/laporan/penjualan/pareto", icon: "mdi-chart-bar" },
          {
            title: "Laporan Lost Order",
            to: "/laporan/penjualan/lost-order",
            icon: "mdi-account-cancel-outline",
          },
          {
            title: "Sales vs Target",
            to: "/laporan/penjualan/sales-vs-target",
            icon: "mdi-target",
          },
          {
            title: "Target Achievement",
            to: "/laporan/penjualan/monitoring-achievement",
            icon: "mdi-trophy-outline",
          },
        ],
      },
      {
        title: "Analisa",
        icon: "mdi-chart-timeline-variant",
        items: [
          { title: "Penjualan Pivot", to: "/laporan/analisa/with-pivot", icon: "mdi-table-pivot" },
          { title: "Stok Pivot", to: "/laporan/analisa/stok-pivot", icon: "mdi-table-large" },
        ],
      },
      {
        title: "Lain-lain",
        icon: "mdi-dots-horizontal",
        items: [
          {
            title: "List Otorisasi",
            to: "/laporan/lain-lain/list-otorisasi",
            icon: "mdi-card-text-outline",
          },
          { title: "Saldo Kasir", to: "/laporan/lain-lain/saldo-kasir", icon: "mdi-cash-register" },
          {
            title: "Petty Cash",
            to: "/laporan/lain-lain/petty-cash",
            icon: "mdi-book-open-variant",
          },
          { title: "Audit Log", to: "/laporan/lain-lain/audit-log", icon: "mdi-history" },
        ],
      },
    ],
  },
  {
    title: "Tools",
    icon: "mdi-wrench-outline",
    model: fileMenu,
    items: [
      {
        title: "Manual Program",
        icon: "mdi-book-open-outline",
        onClick: () => {
          openManualDialog();
          drawer.value = false;
        },
      },
      {
        title: "Memo Internal",
        icon: "mdi-bulletin-board",
        onClick: () => {
          handleOpenMemo();
          drawer.value = false;
        },
        badgeKey: "memo",
      },
      {
        title: "Update Buffer Stok",
        icon: "mdi-database-sync",
        onClick: () => {
          openBufferStockDialog();
          drawer.value = false;
        },
      },
      {
        title: "Setting",
        icon: "mdi-cog-outline",
        onClick: () => {
          openSettingsProcessDialog();
          drawer.value = false;
        },
      },
      { divider: true },
      { title: "User", to: "/file/users", icon: "mdi-account-group-outline" },
    ],
  },
];

// Menu control methods
const closeMenus = () => {
  menuItems.forEach((menu) => {
    if (menu.model && menu.model.value) {
      menu.model.value = false;
    }
  });
  drawer.value = false; // Tutup drawer kalau ada menu yang di-klik di mobile
};

const handleLogout = () => {
  authStore.logout();
  router.push("/login");
};

const handleScroll = () => {
  scrolled.value = window.scrollY > 10;
};

const handleOpenMemo = () => {
  openMemoDialog();

  // Simpan waktu sekarang sebagai tanda sudah dibaca
  const now = new Date().toISOString();
  localStorage.setItem("last_memo_open_at", now);

  // Langsung hilangkan badge di UI secara instan
  authStore.notifications.memo = 0;
};

onMounted(() => {
  window.addEventListener("scroll", handleScroll);
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
});
</script>

<template>
  <v-app-bar
    flat
    height="64"
    :elevation="appBarElevation"
    fixed
    :class="['desktop-navbar', { 'navbar-scrolled': isScrolled }]"
  >
    <v-app-bar-nav-icon
      v-if="smAndDown"
      @click="drawer = !drawer"
      color="primary"
      class="mr-2"
    ></v-app-bar-nav-icon>
    <RouterLink to="/" class="logo-section">
      <v-avatar size="32" class="logo-avatar">
        <v-img :src="logoSrc" alt="Kaosan Logo" cover />
      </v-avatar>
      <div class="brand-info">
        <span class="brand-title">Kaosan</span>
        <span class="brand-subtitle d-none d-sm-flex">Retail Management System</span>
      </div>
    </RouterLink>

    <v-spacer />

    <nav class="main-navigation d-none d-md-flex">
      <template v-for="menu in menuItems" :key="menu.title">
        <v-menu
          v-if="menu.model && !menu.isLarge && (!('to' in menu) || hasAccess(menu.to as string))"
          v-model="menu.model.value"
          offset-y
          :close-on-content-click="false"
          :max-width="menu.title === 'Transaksi' ? 1200 : menu.title === 'Gudang DC' ? 1200 : 1000"
          transition="fade-transition"
          class="nav-menu"
          location="bottom center"
          origin="top center"
        >
          <template #activator="{ props }">
            <v-badge
              color="error"
              dot
              :model-value="
                (menu.title === 'Operasional' && hasOperasionalNotif) ||
                (menu.title === 'Tools' && hasToolsNotif) ||
                (menu.title === 'Gudang DC' && hasGudangNotif)
              "
              offset-x="10"
              offset-y="10"
            >
              <v-btn variant="text" v-bind="props" :prepend-icon="menu.icon" class="nav-button">
                {{ menu.title }}
              </v-btn>
            </v-badge>
          </template>

          <v-card class="nav-dropdown" elevation="8">
            <v-list class="nav-list" density="comfortable">
              <template
                v-for="(item, index) in (menu.items ?? []).filter((i) => !i.to || hasAccess(i.to))"
                :key="index"
              >
                <v-divider v-if="item.divider" class="nav-divider" />

                <v-list-group
                  v-else-if="'subItems' in item"
                  :value="item.title"
                  class="nav-list-group"
                >
                  <template #activator="{ props }">
                    <v-list-item v-bind="props" :prepend-icon="item.icon" class="nav-list-item">
                      <v-list-item-title>{{ item.title }}</v-list-item-title>
                    </v-list-item>
                  </template>

                  <template
                    v-for="subItem in ((item.subItems as NavItem[] | undefined) ?? []).filter(si => hasAccess(si.to))"
                    :key="subItem.title"
                  >
                    <v-list-group
                      v-if="subItem.subItems"
                      :value="subItem.title"
                      class="nav-list-group nested"
                    >
                      <template #activator="{ props }">
                        <v-list-item
                          v-bind="props"
                          :prepend-icon="subItem.icon"
                          class="nav-list-item nested"
                        >
                          <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                        </v-list-item>
                      </template>
                      <v-list-item
                        v-for="subSubItem in subItem.subItems.filter((ssi) => hasAccess(ssi.to))"
                        :key="subSubItem.title"
                        :to="subSubItem.to"
                        :prepend-icon="subSubItem.icon"
                        class="nav-list-item deep-nested"
                        @click="closeMenus"
                      >
                        <v-list-item-title>{{ subSubItem.title }}</v-list-item-title>
                      </v-list-item>
                    </v-list-group>

                    <v-list-item
                      v-else
                      :to="subItem.to"
                      :prepend-icon="subItem.icon"
                      class="nav-list-item sub"
                      @click="closeMenus"
                    >
                      <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                    </v-list-item>
                  </template>
                </v-list-group>

                <v-list-item
                  v-else
                  :to="item.to"
                  @click="
                    () => {
                      if (item.onClick) item.onClick();
                      closeMenus();
                    }
                  "
                >
                  <template #prepend>
                    <v-badge
                      v-if="item.badgeKey && authStore.notifications[item.badgeKey as keyof typeof authStore.notifications] > 0"
                      color="error"
                      dot
                      floating
                    >
                      <v-icon>{{ item.icon }}</v-icon>
                    </v-badge>
                    <v-icon v-else>{{ item.icon }}</v-icon>
                  </template>
                  <v-list-item-title>{{ item.title }}</v-list-item-title>
                </v-list-item>
              </template>
            </v-list>
          </v-card>
        </v-menu>

        <v-menu
          v-else-if="menu.model && menu.isLarge"
          v-model="menu.model.value"
          offset-y
          :max-width="menu.title === 'Gudang DC' ? 1200 : 1000"
          transition="fade-transition"
          :close-on-content-click="false"
          class="nav-menu large"
        >
          <template #activator="{ props }">
            <v-badge
              color="error"
              dot
              :model-value="
                (menu.title === 'Operasional' && hasOperasionalNotif) ||
                (menu.title === 'Tools' && hasToolsNotif) ||
                (menu.title === 'Gudang DC' && hasGudangNotif)
              "
              offset-x="10"
              offset-y="10"
            >
              <v-btn variant="text" v-bind="props" :prepend-icon="menu.icon" class="nav-button">
                {{ menu.title }}
              </v-btn>
            </v-badge>
          </template>

          <v-card class="large-nav-dropdown" elevation="8">
            <v-container fluid class="pa-4">
              <v-row>
                <v-col
                  v-for="section in menu.sections ?? []"
                  :key="section.title"
                  :cols="12 / (menu.sections?.length || 1)"
                  class="section-col"
                >
                  <div class="section-header bg-primary-lighten-5">
                    <v-icon :icon="section.icon" size="18" class="section-icon text-primary" />
                    <h4 class="section-title text-primary">{{ section.title }}</h4>
                  </div>

                  <v-list density="compact" class="section-list">
                    <template
                      v-for="item in section.items.filter((i) => !i.to || hasAccess(i.to))"
                      :key="item.title"
                    >
                      <v-list-group
                        v-if="item.subItems"
                        :value="item.title"
                        class="section-list-group"
                      >
                        <template #activator="{ props }">
                          <v-list-item
                            v-bind="props"
                            :prepend-icon="item.icon"
                            :title="item.title"
                            class="section-list-item"
                          />
                        </template>
                        <template
                          v-for="subItem in (item.subItems ?? []).filter((si) => hasAccess(si.to))"
                          :key="subItem.title"
                        >
                          <v-list-group
                            v-if="'subItems' in subItem && Array.isArray((subItem as any).subItems)"
                            :value="subItem.title"
                            class="section-list-group nested"
                          >
                            <template #activator="{ props }">
                              <v-list-item
                                v-bind="props"
                                :prepend-icon="subItem.icon"
                                class="section-list-item nested"
                              >
                                <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                              </v-list-item>
                            </template>
                            <v-list-item
                              v-for="subSubItem in ((subItem.subItems as NavItem[] | undefined) ?? []).filter(ssi => hasAccess(ssi.to))"
                              :key="subSubItem.title"
                              :to="subSubItem.to"
                              :prepend-icon="subSubItem.icon"
                              class="section-list-item deep-nested"
                              @click="closeMenus"
                            >
                              <v-list-item-title>{{ subSubItem.title }}</v-list-item-title>
                            </v-list-item>
                          </v-list-group>
                          <v-list-item
                            v-else
                            :to="subItem.to"
                            :prepend-icon="subItem.icon"
                            class="section-list-item sub"
                            @click="closeMenus"
                          >
                            <v-list-item-title>{{ subItem.title }}</v-list-item-title>
                          </v-list-item>
                        </template>
                      </v-list-group>
                      <v-list-item
                        v-else
                        :to="item.to"
                        class="section-list-item"
                        @click="closeMenus"
                      >
                        <template #prepend>
                          <v-badge
                            v-if="item.badgeKey && authStore.notifications[item.badgeKey as keyof typeof authStore.notifications] > 0"
                            color="error"
                            :content="authStore.notifications[item.badgeKey as keyof typeof authStore.notifications]"
                            overlap
                          >
                            <v-icon>{{ item.icon }}</v-icon>
                          </v-badge>
                          <v-icon v-else>{{ item.icon }}</v-icon>
                        </template>
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

    <v-menu v-model="userMenu" offset-y transition="fade-transition" class="user-menu">
      <template #activator="{ props }">
        <v-btn variant="text" v-bind="props" class="user-button">
          <v-avatar :color="userRoleConfig.color" size="28" class="user-avatar">
            <v-icon :icon="userRoleConfig.icon" size="18" color="white" />
          </v-avatar>
          <span class="user-name">{{ authStore.userName }}</span>
          <v-icon icon="mdi-chevron-down" size="16" class="user-chevron" />
        </v-btn>
      </template>

      <v-card class="user-dropdown" elevation="8">
        <v-list class="user-list">
          <v-list-item class="user-profile-item bg-primary-lighten-5">
            <template #prepend>
              <v-avatar :color="userRoleConfig.color" size="32">
                <v-icon :icon="userRoleConfig.icon" size="20" color="white" />
              </v-avatar>
            </template>
            <v-list-item-title class="user-profile-name">{{
              authStore.userName
            }}</v-list-item-title>
            <v-list-item-subtitle class="user-profile-branch">{{
              authStore.userCabang
            }}</v-list-item-subtitle>
          </v-list-item>

          <v-divider class="user-divider" />

          <v-list-item
            @click="openWhatsAppDialog"
            prepend-icon="mdi-whatsapp"
            class="user-menu-item"
          >
            <v-list-item-title>Tautkan WhatsApp</v-list-item-title>
          </v-list-item>

          <v-list-item
            @click="openPasswordDialog"
            prepend-icon="mdi-lock-outline"
            class="user-menu-item"
          >
            <v-list-item-title>Ganti Password</v-list-item-title>
          </v-list-item>

          <v-divider class="user-divider" />

          <v-list-item
            @click="handleLogout"
            prepend-icon="mdi-logout"
            class="user-menu-item logout"
          >
            <v-list-item-title>Logout</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu>
  </v-app-bar>

  <v-navigation-drawer v-model="drawer" temporary location="left" width="300" class="mobile-drawer">
    <v-list-item class="bg-primary-lighten-5 py-4">
      <template #prepend>
        <v-avatar :color="userRoleConfig.color" size="40">
          <v-icon :icon="userRoleConfig.icon" size="24" color="white" />
        </v-avatar>
      </template>
      <v-list-item-title class="font-weight-bold text-subtitle-1">{{
        authStore.userName
      }}</v-list-item-title>
      <v-list-item-subtitle>{{ authStore.userCabang }}</v-list-item-subtitle>
    </v-list-item>

    <v-divider></v-divider>

    <v-list density="compact" nav>
      <template v-for="menu in menuItems" :key="menu.title">
        <v-list-group v-if="!menu.isLarge" :value="menu.title" :prepend-icon="menu.icon">
          <template #activator="{ props }">
            <v-list-item v-bind="props">
              <v-list-item-title class="font-weight-medium">{{ menu.title }}</v-list-item-title>
            </v-list-item>
          </template>

          <template
            v-for="(item, i) in (menu.items ?? []).filter((i) => !i.to || hasAccess(i.to))"
            :key="i"
          >
            <v-divider v-if="item.divider" />
            <v-list-item
              v-else
              :to="item.to"
              :prepend-icon="item.icon"
              @click="item.onClick ? item.onClick() : closeMenus()"
            >
              <v-list-item-title>{{ item.title }}</v-list-item-title>
            </v-list-item>
          </template>
        </v-list-group>

        <v-list-group v-else :value="menu.title" :prepend-icon="menu.icon">
          <template #activator="{ props }">
            <v-list-item v-bind="props">
              <v-list-item-title class="font-weight-medium">{{ menu.title }}</v-list-item-title>
            </v-list-item>
          </template>

          <template v-for="section in menu.sections" :key="section.title">
            <v-list-subheader class="font-weight-bold text-primary mt-2">{{
              section.title
            }}</v-list-subheader>
            <template
              v-for="item in section.items.filter((i) => !i.to || hasAccess(i.to))"
              :key="item.title"
            >
              <v-list-group v-if="item.subItems" :value="item.title" class="pl-2">
                <template #activator="{ props }">
                  <v-list-item v-bind="props" :prepend-icon="item.icon">
                    <v-list-item-title>{{ item.title }}</v-list-item-title>
                  </v-list-item>
                </template>
                <v-list-item
                  v-for="sub in item.subItems.filter((s) => !s.to || hasAccess(s.to))"
                  :key="sub.title"
                  :to="sub.to"
                  :prepend-icon="sub.icon"
                  @click="closeMenus"
                >
                  <v-list-item-title>{{ sub.title }}</v-list-item-title>
                </v-list-item>
              </v-list-group>

              <v-list-item
                v-else
                :to="item.to"
                :prepend-icon="item.icon"
                class="pl-4"
                @click="closeMenus"
              >
                <v-list-item-title>{{ item.title }}</v-list-item-title>
              </v-list-item>
            </template>
          </template>
        </v-list-group>
      </template>

      <v-divider class="my-2"></v-divider>
      <v-list-subheader class="font-weight-bold text-grey-darken-1">Akun Saya</v-list-subheader>
      <v-list-item
        @click="
          openWhatsAppDialog();
          drawer = false;
        "
        prepend-icon="mdi-whatsapp"
      >
        <v-list-item-title>Tautkan WhatsApp</v-list-item-title>
      </v-list-item>
      <v-list-item
        @click="
          openPasswordDialog();
          drawer = false;
        "
        prepend-icon="mdi-lock-outline"
      >
        <v-list-item-title>Ganti Password</v-list-item-title>
      </v-list-item>
      <v-list-item @click="handleLogout" prepend-icon="mdi-logout" class="text-error">
        <v-list-item-title>Logout</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-navigation-drawer>
</template>

<style scoped>
/* Main navbar styling */
.desktop-navbar {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background-color: rgba(var(--v-theme-surface), 0.85) !important;
  backdrop-filter: blur(12px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.navbar-scrolled {
  background-color: rgba(var(--v-theme-surface), 0.98) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

/* Logo section */
.logo-section {
  display: flex;
  align-items: center;
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
  margin-right: 24px;
}

.logo-section:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
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
  font-size: 1.1rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* Main navigation */
.main-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-button {
  height: 38px;
  padding: 0 16px;
  font-weight: 600;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface));
  border-radius: 8px;
  text-transform: none;
  letter-spacing: 0.01em;
  transition: all 0.2s ease;
}

.nav-button:hover {
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.nav-button.v-btn--active {
  background-color: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.nav-button .v-icon {
  font-size: 18px;
  margin-right: 6px;
  opacity: 0.8;
}

/* Dropdown styling */
.nav-dropdown,
.large-nav-dropdown {
  border-radius: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
  background-color: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.15);
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
  color: rgb(var(--v-theme-on-surface));
}

.nav-list-item:hover,
.section-list-item:hover,
.user-menu-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.06);
  color: rgb(var(--v-theme-primary));
}

.nav-list-item.sub,
.section-list-item.sub {
  padding-left: 48px;
}

.nav-list-item.nested,
.section-list-item.nested {
  padding-left: 32px;
}

.nav-list-item.deep-nested,
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
  background: rgba(var(--v-theme-primary), 0.06);
  border-radius: 6px;
  border-left: 3px solid rgb(var(--v-theme-primary));
}

.section-icon {
  margin-right: 8px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
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
  background-color: rgba(var(--v-theme-primary), 0.06);
}

.user-avatar {
  margin-right: 8px;
}

.user-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  margin: 0 4px;
}

.user-chevron {
  color: rgba(var(--v-theme-on-surface), 0.6);
  transition: transform 0.2s ease;
}

.user-button:hover .user-chevron {
  transform: rotate(180deg);
}

.user-dropdown {
  min-width: 200px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.user-profile-item {
  padding: 12px 16px;
  background-color: rgba(var(--v-theme-primary), 0.05);
}

.user-profile-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: rgb(var(--v-theme-on-surface));
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

/* Animations */
.fade-transition-enter-active,
.fade-transition-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-transition-enter-from,
.fade-transition-leave-to {
  opacity: 0;
}

/* Typography */
.v-list-item-title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
}

/* Positioning */
.nav-menu .v-overlay__content,
.user-menu .v-overlay__content {
  margin-top: 8px;
}

.nav-menu.large .v-overlay__content {
  position: fixed !important;
  top: 70px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: auto;
  min-width: 800px;
  max-width: 95vw;
  max-height: 85vh;
  overflow-y: auto;
}

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

.nav-menu.large .section-col {
  min-width: 450px;
  max-width: 500px;
}

/* Mobile Drawer Styling */
.mobile-drawer .v-list-item-title {
  font-size: 0.85rem !important;
}

@media (min-width: 1200px) {
  .large-nav-dropdown {
    max-width: none;
  }
  .section-col {
    min-width: 250px;
  }
}
</style>
