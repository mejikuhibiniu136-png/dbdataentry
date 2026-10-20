'use client';
import { motion, type HTMLMotionProps } from 'motion/react';
import { rowVariants } from '@/components/motion/variants';

// Baris tabel dengan fade 150 ms. Tanpa layout animation: baris tidak meluncur sehingga tidak ada pergeseran
// tata letak (CLS = 0). Bungkus daftar dengan <AnimatePresence initial={false}>.
export function AnimatedRow({ children, ...rest }: HTMLMotionProps<'tr'>) {
  return (
    <motion.tr variants={rowVariants} initial="hidden" animate="show" exit="exit" {...rest}>{children}</motion.tr>
  );
}
