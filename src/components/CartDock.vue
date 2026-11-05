<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import api from "@/services/api";
import { useCartStore } from "@/stores/cartStore";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";

interface StoreContact {
  kode: string;
  nama: string;
  wa_link: string | null;
}

// URL wa.me yang terlalu panjang dipotong WhatsApp; batas praktis sekitar 2000 karakter
const WA_MAX_URL = 1900;

const cart = useCartStore();
const route = useRoute();
// Tema premium dipicu dari URL, bukan dari kelas di <html> (kelas itu dipasang/dicabut halaman lain)
const premium = computed(() => route.query.from === "premium" || route.path === "/kiosk/premium");
const { lines, open, count, subtotal, adaMasalah, refreshing, refreshError, toko, tokoNama } =
  storeToRefs(cart);

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;
const imgFailed = reactive<Record<string, boolean>>({});

// --- Pesan WhatsApp ke store ---
const contacts = ref<StoreContact[] | null>(null);
const contactsError = ref(false);
let loadingContacts = false;

const loadContacts = async () => {
  if (contacts.value || loadingContacts) return;
  loadingContacts = true;
  contactsError.value = false;
  try {
    const { data } = await api.get<StoreContact[]>("/so/public/contacts");
    contacts.value = data;
  } catch {
    contactsError.value = true;
  } finally {
    loadingContacts = false;
  }
};

// Hanya nomor seluler Indonesia (628...). Telepon rumah atau format lain: pakai "Salin pesanan".
const waBase = computed(() => {
  const link = contacts.value?.find((c) => c.kode === toko.value)?.wa_link ?? "";
  return /^https:\/\/wa\.me\/628\d{7,12}$/.test(link) ? link : null;
});
const waStatus = computed<"loading" | "ok" | "none">(() =>
  contacts.value === null && !contactsError.value ? "loading" : waBase.value ? "ok" : "none"
);

const pesan = computed(() => {
  const baris = lines.value.map(
    (l, i) => `${i + 1}. ${l.nama} (${l.kode}) - ${l.ukuran} x${l.qty} @ ${rp(cart.unitPrice(l))}`
  );
  return [
    `Halo, saya mau pesan di store ${tokoNama.value}:`,
    "",
    ...baris,
    "",
    `Estimasi total: ${rp(subtotal.value)}`,
    "",
    "Mohon dicek ketersediaan dan total pembayarannya. Terima kasih.",
  ].join("\n");
});
const waFull = computed(() =>
  waBase.value ? `${waBase.value}?text=${encodeURIComponent(pesan.value)}` : null
);
const pesanPanjang = computed(() => !!waFull.value && waFull.value.length > WA_MAX_URL);
const waHref = computed(() => (pesanPanjang.value ? waBase.value : waFull.value));
// Jangan kirim saat stok bermasalah atau sedang dimuat ulang
const bisaKirim = computed(() => lines.value.length > 0 && !adaMasalah.value && !refreshing.value);

const disalin = ref(false);
const salinGagal = ref(false);
let salinTimer: ReturnType<typeof setTimeout> | undefined;
const salinPesan = async () => {
  salinGagal.value = false;
  try {
    await navigator.clipboard.writeText(pesan.value);
    disalin.value = true;
    clearTimeout(salinTimer);
    salinTimer = setTimeout(() => (disalin.value = false), 3000);
  } catch {
    salinGagal.value = true;
  }
};
// Pesan terlalu panjang untuk URL: chat dibuka tanpa teks, jadi teksnya disalin
const onWaClick = () => {
  if (pesanPanjang.value) salinPesan();
};

watch(open, (v) => {
  document.documentElement.style.overflow = v ? "hidden" : "";
  if (v) {
    cart.refresh();
    loadContacts();
  }
});

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && open.value) open.value = false;
};
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  document.documentElement.style.overflow = "";
  clearTimeout(salinTimer);
});
</script>

