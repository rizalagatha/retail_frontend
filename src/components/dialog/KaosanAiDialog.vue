<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch, onMounted, onUnmounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}
interface Suggestion {
  label: string;
  icon: string;
}
interface ChatSession {
  id: number;
  judul: string;
  date_create: string;
  date_update: string;
}

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", value: boolean): void }>();

const toast = useToast();
const authStore = useAuthStore();

const aiQuestion = ref("");
const aiLoading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const aiMessages = ref<AiMessage[]>([]);

// Persistensi sesi chat — null berarti belum ada sesi (pesan pertama akan
// bikin sesi baru otomatis di backend).
const sessionId = ref<number | null>(null);

// [BARU] Riwayat percakapan (sidebar)
const chatSessions = ref<ChatSession[]>([]);
const isLoadingSessions = ref(false);
const isLoadingSessionMessages = ref(false);
const mobileSidebarOpen = ref(false);
const isSidebarCollapsed = ref(false);

// Popover "Topik yang bisa ditanyakan"
const showScopePanel = ref(false);
const scopePanelPos = reactive({ top: 0, left: 0 });
const scopeHoverBtnRef = ref<HTMLElement | null>(null);
let scopeLeaveTimeout: ReturnType<typeof setTimeout> | null = null;

const computeScopePanelPos = () => {
  const btn = scopeHoverBtnRef.value;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const panelWidth = window.innerWidth <= 600 ? 320 : 380;
  let left = rect.right - panelWidth;
  left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));
  scopePanelPos.left = left;
  scopePanelPos.top = rect.bottom + 10;
};

const onScopeEnter = () => {
  if (scopeLeaveTimeout) {
    clearTimeout(scopeLeaveTimeout);
    scopeLeaveTimeout = null;
  }
  computeScopePanelPos();
  showScopePanel.value = true;
};

const onScopeLeave = () => {
  scopeLeaveTimeout = setTimeout(() => {
    showScopePanel.value = false;
  }, 150);
};

const suggestions: Suggestion[] = [
  { label: "Penjualan hari ini", icon: "mdi-chart-timeline-variant" },
  { label: "Barang paling laris bulan ini", icon: "mdi-star-outline" },
  { label: "Stok kosong di toko", icon: "mdi-package-variant-closed" },
  { label: "Piutang saat ini", icon: "mdi-cash-clock" },
  { label: "Pencapaian target bulan ini", icon: "mdi-target" },
];

const scopeCategories = [
  {
    icon: "mdi-cash-multiple",
    label: "Penjualan",
    detail: "hari ini, minggu/bulan lalu, per cabang",
  },
  {
    icon: "mdi-tshirt-crew-outline",
    label: "Barang Laris",
    detail: "top produk per periode/cabang",
  },
  {
    icon: "mdi-package-variant-closed",
    label: "Stok",
    detail: "total, per cabang, kosong, fast moving",
  },
  { icon: "mdi-cash-clock", label: "Piutang", detail: "total & per cabang" },
  {
    icon: "mdi-target",
    label: "Target & Performa",
    detail: "pencapaian bulan ini, ranking cabang",
  },
  { icon: "mdi-archive-clock-outline", label: "Dead Stock", detail: "klasifikasi stok stagnan" },
  { icon: "mdi-finance", label: "Laba Rugi", detail: "khusus user Pusat (KDC)" },
  {
    icon: "mdi-truck-delivery-outline",
    label: "Jadwal & Deadline",
    detail: "kiriman toko, dateline SO/SPK",
  },
];

const userDisplayName = computed(() => authStore.user?.kode || "");

const greetingTime = computed(() => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
});

const close = () => emit("update:modelValue", false);

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
};

// [BARU] Label tanggal relatif untuk item riwayat ("Hari ini", "Kemarin", dst)
const formatSessionDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
};

// [BARU] Ambil daftar riwayat chat
const fetchSessions = async () => {
  isLoadingSessions.value = true;
  try {
    const { data } = await api.get("/ai/sessions");
    chatSessions.value = data.data || [];
  } catch {
    // Diam-diam gagal — riwayat bukan fitur kritikal, tidak perlu toast mengganggu
    console.error("Gagal memuat riwayat chat.");
  } finally {
    isLoadingSessions.value = false;
  }
};

