import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function PageSlide({ children, pageKey }: { children: ReactNode; pageKey: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 4, opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
      initial={reduce ? false : { y: 4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
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
          role="status"
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 4, opacity: 0 }}
          className="fixed right-8 bottom-8 z-50 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-lg"
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function SpinnerCheck({ done }: { done: boolean }) {
  return (
    <span className="inline-flex size-5 items-center justify-center">
      {!done ? (
        <motion.span
          className="size-4 rounded-full border-2 border-white/40 border-t-white"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
        />
      ) : (
        <motion.svg viewBox="0 0 16 16" className="size-5" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
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
