// src/lib/pivottable-setup.ts
//
// Strategi: import jQuery dulu, expose ke global, lalu
// jquery-ui dan pivottable di-load via script tag dinamis
// agar urutan eksekusi 100% terjamin di production build.

import jQuery from "jquery";

// Set window.jQuery SEKARANG — sinkron, sebelum apapun lain
(window as Window & { jQuery: unknown; $: unknown }).jQuery = jQuery;
(window as Window & { jQuery: unknown; $: unknown }).$ = jQuery;

// Helper load script eksternal secara berurutan
const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    // Skip jika sudah di-load
    if (document.querySelector(`script[data-lib="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.setAttribute("data-lib", src);
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(el);
  });

// Dipanggil sekali sebelum renderPivot pertama kali
export const initPivot = async (): Promise<void> => {
  // Cek apakah pivotUI sudah ter-attach ke jQuery
  const fn = (jQuery as unknown as { fn?: Record<string, unknown> }).fn;
  if (fn?.["pivotUI"]) return; // sudah siap, skip

  // Load berurutan dari CDN — 100% terjamin karena await satu per satu
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.13.3/jquery-ui.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pivottable/2.23.0/pivot.min.js");
};

export { jQuery };
