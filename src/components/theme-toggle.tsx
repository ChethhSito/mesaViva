"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "mesa-viva-theme";

export default function ThemeToggle() {
  useEffect(() => {
    function syncTheme() {
      document.documentElement.dataset.theme =
        window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
    }
    syncTheme();
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(storageKey, next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar entre tema claro y oscuro"
    >
      <Sun className="theme-icon-sun" size={19} aria-hidden="true" />
      <Moon className="theme-icon-moon" size={19} aria-hidden="true" />
    </button>
  );
}
