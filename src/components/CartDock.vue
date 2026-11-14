<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import api from "@/services/api";
import {
  PenawaranError,
  useCartStore,
  type CustomLine,
  type HasilPenawaran,
} from "@/stores/cartStore";
import { WARNA_KAOS, type WarnaKaos } from "@/data/jasaCustom";
import ProductPlaceholder from "@/components/ProductPlaceholder.vue";

interface StoreContact {
  kode: string;
  nama: string;
  wa_link: string | null;
}

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}

interface Sukses {
  hasil: HasilPenawaran;
  tokoNama: string;
  adaCustom: boolean;
  // Nomor WA store diambil saat sukses: setelah keranjang dikosongkan, store terpilih sudah hilang
  waBase: string | null;
}

// URL wa.me yang terlalu panjang dipotong WhatsApp; batas praktis sekitar 2000 karakter
const WA_MAX_URL = 1900;
// Samakan dengan ONLINE_LIMIT di offerFormService.js (server tetap menjadi penentu)
const LIMIT = { nama: 80, telp: 20, alamat: 250, namaDesain: 60 };
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITEKEY = String(import.meta.env.VITE_TURNSTILE_SITEKEY ?? "").trim();

const cart = useCartStore();
const route = useRoute();
// Tema premium dipicu dari URL, bukan dari kelas di <html> (kelas itu dipasang/dicabut halaman lain)
const premium = computed(() => route.query.from === "premium" || route.path === "/kiosk/premium");
const {
  lines,
  custom,
  open,
  count,
  subtotal,
  subtotalJasa,
  terisi,
  adaMasalah,
  refreshing,
  refreshError,
  mengirim,
  siapSimpan,
  toko,
  tokoNama,
  kodeKaos,
  customBelumDipasang,
} = storeToRefs(cart);

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(Number(n)) || 0)}`;
const imgFailed = reactive<Record<string, boolean>>({});

// --- Langkah tampilan: keranjang -> form data pemesan -> sukses ---
const step = ref<"cart" | "form">("cart");
const sukses = ref<Sukses | null>(null);
const tampil = computed<"sukses" | "kosong" | "isi">(() =>
  sukses.value ? "sukses" : !terisi.value ? "kosong" : "isi"
);
const judul = computed(() =>
  tampil.value === "sukses" ? "Penawaran" : step.value === "form" ? "Data pemesan" : "Keranjang"
);
const subJudul = computed(() => (sukses.value ? sukses.value.tokoNama : tokoNama.value));

const jumlahPcs = computed(() => lines.value.reduce((s, l) => s + l.qty, 0));
const totalPerkiraan = computed(() => subtotal.value + subtotalJasa.value);

// Alasan tombol "Buat penawaran" belum bisa dipakai
const alasanBelum = computed(() => {
  if (!lines.value.length) return "Tambahkan minimal satu kaos. Jasa custom dipasang pada kaos.";
  if (customBelumDipasang.value.length) return "Pilih kaos untuk setiap jasa custom.";
  return "";
});

// --- Rincian jasa custom (dipakai tampilan keranjang dan pesan WhatsApp) ---
const labelWarna = (w: WarnaKaos) => WARNA_KAOS.find((x) => x.value === w)?.label ?? w;

const ukuranTeks = (c: CustomLine): string => {
  const j = cart.jasaOf(c);
  if (j?.mode !== "ukuran") return "";
  return j.bedaWarnaKaos
    ? `Ukuran ${c.ukuran}, kaos ${labelWarna(c.warna).toLowerCase()}`
    : `Ukuran ${c.ukuran}`;
};

const titikTeks = (c: CustomLine): string => {
  const luas = cart.jasaOf(c)?.mode === "luas";
  return c.titiks
    .map((t, i) => {
      const nama = t.nama || `Titik ${i + 1}`;
      return luas ? `${nama} ${t.panjang}x${t.lebar} cm` : nama;
    })
    .join("; ");
};

const namaJasa = (c: CustomLine) => cart.jasaOf(c)?.nama ?? c.jenis;
const namaKaos = (kode: string) => lines.value.find((l) => l.kode === kode)?.nama ?? kode;

const onPasang = (id: string, kode: string, e: Event) => {
  const el = e.target;
  if (el instanceof HTMLInputElement) cart.pasangKaos(id, kode, el.checked);
};
const onNamaDesain = (id: string, e: Event) => {
  const el = e.target;
  if (el instanceof HTMLInputElement) cart.namaCustom(id, el.value);
};

// --- Kontak WhatsApp store ---
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

// Hanya nomor seluler Indonesia (628...). Telepon rumah atau format lain: tanpa tombol WhatsApp.
const waBase = computed(() => {
  const link = contacts.value?.find((c) => c.kode === toko.value)?.wa_link ?? "";
  return /^https:\/\/wa\.me\/628\d{7,12}$/.test(link) ? link : null;
});

// Pesan cadangan (tanpa menyimpan penawaran), hanya dipakai bila penyimpanan gagal
const pesan = computed(() => {
  const out: string[] = [`Halo, saya mau pesan di store ${tokoNama.value}:`];

  if (lines.value.length) {
    out.push("", "Barang:");
    lines.value.forEach((l, i) =>
      out.push(`${i + 1}. ${l.nama} (${l.kode}) - ${l.ukuran} x${l.qty} @ ${rp(cart.unitPrice(l))}`)
    );
    out.push("", `Estimasi total barang: ${rp(subtotal.value)}`);
  }

  if (custom.value.length) {
    out.push("", "Jasa custom (estimasi, harga final dikonfirmasi CS):");
    custom.value.forEach((c, i) => {
      out.push(`${i + 1}. ${namaJasa(c)} - ${cart.qtyCustom(c)} pcs`);
      if (c.nama) out.push(`   Desain: ${c.nama}`);
      const u = ukuranTeks(c);
      if (u) out.push(`   ${u}`);
      out.push(`   Titik: ${titikTeks(c)}`);
      out.push(`   Untuk: ${c.kaos.map(namaKaos).join("; ")}`);
      out.push(`   Estimasi jasa: ${rp(cart.estimasiCustom(c)?.total ?? 0)}`);
    });
    if (custom.value.length > 1) out.push("", `Total estimasi jasa: ${rp(subtotalJasa.value)}`);
    out.push("", "Desain saya kirim di chat ini.");
  }

  out.push(
    "",
    lines.value.length
      ? "Mohon dicek ketersediaan dan total pembayarannya. Terima kasih."
      : "Mohon dikonfirmasi harga dan prosesnya. Terima kasih."
  );
  return out.join("\n");
});
const waFull = computed(() =>
  waBase.value ? `${waBase.value}?text=${encodeURIComponent(pesan.value)}` : null
);
const pesanPanjang = computed(() => !!waFull.value && waFull.value.length > WA_MAX_URL);
const waCadangan = computed(() => (pesanPanjang.value ? waBase.value : waFull.value));
const bisaCadangan = computed(() => !!waCadangan.value && !refreshing.value);

const disalin = ref(false);
const salinGagal = ref(false);
let salinTimer: ReturnType<typeof setTimeout> | undefined;
const salinTeks = async (teks: string) => {
  salinGagal.value = false;
  try {
    await navigator.clipboard.writeText(teks);
    disalin.value = true;
    clearTimeout(salinTimer);
    salinTimer = setTimeout(() => (disalin.value = false), 3000);
  } catch {
    salinGagal.value = true;
  }
};
// Pesan terlalu panjang untuk URL: chat dibuka tanpa teks, jadi teksnya disalin
const onWaCadanganClick = () => {
  if (pesanPanjang.value) salinTeks(pesan.value);
};

// --- Form data pemesan (hanya di memori: tidak masuk store, localStorage, atau URL) ---
const form = reactive({ nama: "", telp: "", alamat: "", setuju: false, website: "" });
const sentuh = reactive({ nama: false, telp: false, alamat: false });
const dicoba = ref(false);
const galat = ref("");
const galatStatus = ref<number | null>(null);
const formEl = ref<HTMLFormElement | null>(null);

const telpBersih = computed(() => form.telp.replace(/[\s().-]/g, ""));
const namaOk = computed(() => form.nama.trim().length >= 3);
const telpOk = computed(() => /^(?:\+?62|0)8\d{8,12}$/.test(telpBersih.value));
const alamatOk = computed(() => form.alamat.trim().length >= 10);
const formOk = computed(() => namaOk.value && telpOk.value && alamatOk.value && form.setuju);
const salah = computed(() => ({
  nama: (sentuh.nama || dicoba.value) && !namaOk.value,
  telp: (sentuh.telp || dicoba.value) && !telpOk.value,
  alamat: (sentuh.alamat || dicoba.value) && !alamatOk.value,
  setuju: dicoba.value && !form.setuju,
}));

const kosongkanForm = () => {
  form.nama = "";
  form.telp = "";
  form.alamat = "";
  form.setuju = false;
  form.website = "";
  sentuh.nama = sentuh.telp = sentuh.alamat = false;
  dicoba.value = false;
  galat.value = "";
  galatStatus.value = null;
};

// --- Turnstile ---
const tsEl = ref<HTMLElement | null>(null);
const tsStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const tsToken = ref("");
let tsWidget: string | null = null;
let tsLoading: Promise<TurnstileApi> | null = null;

const tsApi = (): TurnstileApi | undefined =>
  (window as unknown as { turnstile?: TurnstileApi }).turnstile;

const loadTurnstile = (): Promise<TurnstileApi> => {
  const ada = tsApi();
  if (ada) return Promise.resolve(ada);
  if (!tsLoading) {
    tsLoading = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => {
        const t = tsApi();
        if (t) resolve(t);
        else reject(new Error("turnstile"));
      };
      s.onerror = () => {
        s.remove();
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
    // Gagal dimuat (offline, diblokir): izinkan percobaan ulang
    tsLoading.catch(() => {
      tsLoading = null;
    });
  }
  return tsLoading;
};

const tsRemove = () => {
  const t = tsApi();
  if (t && tsWidget !== null) {
    try {
      t.remove(tsWidget);
    } catch {
      // widget sudah tidak ada
    }
  }
  tsWidget = null;
  tsToken.value = "";
  tsStatus.value = "idle";
};

const tsRender = async () => {
  if (tsWidget !== null) return;
  if (!SITEKEY) {
    tsStatus.value = "error";
    return;
  }
  tsStatus.value = "loading";
  try {
    const t = await loadTurnstile();
    await nextTick();
    if (!tsEl.value || step.value !== "form" || tsWidget !== null) return;
    tsWidget = t.render(tsEl.value, {
      sitekey: SITEKEY,
      theme: premium.value ? "dark" : "light",
      size: "flexible",
      language: "id",
      callback: (token: string) => {
        tsToken.value = token;
        tsStatus.value = "ready";
      },
      "expired-callback": () => {
        tsToken.value = "";
        tsStatus.value = "loading";
      },
      "timeout-callback": () => {
        tsToken.value = "";
        tsStatus.value = "loading";
      },
      "error-callback": () => {
        tsToken.value = "";
        tsStatus.value = "error";
      },
    });
  } catch {
    tsStatus.value = "error";
  }
};

// Token Turnstile sekali pakai: setelah setiap percobaan kirim, minta yang baru
const tsReset = () => {
  const t = tsApi();
  tsToken.value = "";
  if (t && tsWidget !== null) {
    try {
      t.reset(tsWidget);
      tsStatus.value = "loading";
      return;
    } catch {
      // jatuh ke render ulang di bawah
    }
  }
  tsRemove();
  tsRender();
};

const tsCobaLagi = () => {
  tsRemove();
  tsRender();
};

// Tombol simpan menunggu token; bila widget gagal, tombol tetap aktif agar pesannya bisa terbaca
const menungguToken = computed(() => !tsToken.value && tsStatus.value !== "error");

// Penyimpanan tidak mungkin berhasil (widget gagal, server bermasalah, koneksi putus)
const penyimpananGagal = computed(
  () =>
    tsStatus.value === "error" ||
    galatStatus.value === 0 ||
    (galatStatus.value !== null && galatStatus.value >= 500)
);

// --- Kirim penawaran ---
const doneHead = ref<HTMLElement | null>(null);

const kirim = async () => {
  if (mengirim.value) return;
  dicoba.value = true;
  galat.value = "";
  galatStatus.value = null;
  if (!formOk.value) {
    await nextTick();
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"], .cd-check-bad input')?.focus();
    return;
  }
  if (!siapSimpan.value) {
    galat.value = alasanBelum.value || "Keranjang belum lengkap.";
    return;
  }
  if (!tsToken.value) {
    galat.value = "Verifikasi keamanan belum selesai. Tunggu sebentar lalu coba lagi.";
    return;
  }
  try {
    const hasil = await cart.kirimPenawaran({
      nama: form.nama.trim(),
      telp: form.telp.trim(),
      alamat: form.alamat.trim(),
      turnstile: tsToken.value,
      website: form.website,
    });
    // Salin yang dibutuhkan layar sukses sebelum keranjang dikosongkan
    sukses.value = {
      hasil,
      tokoNama: tokoNama.value,
      adaCustom: custom.value.length > 0,
      waBase: waBase.value,
    };
    // Data pemesan dihapus dari memori: perangkat toko dipakai bergantian
    kosongkanForm();
    tsRemove();
    cart.kosongkan();
    step.value = "cart";
    // Keranjang kosong menyembunyikan tombol melayang: panel dijaga terbuka supaya nomor tidak hilang
    open.value = true;
    await nextTick();
    doneHead.value?.focus();
  } catch (e) {
    const err = e instanceof PenawaranError ? e : null;
    galat.value = err ? err.message : "Terjadi kesalahan. Coba lagi sebentar lagi.";
    galatStatus.value = err ? err.status : 0;
    tsReset();
  }
};

// --- Layar sukses ---
const pesanSukses = computed(() => {
  const s = sukses.value;
  if (!s) return "";
  // Hanya nomor penawaran: URL wa.me tidak boleh memuat nama atau nomor HP pelanggan
  const out = [
    `Halo, saya sudah membuat penawaran online nomor ${s.hasil.nomor} di store ${s.tokoNama}.`,
  ];
  if (s.adaCustom) out.push("Desain custom saya kirim di chat ini.");
  out.push("Mohon dikonfirmasi ketersediaan dan total pembayarannya. Terima kasih.");
  return out.join("\n");
});
const waSukses = computed(() =>
  sukses.value?.waBase
    ? `${sukses.value.waBase}?text=${encodeURIComponent(pesanSukses.value)}`
    : null
);

// --- Buka, tutup, fokus ---
const panelEl = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
let pembuka: HTMLElement | null = null;

const tutup = () => {
  open.value = false;
};

watch(open, async (v) => {
  document.documentElement.style.overflow = v ? "hidden" : "";
  if (v) {
    pembuka = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cart.refresh();
    loadContacts();
    await nextTick();
    if (!sukses.value) closeBtn.value?.focus();
  } else {
    sukses.value = null;
    step.value = "cart";
    tsRemove();
    if (pembuka && document.contains(pembuka)) pembuka.focus();
    pembuka = null;
  }
});

watch(step, async (v) => {
  if (v !== "form") return;
  tsRender();
  await nextTick();
  formEl.value?.querySelector<HTMLInputElement>("#cd-nama")?.focus();
});

watch(terisi, (v) => {
  if (v) return;
  if (!sukses.value) step.value = "cart";
  kosongkanForm();
  tsRemove();
});

const lanjutKeForm = () => {
  if (!siapSimpan.value) return;
  step.value = "form";
};

// Kosongkan keranjang butuh dua ketukan: tombol besar di tablet mudah tersentuh tanpa sengaja
const yakinKosong = ref(false);
let yakinTimer: ReturnType<typeof setTimeout> | undefined;
const kosongkanKeranjang = () => {
  if (!yakinKosong.value) {
    yakinKosong.value = true;
    clearTimeout(yakinTimer);
    yakinTimer = setTimeout(() => (yakinKosong.value = false), 4000);
    return;
  }
  clearTimeout(yakinTimer);
  yakinKosong.value = false;
  cart.kosongkan();
};

const salinNomor = () => {
  if (sukses.value) salinTeks(sukses.value.hasil.nomor);
};

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape" && open.value) tutup();
};

// Fokus dijaga di dalam panel selama terbuka
const onPanelKey = (e: KeyboardEvent) => {
  if (e.key !== "Tab" || !panelEl.value) return;
  const fokus = [
    ...panelEl.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!fokus.length) return;
  const awal = fokus[0];
  const akhir = fokus[fokus.length - 1];
  const aktif = document.activeElement;
  if (e.shiftKey && (aktif === awal || !panelEl.value.contains(aktif))) {
    e.preventDefault();
    akhir.focus();
  } else if (!e.shiftKey && (aktif === akhir || !panelEl.value.contains(aktif))) {
    e.preventDefault();
    awal.focus();
  }
};

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  document.documentElement.style.overflow = "";
  clearTimeout(salinTimer);
  clearTimeout(yakinTimer);
  tsRemove();
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
        <div v-if="open" class="cd-wrap" @click.self="tutup">
          <section
            ref="panelEl"
            class="cd-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cd-judul"
            @keydown="onPanelKey"
          >
            <header class="cd-bar">
              <div>
                <h2 id="cd-judul" class="cd-bar-title">{{ judul }}</h2>
                <div class="cd-bar-sub">{{ subJudul }}</div>
              </div>
              <button ref="closeBtn" class="cd-x" type="button" aria-label="Tutup" @click="tutup">
                <v-icon size="22">mdi-close</v-icon>
              </button>
            </header>

            <!-- ===== Sukses ===== -->
            <div v-if="tampil === 'sukses' && sukses" class="cd-done">
              <div class="cd-done-in">
                <svg class="cd-tick" viewBox="0 0 52 52" aria-hidden="true">
                  <circle class="cd-tick-c" cx="26" cy="26" r="24" />
                  <path class="cd-tick-p" d="M15 27l8 8 14-16" />
                </svg>
                <h3 ref="doneHead" class="cd-done-h" tabindex="-1">Penawaran tersimpan</h3>
                <p class="cd-done-sub">Penawaranmu sudah masuk ke store {{ sukses.tokoNama }}.</p>

                <div class="cd-nomor-box">
                  <span class="cd-label">Nomor penawaran</span>
                  <b class="cd-nomor">{{ sukses.hasil.nomor }}</b>
                  <button type="button" class="cd-link" @click="salinNomor">
                    {{ disalin ? "Tersalin" : "Salin nomor" }}
                  </button>
                  <p v-if="salinGagal" class="cd-note">
                    Tidak bisa disalin otomatis. Catat atau foto layar ini.
                  </p>
                </div>

                <dl class="cd-done-dl">
                  <div v-if="sukses.hasil.berlakuSampai">
                    <dt>Berlaku sampai</dt>
                    <dd>{{ sukses.hasil.berlakuSampai }}</dd>
                  </div>
                  <div>
                    <dt>Total penawaran</dt>
                    <dd class="cd-done-total">{{ rp(sukses.hasil.total) }}</dd>
                  </div>
                </dl>

                <div v-if="sukses.hasil.stokKurang.length" class="cd-warn cd-warn--box">
                  <b>Stok sebagian barang kurang dari jumlah yang diminta.</b>
                  Penawaran tetap tersimpan, store akan mengonfirmasi ketersediaannya.
                  <ul class="cd-kurang">
                    <li v-for="(s, i) in sukses.hasil.stokKurang" :key="i">
                      {{ s.nama }} ({{ s.ukuran }}): diminta {{ s.diminta }} pcs
                    </li>
                  </ul>
                </div>

                <p class="cd-note">
                  Simpan nomor ini. Sebutkan nomornya saat menghubungi store.
                  <template v-if="sukses.adaCustom">
                    Harga jasa custom dikonfirmasi CS; kirim file desain lewat WhatsApp.
                  </template>
                </p>

                <a
                  v-if="waSukses"
                  class="cd-btn"
                  :href="waSukses"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <v-icon size="20">mdi-whatsapp</v-icon>
                  Konfirmasi lewat WhatsApp
                </a>
                <p v-else class="cd-note">
                  Nomor WhatsApp store ini belum tersedia. Hubungi store dan sebutkan nomor
                  penawaran di atas.
                </p>
                <button type="button" class="cd-btn cd-btn--ghost" @click="tutup">Selesai</button>
              </div>
            </div>

            <!-- ===== Kosong ===== -->
            <div v-else-if="tampil === 'kosong'" class="cd-empty">
              <p>Keranjang masih kosong.</p>
              <router-link to="/estimasi-custom" class="cd-add-cust" @click="tutup">
                <v-icon size="18">mdi-palette-outline</v-icon>
                Tambah jasa custom (sablon / bordir)
              </router-link>
            </div>

            <!-- ===== Keranjang + form ===== -->
            <div v-else class="cd-body" :class="`cd-body--${step}`">
              <div class="cd-left">
                <div v-if="refreshError" class="cd-warn">
                  Stok terbaru tidak bisa dimuat. Angka di bawah mungkin sudah berubah.
                </div>
                <div v-else-if="adaMasalah" class="cd-warn">
                  Jumlah sebagian barang melebihi stok. Penawaran tetap bisa disimpan, store akan
                  mengonfirmasi ketersediaannya.
                  <button type="button" @click="cart.sesuaikan()">Sesuaikan keranjang</button>
                </div>
                <div v-if="customBelumDipasang.length" class="cd-warn">
                  Pilih kaos untuk setiap jasa custom sebelum membuat penawaran.
                </div>

                <div class="cd-scroll">
                  <div class="cd-scroll-in">
                    <ul v-if="lines.length" class="cd-list">
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
                          <div v-else-if="l.qty > l.stok" class="cd-stok">
                            Melebihi stok tersedia
                          </div>
                        </div>

                        <div class="cd-side">
                          <div class="cd-step">
                            <button
                              type="button"
                              aria-label="Kurangi"
                              @click="cart.ubahQty(l.kode, l.ukuran, -1)"
                            >
                              <v-icon size="18">mdi-minus</v-icon>
                            </button>
                            <span>{{ l.qty }}</span>
                            <button
                              type="button"
                              aria-label="Tambah"
                              :disabled="!cart.bisaNaik(l)"
                              @click="cart.ubahQty(l.kode, l.ukuran, 1)"
                            >
                              <v-icon size="18">mdi-plus</v-icon>
                            </button>
                          </div>
                          <button
                            class="cd-del"
                            type="button"
                            @click="cart.hapus(l.kode, l.ukuran)"
                          >
                            Hapus
                          </button>
                        </div>
                      </li>
                    </ul>

                    <section v-if="custom.length" class="cd-cust" aria-labelledby="cd-cust-h">
                      <h3 id="cd-cust-h" class="cd-cust-h">Jasa custom</h3>
                      <ul class="cd-list">
                        <li v-for="c in custom" :key="c.id" class="cd-item">
                          <div class="cd-img cd-img--cust" aria-hidden="true">
                            <v-icon size="28">mdi-palette-outline</v-icon>
                          </div>

                          <div class="cd-info">
                            <div class="cd-name">{{ namaJasa(c) }}</div>
                            <div v-if="ukuranTeks(c)" class="cd-meta">{{ ukuranTeks(c) }}</div>
                            <div class="cd-meta">{{ titikTeks(c) }}</div>
                            <div class="cd-price">
                              ≈ {{ rp(cart.estimasiCustom(c)?.total ?? 0) }}
                            </div>
                            <div class="cd-meta">
                              {{ rp(cart.estimasiCustom(c)?.satuan ?? 0) }} / pcs
                            </div>

                            <input
                              class="cd-mini"
                              type="text"
                              :value="c.nama"
                              :maxlength="LIMIT.namaDesain"
                              placeholder="Nama desain (opsional)"
                              aria-label="Nama desain (opsional)"
                              autocomplete="off"
                              @input="onNamaDesain(c.id, $event)"
                            />

                            <fieldset class="cd-pair">
                              <legend class="cd-pair-h" :class="{ 'is-warn': !c.kaos.length }">
                                {{ c.kaos.length ? "Untuk kaos:" : "Pilih kaos untuk jasa ini:" }}
                              </legend>
                              <label v-for="k in kodeKaos" :key="k" class="cd-pair-row">
                                <input
                                  type="checkbox"
                                  :checked="c.kaos.includes(k)"
                                  @change="onPasang(c.id, k, $event)"
                                />
                                <span>{{ namaKaos(k) }}</span>
                              </label>
                              <p v-if="!kodeKaos.length" class="cd-meta">
                                Tambahkan kaos ke keranjang dulu.
                              </p>
                            </fieldset>
                          </div>

                          <div class="cd-side">
                            <div class="cd-qty-ro">{{ cart.qtyCustom(c) }} pcs</div>
                            <button class="cd-del" type="button" @click="cart.hapusCustom(c.id)">
                              Hapus
                            </button>
                          </div>
                        </li>
                      </ul>
                    </section>

                    <router-link to="/estimasi-custom" class="cd-add-cust" @click="tutup">
                      <v-icon size="18">mdi-palette-outline</v-icon>
                      Tambah jasa custom (sablon / bordir)
                    </router-link>
                  </div>
                </div>
              </div>

              <div class="cd-right">
                <div class="cd-right-scroll">
                  <!-- Ringkasan -->
                  <div v-show="step === 'cart'">
                    <h3 class="cd-sum-h">Ringkasan</h3>
                    <div v-if="lines.length" class="cd-total">
                      <span>Barang ({{ jumlahPcs }} pcs)</span>
                      <b>{{ rp(subtotal) }}</b>
                    </div>
                    <div v-if="custom.length" class="cd-total cd-total--jasa">
                      <span>Estimasi jasa</span>
                      <b>≈ {{ rp(subtotalJasa) }}</b>
                    </div>
                    <div v-if="lines.length && custom.length" class="cd-total cd-total--grand">
                      <span>Total perkiraan</span>
                      <b>≈ {{ rp(totalPerkiraan) }}</b>
                    </div>
                    <p class="cd-note">
                      Penawaran berlaku 3 hari. Keranjang tidak menahan stok; store mengonfirmasi
                      ketersediaan. Harga final dihitung ulang sistem saat penawaran disimpan.
                    </p>
                  </div>

                  <!-- Form data pemesan -->
                  <form
                    v-show="step === 'form'"
                    id="cd-form"
                    ref="formEl"
                    class="cd-form"
                    novalidate
                    @submit.prevent="kirim"
                  >
                    <button type="button" class="cd-link cd-back" @click="step = 'cart'">
                      <v-icon size="16">mdi-arrow-left</v-icon>
                      Kembali ke keranjang
                    </button>
                    <p class="cd-form-sum">
                      {{ jumlahPcs }} pcs<template v-if="custom.length"> + jasa custom</template> ·
                      {{ custom.length ? "≈ " : "" }}{{ rp(totalPerkiraan) }}
                    </p>

                    <div class="cd-field" :class="{ 'is-bad': salah.nama }">
                      <label for="cd-nama">Nama lengkap</label>
                      <input
                        id="cd-nama"
                        v-model="form.nama"
                        type="text"
                        autocomplete="name"
                        enterkeyhint="next"
                        :maxlength="LIMIT.nama"
                        :aria-invalid="salah.nama"
                        aria-describedby="cd-nama-e"
                        @blur="sentuh.nama = true"
                      />
                      <p v-if="salah.nama" id="cd-nama-e" class="cd-err">
                        Isi nama lengkap (minimal 3 huruf).
                      </p>
                    </div>

                    <div class="cd-field" :class="{ 'is-bad': salah.telp }">
                      <label for="cd-telp">No. HP / WhatsApp</label>
                      <input
                        id="cd-telp"
                        v-model="form.telp"
                        type="tel"
                        inputmode="tel"
                        autocomplete="tel"
                        enterkeyhint="next"
                        placeholder="0812xxxxxxxx"
                        :maxlength="LIMIT.telp"
                        :aria-invalid="salah.telp"
                        aria-describedby="cd-telp-e"
                        @blur="sentuh.telp = true"
                      />
                      <p v-if="salah.telp" id="cd-telp-e" class="cd-err">
                        Isi nomor HP yang aktif, mis. 0812xxxxxxxx.
                      </p>
                    </div>

                    <div class="cd-field" :class="{ 'is-bad': salah.alamat }">
                      <label for="cd-alamat">Alamat</label>
                      <textarea
                        id="cd-alamat"
                        v-model="form.alamat"
                        rows="3"
                        autocomplete="street-address"
                        :maxlength="LIMIT.alamat"
                        :aria-invalid="salah.alamat"
                        aria-describedby="cd-alamat-e"
                        @blur="sentuh.alamat = true"
                      />
                      <p v-if="salah.alamat" id="cd-alamat-e" class="cd-err">
                        Isi alamat lengkap (jalan, kelurahan, kota).
                      </p>
                    </div>

                    <!-- Jebakan bot: manusia tidak melihat dan tidak mengisinya -->
                    <div class="cd-hp" aria-hidden="true">
                      <label>
                        Situs web
                        <input
                          v-model="form.website"
                          type="text"
                          name="website"
                          tabindex="-1"
                          autocomplete="off"
                        />
                      </label>
                    </div>

                    <label class="cd-check" :class="{ 'cd-check-bad': salah.setuju }">
                      <input v-model="form.setuju" type="checkbox" :aria-invalid="salah.setuju" />
                      <span>
                        Saya setuju data ini dipakai Kaosan untuk memproses penawaran dan
                        menghubungi saya.
                      </span>
                    </label>
                    <p v-if="salah.setuju" class="cd-err">Centang persetujuan untuk melanjutkan.</p>

                    <div class="cd-ts">
                      <div ref="tsEl" class="cd-ts-box"></div>
                      <p v-if="tsStatus === 'loading'" class="cd-note">Memverifikasi keamanan...</p>
                      <p v-else-if="tsStatus === 'error'" class="cd-err" role="alert">
                        {{
                          SITEKEY
                            ? "Verifikasi keamanan gagal dimuat. Periksa koneksi atau pemblokir iklan."
                            : "Penyimpanan penawaran belum aktif (kunci keamanan belum diatur)."
                        }}
                        <button v-if="SITEKEY" type="button" class="cd-link" @click="tsCobaLagi">
                          Coba lagi
                        </button>
                      </p>
                    </div>

                    <p v-if="galat" class="cd-err cd-err--box" role="alert">{{ galat }}</p>
                  </form>
                </div>

                <div class="cd-actions">
                  <template v-if="step === 'cart'">
                    <p v-if="alasanBelum" class="cd-note">{{ alasanBelum }}</p>
                    <button
                      type="button"
                      class="cd-btn"
                      :disabled="!siapSimpan"
                      @click="lanjutKeForm"
                    >
                      <v-icon size="20">mdi-file-document-edit-outline</v-icon>
                      Buat penawaran
                    </button>
                    <button type="button" class="cd-link cd-clear" @click="kosongkanKeranjang">
                      {{ yakinKosong ? "Ketuk lagi untuk mengosongkan" : "Kosongkan keranjang" }}
                    </button>
                  </template>

                  <template v-else>
                    <button
                      type="submit"
                      form="cd-form"
                      class="cd-btn"
                      :disabled="mengirim || menungguToken"
                    >
                      <span v-if="mengirim" class="cd-spin" aria-hidden="true"></span>
                      {{
                        mengirim
                          ? "Menyimpan..."
                          : menungguToken
                          ? "Menunggu verifikasi..."
                          : "Simpan penawaran"
                      }}
                    </button>

                    <template v-if="penyimpananGagal">
                      <p class="cd-note">
                        Penawaran tidak bisa disimpan sekarang. Kamu bisa memesan langsung lewat
                        WhatsApp store (pesanan ini tidak tercatat sebagai penawaran).
                      </p>
                      <a
                        v-if="bisaCadangan"
                        class="cd-btn cd-btn--ghost"
                        :href="waCadangan ?? undefined"
                        target="_blank"
                        rel="noopener noreferrer"
                        @click="onWaCadanganClick"
                      >
                        <v-icon size="20">mdi-whatsapp</v-icon>
                        Pesan lewat WhatsApp
                      </a>
                      <button
                        v-else
                        type="button"
                        class="cd-btn cd-btn--ghost"
                        @click="salinTeks(pesan)"
                      >
                        {{ disalin ? "Tersalin" : "Salin pesanan" }}
                      </button>
                      <p v-if="pesanPanjang && bisaCadangan" class="cd-note">
                        Pesanan terlalu panjang untuk dikirim otomatis. Teksnya disalin saat kamu
                        menekan tombol, tempel di chat WhatsApp.
                      </p>
                      <p v-if="salinGagal" class="cd-note">
                        Pesanan tidak bisa disalin otomatis di browser ini.
                      </p>
                    </template>
                  </template>
                </div>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* ===== Token: tema normal (merah-krem). Tema premium menimpa variabel di bawah ===== */
.cd-root {
  --cd-bg: #fff;
  --cd-bg2: #faf6f4;
  --cd-ink: #1f1a19;
  --cd-muted: #6f6663;
  --cd-line: #e9dfdb;
  --cd-accent: #b71c1c;
  --cd-accent-hover: #8e0000;
  --cd-accent-ink: #fff;
  --cd-price: #d32f2f;
  --cd-soft: #fdecea;
  --cd-warn: #b45309;
  --cd-warn-bg: #fff1e0;
  --cd-field: #fff;
  --cd-bad: #c62828;
}

/* ===== Tombol melayang ===== */
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

/* ===== Panel: drawer kanan di HP / tablet potret, layar penuh di landscape lebar ===== */
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
  color: var(--cd-ink);
  background: var(--cd-bg);
  box-shadow: -12px 0 32px rgba(60, 20, 15, 0.22);
}
.cd-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 8px 10px 18px;
  color: #fff;
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
}
.cd-bar-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.3;
}
.cd-bar-sub {
  font-size: 12px;
  opacity: 0.85;
}
.cd-x {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}
.cd-x:hover {
  background: rgba(255, 255, 255, 0.14);
}
.cd-x:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -2px;
}

.cd-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--cd-muted);
}
.cd-empty p {
  margin: 0;
}
.cd-warn {
  flex-shrink: 0;
  padding: 10px 18px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cd-warn);
  background: var(--cd-warn-bg);
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
.cd-warn--box {
  margin: 14px 0;
  padding: 12px 14px;
  text-align: left;
  border-radius: 12px;
}
.cd-kurang {
  margin: 8px 0 0;
  padding-left: 18px;
}

/* ===== Isi: kiri daftar, kanan ringkasan/form ===== */
.cd-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cd-left {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cd-right {
  flex-shrink: 0;
  max-height: 62%;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--cd-line);
  background: var(--cd-bg2);
}
.cd-right-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 18px 0;
}
.cd-actions {
  flex-shrink: 0;
  padding: 10px 18px calc(14px + env(safe-area-inset-bottom, 0px));
}
/* Di layar sempit, langkah form menggantikan daftar */
.cd-body--form .cd-left {
  display: none;
}
.cd-body--form .cd-right {
  flex: 1;
  max-height: none;
  border-top: 0;
}
.cd-sum-h {
  display: none;
}

.cd-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.cd-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.cd-cust-h {
  margin: 0;
  padding: 10px 18px;
  font-size: 12px;
  font-weight: 800;
  color: var(--cd-muted);
  background: var(--cd-bg2);
  border-top: 1px solid var(--cd-line);
  border-bottom: 1px solid var(--cd-line);
}
.cd-img--cust {
  display: grid;
  place-items: center;
  color: var(--cd-accent);
  background: var(--cd-soft);
}
.cd-add-cust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  margin: 14px 18px;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
  color: var(--cd-accent);
  border: 1px dashed var(--cd-accent);
  border-radius: 12px;
}
.cd-add-cust:hover {
  background: var(--cd-soft);
}
.cd-add-cust:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 2px;
}

.cd-item {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--cd-line);
}
.cd-item--warn {
  background: var(--cd-warn-bg);
}
.cd-img {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--cd-bg2);
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
  color: var(--cd-ink);
}
.cd-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--cd-muted);
}
.cd-price {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--cd-price);
}
.cd-old {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cd-muted);
}
.cd-stok {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 800;
  color: var(--cd-warn);
}
.cd-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}
.cd-step {
  display: flex;
  align-items: center;
  border: 1px solid var(--cd-line);
  border-radius: 999px;
}
.cd-step button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: var(--cd-accent);
  background: none;
  cursor: pointer;
}
.cd-step button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.cd-step button:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: -2px;
}
.cd-step span {
  min-width: 26px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.cd-qty-ro {
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.cd-del {
  min-height: 32px;
  padding: 0 4px;
  font: inherit;
  font-size: 11px;
  color: var(--cd-muted);
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}

/* Jasa custom: nama desain dan pilihan kaos */
.cd-mini {
  width: 100%;
  height: 38px;
  margin-top: 8px;
  padding: 0 10px;
  font: inherit;
  font-size: 16px;
  color: var(--cd-ink);
  background: var(--cd-field);
  border: 1px solid var(--cd-line);
  border-radius: 8px;
}
.cd-mini:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 1px;
}
.cd-pair {
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.cd-pair-h {
  padding: 0;
  font-size: 11px;
  font-weight: 800;
  color: var(--cd-muted);
}
.cd-pair-h.is-warn {
  color: var(--cd-warn);
}
.cd-pair-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  font-size: 12px;
  line-height: 1.3;
  cursor: pointer;
}
.cd-pair-row input {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  accent-color: var(--cd-accent);
}

/* ===== Ringkasan ===== */
.cd-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  color: var(--cd-muted);
}
.cd-total b {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--cd-ink);
}
.cd-total + .cd-total {
  margin-top: 6px;
}
.cd-total--jasa b {
  font-size: 15px;
}
.cd-total--grand {
  padding-top: 8px;
  border-top: 1px solid var(--cd-line);
}
.cd-note {
  margin: 8px 0 10px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--cd-muted);
}

/* ===== Form ===== */
.cd-form {
  padding-bottom: 8px;
}
.cd-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0;
}
.cd-form-sum {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--cd-muted);
}
.cd-field {
  margin-bottom: 12px;
}
.cd-field label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 700;
}
.cd-field input,
.cd-field textarea {
  width: 100%;
  padding: 10px 12px;
  /* 16px mencegah zoom otomatis di iOS */
  font: inherit;
  font-size: 16px;
  line-height: 1.35;
  color: var(--cd-ink);
  background: var(--cd-field);
  border: 1px solid var(--cd-line);
  border-radius: 10px;
}
.cd-field textarea {
  resize: vertical;
  min-height: 84px;
}
.cd-field input:focus-visible,
.cd-field textarea:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 1px;
}
.cd-field.is-bad input,
.cd-field.is-bad textarea {
  border-color: var(--cd-bad);
}
.cd-err {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--cd-bad);
}
.cd-err--box {
  margin: 10px 0 0;
  padding: 10px 12px;
  font-weight: 700;
  border: 1px solid var(--cd-bad);
  border-radius: 10px;
}
.cd-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 4px 0 4px;
  font-size: 12px;
  line-height: 1.45;
  cursor: pointer;
}
.cd-check input {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  accent-color: var(--cd-accent);
}
.cd-ts {
  margin-top: 10px;
}
.cd-ts-box {
  min-height: 0;
}
/* Jebakan bot: di luar layar, bukan display:none (sebagian bot melewati yang tersembunyi) */
.cd-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

/* ===== Tombol ===== */
.cd-btn {
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
  color: var(--cd-accent-ink);
  background: var(--cd-accent);
  cursor: pointer;
}
.cd-btn:hover:not(:disabled) {
  background: var(--cd-accent-hover);
}
.cd-btn:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 2px;
}
.cd-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.cd-btn--ghost {
  color: var(--cd-accent);
  background: transparent;
  border: 1px solid var(--cd-accent);
}
.cd-btn--ghost:hover:not(:disabled) {
  color: var(--cd-accent-ink);
  background: var(--cd-accent);
}
.cd-link {
  font: inherit;
  font-size: 12px;
  color: var(--cd-accent);
  text-decoration: underline;
  background: none;
  border: 0;
  cursor: pointer;
}
.cd-link:focus-visible {
  outline: 2px solid var(--cd-accent);
  outline-offset: 2px;
}
.cd-clear {
  display: block;
  min-height: 36px;
  margin: 0 auto;
}
.cd-spin {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: cd-spin 0.8s linear infinite;
}
@keyframes cd-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Sukses ===== */
.cd-done {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 20px calc(24px + env(safe-area-inset-bottom, 0px));
}
.cd-done-in {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  text-align: center;
}
.cd-tick {
  width: 64px;
  height: 64px;
  fill: none;
  stroke: var(--cd-accent);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.cd-tick-c {
  stroke-dasharray: 151;
  stroke-dashoffset: 151;
  animation: cd-draw 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.cd-tick-p {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: cd-draw 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.5s forwards;
}
@keyframes cd-draw {
  to {
    stroke-dashoffset: 0;
  }
}
.cd-done-h {
  margin: 14px 0 4px;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  outline: none;
}
.cd-done-sub {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--cd-muted);
}
.cd-nomor-box {
  padding: 14px 12px 10px;
  margin-bottom: 14px;
  background: var(--cd-bg2);
  border: 1px solid var(--cd-line);
  border-radius: 14px;
}
.cd-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--cd-muted);
}
.cd-nomor {
  display: block;
  margin: 6px 0 4px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
  user-select: all;
}
.cd-done-dl {
  margin: 0 0 4px;
  display: grid;
  gap: 8px;
}
.cd-done-dl > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cd-line);
  font-size: 13px;
}
.cd-done-dl dt {
  color: var(--cd-muted);
}
.cd-done-dl dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.cd-done-dl .cd-done-total {
  font-size: 18px;
  font-weight: 800;
}

/* ===== Transisi ===== */
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
  .cd-tick-c,
  .cd-tick-p {
    animation: none;
    stroke-dashoffset: 0;
  }
  .cd-spin {
    animation: none;
  }
}

/* ===== Layar penuh landscape (tablet / PC): kiri daftar, kanan ringkasan atau form ===== */
@media (min-width: 900px) and (min-height: 500px) {
  .cd-wrap {
    background: transparent;
    backdrop-filter: none;
  }
  .cd-panel {
    width: 100%;
    box-shadow: none;
  }
  .cd-bar {
    padding: 12px 16px 12px 28px;
  }
  .cd-bar-title {
    font-size: 18px;
  }
  .cd-body {
    flex-direction: row;
  }
  .cd-left,
  .cd-body--form .cd-left {
    display: flex;
    flex: 1;
    min-width: 0;
  }
  .cd-right,
  .cd-body--form .cd-right {
    flex: 0 0 clamp(380px, 34vw, 480px);
    max-height: none;
    border-top: 0;
    border-left: 1px solid var(--cd-line);
  }
  .cd-right-scroll {
    padding: 24px 28px 0;
  }
  .cd-actions {
    padding: 14px 28px calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .cd-sum-h {
    display: block;
    margin: 0 0 14px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--cd-muted);
  }
  .cd-scroll-in {
    max-width: 900px;
    margin: 0 auto;
    padding: 8px 12px 24px;
  }
  .cd-warn {
    padding: 10px 28px;
  }
  .cd-item {
    grid-template-columns: 88px 1fr auto;
    gap: 16px;
    padding: 16px 16px;
  }
  .cd-img {
    width: 88px;
    height: 88px;
    border-radius: 12px;
  }
  .cd-name {
    font-size: 15px;
  }
  .cd-meta {
    font-size: 13px;
  }
  .cd-price {
    font-size: 15px;
  }
  .cd-step button {
    width: 44px;
    height: 44px;
  }
  .cd-step span {
    min-width: 32px;
    font-size: 15px;
  }
  .cd-qty-ro {
    font-size: 15px;
  }
  .cd-del {
    font-size: 12px;
    min-height: 44px;
  }
  .cd-cust-h {
    padding: 10px 16px;
    margin-top: 8px;
  }
  .cd-add-cust {
    margin: 18px 16px 4px;
  }
  .cd-total b {
    font-size: 22px;
  }
  .cd-total--jasa b {
    font-size: 17px;
  }
  .cd-note {
    font-size: 12px;
  }
  .cd-btn {
    min-height: 54px;
    font-size: 15px;
  }
  .cd-pair-row {
    min-height: 40px;
    font-size: 13px;
  }
}

/* ===== Tema Premium (dipicu dari route: kelas .cd--premium pada .cd-root) ===== */
.cd--premium {
  --cd-bg: #120a08;
  --cd-bg2: #0e0605;
  --cd-ink: #f3e8d2;
  --cd-muted: rgba(243, 232, 210, 0.6);
  --cd-line: rgba(216, 189, 132, 0.18);
  --cd-accent: #d8bd84;
  --cd-accent-hover: #e6cf98;
  --cd-accent-ink: #1a0d0b;
  --cd-price: #e6cf98;
  --cd-soft: rgba(216, 189, 132, 0.1);
  --cd-warn: #f0b062;
  --cd-warn-bg: rgba(239, 108, 0, 0.14);
  --cd-field: #1d0f0c;
  --cd-bad: #ff8a80;
}
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
}
.cd--premium .cd-bar-sub {
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(243, 232, 210, 0.6);
  opacity: 1;
}
.cd--premium .cd-x:focus-visible {
  outline-color: #e6cf98;
}
.cd--premium .cd-name {
  font-family: "Cormorant Variable", Georgia, serif;
  font-size: 17px;
  font-weight: 600;
}
.cd--premium .cd-done-h {
  font-family: "Cormorant Variable", Georgia, serif;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.cd--premium .cd-add-cust {
  border-color: rgba(216, 189, 132, 0.5);
}
.cd--premium .cd-step {
  border-color: rgba(216, 189, 132, 0.3);
}
.cd--premium .cd-total b {
  color: #e6cf98;
}
.cd--premium .cd-img {
  background: #241714;
}
.cd--premium .cd-img--cust {
  background: #241714;
}
.cd--premium .cd-btn--ghost:hover:not(:disabled) {
  color: #1a0d0b;
}
.cd--premium .cd-check input,
.cd--premium .cd-pair-row input {
  accent-color: #d8bd84;
}

@media (min-width: 900px) and (min-height: 500px) {
  .cd--premium .cd-wrap {
    background: transparent;
  }
  .cd--premium .cd-panel {
    border-left: 0;
  }
}
</style>
