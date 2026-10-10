import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  linkWithPopup,
  User,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { assertSameIdentity } from "./finance";
import { Command, State } from "./model";
export const configured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
);
const app = configured
  ? (getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }))
  : null;
export const auth = app ? getAuth(app) : null;
const functions = app
  ? getFunctions(
      app,
      process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "asia-south1",
    )
  : null;
if (
  process.env.NEXT_PUBLIC_USE_EMULATORS === "true" &&
  auth &&
  functions &&
  typeof window !== "undefined"
) {
  const g = globalThis as typeof globalThis & { settleEmulators?: boolean };
  if (!g.settleEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    g.settleEmulators = true;
  }
}
export async function linkGoogle(user: User) {
  assertSameIdentity(user, user);
  try {
    const result = await linkWithPopup(user, new GoogleAuthProvider());
    assertSameIdentity(user, result.user);
    return result.user;
  } catch (e) {
    if ((e as { code?: string }).code === "auth/credential-already-in-use")
      throw Error(
        "This Google account is already linked elsewhere. Your phone account is unchanged. Use another Google account.",
      );
    throw e;
  }
}
export async function remote(
  command?: Command,
): Promise<{ state: State; result: Record<string, unknown> }> {
  if (!functions) throw Error("Firebase is not configured");
  const fn = httpsCallable<
    { command?: Command },
    { state: State; result: Record<string, unknown> }
  >(functions, "finance");
  return (await fn(command ? { command } : {})).data;
}
