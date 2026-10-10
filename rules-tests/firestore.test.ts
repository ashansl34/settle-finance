import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-settle",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "entries/private-a"), {
        id: "private-a",
        userId: "a",
        amount: 100,
      }),
      setDoc(doc(db, "loans/personal"), {
        id: "personal",
        participants: ["a", "b"],
        remainingBalance: 100,
      }),
      setDoc(doc(db, "loans/group"), {
        id: "group",
        participants: ["a", "b"],
        groupId: "g",
        remainingBalance: 100,
      }),
      setDoc(doc(db, "groupMembers/g_c"), {
        groupId: "g",
        userId: "c",
        status: "active",
        role: "member",
      }),
      setDoc(doc(db, "groupMembers/g_a"), {
        groupId: "g",
        userId: "a",
        status: "left",
        role: "member",
      }),
      setDoc(doc(db, "verificationChallenges/secret"), {
        loanId: "personal",
        senderId: "a",
        receiverId: "b",
        hash: "hidden",
      }),
      setDoc(doc(db, "trustEvents/t"), {
        userId: "a",
        loanId: "personal",
        delta: -1,
      }),
      setDoc(doc(db, "auditLogs/log"), {
        participants: ["a", "b"],
        action: "verification.confirm",
      }),
      setDoc(doc(db, "users/a"), { name: "A", trustTenths: 999 }),
      setDoc(doc(db, "preferences/a"), { userId: "a", dailyLimit: 100000 }),
      setDoc(doc(db, "groupLinks/token"), {
        groupId: "g",
        createdBy: "c",
        revoked: false,
        expiresAt: 9999999999999,
      }),
      setDoc(doc(db, "groupInvites/invite"), {
        groupId: "g",
        from: "c",
        to: "b",
        status: "pending",
      }),
    ]);
  });
});
afterAll(async () => {
  await env?.cleanup();
});
const db = (uid: string) =>
  env.authenticatedContext(uid, { phone_number: "+94771234567" }).firestore();
describe("Firestore authorization", () => {
  it("protects daily limits, link tokens and group invitations", async () => {
    await assertSucceeds(getDoc(doc(db("a"), "preferences/a")));
    await assertFails(getDoc(doc(db("b"), "preferences/a")));
    await assertFails(
      updateDoc(doc(db("a"), "preferences/a"), { dailyLimit: 10 }),
    );
    await assertFails(getDoc(doc(db("c"), "groupLinks/token")));
    await assertSucceeds(getDoc(doc(db("b"), "groupInvites/invite")));
    await assertFails(getDoc(doc(db("d"), "groupInvites/invite")));
    await assertFails(
      updateDoc(doc(db("b"), "groupInvites/invite"), { status: "accepted" }),
    );
  });
  it("private cashflow belongs only to its owner", async () => {
    await assertSucceeds(getDoc(doc(db("a"), "entries/private-a")));
    await assertFails(getDoc(doc(db("b"), "entries/private-a")));
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore(), "entries/private-a"),
      ),
    );
  });
  it("keeps loan reads for departed participants and current group members", async () => {
    await assertSucceeds(getDoc(doc(db("a"), "loans/group")));
    await assertSucceeds(getDoc(doc(db("c"), "loans/group")));
    await assertFails(getDoc(doc(db("d"), "loans/group")));
    await assertFails(getDoc(doc(db("c"), "loans/personal")));
  });
  it("denies all direct challenge reads, including the receiver", async () => {
    await assertFails(getDoc(doc(db("a"), "verificationChallenges/secret")));
    await assertFails(getDoc(doc(db("b"), "verificationChallenges/secret")));
  });
  it("denies direct financial writes and trust/audit tampering", async () => {
    await assertFails(
      updateDoc(doc(db("a"), "loans/personal"), { remainingBalance: 0 }),
    );
    await assertFails(updateDoc(doc(db("a"), "trustEvents/t"), { delta: 100 }));
    await assertFails(
      updateDoc(doc(db("a"), "auditLogs/log"), { action: "settled" }),
    );
    await assertFails(
      setDoc(doc(db("a"), "entries/new"), { userId: "a", amount: 999 }),
    );
    await assertFails(
      updateDoc(doc(db("a"), "users/a"), { trustTenths: 1000 }),
    );
  });
  it("requires a phone claim even for an authenticated identity", async () => {
    await assertFails(
      getDoc(doc(env.authenticatedContext("a").firestore(), "users/a")),
    );
  });
});
