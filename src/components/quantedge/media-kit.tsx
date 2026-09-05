"use client";

// Media Kit overlay — the launch kit (film, reels, ads, screenshots, docs)
// delivered INSIDE the product so it is always reachable from the preview URL.

import { AnimatePresence, motion } from "framer-motion";
import { Download, Film, Play, X } from "lucide-react";
import { KIT_GROUPS, FILM_FILE } from "@/lib/kit";

const K = (file: string) => `/api/kit/${encodeURIComponent(file)}`;

export function MediaKitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="qe-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div>
                <h2 className="qe-display text-base font-bold">Launch Media Kit</h2>
                <p className="text-[11px] text-muted-foreground">Film, reels, ad stills, screenshots & docs: stream or download</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-panel-3 hover:text-foreground" aria-label="Close media kit">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="qe-scroll overflow-y-auto px-5 py-4">
              {/* Hero film with inline player */}
              <div className="overflow-hidden rounded-xl border border-hairline bg-black/40">
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                  <Film className="h-4 w-4 text-brand" />
                  <span className="text-[13px] font-semibold">80-Second Ad Film · narrated, 720p</span>
                  <a href={K(FILM_FILE)} download={FILM_FILE} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-semibold text-white transition-transform hover:scale-[1.03]">
                    <Download className="h-3.5 w-3.5" /> Download MP4
                  </a>
                </div>
                <video
                  controls
                  preload="metadata"
                  playsInline
                  src={K(FILM_FILE)}
                  className="aspect-video w-full bg-black"
                  aria-label="DeeYoung Pro 80-second advertisement film with voiceover"
                />
                <p className="px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  Press play to watch right here, or download the MP4. Six 14-second scene cuts below are ready to post as reels.
                </p>
              </div>

              {KIT_GROUPS.filter((g) => g.title !== "The Film").map((group) => (
                <div key={group.title} className="mt-5">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.title}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <div key={item.file} className="flex items-center gap-3 rounded-xl border border-hairline px-3.5 py-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                          <Play className="h-4 w-4 text-brand" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{item.label}</p>
                          {item.note && <p className="truncate text-[11px] text-muted-foreground">{item.note}</p>}
                        </div>
                        <a
                          href={K(item.file)}
                          download={item.file}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:border-brand hover:text-brand"
                          aria-label={`Download ${item.label}`}
                        >
                          <Download className="h-3.5 w-3.5" /> Get
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <p className="mt-5 border-t border-hairline pt-3 text-[11px] text-muted-foreground">
                © DeeYoungs Ltd · Media kit served directly from the product — every asset is one click away.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
