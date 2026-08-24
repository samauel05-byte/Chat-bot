"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const LETTERS = ["N", "A", "L", "A"];

const ACRONYM = [
  { letter: "N", word: "Núcleo" },
  { letter: "A", word: "Automatizado" },
  { letter: "L", word: "de Listados" },
  { letter: "A", word: "Administrativos" },
];

// Accounting + bot themed particles: [symbol, x%, duration(s), delay(s), size(rem), opacity]
const PARTICLES: [string, number, number, number, number, number][] = [
  ["606",    4,  9,  0.0, 0.75, 0.12],
  ["607",   91,  11, 0.5, 0.75, 0.12],
  ["%",      8,  7,  1.2, 1.1,  0.10],
  ["$",     20,  8,  0.3, 1.3,  0.11],
  ["RD$",   80,  10, 1.8, 0.7,  0.10],
  ["NCF",   35,  12, 0.0, 0.7,  0.09],
  ["ITBIS", 65,  9,  2.1, 0.65, 0.09],
  ["RNC",   50,  8,  0.7, 0.7,  0.10],
  ["🤖",    14,  13, 1.0, 1.2,  0.13],
  ["📊",    75,  10, 0.0, 1.1,  0.13],
  ["🧾",    28,  11, 1.5, 1.0,  0.12],
  ["💰",    88,  8,  0.9, 1.0,  0.12],
  ["📈",    42,  14, 0.2, 1.1,  0.11],
  ["=",     57,  7,  1.7, 1.4,  0.09],
  ["+",     70,  9,  0.4, 1.3,  0.08],
  ["0.00",  96,  12, 1.1, 0.65, 0.09],
  ["∑",     22,  10, 2.0, 1.2,  0.10],
  ["#",     85,  8,  0.6, 1.1,  0.08],
  ["€",      3,  11, 2.3, 1.2,  0.09],
  ["B01",   47,  9,  1.4, 0.7,  0.09],
  ["B04",   60,  13, 0.0, 0.7,  0.08],
  ["📋",    38,  10, 0.8, 1.0,  0.11],
  ["₿",     72,  8,  1.9, 1.1,  0.08],
  ["⚙",     10,  12, 0.5, 1.1,  0.09],
  ["AI",    55,  7,  2.5, 0.8,  0.10],
];

type Phase = "letters" | "acronym" | "tagline" | "done";

export function Splash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("letters");
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("acronym"), 900),
      setTimeout(() => setPhase("tagline"), 1900),
      setTimeout(() => setPhase("done"), 3400),
      setTimeout(() => setExiting(true), 3500),
      setTimeout(onDone, 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  function skip() {
    if (exiting) return;
    setExiting(true);
    setTimeout(onDone, 500);
  }

  const active = phase === "acronym" || phase === "tagline" || phase === "done";

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          role="button"
          tabIndex={0}
          aria-label="Omitir presentación de NALA"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-violet-950 select-none cursor-pointer overflow-hidden"
          onClick={skip}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") skip();
          }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* ── Floating accounting + bot particles ── */}
          <div className="pointer-events-none absolute inset-0">
            {PARTICLES.map(([symbol, x, duration, delay, size, opacity], i) => (
              <motion.span
                key={i}
                className="absolute bottom-0 font-mono text-violet-300 whitespace-nowrap"
                style={{
                  left: `${x}%`,
                  fontSize: `${size}rem`,
                  opacity,
                }}
                animate={{ y: ["0%", "-120vh"] }}
                transition={{
                  duration,
                  delay,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                {symbol}
              </motion.span>
            ))}
          </div>

          {/* ── Ambient glow ── */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[120px]" />
          </div>

          {/* ── NALA letters ── */}
          <div className="relative flex gap-3 sm:gap-5">
            {LETTERS.map((letter, i) => (
              <motion.span
                key={i}
                className="text-7xl font-black tracking-tight text-white sm:text-[9rem] drop-shadow-2xl"
                initial={{ opacity: 0, y: 60, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  delay: i * 0.12,
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {letter}
              </motion.span>
            ))}
          </div>

          {/* ── Acronym breakdown ── */}
          <motion.div
            className="relative mt-8 flex flex-col items-start gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: 0.5 }}
          >
            {ACRONYM.map(({ letter, word }, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: active ? 1 : 0, x: active ? 0 : -24 }}
                transition={{ delay: 0.1 + i * 0.09, duration: 0.4, ease: "easeOut" }}
              >
                <span className="w-5 text-right text-base font-bold text-white/90 sm:text-lg">
                  {letter}
                </span>
                <span className="h-px w-4 bg-violet-400/50" />
                <span className="text-sm text-violet-300 sm:text-base">{word}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Tagline ── */}
          <motion.p
            className="relative mt-10 text-sm text-violet-400 sm:text-base"
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: phase === "tagline" || phase === "done" ? 1 : 0,
              y: phase === "tagline" || phase === "done" ? 0 : 8,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            🤖 Automatiza la preparación de información para la DGII
          </motion.p>

          {/* ── Skip hint ── */}
          <motion.p
            className="absolute bottom-8 text-xs text-violet-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "tagline" || phase === "done" ? 1 : 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Toca para continuar
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
