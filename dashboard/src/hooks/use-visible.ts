import { useEffect, useState, type RefObject } from "react";

const callbacks = new WeakMap<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

function shared(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
      },
      { rootMargin: "240px 0px" },
    );
  }
  return observer;
}

/** Whether the element is near the viewport, via one shared IntersectionObserver. */
export function useVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    callbacks.set(element, setVisible);
    const io = shared();
    io.observe(element);
    return () => {
      io.unobserve(element);
      callbacks.delete(element);
    };
  }, [ref]);
  return visible;
}
