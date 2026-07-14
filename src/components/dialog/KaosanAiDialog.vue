<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", value: boolean): void }>();

const toast = useToast();

const aiQuestion = ref("");
const aiLoading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const aiMessages = ref<AiMessage[]>([]);

const suggestions = [
  "Halo",
  "Penjualan hari ini",
  "Barang paling laris",
  "Stok paling sedikit",
  "Piutang hari ini",
];

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

const askSuggestion = (text: string) => {
  aiQuestion.value = text;
  sendAi();
};

// Kunci scroll body saat panel terbuka + tutup pakai tombol Escape
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
              <div class="ai-header-left">
                <div class="ai-avatar">
                  <i class="mdi mdi-robot-outline"></i>
                </div>
                <div>
                  <div class="ai-title">Kaosan AI Assistant</div>
                  <div class="ai-subtitle">Siap bantu cek data toko kamu</div>
                </div>
              </div>
              <button class="ai-close-btn" aria-label="Tutup" @click="close">
                <i class="mdi mdi-close"></i>
              </button>
            </div>

            <!-- BODY -->
            <div class="ai-body">
              <div class="ai-suggestions">
                <button
                  v-for="item in suggestions"
                  :key="item"
                  class="ai-chip"
                  @click="askSuggestion(item)"
                >
                  {{ item }}
                </button>
              </div>

              <div ref="chatContainer" class="ai-chat-scroll">
                <div v-if="aiMessages.length === 0" class="ai-empty-state">
                  <i class="mdi mdi-robot-happy-outline ai-empty-icon"></i>
                  <div class="ai-empty-title">Halo 👋</div>
                  <div class="ai-empty-desc">
                    Ada yang bisa saya bantu terkait data Kaosan hari ini?
                  </div>
                </div>

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
                <i class="mdi mdi-message-text-outline ai-input-icon"></i>
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
                  <i class="mdi" :class="aiLoading ? 'mdi-loading mdi-spin' : 'mdi-send'"></i>
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
/* ── Palet ── */
:root {
  --ai-crimson: #a83232;
  --ai-crimson-dark: #8a2929;
  --ai-off-white: #f6f6f6;
}

.ai-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 10, 10, 0.45);
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #a83232 0%, #8a2929 100%);
}

.ai-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-avatar {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 24px;
  flex-shrink: 0;
}

.ai-title {
  color: #ffffff;
  font-weight: 700;
  font-size: 1rem;
  line-height: 1.2;
}

.ai-subtitle {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.75rem;
  margin-top: 2px;
}

.ai-close-btn {
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
  font-size: 18px;
  transition: background 0.2s ease;
}

.ai-close-btn:hover {
  background: rgba(255, 255, 255, 0.28);
}

/* ── Body ── */
.ai-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 0;
}

.ai-suggestions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(168, 50, 50, 0.12);
  margin-bottom: 14px;
}

.ai-chip {
  border: 1.5px solid #a83232;
  background: #ffffff;
  color: #a83232;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.ai-chip:hover {
  background: #a83232;
  color: #ffffff;
  transform: translateY(-1px);
}

.ai-chat-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 16px;
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

.ai-empty-state {
  text-align: center;
  color: #8a7a7a;
  margin-top: 48px;
}

.ai-empty-icon {
  font-size: 56px;
  color: #c98080;
  margin-bottom: 12px;
  display: block;
}

.ai-empty-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #a83232;
}

.ai-empty-desc {
  font-size: 0.85rem;
  margin-top: 4px;
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

/* Typing indicator */
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

/* ── Footer ── */
.ai-footer {
  flex-shrink: 0;
  padding: 14px 20px 18px;
  background: #ffffff;
  border-top: 1px solid rgba(168, 50, 50, 0.1);
}

.ai-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f6f6f6;
  border: 1.5px solid rgba(168, 50, 50, 0.15);
  border-radius: 999px;
  padding: 6px 8px 6px 16px;
  transition: border-color 0.18s ease;
}

.ai-input-wrap:focus-within {
  border-color: #a83232;
}

.ai-input-icon {
  color: #a83232;
  font-size: 18px;
  opacity: 0.7;
  flex-shrink: 0;
}

.ai-input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.88rem;
  color: #3a2c2c;
  padding: 6px 0;
}

.ai-input::placeholder {
  color: #a89797;
}

.ai-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #a83232;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
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

/* ── Transisi custom (bukan bawaan Vuetify) ── */
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

/* ── Mobile: jadi bottom-sheet ── */
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
}
</style>