<template>
  <Teleport to="body">
    <div class="cd-root" :class="{ 'cd--premium': premium }">
      <button
        v-if="count > 0 && !open"
        class="cd-fab"
        type="button"
        aria-label="Buka keranjang"
        @click="open = true"
      >
        <v-icon size="24">mdi-cart-outline</v-icon>
        <span class="cd-fab-n">{{ count }}</span>
      </button>

      <Transition name="cd-slide">
        <div v-if="open" class="cd-wrap" @click.self="open = false">
          <aside class="cd-panel" role="dialog" aria-modal="true" aria-label="Keranjang">
            <header class="cd-bar">
              <div>
                <div class="cd-bar-title">Keranjang</div>
                <div class="cd-bar-sub">{{ tokoNama }}</div>
              </div>
              <v-spacer />
              <v-btn
                icon="mdi-close"
                color="white"
                variant="text"
                size="small"
                aria-label="Tutup"
                @click="open = false"
              />
            </header>

            <div v-if="!lines.length" class="cd-empty">Keranjang masih kosong.</div>

            <template v-else>
              <div v-if="refreshError" class="cd-warn">
                Stok terbaru tidak bisa dimuat. Angka di bawah mungkin sudah berubah.
              </div>
              <div v-else-if="adaMasalah" class="cd-warn">
                Stok sebagian barang berkurang.
                <button type="button" @click="cart.sesuaikan()">Sesuaikan keranjang</button>
              </div>

              <ul class="cd-list">
                <li
                  v-for="l in lines"
                  :key="`${l.kode}||${l.ukuran}`"
                  class="cd-item"
                  :class="{ 'cd-item--warn': cart.bermasalah(l) }"
                >
                  <div class="cd-img">
                    <img
                      v-if="l.gambar && !imgFailed[l.kode]"
                      :src="l.gambar"
                      :alt="l.nama"
                      loading="lazy"
                      decoding="async"
                      @error="imgFailed[l.kode] = true"
                    />
                    <ProductPlaceholder v-else />
                  </div>

                  <div class="cd-info">
                    <div class="cd-name">{{ l.nama }}</div>
                    <div class="cd-meta">
                      Ukuran <b>{{ l.ukuran }}</b>
                    </div>
                    <div class="cd-price">
                      {{ rp(cart.unitPrice(l)) }}
                      <s v-if="l.hargaPromo && l.harga > l.hargaPromo" class="cd-old">
                        {{ rp(l.harga) }}
                      </s>
                    </div>
                    <div v-if="l.stok <= 0" class="cd-stok">Stok habis</div>
                    <div v-else-if="l.qty > l.stok" class="cd-stok">Sisa {{ l.stok }} pcs</div>
                  </div>

                  <div class="cd-side">
                    <div class="cd-step">
                      <button
                        type="button"
                        aria-label="Kurangi"
                        @click="cart.ubahQty(l.kode, l.ukuran, -1)"
                      >
                        <v-icon size="16">mdi-minus</v-icon>
                      </button>
                      <span>{{ l.qty }}</span>
                      <button
                        type="button"
                        aria-label="Tambah"
                        :disabled="!cart.bisaNaik(l)"
                        @click="cart.ubahQty(l.kode, l.ukuran, 1)"
                      >
                        <v-icon size="16">mdi-plus</v-icon>
                      </button>
                    </div>
                    <button class="cd-del" type="button" @click="cart.hapus(l.kode, l.ukuran)">
                      Hapus
                    </button>
                  </div>
                </li>
              </ul>

              <footer class="cd-foot">
                <div class="cd-total">
                  <span>Estimasi total</span>
                  <b>{{ rp(subtotal) }}</b>
                </div>
                <p class="cd-note">
                  Keranjang tidak menahan stok. Pesanan baru sah setelah store mengonfirmasi
                  ketersediaan dan harga lewat WhatsApp.
                </p>

                <a
                  v-if="waStatus === 'ok' && bisaKirim && waHref"
                  class="cd-wa"
                  :href="waHref"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click="onWaClick"
                >
                  <v-icon size="20">mdi-whatsapp</v-icon>
                  Pesan via WhatsApp
                </a>
                <button v-else-if="waStatus !== 'none'" type="button" class="cd-wa" disabled>
                  <v-icon size="20">mdi-whatsapp</v-icon>
                  Pesan via WhatsApp
                </button>
                <template v-else>
                  <p class="cd-note">
                    Nomor WhatsApp store ini belum tersedia. Salin pesanan, lalu kirim lewat kontak
                    store.
                  </p>
                  <button type="button" class="cd-wa cd-wa--ghost" @click="salinPesan">
                    {{ disalin ? "Tersalin" : "Salin pesanan" }}
                  </button>
                </template>

                <p v-if="waStatus === 'ok' && pesanPanjang" class="cd-note">
                  Pesanan terlalu panjang untuk dikirim otomatis. Teksnya disalin saat kamu menekan
                  tombol, tempel di chat WhatsApp.
                </p>
                <p v-if="disalin && waStatus === 'ok'" class="cd-note">Pesanan tersalin.</p>
                <p v-if="salinGagal" class="cd-note">
                  Pesanan tidak bisa disalin otomatis di browser ini.
                </p>

                <button
                  class="cd-clear"
                  type="button"
                  :disabled="refreshing"
                  @click="cart.kosongkan()"
                >
                  Kosongkan keranjang
                </button>
              </footer>
            </template>
          </aside>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-fab {
  position: fixed;
  right: 18px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  z-index: 900;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  box-shadow: 0 10px 24px rgba(60, 20, 15, 0.28);
  cursor: pointer;
  transition: transform 0.18s ease;
}
.cd-fab:active {
  transform: scale(0.94);
}
.cd-fab-n {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #b71c1c;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.cd-wrap {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
  background: rgba(31, 26, 25, 0.45);
  backdrop-filter: blur(3px);
}
.cd-panel {
  width: min(440px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: -12px 0 32px rgba(60, 20, 15, 0.22);
}
.cd-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 12px 8px 12px 18px;
  color: #fff;
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
}
.cd-bar-title {
  font-size: 16px;
  font-weight: 800;
}
.cd-bar-sub {
  font-size: 12px;
  opacity: 0.85;
}
.cd-empty {
  padding: 40px 20px;
  text-align: center;
  color: #6f6663;
}
.cd-warn {
  flex-shrink: 0;
  padding: 10px 18px;
  font-size: 12px;
  color: #b45309;
  background: #fff1e0;
}
.cd-warn button {
  margin-left: 6px;
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}