// [BARU] Buka salah satu chat lama dari sidebar
const selectSession = async (session: ChatSession) => {
  if (session.id === sessionId.value) {
    mobileSidebarOpen.value = false;
    return;
  }
  isLoadingSessionMessages.value = true;
  try {
    const { data } = await api.get(`/ai/sessions/${session.id}`);
    aiMessages.value = (data.data || []).map(
      (m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content,
      })
    );
    sessionId.value = session.id;
    mobileSidebarOpen.value = false;
    scrollToBottom();
  } catch {
    toast.error("Gagal memuat percakapan ini.");
  } finally {
    isLoadingSessionMessages.value = false;
  }
};

// [BARU] Hapus 1 riwayat chat
const deleteSessionItem = async (session: ChatSession, e: Event) => {
  e.stopPropagation();
  try {
    await api.delete(`/ai/sessions/${session.id}`);
    chatSessions.value = chatSessions.value.filter((s) => s.id !== session.id);
    if (sessionId.value === session.id) {
      aiMessages.value = [];
      sessionId.value = null;
    }
    toast.success("Riwayat chat dihapus.");
  } catch {
    toast.error("Gagal menghapus riwayat chat.");
  }
};

const sendAi = async () => {
  if (!aiQuestion.value.trim()) return;

  aiMessages.value.push({ role: "user", content: aiQuestion.value });
  aiQuestion.value = "";
  aiLoading.value = true;
  scrollToBottom();

  const wasNewSession = sessionId.value === null;

  try {
    const recentHistory = aiMessages.value.slice(-2).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const { data } = await api.post("/ai/chat", {
      messages: recentHistory,
      sessionId: sessionId.value,
    });
    aiMessages.value.push({ role: "assistant", content: data.answer });
    if (data.sessionId) sessionId.value = data.sessionId;

    // [BARU] Sesi baru berhasil dibuat — refresh sidebar biar langsung muncul
    if (wasNewSession) fetchSessions();
  } catch {
    toast.error("AI gagal dihubungi.");
    aiMessages.value.push({ role: "assistant", content: "Maaf, koneksi ke AI terputus." });
  } finally {
    aiLoading.value = false;
    scrollToBottom();
  }
};

const askSuggestion = (label: string) => {
  aiQuestion.value = label;
  sendAi();
};

const resetChat = () => {
  aiMessages.value = [];
  aiQuestion.value = "";
  sessionId.value = null;
  mobileSidebarOpen.value = false;
};

const toggleMobileSidebar = () => {
  mobileSidebarOpen.value = !mobileSidebarOpen.value;
};

// [BARU] Klik avatar robot: di desktop collapse/expand sidebar (rail tipis),
// di mobile buka drawer riwayat (behavior sama seperti tombol hamburger).
const toggleAvatarClick = () => {
  if (window.innerWidth <= 600) {
    toggleMobileSidebar();
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && props.modelValue) close();
};

