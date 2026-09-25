/** CSS zoom scales DOMRects, while fixed-position styles and offset sizes use layout pixels. */
export function getLayoutViewport() {
  const parsedZoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
  const zoom = Number.isFinite(parsedZoom) && parsedZoom > 0 ? parsedZoom : 1;
  return { zoom, width: window.innerWidth / zoom, height: window.innerHeight / zoom };
}

export function toLayoutRect(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>, zoom: number) {
  return {
    left: rect.left / zoom,
    top: rect.top / zoom,
    right: rect.right / zoom,
    bottom: rect.bottom / zoom,
    width: rect.width / zoom,
  };
}
