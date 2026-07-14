<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from "vue";
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

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", value: boolean): void }>();

const toast = useToast();
const authStore = useAuthStore();

const aiQuestion = ref("");
const aiLoading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const aiMessages = ref<AiMessage[]>([]);

const suggestions: Suggestion[] = [
  { label: "Halo", icon: "mdi-hand-wave-outline" },
  { label: "Penjualan hari ini", icon: "mdi-chart-timeline-variant" },
  { label: "Barang paling laris", icon: "mdi-star-outline" },
  { label: "Stok paling sedikit", icon: "mdi-package-variant-closed" },
  { label: "Piutang hari ini", icon: "mdi-cash-clock" },
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

const sendAi = async () => {
  if (!aiQuestion.value.trim()) return;

  aiMessages.value.push({ role: "user", content: aiQuestion.value });
  aiQuestion.value = "";
  aiLoading.value = true;
  scrollToBottom();

  try {
    const recentHistory = aiMessages.value.slice(-2).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const { data } = await api.post("/ai/chat", { messages: recentHistory });
    aiMessages.value.push({ role: "assistant", content: data.answer });
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
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && props.modelValue) close();
};

watch(
  () => props.modelValue,
  (isOpen) => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) nextTick(scrollToBottom);
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
            <!-- HEADER -->
            <div class="ai-header">
              <div class="ai-header-glow ai-header-glow-1"></div>
              <div class="ai-header-glow ai-header-glow-2"></div>

              <div class="ai-header-content">
                <div class="ai-header-left">
                  <div class="ai-avatar-ring">
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
        </Transition>
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
  max-width: 720px;
  height: min(680px, 88vh);
  background: #f6f6f6;
  border-radius: 24px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
}
</style>
