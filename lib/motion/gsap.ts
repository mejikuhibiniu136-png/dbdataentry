'use client';
// Satu pintu masuk GSAP: dipakai komponen client saja, jadi gsap tidak masuk bundel server.
// Semua animasi GSAP wajib lewat gsap.context (dibersihkan saat unmount) dan menghormati "kurangi gerakan".
import { gsap } from 'gsap';

export { gsap };

export const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches;

// Easing yang sama dengan lib motion (variants.ts) supaya dua mesin animasi terasa satu bahasa gerak.
export const EASE_OUT = 'power3.out';
export const EASE_SOFT = 'power2.inOut';
