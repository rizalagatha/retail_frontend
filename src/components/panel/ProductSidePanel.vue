<script setup lang="ts">
import { ref, reactive, watch, computed, nextTick, onBeforeUnmount, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { formatRupiah } from "@/utils/formatRupiah";

interface SizeVariant {
  ukuran: string;
  barcode: string;
  harga: number;
  stokStore: number;
  stokDc: number;
}

interface PanelProduct {
  kode: string;
  nama: string;
  kategori: string;
  hargaMin: number;
  hargaMax: number;
  sizes: SizeVariant[];
  isTerlaris: boolean;
  isPromo: boolean;
  namaPromo: string | null;
  promoBerlakuHingga: string | null;
  gambar: string | null;
}

export interface ProductPanelSelection {
  kode: string;
  nama: string;
  kategori: string;
  ukuran: string;
  barcode: string;
  harga: number;
  stok: number; // stok Store (dipakai sebagai stok acuan saat ditambahkan ke form transaksi)
  jumlah: number;
}

interface KategoriOption {
  label: string;
  value: string;
  icon?: string;
}

const props = defineProps<{
  modelValue: boolean;
  gudang: string;
  lookupOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "products-added", items: ProductPanelSelection[]): void;
}>();

const toast = useToast();

const search = ref("");
const activeKategori = ref("SEMUA");
const jenisKainList = ref<string[]>([]);

const kategoriOptions = computed<KategoriOption[]>(() => [
  { label: "Semua", value: "SEMUA" },
  { label: "Promo", value: "PROMO", icon: "mdi-tag-heart" },
  { label: "Terlaris", value: "TERLARIS", icon: "mdi-fire" },
  ...jenisKainList.value.map((jk) => ({ label: jk, value: jk })),
]);

const fetchJenisKainOptions = async () => {
  try {
    const response = await api.get("/invoice-form/lookup/jenis-kain-options");
    jenisKainList.value = response.data || [];
  } catch (error) {
    console.error("Gagal memuat daftar jenis kain:", error);
  }
};

const chipsScrollRef = ref<HTMLElement | null>(null);
let isDragging = false;
let dragStartX = 0;
let dragScrollLeft = 0;
let didDrag = false;

const onChipsMouseDown = (e: MouseEvent) => {
  if (!chipsScrollRef.value) return;
  isDragging = true;
  didDrag = false;
  dragStartX = e.pageX - chipsScrollRef.value.offsetLeft;
  dragScrollLeft = chipsScrollRef.value.scrollLeft;
};

const onChipsMouseMove = (e: MouseEvent) => {
  if (!isDragging || !chipsScrollRef.value) return;
  e.preventDefault();
  const x = e.pageX - chipsScrollRef.value.offsetLeft;
  const walk = x - dragStartX;
  if (Math.abs(walk) > 5) didDrag = true;
  chipsScrollRef.value.scrollLeft = dragScrollLeft - walk;
};

const onChipsMouseUp = () => {
  isDragging = false;
};

// Cegah klik chip terpicu kalau user barusan drag (bukan klik biasa)
const onChipClick = (value: string) => {
  if (didDrag) return;
  activeKategori.value = value;
};

const items = ref<PanelProduct[]>([]);
const isLoading = ref(false);
const page = ref(1);
const itemsPerPage = 20;
const totalItems = ref(0);
const hasMore = computed(() => items.value.length < totalItems.value);

// Pilihan ukuran & qty aktif per kode barang (sementara, sebelum ditekan "Tambah")
const activeSelection = reactive<Record<string, { ukuran: string; qty: number }>>({});

let searchTimeout: ReturnType<typeof setTimeout>;
let requestId = 0;

const fetchItems = async (reset = true) => {
  const currentRequestId = ++requestId;
  isLoading.value = true;
  try {
    const response = await api.get("/invoice-form/lookup/product-panel", {
      params: {
        term: search.value.trim(),
        gudang: props.gudang,
        kategori: activeKategori.value,
        page: reset ? 1 : page.value,
        itemsPerPage,
      },
    });
    if (currentRequestId !== requestId) return;

    const data = response.data.items as PanelProduct[];
    if (reset) {
      items.value = data;
      page.value = 1;
    } else {
      items.value = [...items.value, ...data];
    }
    totalItems.value = response.data.total || 0;

    // Default pilih ukuran pertama yang ada stok Store, biar user langsung bisa lihat harga
    data.forEach((p) => {
      if (!activeSelection[p.kode]) {
        const preferred = p.sizes.find((s) => s.stokStore > 0) || p.sizes[0];
        activeSelection[p.kode] = { ukuran: preferred?.ukuran || "", qty: 1 };
      }
    });
  } catch (error) {
    console.error("Gagal memuat data produk panel:", error);
    toast.error("Gagal memuat daftar produk.");
  } finally {
    isLoading.value = false;
  }
  await nextTick();
  if (reset) {
    setupObserver();
  }
  setupCardObserver();
};