.cd-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.cd-item {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid #e9dfdb;
}
.cd-item--warn {
  background: #fffaf3;
}
.cd-img {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  background: #faf6f4;
}
.cd-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
}
.cd-info {
  min-width: 0;
}
.cd-name {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: #1f1a19;
}
.cd-meta {
  margin-top: 2px;
  font-size: 12px;
  color: #6f6663;
}
.cd-price {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #d32f2f;
}
.cd-old {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #9e9e9e;
}
.cd-stok {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 800;
  color: #b45309;
}
.cd-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
}
.cd-step {
  display: flex;
  align-items: center;
  border: 1px solid #e9dfdb;
  border-radius: 999px;
}
.cd-step button {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: #b71c1c;
  background: none;
  cursor: pointer;
}
.cd-step button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.cd-step span {
  min-width: 24px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.cd-del {
  font: inherit;
  font-size: 11px;
  color: #6f6663;
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}

.cd-foot {
  flex-shrink: 0;
  padding: 14px 18px calc(14px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid #e9dfdb;
  background: #faf6f4;
}
.cd-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  color: #6f6663;
}
.cd-total b {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  color: #1f1a19;
}
.cd-note {
  margin: 8px 0 10px;
  font-size: 11px;
  line-height: 1.45;
  color: #6f6663;
}
.cd-wa {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  margin: 0 0 10px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  text-decoration: none;
  color: #fff;
  background: #b71c1c;
  cursor: pointer;
}
.cd-wa:hover:not(:disabled) {
  background: #8e0000;
}
.cd-wa:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: 2px;
}
.cd-wa:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.cd-wa--ghost {
  color: #b71c1c;
  background: transparent;
  border: 1px solid #b71c1c;
}
.cd-wa--ghost:hover:not(:disabled) {
  color: #fff;
  background: #b71c1c;
}
.cd-clear {
  font: inherit;
  font-size: 12px;
  color: #b71c1c;
  background: none;
  border: 0;
  text-decoration: underline;
  cursor: pointer;
}

