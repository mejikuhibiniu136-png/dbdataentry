import type { Transition, Variants } from 'motion/react';

// Preset terpusat: satu "bahasa gerak" untuk seluruh aplikasi. Hanya transform + opacity (dikomposit
// GPU, tidak memicu layout/paint) sehingga tetap mulus di perangkat murah.
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const SPRING: Transition = { duration: 0.15, ease: EASE_OUT };
export const SPRING_SOFT: Transition = { duration: 0.15, ease: EASE_OUT };
export const SPRING_SNAPPY: Transition = { duration: 0.12, ease: EASE_OUT };

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT, when: 'beforeChildren', staggerChildren: 0.06 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.12, ease: 'easeIn' } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

export const rowVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: SPRING_SOFT },
  exit: { opacity: 0, x: 24, transition: { duration: 0.15 } },
};