const loadMore = async () => {
  if (isLoading.value || !hasMore.value) return;
  page.value++;
  await fetchItems(false);
};

// --- Infinite scroll via IntersectionObserver ---
const scrollSentinel = ref<HTMLElement | null>(null);
const panelListRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// --- Focus-zoom carousel: kartu paling terlihat di viewport di-scale up ---
const focusedKode = ref<string | null>(null);

let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let expandingCount = 0;
const isExpanding = () => expandingCount > 0;

let clickCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let inClickCooldown = false;
let pendingScrollCorrectionKode: string | null = null;

const updateFocusedCard = () => {
  if (!panelListRef.value) return;
  const containerTop = panelListRef.value.getBoundingClientRect().top;

  const cards = Array.from(panelListRef.value.querySelectorAll<HTMLElement>(".product-card"));

  let candidate: HTMLElement | null = null;
  let smallestOffset = Infinity;

  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const offset = Math.abs(rect.top - containerTop);
    if (offset < smallestOffset) {
      smallestOffset = offset;
      candidate = card;
    }
  });

  if (candidate) {
    const kode = (candidate as HTMLElement).dataset.kode;
    if (kode && kode !== focusedKode.value) focusedKode.value = kode;
  }
};

const onPanelScroll = () => {
  if (isExpanding() || inClickCooldown) return; // Jangan hitung ulang selama animasi/cooldown
  if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
  scrollDebounceTimer = setTimeout(() => {
    if (isExpanding() || inClickCooldown) return; // Re-cek — bisa saja berubah selama menunggu debounce
    updateFocusedCard();
  }, 80);
};

const setupCardObserver = () => {
  if (!panelListRef.value) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isExpanding() && !inClickCooldown) updateFocusedCard();
      if (!focusedKode.value && items.value.length > 0) {
        focusedKode.value = items.value[0].kode;
      }
    });
  });
};

const setupObserver = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (!scrollSentinel.value || !panelListRef.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        loadMore();
      }
    },
    {
      root: panelListRef.value,
      rootMargin: "150px",
      threshold: 0,
    }
  );
  observer.observe(scrollSentinel.value);
};

watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchItems(true), 400);
});

watch(activeKategori, () => fetchItems(true));

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      search.value = "";
      activeKategori.value = "SEMUA";
      fetchItems(true);
      fetchJenisKainOptions();
      nextTick(() => setupObserver());
      // Drawer butuh waktu transisi (~300ms default Vuetify) sebelum
      // ukuran/posisi elemen di dalamnya akurat untuk dihitung ulang.
      setTimeout(() => {
        setupCardObserver();
      }, 350);
    } else {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (scrollDebounceTimer) {
        clearTimeout(scrollDebounceTimer);
        scrollDebounceTimer = null;
      }
      if (clickCooldownTimer) {
        clearTimeout(clickCooldownTimer);
        clickCooldownTimer = null;
      }
      inClickCooldown = false;
      expandingCount = 0;
      pendingScrollCorrectionKode = null;
      focusedKode.value = null;
    }
  }
);

onBeforeUnmount(() => {
  if (observer) observer.disconnect();
  if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
  if (clickCooldownTimer) clearTimeout(clickCooldownTimer);
});

const selectSize = (kode: string, ukuran: string) => {
  if (!activeSelection[kode]) activeSelection[kode] = { ukuran, qty: 1 };
  else activeSelection[kode].ukuran = ukuran;
};

