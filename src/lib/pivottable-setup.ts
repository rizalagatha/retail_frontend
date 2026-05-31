// src/lib/pivottable-setup.ts
// File ini HARUS di-import sebagai side-effect di main.ts
// Jangan pakai dynamic import untuk jQuery + jquery-ui + pivottable

import jQuery from "jquery";

// Expose ke global SEBELUM jquery-ui dan pivottable di-parse
// Ini kunci agar tidak ReferenceError di production build
(window as Window & typeof globalThis & { jQuery: unknown; $: unknown }).jQuery = jQuery;
(window as Window & typeof globalThis & { jQuery: unknown; $: unknown }).$ = jQuery;

export { jQuery };
