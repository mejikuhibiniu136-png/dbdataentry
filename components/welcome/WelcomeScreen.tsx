'use client';
import { motion } from 'motion/react';
import { ArrowRight, Radar, ShieldCheck, Users, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { titleReveal } from '@/components/motion/variants';
import { SceneBackdrop } from '@/components/three/SceneBackdrop';
import { WELCOME_COOKIE } from '@/lib/welcome';

const BLOBS = [
  { c: 'bg-[radial-gradient(closest-side,rgb(34_211_238/0.32),transparent)]', s: 'left-[8%] top-[10%] size-[28rem]', x: [0, 80, -40, 0], y: [0, 50, 90, 0], d: 18 },
  { c: 'bg-[radial-gradient(closest-side,rgb(139_92_246/0.32),transparent)]', s: 'right-[6%] top-[18%] size-[26rem]', x: [0, -90, 30, 0], y: [0, 70, -30, 0], d: 22 },
  { c: 'bg-[radial-gradient(closest-side,rgb(52_211_153/0.22),transparent)]', s: 'left-[35%] bottom-[-8%] size-[24rem]', x: [0, 60, -70, 0], y: [0, -60, 20, 0], d: 26 },
];
const FEATURES = [{ icon: Zap, key: 'welcome.f1' }, { icon: Users, key: 'welcome.f2' }, { icon: ShieldCheck, key: 'welcome.f3' }] as const;

export function WelcomeScreen({ username }: { username: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const enter = () => {
    setLeaving(true);
    document.cookie = `${WELCOME_COOKIE}=1; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setTimeout(() => router.replace('/'), 600);
  };

  return (
    <motion.main animate={{ opacity: leaving ? 0 : 1, scale: leaving ? 1.06 : 1 }} transition={{ duration: leaving ? 0.45 : 0.35, delay: leaving ? 0.15 : 0 }} className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      {/* Latar: adegan 3D three.js + blob bergerak + grid memudar */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <SceneBackdrop warp={leaving} lift={0.2} />
        {BLOBS.map((b, i) => (
          <motion.div key={i} className={`absolute rounded-full will-change-transform ${b.c} ${b.s}`} animate={{ x: b.x, y: b.y }} transition={{ duration: b.d, repeat: Infinity, ease: 'easeInOut' }} />
        ))}
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>

      {/* Scrim: area teks digelapkan lembut agar terbaca di atas adegan 3D */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_62%_40%_at_50%_54%,rgb(5_8_16/0.78),rgb(5_8_16/0.35)_55%,transparent_80%)]" />

      <div className="absolute right-4 top-4 z-10"><LanguageSwitcher compact align="right" /></div>

      <motion.section initial="hide" animate="show" transition={{ staggerChildren: 0.12, delayChildren: 0.1 }} className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
        <motion.span variants={{ hide: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }} className="ring-spin mb-6 grid size-16 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_48px_-8px_rgb(34_211_238/0.8)]">
          <Radar className="size-8" aria-hidden />
        </motion.span>
        <motion.h1 variants={titleReveal} className="glow-text bg-gradient-to-r from-white via-cyan-200 to-violet-300 bg-clip-text text-4xl font-bold text-transparent sm:text-6xl">
          {t('welcome.title', { name: username })}
        </motion.h1>
        <motion.p variants={{ hide: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }} className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">{t('welcome.subtitle')}</motion.p>

        <motion.ul variants={{ hide: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }} className="mt-8 flex flex-wrap justify-center gap-2.5">
          {FEATURES.map((f) => (
            <li key={f.key} className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-slate-200"><f.icon className="size-4 text-cyan-300" aria-hidden />{t(f.key)}</li>
          ))}
        </motion.ul>

        <motion.div variants={{ hide: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }} className="mt-10 flex flex-col items-center gap-3">
          <Button variant="primary" onClick={enter} disabled={leaving} className="px-7 py-3 text-base">
            {t('welcome.enter')}<ArrowRight className="size-4" aria-hidden />
          </Button>
          <p className="text-xs text-slate-500">{t('welcome.hint')}</p>
        </motion.div>
      </motion.section>
    </motion.main>
  );
}
