<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

interface PickItem {
  title: string;
  value: string;
  namaBarang?: string;
  spk?: string | null;
  dtf?: string | null;
}

const props = defineProps<{
  items: PickItem[];
  modelValue: string | null;
  allValue?: string; // nilai untuk "Lacak Semua"
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const ALL = props.allValue ?? "UMUM";
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const nameOf = (it: PickItem) =>
  (it.namaBarang || it.title.split(" - Total")[0]).replace(/\s*\(DTF\)\s*$/i, "");
const qtyOf = (it: PickItem) => it.title.match(/Total:\s*([\d.,]+)\s*pcs/i)?.[1] ?? "";
const kindOf = (it: PickItem) => {
  const t = (it.namaBarang || it.title).toUpperCase();
  if (it.dtf || t.includes("(DTF)") || t.includes("CUSTOM")) return "dtf";
  if (t.includes("JASA")) return "jasa";
  return "kaos";
};
const iconOf = (k: string) =>
  k === "dtf"
    ? "mdi-printer-3d-nozzle-outline"
    : k === "jasa"
    ? "mdi-content-cut"
    : "mdi-tshirt-crew-outline";

const rows = computed(() =>
  props.items
    .filter((i) => i.value !== ALL)
    .map((i) => ({ ...i, nama: nameOf(i), qty: qtyOf(i), kind: kindOf(i) }))
);
const totalQty = computed(() =>
  rows.value.reduce((s, r) => s + (parseInt(String(r.qty).replace(/\D/g, ""), 10) || 0), 0)
);

const selected = computed(() => rows.value.find((r) => r.value === props.modelValue) ?? null);
const isAll = computed(() => props.modelValue === ALL);

const pick = (v: string) => {
  emit("update:modelValue", v);
  open.value = false;
};

const onDoc = (e: MouseEvent) => {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") open.value = false;
};
onMounted(() => {
  document.addEventListener("pointerdown", onDoc);
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDoc);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div ref="root" class="tp">
    <button
      type="button"
      class="tp-field"
      :class="{ 'is-open': open, 'is-filled': selected || isAll }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="tp-ico" :class="selected ? `k-${selected.kind}` : isAll ? 'k-all' : ''">
        <v-icon size="20">{{
          selected ? iconOf(selected.kind) : isAll ? "mdi-package-variant-closed" : "mdi-magnify"
        }}</v-icon>
      </span>
      <span class="tp-text">
        <small>Pilih barang yang ingin dilacak</small>
        <b v-if="selected">{{ selected.nama }}</b>
        <b v-else-if="isAll">Semua barang di pesanan ini</b>
        <b v-else class="tp-ph">Ketuk untuk memilih</b>
      </span>
      <span v-if="selected?.qty" class="tp-qty">{{ selected.qty }} pcs</span>
      <v-icon class="tp-chev" size="22">mdi-chevron-down</v-icon>
    </button>

    <Transition name="tp-pop">
      <div v-if="open" class="tp-layer">
        <div class="tp-backdrop" @click="open = false"></div>
        <div class="tp-panel" role="listbox">
          <div class="tp-grab" aria-hidden="true"></div>

          <button
            type="button"
            class="tp-all"
            :class="{ 'is-on': isAll }"
            style="--i: 0"
            @click="pick(ALL)"
          >
            <span class="tp-all-ico"><v-icon size="22">mdi-package-variant-closed</v-icon></span>
            <span class="tp-all-text">
              <b>Lacak semua</b>
              <small>Seluruh proses pesanan sekaligus</small>
            </span>
            <span class="tp-all-qty">{{ totalQty }}<small>pcs</small></span>
          </button>

          <div class="tp-label">Atau pilih per barang</div>

          <div class="tp-list">
            <button
              v-for="(r, n) in rows"
              :key="r.value"
              type="button"
              class="tp-row"
              :class="{ 'is-on': r.value === modelValue }"
              :style="{ '--i': n + 1 }"
              role="option"
              :aria-selected="r.value === modelValue"
              @click="pick(r.value)"
            >
              <span class="tp-ico" :class="`k-${r.kind}`"
                ><v-icon size="20">{{ iconOf(r.kind) }}</v-icon></span
              >
              <span class="tp-name">{{ r.nama }}</span>
              <span class="tp-pill">{{ r.qty }} pcs</span>
              <span class="tp-check"><v-icon size="16">mdi-check</v-icon></span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tp {
  --tp-red: #b71c1c;
  --tp-line: #eadfda;
  --tp-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* ---------- Kolom pilihan ---------- */
.tp-field {
  width: 100%;
  min-height: 62px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 10px;
  border: 1.5px solid var(--tp-line);
  border-radius: 18px;
  font: inherit;
  text-align: left;
  color: #1f1a19;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease;
}
.tp-field:hover {
  border-color: #d9b9b3;
}
.tp-field:active {
  transform: scale(0.99);
}
.tp-field.is-open {
  border-color: var(--tp-red);
  box-shadow: 0 0 0 4px rgba(183, 28, 28, 0.1);
}
.tp-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tp-text small {
  font-size: 11px;
  font-weight: 600;
  color: #8a7f7b;
}
.tp-text b {
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-ph {
  color: #a1928d;
  font-weight: 500 !important;
}
.tp-qty {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: var(--tp-red);
  background: #fdecea;
}
.tp-chev {
  color: #a1928d;
  transition: transform 0.35s var(--tp-ease);
}
.is-open .tp-chev {
  transform: rotate(180deg);
}

/* ---------- Ikon bulat ---------- */
.tp-ico {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #a1928d;
  background: #f5eeea;
}
.tp-ico.k-kaos {
  color: var(--tp-red);
  background: #fdecea;
}
.tp-ico.k-dtf {
  color: #5b3fa6;
  background: #efeafb;
}
.tp-ico.k-jasa {
  color: #0b6e6e;
  background: #e2f4f2;
}
.tp-ico.k-all {
  color: #fff;
  background: var(--tp-red);
}

/* ---------- Panel ---------- */
.tp-layer {
  position: fixed;
  inset: 0;
  z-index: 3000;
}
.tp-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(20, 8, 6, 0.45);
  backdrop-filter: blur(3px);
}
.tp-panel {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: min(100%, 520px);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  padding: 10px 16px 18px;
  border-radius: 24px 24px 0 0;
  background: #fffaf8;
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.3);
  transform: translateX(-50%);
}
.tp-grab {
  width: 42px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 2px;
  background: #d9ccc6;
}
.tp-label {
  margin: 16px 4px 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8a7f7b;
}
.tp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 2px 2px 4px;
}

/* Kartu "Lacak semua" */
.tp-all {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: none;
  border-radius: 18px;
  font: inherit;
  text-align: left;
  color: #fff;
  background: linear-gradient(135deg, #c62828, #8e0000);
  box-shadow: 0 10px 24px rgba(183, 28, 28, 0.28);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease;
}
.tp-all:active {
  transform: scale(0.98);
}
.tp-all.is-on {
  box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--tp-red), 0 10px 24px rgba(183, 28, 28, 0.28);
}
.tp-all-ico {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
}
.tp-all-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.tp-all-text b {
  font-size: 15px;
  font-weight: 800;
}
.tp-all-text small {
  font-size: 12px;
  opacity: 0.85;
}
.tp-all-qty {
  font-family: "Playfair Display", Georgia, serif;
  font-size: 28px;
  font-weight: 600;
  line-height: 1;
}
.tp-all-qty small {
  margin-left: 3px;
  font-family: inherit;
  font-size: 11px;
  opacity: 0.8;
}

/* Baris barang */
.tp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1.5px solid var(--tp-line);
  border-radius: 16px;
  font: inherit;
  text-align: left;
  color: #1f1a19;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.12s ease;
}
.tp-row:hover {
  border-color: #e2b8b2;
  background: #fffdfc;
}
.tp-row:active {
  transform: scale(0.985);
}
.tp-row.is-on {
  border-color: var(--tp-red);
  background: #fff5f4;
}
.tp-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}
.tp-pill {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: #6f6663;
  background: #f3ebe7;
}
.tp-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: var(--tp-red);
  opacity: 0;
  transform: scale(0.4);
  transition: opacity 0.2s ease, transform 0.35s var(--tp-ease);
}
.is-on .tp-check {
  opacity: 1;
  transform: none;
}

