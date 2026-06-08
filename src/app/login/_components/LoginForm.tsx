"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

const emailSchema = z.email("Enter a valid email.");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters.");
const nameSchema = z.string().trim().min(2, "Enter a name (2+ characters).");

function callbackUrl(next: string): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

function friendly(message: string): string {
  if (/invalid login/i.test(message)) return "Wrong email or password.";
  if (/already registered/i.test(message)) return "That email already has an account — sign in instead.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first (check your inbox).";
  return message;
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function fieldError(): string | null {
    const e = emailSchema.safeParse(email);
    if (!e.success) return e.error.issues[0]?.message ?? "Invalid email.";
    if (mode === "signup") {
      const n = nameSchema.safeParse(name);
      if (!n.success) return n.error.issues[0]?.message ?? "Invalid name.";
    }
    const p = passwordSchema.safeParse(password);
    if (!p.success) return p.error.issues[0]?.message ?? "Invalid password.";
    return null;
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const fe = fieldError();
    if (fe) return setError(fe);

    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: callbackUrl(next),
            data: { display_name: name.trim() },
          },
        });
        if (error) throw error;
        setNotice("Account created! Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    setError(null);
    setNotice(null);
    const e = emailSchema.safeParse(email);
    if (!e.success) return setError(e.error.issues[0]?.message ?? "Invalid email.");

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl(next) },
      });
      if (error) throw error;
      setNotice("Magic link sent! Check your email and tap the link to sign in.");
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card-lg bg-paper p-5 shadow-soft ring-1 ring-ink-soft/10">
      {/* Mode toggle */}
      <div className="mb-4 flex rounded-pill bg-paper-deep/50 p-1">
        {(["signin", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-pill py-1.5 text-sm font-semibold transition-colors ${
              mode === m
                ? "bg-paper text-ink shadow-soft"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={handlePassword} className="flex flex-col gap-3">
        {mode === "signup" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-soft">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              className="rounded-card border border-ink-soft/20 bg-background-light px-3 py-2 text-base text-ink outline-none focus:border-accent"
              placeholder="Explorer name"
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-soft">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="rounded-card border border-ink-soft/20 bg-background-light px-3 py-2 text-base text-ink outline-none focus:border-accent"
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-soft">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="rounded-card border border-ink-soft/20 bg-background-light px-3 py-2 text-base text-ink outline-none focus:border-accent"
            placeholder="••••••••"
          />
        </label>

        {error && <p className="text-sm font-medium text-ruby">{error}</p>}
        {notice && <p className="text-sm font-medium text-emerald">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex min-h-12 items-center justify-center rounded-pill bg-accent-deep px-6 text-base font-semibold text-paper shadow-button transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-ink-soft/15" />
        or
        <span className="h-px flex-1 bg-ink-soft/15" />
      </div>

      <button
        type="button"
        onClick={handleMagicLink}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center rounded-pill bg-paper-deep/70 px-6 text-base font-medium text-ink ring-1 ring-ink-soft/15 transition-all hover:bg-paper-deep active:scale-[0.98] disabled:opacity-60"
      >
        ✉️ Email me a magic link
      </button>
    </div>
  );
}
