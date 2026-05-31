// src/lib/pivottable-setup.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jQuery = require("jquery");

// Set global SEBELUM require jquery-ui
(window as Window & { jQuery: unknown; $: unknown }).jQuery = jQuery;
(window as Window & { jQuery: unknown; $: unknown }).$ = jQuery;

// Baru load jquery-ui dan pivottable — keduanya akan menemukan window.jQuery
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("jquery-ui");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("pivottable");

export { jQuery };
