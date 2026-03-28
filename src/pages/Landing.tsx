import { motion } from 'framer-motion'
import { Users, UserPlus, Trophy, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

const scoring = [
  { label: 'Hole in One', pts: '+15', color: 'var(--color-gold)' },
  { label: 'Albatross', pts: '+12', color: 'var(--color-gold)' },
  { label: 'Eagle', pts: '+8', color: 'var(--color-score-eagle)' },
  { label: 'Birdie', pts: '+3', color: 'var(--color-score-birdie)' },
  { label: 'Par', pts: '0', color: 'var(--color-score-par)' },
  { label: 'Bogey', pts: '-1', color: 'var(--color-score-bogey)' },
  { label: 'Double', pts: '-3', color: 'var(--color-score-double)' },
  { label: 'Made Cut', pts: '+2', color: 'var(--color-score-eagle)' },
]

const steps = [
  {
    number: 1,
    title: 'Create a Pool',
    description: 'Set up a private pool and invite friends with a join code. Or browse public pools.',
    Icon: Users,
  },
  {
    number: 2,
    title: 'Pick 6 Golfers',
    description: 'Select 6 players from the Masters field before tee-off Thursday. No changes once locked.',
    Icon: UserPlus,
  },
  {
    number: 3,
    title: 'Earn Points',
    description: 'Score points on every birdie, eagle, and ace your golfers make across all four rounds.',
    Icon: TrendingUp,
  },
  {
    number: 4,
    title: 'Win the Pool',
    description: 'Highest total points at the end of Sunday wins. Track live on the leaderboard.',
    Icon: Trophy,
  },
] as const

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
}

const staggerItem = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

export function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'var(--color-background)' }}>

      {/* ========== HERO ========== */}
      <section className="relative flex flex-col items-center justify-center px-4 pt-32 pb-16 text-center overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#080b10] via-[#071a0f] to-[#080b10]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,135,0.10)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(201,168,76,0.06)_0%,transparent_50%)]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#080b10] to-transparent" />

        <div className="relative z-10 flex flex-col items-center">
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-3 text-xs font-mono uppercase tracking-widest text-neon-green/70"
          >
            Masters 2026 · April 10–13 · Augusta National
          </motion.p>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="font-display text-5xl sm:text-7xl tracking-wide text-[var(--color-foreground)]"
          >
            Tournament{' '}
            <span
              className="text-neon-green"
              style={{ textShadow: '0 0 30px rgba(0,255,135,0.5), 0 0 60px rgba(0,255,135,0.2)' }}
            >
              Player Pool
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
            className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Pick 6 golfers from the Masters field. Earn points on every birdie, eagle, and ace.
            Compete in private pools with friends. Best roster wins.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.35 }}
            className="mt-8 flex flex-col sm:flex-row items-center gap-4"
          >
            <Link
              to="/pools/create"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neon-green px-6 py-3 font-semibold text-gray-900 transition-shadow hover:shadow-[0_0_20px_rgba(0,255,135,0.4)]"
            >
              Create a Pool
            </Link>
            <Link
              to="/pools"
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 font-semibold transition-colors hover:bg-[var(--color-muted)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
            >
              Browse Pools
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ========== SCORING ========== */}
      <section className="relative mx-auto max-w-3xl px-4 pb-16">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <h2 className="font-display text-2xl sm:text-3xl tracking-wide" style={{ color: 'var(--color-foreground)' }}>
            Points-Based Scoring
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
            Every shot counts. Accumulate points across all four rounds.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-4 sm:grid-cols-8 gap-2"
        >
          {scoring.map(({ label, pts, color }) => (
            <motion.div
              key={label}
              variants={staggerItem}
              className="rounded-xl border p-3 text-center"
              style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <p className="font-mono font-bold text-xl" style={{ color }}>{pts}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-muted-foreground)' }}>{label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="relative mx-auto max-w-5xl px-4 pb-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="font-display text-2xl sm:text-3xl tracking-wide" style={{ color: 'var(--color-foreground)' }}>
            How It Works
          </h2>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {steps.map(({ number, title, description, Icon }) => (
            <motion.div
              key={number}
              variants={staggerItem}
              className="relative rounded-xl border p-6 text-center"
              style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full font-display text-lg text-neon-green"
                style={{ background: 'rgba(0,255,135,0.1)' }}>
                {number}
              </span>
              <Icon className="mx-auto mb-3 h-7 w-7 text-neon-green" />
              <h3 className="font-display text-xl tracking-wide" style={{ color: 'var(--color-foreground)' }}>
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-muted-foreground)' }}>
                {description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-14 text-center"
        >
          <Link
            to="/pools/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neon-green px-8 py-3 font-semibold text-gray-900 transition-shadow hover:shadow-[0_0_20px_rgba(0,255,135,0.4)]"
          >
            Start Playing
          </Link>
        </motion.div>
      </section>
    </div>
  )
}
