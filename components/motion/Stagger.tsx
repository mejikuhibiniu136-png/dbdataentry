'use client';
import { motion, type HTMLMotionProps } from 'motion/react';
import { itemVariants, pageVariants } from '@/components/motion/variants';

// <PageTransition> memutar fade 150 ms untuk halaman; <StaggerItem> mewarisi variants dari induknya.
// Tidak ada gerak vertikal: konten tidak bergeser sehingga tidak menambah CLS.
export function PageTransition({ children, ...rest }: HTMLMotionProps<'div'>) {
  return <motion.div variants={pageVariants} initial="hidden" animate="show" exit="exit" {...rest}>{children}</motion.div>;
}

export function StaggerItem({ children, ...rest }: HTMLMotionProps<'div'>) {
  return <motion.div variants={itemVariants} {...rest}>{children}</motion.div>;
}