watch(
  () => props.modelValue,
  (isOpen) => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) {
      nextTick(scrollToBottom);
      fetchSessions(); // [BARU] muat riwayat tiap dialog dibuka
    }
  }
);

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-overlay-fade">
      <div v-if="modelValue" class="ai-overlay" @click.self="close">
        <Transition name="ai-panel-pop">
          <div v-if="modelValue" class="ai-panel" role="dialog" aria-modal="true">
            <!-- SIDEBAR RIWAYAT -->
            <div
              class="ai-sidebar"
              :class="{ open: mobileSidebarOpen, collapsed: isSidebarCollapsed }"
            >
              <div class="ai-sidebar-header">
                <button class="ai-new-chat-btn" title="Percakapan Baru" @click="resetChat">
                  <i class="mdi mdi-plus"></i>
                  <span class="ai-new-chat-label">Percakapan Baru</span>
                </button>
              </div>
              <div class="ai-sidebar-list">
                <div v-if="isLoadingSessions" class="ai-sidebar-loading">
                  <i class="mdi mdi-loading mdi-spin"></i>
                </div>
                <div v-else-if="chatSessions.length === 0" class="ai-sidebar-empty">
                  Belum ada riwayat percakapan.
                </div>
                <div
                  v-for="session in chatSessions"
                  :key="session.id"
                  class="ai-sidebar-item"
                  :class="{ active: session.id === sessionId }"
                  @click="selectSession(session)"
                >
                  <i class="mdi mdi-message-text-outline ai-sidebar-item-icon"></i>
                  <div class="ai-sidebar-item-text">
                    <div class="ai-sidebar-item-title">{{ session.judul || "Percakapan" }}</div>
                    <div class="ai-sidebar-item-date">
                      {{ formatSessionDate(session.date_update) }}
                    </div>
                  </div>
                  <button
                    class="ai-sidebar-item-delete"
                    aria-label="Hapus riwayat"
                    @click="deleteSessionItem(session, $event)"
                  >
                    <i class="mdi mdi-trash-can-outline"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- Backdrop khusus mobile -->
            <div
              v-if="mobileSidebarOpen"
              class="ai-sidebar-backdrop"
              @click="mobileSidebarOpen = false"
            ></div>

            <div class="ai-main">
              <!-- HEADER -->
              <div class="ai-header">
                <div class="ai-header-glow ai-header-glow-1"></div>
                <div class="ai-header-glow ai-header-glow-2"></div>

                <div class="ai-header-content">
                  <div class="ai-header-left">
                    <div
                      class="ai-avatar-ring ai-avatar-clickable"
                      role="button"
                      tabindex="0"
                      :title="
                        isSidebarCollapsed ? 'Tampilkan riwayat chat' : 'Sembunyikan riwayat chat'
                      "
                      @click="toggleAvatarClick"
                      @keydown.enter="toggleAvatarClick"
                    >
                      <div class="ai-avatar">
                        <i class="mdi mdi-robot-outline"></i>
                      </div>
                    </div>
                    <div>
                      <div class="ai-title">Kaosan AI Assistant</div>
                      <div class="ai-subtitle">Siap bantu cek data toko kamu</div>
                    </div>
                  </div>
                  <div class="ai-header-actions">
                    <button
                      class="ai-icon-btn ai-sidebar-toggle-btn"
                      aria-label="Riwayat chat"
                      @click="toggleMobileSidebar"
                    >
                      <i class="mdi mdi-menu"></i>
                    </button>
                    <div
                      class="ai-scope-hover"
                      ref="scopeHoverBtnRef"
                      @mouseenter="onScopeEnter"
                      @mouseleave="onScopeLeave"
                    >
                      <button class="ai-icon-btn" aria-label="Lihat topik yang bisa ditanyakan">
                        <i class="mdi mdi-information-outline"></i>
                      </button>
                    </div>
                    <button
                      v-if="aiMessages.length > 0"
                      class="ai-icon-btn"
                      aria-label="Percakapan baru"
                      title="Percakapan baru"
                      @click="resetChat"
                    >
                      <i class="mdi mdi-refresh"></i>
                    </button>
                    <button class="ai-icon-btn" aria-label="Tutup" @click="close">
                      <i class="mdi mdi-close"></i>
                    </button>
                  </div>
                </div>
              </div>

              <!-- BODY -->
              <div class="ai-body">
                <!-- ══ HERO (state kosong) ══ -->
                <div v-if="aiMessages.length === 0" class="ai-hero">
                  <div class="ai-orb-wrap">
                    <div class="ai-orb"></div>
                    <i class="mdi mdi-robot-happy-outline ai-orb-icon"></i>
                  </div>

                  <div class="ai-hero-greeting">
                    {{ greetingTime }}<span v-if="userDisplayName">, {{ userDisplayName }}</span
                    >!
                  </div>
                  <div class="ai-hero-question">Ada yang bisa saya bantu?</div>

                  <div class="ai-hero-suggestions">
                    <button
                      v-for="(item, i) in suggestions"
                      :key="item.label"
                      class="ai-hero-pill"
                      :style="{ animationDelay: `${i * 0.06}s` }"
                      @click="askSuggestion(item.label)"
                    >
                      <i class="mdi" :class="item.icon"></i>
                      <span>{{ item.label }}</span>
                    </button>
                  </div>
                </div>

                <!-- ══ CHAT (setelah ada pesan) ══ -->
                <div v-else ref="chatContainer" class="ai-chat-scroll">
                  <div
                    v-for="(msg, index) in aiMessages"
                    :key="index"
                    class="ai-msg-row"
                    :class="msg.role"
                  >
                    <div
                      v-if="msg.role === 'assistant'"
                      class="ai-bubble assistant"
                      v-html="
                        msg.content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
                      "
                    ></div>
                    <div v-else class="ai-bubble user">{{ msg.content }}</div>
                  </div>

                  <div v-if="aiLoading" class="ai-msg-row assistant">
                    <div class="ai-bubble assistant ai-typing-bubble">
                      <span class="ai-typing-dot"></span>
                      <span class="ai-typing-dot"></span>
                      <span class="ai-typing-dot"></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- FOOTER INPUT -->
              <div class="ai-footer">
                <div class="ai-input-wrap">
                  <i class="mdi mdi-creation ai-input-icon"></i>
                  <input
                    v-model="aiQuestion"
                    class="ai-input"
                    placeholder="Tanyakan omzet, stok kosong, dll..."
                    :disabled="aiLoading"
                    @keyup.enter="sendAi"
                  />
                  <button
                    class="ai-send-btn"
                    :disabled="aiLoading || !aiQuestion.trim()"
                    aria-label="Kirim"
                    @click="sendAi"
                  >
                    <i class="mdi" :class="aiLoading ? 'mdi-loading mdi-spin' : 'mdi-arrow-up'"></i>
                  </button>
                </div>
              </div>
            </div>
            <!-- /.ai-main -->
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- [BARU] Popover topik, di-teleport terpisah supaya lolos dari
       overflow:hidden milik .ai-panel -->
  <Teleport to="body">
    <Transition name="ai-scope-fade">
      <div
        v-if="showScopePanel"
        class="ai-scope-hover-panel-floating"
        :style="{ top: scopePanelPos.top + 'px', left: scopePanelPos.left + 'px' }"
        @mouseenter="onScopeEnter"
        @mouseleave="onScopeLeave"
      >
        <div class="ai-scope-hover-title">Topik yang bisa ditanyakan</div>
        <div class="ai-scope-grid">
          <div v-for="cat in scopeCategories" :key="cat.label" class="ai-scope-item">
            <i class="mdi" :class="cat.icon"></i>
            <div>
              <div class="ai-scope-item-label">{{ cat.label }}</div>
              <div class="ai-scope-item-detail">{{ cat.detail }}</div>
            </div>
          </div>
        </div>
        <div class="ai-scope-hover-tip">
          <i class="mdi mdi-lightbulb-on-outline"></i>
          Tips: sebutkan lagi nama cabang/barang di pertanyaan lanjutan (follow-up), supaya AI nggak
          salah konteks.
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 10, 10, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.ai-panel {
  width: 100%;
  max-width: 960px;
  height: min(680px, 88vh);
  background: #f6f6f6;
  border-radius: 24px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: row;
  overflow: hidden;
  position: relative;
}

