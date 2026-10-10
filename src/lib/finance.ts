import { Entry, Loan, State } from "./model";
export const DAY = 86_400_000;
export const accountName = (name: string) =>
  name === "Cash" ? "Wallet" : name;
export function accountBalance(entries: Entry[], account: string) {
  return entries.reduce(
    (n, e) =>
      n +
      (e.type === "income" && accountName(e.fromAccount) === account
        ? e.amount
        : 0) -
      (e.type === "expense" && accountName(e.fromAccount) === account
        ? e.amount
        : 0) +
      (e.type === "transfer"
        ? (accountName(e.toAccount ?? "") === account ? e.amount : 0) -
          (accountName(e.fromAccount) === account ? e.amount : 0)
        : 0),
    0,
  );
}
export function spendingPeriods(entries: Entry[], date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weekStart = d.toISOString().slice(0, 10);
  const sum = (start: string) =>
    entries
      .filter((e) => e.type === "expense" && e.date >= start && e.date <= date)
      .reduce((n, e) => n + (e.expenseShare ?? e.amount), 0);
  return {
    daily: sum(date),
    weekly: sum(weekStart),
    monthly: sum(`${date.slice(0, 7)}-01`),
    weekStart,
  };
}
export function dailyBudget(spent: number, limit: number | undefined) {
  const ratio = limit && limit > 0 ? spent / limit : 0;
  return {
    percent: ratio * 100,
    tone: !limit
      ? "unset"
      : ratio >= 1
        ? "red"
        : ratio >= 0.75
          ? "orange"
          : "green",
    remaining: limit === undefined ? 0 : Math.max(0, limit - spent),
  };
}
export function overdueDays(loan: Loan, now: number): number {
  return loan.activatedAt === undefined
    ? 0
    : Math.max(
        0,
        Math.floor(
          ((loan.settledAt ?? now) - loan.activatedAt - 3 * DAY) / DAY,
        ),
      );
}
export const scoreFromEvents = (deltas: number[]) =>
  Math.max(0, Math.min(1000, 1000 + deltas.reduce((a, b) => a + b, 0)));
export function equalSplit(
  amount: number,
  ids: string[],
): Record<string, number> {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !ids.length ||
    new Set(ids).size !== ids.length
  )
    throw Error("Invalid split");
  const sorted = [...ids].sort();
  return Object.fromEntries(
    sorted.map((id, i) => [
      id,
      Math.floor(amount / ids.length) + (i < amount % ids.length ? 1 : 0),
    ]),
  );
}
export type Debt = { from: string; to: string; amount: number };
export function netDebts(debts: Debt[]): Debt[] {
  const net: Record<string, number> = {};
  for (const d of debts) {
    if (!Number.isSafeInteger(d.amount) || d.amount < 0)
      throw Error("Invalid debt");
    net[d.from] = (net[d.from] ?? 0) - d.amount;
    net[d.to] = (net[d.to] ?? 0) + d.amount;
  }
  const owe = Object.entries(net)
    .filter(([, n]) => n < 0)
    .sort();
  const due = Object.entries(net)
    .filter(([, n]) => n > 0)
    .sort();
  const result: Debt[] = [];
  let i = 0,
    j = 0;
  while (i < owe.length && j < due.length) {
    const n = Math.min(-owe[i][1], due[j][1]);
    result.push({ from: owe[i][0], to: due[j][0], amount: n });
    owe[i][1] += n;
    due[j][1] -= n;
    if (!owe[i][1]) i++;
    if (!due[j][1]) j++;
  }
  return result;
}
export function groupDebts(s: State, groupId: string): Debt[] {
  return netDebts(
    s.expenseSplits
      .filter((x) => x.groupId === groupId)
      .map((x) => ({
        from: x.userId,
        to: s.expenses.find((e) => e.id === x.expenseId)!.paidBy,
        amount: x.amount,
      })),
  );
}
export function totals(entries: Entry[], month: string) {
  const all = entries.reduce(
    (n, e) =>
      n +
      (e.type === "income" ? e.amount : e.type === "expense" ? -e.amount : 0),
    0,
  );
  const current = entries.filter((e) => e.date.startsWith(month));
  const income = current
    .filter((e) => e.type === "income")
    .reduce((n, e) => n + e.amount, 0);
  const spend = current
    .filter((e) => e.type === "expense")
    .reduce((n, e) => n + (e.expenseShare ?? e.amount), 0);
  return { balance: all, income, spend, remaining: income - spend };
}
export function assertSameIdentity(
  before: { uid: string },
  after: { uid: string },
) {
  if (before.uid !== after.uid)
    throw Error("Account identity changed. Sign in again with the same Gmail account.");
}