.cd-slide-enter-active,
.cd-slide-leave-active {
  transition: opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
.cd-slide-enter-active .cd-panel,
.cd-slide-leave-active .cd-panel {
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}
.cd-slide-enter-from,
.cd-slide-leave-to {
  opacity: 0;
}
.cd-slide-enter-from .cd-panel,
.cd-slide-leave-to .cd-panel {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .cd-fab,
  .cd-slide-enter-active,
  .cd-slide-leave-active,
  .cd-slide-enter-active .cd-panel,
  .cd-slide-leave-active .cd-panel {
    transition: none;
  }
}

/* ===== Tema Premium (dipicu dari route: kelas .cd--premium pada .cd-root) ===== */
.cd--premium .cd-fab {
  color: #1a0d0b;
  background: linear-gradient(135deg, #e6cf98 0%, #c9a95e 100%);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(216, 189, 132, 0.5);
}
.cd--premium .cd-fab-n {
  color: #e6cf98;
  background: #1a0d0b;
  box-shadow: 0 0 0 1px #d8bd84;
}
.cd--premium .cd-wrap {
  background: rgba(8, 3, 2, 0.66);
}
.cd--premium .cd-panel {
  color: #f3e8d2;
  background: #120a08;
  border-left: 1px solid rgba(216, 189, 132, 0.35);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.6);
  font-family: "Jost Variable", system-ui, sans-serif;
  text-transform: none;
  letter-spacing: normal;
}
.cd--premium .cd-bar {
  color: #e6cf98;
  background: linear-gradient(135deg, #1d0f0c, #0e0605);
  border-bottom: 1px solid rgba(216, 189, 132, 0.35);
}
.cd--premium .cd-bar-title {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #e6cf98;
}
.cd--premium .cd-bar-sub {
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(243, 232, 210, 0.6);
  opacity: 1;
}
.cd--premium .cd-bar :deep(.v-btn) {
  color: #e6cf98 !important;
}
.cd--premium .cd-empty {
  color: rgba(243, 232, 210, 0.6);
}
.cd--premium .cd-warn {
  color: #f0b062;
  background: rgba(239, 108, 0, 0.14);
}
.cd--premium .cd-item {
  border-bottom-color: rgba(216, 189, 132, 0.16);
}
.cd--premium .cd-item--warn {
  background: rgba(239, 108, 0, 0.08);
}
.cd--premium .cd-img {
  background: #241714;
}
.cd--premium .cd-name {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 17px;
  font-weight: 600;
  color: #f3e8d2;
}
.cd--premium .cd-meta,
.cd--premium .cd-del,
.cd--premium .cd-note,
.cd--premium .cd-total {
  color: rgba(243, 232, 210, 0.6);
}
.cd--premium .cd-price,
.cd--premium .cd-total b {
  color: #e6cf98;
}
.cd--premium .cd-old {
  color: rgba(243, 232, 210, 0.4);
}
.cd--premium .cd-stok {
  color: #f0b062;
}
.cd--premium .cd-step {
  border-color: rgba(216, 189, 132, 0.3);
}
.cd--premium .cd-step button,
.cd--premium .cd-clear {
  color: #d8bd84;
}
.cd--premium .cd-step span {
  color: #f3e8d2;
}
.cd--premium .cd-foot {
  background: #0e0605;
  border-top-color: rgba(216, 189, 132, 0.25);
}
.cd--premium .cd-wa {
  color: #1a0d0b;
  background: #d8bd84;
}
.cd--premium .cd-wa:hover:not(:disabled) {
  background: #e6cf98;
}
.cd--premium .cd-wa:focus-visible {
  outline-color: #d8bd84;
}
.cd--premium .cd-wa--ghost {
  color: #d8bd84;
  background: transparent;
  border: 1px solid #d8bd84;
}
.cd--premium .cd-wa--ghost:hover:not(:disabled) {
  color: #1a0d0b;
  background: #d8bd84;
}
</style>
