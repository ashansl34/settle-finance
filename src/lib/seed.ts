import { emptyState, State } from "./model";
import { DAY, equalSplit } from "./finance";
import { accrueTrust } from "./engine";
export function seed(now = Date.now()): State {
  const s = emptyState();
  const date = (ago: number) =>
      new Date(now - ago * DAY).toISOString().slice(0, 10),
    month = date(0).slice(0, 7);
  s.users = [
    "Ashan Perera",
    "Kasun Silva",
    "Nethmi Fernando",
    "Dilshan Jay",
  ].map((name, i) => ({
    id: ["ashan", "kasun", "nethmi", "dilshan"][i],
    name,
    handle: ["ashan", "kasun", "nethmi", "dilshan"][i],
    trustTenths: 1000,
    createdAt: now - 60 * DAY,
  }));
  s.friendships = [
    { id: "ashan_kasun", members: ["ashan", "kasun"] },
    { id: "ashan_nethmi", members: ["ashan", "nethmi"] },
  ];
  s.friendRequests = [
    { id: "request_demo", from: "dilshan", to: "ashan", status: "pending" },
  ];
  s.groups = [
    {
      id: "boarding",
      name: "The Boarding House",
      description: "Good company. Shared groceries. A place to call home.",
      searchable: true,
      monthlyTarget: 2400000,
      createdBy: "ashan",
    },
    {
      id: "weekend",
      name: "Weekend Collective",
      description: "Coffee runs, little adventures & everything in between.",
      searchable: true,
      monthlyTarget: 800000,
      createdBy: "nethmi",
    },
    {
      id: "campus",
      name: "Campus Crew",
      description: "Study sessions and campus life, together.",
      searchable: true,
      monthlyTarget: 600000,
      createdBy: "dilshan",
    },
  ];
  for (const groupId of ["boarding", "weekend"])
    for (const userId of ["ashan", "kasun", "nethmi"])
      s.groupMembers.push({
        id: `${groupId}_${userId}`,
        groupId,
        userId,
        role: userId === "ashan" || userId === "nethmi" ? "admin" : "member",
        status: "active",
      });
  s.groupMembers.push({
    id: "campus_dilshan",
    groupId: "campus",
    userId: "dilshan",
    role: "admin",
    status: "active",
  });
  s.funds = [
    { id: `boarding_${month}`, groupId: "boarding", month, target: 2400000 },
    { id: `weekend_${month}`, groupId: "weekend", month, target: 800000 },
  ];
  s.contributions = [
    {
      id: "fund_demo",
      groupId: "boarding",
      fundId: `boarding_${month}`,
      userId: "kasun",
      amount: 800000,
      status: "paid",
      confirmedBy: "ashan",
      createdAt: now - DAY,
    },
  ];
  s.expenses = [
    {
      id: "groceries",
      groupId: "boarding",
      paidBy: "ashan",
      amount: 645000,
      description: "Weekly groceries",
      createdAt: now - DAY,
      memberIds: ["ashan", "kasun", "nethmi"],
    },
    {
      id: "dinner",
      groupId: "boarding",
      paidBy: "kasun",
      amount: 240000,
      description: "Friday dinner",
      createdAt: now - 2 * DAY,
      memberIds: ["ashan", "kasun", "nethmi"],
    },
  ];
  for (const e of s.expenses)
    for (const [userId, amount] of Object.entries(
      equalSplit(e.amount, e.memberIds),
    ))
      s.expenseSplits.push({
        id: `${e.id}_${userId}`,
        expenseId: e.id,
        groupId: e.groupId,
        userId,
        amount,
      });
  s.loans = [
    {
      id: "loan_kasun",
      borrowerId: "ashan",
      lenderId: "kasun",
      participants: ["ashan", "kasun"],
      groupId: "boarding",
      amount: 500000,
      remainingBalance: 300000,
      reason: "Textbooks for the new semester",
      status: "partial",
      createdAt: now - 9 * DAY,
      activatedAt: now - 8 * DAY,
      penalizedDays: 0,
    },
    {
      id: "loan_nethmi",
      borrowerId: "nethmi",
      lenderId: "ashan",
      participants: ["nethmi", "ashan"],
      amount: 250000,
      remainingBalance: 250000,
      reason: "A little help until payday",
      status: "active",
      createdAt: now - 2 * DAY,
      activatedAt: now - DAY,
      penalizedDays: 0,
    },
    {
      id: "loan_request",
      borrowerId: "ashan",
      lenderId: "kasun",
      participants: ["ashan", "kasun"],
      amount: 150000,
      remainingBalance: 150000,
      reason: "Bus pass for next month",
      status: "requested",
      createdAt: now,
      penalizedDays: 0,
    },
  ];
  s.repayments = [
    {
      id: "repayment_demo",
      loanId: "loan_kasun",
      participants: ["ashan", "kasun"],
      amount: 200000,
      createdAt: now - 2 * DAY,
    },
  ];
  const entry = (
    id: string,
    type: "income" | "expense",
    amount: number,
    category: string,
    note: string,
    ago: number,
  ) => ({
    id,
    userId: "ashan",
    type,
    amount,
    category,
    note,
    date: date(ago),
    fromAccount: "Cash",
  });
  s.entries = [
    entry(
      "allowance",
      "income",
      3500000,
      "Family/Allowance",
      "Monthly allowance",
      0,
    ),
    entry("freelance", "income", 1200000, "Freelance", "Design project", 1),
    entry("rent", "expense", 1200000, "Boarding/Rent", "September boarding", 1),
    entry("food", "expense", 185000, "Food", "Lunch with the crew", 0),
    entry("bus", "expense", 45000, "Transport/Bus", "Bus pass", 0),
    entry("books", "expense", 320000, "Education", "Course materials", 2),
    entry("coffee", "expense", 85000, "Food", "Coffee & a catch-up", 1),
    entry(
      "last_income",
      "income",
      4200000,
      "Salary",
      "Previous month income",
      32,
    ),
    entry(
      "last_rent",
      "expense",
      1250000,
      "Boarding/Rent",
      "Previous month rent",
      32,
    ),
  ];
  s.notifications = [
    {
      id: "notice_demo",
      userId: "ashan",
      title: "A little reminder",
      body: "Your loan with Kasun has Rs 3,000 remaining. Open My Loans to arrange a repayment.",
      createdAt: now,
      read: false,
    },
  ];
  s.auditLogs = [
    {
      id: "audit_demo",
      actorId: "kasun",
      participants: ["ashan", "kasun"],
      action: "verification.confirm",
      entityId: "loan_kasun",
      createdAt: now - 2 * DAY,
    },
  ];
  accrueTrust(s, now);
  return s;
}
