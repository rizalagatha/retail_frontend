<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import LogoKaosan from "@/assets/logo.png";
import SiteFooter from "@/components/SiteFooter.vue";
import api from "@/services/api";
import { useCartStore, type CustomLineInput } from "@/stores/cartStore";
import {
  JASA_CUSTOM,
  UKURAN_CETAK,
  WARNA_KAOS,
  hitungEstimasi,
  type JasaCustom,
  type TitikCetak,
  type UkuranCetak,
  type WarnaKaos,
} from "@/data/jasaCustom";

const router = useRouter();

const NAMA_PRESET = ["Dada Kiri", "Punggung", "Lengan Kiri", "Lengan Kanan", "Kerah", "Dada Kanan"];

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n) || 0)}`;

const form = reactive({
  jenis: JASA_CUSTOM[0].kode,
  qty: 12,
  ukuran: "A4" as UkuranCetak,
  warna: "WARNA" as WarnaKaos,
  titiks: [{ nama: "Dada Kiri", panjang: 10, lebar: 12 }] as TitikCetak[],
});

const jasa = computed<JasaCustom>(
  () => JASA_CUSTOM.find((j) => j.kode === form.jenis) ?? JASA_CUSTOM[0]
);

const basisHarga = (j: JasaCustom) =>
  j.mode === "luas" ? "Dihitung per cm²" : "Harga per ukuran cetak";

const hasil = computed(() =>
  hitungEstimasi(jasa.value, form.qty, form.ukuran, form.warna, form.titiks)
);
const qtyValid = computed(() => form.qty >= 1);

const luasOf = (t: TitikCetak) => Math.max(0, t.panjang || 0) * Math.max(0, t.lebar || 0);

const ubahQty = (delta: number) => {
  form.qty = Math.max(1, (Number(form.qty) || 0) + delta);
};

const tambahTitik = () => {
  const dipakai = form.titiks.map((t) => t.nama);
  const nama = NAMA_PRESET.find((n) => !dipakai.includes(n)) || `Titik ${form.titiks.length + 1}`;
  form.titiks.push({ nama, panjang: 10, lebar: 10 });
};

const hapusTitik = (i: number) => {
  form.titiks.splice(i, 1);
};

// Kembali ke halaman asal bila ada, kalau halaman ini dibuka langsung (mis. dari link WhatsApp) ke beranda
const goBack = () => (window.history.state?.back ? router.back() : router.push("/"));

// --- Keranjang: hanya build katalog (tracking tidak punya keranjang) ---
interface StoreOpt {
  kode: string;
  nama: string;
}

const cart = useCartStore();
const cartAktif = import.meta.env.VITE_APP_MODE === "KATALOG";

const stores = ref<StoreOpt[]>([]);
const storesState = ref<"idle" | "loading" | "ok" | "error">("idle");
const pilihToko = ref("");
const status = ref<{ ok: boolean; teks: string } | null>(null);
let statusTimer: ReturnType<typeof setTimeout> | undefined;

const loadStores = async () => {
  if (storesState.value === "loading") return;
  storesState.value = "loading";
  try {
    const { data } = await api.get<StoreOpt[]>("/so/public/stores");
    stores.value = data.map((s) => ({ kode: s.kode, nama: s.nama }));
    storesState.value = "ok";
  } catch {
    storesState.value = "error";
  }
};

// Daftar store hanya perlu bila keranjang belum punya store (juga bila dikosongkan saat halaman terbuka)
onMounted(() => {
  if (cartAktif && !cart.terisi) loadStores();
});
watch(
  () => cart.terisi,
  (v) => {
    if (cartAktif && !v && storesState.value === "idle") loadStores();
  }
);
onUnmounted(() => clearTimeout(statusTimer));

const tampilStatus = (ok: boolean, teks: string) => {
  status.value = { ok, teks };
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (status.value = null), 5000);
};

const titikValid = computed(
  () =>
    form.titiks.length > 0 &&
    (jasa.value.mode === "ukuran" || form.titiks.every((t) => luasOf(t) > 0))
);

// Keranjang yang sudah berisi menentukan store; kalau kosong, pakai pilihan user
const tokoTujuan = computed(() => {
  if (cart.terisi) return { kode: cart.toko, nama: cart.tokoNama };
  const s = stores.value.find((x) => x.kode === pilihToko.value);
  return s ? { kode: s.kode, nama: s.nama } : null;
});

const tambah = () => {
  if (!qtyValid.value) {
    tampilStatus(false, "Isi jumlah pesanan minimal 1 pcs.");
    return;
  }
  if (!titikValid.value) {
    tampilStatus(false, "Isi panjang dan lebar setiap titik cetak.");
    return;
  }
  const t = tokoTujuan.value;
  if (!t) {
    tampilStatus(false, "Pilih store untuk pesanan dulu.");
    return;
  }
  const input: CustomLineInput = {
    jenis: form.jenis,
    qty: Math.floor(form.qty),
    ukuran: form.ukuran,
    warna: form.warna,
    titiks: form.titiks.map((x) => ({ ...x })),
  };
  const res = cart.addCustom(t, input);
  if (res === "ok") tampilStatus(true, `Masuk ke keranjang ${t.nama}.`);
  else if (res === "penuh")
    tampilStatus(false, "Jasa custom di keranjang sudah penuh. Hapus salah satu dulu.");
  else if (res === "beda-toko")
    tampilStatus(false, "Keranjang berisi pesanan store lain. Kosongkan dulu.");
  else tampilStatus(false, "Data jasa tidak valid. Periksa jumlah dan titik cetak.");
};
</script>

<template>
  <div class="ec-page">
    <header class="ec-header">
      <v-btn icon variant="text" size="small" aria-label="Kembali" @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div class="ec-header-title">
        <div class="ec-title">Estimasi Harga Custom</div>
        <div class="ec-sub">Biaya sablon dan bordir</div>
      </div>
      <v-spacer />
      <router-link to="/" class="ec-logo">
        <img :src="LogoKaosan" height="28" alt="Kaosan" />
      </router-link>
    </header>

    <main class="ec-main">
      <div class="ec-intro">
        <h1 class="ec-h1">Hitung biaya jasa custom</h1>
        <p class="ec-lead">
          Pilih jasa, isi jumlah dan titik cetak. Belum termasuk harga kaos polos.
        </p>
      </div>

      <div class="ec-grid">
        <div class="ec-form">
          <section class="ec-field">
            <h2 class="ec-label">Jenis jasa</h2>
            <div class="ec-jenis" role="radiogroup" aria-label="Jenis jasa">
              <button
                v-for="j in JASA_CUSTOM"
                :key="j.kode"
                type="button"
                role="radio"
                class="ec-jenis-btn"
                :class="{ 'is-on': form.jenis === j.kode }"
                :aria-checked="form.jenis === j.kode"
                @click="form.jenis = j.kode"
              >
                <span class="ec-jenis-name">{{ j.nama }}</span>
                <span class="ec-jenis-basis">{{ basisHarga(j) }}</span>
              </button>
            </div>
          </section>

          <section class="ec-field">
            <h2 class="ec-label">Jumlah pesanan</h2>
            <div class="ec-qty">
              <button type="button" aria-label="Kurangi jumlah" @click="ubahQty(-1)">
                <v-icon size="18">mdi-minus</v-icon>
              </button>
              <input
                v-model.number="form.qty"
                type="number"
                inputmode="numeric"
                min="1"
                aria-label="Jumlah pesanan"
              />
              <span class="ec-qty-unit">pcs</span>
              <button type="button" aria-label="Tambah jumlah" @click="ubahQty(1)">
                <v-icon size="18">mdi-plus</v-icon>
              </button>
            </div>
          </section>

          <template v-if="jasa.mode === 'ukuran'">
            <section class="ec-field">
              <h2 class="ec-label">Ukuran cetak</h2>
              <div class="ec-seg" role="radiogroup" aria-label="Ukuran cetak">
                <button
                  v-for="u in UKURAN_CETAK"
                  :key="u"
                  type="button"
                  role="radio"
                  :class="{ 'is-on': form.ukuran === u }"
                  :aria-checked="form.ukuran === u"
                  @click="form.ukuran = u"
                >
                  {{ u }}
                </button>
              </div>
            </section>

            <section v-if="jasa.bedaWarnaKaos" class="ec-field">
              <h2 class="ec-label">Warna kaos</h2>
              <div class="ec-seg" role="radiogroup" aria-label="Warna kaos">
                <button
                  v-for="w in WARNA_KAOS"
                  :key="w.value"
                  type="button"
                  role="radio"
                  :class="{ 'is-on': form.warna === w.value }"
                  :aria-checked="form.warna === w.value"
                  @click="form.warna = w.value"
                >
                  {{ w.label }}
                </button>
              </div>
            </section>
          </template>

          <section class="ec-field">
            <div class="ec-field-head">
              <h2 class="ec-label">Titik cetak</h2>
              <button type="button" class="ec-add" @click="tambahTitik">
                <v-icon size="14">mdi-plus</v-icon> Tambah titik
              </button>
            </div>

            <ul class="ec-titik-list">
              <li v-for="(t, i) in form.titiks" :key="i" class="ec-titik">
                <div class="ec-titik-top">
                  <span class="ec-titik-no">{{ i + 1 }}</span>
                  <input
                    v-model="t.nama"
                    type="text"
                    class="ec-input"
                    placeholder="Nama titik cetak"
                    aria-label="Nama titik cetak"
                  />
                  <button
                    v-if="form.titiks.length > 1"
                    type="button"
                    class="ec-del"
                    aria-label="Hapus titik"
                    @click="hapusTitik(i)"
                  >
                    <v-icon size="16">mdi-close</v-icon>
                  </button>
                </div>

                <div v-if="jasa.mode === 'luas'" class="ec-dim">
                  <label class="ec-dim-f">
                    <span>Panjang (cm)</span>
                    <input
                      v-model.number="t.panjang"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      class="ec-input"
                    />
                  </label>
                  <span class="ec-x" aria-hidden="true">×</span>
                  <label class="ec-dim-f">
                    <span>Lebar (cm)</span>
                    <input
                      v-model.number="t.lebar"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      class="ec-input"
                    />
                  </label>
                  <output class="ec-luas">
                    <b>{{ luasOf(t) }}</b> cm²
                  </output>
                </div>
              </li>
            </ul>
          </section>

          <section v-if="cartAktif" class="ec-field">
            <h2 class="ec-label">Store untuk pesanan</h2>
            <p v-if="cart.terisi" class="ec-store-note">
              Masuk ke keranjang <b>{{ cart.tokoNama }}</b
              >. Untuk ganti store, kosongkan keranjang dulu.
            </p>
            <template v-else>
              <select v-model="pilihToko" class="ec-input" aria-label="Store untuk pesanan">
                <option value="" disabled>Pilih store</option>
                <option v-for="s in stores" :key="s.kode" :value="s.kode">{{ s.nama }}</option>
              </select>
              <p v-if="storesState === 'loading'" class="ec-store-note">Memuat daftar store...</p>
              <p v-else-if="storesState === 'error'" class="ec-store-note">
                Daftar store tidak bisa dimuat.
                <button type="button" class="ec-link" @click="loadStores">Coba lagi</button>
              </p>
            </template>
          </section>
        </div>

        <aside class="ec-result" aria-live="polite">
          <h2 class="ec-label">Estimasi biaya jasa</h2>

          <p v-if="!qtyValid" class="ec-warn">Isi jumlah pesanan minimal 1 pcs.</p>

          <template v-else>
            <div v-if="jasa.mode === 'luas' && hasil.perTitik.length > 1" class="ec-break">
              <div v-for="(t, i) in hasil.perTitik" :key="i" class="ec-break-row">
                <span>{{ t.nama || `Titik ${i + 1}` }}</span>
                <span>{{ t.luas }} cm² → {{ rp(t.harga) }}</span>
              </div>
            </div>

            <div class="ec-row">
              <span>
                Jasa per pcs
                <template v-if="form.titiks.length > 1">({{ form.titiks.length }} titik)</template>
              </span>
              <b>{{ rp(hasil.satuan) }}</b>
            </div>

            <div class="ec-total">
              <span class="ec-total-label">Total estimasi jasa</span>
              <span class="ec-total-val">{{ rp(hasil.total) }}</span>
              <span class="ec-total-note">
                untuk {{ form.qty }} pcs, {{ form.titiks.length }} titik cetak
              </span>
              <span v-if="hasil.catatan" class="ec-total-note">{{ hasil.catatan }}</span>
            </div>
          </template>

          <button v-if="cartAktif" type="button" class="ec-cta ec-cta--card" @click="tambah">
            <v-icon size="18">mdi-cart-plus</v-icon>
            Tambah ke keranjang
          </button>

          <p class="ec-disclaimer">
            Estimasi biaya jasa saja, belum termasuk kaos polos. Harga final dikonfirmasi CS saat
            pemesanan.
          </p>
        </aside>
      </div>
    </main>

    <!-- Ringkasan + tombol tambah tetap terlihat di layar kecil -->
    <div class="ec-bar" :class="{ 'ec-bar--fab': cart.count > 0 && !cart.open }">
      <div class="ec-bar-sum" aria-hidden="true">
        <span class="ec-bar-label">Total estimasi jasa</span>
        <span class="ec-bar-val">{{ qtyValid ? rp(hasil.total) : "-" }}</span>
      </div>
      <button
        v-if="cartAktif"
        type="button"
        class="ec-cta ec-cta--bar"
        aria-label="Tambah ke keranjang"
        @click="tambah"
      >
        <v-icon size="18">mdi-cart-plus</v-icon>
        Tambah
      </button>
    </div>

    <div class="ec-toast-wrap" role="status" aria-live="polite">
      <div v-if="status" class="ec-toast" :class="{ 'is-err': !status.ok }">
        <span>{{ status.teks }}</span>
        <button v-if="status.ok" type="button" class="ec-link" @click="cart.open = true">
          Lihat keranjang
        </button>
      </div>
    </div>

    <SiteFooter max-width="1040px" />
  </div>
</template>

<style scoped>
.ec-page {
  --ec-red: #b71c1c;
  --ec-red-soft: #fdecea;
  --ec-ink: #1f1a19;
  --ec-muted: #6f6663;
  --ec-line: #e9dfdb;
  --ec-bg: #faf6f4;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  color: var(--ec-ink);
  background: var(--ec-bg);
  font-family: "Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif;
}

/* Header */
.ec-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 60px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--ec-line);
}
.ec-title {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}
.ec-sub {
  font-size: 12px;
  color: var(--ec-muted);
}
.ec-logo {
  display: inline-flex;
}

/* Layout */
.ec-main {
  flex: 1;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 28px 16px 40px;
}
.ec-h1 {
  margin: 0;
  font-family: "Playfair Display Variable", "Playfair Display", Georgia, serif;
  font-size: clamp(26px, 5vw, 38px);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.ec-lead {
  max-width: 52ch;
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ec-muted);
}
.ec-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  margin-top: 24px;
}
.ec-field {
  margin-bottom: 22px;
}
.ec-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ec-label {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
}
.ec-field-head .ec-label {
  margin: 0;
}

/* Jenis jasa */
.ec-jenis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.ec-jenis-btn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 64px;
  padding: 12px 14px;
  text-align: left;
  font: inherit;
  color: var(--ec-ink);
  background: #fff;
  border: 1px solid var(--ec-line);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ec-jenis-btn:hover {
  border-color: #d6c4bd;
}
.ec-jenis-btn.is-on {
  border-color: var(--ec-red);
  box-shadow: 0 0 0 1px var(--ec-red);
}
.ec-jenis-name {
  font-size: 14px;
  font-weight: 700;
}
.ec-jenis-basis {
  font-size: 12px;
  color: var(--ec-muted);
}
.ec-jenis-btn:focus-visible,
.ec-seg button:focus-visible,
.ec-add:focus-visible,
.ec-del:focus-visible,
.ec-qty button:focus-visible {
  outline: 2px solid var(--ec-red);
  outline-offset: 2px;
}

/* Jumlah */
.ec-qty {
  display: inline-flex;
  align-items: center;
  height: 48px;
  background: #fff;
  border: 1px solid var(--ec-line);
  border-radius: 12px;
  overflow: hidden;
}
.ec-qty button {
  width: 48px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--ec-red);
  background: none;
  border: 0;
  cursor: pointer;
}
.ec-qty input {
  width: 72px;
  height: 100%;
  padding: 0;
  text-align: center;
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  color: var(--ec-ink);
  background: transparent;
  border: 0;
  border-inline: 1px solid var(--ec-line);
  outline: 0;
  -moz-appearance: textfield;
  appearance: textfield;
}
.ec-qty input::-webkit-inner-spin-button,
.ec-qty input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
.ec-qty input:focus-visible {
  background: var(--ec-red-soft);
}
.ec-qty-unit {
  padding: 0 12px;
  font-size: 13px;
  color: var(--ec-muted);
}

/* Segmen (ukuran, warna kaos) */
.ec-seg {
  display: inline-flex;
  padding: 3px;
  background: #fff;
  border: 1px solid var(--ec-line);
  border-radius: 12px;
}
.ec-seg button {
  min-width: 72px;
  height: 42px;
  padding: 0 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--ec-muted);
  background: none;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.ec-seg button.is-on {
  color: #fff;
  background: var(--ec-red);
}

/* Titik cetak */
.ec-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--ec-red);
  background: none;
  border: 1px solid var(--ec-red);
  border-radius: 999px;
  cursor: pointer;
}
.ec-add:hover {
  color: #fff;
  background: var(--ec-red);
}
.ec-titik-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.ec-titik {
  padding: 12px;
  background: #fff;
  border: 1px solid var(--ec-line);
  border-radius: 12px;
}
.ec-titik-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ec-titik-no {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  color: var(--ec-red);
  background: var(--ec-red-soft);
  border-radius: 50%;
}
.ec-input {
  width: 100%;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  font: inherit;
  font-size: 16px; /* 16px mencegah iOS memperbesar layar saat fokus */
  color: var(--ec-ink);
  background: #fff;
  border: 1px solid var(--ec-line);
  border-radius: 10px;
  outline: 0;
}
.ec-input:focus {
  border-color: var(--ec-red);
  box-shadow: 0 0 0 3px rgba(183, 28, 28, 0.12);
}
.ec-del {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  color: var(--ec-muted);
  background: #f3ece9;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}
.ec-del:hover {
  color: #fff;
  background: var(--ec-red);
}
.ec-dim {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.ec-dim-f {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--ec-muted);
}
.ec-x {
  padding-bottom: 12px;
  color: #b9aca7;
}
.ec-luas {
  min-width: 56px;
  padding-bottom: 6px;
  text-align: center;
  font-size: 11px;
  color: var(--ec-muted);
}
.ec-luas b {
  display: block;
  font-size: 14px;
  color: var(--ec-red);
  font-variant-numeric: tabular-nums;
}

/* Hasil */
.ec-result {
  align-self: start;
  padding: 20px;
  background: #fff;
  border: 1px solid var(--ec-line);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(60, 20, 15, 0.08);
}
.ec-warn {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ec-red);
}
.ec-break {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--ec-line);
}
.ec-break-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--ec-muted);
  font-variant-numeric: tabular-nums;
}
.ec-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
  color: var(--ec-muted);
}
.ec-row b {
  font-size: 14px;
  color: var(--ec-ink);
  font-variant-numeric: tabular-nums;
}
.ec-total {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--ec-line);
}
.ec-total-label {
  font-size: 12px;
  color: var(--ec-muted);
}
.ec-total-val {
  font-family: "Playfair Display Variable", "Playfair Display", Georgia, serif;
  font-size: 34px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--ec-red);
  font-variant-numeric: tabular-nums;
}
.ec-total-note {
  font-size: 12px;
  color: var(--ec-muted);
}
.ec-disclaimer {
  margin: 16px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ec-muted);
}

/* Bilah ringkasan (layar kecil) */
.ec-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  border-top: 1px solid var(--ec-line);
  box-shadow: 0 -8px 24px rgba(60, 20, 15, 0.08);
}
.ec-bar-label {
  font-size: 11px;
  color: var(--ec-muted);
}
.ec-bar-val {
  font-size: 18px;
  font-weight: 800;
  color: var(--ec-red);
  font-variant-numeric: tabular-nums;
}
.ec-bar-sum {
  display: flex;
  flex-direction: column;
}
/* Tombol keranjang mengambang (CartDock) menutupi sisi kanan bilah ini */
.ec-bar--fab {
  padding-right: 84px;
}

.ec-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  margin-top: 16px;
  padding: 0 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  background: var(--ec-red);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}
.ec-cta:hover {
  background: #8e0000;
}
.ec-cta:focus-visible {
  outline: 2px solid var(--ec-red);
  outline-offset: 2px;
}
.ec-cta--bar {
  width: auto;
  margin-top: 0;
  flex-shrink: 0;
}
.ec-cta--card {
  display: none;
}

.ec-store-note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ec-muted);
}
.ec-link {
  padding: 0;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  color: var(--ec-red);
  background: none;
  border: 0;
  cursor: pointer;
}

.ec-toast-wrap {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(84px + env(safe-area-inset-bottom, 0px));
  z-index: 95;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.ec-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 420px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--ec-ink);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(60, 20, 15, 0.28);
}
.ec-toast.is-err {
  background: var(--ec-red);
}
.ec-toast .ec-link {
  color: #fff;
  white-space: nowrap;
}

@media (max-width: 899px) {
  .ec-page {
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }
}
@media (min-width: 900px) {
  .ec-header {
    padding: 0 24px;
  }
  .ec-main {
    padding: 44px 24px 64px;
  }
  .ec-grid {
    grid-template-columns: 1fr 380px;
    gap: 40px;
  }
  .ec-jenis {
    grid-template-columns: repeat(3, 1fr);
  }
  .ec-result {
    position: sticky;
    top: 84px;
  }
  .ec-bar {
    display: none;
  }
  .ec-cta--card {
    display: flex;
  }
  .ec-toast-wrap {
    left: 24px;
    right: auto;
    bottom: 24px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ec-jenis-btn,
  .ec-seg button {
    transition: none;
  }
}
</style>
