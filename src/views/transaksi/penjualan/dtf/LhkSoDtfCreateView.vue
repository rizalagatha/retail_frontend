<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, markRaw, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { format } from "date-fns";
import SoPoSearchModal from "@/components/lookup/SoPoSearchModal.vue";
import axios from "axios";

// --- Interfaces ---
interface RawSpec {
  w: number;
  h: number;
  qty?: number; // <--- Tambahkan baris ini
}

interface SavedSpec {
  kode: string;
  specs: {
    w: number;
    h: number;
    luas: number;
    qtySistem: number;
    qtyTotal: number; // Hapus qtyCadangan dari sini
  }[];
}

interface SpecDetail {
  w: number;
  h: number;
  luas: number;
  qtySistem: number;
  qtyTotal: number; // Hapus qtyCadangan dari sini
  uploadedImageObj?: HTMLImageElement | null;
  isUploading?: boolean;
}

interface LhkItem {
  id: number;
  kode: string;
  nama: string;
  jumlah: number;
  jumlahSistem: number;
  panjang: number;
  buangan: number;
  luasSistem: number;
  jumlahTitik: number;
  totalTitik: number;
  luasRiil: number;
  reject: number;
  specs: SpecDetail[]; // <--- Ubah tipe array specs menjadi SpecDetail
  isStok?: boolean;
  isReprint?: boolean;
}

interface LhkApiResponseItem {
  lhk_nomor: string;
  tanggal: string;
  kode: string;
  nama: string;
  cab: string;
  jo_kode: string;
  depan: number | null;
  belakang: number | null;
  lengan: number | null;
  variasi: number | null;
  saku: number | null;
  jumlah: number | null;
  jumlahSistem: number | null;
  panjang: number | null;
  buangan: number | null;
  luas_sistem: number | null;
  reject: number;
  keterangan: string;
}

interface JenisOrder {
  kode: string;
  nama: string;
}

interface PreviewBox {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  isRotated: boolean;
  imageObj?: HTMLImageElement | null;
}

// --- State Utama ---
const router = useRouter();
const route = useRoute();
const toast = useToast();
const authStore = useAuthStore();
const uiStore = useUiStore();
const { markAsSaved } = useUnsavedChanges();

const items = ref<LhkItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const isSaveDialogVisible = ref(false);
const isCancelDialogVisible = ref(false);
const isCloseDialogVisible = ref(false);
const jenisOrderOptions = ref<JenisOrder[]>([]);
const isSoSearchVisible = ref(false);
const isPoSearchVisible = ref(false);
const isSpkSearchVisible = ref(false);
const activeRowIndex = ref(0);

// State Dialog Full Screen Preview
const isCanvasDialogOpen = ref(false);

const formHeader = reactive({
  lhkNomor: "",
  panjang: 0,
  buangan: 0,
  tanggal: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang || "",
  jenisOrder: null as JenisOrder | null,
});

const isEditMode = computed(() => !!route.query.nomorLhk);

const pageTitle = computed(() => (route.query.nomorLhk ? `Ubah LHK Jasa` : `Buat LHK Jasa`));

// --- Canvas & Interaction Logic ---
const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasDialogRef = ref<HTMLCanvasElement | null>(null);
const layoutPreview = ref<PreviewBox[]>([]);
const zoomScale = ref(0.4);
const isLayoutLoading = ref(false);
const calculatedPanjangSistem = ref(0);
const draggedIndex = ref<number | null>(null);
const dragOffset = { x: 0, y: 0 };
// --- State Auto-Scroll Edge ---
let autoScrollInterval: ReturnType<typeof setInterval> | null = null;
let lastDragEvent: MouseEvent | null = null;
let activeTargetCanvas: HTMLCanvasElement | null = null;

const CM_TO_PX = 10;

// --- State Konfirmasi Global ---
const dialogConfirm = reactive({
  show: false,
  title: "Konfirmasi",
  text: "",
  onConfirm: () => {},
});

