"use client";

import { useSyncExternalStore } from "react";

const PALETTE_KEY = "tokenLedgerPalette";
const DEFAULT_PALETTE = "cream";

const paletteListeners = new Set<() => void>();

function subscribePalette(listener: () => void): () => void {
  paletteListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PALETTE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    paletteListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getPaletteSnapshot(): string {
  try {
    return localStorage.getItem(PALETTE_KEY) || DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

function getPaletteServerSnapshot(): string {
  return DEFAULT_PALETTE;
}

export function usePalette(): string {
  return useSyncExternalStore(
    subscribePalette,
    getPaletteSnapshot,
    getPaletteServerSnapshot,
  );
}

export function writePalette(p: string): void {
  try {
    localStorage.setItem(PALETTE_KEY, p);
  } catch {}
  paletteListeners.forEach((l) => l());
}
