<script setup lang="ts">
type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

defineProps<{
  data: JSONValue
}>();

const formatLabel = (key: string) => {
  // Ubah 'pen_nomor' jadi 'Pen Nomor', 'customer' jadi 'Customer'
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\b\w/g, l => l.toUpperCase());
};

const isObject = (val: unknown): val is Record<string, JSONValue> =>
  !!val && typeof val === 'object' && !Array.isArray(val);
</script>

<template>
  <div class="data-viewer">
    <div v-for="(value, key) in data" :key="key" class="data-row">

      <template v-if="isObject(value)">
        <div class="nested-label">{{ formatLabel(String(key)) }}:</div>
        <div class="nested-content">
          <DataViewer :data="value" />
        </div>
      </template>

      <template v-else-if="Array.isArray(value)">
        <div class="data-label">{{ formatLabel(String(key)) }}:</div>
        <div class="data-value">
          <span v-if="value.length === 0" class="text-grey">[Kosong]</span>
          <div v-else v-for="(item, i) in value" :key="i" class="array-item">
            - {{ isObject(item) ? 'Item ' + (i + 1) : item }}
            <DataViewer v-if="isObject(item)" :data="item" class="mt-1 ml-2" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="data-item">
          <span class="data-label">{{ formatLabel(String(key)) }}:</span>
          <span class="data-value">{{ value }}</span>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
.data-viewer {
  font-size: 13px;
  font-family: 'Segoe UI', sans-serif;
}

.data-row {
  margin-bottom: 4px;
}

.data-item {
  display: flex;
  align-items: baseline;
}

.data-label {
  font-weight: 600;
  color: #555;
  min-width: 140px;
  /* Agar rata kiri */
  margin-right: 8px;
}

.data-value {
  color: #000;
  font-weight: 500;
  word-break: break-word;
}

.nested-label {
  font-weight: 700;
  color: #333;
  margin-top: 8px;
  margin-bottom: 4px;
  border-bottom: 1px dashed #ccc;
  padding-bottom: 2px;
}

.nested-content {
  margin-left: 15px;
  padding-left: 10px;
  border-left: 2px solid rgba(0, 0, 0, 0.1);
}

.array-item {
  margin-left: 10px;
}
</style>
