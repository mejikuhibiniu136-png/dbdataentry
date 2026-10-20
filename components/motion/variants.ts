import type { Transition, Variants } from 'motion/react';

// Satu "bahasa gerak" untuk seluruh aplikasi. Aturan keras: tidak ada transisi yang lebih panjang dari
// MAX_MS (150 ms) supaya umpan balik terasa instan. Hanya transform + opacity (dikomposit GPU).
// Spring dihapus karena durasinya tidak terbatas; semuanya tween dengan durasi tetap.
export const MAX_MS = 150;
export const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1];
export const FAST: Transition = { duration: MAX_MS / 1000, ease: EASE_OUT };
export const SPRING: Transition = FAST;
export const SPRING_SOFT: Transition = FAST;
export const SPRING_SNAPPY: Transition = FAST;

export const pageVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: FAST },
  exit: { opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: FAST },
};

export const rowVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: FAST },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
