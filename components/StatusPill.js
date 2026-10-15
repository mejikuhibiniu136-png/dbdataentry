'use client';

import { AnimatePresence, motion } from 'motion/react';

export const STATE_UI = {
  ONLINE: { cls: 'pill pill-ok', color: 'var(--ok)', label: 'ONLINE' },
  STALLED: { cls: 'pill pill-warn', color: 'var(--warn)', label: 'STALLED' },
  OFFLINE: { cls: 'pill pill-bad', color: 'var(--bad)', label: 'OFFLINE' },
};

// Pil status: label bertukar dengan crossfade, warna berubah halus (CSS transition),
// titik berdenyut hanya saat ONLINE.
export function StatusPill({ state }) {
  const ui = STATE_UI[state] || STATE_UI.OFFLINE;
  return (
    <span className={`${ui.cls} pill-anim`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          className="pill-inner"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          <span className={`dot${state === 'ONLINE' ? ' dot-live' : ''}`} />
          {ui.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
