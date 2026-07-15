"use client";

import { Eye, EyeOff, Loader2, LockKeyhole, Zap } from "lucide-react";
import { FormEvent, useState } from "react";
import { api, setAccessToken, User } from "@/lib/api";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const result = mode === "login"
        ? await api.login({ email, password })
        : await api.register({ email, full_name: fullName, password });
      setAccessToken(result.access_token);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="brand-mark"><Zap size={24} /></div>
          <div><h1>AI Energy Data Analyst</h1><p>Operations workspace</p></div>
        </div>
        <div className="auth-heading">
          <LockKeyhole size={22} />
          <div><h2>{mode === "login" ? "Sign in" : "Create account"}</h2><p>{mode === "login" ? "Use your workspace credentials" : "The first account becomes administrator"}</p></div>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>Full name<input autoComplete="name" onChange={(event) => setFullName(event.target.value)} required value={fullName} /></label>
          ) : null}
          <label>Email<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>
            Password
            <span className="password-field">
              <input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : undefined} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} />
              <button aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)} title={showPassword ? "Hide password" : "Show password"} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          {error ? <div className="error-banner">{error}</div> : null}
          <button className="primary-command" disabled={isSubmitting} type="submit">{isSubmitting ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}{mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="auth-mode" onClick={() => { setMode((current) => current === "login" ? "register" : "login"); setError(""); }} type="button">
          {mode === "login" ? "Create an account" : "Back to sign in"}
        </button>
      </section>
    </main>
  );
}
