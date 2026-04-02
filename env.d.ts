/// <reference types="vite/client" />
import "vue-router";

declare module "*.vue" {
  import { DefineComponent } from "vue";
  const component: DefineComponent<unknown, object, unknown>;
  export default component;
}

declare module "vue-router" {
  interface RouteMeta {
    menuId?: string;
  }
}

declare module "*.png";
declare module "*.jpg";
declare module "*.jpeg";
declare module "*.gif";
declare module "*.svg";