.ai-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Header ── */
.ai-header {
  position: relative;
  flex-shrink: 0;
  padding: 18px 20px;
  background: linear-gradient(135deg, #a83232 0%, #7a2424 100%);
  overflow: hidden;
}

.ai-header-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(30px);
  pointer-events: none;
}

.ai-header-glow-1 {
  width: 160px;
  height: 160px;
  background: rgba(255, 255, 255, 0.18);
  top: -80px;
  right: -20px;
}

.ai-header-glow-2 {
  width: 100px;
  height: 100px;
  background: rgba(255, 190, 190, 0.25);
  bottom: -60px;
  left: 40px;
}

.ai-header-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-avatar-ring {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  padding: 2px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
}

.ai-avatar-clickable {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.ai-avatar-clickable:hover {
  transform: scale(1.06);
}

.ai-avatar-clickable:active {
  transform: scale(0.96);
}

.ai-avatar {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 24px;
}

.ai-title {
  color: #ffffff;
  font-weight: 700;
  font-size: 1rem;
  line-height: 1.2;
}

.ai-subtitle {
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.75rem;
  margin-top: 2px;
}

.ai-header-actions {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 8px;
}

.ai-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 17px;
  transition: background 0.2s ease;
}

.ai-icon-btn:hover {
  background: rgba(255, 255, 255, 0.28);
}

/* ── Sidebar Riwayat ── */
.ai-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #fdf5f5;
  border-right: 1px solid rgba(168, 50, 50, 0.1);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: width 0.22s ease;
}

/* [BARU] Collapsed jadi rail tipis, cuma tombol "+" yang kelihatan */
.ai-sidebar.collapsed {
  width: 64px;
}

.ai-sidebar.collapsed .ai-new-chat-label,
.ai-sidebar.collapsed .ai-sidebar-list {
  display: none;
}

.ai-sidebar.collapsed .ai-new-chat-btn {
  padding: 9px;
}

.ai-sidebar-header {
  flex-shrink: 0;
  padding: 14px;
}

.ai-new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1.5px solid rgba(168, 50, 50, 0.25);
  background: #ffffff;
  color: #a83232;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.ai-new-chat-btn:hover {
  background: #a83232;
  color: #ffffff;
}

.ai-sidebar-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 12px;
}

