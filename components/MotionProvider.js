'use client';

import { MotionConfig } from 'motion/react';

// reducedMotion="user": pengguna yang mengaktifkan "kurangi gerakan" di OS tidak melihat
// animasi transform/layout, hanya perubahan opacity.
export function MotionProvider({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
