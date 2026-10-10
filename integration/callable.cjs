// Runs only against the local demo emulators. Never contacts a live project.
const assert = require("node:assert/strict");
const origin = "http://127.0.0.1:9099";
async function phoneLogin(phoneNumber) {
  const send = await fetch(
    `${origin}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=emulator`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, recaptchaToken: "emulator" }),
    },
  ).then((r) => r.json());
  assert.ok(send.sessionInfo, JSON.stringify(send));
  const { verificationCodes } = await fetch(
    `${origin}/emulator/v1/projects/demo-settle/verificationCodes`,
  ).then((r) => r.json());
  const code = verificationCodes.find(
    (c) => c.sessionInfo === send.sessionInfo,
  ).code;
  const login = await fetch(
    `${origin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=emulator`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionInfo: send.sessionInfo, code }),
    },
  ).then((r) => r.json());
  assert.ok(login.idToken, JSON.stringify(login));
  return { token: login.idToken, uid: login.localId };
}
async function call(user, command) {
  const response = await fetch(
    "http://127.0.0.1:5001/demo-settle/asia-south1/finance",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      },
      body: JSON.stringify({ data: command ? { command } : {} }),
    },
  );
  const body = await response.json();
  if (body.error) throw Error(body.error.message);
  assert.ok(body.result, JSON.stringify(body));
  return body.result;
}
(async () => {
  await assert.rejects(call(null), /phone|Sign in/i);
  const a = await phoneLogin("+94770000001"),
    b = await phoneLogin("+94770000002");
  await call(a);
  await call(b);
  await call(a, { type: "profile", name: "Emulator A", handle: "emulator_a" });
  await call(b, { type: "profile", name: "Emulator B", handle: "emulator_b" });
  let r = await call(a, { type: "friend.request", userId: b.uid });
  await call(b, {
    type: "friend.respond",
    requestId: r.state.friendRequests[0].id,
    accept: true,
  });
  r = await call(a, {
    type: "loan.request",
    lenderId: b.uid,
    amount: 10000,
    reason: "Integration loan",
  });
  const loanId = r.state.loans[0].id;
  await assert.rejects(
    call(a, { type: "loan.respond", loanId, accept: true }),
    /lender/,
  );
  await call(b, { type: "loan.respond", loanId, accept: true });
  await call(b, { type: "transfer.start", loanId });
  r = await call(a, { type: "verification.issue", loanId });
  const code = r.result.code;
  assert.match(code, /^\d{6}$/);
  assert.equal(r.state.verificationChallenges[0].hash, undefined);
  const attempts = await Promise.allSettled([
    call(b, { type: "verification.confirm", loanId, code }),
    call(b, { type: "verification.confirm", loanId, code }),
  ]);
  assert.equal(
    attempts.filter((r) => r.status === "fulfilled").length,
    1,
    "Concurrent redemption must succeed exactly once",
  );
  r = await call(a);
  assert.equal(r.state.loans[0].status, "active");
  await call(a, {
    type: "entry.add",
    entryType: "income",
    amount: 50000,
    category: "Salary",
    date: "2026-09-29",
    fromAccount: "Bank",
    note: "Private",
  });
  assert.equal(
    (await call(b)).state.entries.length,
    0,
    "Another user must not receive private cash flow",
  );
  await call(a, { type: "transfer.start", loanId, amount: 4000 });
  r = await call(b, { type: "verification.issue", loanId });
  r = await call(a, {
    type: "verification.confirm",
    loanId,
    code: r.result.code,
  });
  assert.equal(r.state.loans[0].remainingBalance, 6000);
  assert.equal(r.state.repayments.length, 1);
  await call(a, { type: "transfer.start", loanId, amount: 6000 });
  r = await call(b, { type: "verification.issue", loanId });
  r = await call(a, {
    type: "verification.confirm",
    loanId,
    code: r.result.code,
  });
  assert.equal(r.state.loans[0].status, "settled");
  assert.equal(r.state.loans[0].remainingBalance, 0);
  r = await call(a, {
    type: "group.create",
    name: "Test group",
    description: "Emulator household",
    target: 100000,
    searchable: true,
  });
  const groupId = r.state.groups[0].id;
  await call(b, { type: "group.join", groupId });
  await call(a, {
    type: "group.approve",
    groupId,
    memberId: `${groupId}_${b.uid}`,
    accept: true,
  });
  r = await call(b, {
    type: "loan.request",
    groupId,
    lenderId: a.uid,
    amount: 5000,
    reason: "Group loan",
  });
  const groupLoan = r.state.loans.find((l) => l.groupId === groupId).id;
  await call(b, { type: "group.leave", groupId });
  r = await call(b);
  assert.ok(
    r.state.loans.some((l) => l.id === groupLoan),
    "Leaving group preserves canonical loan",
  );
  await call(a, { type: "loan.respond", loanId: groupLoan, accept: true });
  await call(a, { type: "transfer.start", loanId: groupLoan });
  await call(b, { type: "verification.issue", loanId: groupLoan });
  for (let i = 1; i <= 5; i++) {
    r = await call(a, {
      type: "verification.confirm",
      loanId: groupLoan,
      code: "000000",
    });
    assert.ok(r.result.error);
    assert.equal(
      r.state.verificationChallenges.find((c) => c.loanId === groupLoan)
        .attempts,
      i,
    );
  }
  await assert.rejects(
    call(a, {
      type: "verification.confirm",
      loanId: groupLoan,
      code: "000000",
    }),
    /Too many/,
  );
  console.log(
    "PASS: real Auth + Firestore + callable integration: phone claims, authorization, privacy, concurrent single-use redemption, partial/full repayments, persisted attempt limits and canonical group loans.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