/* ---------- Animasi buka/tutup + baris bergantian ---------- */
.tp-pop-enter-active,
.tp-pop-leave-active {
  transition: opacity 0.3s ease;
}
.tp-pop-enter-active .tp-panel,
.tp-pop-leave-active .tp-panel {
  transition: transform 0.5s var(--tp-ease);
}
.tp-pop-enter-from,
.tp-pop-leave-to {
  opacity: 0;
}
.tp-pop-enter-from .tp-panel,
.tp-pop-leave-to .tp-panel {
  transform: translate(-50%, 100%);
}
.tp-all,
.tp-row {
  animation: tp-in 0.5s var(--tp-ease) both;
  animation-delay: calc(0.12s + var(--i, 0) * 45ms);
}
@keyframes tp-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

/* Desktop: menu melayang di bawah kolom, bukan sheet dari bawah */
@media (min-width: 700px) {
  .tp-layer {
    position: absolute;
    inset: auto 0 auto 0;
    top: calc(100% + 8px);
    z-index: 50;
  }
  .tp-backdrop {
    display: none;
  }
  .tp-panel {
    position: static;
    width: 100%;
    max-height: 360px;
    padding: 12px;
    border: 1px solid var(--tp-line);
    border-radius: 20px;
    box-shadow: 0 24px 50px rgba(60, 20, 15, 0.18);
    transform: none;
    transform-origin: top center;
  }
  .tp-grab {
    display: none;
  }
  .tp-pop-enter-from .tp-panel,
  .tp-pop-leave-to .tp-panel {
    transform: translateY(-10px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tp-all,
  .tp-row {
    animation: none;
  }
  .tp-pop-enter-active,
  .tp-pop-leave-active,
  .tp-pop-enter-active .tp-panel,
  .tp-pop-leave-active .tp-panel,
  .tp-chev,
  .tp-check {
    transition: none;
  }
}
</style>
