interface SwipeNavOptions {
  threshold?: number;
  dragStartThreshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function useSwipeNavigate(options: SwipeNavOptions) {
  const { threshold = 80, dragStartThreshold = 10, onSwipeLeft, onSwipeRight } = options;

  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let isPotentialDrag = false;
  let isDragging = false;

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    isPotentialDrag = true;
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
    // TIDAK capture di sini — supaya klik pada tombol/tab/card tetap normal.
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isPotentialDrag || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!isDragging && Math.abs(dx) > dragStartThreshold && Math.abs(dx) > Math.abs(dy)) {
      isDragging = true;
    }
  };

  const endDrag = (e: PointerEvent) => {
    if (!isPotentialDrag || e.pointerId !== pointerId) return;
    if (isDragging) {
      const dx = e.clientX - startX;
      if (dx <= -threshold) onSwipeLeft?.();
      else if (dx >= threshold) onSwipeRight?.();
    }
    isPotentialDrag = false;
    isDragging = false;
    pointerId = null;
  };

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
}
