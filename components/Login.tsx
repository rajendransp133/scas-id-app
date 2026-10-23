"use client";
/* eslint-disable @next/next/no-img-element -- static export, images are unoptimised anyway */

import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/browser/auth";
import { inputCls } from "./ui";

// The college ERP's sign-in screen: campus photo on the left (lg and up),
// a banner strip on top below lg, and the form on a muted ground.

const COLLEGE = "Sudharsan College of Arts and Science";
const MOTTO = "An Institution with Academic Excellence, Employability and Leadership Skills";
const SITE = "https://scascollege.ac.in/";

function Icon({ d, className = "size-4" }: { d: string[]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-none ${className}`}>
      {d.map((p) => <path key={p} d={p} />)}
    </svg>
  );
}

const PIN = ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6"];
const EXTERNAL = ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"];
const LOG_IN = ["m10 17 5-5-5-5", "M15 12H3", "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"];
const EYE = ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"];
const EYE_OFF = ["M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49", "M14.084 14.158a3 3 0 0 1-4.242-4.242", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143", "m2 2 20 20"];

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!signIn(username, password)) setError("Incorrect username or password.");
  };

  return (
    <div className="grid min-h-dvh bg-frame lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden lg:block">
        <img src="/campus/college-front.webp" alt="Front view of the college"
             className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-3">
            <div className="size-14 flex-none rounded-full bg-white/95 p-1.5">
              <img src="/sudharsan_college_logo.webp" alt={`${COLLEGE} crest`} className="size-full object-contain" />
            </div>
            <span className="text-sm font-medium tracking-wide text-white/90">{COLLEGE}</span>
          </div>
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="max-w-lg text-balance text-3xl font-semibold leading-tight">{MOTTO}</h2>
              <p className="flex items-center gap-1.5 text-sm text-white/80">
                <Icon d={PIN} />Perumanadu, Pudukkottai - 622 104, Tamil Nadu
              </p>
            </div>
            <div className="flex gap-3">
              <img src="/campus/hero-slide-2.webp" alt="Students studying on the Perumanadu campus"
                   className="h-20 w-32 rounded-lg object-cover ring-1 ring-white/30" />
              <img src="/campus/hero-slide-3.webp" alt="Graduates tossing their caps at convocation"
                   className="h-20 w-32 rounded-lg object-cover ring-1 ring-white/30" />
            </div>
            <a href={SITE} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:bg-white/25">
              Visit scascollege.ac.in<Icon d={EXTERNAL} />
            </a>
          </div>
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="relative h-40 lg:hidden">
          <img src="/campus/college-front.webp" alt="Front view of the college"
               className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-frame/95 to-black/10" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <img src="/sudharsan_college_logo.webp" alt={`${COLLEGE} crest`} className="size-16 object-contain" />
              <div className="space-y-1">
                <h1 className="text-balance text-lg font-semibold leading-tight">{COLLEGE}</h1>
                <p className="text-balance text-xs text-muted lg:hidden">{MOTTO}</p>
              </div>
            </div>

            <section className="flex flex-col gap-4 rounded-xl bg-sheet py-4 ring-1 ring-ink/10">
              <header className="grid gap-1 px-4">
                <h2 className="text-base font-medium leading-snug">Sign in</h2>
                <p className="text-sm text-muted">Use the account issued to you by the college office.</p>
              </header>
              <form onSubmit={submit} className="space-y-4 px-4">
                <div className="space-y-2">
                  <label htmlFor="login-username" className="block text-sm font-medium leading-none">Username</label>
                  <input id="login-username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                         required autoFocus placeholder="Your username" value={username}
                         aria-invalid={!!error || undefined}
                         onChange={(e) => { setUsername(e.target.value); setError(""); }}
                         className={`${inputCls} w-full rounded-lg aria-invalid:border-negative`} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="login-password" className="block text-sm font-medium leading-none">Password</label>
                  <div className="relative">
                    <input id="login-password" type={show ? "text" : "password"} autoComplete="current-password"
                           required placeholder="••••••••" value={password}
                           aria-invalid={!!error || undefined}
                           aria-describedby={error ? "login-error" : undefined}
                           onChange={(e) => { setPassword(e.target.value); setError(""); }}
                           className={`${inputCls} w-full rounded-lg pr-9 aria-invalid:border-negative`} />
                    <button type="button" onClick={() => setShow((s) => !s)}
                            aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                            title={show ? "Hide password" : "Show password"}
                            className="absolute inset-y-0 right-1 my-auto flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
                      <Icon d={show ? EYE_OFF : EYE} />
                    </button>
                  </div>
                </div>
                {error && <p id="login-error" role="alert" className="text-sm text-negative">{error}</p>}
                <button type="submit"
                        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink pointer-coarse:h-10">
                  <Icon d={LOG_IN} />Sign in
                </button>
              </form>
            </section>

            <p className="text-center text-xs text-muted">
              Forgotten your password? Contact the college office. ·{" "}
              <a href={SITE} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                scascollege.ac.in
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
