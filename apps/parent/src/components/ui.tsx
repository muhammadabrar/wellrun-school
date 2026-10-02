import { ChevronLeft, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/lib/i18n";
import { errorText } from "@/lib/queries";

export function LanguageToggle() {
  const { locale, setLocale, m } = useLocale();
  const target = locale === "en" ? "ur" : "en";
  const name = target === "ur" ? m.languageNames.ur : m.languageNames.en;
  return (
    <button
      type="button"
      onClick={() => setLocale(target)}
      aria-label={m.more.switchTo.replace("{language}", name)}
      className="min-h-11 rounded-full bg-white px-4 text-base font-semibold text-indigo shadow-sm ring-1 ring-line active:bg-paper"
    >
      {name}
    </button>
  );
}

/** Every screen: where you are, a way back, the language switch. Nothing else. */
export function Screen({ title, back, children, more = true }: { title: string; back?: string; children: ReactNode; more?: boolean }) {
  const { m } = useLocale();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md pb-12">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-paper/95 px-4 py-3 backdrop-blur">
        {back ? (
          <Link to={back} aria-label={m.common.back} className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper">
            <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
          </Link>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
        <LanguageToggle />
        {more ? (
          <Link to="/more" aria-label={m.more.title} className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper">
            <Settings className="size-5" aria-hidden />
          </Link>
        ) : null}
      </header>
      <main className="space-y-4 px-4 pt-2">{children}</main>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line ${className}`}>{children}</section>;
}

type Tone = "green" | "red" | "orange" | "indigo" | "grey";

const TONES: Record<Tone, string> = {
  green: "bg-success/10 text-success",
  red: "bg-danger/10 text-danger",
  orange: "bg-orange/10 text-orange",
  indigo: "bg-indigo/10 text-indigo",
  grey: "bg-paper text-muted ring-1 ring-line",
};

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-base font-semibold ${TONES[tone]}`}>{children}</span>;
}

export const SOLID_TONES: Record<Tone, string> = {
  green: "bg-success text-white",
  red: "bg-danger text-white",
  orange: "bg-orange text-white",
  indigo: "bg-indigo text-white",
  grey: "bg-paper text-muted ring-1 ring-line",
};

/** The big square buttons on a child's home. One picture, one word. */
export function Tile({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: ReactNode }) {
  return (
    <Link to={to} className="relative flex min-h-36 flex-col items-center justify-center gap-3 rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-line active:bg-paper">
      <span className="grid size-16 place-items-center rounded-2xl bg-indigo/10 text-indigo">{icon}</span>
      <span className="text-lg font-semibold leading-tight">{label}</span>
      {badge ? <span className="absolute end-3 top-3">{badge}</span> : null}
    </Link>
  );
}

export function Loading() {
  const { m } = useLocale();
  return (
    <div role="status" aria-label={m.common.loading} className="space-y-4">
      <div className="h-28 animate-pulse rounded-3xl bg-white ring-1 ring-line" />
      <div className="h-28 animate-pulse rounded-3xl bg-white ring-1 ring-line" />
      <div className="h-28 animate-pulse rounded-3xl bg-white ring-1 ring-line" />
    </div>
  );
}

export function BigButton({ children, onClick, disabled, tone = "indigo", type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "indigo" | "light"; type?: "button" | "submit" }) {
  const style = tone === "indigo" ? "bg-indigo text-white active:bg-indigo-deep" : "bg-white text-ink ring-1 ring-line active:bg-paper";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold disabled:opacity-50 ${style}`}>
      {children}
    </button>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { m } = useLocale();
  return (
    <Card className="text-center">
      <p className="text-lg">{errorText(m, error)}</p>
      <div className="mt-4">
        <BigButton onClick={onRetry}>{m.common.retry}</BigButton>
      </div>
    </Card>
  );
}

export function Empty({ title, help }: { title: string; help?: string }) {
  return (
    <Card className="text-center">
      <p className="text-lg font-semibold">{title}</p>
      {help ? <p className="mt-2 text-base text-muted">{help}</p> : null}
    </Card>
  );
}

/** A child's picture, or their first letter when the school has no photo. */
export function Avatar({ name, photo, size = "size-16" }: { name: string; photo?: string; size?: string }) {
  return photo ? (
    <img src={photo} alt="" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-white`} />
  ) : (
    <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full bg-indigo/10 text-2xl font-semibold text-indigo`}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
