"use client";
import { useEffect } from "react";

// Cards keep their detail in a native <details>. A link to #<card id> (from the index, another page or a
// shared URL) opens that card's details and scrolls the card into view. Renders nothing.
export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const card = document.getElementById(id);
      const details = card?.querySelector("details");
      if (!card || !details) return;
      details.open = true;
      card.scrollIntoView({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
