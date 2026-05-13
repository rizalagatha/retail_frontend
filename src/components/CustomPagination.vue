<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  total: number;
  modelValue: number; // current page (1-based)
  perPage: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", page: number): void;
  (e: "update:perPage", val: number): void;
}>();

const totalPages = computed(() => Math.ceil(props.total / props.perPage));
const from = computed(() => (props.modelValue - 1) * props.perPage + 1);
const to = computed(() => Math.min(props.modelValue * props.perPage, props.total));

const pageRange = computed(() => {
  const p = totalPages.value;
  const c = props.modelValue;
  if (p <= 7) return Array.from({ length: p }, (_, i) => i + 1);
  const range: (number | "…")[] = [1];
  if (c > 3) range.push("…");
  const s = Math.max(2, c - 1);
  const e = Math.min(p - 1, c + 1);
  for (let i = s; i <= e; i++) range.push(i);
  if (c < p - 2) range.push("…");
  range.push(p);
  return range;
});

const go = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  emit("update:modelValue", page);
};
</script>

<template>
  <div class="custom-pagination">
    <!-- Per-page selector -->
    <div class="pg-left">
      <span class="pg-meta-label">Tampilkan</span>
      <select
        class="pg-select"
        :value="perPage"
        @change="
          emit('update:perPage', +($event.target as HTMLSelectElement).value);
          emit('update:modelValue', 1);
        "
      >
        <option :value="10">10</option>
        <option :value="25">25</option>
        <option :value="50">50</option>
      </select>
      <span class="pg-meta-label">baris</span>
    </div>

    <!-- Page buttons -->
    <div class="pg-pages">
      <button class="pg-btn pg-nav" :disabled="modelValue === 1" @click="go(1)" title="Pertama">
        <v-icon size="14">mdi-page-first</v-icon>
      </button>
      <button
        class="pg-btn pg-nav"
        :disabled="modelValue === 1"
        @click="go(modelValue - 1)"
        title="Sebelumnya"
      >
        <v-icon size="14">mdi-chevron-left</v-icon>
      </button>

      <template v-for="(p, i) in pageRange" :key="i">
        <span v-if="p === '…'" class="pg-ellipsis">···</span>
        <button
          v-else
          class="pg-btn"
          :class="{ active: p === modelValue }"
          @click="go(p as number)"
        >
          {{ p }}
        </button>
      </template>

      <button
        class="pg-btn pg-nav"
        :disabled="modelValue === totalPages"
        @click="go(modelValue + 1)"
        title="Berikutnya"
      >
        <v-icon size="14">mdi-chevron-right</v-icon>
      </button>
      <button
        class="pg-btn pg-nav"
        :disabled="modelValue === totalPages"
        @click="go(totalPages)"
        title="Terakhir"
      >
        <v-icon size="14">mdi-page-last</v-icon>
      </button>
    </div>

    <!-- Info + jump -->
    <div class="pg-right">
      <span class="pg-info">
        <strong>{{ from }}–{{ to }}</strong> dari <strong>{{ total }}</strong>
      </span>
      <div class="pg-jump">
        <span class="pg-meta-label">Ke hal.</span>
        <input
          type="number"
          class="pg-jump-input"
          :min="1"
          :max="totalPages"
          @keydown.enter="go(+($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 4px 4px;
}

.pg-left,
.pg-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pg-meta-label {
  font-size: 12px;
  color: #999;
}

.pg-select {
  appearance: none;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 4px 24px 4px 10px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
}
.pg-select:focus {
  outline: none;
  border-color: #d32f2f;
}

.pg-pages {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pg-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  user-select: none;
}
.pg-btn:hover:not(:disabled) {
  background: #fafafa;
  border-color: #ccc;
  color: #222;
}
.pg-btn.active {
  background: #d32f2f;
  border-color: #d32f2f;
  color: #fff;
  font-weight: 700;
}
.pg-btn.active:hover {
  background: #b71c1c;
  border-color: #b71c1c;
}
.pg-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pg-ellipsis {
  width: 28px;
  text-align: center;
  font-size: 13px;
  color: #bbb;
  letter-spacing: 1px;
}

.pg-info {
  font-size: 13px;
  color: #777;
  white-space: nowrap;
}
.pg-info strong {
  color: #333;
  font-weight: 600;
}

.pg-jump {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pg-jump-input {
  width: 48px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 13px;
  text-align: center;
  color: #333;
  background: #f5f5f5;
}
.pg-jump-input:focus {
  outline: none;
  border-color: #d32f2f;
}

/* Responsive: di mobile sembunyikan jump + per-page */
@media (max-width: 600px) {
  .pg-left,
  .pg-jump {
    display: none;
  }
  .custom-pagination {
    justify-content: center;
    flex-direction: column;
    align-items: center;
  }
  .pg-right {
    justify-content: center;
  }
}
</style>
