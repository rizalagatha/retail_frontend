<script setup lang="ts">
import LogoKaosan from "@/assets/logo.png";
import ShopeeLogo from "@/assets/shopee.png";
import TokpedLogo from "@/assets/tokped.png";
import TiktokLogo from "@/assets/tiktok.png";

withDefaults(defineProps<{ maxWidth?: string; dark?: boolean }>(), {
  maxWidth: "1040px",
  dark: false,
});

const year = new Date().getFullYear();

const links = [
  { label: "Lacak Pesanan", to: "/tracking" },
  { label: "Katalog", to: "/katalog" },
  { label: "Cek Stok Store", to: "/cek-stok" },
  { label: "Pusat Bantuan", to: { path: "/tracking", query: { bantuan: "1" } } },
];

const socials = [
  { name: "Instagram", href: "https://instagram.com/kaosan.official", icon: "mdi-instagram" },
  { name: "Facebook", href: "https://www.facebook.com/kaosanofficiall", icon: "mdi-facebook" },
  { name: "TikTok", href: "https://www.tiktok.com/@kaosanofficial_", img: TiktokLogo },
  { name: "Shopee", href: "https://shopee.co.id/kaosan_official", img: ShopeeLogo },
  { name: "Tokopedia", href: "https://www.tokopedia.com/kaosanofficial-118", img: TokpedLogo },
];
</script>

<template>
  <footer class="sf" :class="{ 'sf--dark': dark }">
    <div class="sf-inner" :style="{ '--sf-max': maxWidth }">
      <!-- Konten tambahan dari halaman (mis. kontak pengaduan konsumen) -->
      <slot />

      <div class="sf-top">
        <router-link to="/tracking" class="sf-brand" aria-label="Kaosan">
          <img :src="LogoKaosan" height="28" alt="Kaosan" />
        </router-link>
        <nav class="sf-links" aria-label="Tautan footer">
          <router-link v-for="l in links" :key="l.label" :to="l.to">{{ l.label }}</router-link>
        </nav>
      </div>

      <div class="sf-bottom">
        <small class="sf-copy">
          &copy; {{ year }} KAOSAN. Semua hak dilindungi undang-undang.
        </small>
        <div class="sf-social">
          <v-btn
            v-for="s in socials"
            :key="s.name"
            icon
            variant="text"
            size="small"
            :href="s.href"
            target="_blank"
            rel="noopener"
            :aria-label="s.name"
            class="sf-social-btn"
          >
            <v-icon v-if="s.icon" size="22" class="sf-social-icon">{{ s.icon }}</v-icon>
            <img v-else :src="s.img" :alt="s.name" class="sf-social-img" />
          </v-btn>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.sf {
  --sf-line: #e9dfdb;
  --sf-muted: #6f6663;
  --sf-red: #b71c1c;
  margin-top: auto;
  background: #fff;
  border-top: 1px solid var(--sf-line);
  font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
.sf-inner {
  max-width: var(--sf-max, 1040px);
  margin: 0 auto;
  padding: 28px 20px;
}

.sf-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--sf-line);
}
.sf-brand {
  display: inline-flex;
}
.sf-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}
.sf-links a {
  font-size: 13px;
  font-weight: 600;
  color: #1f1a19;
  text-decoration: none;
  transition: color 0.15s ease;
}
.sf-links a:hover {
  color: var(--sf-red);
}

.sf-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding-top: 16px;
}
.sf-copy {
  font-size: 12px;
  color: var(--sf-muted);
}
.sf-social {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sf-social-btn {
  transition: transform 0.2s ease;
}
.sf-social-btn:hover {
  transform: translateY(-3px);
}
.sf-social-icon {
  color: #3a3231;
  transition: color 0.2s ease, transform 0.2s ease;
}
.sf-social-btn:hover .sf-social-icon {
  color: var(--sf-red);
  transform: scale(1.1);
}
.sf-social-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: grayscale(100%) opacity(0.8);
  transition: filter 0.2s ease, transform 0.2s ease;
}
.sf-social-btn:hover .sf-social-img {
  filter: none;
  transform: scale(1.1);
}

.sf--dark {
  --sf-line: rgba(216, 189, 132, 0.22);
  --sf-muted: rgba(243, 232, 210, 0.6);
  --sf-red: #e6cf98;
  background: #0a0403;
}
.sf--dark .sf-links a {
  color: rgba(243, 232, 210, 0.8);
}
.sf--dark .sf-social-icon {
  color: rgba(243, 232, 210, 0.7);
}
.sf--dark .sf-social-img {
  filter: grayscale(100%) brightness(1.7) opacity(0.8);
}
.sf--dark .sf-brand img {
  padding: 4px 8px;
  border-radius: 8px;
  background: #fff;
}

@media (max-width: 599px) {
  .sf-inner {
    padding: 24px 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sf-social-btn,
  .sf-social-icon,
  .sf-social-img {
    transition: none;
  }
  .sf-social-btn:hover {
    transform: none;
  }
}
</style>
