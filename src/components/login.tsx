"use client";
import { useEffect, useRef, useState } from "react";
import {
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
export default function Login() {
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const captcha = useRef<RecaptchaVerifier | null>(null);
  useEffect(() => () => captcha.current?.clear(), []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (confirmation) await confirmation.confirm(code);
      else {
        if (!/^\+[1-9]\d{7,14}$/.test(phone))
          throw Error(
            "Use an international phone number, such as +94771234567.",
          );
        if (!captcha.current)
          captcha.current = new RecaptchaVerifier(auth!, "recaptcha", {
            size: "normal",
          });
        setConfirmation(
          await signInWithPhoneNumber(auth!, phone, captcha.current),
        );
      }
    } catch (e) {
      setError((e as Error).message);
      if (!confirmation) {
        captcha.current?.clear();
        captcha.current = null;
      }
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
          <h2>{confirmation ? "Enter your code" : "Secure sign in"}</h2>
          <p>
            {confirmation
              ? "We sent a one-time code to your phone."
              : "Use your phone number first. New members create their profile after verification."}
          </p>
          <form onSubmit={submit}>
            <label>
              {confirmation ? "Verification code" : "Phone number"}
              <input
                required
                type="tel"
                autoComplete={confirmation ? "one-time-code" : "tel"}
                value={confirmation ? code : phone}
                onChange={(e) =>
                  confirmation
                    ? setCode(e.target.value)
                    : setPhone(e.target.value)
                }
                placeholder={confirmation ? "6-digit code" : "+94 77 123 4567"}
              />
            </label>
            {!confirmation && <div id="recaptcha" />}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Just a moment…"
                : confirmation
                  ? "Verify & continue"
                  : "Continue"}
              <ArrowUpRight size={18} />
            </button>
            {confirmation ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setConfirmation(null);
                  setCode("");
                  captcha.current?.clear();
                  captcha.current = null;
                }}
              >
                Use another number / resend
              </button>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setError("Forgot password is not needed for phone OTP login.")
                }
              >
                Forgot password?
              </button>
            )}
          </form>
          <div className="login-signup">
            Don’t have an account? <span>Create it after OTP</span>
          </div>
          <div className="login-divider">
            <span>OR</span>
          </div>
          <div className="social-buttons">
            <button
              type="button"
              onClick={() =>
                setError(
                  "Continue with your phone first. Google can be linked to the same account after sign in.",
                )
              }
            >
              <b className="google-mark">G</b>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() =>
                setError(
                  "Microsoft sign-in can be added later with the same UID rule.",
                )
              }
            >
              <b className="ms-mark">
                <i />
                <i />
                <i />
                <i />
              </b>
              Continue with Microsoft
            </button>
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
