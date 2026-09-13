import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function PageSlide({ children, pageKey }: { children: ReactNode; pageKey: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial={{ x: 28, opacity: 0, filter: "blur(6px)" }}
        animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
        exit={{ x: -20, opacity: 0, filter: "blur(4px)" }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function NumberPop({ value }: { value: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      key={value}
      initial={reduce ? false : { y: 8, opacity: 0, filter: "blur(6px)" }}
      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="inline-block"
    >
      {value.toLocaleString("en-PK")}
    </motion.span>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          initial={{ y: 16, opacity: 0, scale: 0.96, filter: "blur(6px)" }}
          animate={{ y: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ y: 8, opacity: 0 }}
          className="fixed right-8 bottom-8 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg"
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function SpinnerCheck({ done }: { done: boolean }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center">
      {!done ? (
        <motion.span
          className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
        />
      ) : (
        <motion.svg viewBox="0 0 16 16" className="h-5 w-5" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
          <motion.path
            d="M3 8.5 6.2 12 13 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35 }}
          />
        </motion.svg>
      )}
    </span>
  );
}