const showConfirmation = (onConfirm: () => void, text: string) => {
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const closeConfirmDialog = () => {
  dialogConfirm.show = false;
};

// --- Fungsi Penanganan Upload (VERSI LOCAL PREVIEW - ANTI GAGAL) ---
const handleSpecFileUpload = async (
  event: Event,
  item: LhkItem,
  spec: SpecDetail,
  specIndex: number
) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  if (!item.kode) {
    toast.error("Pilih nomor SO terlebih dahulu.");
    return;
  }

  spec.isUploading = true;

  const localImageUrl = URL.createObjectURL(file);
  const img = new Image();

  // Buat kode spesifik per titik (SO-Index) misal: "K06.SD.2511.0064-1"
  const specKode = `${item.kode}-${specIndex + 1}`;

  img.onload = () => {
    spec.uploadedImageObj = markRaw(img);
    toast.success(`Desain Titik ${specIndex + 1} untuk ${item.kode} berhasil dimuat.`);

    if (layoutPreview.value.length > 0) {
      runAutoArrange();
    }
  };

  img.onerror = () => toast.error("Gagal membaca file gambar.");
  img.src = localImageUrl;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("nomorLhk", specKode); // Kirim nama unik ini ke Backend
  formData.append("cabang", formHeader.cabang);

  try {
    const res = await api.post(`/lhk-so-dtf-form/upload-ripping`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    if (res.data.success) console.log(`Gambar ${specKode} diamankan.`);
  } catch (error: unknown) {
    // [PERBAIKAN] Tambahkan unknown
    let msg = "Gagal menyimpan gambar ke server.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg); // [PERBAIKAN] Cukup kirim string
  } finally {
    spec.isUploading = false;
    target.value = "";
  }
};

// Fungsi untuk mentrigger input file dari tombol Vuetify
const triggerFileInput = (idString: string) => {
  const el = document.getElementById(`file-upload-${idString}`);
  if (el) el.click();
};

// --- Validasi & Trigger Modal Pencarian ---
const handleSearchKeydown = (type: "SO" | "PO" | "SPK", index: number) => {
  // Validasi: Cek apakah Jenis Pekerjaan sudah dipilih
  if (!formHeader.jenisOrder || !formHeader.jenisOrder.kode) {
    toast.warning("Pilih Jenis Pekerjaan terlebih dahulu.");
    return;
  }

  activeRowIndex.value = index;

  // Buka modal sesuai tombol yang ditekan
  if (type === "SO") {
    isSoSearchVisible.value = true;
  } else if (type === "PO") {
    isPoSearchVisible.value = true;
  } else if (type === "SPK") {
    isSpkSearchVisible.value = true;
  }
};

const RULER_SIZE = 25;
const MARGIN_CM = 2;

const drawCanvas = (targetCanvas: HTMLCanvasElement | null) => {
  if (!targetCanvas) return;
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  const scale = zoomScale.value * CM_TO_PX;
  const rollWidth = formHeader.cabang === "K02" ? 30 : 60;
  // Ubah 100 menjadi 20 atau 30 (sebagai batas minimal tampilan meja kerja saat kosong)
  const length = Math.max(formHeader.panjang || 0, calculatedPanjangSistem.value, 30);

  // Perbesar ukuran kanvas untuk memberi ruang pada penggaris
  targetCanvas.width = rollWidth * scale + RULER_SIZE;
  targetCanvas.height = length * scale + RULER_SIZE;

  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  // 1. Gambar Background Area Kerja Putih (Digeser)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(RULER_SIZE, RULER_SIZE, rollWidth * scale, length * scale);

  // 2. Gambar Background Penggaris (Abu-abu)
  ctx.fillStyle = "#e0e0e0";
  ctx.fillRect(0, 0, targetCanvas.width, RULER_SIZE); // Penggaris Atas
  ctx.fillRect(0, 0, RULER_SIZE, targetCanvas.height); // Penggaris Kiri

  // 3. Gambar Garis Penggaris (Ticks)
  ctx.fillStyle = "#333";
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;

  // --- Penggaris X (Atas - Lebar) ---
  ctx.textBaseline = "top";
  for (let i = 0; i <= rollWidth; i++) {
    const x = RULER_SIZE + i * scale;
    ctx.beginPath();
    // Tentukan interval angka berdasarkan zoom
    const isMajorTick = zoomScale.value < 0.4 ? i % 10 === 0 : i % 5 === 0;
    if (isMajorTick) {
      ctx.moveTo(x, RULER_SIZE - 15);
      ctx.lineTo(x, RULER_SIZE);
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(i.toString(), x, 2);
    } else {
      ctx.moveTo(x, RULER_SIZE - 5);
      ctx.lineTo(x, RULER_SIZE);
    }
    ctx.stroke();
  }

  // --- Penggaris Y (Kiri - Panjang) ---
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= length; i++) {
    const y = RULER_SIZE + i * scale;
    ctx.beginPath();

    const isMajorTick = zoomScale.value < 0.4 ? i % 20 === 0 : i % 10 === 0;

    if (isMajorTick) {
      ctx.moveTo(RULER_SIZE - 18, y);
      ctx.lineTo(RULER_SIZE, y);
      ctx.font = "bold 10px Arial";
      ctx.fillText(i.toString(), Math.floor(RULER_SIZE / 2), y);
    } else if (i % 5 === 0) {
      ctx.moveTo(RULER_SIZE - 8, y);
      ctx.lineTo(RULER_SIZE, y);
    } else {
      ctx.moveTo(RULER_SIZE - 4, y);
      ctx.lineTo(RULER_SIZE, y);
    }
    ctx.stroke();
  }

  // [BARU] 4. Gambar Garis Putus-putus Pembatas 2cm
  ctx.beginPath();
  ctx.setLineDash([5, 5]); // Efek putus-putus
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)"; // Hitam transparan
  ctx.lineWidth = 1;

  // Garis Kiri
  const leftMarginX = RULER_SIZE + MARGIN_CM * scale;
  ctx.moveTo(leftMarginX, RULER_SIZE);
  ctx.lineTo(leftMarginX, targetCanvas.height);

  // Garis Kanan
  const rightMarginX = RULER_SIZE + (rollWidth - MARGIN_CM) * scale;
  ctx.moveTo(rightMarginX, RULER_SIZE);
  ctx.lineTo(rightMarginX, targetCanvas.height);

  ctx.stroke();
  ctx.setLineDash([]); // Kembalikan ke garis solid untuk elemen lain

  // 4. Gambar Kotak Layout (Semuanya digeser + RULER_SIZE)
  layoutPreview.value.forEach((box, index) => {
    const bx = RULER_SIZE + box.x * scale;
    const by = RULER_SIZE + box.y * scale;
    const drawW = box.isRotated ? box.h * scale : box.w * scale;
    const drawH = box.isRotated ? box.w * scale : box.h * scale;

    if (box.imageObj) {
      ctx.save();
      if (box.isRotated) {
        ctx.translate(bx + drawW / 2, by + drawH / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(box.imageObj, -drawH / 2, -drawW / 2, drawH, drawW);
      } else {
        ctx.drawImage(box.imageObj, bx, by, drawW, drawH);
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.strokeRect(bx, by, drawW, drawH);
    } else {
      ctx.beginPath();
      ctx.rect(bx, by, drawW, drawH);
      ctx.fillStyle =
        draggedIndex.value === index ? "rgba(33, 150, 243, 0.4)" : "rgba(33, 150, 243, 0.15)";
      ctx.fill();
      ctx.strokeStyle = "#1976D2";
      ctx.lineWidth = 1;
      ctx.stroke();

      if (drawW > 20 && drawH > 10) {
        ctx.fillStyle = "#0D47A1";
        ctx.font = `bold ${Math.max(7 * zoomScale.value, 6)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(box.label, bx + drawW / 2, by + drawH / 2);
      }
    }
  });
};

// Watchers untuk redraw
watch(
  [layoutPreview, zoomScale, () => formHeader.panjang, calculatedPanjangSistem], // Tambahkan calculatedPanjangSistem
  () => {
    drawCanvas(canvasRef.value);
    if (isCanvasDialogOpen.value) drawCanvas(canvasDialogRef.value);
  },
  { deep: true }
);

watch(isCanvasDialogOpen, async (isOpen) => {
  if (isOpen) {
    // Tunggu sampai DOM dialog benar-benar selesai di-render oleh Vuetify
    await nextTick();
    // Beri sedikit jeda waktu (50ms) agar animasi transisi dialog selesai
    setTimeout(() => {
      drawCanvas(canvasDialogRef.value);
    }, 50);
  }
});

// Drag and Drop Logic
const recalculateCanvasHeight = () => {
  if (layoutPreview.value.length === 0) {
    calculatedPanjangSistem.value = 0;
    return;
  }
  // Cari titik koordinat Y terdalam (paling bawah) dari semua kotak
  const maxHeight = layoutPreview.value.reduce((max, box) => {
    const bottom = box.y + (box.isRotated ? box.w : box.h);
    return Math.max(max, bottom);
  }, 0);

  // Setel ulang panjang kanvas sesuai kotak paling bawah
  calculatedPanjangSistem.value = Math.ceil(maxHeight);
};

const startDrag = (e: MouseEvent, targetCanvas: HTMLCanvasElement | null) => {
  if (!targetCanvas) return;
  const rect = targetCanvas.getBoundingClientRect();
  const scale = zoomScale.value * CM_TO_PX;
  const mouseX = (e.clientX - rect.left - RULER_SIZE) / scale;
  const mouseY = (e.clientY - rect.top - RULER_SIZE) / scale;
  if (mouseX < 0 || mouseY < 0) return;

  // Cek dari array paling belakang (yang posisinya di atas layar/z-index tertinggi)
  for (let i = layoutPreview.value.length - 1; i >= 0; i--) {
    const box = layoutPreview.value[i];

    // HITUNG DIMENSI AKTUAL
    const hitW = box.isRotated ? box.h : box.w;
    const hitH = box.isRotated ? box.w : box.h;

    // Cek apakah kursor berada di dalam dimensi aktual
    if (mouseX >= box.x && mouseX <= box.x + hitW && mouseY >= box.y && mouseY <= box.y + hitH) {
      draggedIndex.value = i;
      dragOffset.x = mouseX - box.x;
      dragOffset.y = mouseY - box.y;

      // --- INISIALISASI AUTO-SCROLL ---
      activeTargetCanvas = targetCanvas;
      lastDragEvent = e;

      const moveHandler = (moveEv: MouseEvent) => {
        lastDragEvent = moveEv; // Simpan posisi mouse terbaru
        onDrag(moveEv, targetCanvas);
      };

      const stopHandler = () => {
        draggedIndex.value = null;
        window.removeEventListener("mousemove", moveHandler);
        window.removeEventListener("mouseup", stopHandler);

        // Matikan mesin scroll saat mouse dilepas
        if (autoScrollInterval) {
          clearInterval(autoScrollInterval);
          autoScrollInterval = null;
        }
        lastDragEvent = null;
        activeTargetCanvas = null;
      };

      window.addEventListener("mousemove", moveHandler);
      window.addEventListener("mouseup", stopHandler);

      // --- MULAI MESIN AUTO-SCROLL (Berjalan 60x per detik) ---
      if (autoScrollInterval) clearInterval(autoScrollInterval);
      autoScrollInterval = setInterval(() => {
        if (!lastDragEvent || !activeTargetCanvas || draggedIndex.value === null) return;

        // Cari elemen pembungkus (viewport) yang bisa di-scroll
        const viewport = activeTargetCanvas.closest(".canvas-viewport") as HTMLElement;
        if (!viewport) return;

        const vRect = viewport.getBoundingClientRect();
        const edgeThreshold = 60; // Jarak sensitivitas sensor (px) dari tepi layar
        const scrollSpeed = 20; // Kecepatan meluncur
        let isScrolled = false;

        // Sensor Bawah & Atas (Sumbu Y)
        if (lastDragEvent.clientY > vRect.bottom - edgeThreshold) {
          viewport.scrollTop += scrollSpeed;
          isScrolled = true;
        } else if (lastDragEvent.clientY < vRect.top + edgeThreshold) {
          viewport.scrollTop -= scrollSpeed;
          isScrolled = true;
        }

        // Sensor Kanan & Kiri (Sumbu X) - Opsional jika zoom besar
        if (lastDragEvent.clientX > vRect.right - edgeThreshold) {
          viewport.scrollLeft += scrollSpeed;
          isScrolled = true;
        } else if (lastDragEvent.clientX < vRect.left + edgeThreshold) {
          viewport.scrollLeft -= scrollSpeed;
          isScrolled = true;
        }

        // KUNCI PENTING: Jika layar di-scroll, paksa gambar mengejar kursor
        // meskipun mouse Anda sedang diam tak bergerak!
        if (isScrolled) {
          onDrag(lastDragEvent, activeTargetCanvas);
        }
      }, 16);
      // ---------------------------------------------------------

      break;
    }
  }
};

const onDrag = (e: MouseEvent, targetCanvas: HTMLCanvasElement) => {
  if (draggedIndex.value === null) return;

  // Gunakan requestAnimationFrame untuk pergerakan 60fps yang sangat mulus
  requestAnimationFrame(() => {
    if (draggedIndex.value === null) return;
    const rect = targetCanvas.getBoundingClientRect();
    const scale = zoomScale.value * CM_TO_PX;

    // Posisi mouse dikurangi area penggaris
    const mouseX = (e.clientX - rect.left - RULER_SIZE) / scale;
    const mouseY = (e.clientY - rect.top - RULER_SIZE) / scale;

    const box = layoutPreview.value[draggedIndex.value];

    // Dimensi aktual box yang sedang diseret
    const hitW = box.isRotated ? box.h : box.w;
    const hitH = box.isRotated ? box.w : box.h;

    // Batas kanvas
    const rollWidth = formHeader.cabang === "K02" ? 30 : 60;
    const minX = MARGIN_CM; // Batas Kiri (2 cm)
    const maxRightEdge = rollWidth - MARGIN_CM; // Batas Kanan

    // Koordinat tujuan (bebas sebelum terkena magnet)
    let targetX = mouseX - dragOffset.x;
    let targetY = mouseY - dragOffset.y;

    // --- SISTEM MAGNET (SNAP TO OBJECTS) ---
    const SNAP_GAP = 0.5; // Jarak margin antar gambar (Ubah ke 0.05 jika memang butuh 0.5 mm)
    const SNAP_THRESHOLD = 0.8; // Jarak tarikan magnet (Seberapa dekat sebelum dia lengket)

    layoutPreview.value.forEach((otherBox, i) => {
      if (i === draggedIndex.value) return;

      const otherW = otherBox.isRotated ? otherBox.h : otherBox.w;
      const otherH = otherBox.isRotated ? otherBox.w : otherBox.h;

      // Magnet Sumbu X (Kiri/Kanan)
      // Aktif jika gambar saling sejajar/berpapasan secara vertikal
      const isYOverlap = targetY < otherBox.y + otherH && targetY + hitH > otherBox.y;
      if (isYOverlap) {
        // Coba Snap/Lengket ke Kanan objek lain
        if (Math.abs(targetX - (otherBox.x + otherW + SNAP_GAP)) < SNAP_THRESHOLD) {
          targetX = otherBox.x + otherW + SNAP_GAP;
        }
        // Coba Snap/Lengket ke Kiri objek lain
        else if (Math.abs(targetX + hitW - (otherBox.x - SNAP_GAP)) < SNAP_THRESHOLD) {
          targetX = otherBox.x - hitW - SNAP_GAP;
        }
      }

      // Magnet Sumbu Y (Atas/Bawah)
      // Aktif jika gambar saling sejajar/berpapasan secara horizontal
      const isXOverlap = targetX < otherBox.x + otherW && targetX + hitW > otherBox.x;
      if (isXOverlap) {
        // Coba Snap/Lengket ke Bawah objek lain
        if (Math.abs(targetY - (otherBox.y + otherH + SNAP_GAP)) < SNAP_THRESHOLD) {
          targetY = otherBox.y + otherH + SNAP_GAP;
        }
        // Coba Snap/Lengket ke Atas objek lain
        else if (Math.abs(targetY + hitH - (otherBox.y - SNAP_GAP)) < SNAP_THRESHOLD) {
          targetY = otherBox.y - hitH - SNAP_GAP;
        }
      }
    });

    // --- Magnet ke Batas Margin Kertas ---
    if (Math.abs(targetX - minX) < SNAP_THRESHOLD) targetX = minX;
    if (Math.abs(targetX + hitW - maxRightEdge) < SNAP_THRESHOLD) targetX = maxRightEdge - hitW;
    if (Math.abs(targetY - 0) < SNAP_THRESHOLD) targetY = 0;

    // Update posisi final (Dijaga agar mutlak tidak tembus garis margin)
    box.x = Math.max(minX, Math.min(targetX, maxRightEdge - hitW));
    box.y = Math.max(0, targetY);

    // Hitung ulang panjang penggaris jika di-drag ke paling bawah
    recalculateCanvasHeight();

    // Gambar ulang
    drawCanvas(targetCanvas);
  });
};

const handleDoubleClick = (e: MouseEvent, targetCanvas: HTMLCanvasElement | null) => {
  if (!targetCanvas) return;
  const rect = targetCanvas.getBoundingClientRect();
  const scale = zoomScale.value * CM_TO_PX;
  const mouseX = (e.clientX - rect.left - RULER_SIZE) / scale;
  const mouseY = (e.clientY - rect.top - RULER_SIZE) / scale;
  if (mouseX < 0 || mouseY < 0) return;

  for (let i = layoutPreview.value.length - 1; i >= 0; i--) {
    const box = layoutPreview.value[i];

    // Dimensi aktual untuk deteksi double click
    const hitW = box.isRotated ? box.h : box.w;
    const hitH = box.isRotated ? box.w : box.h;

    if (mouseX >= box.x && mouseX <= box.x + hitW && mouseY >= box.y && mouseY <= box.y + hitH) {
      box.isRotated = !box.isRotated; // Lakukan rotasi

      // Dimensi baru SETELAH rotasi
      const newHitW = box.isRotated ? box.h : box.w;

      // Ukuran roll asli (30 cm atau 60 cm)
      const rollWidth = formHeader.cabang === "K02" ? 30 : 60;

      // Batas maksimal ke kanan (Lebar - 2 cm)
      const maxRight = rollWidth - MARGIN_CM;
      // Batas maksimal ke kiri (2 cm)
      const minLeft = MARGIN_CM;

      // 1. Jika menabrak margin kanan, dorong paksa ke kiri
      if (box.x + newHitW > maxRight) {
        box.x = maxRight - newHitW;
      }

      // 2. Pastikan setelah didorong ke kiri, tidak melewati batas margin kiri
      if (box.x < minLeft) {
        box.x = minLeft;
      }

      recalculateCanvasHeight();

      drawCanvas(targetCanvas); // Render langsung hasil rotasinya
      toast.info("Item diputar 90°");
      break;
    }
  }
};

// --- Auto Arrange Algorithm (Skyline / Tetris Packing Version) ---
const runAutoArrange = () => {
  const validItems = items.value.filter((i) => i.kode && (i.jumlah > 0 || i.isStok));

  if (validItems.length === 0 || !formHeader.jenisOrder) {
    return toast.warning("Isi jumlah kaos pada tabel terlebih dahulu.");
  }

  isLayoutLoading.value = true;
  const rollWidth = formHeader.cabang === "K02" ? 30 : 60;
  const padding = 0.5;

  // 1. Tentukan target jumlah dan ukuran spesifikasi dari tabel
  const targetSpecs: Record<
    string,
    { w: number; h: number; qty: number; imageObj: HTMLImageElement | null }
  > = {};

  validItems.forEach((item) => {
    item.specs.forEach((s, sIndex) => {
      const label = `${item.kode.split(".").pop()}-${sIndex + 1}`;
      targetSpecs[label] = {
        w: s.w + padding,
        h: s.h + padding,
        qty: Number(s.qtyTotal),
        // [PERBAIKAN] Tambahkan fallback || null agar tidak undefined
        imageObj: s.uploadedImageObj || null,
      };
    });
  });

  // 2. Pertahankan layout kotak yang sudah ada sebelumnya (Jangan di-reset)
  const preservedLayout: PreviewBox[] = [];
  const currentCounts: Record<string, number> = {};

  layoutPreview.value.forEach((box) => {
    const label = box.label;
    if (!currentCounts[label]) currentCounts[label] = 0;

    if (targetSpecs[label] && currentCounts[label] < targetSpecs[label].qty) {
      if (!box.imageObj && targetSpecs[label].imageObj) {
        box.imageObj = targetSpecs[label].imageObj;
      }
      preservedLayout.push(box);
      currentCounts[label]++;
    }
  });

  // 3. Kumpulkan kekurangan kotak
  const newBoxes: { w: number; h: number; label: string; imageObj?: HTMLImageElement | null }[] =
    [];

  for (const [label, spec] of Object.entries(targetSpecs)) {
    const existingCount = currentCounts[label] || 0;
    const shortage = spec.qty - existingCount;

    for (let i = 0; i < shortage; i++) {
      newBoxes.push({
        w: spec.w,
        h: spec.h,
        label: label,
        imageObj: spec.imageObj,
      });
    }
  }

  if (newBoxes.length === 0) {
    layoutPreview.value = preservedLayout;
    recalculateCanvasHeight();
    isLayoutLoading.value = false;
    toast.success("Layout disesuaikan (Kelebihan item dihapus).");
    return;
  }

  // =========================================================================
  // --- [ALGORITMA BARU: TETRIS / SKYLINE PACKING] ---
  // =========================================================================

  // Mengurutkan kotak baru berdasarkan tingginya (tinggi ke pendek)
  // Ini kunci agar packing lebih rapat dan menyerupai balok bangunan.
  newBoxes.sort((a, b) => {
    if (b.h !== a.h) return b.h - a.h;
    return b.w - a.w;
  });

  const minX = MARGIN_CM; // Margin Kiri (2 cm)
  const maxX = rollWidth - MARGIN_CM; // Margin Kanan
  const maxUsableWidth = maxX - minX; // Area bersih yang bisa di-print
  const step = 0.1; // Resolusi Peta (0.1 cm = 1 mm) presisi sangat tinggi

  // Buat array yang bertindak sebagai sensor kedalaman (Skyline)
  const skylineLength = Math.round(rollWidth / step) + 1;
  const skyline = new Array(skylineLength).fill(0);

  const startIdx = Math.round(minX / step);
  const endIdx = Math.round(maxX / step);

  // Jika ada layout lama (di-lock), gambarkan ke "peta skyline" agar gambar baru
  // bisa mengenali mana area yang kosong di samping-samping gambar lama.
  if (preservedLayout.length > 0) {
    preservedLayout.forEach((box) => {
      const bx = box.x;
      const by = box.y;
      const bw = box.isRotated ? box.h : box.w;
      const bh = box.isRotated ? box.w : box.h;

      const boxStartIdx = Math.max(startIdx, Math.round(bx / step));
      // Pastikan ada jarak aman (padding) di samping dan bawah kotak lama
      const boxEndIdx = Math.min(endIdx, Math.round((bx + bw + padding) / step));

      for (let i = boxStartIdx; i <= boxEndIdx; i++) {
        if (i < skylineLength && by + bh + padding > skyline[i]) {
          skyline[i] = by + bh + padding;
        }
      }
    });
  }

  let maxId = preservedLayout.length > 0 ? Math.max(...preservedLayout.map((b) => b.id)) : -1;
  const addedLayout: PreviewBox[] = [];

  newBoxes.forEach((box) => {
    maxId++;
    let bw = box.w; // Lebar (plus padding)
    let bh = box.h; // Tinggi (plus padding)
    let isRotated = false;

    // --- [ANTI-CRASH] CEK OVERSIZE (GAMBAR LEBIH LEBAR DARI KERTAS) ---
    if (bw > maxUsableWidth) {
      // Cek apakah kalau diputar (dirotasi 90 derajat) dia bakal muat?
      if (bh <= maxUsableWidth) {
        // Balik ukurannya secara sistem
        bw = box.h;
        bh = box.w;
        isRotated = true; // Tandai agar canvas tahu ini harus digambar terbalik
      }
    }

    let bestX = minX;
    let bestY = Infinity;

    const boxWidthSteps = Math.round(bw / step);

    // Lempar kotak dari atas, cari "Lembah" terendah yang lebarnya cukup
    for (let x = startIdx; x <= endIdx - boxWidthSteps; x++) {
      let currentMaxY = 0;
      for (let w = 0; w < boxWidthSteps; w++) {
        if (skyline[x + w] > currentMaxY) {
          currentMaxY = skyline[x + w];
        }
      }

      // Jika area ini lebih rendah (kosong) daripada sebelumnya, pilih!
      if (currentMaxY < bestY) {
        bestY = currentMaxY;
        bestX = x * step;
      }
    }

    // --- [SAFETY NET] ---
    // Jika masih Infinity (artinya ukuran box super ekstrim, melebihi kertas
    // meskipun sudah diputar). Cegah nilai Infinity masuk ke UI Canvas!
    if (bestY === Infinity) {
      bestX = minX;
      bestY = Math.max(...skyline); // Taruh paksa di titik paling bawah
      if (bestY === -Infinity || isNaN(bestY)) bestY = 0; // Antisipasi skyline kosong
    }

    // Tanamkan kotak di posisi paling dalam (ter-Tetris)
    addedLayout.push({
      id: maxId,
      x: bestX,
      y: bestY,
      w: box.w - padding, // Selalu kembalikan ukuran asli TANPA padding
      h: box.h - padding,
      label: box.label,
      isRotated: isRotated,
      imageObj: box.imageObj,
    });

    // Update peta sensor skyline dengan ketinggian kotak yang baru
    const placeStartIdx = Math.round(bestX / step);
    for (let w = 0; w < boxWidthSteps; w++) {
      if (placeStartIdx + w < skylineLength) {
        skyline[placeStartIdx + w] = bestY + bh;
      }
    }
  });

  layoutPreview.value = [...preservedLayout, ...addedLayout];

  recalculateCanvasHeight();
  isLayoutLoading.value = false;
  toast.success(`Layout ditambahkan dengan efisiensi maksimal.`);
};

// --- Zoom Controls ---
const zoomIn = () => {
  if (zoomScale.value < 1.5) zoomScale.value += 0.1;
};
const zoomOut = () => {
  if (zoomScale.value > 0.1) zoomScale.value -= 0.1;
};

// --- Mouse Wheel Zoom & Scroll ---
const handleWheelZoom = (e: WheelEvent) => {
  if (e.ctrlKey) {
    // Zoom In / Out jika menahan Ctrl
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  } else {
    // Scroll atas-bawah biasa jika tanpa Ctrl
    const viewport = (e.target as HTMLElement).closest(".canvas-viewport");
    if (viewport) {
      viewport.scrollTop += e.deltaY;
    }
  }
};

// --- Standard Logic ---
const addNewRowIfNeeded = () => {
  const last = items.value[items.value.length - 1];
  if (!last || last.kode) {
    items.value.push({
      id: Date.now() + Math.random(),
      kode: "",
      nama: "",
      jumlah: 0,
      jumlahSistem: 0,
      jumlahTitik: 0,
      totalTitik: 0,
      panjang: 0,
      buangan: 0,
      luasSistem: 0,
      luasRiil: 0,
      reject: 0,
      specs: [],
      isStok: false,
      isReprint: false,
    });
  }
};

// --- Standard Logic ---
const loadLhkData = async () => {
  if (!route.query.nomorLhk) {
    items.value = [];
    layoutPreview.value = [];
    calculatedPanjangSistem.value = 0;
    zoomScale.value = 0.4;
    formHeader.panjang = 0;
    formHeader.buangan = 0;
    formHeader.jenisOrder = null;
    addNewRowIfNeeded();
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.get<LhkApiResponseItem[]>(
      `/lhk-so-dtf-form/detail/${route.query.nomorLhk}`
    );
    const data = response.data;

    if (data.length > 0) {
      // --- 1. Set Header Form ---
      formHeader.lhkNomor = data[0].lhk_nomor;
      formHeader.panjang = data[0].panjang || 0;
      formHeader.buangan = data[0].buangan || 0;
      formHeader.tanggal = format(new Date(data[0].tanggal), "yyyy-MM-dd");
      formHeader.cabang = data[0].cab;

      const matchedJo = jenisOrderOptions.value.find((j) => j.kode === data[0].jo_kode);
      if (matchedJo) formHeader.jenisOrder = matchedJo;

      // --- 2. Petakan Item Tabel ---
      items.value = data.map(
        (item, index): LhkItem => ({
          id: Date.now() + index,
          kode: item.kode,
          nama: item.nama,
          jumlah: item.jumlah ?? 0,
          jumlahSistem: item.jumlahSistem ?? 0,
          panjang: item.panjang ?? 0,
          buangan: item.buangan ?? 0,
          luasSistem: item.luas_sistem ?? 0,
          luasRiil: 0,
          reject: item.reject ?? 0,
          jumlahTitik: item.depan ?? 0, // Diambil dari kolom 'depan'
          totalTitik: item.belakang ?? 0, // Diambil dari kolom 'belakang'
          specs: [],
        })
      );

      // --- 3. Muat Spesifikasi & Gambar Secara Asinkron ---
      const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const cleanedBase = baseURL.replace(/\/api\/?$/, "");

      // [PERBAIKAN 1] Gunakan Promise.all agar menunggu data ukuran selesai ditarik semua
      const specPromises = items.value.map((item) => {
        if (item.kode) {
          return api.get(`/lhk-so-dtf-form/specs/${item.kode}`).then((res) => {
            const rawSpecs = res.data.specs || [];

            // Map specs
            item.specs = rawSpecs.map(
              (s: RawSpec): SpecDetail => ({
                w: s.w,
                h: s.h,
                luas: s.w * s.h,
                qtySistem: item.jumlah,
                qtyTotal: item.jumlah,
                uploadedImageObj: null,
                isUploading: false,
              })
            );

            item.jumlahTitik = item.specs.length;
            calculateRowTotal(item);

            item.specs.forEach((spec, sIndex) => {
              const specKode = `${item.kode}-${sIndex + 1}`;
              const sanitizedKode = specKode.replace(/\./g, "_");

              const img = new Image();
              img.onload = () => {
                spec.uploadedImageObj = markRaw(img);

                // Tempelkan gambar ke kotak kanvas yang sesuai
                if (layoutPreview.value.length > 0) {
                  layoutPreview.value.forEach((box) => {
                    const expectedLabel = `${item.kode.split(".").pop()}-${sIndex + 1}`;
                    if (box.label === expectedLabel) {
                      box.imageObj = spec.uploadedImageObj;
                    }
                  });
                  drawCanvas(canvasRef.value);
                }
              };
              img.src = `${cleanedBase}/images/lhk-dtf/${
                formHeader.cabang
              }/${sanitizedKode}.jpg?t=${Date.now()}`;
            });
          });
        }
        return Promise.resolve();
      });

      // 🔥 WAJIB TUNGGU SEMUA SPEK SELESAI DIMUAT
      await Promise.all(specPromises);

      // --- 4. Bongkar Layout JSON (Koordinat Canvas) ---
      // [PERBAIKAN 2] Cari baris yang benar-benar punya teks JSON "layout"
      const rowWithJson = data.find((d) => d.keterangan && d.keterangan.includes('"layout"'));

      if (rowWithJson) {
        try {
          const parsedData = JSON.parse(rowWithJson.keterangan);

          // 1. Pulihkan Layout Canvas
          const savedLayout = parsedData.layout || [];
          if (Array.isArray(savedLayout)) {
            layoutPreview.value = savedLayout.map((box: PreviewBox, idx: number) => ({
              id: box.id ?? idx,
              x: box.x,
              y: box.y,
              w: box.w,
              h: box.h,
              label: box.label,
              isRotated: box.isRotated,
              imageObj: null, // ImageObj akan disuntik dari img.onload di atas
            }));
            const maxHeight = layoutPreview.value.reduce((max: number, box: PreviewBox) => {
              return Math.max(max, box.y + (box.isRotated ? box.w : box.h));
            }, 0);
            calculatedPanjangSistem.value = Math.ceil(maxHeight);

            // Pancing gambar ulang sesaat setelah layout siap
            setTimeout(() => drawCanvas(canvasRef.value), 100);
          }

          // 2. Pulihkan Cadangan dari SpecsData
          const savedSpecs: SavedSpec[] = parsedData.specsData || [];

          if (savedSpecs.length > 0) {
            items.value.forEach((item) => {
              const matchedSpec = savedSpecs.find((s: SavedSpec) => s.kode === item.kode);

              if (matchedSpec && item.specs.length > 0) {
                item.specs.forEach((s, index) => {
                  if (matchedSpec.specs[index]) {
                    s.qtyTotal = matchedSpec.specs[index].qtyTotal || s.qtySistem;
                  }
                });
                calculateRowTotal(item);
              }
            });
          }
        } catch (e) {
          console.warn("Gagal parse JSON layout/specs atau data korup:", e);
        }
      }

      addNewRowIfNeeded();
    }
  } catch (err) {
    toast.error("Gagal memuat data LHK.");
    console.error(err);
  } finally {
    isLoading.value = false;
    markAsSaved();
  }
};

const onSoPoSelected = async (selectedItem: { kode: string; nama: string; sudah_lhk?: number }) => {
  // === [BARU] CEK DUPLIKAT BARIS ===
  // Pastikan nomor SO yang dipilih belum ada di baris lain
  const isDuplicate = items.value.some(
    (item, index) => item.kode === selectedItem.kode && index !== activeRowIndex.value
  );
  if (isDuplicate) {
    isSoSearchVisible.value = false;
    isPoSearchVisible.value = false;
    isSpkSearchVisible.value = false;
    return toast.warning(`Nomor ${selectedItem.kode} sudah ada di daftar. Tidak boleh dobel!`);
  }
  // =================================

  const activeItem = items.value[activeRowIndex.value];
  try {
    const res = await api.get(`/lhk-so-dtf-form/specs/${selectedItem.kode}`);

    // Ambil nilai dari API
    const jmlKaosSistem = res.data.totalKaos || 0;
    const jmlTitikSistem = res.data.specs ? res.data.specs.length : 0;
    const rawSpecs: RawSpec[] = res.data.specs || [];

    // [PERBAIKAN] Mapping format spesifikasi baru (Hargai qty bawaan dari stok)
    const mappedSpecs: SpecDetail[] = rawSpecs.map((s: RawSpec) => ({
      w: s.w,
      h: s.h,
      luas: s.w * s.h,
      qtySistem: s.qty || jmlKaosSistem,
      qtyTotal: s.qty || jmlKaosSistem,
      uploadedImageObj: null,
      isUploading: false,
    }));

    Object.assign(activeItem, {
      kode: selectedItem.kode,
      nama: selectedItem.nama,
      jumlahSistem: jmlKaosSistem, // Ini nilai asli order (tetap dipertahankan)

      // [PERBAIKAN] Defaultkan Kaos OK menjadi 0
      jumlah: 0,

      jumlahTitik: res.data.isStok ? mappedSpecs.length : jmlTitikSistem,
      totalTitik: res.data.totalTitikSistem || jmlKaosSistem * jmlTitikSistem,
      luasSistem: res.data.totalLuasSistem || 0,
      specs: mappedSpecs,
      isStok: res.data.isStok || false,
      isReprint: selectedItem.sudah_lhk === 1,
    });

    calculateRowTotal(activeItem);
    addNewRowIfNeeded();
    isSoSearchVisible.value = false;
    isPoSearchVisible.value = false;
    isSpkSearchVisible.value = false;
  } catch (err: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal load spek.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
  }
};

// --- FUNGSI BARU: SCAN QR CODE / INPUT MANUAL ---
const loadSoDataByCode = async (kodeScan: string, index: number) => {
  if (!kodeScan || kodeScan.trim() === "") return;
  const kodeClean = kodeScan.trim().toUpperCase();

  // 1. Cek apakah Jenis Pekerjaan sudah dipilih
  if (!formHeader.jenisOrder || !formHeader.jenisOrder.kode) {
    toast.warning("Pilih Jenis Pekerjaan terlebih dahulu sebelum scan.");
    // Kosongkan input agar tidak nyangkut
    items.value[index].kode = "";
    return;
  }

  // 2. Cek apakah kode sudah ada di baris lain (cegah dobel)
  const isDuplicate = items.value.some((item, idx) => item.kode === kodeClean && idx !== index);
  if (isDuplicate) {
    toast.warning(`Nomor ${kodeClean} sudah ada di daftar. Tidak boleh dobel!`);
    items.value[index].kode = ""; // Reset input
    return;
  }

  const activeItem = items.value[index];

  // Set status loading sementara di baris tersebut
  activeItem.nama = "Mencari data...";

  try {
    // 3. Tembak API untuk mengambil detail SO DTF
    // Kita gunakan endpoint specs karena berisi data lengkap (stok, titik, dll)
    const res = await api.get(`/lhk-so-dtf-form/specs/${kodeClean}`);

    if (!res.data || (!res.data.specs && !res.data.isStok)) {
      throw new Error("Data tidak lengkap atau tidak ditemukan.");
    }

    const jmlKaosSistem = res.data.totalKaos || 0;
    const jmlTitikSistem = res.data.specs ? res.data.specs.length : 0;
    const rawSpecs: RawSpec[] = res.data.specs || [];

    const mappedSpecs: SpecDetail[] = rawSpecs.map((s: RawSpec) => ({
      w: s.w,
      h: s.h,
      luas: s.w * s.h,
      qtySistem: s.qty || jmlKaosSistem,
      qtyTotal: s.qty || jmlKaosSistem,
      uploadedImageObj: null,
      isUploading: false,
    }));

    Object.assign(activeItem, {
      kode: kodeClean,
      // Jika dari QR, nama SO biasanya tidak terkirim di endpoint specs.
      // Beri nama default atau ambil dari res.data.nama jika backend mendukungnya
      nama: res.data.nama || `SO DTF: ${kodeClean}`,
      jumlahSistem: jmlKaosSistem,
      jumlah: 0,
      jumlahTitik: res.data.isStok ? mappedSpecs.length : jmlTitikSistem,
      totalTitik: res.data.totalTitikSistem || jmlKaosSistem * jmlTitikSistem,
      luasSistem: res.data.totalLuasSistem || 0,
      specs: mappedSpecs,
      isStok: res.data.isStok || false,
      isReprint: res.data.sudah_lhk === 1, // Atau cek flag yang relevan
    });

    calculateRowTotal(activeItem);
    addNewRowIfNeeded();
    toast.success(`${kodeClean} berhasil ditambahkan.`);

    // Fokuskan kursor ke baris baru agar user bisa langsung scan lagi
    nextTick(() => {
      const nextIndex = index + 1;
      const nextInput = document.getElementById(`input-kode-${nextIndex}`);
      if (nextInput) nextInput.focus();
    });
  } catch (err: unknown) {
    let msg = `Gagal menemukan SO DTF ${kodeClean}.`;
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);

    // Reset baris jika gagal
    activeItem.kode = "";
    activeItem.nama = "";
  }
};

const calculateRowTotal = (item: LhkItem) => {
  if (item.specs && item.specs.length > 0) {
    item.specs.forEach((s: SpecDetail) => {
      // Gunakan SpecDetail
      if (!item.isStok) {
        s.qtySistem = Number(item.jumlahSistem) || 0;
        s.qtyTotal = s.qtySistem;
      }
    });
    item.totalTitik = item.specs.reduce((sum: number, s: SpecDetail) => sum + s.qtyTotal, 0);
    item.luasSistem = item.specs.reduce(
      (sum: number, s: SpecDetail) => sum + s.luas * s.qtyTotal,
      0
    );
  } else {
    item.totalTitik = 0;
    item.luasSistem = 0;
  }
};

// [BARU] Fungsi untuk menghapus titik cetak spesifik (Berguna saat Reprint)
const removeSpec = (item: LhkItem, specIndex: number) => {
  showConfirmation(() => {
    item.specs.splice(specIndex, 1);
    item.jumlahTitik = item.specs.length;
    calculateRowTotal(item);
    toast.info(`Titik ke-${specIndex + 1} berhasil dihapus dari daftar.`);
    uiStore.setUnsavedChanges(true);
    closeConfirmDialog();
  }, "Hapus titik cetak ini dari daftar? (Gunakan ini jika hanya sebagian gambar yang di-reprint)");
};

const removeRow = (id: number) => {
  // Filter item yang tidak sesuai ID
  items.value = items.value.filter((item) => item.id !== id);

  // Jika setelah dihapus jadi kosong, tambahkan baris baru otomatis & bersihkan kanvas
  if (items.value.length === 0) {
    layoutPreview.value = []; // [PERBAIKAN] Bersihkan kanvas
    calculatedPanjangSistem.value = 0;
    formHeader.panjang = 0;

    addNewRowIfNeeded();
  }

  // Set status ada perubahan jika dalam mode edit
  if (isEditMode.value) {
    uiStore.setUnsavedChanges(true);
  }
};

// --- Konfirmasi Simpan ---
const confirmSave = () => {
  // 1. Validasi minimal satu item terisi
  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) {
    return toast.warning("Isi minimal satu item sebelum menyimpan!");
  }

  // 2. Validasi input Panjang (wajib dalam cm)
  if (isShowMeasurement.value) {
    // Cek jika kosong atau 0
    if (!formHeader.panjang || formHeader.panjang <= 0) {
      return toast.warning("Ukuran Panjang pemakaian harus diisi!");
    }

    // Cek jika angka terlalu kecil (indikasi salah input meter vs centimeter)
    // Angka 10 di sini adalah batas minimal (10 cm). Anda bisa menyesuaikannya.
    if (formHeader.panjang < 10) {
      return toast.error(
        "Angka terlalu kecil! Pastikan Anda mengisi dalam satuan Sentimeter (cm), bukan Meter."
      );
    }
  }

  // Jika semua lolos, tampilkan dialog konfirmasi
  isSaveDialogVisible.value = true;
};

// --- Konfirmasi Batal ---
const confirmCancel = () => {
  isCancelDialogVisible.value = true;
};
const executeCancel = () => {
  isCancelDialogVisible.value = false;
  loadLhkData(); // Fungsi loadLhkData bawaan Anda (mereset ke data awal)

  // [PERBAIKAN] Kembalikan scroll canvas ke paling atas setelah dibatalkan
  nextTick(() => {
    const viewports = document.querySelectorAll(".canvas-viewport");
    viewports.forEach((vp) => {
      (vp as HTMLElement).scrollTop = 0;
      (vp as HTMLElement).scrollLeft = 0;
    });
    toast.info("Perubahan dibatalkan. Layout dikembalikan ke semula.");
  });
};

// --- Konfirmasi Tutup ---
const confirmClose = () => {
  isCloseDialogVisible.value = true;
};
const executeClose = () => {
  isCloseDialogVisible.value = false;
  router.push("/transaksi/penjualan/dtf/lhk-so-dtf");
};

const save = async () => {
  const validItems = items.value.filter((i) => i.kode);
  if (validItems.length === 0) return toast.error("Isi minimal satu item!");
  isSaving.value = true;
  try {
    // Siapkan data layout
    const layoutPayload = layoutPreview.value.map((box) => ({
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      label: box.label,
      isRotated: box.isRotated,
    }));

    // [BARU] Siapkan rincian spek (cadangan) untuk disimpan
    const specsPayload = validItems.map((item) => ({
      kode: item.kode,
      specs: item.specs.map((s) => ({
        w: s.w,
        h: s.h,
        luas: s.luas,
        qtySistem: s.qtySistem,
        qtyTotal: s.qtyTotal,
      })),
    }));

    await api.post("/lhk-so-dtf-form", {
      ...formHeader,
      items: validItems,
      layout: layoutPayload,
      specsData: specsPayload, // <-- KIRIM SPECS DATA
      isEdit: !!route.query.nomorLhk,
    });

    toast.success("Berhasil disimpan.");
    router.push("/transaksi/penjualan/dtf/lhk-so-dtf");
  } catch {
    toast.error("Gagal simpan.");
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  const res = await api.get("/lhk-so-dtf-form/jenis-order");
  jenisOrderOptions.value = res.data;
  loadLhkData();
});

const totalLuasSistemVal = computed(() =>
  items.value.reduce((sum, i) => sum + (i.luasSistem || 0), 0)
);
const totalJumlahKaosSummaryVal = computed(() =>
  items.value.reduce((sum, item) => sum + (item.isStok ? 0 : Number(item.jumlah) || 0), 0)
);
const luasEstimasiLayoutVal = computed(() => {
  const lebar = formHeader.cabang === "K02" ? 30 : 60;
  return calculatedPanjangSistem.value * lebar;
});
const efisiensiRatioVal = computed(() => {
  if (luasEstimasiLayoutVal.value === 0) return 0;
  return ((totalLuasSistemVal.value / luasEstimasiLayoutVal.value) * 100).toFixed(1);
});
const isShowMeasurement = computed(() => {
  const name = formHeader.jenisOrder?.nama?.toUpperCase() || "";
  return name.includes("SABLON DTF") || name.includes("DTF PREMIUM");
});
// Menentukan prefix pencarian berdasarkan Jenis Order yang dipilih
const activePrefix = computed(() => {
  const joName = formHeader.jenisOrder?.nama?.toUpperCase() || "";
  if (joName.includes("SABLON DTF")) return "SD";
  if (joName.includes("DTF PREMIUM")) return "DP";
  if (joName.includes("SABLON MANUAL")) return "SB";
  return ""; // Bebas jika jenis order lain
});

const tableHeaders = [
  { title: "", key: "data-table-expand", width: "40px", sortable: false },
  { title: "No.", key: "no", width: "50px", sortable: false },
  { title: "PO/SO DTF", key: "kode", width: "125px" },
  { title: "Nama DTF", key: "nama", width: "250px" },
  { title: "Jml Titik", key: "titik", width: "80px", align: "center" as const },
  { title: "Total Titik", key: "totalTitik", width: "90px", align: "center" as const },

  // [BARU] Kolom untuk menampilkan Jumlah asli dari SO DTF
  { title: "Jumlah Order", key: "jumlahSistem", width: "95px", align: "center" as const },

  { title: "Jumlah Kaos OK", key: "jumlah", width: "95px", align: "center" as const },
  { title: "Jumlah Kaos Reject", key: "reject", width: "80px", align: "center" as const },
  { title: "Actions", key: "actions", width: "50px" },
];
</script>

<template>
  <PageLayout :title="pageTitle" desktop-mode icon="mdi-clipboard-edit-outline">
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        @click="confirmSave"
        :loading="isSaving"
        prepend-icon="mdi-content-save"
        >Simpan</v-btn
      >
      <v-btn size="small" @click="confirmCancel" prepend-icon="mdi-refresh">Batal</v-btn>
      <v-btn size="small" @click="confirmClose" prepend-icon="mdi-close">Tutup</v-btn>
    </template>

    <div class="form-grid-three-column">
      <!-- KOLOM 1: HEADER (Font 11px) -->
      <div class="column-header column-font-11">
        <div class="desktop-form-section mb-3">
          <div class="section-title">Informasi LHK</div>
          <v-row dense>
            <v-col cols="12"
              ><v-text-field
                label="Nomor LHK"
                v-model="formHeader.lhkNomor"
                density="compact"
                hide-details
                variant="filled"
                readonly
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Store"
                v-model="formHeader.cabang"
                density="compact"
                hide-details
                variant="outlined"
                readonly
            /></v-col>
            <v-col cols="12"
              ><v-text-field
                label="Tanggal"
                v-model="formHeader.tanggal"
                type="date"
                density="compact"
                hide-details
                variant="outlined"
            /></v-col>
            <v-col cols="12"
              ><v-select
                v-model="formHeader.jenisOrder"
                :items="jenisOrderOptions"
                item-title="nama"
                return-object
                label="Jenis Pekerjaan"
                density="compact"
                variant="outlined"
                hide-details
            /></v-col>
          </v-row>
        </div>

        <div v-if="isShowMeasurement" class="desktop-form-section bg-blue-lighten-5">
          <div class="section-title">Ukuran Cetak Riil</div>
          <v-row dense>
            <v-col cols="6"
              ><v-text-field
                v-model.number="formHeader.panjang"
                label="Panjang (cm)"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="custom-suffix"
                suffix="cm"
            /></v-col>
            <v-col cols="6"
              ><v-text-field
                v-model.number="formHeader.buangan"
                label="Buangan (cm)"
                type="number"
                variant="outlined"
                density="compact"
                hide-details
                class="custom-suffix"
                suffix="cm"
            /></v-col>
            <v-col cols="12">
              <v-btn
                block
                color="indigo"
                size="small"
                class="mt-2"
                prepend-icon="mdi-auto-fix"
                :loading="isLayoutLoading"
                @click="runAutoArrange"
              >
                Generate Layout
              </v-btn>
            </v-col>
          </v-row>
          <v-divider class="my-3"></v-divider>
          <div class="summary-box">
            <div class="d-flex justify-space-between">
              <span>Total Qty:</span> <b>{{ totalJumlahKaosSummaryVal }} Pcs</b>
            </div>
            <div class="d-flex justify-space-between">
              <span>Luas Sistem:</span> <b>{{ totalLuasSistemVal.toLocaleString() }} cm²</b>
            </div>
            <div class="d-flex justify-space-between text-teal mt-1">
              <span>Efisiensi (Sistem/Riil):</span> <b>{{ efisiensiRatioVal }}%</b>
            </div>
            <div class="d-flex justify-space-between text-indigo mt-1">
              <span>Panjang Estimasi:</span> <b>{{ calculatedPanjangSistem }} cm</b>
            </div>
          </div>
        </div>

        <div class="desktop-form-section mt-3">
          <div class="section-title">Kontrol Preview</div>
          <v-slider
            v-model="zoomScale"
            min="0.1"
            max="1"
            step="0.05"
            hide-details
            density="compact"
            color="indigo"
            thumb-label
          ></v-slider>
          <div class="text-center text-caption mt-1">Zoom: {{ Math.round(zoomScale * 100) }}%</div>
          <div class="text-tiny text-center mt-2 text-grey-darken-1">
            *Klik 2x Kotak untuk Rotate
          </div>
        </div>
      </div>

      <!-- KOLOM 2: PREVIEW CANVAS (Interactive) -->
      <div class="column-preview">
        <div class="desktop-form-section fill-height d-flex flex-column">
          <div class="section-title d-flex justify-space-between align-center">
            <span>Simulasi Layout ({{ formHeader.cabang === "K02" ? "30" : "60" }} cm)</span>
            <div class="d-flex align-center ga-1">
              <v-btn
                icon="mdi-minus"
                density="compact"
                size="x-small"
                @click="zoomOut"
                variant="tonal"
              ></v-btn>
              <span
                class="text-caption font-weight-bold"
                style="min-width: 35px; text-align: center"
                >{{ Math.round(zoomScale * 100) }}%</span
              >
              <v-btn
                icon="mdi-plus"
                density="compact"
                size="x-small"
                @click="zoomIn"
                variant="tonal"
              ></v-btn>
              <v-btn
                icon="mdi-fullscreen"
                density="compact"
                size="x-small"
                @click="isCanvasDialogOpen = true"
                color="indigo"
                class="ms-1"
              ></v-btn>
            </div>
          </div>

          <div class="canvas-viewport">
            <div class="canvas-wrapper">
              <!-- Label Lebar -->
              <div class="label-ruler-x" v-if="layoutPreview.length">
                <div class="ruler-line"></div>
                <div class="ruler-text">
                  {{ formHeader.cabang === "K02" ? "30" : "60" }} cm (Lebar)
                </div>
              </div>

              <canvas
                ref="canvasRef"
                @mousedown="startDrag($event, canvasRef)"
                @dblclick="handleDoubleClick($event, canvasRef)"
                @wheel.prevent="handleWheelZoom"
                class="main-canvas border-radius-sm shadow-sm"
              ></canvas>
            </div>

            <div v-if="layoutPreview.length === 0" class="canvas-empty">
              <v-icon size="48" color="grey-lighten-2">mdi-layers-off-outline</v-icon>
              <div class="mt-2">
                Pilih SO dan klik Generate Layout,<br />atau Upload File Ripping
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KOLOM 3: TABEL INPUTAN -->
      <div class="column-table">
        <div class="desktop-form-section fill-height d-flex flex-column">
          <v-data-table
            :headers="tableHeaders"
            :items="items"
            :loading="isLoading"
            density="compact"
            class="desktop-table"
            fixed-header
            :items-per-page="-1"
          >
            <template #[`item.no`]="{ index }">{{ index + 1 }}</template>
            <template #[`item.kode`]="{ item, index }">
              <v-text-field
                :id="`input-kode-${index}`"
                v-model="item.kode"
                :readonly="item.kode !== '' && item.nama !== '' && item.nama !== 'Mencari data...'"
                variant="underlined"
                density="compact"
                hide-details
                placeholder="Scan QR / F1:SO"
                @keydown.f1.prevent="handleSearchKeydown('SO', index)"
                @keydown.f2.prevent="handleSearchKeydown('PO', index)"
                @keydown.f3.prevent="handleSearchKeydown('SPK', index)"
                @keydown.enter.prevent="loadSoDataByCode(item.kode, index)"
                @change="loadSoDataByCode(item.kode, index)"
              />
            </template>
            <template #[`item.titik`]="{ item }">
              <div class="text-center font-weight-bold text-indigo">
                {{ item.specs ? item.specs.length : 0 }} Titik
              </div>
            </template>

            <template #[`item.totalTitik`]="{ item }">
              <v-text-field
                v-model.number="item.totalTitik"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-center font-weight-bold text-deep-orange"
              />
            </template>

            <template #[`item.jumlahSistem`]="{ item }">
              <div v-if="item.isStok" class="text-center font-weight-bold text-grey">-</div>

              <v-text-field
                v-else-if="item.isReprint"
                v-model.number="item.jumlahSistem"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-center font-weight-bold text-blue-darken-2"
                @update:model-value="calculateRowTotal(item)"
                title="Edit target karena ini Reprint"
              />

              <div
                v-else
                class="text-center font-weight-bold text-blue-darken-2"
                style="font-size: 13px"
                title="LHK Pertama (Tidak bisa diubah)"
              >
                {{ item.jumlahSistem || 0 }} Pcs
              </div>
            </template>

            <template #[`item.jumlah`]="{ item }">
              <div v-if="item.isStok" class="text-center font-weight-bold text-grey">-</div>
              <v-text-field
                v-else
                v-model.number="item.jumlah"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-center font-weight-bold"
                @update:model-value="calculateRowTotal(item)"
              />
            </template>

            <template #[`item.reject`]="{ item }">
              <div v-if="item.isStok" class="text-center font-weight-bold text-grey">-</div>
              <v-text-field
                v-else
                v-model.number="item.reject"
                type="number"
                variant="underlined"
                density="compact"
                hide-details
                class="text-center tiny-input text-error font-weight-bold"
              />
            </template>

            <template #[`item.actions`]="{ item }">
              <v-btn
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                @click="removeRow(item.id)"
              />
            </template>
            <template #expanded-row="{ columns, item }">
              <tr>
                <td :colspan="String(columns.length)" class="pa-2 bg-grey-lighten-4">
                  <div
                    v-if="!item.specs || item.specs.length === 0"
                    class="text-caption text-grey text-center py-2"
                  >
                    Tidak ada rincian dimensi cetak.
                  </div>
                  <v-table v-else density="compact" class="bg-white border rounded">
                    <thead>
                      <tr>
                        <th class="text-caption font-weight-bold">Titik Ke-</th>
                        <th class="text-caption font-weight-bold">Dimensi (cm)</th>
                        <th class="text-caption font-weight-bold text-end">Luas 1 Pcs</th>
                        <th class="text-caption font-weight-bold text-center">Total Cetak</th>
                        <th class="text-caption font-weight-bold text-center">Desain</th>
                        <th v-if="item.isReprint" class="text-caption font-weight-bold text-center">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(spec, i) in item.specs" :key="i">
                        <td class="text-caption">Titik {{ i + 1 }}</td>
                        <td class="text-caption">{{ spec.w }} x {{ spec.h }}</td>
                        <td class="text-caption text-end">{{ spec.luas.toLocaleString() }} cm²</td>
                        <td class="text-caption text-center font-weight-bold text-deep-orange">
                          {{ spec.qtyTotal }}
                        </td>

                        <td class="text-center">
                          <div class="d-flex align-center justify-center">
                            <v-btn
                              :icon="spec.uploadedImageObj ? 'mdi-image-check' : 'mdi-upload'"
                              :color="spec.uploadedImageObj ? 'success' : 'grey'"
                              size="x-small"
                              variant="tonal"
                              :loading="spec.isUploading"
                              @click="triggerFileInput(`${item.id}-${i}`)"
                            ></v-btn>
                            <input
                              :id="`file-upload-${item.id}-${i}`"
                              type="file"
                              accept="image/png, image/jpeg"
                              style="display: none"
                              @change="(e) => handleSpecFileUpload(e, item, spec, i)"
                            />
                          </div>
                        </td>

                        <td v-if="item.isReprint" class="text-center">
                          <v-btn
                            icon="mdi-delete"
                            color="error"
                            size="x-small"
                            variant="text"
                            title="Hapus Titik Ini"
                            @click="removeSpec(item, i)"
                          ></v-btn>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </td>
              </tr>
            </template>
            <template #bottom></template>
          </v-data-table>
        </div>
      </div>
    </div>

    <!-- Modal Canvas Dialog (Smooth Full Screen) -->
    <v-dialog v-model="isCanvasDialogOpen" fullscreen transition="dialog-bottom-transition">
      <v-card class="bg-grey-darken-4">
        <v-toolbar color="indigo" dark density="compact">
          <v-btn icon="mdi-close" @click="isCanvasDialogOpen = false"></v-btn>
          <v-toolbar-title class="text-subtitle-1">Editor Layout LHK DTF</v-toolbar-title>
          <v-spacer></v-spacer>
          <div class="d-flex align-center ga-2 me-4">
            <v-btn icon="mdi-minus" size="small" @click="zoomOut"></v-btn>
            <span class="text-caption font-weight-bold" style="color: white"
              >{{ Math.round(zoomScale * 100) }}%</span
            >
            <v-btn icon="mdi-plus" size="small" @click="zoomIn"></v-btn>
          </div>
        </v-toolbar>

        <v-card-text class="pa-0 d-flex justify-center" style="overflow: auto">
          <div class="canvas-viewport" style="background: transparent">
            <div class="canvas-wrapper mt-10 mb-10">
              <canvas
                ref="canvasDialogRef"
                @mousedown="startDrag($event, canvasDialogRef)"
                @dblclick="handleDoubleClick($event, canvasDialogRef)"
                @wheel.prevent="handleWheelZoom"
                class="main-canvas"
              ></canvas>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isSaveDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Simpan</v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menyimpan LHK ini? Pastikan layout dan jumlah cadangan sudah
          sesuai.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isSaveDialogVisible = false"
            >Tidak</v-btn
          >
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              () => {
                isSaveDialogVisible = false;
                save();
              }
            "
            >Ya, Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isCancelDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold text-warning">Konfirmasi Batal</v-card-title>
        <v-card-text>
          Semua perubahan yang belum disimpan (termasuk susunan layout) akan dikembalikan ke kondisi
          semula. Lanjutkan?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isCancelDialogVisible = false"
            >Tidak</v-btn
          >
          <v-btn color="warning" variant="tonal" @click="executeCancel">Ya, Batalkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isCloseDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold text-error">Konfirmasi Keluar</v-card-title>
        <v-card-text>
          Anda akan keluar dari halaman ini. Semua perubahan yang belum disimpan akan hilang.
          Lanjutkan?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isCloseDialogVisible = false"
            >Tidak</v-btn
          >
          <v-btn color="error" variant="tonal" @click="executeClose">Ya, Keluar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Batal</v-btn>
          <v-btn color="primary" variant="tonal" @click="dialogConfirm.onConfirm()"
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Modals Search -->
    <SoPoSearchModal
      v-if="isSoSearchVisible"
      :cabang="formHeader.cabang"
      tipe="SO"
      :prefix="activePrefix"
      @close="isSoSearchVisible = false"
      @selected="onSoPoSelected"
    />
    <SoPoSearchModal
      v-if="isPoSearchVisible"
      :cabang="formHeader.cabang"
      tipe="PO"
      :prefix="activePrefix"
      @close="isPoSearchVisible = false"
      @selected="onSoPoSelected"
    />
    <SoPoSearchModal
      v-if="isSpkSearchVisible"
      :cabang="formHeader.cabang"
      tipe="SPK"
      @close="isSpkSearchVisible = false"
      @selected="onSoPoSelected"
    />
  </PageLayout>
</template>

<style scoped>
/* Grid Layout */
.form-grid-three-column {
  display: grid;
  grid-template-columns: 260px 420px 1fr;
  gap: 12px;
  height: calc(100vh - 110px);
  overflow: hidden;
  padding: 8px;
}

.column-header,
.column-preview,
.column-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Kolom Informasi 11px & Fix Text Color (Kontras) */
.column-font-11 :deep(input),
.column-font-11 :deep(.v-label),
.column-font-11 :deep(.v-field__input),
.column-font-11 :deep(.summary-box) {
  font-size: 11px !important;
  color: #1a1a1a !important;
}

:deep(.v-text-field .v-label) {
  color: #333 !important;
}

.section-title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: #1a237e;
  border-left: 3px solid #1a237e;
  padding-left: 8px;
}

/* Canvas UI */
.canvas-viewport {
  flex-grow: 1;
  background: #333333;
  overflow: auto;
  position: relative;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  padding: 40px 60px;
}

.canvas-wrapper {
  position: relative;
  align-self: flex-start;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.6);
}

.main-canvas {
  background: #ffffff;
  display: block;
  cursor: grab;
}
.main-canvas:active {
  cursor: grabbing;
}

/* Dynamic Rulers */
.label-ruler-x {
  position: absolute;
  top: -25px;
  left: 0;
  width: 100%;
  text-align: center;
}
.label-ruler-y {
  position: absolute;
  right: -85px;
  top: 0;
  height: 100%;
  display: flex;
  align-items: center;
}
.ruler-line {
  position: absolute;
  border: 1px dashed rgba(255, 255, 255, 0.4);
}
.label-ruler-x .ruler-line {
  bottom: -5px;
  left: 0;
  width: 100%;
}
.label-ruler-y .ruler-line {
  left: -10px;
  top: 0;
  height: 100%;
}
.ruler-text {
  color: white;
  font-size: 10px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
}

.canvas-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #999;
  text-align: center;
}

/* Table Style */
.desktop-table :deep(thead th) {
  font-size: 10px !important;
  background-color: #f5f5f5 !important;
  height: 36px !important;
  color: #333 !important;
}

.tiny-input :deep(input) {
  text-align: center;
  font-size: 11px !important;
}

.bg-blue-lighten-5 {
  background-color: #e3f2fd !important;
  border: 1px solid #bbdefb;
}

.text-tiny {
  font-size: 9px;
}

:deep(.v-data-table__td) {
  padding: 0 4px !important;
}
</style>
