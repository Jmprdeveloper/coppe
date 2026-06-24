"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 480);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleScrollToTop}
      className="fixed bottom-24 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#0F4C5C]/25 bg-[#0F4C5C] text-white shadow-xl shadow-slate-950/20 transition hover:bg-[#0B3F4C] focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/30 lg:bottom-6 lg:right-6"
      aria-label="Subir al inicio"
      title="Subir al inicio"
    >
      <ChevronUp size={20} />
    </button>
  );
}
