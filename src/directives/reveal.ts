import type { Directive } from "vue";

const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const observers = new WeakMap<HTMLElement, IntersectionObserver>();

export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    if (reduce()) return;

    el.classList.add("reveal");
    const step = (binding.value ?? 0) * 90;
    el.style.setProperty("--d", `${step}ms`);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        // requestAnimationFrame ganda: pastikan state awal (transparan) sempat dirender dulu
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("reveal--in")));
        io.disconnect();
        observers.delete(el);
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    observers.set(el, io);
    io.observe(el);
  },
  unmounted(el) {
    observers.get(el)?.disconnect();
    observers.delete(el);
  },
};
