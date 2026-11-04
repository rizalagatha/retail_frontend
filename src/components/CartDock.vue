<script setup lang="ts">
import { onMounted, onUnmounted, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCartStore } from "@/stores/cartStore";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";

const cart = useCartStore();
const { lines, open, count, subtotal, adaMasalah, refreshing, refreshError, tokoNama } =
  storeToRefs(cart);

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(n) || 0)}`;
const imgFailed = reactive<Record<string, boolean>>({});

watch(open, (v) => {
  document.documentElement.style.overflow = v ? "hidden" : "";
  if (v) cart.refresh();
});

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && open.value) open.value = false;
};
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  document.documentElement.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
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
                Keranjang tidak memesan atau menahan stok. Harga dan ketersediaan dikonfirmasi store
                saat pemesanan.
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

/* ===== Tema Premium (aktif bila html.theme-premium) ===== */
:global(html.theme-premium) .cd-fab {
  color: #1a0d0b;
  background: #d8bd84;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(216, 189, 132, 0.5);
}
:global(html.theme-premium) .cd-fab-n {
  color: #e6cf98;
  background: #0e0605;
  box-shadow: 0 0 0 1px rgba(216, 189, 132, 0.6);
}
:global(html.theme-premium) .cd-wrap {
  background: rgba(14, 6, 5, 0.62);
}
:global(html.theme-premium) .cd-panel {
  color: #f3e8d2;
  background: #120a08;
  border-left: 1px solid rgba(216, 189, 132, 0.35);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.55);
  font-family: "Jost Variable", system-ui, sans-serif;
}
:global(html.theme-premium) .cd-bar {
  background: linear-gradient(135deg, #1d0f0c, #0e0605);
  border-bottom: 1px solid rgba(216, 189, 132, 0.35);
}
:global(html.theme-premium) .cd-bar-title {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #e6cf98;
}
:global(html.theme-premium) .cd-bar-sub {
  color: rgba(243, 232, 210, 0.65);
  opacity: 1;
}
:global(html.theme-premium) .cd-bar :deep(.v-btn) {
  color: #e6cf98 !important;
}
:global(html.theme-premium) .cd-empty {
  color: rgba(243, 232, 210, 0.6);
}
:global(html.theme-premium) .cd-warn {
  color: #e8a860;
  background: rgba(216, 189, 132, 0.1);
}
:global(html.theme-premium) .cd-item {
  border-bottom-color: rgba(216, 189, 132, 0.18);
}
:global(html.theme-premium) .cd-item--warn {
  background: rgba(216, 189, 132, 0.06);
}
:global(html.theme-premium) .cd-img {
  background: #241714;
}
:global(html.theme-premium) .cd-name {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 16px;
  font-weight: 600;
  color: #f3e8d2;
}
:global(html.theme-premium) .cd-meta,
:global(html.theme-premium) .cd-del,
:global(html.theme-premium) .cd-note,
:global(html.theme-premium) .cd-total {
  color: rgba(243, 232, 210, 0.65);
}
:global(html.theme-premium) .cd-price,
:global(html.theme-premium) .cd-total b {
  font-weight: 500;
  color: #e6cf98;
}
:global(html.theme-premium) .cd-old {
  color: rgba(243, 232, 210, 0.45);
}
:global(html.theme-premium) .cd-stok {
  color: #e8a860;
}
:global(html.theme-premium) .cd-step {
  border-color: rgba(216, 189, 132, 0.35);
}
:global(html.theme-premium) .cd-step button,
:global(html.theme-premium) .cd-clear {
  color: #d8bd84;
}
:global(html.theme-premium) .cd-step span {
  color: #f3e8d2;
}
:global(html.theme-premium) .cd-foot {
  background: #0e0605;
  border-top-color: rgba(216, 189, 132, 0.28);
}
</style>
