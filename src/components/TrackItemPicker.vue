<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";

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
  allValue?: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const ALL = props.allValue ?? "UMUM";
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const isMobile = ref(false);
const mq = window.matchMedia("(max-width: 699px)");
const syncMq = () => (isMobile.value = mq.matches);
syncMq();

// Kunci gulir halaman saat lembar terbuka di HP
watch(open, (v) => {
  document.documentElement.style.overflow = v && isMobile.value ? "hidden" : "";
});

const nameOf = (it: PickItem) =>
  (it.namaBarang || it.title.split(" - Total")[0]).replace(/\s*\(DTF\)\s*$/i, "");
const qtyOf = (it: PickItem) => it.title.match(/Total:\s*([\d.,]+)\s*pcs/i)?.[1] ?? "";
const isDtf = (it: PickItem) => !!it.dtf || /\(DTF\)/i.test(it.namaBarang || it.title);

const rows = computed(() =>
  props.items
    .filter((i) => i.value !== ALL)
    .map((i) => ({ ...i, nama: nameOf(i), qty: qtyOf(i), dtf: isDtf(i) }))
);

const selected = computed(() => rows.value.find((r) => r.value === props.modelValue) ?? null);
const isAll = computed(() => props.modelValue === ALL);
const pad = (n: number) => String(n).padStart(2, "0");

const pick = (v: string) => {
  emit("update:modelValue", v);
  open.value = false;
};

const onDoc = (e: MouseEvent) => {
  const t = e.target as HTMLElement;
  if (!open.value) return;
  if (root.value?.contains(t) || t.closest(".tp-panel")) return;
  open.value = false;
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") open.value = false;
};
onMounted(() => {
  document.addEventListener("pointerdown", onDoc);
  window.addEventListener("keydown", onKey);
  mq.addEventListener("change", syncMq);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDoc);
  window.removeEventListener("keydown", onKey);
  mq.removeEventListener("change", syncMq);
  document.documentElement.style.overflow = "";
});
</script>

