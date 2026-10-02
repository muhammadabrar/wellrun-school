import { useQueryClient } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import { normalizePhoneInput } from "@/lib/phone";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton, Card, LanguageToggle } from "@/components/ui";
import { ApiError, api, setToken } from "@/lib/api";
import { showPhone } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys } from "@/lib/queries";

/** Two steps, one question each: your number, then the code we sent. */
export function LoginPage() {
  const { m, adoptServerLocale } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  // A countdown on the screen: local timer only, no server calls.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const normalized = normalizePhoneInput(phone);

  function failure(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      if (err.status === 0) return m.common.offline;
      if (err.status === 429) {
        if (err.retryAfter) setWait(err.retryAfter);
        return m.login.tooMany;
      }
      if (err.status === 503) return m.login.sendFailed;
    }
    return fallback;
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!normalized) {
      setError(m.login.invalidPhone);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.requestOtp(normalized);
      setStep("code");
      setCode("");
      setWait(result.resendAfter);
    } catch (err) {
      setError(failure(err, m.login.sendFailed));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(m.login.wrongCode);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyOtp(normalized!, code, deviceName());
      setToken(session.token);
      queryClient.setQueryData(keys.me, { parent: session.parent, children: session.children });
      adoptServerLocale(session.parent.locale);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(/expired|already|Too many/i.test(err.message) ? m.login.expiredCode : m.login.wrongCode);
      } else {
        setError(failure(err, m.common.wrong));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-4">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="mt-6 flex flex-1 flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-indigo text-white">
            <img src="/icon.svg" alt="" className="size-20 rounded-3xl" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold">{step === "phone" ? m.login.welcome : m.login.codeTitle}</h1>
          <p className="mt-2 text-lg text-muted">{step === "phone" ? m.login.intro : fmt(m.login.codeIntro, { phone: `\u2066${showPhone(normalized ?? "")}\u2069` })}</p>
        </div>

        <Card>
          {step === "phone" ? (
            <form onSubmit={sendCode} className="space-y-4">
              <label htmlFor="phone" className="block text-lg font-semibold">
                {m.login.phoneLabel}
              </label>
              <input
                id="phone"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={m.login.phonePlaceholder}
                className="h-16 w-full rounded-2xl border-2 border-line bg-white px-4 text-start text-2xl tracking-wide focus:border-indigo"
              />
              <p className="text-base text-muted">{m.login.registeredHint}</p>
              {error ? (
                <p role="alert" className="text-lg font-semibold text-danger">
                  {error}
                </p>
              ) : null}
              <BigButton type="submit" disabled={busy}>
                {m.login.sendCode}
              </BigButton>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <label htmlFor="code" className="block text-lg font-semibold">
                {m.login.codeLabel}
              </label>
              <input
                id="code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="------"
                className="h-16 w-full rounded-2xl border-2 border-line bg-white px-4 text-center text-3xl tracking-[0.5em] focus:border-indigo"
              />
              {error ? (
                <p role="alert" className="text-lg font-semibold text-danger">
                  {error}
                </p>
              ) : null}
              <BigButton type="submit" disabled={busy || code.length !== 6}>
                {m.login.continue}
              </BigButton>
              <BigButton tone="light" disabled={busy || wait > 0} onClick={() => void sendCode()}>
                {wait > 0 ? fmt(m.login.resendIn, { seconds: wait }) : m.login.resend}
              </BigButton>
              <button
                type="button"
                className="w-full py-2 text-lg font-semibold text-indigo"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                }}
              >
                {m.login.changeNumber}
              </button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

/** A short name for this phone, so the parent can recognise it later in "Phones signed in". */
function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android phone" : /Windows/.test(ua) ? "Windows computer" : /Mac/.test(ua) ? "Mac" : "Phone";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "browser";
  return `${os}, ${browser}`;
}
