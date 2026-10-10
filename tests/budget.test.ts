import { describe, it, expect } from "vitest";
import {
  dailyBudget,
  spendingPeriods,
  accountBalance,
  totals,
} from "../src/lib/finance";
import { execute, project } from "../src/lib/engine";
import { seed } from "../src/lib/seed";
import { Command, Entry, State } from "../src/lib/model";
const ctx = {
  uid: "ashan",
  now: Date.UTC(2026, 8, 29),
  id: () => crypto.randomUUID(),
  code: () => "123456",
  hash: (v: string) => v,
};
const run = (s: State, c: Command) => execute(s, c, ctx).state;
const entry = (
  date: string,
  amount: number,
  type: Entry["type"] = "expense",
): Entry => ({
  id: crypto.randomUUID(),
  userId: "ashan",
  date,
  amount,
  type,
  category: "Other",
  note: "",
  fromAccount: "Wallet",
});
describe("Daily limits and current spending", () => {
  it.each([
    [0, "green"],
    [50, "green"],
    [74.99, "green"],
    [75, "orange"],
    [99.99, "orange"],
    [100, "red"],
    [120, "red"],
  ])("%s percent is %s", (percent, tone) => {
    expect(dailyBudget(Number(percent) * 100, 10000).tone).toBe(tone);
  });
  it("handles an unset limit without NaN and clamps remaining", () => {
    expect(dailyBudget(100, undefined)).toEqual({
      percent: 0,
      tone: "unset",
      remaining: 0,
    });
    expect(dailyBudget(12000, 10000).remaining).toBe(0);
  });
  it("uses calendar days, Monday week boundary and excludes future and own-account transfers", () => {
    const e = [
      entry("2026-08-31", 100),
      entry("2026-09-01", 200),
      entry("2026-09-02", 300),
      entry("2026-09-03", 400),
      entry("2026-09-02", 900, "transfer"),
      { ...entry("2026-09-02", 900), expenseShare: 100 },
    ];
    expect(spendingPeriods(e, "2026-09-02")).toEqual({
      daily: 400,
      weekly: 700,
      monthly: 600,
      weekStart: "2026-08-31",
    });
  });
  it("keeps a user’s limit private and validates positive minor units", () => {
    const s = run(seed(), { type: "budget.set", dailyLimit: 100000 });
    expect(project(s, "ashan").preferences[0].dailyLimit).toBe(100000);
    expect(project(s, "kasun").preferences).toEqual([]);
    expect(() => run(s, { type: "budget.set", dailyLimit: 0 })).toThrow();
    expect(() => run(s, { type: "budget.set", dailyLimit: 1.5 })).toThrow();
  });
});
describe("Wallet, Bank and friend records", () => {
  it("treats legacy Cash as Wallet and transfers without creating income/spend", () => {
    const e = [
      { ...entry("2026-09-01", 10000, "income"), fromAccount: "Cash" },
      {
        ...entry("2026-09-01", 2500, "transfer"),
        fromAccount: "Wallet",
        toAccount: "Bank",
      },
    ];
    expect(accountBalance(e, "Wallet")).toBe(7500);
    expect(accountBalance(e, "Bank")).toBe(2500);
    expect(totals(e, "2026-09").spend).toBe(0);
  });
  it("adds money mid-month and debits the selected account for an expense payment to a friend", () => {
    let s = seed();
    s.entries = [];
    s = run(s, {
      type: "entry.add",
      entryType: "income",
      amount: 100000,
      category: "Salary",
      date: "2026-09-29",
      fromAccount: "Bank",
    });
    s = run(s, {
      type: "entry.friend_payment",
      recipientId: "kasun",
      paymentKind: "expense",
      amount: 25000,
      category: "Food",
      fromAccount: "Bank",
      date: "2026-09-29",
      note: "Bank ref ABC",
    });
    expect(accountBalance(s.entries, "Bank")).toBe(75000);
    expect(accountBalance(s.entries, "Wallet")).toBe(0);
    expect(spendingPeriods(s.entries, "2026-09-29").daily).toBe(25000);
    expect(s.entries[1].recipientId).toBe("kasun");
    expect(project(s, "kasun").entries).toEqual([]);
  });
  it("records repayment cash movement without adding spending or settling a verified loan", () => {
    let s = seed();
    const before = structuredClone(s.loans);
    s.entries = [];
    s = run(s, {
      type: "entry.friend_payment",
      recipientId: "kasun",
      paymentKind: "cash_movement",
      amount: 10000,
      category: "Other",
      fromAccount: "Bank",
      date: "2026-09-29",
    });
    expect(accountBalance(s.entries, "Bank")).toBe(-10000);
    expect(spendingPeriods(s.entries, "2026-09-29").daily).toBe(0);
    expect(s.loans).toEqual(before);
  });
  it("rejects unaccepted recipients, invalid accounts and same-account Cash/Wallet transfers", () => {
    const s = seed();
    const command = {
      type: "entry.friend_payment",
      recipientId: "dilshan",
      paymentKind: "expense",
      amount: 10000,
      category: "Other",
      fromAccount: "Bank",
      date: "2026-09-29",
    };
    expect(() => run(s, command)).toThrow("accepted friend");
    expect(() =>
      run(s, { ...command, recipientId: "kasun", fromAccount: "Invented" }),
    ).toThrow("Choose Wallet");
    expect(() =>
      run(s, {
        type: "entry.add",
        entryType: "transfer",
        amount: 100,
        fromAccount: "Cash",
        toAccount: "Wallet",
        date: "2026-09-29",
      }),
    ).toThrow("different accounts");
  });
});
