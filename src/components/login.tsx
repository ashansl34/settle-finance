"use client";
import { useState } from "react";
import { signInWithEmail, signInWithGoogle } from "@/lib/backend";
import { ArrowUpRight, LockKeyhole } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [googleBusy, setGoogleBusy] = useState(false);

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await signInWithEmail(email);
      setMessage("Login link eka oyage Gmail inbox ekata yawwa. Email eka open karala link eka click karanna.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setGoogleBusy(true);
    setError("");
    setMessage("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message);
      setGoogleBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-glow one" />
      <div className="login-glow two" />
      <div className="login-card-wrap">
        <p className="login-title">Login to your account</p>
        <div className="login-form">
          <div className="login-logo">
            <span>settle</span>
            <i>
              <ArrowUpRight size={18} />
            </i>
          </div>
          <span className="icon-box">
            <LockKeyhole size={18} />
          </span>
          <h2>Continue with Google</h2>
          <p>
            Google login is the fastest way to open Settle on phone and desktop.
            Email link login stays as a backup.
          </p>
          <button
            className="google-login"
            type="button"
            disabled={googleBusy || busy}
            onClick={googleLogin}
          >
            <span className="google-mark">G</span>
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>
          <div className="login-divider">
            <span>OR EMAIL LINK</span>
          </div>
          <form onSubmit={emailLogin}>
            <label>
              Gmail or email address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="success" role="status">
                {message}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Sending link…" : "Send backup login link"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <div className="login-signup">
            Don’t have an account? <span>We’ll create it after email login</span>
          </div>
          <div className="login-note">
            No SMS OTP needed. Google login avoids email rate limits.
          </div>
        </div>
        <p>
          By creating an account and logging in to Settle you agree to our
          account terms.
        </p>
      </div>
    </div>
  );
}
