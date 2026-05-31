declare module "pivottable" {}
declare module "jquery-ui/dist/jquery-ui.js" {}

interface Window {
  jQuery: typeof import("jquery");
  $: typeof import("jquery");
}
