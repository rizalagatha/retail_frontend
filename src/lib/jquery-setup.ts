// src/lib/jquery-setup.ts
// File ini di-import PERTAMA di main.ts
// Tugasnya: expose jQuery ke window sebelum jquery-ui dan pivottable di-load

import jQuery from "jquery";

(window as Window & { jQuery: unknown; $: unknown }).jQuery = jQuery;
(window as Window & { jQuery: unknown; $: unknown }).$ = jQuery;
