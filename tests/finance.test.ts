import { describe, expect, it } from "vitest";
import {
  DAY,
  assertSameIdentity,
  equalSplit,
  netDebts,
  overdueDays,
  scoreFromEvents,
  totals,
} from "../src/lib/finance";
import { accrueTrust, execute, newUser, project } from "../src/lib/engine";
import { Command, Loan, State, emptyState, parseMoney } from "../src/lib/model";
const start = Date.UTC(2026, 8, 1);
let seq = 0;
function initial() {
  const s = emptyState();
  s.users = [newUser("a", start), newUser("b", start), newUser("c", start)];
  s.friendships = [{ id: "a_b", members: ["a", "b"] }];
  return s;
}
function run(s: State, c: Command, uid = "a", now = start) {
  return execute(s, c, {
    uid,
    now,
    id: () => `id_${++seq}`,
    hash: (x) => `hashed_${x}`,
    code: () => "123456",
  });
}
function requested() {
  const s = run(initial(), {
    type: "loan.request",
    lenderId: "b",
    amount: 10000,
    reason: "Books",
  }).state;
  return { s, l: s.loans[0].id };
}
function active() {
  let { s, l } = requested();
  s = run(s, { type: "loan.respond", loanId: l, accept: true }, "b").state;
  s = run(s, { type: "transfer.start", loanId: l }, "b").state;
  s = run(s, { type: "verification.issue", loanId: l }, "a").state;
  s = run(
    s,
    { type: "verification.confirm", loanId: l, code: "123456" },
    "b",
  ).state;
  return { s, l };
}
describe("Integer money and debt netting", () => {
  it("parses minor units without float rounding", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("123.4")).toBe(12340);
    expect(() => parseMoney("1.005")).toThrow();
    expect(() => parseMoney("-4")).toThrow();
    expect(() => parseMoney("Infinity")).toThrow();
  });
  it("allocates every minor unit deterministically", () => {
    expect(equalSplit(100, ["c", "a", "b"])).toEqual({ a: 34, b: 33, c: 33 });
    expect(() => equalSplit(100, ["a", "a"])).toThrow();
  });
  it("offsets reciprocal debts", () => {
    expect(
      netDebts([
        { from: "a", to: "b", amount: 1000 },
        { from: "b", to: "a", amount: 700 },
      ]),
    ).toEqual([{ from: "a", to: "b", amount: 300 }]);
  });
  it("cancels cycles and conserves net positions", () => {
    expect(
      netDebts([
        { from: "a", to: "b", amount: 100 },
        { from: "b", to: "c", amount: 100 },
        { from: "c", to: "a", amount: 100 },
      ]),
    ).toEqual([]);
    expect(
      netDebts([
        { from: "a", to: "b", amount: 100 },
        { from: "b", to: "c", amount: 40 },
      ]),
    ).toEqual([
      { from: "a", to: "b", amount: 60 },
      { from: "a", to: "c", amount: 40 },
    ]);
  });
  it("excludes transfers and receivables from spending", () => {
    const t = totals(
      [
        {
          id: "e",
          userId: "a",
          type: "expense",
          amount: 900,
          expenseShare: 300,
          category: "Other",
          note: "Group",
          date: "2026-09-01",
          fromAccount: "Cash",
        },
        {
          id: "t",
          userId: "a",
          type: "transfer",
          amount: 100,
          category: "Transfer",
          note: "",
          date: "2026-09-01",
          fromAccount: "Cash",
          toAccount: "Bank",
        },
      ],
      "2026-09",
    );
    expect(t.balance).toBe(-900);
    expect(t.spend).toBe(300);
  });
});
describe("Loan state machine and verification", () => {
  it("requires lender acceptance and a receiver-issued code before activation", () => {
    let { s, l } = requested();
    expect(() =>
      run(s, { type: "loan.respond", loanId: l, accept: true }),
    ).toThrow();
    s = run(s, { type: "loan.respond", loanId: l, accept: true }, "b").state;
    expect(s.loans[0].status).toBe("accepted");
    expect(() => run(s, { type: "transfer.start", loanId: l }, "a")).toThrow();
    s = run(s, { type: "transfer.start", loanId: l }, "b").state;
    expect(s.loans[0].status).toBe("transfer_pending");
    expect(() =>
      run(s, { type: "verification.issue", loanId: l }, "b"),
    ).toThrow();
    s = run(s, { type: "verification.issue", loanId: l }, "a").state;
    expect(() =>
      run(s, { type: "verification.confirm", loanId: l, code: "123456" }, "a"),
    ).toThrow();
    s = run(
      s,
      { type: "verification.confirm", loanId: l, code: "123456" },
      "b",
    ).state;
    expect(s.loans[0].status).toBe("active");
    expect(s.loans[0].activatedAt).toBe(start);
    expect(() =>
      run(s, { type: "verification.confirm", loanId: l, code: "123456" }, "b"),
    ).toThrow();
  });
  it("records partial repayment and settles only when fully repaid", () => {
    let { s, l } = active();
    for (const [n, status] of [
      [4000, "partial"],
      [6000, "settled"],
    ] as const) {
      s = run(s, { type: "transfer.start", loanId: l, amount: n }).state;
      expect(() =>
        run(s, { type: "verification.issue", loanId: l }, "a"),
      ).toThrow();
      s = run(
        s,
        { type: "verification.issue", loanId: l },
        "b",
        start + DAY,
      ).state;
      s = run(
        s,
        { type: "verification.confirm", loanId: l, code: "123456" },
        "a",
        start + DAY,
      ).state;
      expect(s.loans[0].status).toBe(status);
    }
    expect(s.loans[0].remainingBalance).toBe(0);
    expect(s.repayments).toHaveLength(2);
    expect(s.loans[0].settledAt).toBe(start + DAY);
    expect(s.auditLogs.length).toBeGreaterThan(7);
  });
  it("rejects overpayment, outsider actions, and parallel pending repayments", () => {
    let { s, l } = active();
    expect(() =>
      run(s, { type: "transfer.start", loanId: l, amount: 10001 }),
    ).toThrow();
    expect(() =>
      run(s, { type: "transfer.start", loanId: l, amount: 1000 }, "c"),
    ).toThrow();
    s = run(s, { type: "transfer.start", loanId: l, amount: 1000 }).state;
    expect(() =>
      run(s, { type: "transfer.start", loanId: l, amount: 1000 }),
    ).toThrow();
  });
  it("persists wrong attempts, locks at five, expires and rotates", () => {
    let { s, l } = active();
    s = run(s, { type: "transfer.start", loanId: l, amount: 1000 }).state;
    s = run(s, { type: "verification.issue", loanId: l }, "b").state;
    for (let i = 0; i < 5; i++) {
      const r = run(s, {
        type: "verification.confirm",
        loanId: l,
        code: "000000",
      });
      expect(r.result.error).toContain("Incorrect");
      s = r.state;
    }
    expect(s.verificationChallenges.find((c) => !c.used)?.attempts).toBe(5);
    expect(() =>
      run(s, { type: "verification.confirm", loanId: l, code: "123456" }),
    ).toThrow("Too many");
    expect(() =>
      run(s, { type: "verification.issue", loanId: l }, "b"),
    ).toThrow("Wait");
    s = run(
      s,
      { type: "verification.issue", loanId: l },
      "b",
      start + 60000,
    ).state;
    expect(() =>
      run(
        s,
        { type: "verification.confirm", loanId: l, code: "123456" },
        "a",
        start + 360000,
      ),
    ).toThrow("expired");
    expect(s.loans[0].remainingBalance).toBe(10000);
  });
  it("never leaks hashes or another person’s private entries", () => {
    let { s, l } = active();
    s = run(s, { type: "transfer.start", loanId: l, amount: 1000 }).state;
    s = run(s, { type: "verification.issue", loanId: l }, "b").state;
    s.entries.push({
      id: "private",
      userId: "b",
      amount: 123,
      type: "income",
      category: "Salary",
      note: "private",
      date: "2026-09-01",
      fromAccount: "Cash",
    });
    const mine = project(s, "a");
    expect(mine.verificationChallenges.some((c) => c.hash)).toBe(false);
    expect(mine.entries).toEqual([]);
    expect(project(s, "c").loans).toEqual([]);
  });
});
describe("Trust day calculations", () => {
  const l: Loan = {
    id: "l",
    borrowerId: "a",
    lenderId: "b",
    participants: ["a", "b"],
    amount: 100,
    remainingBalance: 100,
    status: "active",
    reason: "Test",
    createdAt: start,
    activatedAt: start,
    penalizedDays: 0,
  };
  it.each([
    [0, 0],
    [3 * DAY - 1, 0],
    [3 * DAY, 0],
    [4 * DAY - 1, 0],
    [4 * DAY, 1],
    [13 * DAY, 10],
  ])("at offset %d gets %d complete overdue days", (offset, days) =>
    expect(overdueDays(l, start + offset)).toBe(days),
  );
  it("freezes at settlement and clamps score", () => {
    expect(
      overdueDays(
        {
          ...l,
          status: "settled",
          remainingBalance: 0,
          settledAt: start + 5 * DAY,
        },
        start + 100 * DAY,
      ),
    ).toBe(2);
    expect(scoreFromEvents([-1200])).toBe(0);
    expect(scoreFromEvents([20])).toBe(1000);
  });
  it("is idempotent with deterministic immutable event IDs", () => {
    const s = initial();
    s.loans.push(structuredClone(l));
    accrueTrust(s, start + 5 * DAY);
    const original = structuredClone(s.trustEvents);
    accrueTrust(s, start + 5 * DAY);
    expect(s.trustEvents).toEqual(original);
    expect(s.users[0].trustTenths).toBe(998);
    expect(s.trustEvents.map((e) => e.id)).toEqual(["l_1", "l_2"]);
  });
  it("charges accrued days at settlement and never restores penalties", () => {
    let { s, l } = active();
    s = run(
      s,
      { type: "transfer.start", loanId: l, amount: 10000 },
      "a",
      start + 5 * DAY,
    ).state;
    s = run(
      s,
      { type: "verification.issue", loanId: l },
      "b",
      start + 5 * DAY,
    ).state;
    s = run(
      s,
      { type: "verification.confirm", loanId: l, code: "123456" },
      "a",
      start + 5 * DAY,
    ).state;
    accrueTrust(s, start + 50 * DAY);
    expect(s.users[0].trustTenths).toBe(998);
    expect(s.trustEvents).toHaveLength(2);
  });
});
describe("Groups, privacy and identity", () => {
  it("prevents identity changes or Google-first linking", () => {
    expect(() =>
      assertSameIdentity({ uid: "a", phoneNumber: null }, { uid: "a" }),
    ).toThrow();
    expect(() =>
      assertSameIdentity(
        { uid: "a", phoneNumber: "+94770000000" },
        { uid: "b" },
      ),
    ).toThrow();
    expect(() =>
      assertSameIdentity(
        { uid: "a", phoneNumber: "+94770000000" },
        { uid: "a" },
      ),
    ).not.toThrow();
  });
  it("requires membership approval and keeps a canonical loan after leaving", () => {
    let s = run(initial(), {
      type: "group.create",
      name: "Home",
      description: "Household",
      target: 90000,
      searchable: true,
    }).state;
    const g = s.groups[0].id;
    s = run(s, { type: "group.join", groupId: g }, "b").state;
    expect(() =>
      run(
        s,
        {
          type: "loan.request",
          groupId: g,
          lenderId: "a",
          amount: 1000,
          reason: "Books",
        },
        "b",
      ),
    ).toThrow();
    s = run(s, {
      type: "group.approve",
      groupId: g,
      memberId: `${g}_b`,
      accept: true,
    }).state;
    s = run(
      s,
      {
        type: "loan.request",
        groupId: g,
        lenderId: "a",
        amount: 1000,
        reason: "Books",
      },
      "b",
    ).state;
    const loanId = s.loans[0].id;
    s = run(s, { type: "group.leave", groupId: g }, "b").state;
    expect(s.loans).toHaveLength(1);
    expect(project(s, "b").loans[0].id).toBe(loanId);
    expect(() => run(s, { type: "group.leave", groupId: g })).toThrow(
      "another admin",
    );
  });
  it("validates custom splits and records linked cash flow once", () => {
    let s = run(initial(), {
      type: "group.create",
      name: "Home",
      description: "Household",
      target: 90000,
      searchable: true,
    }).state;
    const groupId = s.groups[0].id;
    expect(() =>
      run(s, {
        type: "expense.add",
        groupId,
        amount: 1000,
        description: "Food",
        memberIds: ["a"],
        shares: { a: 900 },
      }),
    ).toThrow("exactly");
    s = run(s, {
      type: "expense.add",
      groupId,
      amount: 1000,
      description: "Food",
      memberIds: ["a"],
      linkPersonal: true,
    }).state;
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].expenseShare).toBe(1000);
    expect(s.expenseSplits[0].amount).toBe(1000);
  });
  it("prevents a contribution payer from confirming their own payment", () => {
    let s = run(initial(), {
      type: "group.create",
      name: "Home",
      description: "Household",
      target: 90000,
      searchable: true,
    }).state;
    const groupId = s.groups[0].id;
    s = run(s, {
      type: "fund.set",
      groupId,
      month: "2026-09",
      target: 90000,
    }).state;
    s = run(s, {
      type: "contribution.pay",
      groupId,
      fundId: `${groupId}_2026-09`,
      amount: 30000,
    }).state;
    expect(() =>
      run(s, {
        type: "contribution.confirm",
        groupId,
        contributionId: s.contributions[0].id,
      }),
    ).toThrow("Another admin");
  });
  it("keeps new users empty until they complete profile details", () => {
    const s = emptyState();
    s.users = [newUser("new-phone-user", start)];
    expect(project(s, "new-phone-user").entries).toEqual([]);
    expect(s.users[0].profileComplete).toBe(false);
    const next = run(
      s,
      {
        type: "profile",
        name: "Ravi Perera",
        handle: "ravi",
        phoneNumber: "+94771234567",
        email: "ravi@gmail.com",
        age: "19",
      },
      "new-phone-user",
    ).state;
    expect(next.users[0]).toMatchObject({
      name: "Ravi Perera",
      handle: "ravi",
      phoneNumber: "+94771234567",
      email: "ravi@gmail.com",
      age: 19,
      profileComplete: true,
    });
  });
  it("validates profile age and saves theme and font preferences", () => {
    let s = initial();
    expect(() =>
      run(s, {
        type: "profile",
        name: "Ashan Perera",
        handle: "ashan",
        phoneNumber: "+94771234567",
        email: "ashan@gmail.com",
        age: "8",
      }),
    ).toThrow("Age");
    s = run(s, {
      type: "preference.update",
      theme: "forest",
      font: "rounded",
    }).state;
    expect(project(s, "a").preferences[0]).toMatchObject({
      theme: "forest",
      font: "rounded",
    });
  });
});