.ai-sidebar-list::-webkit-scrollbar {
  width: 5px;
}
.ai-sidebar-list::-webkit-scrollbar-thumb {
  background: rgba(168, 50, 50, 0.2);
  border-radius: 10px;
}

.ai-sidebar-loading,
.ai-sidebar-empty {
  text-align: center;
  padding: 20px 10px;
  font-size: 0.75rem;
  color: #a89797;
}

.ai-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 8px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s ease;
  position: relative;
}

.ai-sidebar-item:hover {
  background: rgba(168, 50, 50, 0.08);
}

.ai-sidebar-item.active {
  background: rgba(168, 50, 50, 0.14);
}

.ai-sidebar-item-icon {
  color: #a83232;
  font-size: 16px;
  opacity: 0.7;
  flex-shrink: 0;
}

.ai-sidebar-item-text {
  flex: 1 1 auto;
  min-width: 0;
}

.ai-sidebar-item-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: #3a2c2c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-sidebar-item-date {
  font-size: 0.65rem;
  color: #a89797;
  margin-top: 1px;
}

.ai-sidebar-item-delete {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #a89797;
  border-radius: 6px;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 13px;
}

.ai-sidebar-item:hover .ai-sidebar-item-delete {
  display: flex;
}

.ai-sidebar-item-delete:hover {
  background: rgba(168, 50, 50, 0.15);
  color: #a83232;
}

.ai-sidebar-toggle-btn {
  display: none; /* cuma muncul di mobile */
}

.ai-sidebar-backdrop {
  display: none;
}

/* ── Body ── */
.ai-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ── Hero (state kosong) ── */
.ai-hero {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 28px;
  overflow-y: auto;
}

.ai-orb-wrap {
  position: relative;
  width: 88px;
  height: 88px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-orb {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #d16a6a 0%, #a83232 55%, #6e1f1f 100%);
  box-shadow: 0 0 0 10px rgba(168, 50, 50, 0.08), 0 0 40px rgba(168, 50, 50, 0.35);
  animation: ai-orb-breathe 3.5s ease-in-out infinite;
}

.ai-orb-icon {
  position: relative;
  z-index: 1;
  color: #ffffff;
  font-size: 38px;
}

@keyframes ai-orb-breathe {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(168, 50, 50, 0.08), 0 0 40px rgba(168, 50, 50, 0.35);
  }
  50% {
    transform: scale(1.04);
    box-shadow: 0 0 0 14px rgba(168, 50, 50, 0.1), 0 0 55px rgba(168, 50, 50, 0.45);
  }
}

.ai-hero-greeting {
  font-size: 1.55rem;
  font-weight: 800;
  color: #a83232;
  line-height: 1.25;
}

.ai-hero-question {
  font-size: 1.05rem;
  font-weight: 500;
  color: #8a7a7a;
  margin-top: 2px;
  margin-bottom: 26px;
}

.ai-hero-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 480px;
}

.ai-hero-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  border-radius: 14px;
  border: 1.5px solid rgba(168, 50, 50, 0.18);
  background: #ffffff;
  color: #a83232;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(168, 50, 50, 0.06);
  transition: all 0.2s ease;
  opacity: 0;
  animation: ai-pill-in 0.4s ease forwards;
}

.ai-hero-pill i {
  font-size: 17px;
}

.ai-hero-pill:hover {
  background: #a83232;
  color: #ffffff;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(168, 50, 50, 0.25);
}

@keyframes ai-pill-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Chat scroll (setelah ada pesan) ── */
.ai-chat-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
}

.ai-chat-scroll::-webkit-scrollbar {
  width: 6px;
}
.ai-chat-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.ai-chat-scroll::-webkit-scrollbar-thumb {
  background: rgba(168, 50, 50, 0.25);
  border-radius: 10px;
}

.ai-msg-row {
  display: flex;
  margin-bottom: 12px;
}

.ai-msg-row.user {
  justify-content: flex-end;
}

.ai-msg-row.assistant {
  justify-content: flex-start;
}

.ai-bubble {
  max-width: 85%;
  padding: 10px 16px;
  border-radius: 18px;
  font-size: 0.88rem;
  line-height: 1.55;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.ai-bubble.user {
  background: #a83232;
  color: #ffffff;
  border-bottom-right-radius: 6px;
}

.ai-bubble.assistant {
  background: #ffffff;
  color: #3a2c2c;
  border: 1px solid rgba(168, 50, 50, 0.1);
  border-bottom-left-radius: 6px;
}

.ai-typing-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 14px 16px;
}