<template>
  <div ref="root" class="tp">
    <button
      type="button"
      class="tp-field"
      :class="{ 'is-open': open }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="tp-text">
        <small>Barang yang dilacak</small>
        <b v-if="selected">{{ selected.nama }}</b>
        <b v-else-if="isAll">Semua barang</b>
        <b v-else class="tp-ph">Pilih barang</b>
      </span>
      <span v-if="selected?.qty" class="tp-qty">{{ selected.qty }} pcs</span>
      <v-icon class="tp-chev" size="20">mdi-chevron-down</v-icon>
    </button>

    <Teleport to="body" :disabled="!isMobile">
      <Transition name="tp-pop">
        <div v-if="open" class="tp-layer">
          <div class="tp-backdrop" @click="open = false"></div>
          <div class="tp-panel" role="listbox">
            <div class="tp-grab" aria-hidden="true"></div>

            <button
              type="button"
              class="tp-row tp-row--all"
              :class="{ 'is-on': isAll }"
              role="option"
              :aria-selected="isAll"
              @click="pick(ALL)"
            >
              <span class="tp-no">&mdash;</span>
              <span class="tp-name">
                Semua barang
                <small>Seluruh proses pesanan sekaligus</small>
              </span>
              <span class="tp-check"><v-icon size="16">mdi-check</v-icon></span>
            </button>

            <button
              v-for="(r, n) in rows"
              :key="r.value"
              type="button"
              class="tp-row"
              :class="{ 'is-on': r.value === modelValue }"
              role="option"
              :aria-selected="r.value === modelValue"
              @click="pick(r.value)"
            >
              <span class="tp-no">{{ pad(n + 1) }}</span>
              <span class="tp-name">
                {{ r.nama }}
                <small v-if="r.dtf">Cetak / custom</small>
              </span>
              <span class="tp-qty-col">{{ r.qty }}<i> pcs</i></span>
              <span class="tp-check"><v-icon size="16">mdi-check</v-icon></span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tp {
  --tp-red: #b71c1c;
  --tp-line: #e9dfdb;
  --tp-ink: #1f1a19;
  --tp-muted: #8a7f7b;
  --tp-ease: cubic-bezier(0.22, 1, 0.36, 1);
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* ---------- Kolom ---------- */
.tp-field {
  width: 100%;
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border: 1px solid var(--tp-line);
  border-radius: 12px;
  font: inherit;
  text-align: left;
  color: var(--tp-ink);
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s ease;
}
.tp-field:hover {
  border-color: #cdbab4;
}
.tp-field.is-open {
  border-color: var(--tp-red);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.tp-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tp-text small {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tp-muted);
}
.tp-text b {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-ph {
  color: #a1928d;
  font-weight: 500 !important;
}
.tp-qty {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--tp-muted);
}
.tp-chev {
  color: var(--tp-muted);
  transition: transform 0.35s var(--tp-ease);
}
.is-open .tp-chev {
  transform: rotate(180deg);
}

/* ---------- Daftar (sebaris, mendorong konten di bawahnya) ---------- */
.tp-layer {
  overflow: hidden;
}
.tp-backdrop {
  display: none;
}
.tp-panel {
  max-height: 340px;
  overflow-y: auto;
  border: 1px solid var(--tp-red);
  border-top: none;
  border-radius: 0 0 12px 12px;
  background: #fff;
}
.tp-grab {
  display: none;
}

.tp-row {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  border: none;
  border-bottom: 1px solid var(--tp-line);
  font: inherit;
  text-align: left;
  color: var(--tp-ink);
  background: #fff;
  cursor: pointer;
  transition: background 0.15s ease, padding-left 0.25s var(--tp-ease);
}
.tp-row:last-child {
  border-bottom: none;
}
.tp-row::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--tp-red);
  transform: scaleY(0);
  transition: transform 0.3s var(--tp-ease);
}
.tp-row:hover {
  background: #fdf8f6;
  padding-left: 20px;
}
.tp-row.is-on {
  background: #fdf3f1;
}
.tp-row.is-on::before,
.tp-row--all::before {
  transform: scaleY(1);
}
.tp-row--all {
  background: #fdf8f6;
}
.tp-no {
  width: 22px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  color: #b9aca7;
}
.tp-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
.tp-name small {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--tp-muted);
}
.tp-qty-col {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.tp-qty-col i {
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  color: var(--tp-muted);
}
.tp-check {
  width: 18px;
  flex-shrink: 0;
  color: var(--tp-red);
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 0.2s ease, transform 0.35s var(--tp-ease);
}
.is-on .tp-check {
  opacity: 1;
  transform: none;
}

/* ---------- Animasi: tinggi mengembang ---------- */
.tp-pop-enter-active,
.tp-pop-leave-active {
  transition: max-height 0.45s var(--tp-ease), opacity 0.25s ease;
  max-height: 340px;
}
.tp-pop-enter-from,
.tp-pop-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ---------- HP: lembar dari bawah ---------- */
@media (max-width: 699px) {
  .tp-field.is-open {
    border-radius: 12px;
  }
  .tp-layer {
    position: fixed;
    inset: 0;
    z-index: 3000;
    overflow: visible;
    max-height: none;
    --tp-red: #b71c1c;
    --tp-line: #e9dfdb;
    --tp-ink: #1f1a19;
    --tp-muted: #8a7f7b;
    --tp-ease: cubic-bezier(0.22, 1, 0.36, 1);
    font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .tp-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(20, 8, 6, 0.45);
  }
  .tp-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: min(78vh, 78dvh);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    border: none;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.25);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }
  .tp-grab {
    display: block;
    width: 38px;
    height: 4px;
    margin: 10px auto 6px;
    border-radius: 2px;
    background: #d9ccc6;
  }
  .tp-pop-enter-active,
  .tp-pop-leave-active {
    max-height: none;
    transition: opacity 0.25s ease;
  }
  .tp-pop-enter-active .tp-panel,
  .tp-pop-leave-active .tp-panel {
    transition: transform 0.45s var(--tp-ease);
  }
  .tp-pop-enter-from,
  .tp-pop-leave-to {
    max-height: none;
  }
  .tp-pop-enter-from .tp-panel,
  .tp-pop-leave-to .tp-panel {
    transform: translateY(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tp-pop-enter-active,
  .tp-pop-leave-active,
  .tp-pop-enter-active .tp-panel,
  .tp-pop-leave-active .tp-panel,
  .tp-chev,
  .tp-row,
  .tp-row::before,
  .tp-check {
    transition: none;
  }
}
</style>
