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

type Phase = "letters" | "acronym" | "tagline" | "done";

export function Splash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("letters");
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("acronym"), 900),
      setTimeout(() => setPhase("tagline"), 1900),
      setTimeout(() => setPhase("done"), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase === "done") {
      setExiting(true);
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
  }, [phase, onDone]);

  function skip() {
    if (exiting) return;
    setExiting(true);
    setTimeout(onDone, 500);
  }

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-indigo-950 select-none cursor-pointer overflow-hidden"
          onClick={skip}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
          </div>

          {/* NALA letters */}
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

          {/* Acronym breakdown */}
          <motion.div
            className="relative mt-8 flex flex-col items-start gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "acronym" || phase === "tagline" || phase === "done" ? 1 : 0 }}
            transition={{ duration: 0.5 }}
          >
            {ACRONYM.map(({ letter, word }, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -24 }}
                animate={{
                  opacity: phase === "acronym" || phase === "tagline" || phase === "done" ? 1 : 0,
                  x: phase === "acronym" || phase === "tagline" || phase === "done" ? 0 : -24,
                }}
                transition={{ delay: 0.1 + i * 0.09, duration: 0.4, ease: "easeOut" }}
              >
                <span className="w-5 text-right text-base font-bold text-white/90 sm:text-lg">
                  {letter}
                </span>
                <span className="h-px w-4 bg-indigo-400/50" />
                <span className="text-sm text-indigo-300 sm:text-base">{word}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Tagline */}
          <motion.p
            className="relative mt-10 text-sm text-indigo-400 sm:text-base"
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: phase === "tagline" || phase === "done" ? 1 : 0,
              y: phase === "tagline" || phase === "done" ? 0 : 8,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            🤖 Automatiza la preparación de información para la DGII
          </motion.p>

          {/* Skip hint */}
          <motion.p
            className="absolute bottom-8 text-xs text-indigo-600"
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