const scrollCardIntoView = (kode: string) => {
  const el = panelListRef.value?.querySelector(`[data-kode="${kode}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
};

// Klik kartu manapun langsung fokuskan ke situ — set state fokus
// SEKARANG JUGA (tidak menunggu scroll-debounce), lalu scroll halus ke
// tengah supaya posisinya konsisten dengan kartu fokus lainnya.
const focusCard = (kode: string) => {
  focusedKode.value = kode;

  // Bekukan auto-detect selama cooldown — cukup lama untuk menutupi
  // scroll native smooth + animasi expand/collapse kartu, supaya tidak ada
  // perhitungan ulang yang menyelip di tengah dan "merebut" fokus ke kartu lain.
  inClickCooldown = true;
  if (clickCooldownTimer) clearTimeout(clickCooldownTimer);
  clickCooldownTimer = setTimeout(() => {
    inClickCooldown = false;
  }, 600);

  // Scroll pertama (perkiraan cepat) — supaya user langsung dapat feedback,
  // meski posisinya belum tentu final karena kartu lain masih animasi.
  nextTick(() => scrollCardIntoView(kode));

  // Daftarkan untuk koreksi FINAL — dieksekusi otomatis oleh onExpandEnd
  // begitu semua animasi expand/collapse benar-benar selesai.
  pendingScrollCorrectionKode = kode;
};

// Kunci perhitungan fokus selama ADA kartu manapun yang sedang animasi
// (baik membesar/enter MAUPUN mengecil/leave) — geometri semua kartu ikut
// bergeser selama transisi berlangsung, kalau dihitung di tengah-tengah
// bisa salah pilih kartu tetangga sebagai "terdekat".
const onExpandStart = () => {
  expandingCount++;
};
const onExpandEnd = () => {
  expandingCount = Math.max(0, expandingCount - 1);

  // Semua animasi (enter kartu baru + leave kartu lama) sudah benar-benar
  // selesai — baru sekarang geometri final stabil, lakukan koreksi scroll.
  if (expandingCount === 0 && pendingScrollCorrectionKode) {
    const kode = pendingScrollCorrectionKode;
    pendingScrollCorrectionKode = null;
    nextTick(() => scrollCardIntoView(kode));
  }
};

const changeQty = (kode: string, delta: number) => {
  const sel = activeSelection[kode];
  if (!sel) return;
  sel.qty = Math.max(1, (sel.qty || 1) + delta);
};

const getSelectedVariant = (product: PanelProduct): SizeVariant | null => {
  const sel = activeSelection[product.kode];
  if (!sel) return null;
  return product.sizes.find((s) => s.ukuran === sel.ukuran) || null;
};

const addToCart = (product: PanelProduct) => {
  const variant = getSelectedVariant(product);
  const sel = activeSelection[product.kode];
  if (!variant || !sel) {
    toast.warning("Pilih ukuran terlebih dahulu.");
    return;
  }

  emit("products-added", [
    {
      kode: product.kode,
      nama: product.nama,
      kategori: product.kategori,
      ukuran: variant.ukuran,
      barcode: variant.barcode,
      harga: variant.harga,
      stok: variant.stokStore,
      jumlah: sel.qty || 1,
    },
  ]);

  if (!props.lookupOnly) {
    toast.success(`${product.nama} (${variant.ukuran}) x${sel.qty} ditambahkan.`);
  }
  sel.qty = 1;
};

const formatTanggalPromo = (dateStr: string | null): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const windowWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1024);
const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

const drawerWidth = computed(() => Math.min(620, windowWidth.value));

onMounted(() => {
  window.addEventListener("resize", handleResize);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
});

const close = () => {
  emit("update:modelValue", false);
};
</script>

<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="(v) => emit('update:modelValue', v)"
    location="right"
    temporary
    :width="drawerWidth"
    class="product-side-panel"
  >
    <div class="panel-header">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" color="white" @click="close" />
      <span class="panel-title">Pilih Produk</span>
      <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="close" />
    </div>

    <div class="panel-search pa-3">
      <v-text-field
        v-model="search"
        placeholder="Cari kode / nama barang..."
        prepend-inner-icon="mdi-magnify"
        variant="solo"
        density="compact"
        flat
        hide-details
        clearable
        autofocus
      />
    </div>

    <div
      ref="chipsScrollRef"
      class="panel-chips-scroll px-3 pb-2"
      @mousedown="onChipsMouseDown"
      @mousemove="onChipsMouseMove"
      @mouseup="onChipsMouseUp"
      @mouseleave="onChipsMouseUp"
    >
      <v-chip
        v-for="opt in kategoriOptions"
        :key="opt.value"
        size="small"
        variant="flat"
        :prepend-icon="opt.icon"
        class="chip-item"
        :class="{
          'chip-active': activeKategori === opt.value,
          'chip-promo': opt.value === 'PROMO' && activeKategori !== 'PROMO',
          'chip-terlaris': opt.value === 'TERLARIS' && activeKategori !== 'TERLARIS',
        }"
        @click="onChipClick(opt.value)"
      >
        {{ opt.label }}
      </v-chip>
    </div>

    <v-divider />

    <div ref="panelListRef" class="panel-list" @scroll="onPanelScroll">
      <div v-if="isLoading && items.length === 0" class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <div v-else-if="items.length === 0" class="text-center pa-8 text-medium-emphasis">
        <v-icon size="40" class="mb-2">mdi-package-variant-remove</v-icon>
        <div class="text-caption">Produk tidak ditemukan.</div>
      </div>

      <div
        v-for="product in items"
        :key="product.kode"
        :data-kode="product.kode"
        class="product-card"
        :class="{ 'card-focused': focusedKode === product.kode }"
        @click="focusCard(product.kode)"
      >
        <div class="product-card-top">
          <div class="product-image-wrap">
            <img v-if="product.gambar" :src="product.gambar" class="product-image" loading="lazy" />
            <div v-else class="product-image-placeholder">
              <v-icon size="24" color="grey">mdi-tshirt-crew-outline</v-icon>
            </div>
            <div class="product-badges">
              <span v-if="product.isPromo" class="badge badge-promo">PROMO</span>
              <span v-if="product.isTerlaris" class="badge badge-terlaris">TERLARIS</span>
            </div>
          </div>

          <div class="product-info">
            <div class="product-kode">{{ product.kode }}</div>
            <div class="product-nama">{{ product.nama }}</div>
            <div
              v-if="focusedKode === product.kode && product.isPromo && product.namaPromo"
              class="product-promo-info"
            >
              <v-icon size="11" color="error">mdi-tag-heart</v-icon>
              <span class="promo-nama-text">{{ product.namaPromo }}</span>
              <span v-if="product.promoBerlakuHingga" class="promo-tanggal-text">
                · s/d {{ formatTanggalPromo(product.promoBerlakuHingga) }}
              </span>
            </div>
          </div>
          <div class="product-harga">
            <div v-if="focusedKode === product.kode" class="harga-label">Harga Pilih Ukuran</div>
            <div class="harga-value">
              {{
                getSelectedVariant(product) ? formatRupiah(getSelectedVariant(product)!.harga) : "-"
              }}
            </div>
          </div>
        </div>

        <v-expand-transition
          @before-enter="onExpandStart"
          @after-enter="onExpandEnd"
          @before-leave="onExpandStart"
          @after-leave="onExpandEnd"
        >
          <div v-if="focusedKode === product.kode">
            <div class="size-label">Pilih Size</div>
            <div class="size-grid">
              <button
                v-for="size in product.sizes"
                :key="size.ukuran"
                class="size-btn"
                :class="{
                  'size-btn-active': activeSelection[product.kode]?.ukuran === size.ukuran,
                }"
                @click.stop="selectSize(product.kode, size.ukuran)"
              >
                <div class="size-btn-label">{{ size.ukuran }}</div>
                <div class="size-btn-harga">{{ formatRupiah(size.harga) }}</div>
              </button>
            </div>

            <div class="stok-section">
              <div class="stok-block">
                <div class="stok-label">Stok Store</div>
                <div class="size-grid stok-grid">
                  <div
                    v-for="size in product.sizes"
                    :key="'store-' + size.ukuran"
                    class="stok-cell"
                    :class="size.stokStore <= 0 ? 'text-error' : 'text-success'"
                  >
                    {{ size.stokStore }}
                  </div>
                </div>
              </div>
              <div class="stok-block">
                <div class="stok-label">Stok DC</div>
                <div class="size-grid stok-grid">
                  <div
                    v-for="size in product.sizes"
                    :key="'dc-' + size.ukuran"
                    class="stok-cell"
                    :class="size.stokDc <= 0 ? 'text-error' : 'text-success'"
                  >
                    {{ size.stokDc }}
                  </div>
                </div>
              </div>
            </div>

            <div class="product-card-actions">
              <div class="qty-stepper">
                <v-btn
                  icon="mdi-minus"
                  size="x-small"
                  variant="outlined"
                  @click.stop="changeQty(product.kode, -1)"
                />
                <span class="qty-value">{{ activeSelection[product.kode]?.qty || 1 }}</span>
                <v-btn
                  icon="mdi-plus"
                  size="x-small"
                  variant="outlined"
                  @click.stop="changeQty(product.kode, 1)"
                />
              </div>
              <v-btn
                color="primary"
                size="small"
                prepend-icon="mdi-cart-plus"
                @click.stop="addToCart(product)"
              >
                Tambah
              </v-btn>
            </div>
          </div>
        </v-expand-transition>
      </div>

      <div v-if="isLoading && items.length > 0" class="text-center pa-4">
        <v-progress-circular indeterminate size="24" color="primary" />
      </div>

      <div
        v-if="!hasMore && items.length > 0"
        class="text-center pa-4 text-caption text-medium-emphasis"
      >
        — Semua {{ totalItems }} produk sudah ditampilkan —
      </div>

      <div ref="scrollSentinel" class="scroll-sentinel"></div>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.product-side-panel :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  background: #0d47a1;
  flex-shrink: 0;
}

.panel-title {
  color: white;
  font-weight: 700;
  font-size: 15px;
  flex-grow: 1;
}

.panel-search,
.panel-chips-scroll {
  flex-shrink: 0;
}

.panel-chips-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 4px 12px 8px;
  white-space: nowrap;
  min-height: 40px;
  align-items: center;
  cursor: grab;
  user-select: none;
}

.panel-chips-scroll:active {
  cursor: grabbing;
}

.panel-chips-scroll::-webkit-scrollbar {
  display: none;
}

.chip-item {
  scroll-snap-align: start;
  flex-shrink: 0;
  cursor: pointer;
}

.chip-active {
  background: #0d47a1 !important;
  color: white !important;
}

.panel-list {
  flex-grow: 1;
  overflow-y: auto;
  padding: 16px 12px 40px;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scroll-snap-type: y proximity;
}

.product-card {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: rgb(var(--v-theme-surface));
  opacity: 0.7;
  cursor: pointer;
  scroll-snap-align: start;
  scroll-margin-top: 8px;
  transition: opacity 0.3s ease, box-shadow 0.3s ease, padding 0.3s ease;
}

.product-card.card-focused {
  padding: 14px;
  margin-bottom: 16px;
  opacity: 1;
  box-shadow: 0 8px 24px rgba(13, 71, 161, 0.18);
  border-color: rgba(13, 71, 161, 0.35);
  cursor: default;
}

.product-card:not(.card-focused) .product-image-wrap {
  width: 40px;
  height: 40px;
}

.product-card:not(.card-focused) .product-nama {
  font-size: 11px;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-card:not(.card-focused) .product-kode {
  display: none;
}

.product-card:not(.card-focused) .harga-value {
  font-size: 11px;
}

.product-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 8px;
}

.product-info {
  flex: 1;
  min-width: 0;
}

.product-kode {
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.product-nama {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}

.product-harga {
  text-align: right;
  flex-shrink: 0;
}

.harga-label {
  font-size: 9px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.harga-value {
  font-size: 13px;
  font-weight: 800;
  color: #0d47a1;
}

.size-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 4px;
}

.size-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

.size-btn {
  border: 1.5px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  padding: 4px 2px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.size-btn:hover {
  border-color: #0d47a1;
}

.size-btn-active {
  border-color: #0d47a1;
  border-width: 2px;
  background: rgba(13, 71, 161, 0.08);
}

.size-btn-label {
  font-size: 11px;
  font-weight: 700;
}

.size-btn-harga {
  font-size: 9px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.stok-section {
  margin-bottom: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
}

.stok-block {
  margin-bottom: 6px;
}

.stok-block:last-child {
  margin-bottom: 0;
}

.stok-label {
  font-size: 9px;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.stok-grid {
  margin-bottom: 0;
}

.stok-cell {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 2px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.product-card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.qty-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty-value {
  font-size: 13px;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

.product-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.product-image-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-badges {
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.badge {
  font-size: 7px;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: 3px;
  color: white;
  letter-spacing: 0.3px;
}

.badge-promo {
  background: #e53935;
}

.badge-terlaris {
  background: #fb8c00;
}

.chip-promo {
  background: rgba(229, 57, 53, 0.12) !important;
  color: #e53935 !important;
}

.chip-terlaris {
  background: rgba(251, 140, 0, 0.12) !important;
  color: #fb8c00 !important;
}

.scroll-sentinel {
  height: 1px;
  width: 100%;
}

.product-promo-info {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 3px;
  flex-wrap: wrap;
}

.promo-nama-text {
  font-size: 9.5px;
  font-weight: 700;
  color: #e53935;
}

.promo-tanggal-text {
  font-size: 9px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