.ai-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a83232;
  opacity: 0.5;
  animation: ai-typing-bounce 1.1s infinite ease-in-out;
}
.ai-typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.ai-typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes ai-typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

/* ── Footer input (gaya search-bar) ── */
.ai-footer {
  flex-shrink: 0;
  padding: 14px 20px 18px;
  background: #ffffff;
  border-top: 1px solid rgba(168, 50, 50, 0.1);
}

.ai-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f6f6f6;
  border: 1.5px solid rgba(168, 50, 50, 0.15);
  border-radius: 999px;
  padding: 8px 8px 8px 18px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.ai-input-wrap:focus-within {
  border-color: #a83232;
  box-shadow: 0 0 0 4px rgba(168, 50, 50, 0.08);
}

.ai-input-icon {
  color: #a83232;
  font-size: 19px;
  opacity: 0.75;
  flex-shrink: 0;
}

.ai-input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.9rem;
  color: #3a2c2c;
  padding: 7px 0;
}

.ai-input::placeholder {
  color: #a89797;
}

.ai-send-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: #a83232;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 17px;
  flex-shrink: 0;
  transition: background 0.18s ease, transform 0.15s ease;
}

.ai-send-btn:hover:not(:disabled) {
  background: #8a2929;
  transform: scale(1.06);
}

.ai-send-btn:disabled {
  background: #d9b8b8;
  cursor: not-allowed;
}

/* ── Transisi custom ── */
.ai-overlay-fade-enter-active,
.ai-overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}
.ai-overlay-fade-enter-from,
.ai-overlay-fade-leave-to {
  opacity: 0;
}

.ai-panel-pop-enter-active {
  transition: all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ai-panel-pop-leave-active {
  transition: all 0.2s ease;
}
.ai-panel-pop-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}
.ai-panel-pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

/* ── Mobile: bottom-sheet ── */
@media (max-width: 600px) {
  .ai-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .ai-panel {
    max-width: 100%;
    height: 92vh;
    border-radius: 24px 24px 0 0;
  }
  .ai-panel-pop-enter-from {
    transform: translateY(100%);
  }
  .ai-panel-pop-leave-to {
    transform: translateY(100%);
  }
  .ai-hero-greeting {
    font-size: 1.3rem;
  }

  .ai-sidebar-toggle-btn {
    display: flex;
  }

  .ai-sidebar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 78%;
    max-width: 280px;
    z-index: 20;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
  }

  .ai-sidebar.open {
    transform: translateX(0);
  }

  .ai-sidebar-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 15;
  }
}
</style>

<style>
/* [FIX] CSS untuk panel yang di-Teleport ke <body> — sengaja TIDAK scoped,
   supaya tidak bergantung pada atribut data-v-* yang kadang tidak
   ke-attach dengan benar ke elemen ber-Teleport (terutama rawan glitch
   saat Vite HMR). Nama class dibuat cukup spesifik (prefix "ai-scope-")
   untuk menghindari bentrok dengan CSS global lain di aplikasi. */

.ai-scope-hover-panel-floating {
  position: fixed;
  width: 380px;
  max-width: calc(100vw - 24px);
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
  padding: 16px;
  z-index: 4000;
}

@media (max-width: 600px) {
  .ai-scope-hover-panel-floating {
    width: 320px;
  }
}

.ai-scope-fade-enter-active,
.ai-scope-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.ai-scope-fade-enter-from,
.ai-scope-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.ai-scope-hover-title {
  font-size: 0.85rem;
  font-weight: 800;
  color: #a83232;
  margin-bottom: 10px;
}

.ai-scope-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ai-scope-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #f6f6f6;
  border: 1px solid rgba(168, 50, 50, 0.1);
  border-radius: 10px;
  padding: 8px 10px;
  text-align: left;
}

.ai-scope-item i {
  color: #a83232;
  font-size: 18px;
  margin-top: 1px;
  flex-shrink: 0;
}

.ai-scope-item-label {
  font-size: 0.76rem;
  font-weight: 700;
  color: #3a2c2c;
}

.ai-scope-item-detail {
  font-size: 0.68rem;
  color: #8a7a7a;
  margin-top: 1px;
}

.ai-scope-hover-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(168, 50, 50, 0.1);
  font-size: 0.7rem;
  line-height: 1.4;
  color: #7a5c5c;
}

.ai-scope-hover-tip i {
  color: #d68a1f;
  font-size: 15px;
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
