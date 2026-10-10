"use client";
import { useState } from "react";
import { signInWithEmail } from "@/lib/backend";
import { ArrowUpRight, LockKeyhole } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

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
          <h2>Secure Gmail OTP login</h2>
          <p>
            Enter your Gmail address. We’ll send a secure login link to your
            inbox. No SMS OTP needed.
          </p>
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
              {busy ? "Sending link…" : "Send Gmail login link"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <div className="login-signup">
            Don’t have an account? <span>We’ll create it after email login</span>
          </div>
          <div className="login-divider">
            <span>NO SMS OTP</span>
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
