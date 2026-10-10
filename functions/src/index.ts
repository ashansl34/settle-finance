import { initializeApp } from "firebase-admin/app";
import { getFirestore, Transaction } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { defineSecret } from "firebase-functions/params";
import { accrueTrust, execute, newUser, project } from "../../src/lib/engine";
import { collections, Command, emptyState, State } from "../../src/lib/model";
initializeApp();
const db = getFirestore();
const secret = defineSecret("VERIFICATION_SECRET");
// MVP capacity guard: serializable cross-collection transactions; fail closed before write limits.
async function load(tx: Transaction): Promise<State> {
  const s = emptyState();
  for (const key of collections) {
    const snap = await tx.get(db.collection(key).limit(401));
    if (snap.size > 400)
      throw new HttpsError(
        "resource-exhausted",
        "MVP dataset capacity reached. Partition the repository before adding more records.",
      );
    (s[key] as unknown[]) = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  }
  return s;
}
function changes(before: State, after: State) {
  return collections.flatMap((k) => {
    const old = new Map(before[k].map((x) => [x.id, JSON.stringify(x)]));
    return after[k]
      .filter((x) => old.get(x.id) !== JSON.stringify(x))
      .map((x) => ({ key: k, row: x }));
  });
}
function save(tx: Transaction, before: State, after: State) {
  const diff = changes(before, after);
  if (diff.length > 440)
    throw new HttpsError(
      "resource-exhausted",
      "Too many changes in one transaction.",
    );
  for (const { key, row } of diff) tx.set(db.collection(key).doc(row.id), row);
}
export const finance = onCall(
  { region: "asia-south1", secrets: [secret], maxInstances: 10 },
  async (req) => {
    if (!req.auth || typeof req.auth.token.phone_number !== "string")
      throw new HttpsError(
        "unauthenticated",
        "Sign in with your verified phone number.",
      );
    const uid = req.auth.uid;
    const command = req.data?.command as Command | undefined;
    if (
      command &&
      (!command.type ||
        typeof command.type !== "string" ||
        JSON.stringify(command).length > 12000)
    )
      throw new HttpsError("invalid-argument", "Invalid command");
    try {
      return await db.runTransaction(async (tx) => {
        const before = await load(tx);
        let s = structuredClone(before);
        const now = Date.now();
        const rateRef = db.collection("_rateLimits").doc(uid);
        const rate = await tx.get(rateRef);
        const r = rate.data();
        const recent = r && now - r.start < 60000;
        if (recent && r.count >= 40)
          throw new HttpsError(
            "resource-exhausted",
            "Please wait a minute before trying again.",
          );
        if (!s.users.some((u) => u.id === uid)) s.users.push(newUser(uid, now));
        accrueTrust(s, now);
        let result: Record<string, unknown> = {};
        if (command) {
          const outcome = execute(s, command, {
            uid,
            now,
            id: randomUUID,
            code: () => String(randomInt(100000, 1000000)),
            hash: (code) =>
              createHmac("sha256", secret.value()).update(code).digest("hex"),
          });
          s = outcome.state;
          result = outcome.result;
        }
        save(tx, before, s);
        tx.set(rateRef, {
          start: recent ? r.start : now,
          count: recent ? r.count + 1 : 1,
        });
        return { state: project(s, uid), result };
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError(
        "failed-precondition",
        e instanceof Error ? e.message : "Request failed",
      );
    }
  },
);
export const updateTrust = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "asia-south1",
    timeZone: "Etc/UTC",
    maxInstances: 1,
  },
  async () => {
    await db.runTransaction(async (tx) => {
      const before = await load(tx),
        after = structuredClone(before);
      accrueTrust(after, Date.now());
      save(tx, before, after);
    });
  },
);
