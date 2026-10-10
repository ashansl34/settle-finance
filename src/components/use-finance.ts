"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, configured, remote } from "@/lib/firebase";
import { Command, State, emptyState } from "@/lib/model";
import { accrueTrust, execute, project } from "@/lib/engine";
import { seed } from "@/lib/seed";
const KEY = "settle-demo-v1";
export function useFinance() {
  const [state, setState] = useState<State | null>(null),
    [uid, setUid] = useState("ashan"),
    [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const full = useRef<State | null>(null),
    acting = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (configured) {
      if (acting.current || auth?.currentUser?.uid !== uid) return;
      const version = revision.current;
      try {
        const response = await remote();
        if (version === revision.current && auth?.currentUser?.uid === uid) {
          setState(response.state);
          setError("");
        }
      } catch (e) {
        if (version === revision.current) setError((e as Error).message);
      }
    } else if (full.current) {
      accrueTrust(full.current, Date.now());
      setState(project(full.current, uid));
    }
  }, [uid]);
  useEffect(() => {
    if (auth)
      return onAuthStateChanged(auth, async (u) => {
        const version = ++revision.current;
        setUser(u);
        setState(null);
        setError("");
        if (u) {
          setUid(u.uid);
          try {
            const response = await remote();
            if (
              version === revision.current &&
              auth?.currentUser?.uid === u.uid
            )
              setState(response.state);
          } catch (e) {
            if (version === revision.current) setError((e as Error).message);
          }
        }
        if (version === revision.current) setReady(true);
      });
    try {
      const saved = localStorage.getItem(KEY);
      full.current = saved ? { ...emptyState(), ...JSON.parse(saved) } : seed();
    } catch {
      full.current = seed();
    }
    setState(project(full.current!, "ashan"));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!configured && full.current) setState(project(full.current, uid));
  }, [uid]);
  useEffect(() => {
    if (!state) return;
    const timer = setInterval(() => void refresh(), 60000);
    return () => clearInterval(timer);
  }, [Boolean(state), refresh]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  async function act(command: Command) {
    if (acting.current) throw Error("An action is already in progress");
    acting.current = true;
    const version = ++revision.current;
    setBusy(true);
    setError("");
    try {
      let result: Record<string, unknown>;
      if (configured) {
        const response = await remote(command);
        if (version !== revision.current || auth?.currentUser?.uid !== uid)
          throw Error("Your session changed. Refresh to see the latest state.");
        setState(response.state);
        result = response.result;
      } else {
        accrueTrust(full.current!, Date.now());
        const response = execute(full.current!, command, {
          uid,
          now: Date.now(),
          id: () => crypto.randomUUID(),
          code: () =>
            String(
              100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
            ),
          hash: (c) => `DEMO-ONLY-${c}`,
        });
        full.current = response.state;
        localStorage.setItem(KEY, JSON.stringify(full.current));
        setState(project(full.current, uid));
        result = response.result;
      }
      if (result.error) throw Error(String(result.error));
      return result;
    } catch (e) {
      if (version === revision.current) setError((e as Error).message);
      throw e;
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  function reset() {
    full.current = seed();
    localStorage.setItem(KEY, JSON.stringify(full.current));
    setUid("ashan");
    setState(project(full.current, "ashan"));
  }
  return {
    state,
    uid,
    setUid,
    user,
    ready,
    error,
    setError,
    busy,
    act,
    refresh,
    reset,
    demo: !configured,
  };
}
