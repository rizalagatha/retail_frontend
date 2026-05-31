declare module "pivottable" {}
declare module "jquery-ui/dist/jquery-ui.js" {}

// Extend Window interface untuk jQuery global
interface Window {
  jQuery: typeof import("jquery");
  $: typeof import("jquery");
}
