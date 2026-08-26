"use client";

import { useEffect, useRef, useState } from "react";

/** Compteur animé (format français) déclenché à l'entrée dans le viewport. */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1600,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(to * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  const formatted = value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span ref={ref}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
