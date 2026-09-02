"use client";

// QUANTEDGE PRO — client state (zustand). Authoritative state lives server-side (§34);
// this store holds only view state + cached API payloads (client preferences/cache allowed §34).

import { create } from "zustand";

export type TerminalView = "dashboard" | "markets" | "portfolio" | "signals" | "sentinel" | "research" | "learn" | "settings" | "admin";

interface AppState {
  entered: boolean;
  setEntered: (v: boolean) => void;
  view: TerminalView;
  setView: (v: TerminalView) => void;
  focusedSymbol: string;
  setFocusedSymbol: (s: string) => void;
  legalModal: "TOS" | "PRIVACY" | "REFUND" | null;
  setLegalModal: (m: "TOS" | "PRIVACY" | "REFUND" | null) => void;
  unreadNotifications: number;
  setUnreadNotifications: (n: number) => void;
}

export const useApp = create<AppState>((set) => ({
  entered: false,
  setEntered: (v) => set({ entered: v }),
  view: "dashboard",
  setView: (v) => set({ view: v }),
  focusedSymbol: "NVDA",
  setFocusedSymbol: (s) => set({ focusedSymbol: s }),
  legalModal: null,
  setLegalModal: (m) => set({ legalModal: m }),
  unreadNotifications: 0,
  setUnreadNotifications: (n) => set({ unreadNotifications: n }),
}));
