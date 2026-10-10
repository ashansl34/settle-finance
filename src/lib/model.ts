export type LoanStatus =
  | "requested"
  | "accepted"
  | "transfer_pending"
  | "active"
  | "partial"
  | "settled"
  | "declined";
export type Row = { id: string };
export type User = Row & {
  name: string;
  handle: string;
  publicId?: string;
  phoneNumber?: string;
  email?: string;
  age?: number;
  profileComplete?: boolean;
  trustTenths: number;
  createdAt: number;
};
export type FriendRequest = Row & {
  from: string;
  to: string;
  status: "pending" | "accepted" | "declined";
};
export type Friendship = Row & { members: string[] };
export type Group = Row & {
  name: string;
  description: string;
  searchable: boolean;
  monthlyTarget: number;
  createdBy: string;
};
export type Member = Row & {
  groupId: string;
  userId: string;
  role: "admin" | "member";
  status: "pending" | "active" | "left";
};
export type GroupInvite = Row & {
  groupId: string;
  groupName: string;
  from: string;
  to: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
};
export type GroupLink = Row & {
  groupId: string;
  createdBy: string;
  expiresAt: number;
  revoked: boolean;
};
export type Fund = Row & { groupId: string; month: string; target: number };
export type Contribution = Row & {
  groupId: string;
  fundId: string;
  userId: string;
  amount: number;
  status: "pending" | "paid";
  confirmedBy?: string;
  createdAt: number;
};
export type Expense = Row & {
  groupId: string;
  paidBy: string;
  amount: number;
  description: string;
  createdAt: number;
  memberIds: string[];
};
export type Split = Row & {
  expenseId: string;
  groupId: string;
  userId: string;
  amount: number;
};
export type Loan = Row & {
  borrowerId: string;
  lenderId: string;
  participants: string[];
  groupId?: string;
  amount: number;
  remainingBalance: number;
  reason: string;
  status: LoanStatus;
  createdAt: number;
  activatedAt?: number;
  settledAt?: number;
  penalizedDays: number;
};
export type Repayment = Row & {
  loanId: string;
  participants: string[];
  amount: number;
  createdAt: number;
};
export type Challenge = Row & {
  loanId: string;
  senderId: string;
  receiverId: string;
  kind: "activation" | "repayment";
  amount: number;
  hash?: string;
  expiresAt?: number;
  attempts: number;
  generation: number;
  used: boolean;
  createdAt: number;
  issuedAt?: number;
};
export type Notification = Row & {
  userId: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};
export type Audit = Row & {
  actorId: string;
  participants: string[];
  action: string;
  entityId: string;
  createdAt: number;
};
export type TrustEvent = Row & {
  userId: string;
  loanId: string;
  date: string;
  delta: number;
  reason: string;
  createdAt: number;
};
export type Entry = Row & {
  userId: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  category: string;
  note: string;
  date: string;
  fromAccount: string;
  toAccount?: string;
  sourceId?: string;
  expenseShare?: number;
  recipientId?: string;
  paymentKind?: "expense" | "cash_movement";
};
export type Preference = Row & {
  userId: string;
  dailyLimit: number;
  theme?: "ocean" | "forest" | "sunrise";
  font?: "system" | "rounded" | "serif";
};
export type State = {
  groupInvites: GroupInvite[];
  groupLinks: GroupLink[];
  preferences: Preference[];
  users: User[];
  friendRequests: FriendRequest[];
  friendships: Friendship[];
  groups: Group[];
  groupMembers: Member[];
  funds: Fund[];
  contributions: Contribution[];
  expenses: Expense[];
  expenseSplits: Split[];
  loans: Loan[];
  repayments: Repayment[];
  verificationChallenges: Challenge[];
  notifications: Notification[];
  auditLogs: Audit[];
  trustEvents: TrustEvent[];
  entries: Entry[];
};
export const collections: (keyof State)[] = [
  "groupInvites",
  "groupLinks",
  "preferences",
  "users",
  "friendRequests",
  "friendships",
  "groups",
  "groupMembers",
  "funds",
  "contributions",
  "expenses",
  "expenseSplits",
  "loans",
  "repayments",
  "verificationChallenges",
  "notifications",
  "auditLogs",
  "trustEvents",
  "entries",
];
export const emptyState = (): State =>
  Object.fromEntries(collections.map((k) => [k, []])) as unknown as State;
export type Command = { type: string; [key: string]: unknown };
export const incomeCategories = [
  "Family/Allowance",
  "Salary",
  "Freelance",
  "Refund",
  "Other",
];
export const expenseCategories = [
  "Food",
  "Transport/Bus",
  "Education",
  "Boarding/Rent",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Other",
];
export const money = (n: number) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n / 100);
export function parseMoney(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw Error("Enter an amount with at most two decimal places.");
  const [a, b = ""] = value.trim().split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 10000000000)
    throw Error("Amount must be positive and no more than Rs 100 million.");
  return n;
}
