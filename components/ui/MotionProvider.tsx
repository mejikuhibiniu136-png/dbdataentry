'use client';
import { MotionConfig } from 'motion/react';
import { FAST } from '@/components/motion/variants';

// reducedMotion="user": pengguna dengan "kurangi gerakan" di OS tidak melihat animasi transform/layout.
// transition bawaan 150 ms berlaku untuk setiap motion.* yang tidak menetapkan transisinya sendiri.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={FAST}>{children}</MotionConfig>;
}
