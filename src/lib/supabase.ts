import { createClient, Session, User } from "@supabase/supabase-js";
import { Command, emptyState, State } from "./model";
import { accrueTrust, execute, newUser, project, shortPublicId } from "./engine";

export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const supabase = configured
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    )
  : null;

export type AppUser = User;


export async function signInWithEmail(email: string) {
  if (!supabase) throw Error("Supabase is not configured.");
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: origin ? { emailRedirectTo: origin } : undefined,
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  if (!supabase) throw Error("Supabase is not configured.");
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: origin ? { redirectTo: origin } : undefined,
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onSessionChange(callback: (session: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(session),
  );
  return () => data.subscription.unsubscribe();
}

export async function remote(
  command?: Command,
): Promise<{ state: State; result: Record<string, unknown> }> {
  if (!supabase) throw Error("Supabase is not configured.");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user?.email) throw Error("Sign in with Gmail first.");
  const uid = user.id;
  const { data: row, error: readError } = await supabase
    .from("app_states")
    .select("state")
    .eq("user_id", uid)
    .maybeSingle();
  if (readError) throw readError;

  let s: State = row?.state ? ({ ...emptyState(), ...row.state } as State) : emptyState();
  const now = Date.now();
  for (const existing of s.users) existing.publicId ??= shortPublicId(existing.id);
  if (!s.users.some((u) => u.id === uid)) {
    const profile = newUser(uid, now);
    profile.name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split("@")[0] ||
      profile.name;
    profile.email = user.email;
    profile.profileComplete = Boolean(profile.name && profile.email);
    s.users.push(profile);
  }
  accrueTrust(s, now);
  let result: Record<string, unknown> = {};
  if (command) {
    const outcome = execute(s, command, {
      uid,
      now,
      id: () => crypto.randomUUID(),
      code: () =>
        String(
          100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
        ),
      hash: (code) => `SUPABASE-MVP-${code}`,
    });
    s = outcome.state;
    result = outcome.result;
  }
  const { error: writeError } = await supabase.from("app_states").upsert({
    user_id: uid,
    state: s,
    updated_at: new Date().toISOString(),
  });
  if (writeError) throw writeError;
  return { state: project(s, uid), result };
}

