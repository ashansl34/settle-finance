"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  HandCoins,
  Home,
  LayoutGrid,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
  BarChart3,
  MoreHorizontal,
} from "lucide-react";
import { signOut, supabase } from "@/lib/backend";
import {
  Command,
  Entry,
  Loan,
  expenseCategories,
  incomeCategories,
  money,
  parseMoney,
} from "@/lib/model";
import {
  DAY,
  groupDebts,
  overdueDays,
  totals,
  accountName,
  accountBalance,
  spendingPeriods,
  dailyBudget,
} from "@/lib/finance";
import { useFinance } from "./use-finance";
import Login from "./login";
type Page =
  | "Home"
  | "Friends"
  | "Groups"
  | "My Balance"
  | "My Loans"
  | "Notifications"
  | "Profile / Trust"
  | "Reports";
const navigation = [
  { name: "Home", icon: Home },
  { name: "My Balance", icon: Wallet },
  { name: "Friends", icon: Users },
  { name: "Groups", icon: LayoutGrid },
  { name: "My Loans", icon: HandCoins },
  { name: "Reports", icon: BarChart3 },
] as const;
type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
  help?: string;
};
type Modal = {
  title: string;
  description?: string;
  fields: Field[];
  submit: string;
  run: (data: Record<string, string>) => Promise<void>;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthNow = () => today().slice(0, 7);
const monthName = (m: string) =>
  new Date(`${m}-15T12:00:00`).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });
const displayDate = (n: number) =>
  new Date(n).toLocaleDateString("en", { month: "short", day: "numeric" });
const statusName = (l: Loan) =>
  ({
    requested: "Requested",
    accepted: "Accepted",
    transfer_pending: "Transfer pending",
    active: "Active",
    partial: "Partially repaid",
    settled: "Settled",
    declined: "Declined",
  })[l.status];
function Avatar({ name, size = "" }: { name: string; size?: string }) {
  return (
    <span className={`avatar ${size} color-${name.charCodeAt(0) % 4}`}>
      {name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <Sparkles size={26} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
export default function FinanceApp() {
  const f = useFinance();
  const { state: s, uid, demo } = f;
  const [joinToken, setJoinToken] = useState("");
  const [sharedLink, setSharedLink] = useState<{
    groupId: string;
    url: string;
    expiresAt: number;
  } | null>(null);
  useEffect(() => {
    const readLink = () =>
      setJoinToken(
        new URLSearchParams(window.location.hash.slice(1)).get("join") ?? "",
      );
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);
  const [page, setPage] = useState<Page>("Home"),
    [groupId, setGroupId] = useState<string | null>(null),
    [groupTab, setGroupTab] = useState("Overview"),
    [query, setQuery] = useState(""),
    [month, setMonth] = useState(monthNow()),
    [day, setDay] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [selectedLoan, setSelectedLoan] = useState<string | null>(null),
    [code, setCode] = useState<{ code: string; expiresAt: number } | null>(
      null,
    ),
    [toast, setToast] = useState(""),
    [loanFilter, setLoanFilter] = useState("All"),
    [installEvent, setInstallEvent] = useState<Event | null>(null),
    [more, setMore] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setSelectedLoan(null);
    setCode(null);
    setSharedLink(null);
    setGroupId(null);
    setModal(null);
    setPage("Home");
  }, [uid]);
  if (!f.ready)
    return (
      <div className="loading">
        <span className="brand-mark">s</span>
        <p>Finding your balance…</p>
      </div>
    );
  if (!demo && !f.user) return <Login />;
  if (!s)
    return (
      <div className="loading">
        <h2>Let’s get connected.</h2>
        <p>{f.error || "Loading your account…"}</p>
        <button className="primary" onClick={() => void f.refresh()}>
          Try again
        </button>
        {supabase && (
          <button className="text-button" onClick={() => void signOut()}>
            Sign out
          </button>
        )}
      </div>
    );
  const me = s.users.find((u) => u.id === uid)!;
  const name = (id: string) =>
    s.users.find((u) => u.id === id)?.name ?? "Former member";
  const entries = s.entries.filter((e) => e.userId === uid),
    summary = totals(entries, month);
  const periodSpending = spendingPeriods(entries, today());
  const preference = s.preferences?.find((p) => p.userId === uid);
  const dailyLimit = preference?.dailyLimit;
  const budget = dailyBudget(periodSpending.daily, dailyLimit);
  const selectedTheme = preference?.theme ?? "ocean";
  const selectedFont = preference?.font ?? "system";
  const needsProfile = !me.profileComplete;
  const myLoans = s.loans.filter((l) => l.participants.includes(uid));
  const activeLoans = myLoans.filter((l) =>
    ["active", "partial"].includes(l.status),
  );
  const borrowed = activeLoans
      .filter((l) => l.borrowerId === uid)
      .reduce((a, l) => a + l.remainingBalance, 0),
    lent = activeLoans
      .filter((l) => l.lenderId === uid)
      .reduce((a, l) => a + l.remainingBalance, 0);
  const myGroups = s.groups.filter((g) =>
    s.groupMembers.some(
      (m) => m.groupId === g.id && m.userId === uid && m.status === "active",
    ),
  );
  const friendIds = s.friendships.flatMap((fr) =>
    fr.members.filter((id) => id !== uid),
  );
  const unread = s.notifications.filter((n) => !n.read).length;
  const currentGroup = s.groups.find((g) => g.id === groupId),
    groupMembers = s.groupMembers.filter(
      (m) => m.groupId === groupId && m.status === "active",
    );
  const admin = groupMembers.some(
    (m) => m.userId === uid && m.role === "admin",
  );
  async function act(command: Command, message = "Saved.") {
    await f.act(command);
    setToast(message);
  }
  function go(p: Page) {
    window.scrollTo(0, 0);
    setPage(p);
    setQuery("");
    setGroupId(null);
    setMore(false);
  }
  function exitApp() {
    if (supabase && !demo) void signOut();
    else {
      setToast("Demo mode is local to this browser. Open Profile to reset it.");
    }
  }
  function profileFields() {
    return [
      { name: "name", label: "Full name", value: me.name },
      {
        name: "handle",
        label: "Unique handle",
        value: me.handle,
        help: "Friends find you with this handle. Your Settle ID is shorter and automatic.",
      },
      {
        name: "phoneNumber",
        label: "Phone number",
        value: me.phoneNumber || "",
        help: "Use international format, like +94771234567.",
      },
      {
        name: "email",
        label: "Gmail or email",
        type: "email",
        value: me.email || f.user?.email || "",
      },
      {
        name: "age",
        label: "Age",
        type: "number",
        value: me.age ? String(me.age) : "",
      },
    ];
  }
  function editProfile(setup = false) {
    open({
      title: setup ? "Set up your account." : "Make it yours.",
      description: setup
        ? "This keeps the account tied to your Gmail identity. Your money records stay private."
        : undefined,
      submit: setup ? "Create my profile" : "Save profile",
      fields: profileFields(),
      run: async (d) => {
        await act({ type: "profile", ...d }, "Profile saved.");
      },
    });
  }
  function onboardingCard() {
    if (!needsProfile) return null;
    return (
      <section className="setup-card">
        <div>
          <span className="eyebrow">FIRST TIME SETUP</span>
          <h2>Create your profile</h2>
          <p>
            Your dashboard is empty until you add your own money records,
            friends, groups and loans. Existing users keep their old data when
            they sign in with the same Gmail account.
          </p>
        </div>
        <button className="primary" onClick={() => editProfile(true)}>
          Complete account
        </button>
      </section>
    );
  }
  function open(m: Modal) {
    f.setError("");
    setModal(m);
  }
  const personOptions = (ids: string[]) =>
    ids.map((id) => ({ value: id, label: name(id) }));
  function requestLoan(lenderId?: string, gid?: string) {
    const ids = gid
      ? s!.groupMembers
          .filter(
            (m) =>
              m.groupId === gid && m.status === "active" && m.userId !== uid,
          )
          .map((m) => m.userId)
      : friendIds;
    if (!ids.length) {
      setToast("Add a friend or join a group before requesting money.");
      return;
    }
    open({
      title: "A little help, when you need it.",
      description:
        "Your lender accepts first. The loan only becomes active after you confirm receiving the money.",
      submit: "Send money request",
      fields: [
        {
          name: "lenderId",
          label: "Request from",
          value: lenderId,
          options: personOptions(ids),
        },
        { name: "amount", label: "Amount (LKR)", type: "number" },
        { name: "reason", label: "What is it for?", value: "" },
      ],
      run: async (d) => {
        await act(
          {
            type: "loan.request",
            ...d,
            amount: parseMoney(d.amount),
            ...(gid ? { groupId: gid } : {}),
          },
          "Money request sent.",
        );
      },
    });
  }
  function addEntry(
    type: "income" | "expense" | "transfer" = "expense",
    account?: string,
  ) {
    open({
      title:
        type === "income"
          ? account
            ? `Add money to ${account}.`
            : "Something coming in."
          : type === "transfer"
            ? "Move money between accounts."
            : "Add an everyday expense.",
      description:
        type === "transfer"
          ? "Transfers between your own accounts do not count as income or spending."
          : "This entry is private. Only you can see it.",
      submit: "Save transaction",
      fields: [
        { name: "amount", label: "Amount (LKR)", type: "number" },
        ...(type === "transfer"
          ? []
          : [
              {
                name: "category",
                label: "Category",
                options: (type === "income"
                  ? incomeCategories
                  : expenseCategories
                ).map((x) => ({ value: x, label: x })),
              },
            ]),
        { name: "date", label: "Date", type: "date", value: today() },
        {
          name: "fromAccount",
          label: type === "income" ? "Into account" : "From account",
          value: account,
          options: ["Personal Wallet", "Mobile Bank", "Savings"].map((x) => ({
            value: x,
            label: x,
          })),
        },
        ...(type === "transfer"
          ? [
              {
                name: "toAccount",
                label: "To account",
                value: "Mobile Bank",
                options: ["Personal Wallet", "Mobile Bank", "Savings"].map((x) => ({
                  value: x,
                  label: x,
                })),
              },
            ]
          : []),
        { name: "note", label: "Note", optional: true },
      ],
      run: async (d) => {
        await act(
          {
            type: "entry.add",
            ...d,
            entryType: type,
            amount: parseMoney(d.amount),
          },
          "Transaction added.",
        );
      },
    });
  }
  function editDailyLimit() {
    open({
      title: "Set your daily spending limit.",
      description:
        "A fresh allowance each day. Green below 75%, orange from 75%, and red at 100% or above. This does not move any money.",
      submit: "Save daily limit",
      fields: [
        {
          name: "dailyLimit",
          label: "Daily limit (LKR)",
          type: "number",
          value: dailyLimit ? String(dailyLimit / 100) : "",
        },
      ],
      run: async (d) => {
        await act(
          { type: "budget.set", dailyLimit: parseMoney(d.dailyLimit) },
          "Your daily limit is saved.",
        );
      },
    });
  }
  function friendPayment(recipientId?: string) {
    if (!friendIds.length) {
      setToast("Add a friend before recording a friend payment.");
      return;
    }
    open({
      title: "Record money sent to a friend.",
      description:
        "Keep a private record of money you already sent. This does not send a bank payment, change your friend’s balance, or confirm a loan repayment.",
      submit: "Save friend payment",
      fields: [
        {
          name: "recipientId",
          label: "Friend",
          value: recipientId,
          options: personOptions(friendIds),
        },
        { name: "amount", label: "Amount (LKR)", type: "number" },
        {
          name: "fromAccount",
          label: "Paid from",
          value: "Mobile Bank",
          options: ["Mobile Bank", "Personal Wallet", "Savings"].map((x) => ({
            value: x,
            label: x,
          })),
        },
        {
          name: "paymentKind",
          label: "Payment purpose",
          options: [
            { value: "expense", label: "Payment or gift — counts as spending" },
            {
              value: "cash_movement",
              label: "Loan or repayment — cash movement only",
            },
          ],
        },
        {
          name: "category",
          label: "Category",
          value: "Other",
          options: expenseCategories.map((x) => ({ value: x, label: x })),
        },
        { name: "date", label: "Date", type: "date", value: today() },
        { name: "note", label: "Note or bank reference", optional: true },
      ],
      run: async (d) => {
        await act(
          { type: "entry.friend_payment", ...d, amount: parseMoney(d.amount) },
          "Friend payment recorded in your account history.",
        );
      },
    });
  }
  function dailySpendingCard() {
    return (
      <section
        className={`daily-budget ${budget.tone}`}
        aria-label="Daily spending limit"
      >
        <div className="daily-budget-copy">
          <span className="eyebrow">
            TODAY - {displayDate(new Date(`${today()}T12:00:00`).getTime())}
          </span>
          <h2>Daily spending</h2>
          <div className="daily-spent">
            {money(periodSpending.daily)}{" "}
            <span>
              {dailyLimit ? `of ${money(dailyLimit)}` : "spent today"}
            </span>
          </div>
          <p>
            {!dailyLimit
              ? "Set a daily limit to see how your spending is going."
              : budget.tone === "red"
                ? periodSpending.daily > dailyLimit
                  ? `${money(periodSpending.daily - dailyLimit)} over your daily limit`
                  : "You’ve reached your daily limit"
                : `${money(budget.remaining)} left to spend today`}
          </p>
        </div>
        <div className="daily-budget-progress">
          <div className="spread">
            <strong>
              {dailyLimit
                ? `${Number(budget.percent.toFixed(1))}% used`
                : "No limit set"}
            </strong>
            <span>
              {budget.tone === "green"
                ? "Within your limit"
                : budget.tone === "orange"
                  ? "Approaching your limit"
                  : budget.tone === "red"
                    ? "Limit reached"
                    : "Your daily guide"}
            </span>
          </div>
          <div
            className="daily-meter"
            role="progressbar"
            aria-label="Daily limit used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, budget.percent)}
            aria-valuetext={
              dailyLimit
                ? `${Number(budget.percent.toFixed(1))}% used`
                : "No daily limit set"
            }
          >
            <span style={{ width: `${Math.min(100, budget.percent)}%` }} />
          </div>
          <small>Green &lt;75% - Orange 75–99% - Red 100%+</small>
          <button className="secondary" onClick={editDailyLimit}>
            {dailyLimit ? "Edit daily limit" : "Set daily limit"}
          </button>
        </div>
      </section>
    );
  }
  function periodCards() {
    return (
      <section
        className="spending-periods"
        aria-label="Current spending totals"
      >
        {[
          ["Today", periodSpending.daily, "Your local day"],
          ["This week", periodSpending.weekly, "Monday through today"],
          ["This month", periodSpending.monthly, monthName(monthNow())],
        ].map(([label, value, hint]) => (
          <div className="panel metric" key={label}>
            <p>{label} - spending</p>
            <h2>{money(Number(value))}</h2>
            <small>{hint}</small>
          </div>
        ))}
      </section>
    );
  }
  function bankingPanel() {
    const accounts = ["Personal Wallet", "Mobile Bank", "Savings"].map((account) => ({
      account,
      balance: accountBalance(entries, account),
    }));
    const bankMovements = [...entries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
    const bankBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
    return (
      <section className="banking-app" aria-label="Banking overview">
        <div className="banking-hero">
          <div>
            <span className="eyebrow">MOBILE BANKING</span>
            <h2>{money(bankBalance)}</h2>
            <p>Personal wallet, mobile bank and savings in one clean view.</p>
          </div>
          <span className="banking-card-mark">
            <CreditCard size={21} />
          </span>
        </div>
        <div className="banking-accounts">
          {accounts.map(({ account, balance }) => (
            <button
              key={account}
              className="bank-account"
              onClick={() => go("My Balance")}
              aria-label={`View ${account} account`}
            >
              <span className="bank-account-icon">
                <CreditCard size={16} />
              </span>
              <span>
                <small>{account}</small>
                <strong>{money(balance)}</strong>
              </span>
            </button>
          ))}
        </div>
        <div className="banking-actions">
          <button onClick={() => addEntry("income", "Mobile Bank")}>
            <ArrowDownLeft size={17} /> Add to mobile bank
          </button>
          <button onClick={() => addEntry("transfer")}>
            <RefreshCw size={17} /> Transfer
          </button>
          <button onClick={() => friendPayment()}>
            <ArrowUpRight size={17} /> Pay friend
          </button>
          <button onClick={exitApp}>
            <LogOut size={17} /> Exit
          </button>
        </div>
        <div className="banking-recent">
          <div className="spread">
            <strong>Banking activity</strong>
            <button className="text-button" onClick={() => go("My Balance")}>
              See all
            </button>
          </div>
          {bankMovements.length ? (
            bankMovements.map((e) => (
              <div className="banking-movement" key={e.id}>
                <span
                  className={`transaction-icon ${e.type === "income" ? "mint" : e.type === "transfer" ? "blue" : "peach"}`}
                >
                  {e.type === "income" ? (
                    <ArrowDownLeft size={17} />
                  ) : e.type === "transfer" ? (
                    <RefreshCw size={16} />
                  ) : (
                    <ArrowUpRight size={17} />
                  )}
                </span>
                <span>
                  <strong>{e.note || e.category}</strong>
                  <small>
                    {accountName(e.fromAccount)}
                    {e.toAccount ? ` to ${accountName(e.toAccount)}` : ""}
                  </small>
                </span>
                <b className={e.type === "income" ? "positive" : ""}>
                  {e.type === "income" ? "+" : e.type === "expense" ? "-" : ""}
                  {money(e.amount)}
                </b>
              </div>
            ))
          ) : (
            <p className="muted">
              Your bank and wallet activity will appear here.
            </p>
          )}
        </div>
      </section>
    );
  }
  function inviteFriend() {
    const candidates = friendIds.filter(
      (id) =>
        !groupMembers.some((m) => m.userId === id) &&
        !s!.groupInvites?.some(
          (i) => i.groupId === groupId && i.to === id && i.status === "pending",
        ),
    );
    if (!candidates.length) {
      setToast(
        "Your friends are already members or invited. Add a new friend to invite them.",
      );
      return;
    }
    open({
      title: "Invite a friend.",
      description: admin
        ? "Your friend can join by accepting your invitation."
        : "Your friend can accept, then an admin approves their membership.",
      submit: "Send invitation",
      fields: [
        {
          name: "userId",
          label: "Choose a friend",
          options: personOptions(candidates),
        },
      ],
      run: async (d) => {
        await act(
          { type: "group.invite", groupId, userId: d.userId },
          "Group invitation sent.",
        );
      },
    });
  }
  function dismissJoin() {
    setJoinToken("");
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  async function reviewJoin() {
    try {
      const r = await f.act({ type: "group.link.preview", token: joinToken });
      const gid = String(r.groupId),
        membership = s!.groupMembers.find(
          (m) => m.groupId === gid && m.userId === uid,
        );
      if (membership?.status === "active") {
        setPage("Groups");
        setGroupId(gid);
        setGroupTab("Overview");
        dismissJoin();
        return;
      }
      if (membership?.status === "pending") {
        setToast("Your join request is already awaiting admin approval.");
        dismissJoin();
        return;
      }
      open({
        title: `Join ${String(r.groupName)}?`,
        description:
          "Send a request to the group admins. Your membership starts after they approve it.",
        fields: [],
        submit: "Request to join group",
        run: async () => {
          await act(
            { type: "group.join", token: joinToken },
            "Join request sent to the admins.",
          );
          dismissJoin();
          go("Groups");
        },
      });
    } catch {}
  }
  async function generateLink(reset = false) {
    try {
      const r = await f.act({ type: "group.link.create", groupId, reset });
      setSharedLink({
        groupId: groupId!,
        url: `${window.location.origin}/#join=${encodeURIComponent(String(r.token))}`,
        expiresAt: Number(r.expiresAt),
      });
    } catch {}
  }
  function createGroup() {
    open({
      title: "Better, together.",
      description:
        "Start a shared space for your household, friends or community.",
      submit: "Create group",
      fields: [
        { name: "name", label: "Group name" },
        { name: "description", label: "A little about the group" },
        {
          name: "target",
          label: "Monthly group fund target (LKR)",
          type: "number",
        },
        {
          name: "searchable",
          label: "Allow others to find and request to join",
          type: "checkbox",
          value: "true",
        },
      ],
      run: async (d) => {
        await act(
          {
            type: "group.create",
            ...d,
            target: parseMoney(d.target),
            searchable: d.searchable === "true",
          },
          "Your group is ready.",
        );
      },
    });
  }
  function addExpense() {
    const g = currentGroup!;
    open({
      title: "Share an expense.",
      description:
        "You are recorded as the person who paid. Equal splits include all active members. For custom splits, list amounts in the member order below.",
      submit: "Add shared expense",
      fields: [
        { name: "description", label: "What did you pay for?" },
        { name: "amount", label: "Total paid (LKR)", type: "number" },
        {
          name: "custom",
          label: `Custom shares (optional): ${groupMembers.map((m) => name(m.userId).split(" ")[0]).join(", ")}`,
          optional: true,
          help: "Comma-separated rupee amounts, including 0 for excluded members. Leave blank for equal shares.",
        },
        {
          name: "linkPersonal",
          label: "Also record my cash payment in My Balance",
          type: "checkbox",
          help: "Cash decreases by the full payment. Spending reports count only your share; the rest is a receivable.",
        },
      ],
      run: async (d) => {
        const ids = groupMembers.map((m) => m.userId);
        let shares: Record<string, number> | undefined;
        if (d.custom.trim()) {
          const values = d.custom
            .split(",")
            .map((v) => (v.trim() === "0" ? 0 : parseMoney(v.trim())));
          if (values.length !== ids.length)
            throw Error("Enter one amount for every listed member.");
          shares = Object.fromEntries(ids.map((id, i) => [id, values[i]]));
        }
        await act(
          {
            type: "expense.add",
            groupId: g.id,
            description: d.description,
            amount: parseMoney(d.amount),
            memberIds: ids,
            ...(shares ? { shares } : {}),
            linkPersonal: d.linkPersonal === "true",
          },
          "Shared expense added.",
        );
      },
    });
  }
  function beginTransfer(l: Loan) {
    if (l.status === "accepted") {
      void act(
        { type: "transfer.start", loanId: l.id },
        "The borrower can now confirm receipt.",
      ).catch(() => {});
      return;
    }
    open({
      title: "Record a repayment.",
      description:
        "Send the money outside Settle, then ask the lender to generate a receipt code. Your balance changes only after verification.",
      submit: "Start repayment",
      fields: [
        {
          name: "amount",
          label: `Amount (up to ${money(l.remainingBalance)})`,
          type: "number",
          value: String(l.remainingBalance / 100),
        },
      ],
      run: async (d) => {
        await act(
          {
            type: "transfer.start",
            loanId: l.id,
            amount: parseMoney(d.amount),
          },
          "Repayment awaiting receiver verification.",
        );
      },
    });
  }
  function enterCode(l: Loan) {
    open({
      title: "Confirm the transfer.",
      description:
        "Enter the one-time code provided by the person who received the money. Codes expire after five minutes.",
      submit: "Verify transfer",
      fields: [{ name: "code", label: "6-digit receipt code", type: "text" }],
      run: async (d) => {
        await act(
          { type: "verification.confirm", loanId: l.id, code: d.code },
          "Transfer confirmed. Both accounts are updated.",
        );
      },
    });
  }
  function loanCard(l: Loan) {
    const borrowing = l.borrowerId === uid,
      overdue =
        l.activatedAt !== undefined &&
        !l.settledAt &&
        Date.now() > l.activatedAt + 3 * DAY;
    return (
      <button
        key={l.id}
        className="loan-row"
        onClick={() => {
          setSelectedLoan(l.id);
          setCode(null);
        }}
      >
        <Avatar name={name(borrowing ? l.lenderId : l.borrowerId)} />
        <span className="row-main">
          <strong>{name(borrowing ? l.lenderId : l.borrowerId)}</strong>
          <small>
            {borrowing ? "You borrowed" : "You lent"} - {l.reason}
          </small>
        </span>
        <span className="row-end">
          <strong>
            {money(l.status === "settled" ? l.amount : l.remainingBalance)}
          </strong>
          <span
            className={`badge ${overdue ? "orange" : l.status === "settled" ? "green" : "purple"}`}
          >
            {overdue ? "Overdue" : statusName(l)}
          </span>
        </span>
        <ChevronRight size={16} />
      </button>
    );
  }
  function transactions(items: Entry[]) {
    return items.length ? (
      <div className="transactions">
        {[...items]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => (
            <div className="transaction" key={e.id}>
              <span
                className={`transaction-icon ${e.type === "income" ? "mint" : e.type === "transfer" ? "blue" : "peach"}`}
              >
                {e.type === "income" ? (
                  <ArrowDownLeft size={19} />
                ) : e.type === "transfer" ? (
                  <RefreshCw size={17} />
                ) : (
                  <ArrowUpRight size={19} />
                )}
              </span>
              <span className="row-main">
                <strong>{e.note || e.category}</strong>
                <small>
                  {e.category} <span>·</span>{" "}
                  {displayDate(new Date(e.date).getTime())} ·{" "}
                  {accountName(e.fromAccount)}
                  {e.toAccount ? ` → ${accountName(e.toAccount)}` : ""}
                  {e.recipientId
                    ? ` → ${name(e.recipientId)} - ${e.paymentKind === "cash_movement" ? "Cash movement" : "Friend payment"}`
                    : ""}
                  {e.sourceId ? " - Group payment" : ""}
                </small>
              </span>
              <strong className={e.type === "income" ? "positive" : ""}>
                {e.type === "income" ? "+" : e.type === "expense" ? "−" : ""}
                {money(e.amount)}
              </strong>
            </div>
          ))}
      </div>
    ) : (
      <Empty
        title="A fresh start."
        body="Add your first transaction to see it here."
      />
    );
  }
  function spending() {
    const values = expenseCategories
      .map((cat) => ({
        cat,
        n: entries
          .filter(
            (e) =>
              e.type === "expense" &&
              e.date.startsWith(month) &&
              e.category === cat,
          )
          .reduce((a, e) => a + (e.expenseShare ?? e.amount), 0),
      }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return values.length ? (
      <div className="categories">
        {values.slice(0, page === "Reports" ? 9 : 5).map((x, i) => (
          <div key={x.cat}>
            <div className="spread">
              <span>
                <i className={`dot dot-${i % 4}`} />
                {x.cat}
              </span>
              <strong>{money(x.n)}</strong>
            </div>
            <div className="track">
              <span
                className={`bar-${i % 4}`}
                style={{
                  width: `${(x.n / Math.max(summary.spend, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty
        title="Room for a new month."
        body="Your spending breakdown will appear here."
      />
    );
  }
  function chart() {
    const daysInMonth = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
      0,
    ).getDate();
    const buckets = Array.from({ length: daysInMonth }, (_, i) =>
      entries
        .filter(
          (e) =>
            e.type === "expense" &&
            e.date === `${month}-${String(i + 1).padStart(2, "0")}`,
        )
        .reduce((n, e) => n + (e.expenseShare ?? e.amount), 0),
    );
    const max = Math.max(1, ...buckets);
    return (
      <div className="chart">
        <div className="chart-labels">
          <span>{money(max)}</span>
          <span>{money(Math.round(max / 2))}</span>
          <span>Rs 0</span>
        </div>
        <div className="plot">
          <div className="gridlines">
            <i />
            <i />
            <i />
          </div>
          <div className="bars">
            {buckets.map((n, i) => (
              <div key={i} className="bar-wrap">
                <div
                  className={`chart-bar ${n ? "filled" : ""}`}
                  style={{ height: `${Math.max(2, (n / max) * 100)}%` }}
                  title={`${month}-${i + 1}: ${money(n)}`}
                  aria-label={`Day ${i + 1}: ${money(n)}`}
                />
              </div>
            ))}
          </div>
          <div className="x-labels">
            <span>01</span>
            <span>07</span>
            <span>14</span>
            <span>21</span>
            <span>{daysInMonth}</span>
          </div>
        </div>
      </div>
    );
  }
  function exportReport() {
    const data = [
      [
        "Date",
        "Type",
        "Category",
        "Note",
        "Cash amount LKR",
        "Expense share LKR",
        "Account",
        "To account",
        "Friend",
        "Payment purpose",
      ],
      ...entries
        .filter((e) => e.date.startsWith(month))
        .map((e) => [
          e.date,
          e.type,
          e.category,
          e.note,
          (e.amount / 100).toFixed(2),
          e.type === "expense"
            ? ((e.expenseShare ?? e.amount) / 100).toFixed(2)
            : "",
          accountName(e.fromAccount),
          e.toAccount ? accountName(e.toAccount) : "",
          e.recipientId ? name(e.recipientId) : "",
          e.paymentKind ?? "",
        ]),
    ];
    const csv = data
      .map((row) =>
        row
          .map(
            (v) =>
              `"${String(v)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `settle-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const currentLoan = s.loans.find((l) => l.id === selectedLoan);
  const currentChallenge = s.verificationChallenges.find(
    (c) => c.loanId === selectedLoan && !c.used,
  );
  const loanActions = currentLoan && currentLoan.participants.includes(uid);
  return (
    <div className={`app-shell theme-${selectedTheme} font-${selectedFont}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => go("Home")}>
          <span className="brand-mark">s</span>settle
          <span className="brand-dot">.</span>
        </button>
        <div className="workspace-label">YOUR EVERYDAY SPACE</div>
        <nav>
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "nav-item active" : "nav-item"}
              onClick={() => go(name)}
            >
              <Icon size={20} />
              {name}
              {name === "Groups" && (
                <span className="nav-count">{myGroups.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="together-card">
            <span>✦</span>
            <strong>A little more balanced.</strong>
            <p>
              Good money habits.
              <br />
              Even better together.
            </p>
          </div>
          <button
            className={`nav-item ${page === "Notifications" ? "active" : ""}`}
            onClick={() => go("Notifications")}
          >
            <Bell size={20} />
            Notifications
            {unread > 0 && <span className="notification-count">{unread}</span>}
          </button>
          <button
            className="profile-button"
            onClick={() => go("Profile / Trust")}
          >
            <Avatar name={me.name} />
            <span>
              <strong>{me.name}</strong>
              <small>Personal account</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            My workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </span>
          <div className="top-actions">
            {demo && (
              <label className="demo-switch">
                <span className="live-dot" />
                Demo{" "}
                <select
                  aria-label="Demo person"
                  value={uid}
                  onChange={(e) => f.setUid(e.target.value)}
                >
                  {s.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name.split(" ")[0]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="icon-button"
              aria-label="Refresh data"
              onClick={() => void f.refresh()}
            >
              <RefreshCw size={18} />
            </button>
            <button
              className="icon-button bell-button"
              aria-label="Notifications"
              onClick={() => go("Notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <button
              className="avatar-button"
              aria-label="Profile"
              onClick={() => go("Profile / Trust")}
            >
              <Avatar name={me.name} size="small" />
            </button>
            <button
              className="icon-button exit-button"
              aria-label="Exit app"
              onClick={exitApp}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          {joinToken && (
            <section className="join-banner">
              <div>
                <strong>You have a group invitation link</strong>
                <p>Review the group and request to join.</p>
              </div>
              <button
                className="primary"
                disabled={f.busy}
                onClick={() => void reviewJoin()}
              >
                View group invite
              </button>
              <button
                className="icon-button"
                aria-label="Dismiss invitation link"
                onClick={dismissJoin}
              >
                <X size={18} />
              </button>
            </section>
          )}
          {onboardingCard()}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Home"
                  ? "A LITTLE CLARITY FOR YOUR EVERYDAY"
                  : page === "Groups"
                    ? "SHARED MOMENTS, SHARED MONEY"
                    : page === "My Loans"
                      ? "KEEPING THINGS FAIR"
                      : "YOUR MONEY, AT A GLANCE"}
              </div>
              <h1>
                {page === "Home"
                  ? `Hey, ${me.name.split(" ")[0]}.`
                  : currentGroup
                    ? currentGroup.name
                    : page === "Profile / Trust"
                      ? "A little about you."
                      : page}
              </h1>
              <p>
                {page === "Home"
                  ? "Here’s where things stand. You’re doing great."
                  : page === "My Balance"
                    ? "Your private space for every rupee in and out."
                    : page === "Friends"
                      ? "Good friends. Clear balances."
                      : page === "My Loans"
                        ? "Every request, repayment and little act of trust."
                        : page === "Groups"
                          ? (currentGroup?.description ??
                            "Life is shared. Your expenses can be too.")
                          : page === "Reports"
                            ? "See the bigger picture, one month at a time."
                            : page === "Notifications"
                              ? "All the little things that need your attention."
                              : "Your account and repayment story."}
              </p>
            </div>
            <div className="heading-actions">
              {["Home", "My Balance", "Reports"].includes(page) && (
                <input
                  aria-label="Report month"
                  className="month-select"
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                />
              )}
              {!["Friends", "Notifications", "Profile / Trust"].includes(
                page,
              ) && (
                <button
                  className="primary"
                  onClick={() =>
                    page === "Groups"
                      ? currentGroup
                        ? addExpense()
                        : createGroup()
                      : page === "My Loans"
                        ? requestLoan()
                        : page === "Reports"
                          ? exportReport()
                          : addEntry()
                  }
                >
                  {page === "Reports" ? (
                    <Download size={17} />
                  ) : (
                    <Plus size={18} />
                  )}{" "}
                  {page === "Groups"
                    ? currentGroup
                      ? "Add expense"
                      : "Create group"
                    : page === "My Loans"
                      ? "Request money"
                      : page === "Reports"
                        ? "Export CSV"
                        : "Add transaction"}
                </button>
              )}
            </div>
          </div>
          {f.error && !modal && (
            <div className="error" role="alert">
              {f.error}
              <button aria-label="Dismiss error" onClick={() => f.setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Home" && (
            <>
              {dailySpendingCard()}
              <div className="overview-grid">
                <section className="balance-card">
                  <div className="spread">
                    <span>
                      <Wallet size={17} /> YOUR BALANCE
                    </span>
                    <span className="card-chip">
                      <i />
                      <i />
                    </span>
                  </div>
                  <div className="big-balance">{money(summary.balance)}</div>
                  <div className="balance-caption">
                    A little peace of mind, in numbers.
                  </div>
                  <div className="balance-bottom">
                    <span>PERSONAL - LKR</span>
                    <button onClick={() => go("My Balance")}>
                      View balance <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="balance-orbit" />
                </section>
                <section className="stat-card">
                  <span className="stat-icon mint">
                    <ArrowDownLeft size={21} />
                  </span>
                  <p>Money in</p>
                  <h2>{money(summary.income)}</h2>
                  <span className="stat-foot">
                    <i className="dot mint-dot" />
                    This month’s income
                  </span>
                </section>
                <section className="stat-card">
                  <span className="stat-icon peach">
                    <ArrowUpRight size={21} />
                  </span>
                  <p>Money out</p>
                  <h2>{money(summary.spend)}</h2>
                  <span className="stat-foot">Your share of spending</span>
                </section>
                <section className="stat-card">
                  <span className="stat-icon lilac">
                    <HandCoins size={21} />
                  </span>
                  <p>You’re owed</p>
                  <h2>{money(lent)}</h2>
                  <button
                    className="text-button stat-foot"
                    onClick={() => go("My Loans")}
                  >
                    {activeLoans.filter((l) => l.lenderId === uid).length}{" "}
                    active loans <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              {bankingPanel()}
              {periodCards()}
              <div className="quick-actions">
                <button onClick={() => addEntry("expense")}>
                  <span className="quick-icon peach">
                    <Plus size={18} />
                  </span>
                  Add expense
                </button>
                <button onClick={() => addEntry("income")}>
                  <span className="quick-icon mint">
                    <ArrowDownLeft size={18} />
                  </span>
                  Add income
                </button>
                <button onClick={() => requestLoan()}>
                  <span className="quick-icon lilac">
                    <HandCoins size={18} />
                  </span>
                  Request money
                </button>
                <button onClick={() => go("Groups")}>
                  <span className="quick-icon blue">
                    <Users size={18} />
                  </span>
                  Split with a group
                </button>
              </div>
              <div className="content-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Spending, at a glance</h2>
                      <p>A small look at your everyday.</p>
                    </div>
                    <span className="quiet-label">{monthName(month)}</span>
                  </div>
                  {chart()}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Where it went</h2>
                      <p>A little awareness goes a long way.</p>
                    </div>
                    <button
                      aria-label="View reports"
                      className="icon-button"
                      onClick={() => go("Reports")}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  {spending()}
                </section>
              </div>
              <div className="content-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>The ins, the outs, the everyday.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("My Balance")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {transactions(
                    entries
                      .filter((e) => e.date.startsWith(month))
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 4),
                  )}
                </section>
                <div className="stack">
                  <section className="trust-card">
                    <div className="spread">
                      <span className="trust-icon">
                        <ShieldCheck size={22} />
                      </span>
                      <span className="badge green">YOUR TRUST</span>
                    </div>
                    <div className="spread">
                      <div>
                        <h2>
                          {(me.trustTenths / 10).toFixed(1)}
                          <span>%</span>
                        </h2>
                        <strong>
                          {me.trustTenths >= 990
                            ? "A strong foundation."
                            : "Your repayment story."}
                        </strong>
                      </div>
                      <div className="trust-spark">✧</div>
                    </div>
                    <p>Little commitments. Lasting trust.</p>
                    <button
                      className="text-button"
                      onClick={() => go("Profile / Trust")}
                    >
                      See your trust story <ArrowRight size={15} />
                    </button>
                  </section>
                  <section className="mini-group">
                    <div className="avatar-stack">
                      {myGroups.slice(0, 3).map((g) => (
                        <span key={g.id}>{g.name[0]}</span>
                      ))}
                    </div>
                    <div>
                      <strong>Your people, in one place.</strong>
                      <p>
                        {myGroups.length} groups. A whole lot of shared moments.
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="View groups"
                      onClick={() => go("Groups")}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </section>
                </div>
              </div>
            </>
          )}
          {page === "My Balance" && (
            <>
              {dailySpendingCard()}
              <div className="metric-grid">
                {[
                  ["My Balance", summary.balance],
                  ["Monthly income", summary.income],
                  ["Your spending", summary.spend],
                  ["Income less spending", summary.remaining],
                ].map(([label, n]) => (
                  <div className="panel metric" key={label}>
                    <p>{label}</p>
                    <h2>{money(Number(n))}</h2>
                  </div>
                ))}
              </div>
              {periodCards()}
              <div className="toolbar">
                <div className="segmented">
                  <button onClick={() => addEntry("income")}>
                    ＋ Add money
                  </button>
                  <button onClick={() => addEntry("expense")}>
                    ＋ Expense
                  </button>
                  <button onClick={() => addEntry("transfer")}>
                    ⇄ Transfer
                  </button>
                  <button onClick={() => friendPayment()}>
                    Record friend payment
                  </button>
                </div>
                <label className="date-filter">
                  Daily view{" "}
                  <input
                    aria-label="Filter by day"
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                  {day && (
                    <button className="text-button" onClick={() => setDay("")}>
                      Clear
                    </button>
                  )}
                </label>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>{day ? `Activity for ${day}` : monthName(month)}</h2>
                  <span className="badge purple">
                    <ShieldCheck size={13} /> Only you
                  </span>
                </div>
                {transactions(
                  entries.filter((e) =>
                    day ? e.date === day : e.date.startsWith(month),
                  ),
                )}
              </section>
              <div className="content-grid">
                <section className="panel">
                  <h2>Spending by category</h2>
                  {spending()}
                </section>
                <section className="panel">
                  <h2>Your accounts</h2>
                  {["Personal Wallet", "Mobile Bank", "Savings"].map((account) => (
                    <div
                      className="account-row"
                      data-testid={`account-${account.toLowerCase()}`}
                      key={account}
                    >
                      <span className="account-identity">
                        <CreditCard size={18} />
                        <span>
                          <strong>{account}</strong>
                          <small>Current balance</small>
                        </span>
                      </span>
                      <strong>{money(accountBalance(entries, account))}</strong>
                      <button
                        className="secondary"
                        aria-label={`Add money to ${account}`}
                        onClick={() => addEntry("income", account)}
                      >
                        ＋ Add money
                      </button>
                    </div>
                  ))}
                  <p className="muted">
                    Group payments reduce cash by the full amount paid. Reports
                    count your share as spending; money owed by others remains a
                    receivable.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === "Friends" && (
            <>
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search people"
                  placeholder="Search name, @handle or 000001 ID…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {s.friendRequests.filter(
                (r) => r.to === uid && r.status === "pending",
              ).length > 0 && (
                <section className="panel">
                  <h2>Friend requests</h2>
                  {s.friendRequests
                    .filter((r) => r.to === uid && r.status === "pending")
                    .map((r) => (
                      <div className="person-row" key={r.id}>
                        <Avatar name={name(r.from)} />
                        <div className="row-main">
                          <strong>{name(r.from)}</strong>
                          <small>Would like to connect with you</small>
                        </div>
                        <button
                          className="secondary"
                          disabled={f.busy}
                          onClick={() =>
                            void act({
                              type: "friend.respond",
                              requestId: r.id,
                              accept: false,
                            }).catch(() => {})
                          }
                        >
                          Decline
                        </button>
                        <button
                          className="primary"
                          disabled={f.busy}
                          onClick={() =>
                            void act(
                              {
                                type: "friend.respond",
                                requestId: r.id,
                                accept: true,
                              },
                              "You’re now connected.",
                            ).catch(() => {})
                          }
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                </section>
              )}
              <div className="people-grid">
                {s.users
                  .filter(
                    (u) =>
                      u.id !== uid &&
                      `${u.name} ${u.handle} ${u.publicId ?? ""}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((u) => {
                    const friend = friendIds.includes(u.id),
                      pending = s.friendRequests.some(
                        (r) =>
                          r.status === "pending" &&
                          [r.from, r.to].includes(u.id),
                      );
                    return (
                      <section className="panel person-card" key={u.id}>
                        <Avatar name={u.name} size="large" />
                        <h2>{u.name}</h2>
                        <p>@{u.handle} - {u.publicId}</p>
                        <span className="badge green">
                          <ShieldCheck size={13} />
                          {(u.trustTenths / 10).toFixed(1)}% trust
                        </span>
                        {friend ? (
                          <>
                            <button
                              className="secondary"
                              onClick={() => requestLoan(u.id)}
                            >
                              <HandCoins size={16} />
                              Request money
                            </button>
                            <button
                              className="secondary"
                              onClick={() => friendPayment(u.id)}
                            >
                              Record payment
                            </button>
                          </>
                        ) : (
                          <button
                            className="secondary"
                            disabled={pending || f.busy}
                            onClick={() =>
                              void act(
                                { type: "friend.request", userId: u.id },
                                "Friend request sent.",
                              ).catch(() => {})
                            }
                          >
                            {pending ? "Request pending" : "+ Add friend"}
                          </button>
                        )}
                      </section>
                    );
                  })}
              </div>
            </>
          )}
          {page === "Groups" && !currentGroup && (
            <>
              {(s.groupInvites ?? []).filter(
                (i) => i.to === uid && i.status === "pending",
              ).length > 0 && (
                <section className="panel">
                  <h2>Invitations for you</h2>
                  {(s.groupInvites ?? [])
                    .filter((i) => i.to === uid && i.status === "pending")
                    .map((i) => (
                      <div className="person-row" key={i.id}>
                        <Avatar name={name(i.from)} />
                        <span className="row-main">
                          <strong>{i.groupName}</strong>
                          <small>Invited by {name(i.from)}</small>
                        </span>
                        <button
                          className="secondary"
                          disabled={f.busy}
                          onClick={() =>
                            void act(
                              {
                                type: "group.invite.respond",
                                inviteId: i.id,
                                accept: false,
                              },
                              "Invitation declined.",
                            ).catch(() => {})
                          }
                        >
                          Decline invite
                        </button>
                        <button
                          className="primary"
                          disabled={f.busy}
                          onClick={async () => {
                            try {
                              const r = await f.act({
                                type: "group.invite.respond",
                                inviteId: i.id,
                                accept: true,
                              });
                              setToast(
                                r.membershipStatus === "active"
                                  ? "You joined the group."
                                  : "Accepted. Waiting for admin approval.",
                              );
                            } catch {}
                          }}
                        >
                          Accept invite
                        </button>
                      </div>
                    ))}
                </section>
              )}
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search groups"
                  placeholder="Find your group…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="group-grid">
                {s.groups
                  .filter((g) =>
                    g.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((g, i) => {
                    const membership = s.groupMembers.find(
                      (m) => m.userId === uid && m.groupId === g.id,
                    );
                    return (
                      <section className="panel group-card" key={g.id}>
                        <div className={`group-cover cover-${i % 3}`}>
                          <span>
                            {g.name
                              .split(" ")
                              .map((x) => x[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <span className="badge">
                            {membership?.status === "active"
                              ? "Your group"
                              : "Discover"}
                          </span>
                        </div>
                        <h2>{g.name}</h2>
                        <p>{g.description}</p>
                        <div className="simple-row">
                          <small>Monthly fund target</small>
                          <strong>{money(g.monthlyTarget)}</strong>
                        </div>
                        {membership?.status === "active" ? (
                          <button
                            className="secondary"
                            onClick={() => {
                              setGroupId(g.id);
                              setGroupTab("Overview");
                            }}
                          >
                            Open group <ArrowRight size={16} />
                          </button>
                        ) : (
                          <button
                            className="secondary"
                            disabled={
                              membership?.status === "pending" || f.busy
                            }
                            onClick={() =>
                              void act(
                                { type: "group.join", groupId: g.id },
                                "Request sent to group admins.",
                              ).catch(() => {})
                            }
                          >
                            {membership?.status === "pending"
                              ? "Awaiting admin approval"
                              : "Request to join"}
                          </button>
                        )}
                      </section>
                    );
                  })}
              </div>
            </>
          )}
          {page === "Groups" && currentGroup && (
            <>
              <section className="panel group-invite-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Bring your people together</h2>
                    <p>
                      Invite a friend or share a link. Shared links require
                      admin approval.
                    </p>
                  </div>
                  <div className="invite-actions">
                    <button
                      className="secondary"
                      disabled={f.busy}
                      onClick={() => void generateLink()}
                    >
                      Generate join link
                    </button>
                    <button className="primary" onClick={inviteFriend}>
                      Invite a friend
                    </button>
                  </div>
                </div>
                {sharedLink?.groupId === groupId && (
                  <div className="share-link">
                    <label>
                      Group join link
                      <input
                        readOnly
                        value={sharedLink.url}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(sharedLink.url);
                          setToast("Group link copied.");
                        } catch {
                          setToast("Select and copy the link from the field.");
                        }
                      }}
                    >
                      Copy link
                    </button>
                    {admin && (
                      <button
                        className="text-button"
                        disabled={f.busy}
                        onClick={() => void generateLink(true)}
                      >
                        Reset shared links
                      </button>
                    )}
                    <small>
                      Expires {displayDate(sharedLink.expiresAt)}.{" "}
                      {demo
                        ? "Demo links only work with this browser’s saved demo data. Use Supabase and a published URL to invite people on other devices."
                        : "Anyone with this link can request to join. Group finances remain private until approved."}
                    </small>
                  </div>
                )}
                {(s.groupInvites ?? [])
                  .filter(
                    (i) => i.groupId === groupId && i.status === "pending",
                  )
                  .map((i) => (
                    <p className="muted" key={i.id}>
                      Invitation pending - {name(i.to)}
                    </p>
                  ))}
              </section>
              <button
                className="text-button back"
                onClick={() => setGroupId(null)}
              >
                <ArrowLeft size={16} />
                All groups
              </button>
              <div className="tabbar">
                {["Overview", "Expenses", "Loans", "Fund", "Members"].map(
                  (t) => (
                    <button
                      key={t}
                      className={groupTab === t ? "selected" : ""}
                      onClick={() => setGroupTab(t)}
                    >
                      {t}
                    </button>
                  ),
                )}
              </div>
              {groupTab === "Overview" && (
                <div className="content-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Who owes whom</h2>
                        <p>Shared expenses, automatically simplified.</p>
                      </div>
                      <RefreshCw size={18} />
                    </div>
                    {groupDebts(s, currentGroup.id).map((d, i) => (
                      <div className="debt-row" key={i}>
                        <Avatar name={name(d.from)} />
                        <div className="row-main">
                          <strong>
                            {name(d.from).split(" ")[0]}{" "}
                            <ArrowRight size={13} /> {name(d.to).split(" ")[0]}
                          </strong>
                          <small>Net expense balance</small>
                        </div>
                        <strong>{money(d.amount)}</strong>
                      </div>
                    ))}
                    {!groupDebts(s, currentGroup.id).length && (
                      <Empty
                        title="All square."
                        body="No outstanding shared expense balances."
                      />
                    )}
                    <p className="muted">
                      Reciprocal and circular expense debts are offset. Verified
                      loans are shown separately and keep their original lender
                      and borrower.
                    </p>
                  </section>
                  <section className="panel">
                    <h2>Group snapshot</h2>
                    <div className="simple-row">
                      <span>Active members</span>
                      <strong>{groupMembers.length}</strong>
                    </div>
                    <div className="simple-row">
                      <span>Total shared expenses</span>
                      <strong>
                        {money(
                          s.expenses
                            .filter((e) => e.groupId === groupId)
                            .reduce((n, e) => n + e.amount, 0),
                        )}
                      </strong>
                    </div>
                    <div className="simple-row">
                      <span>Unsettled loan balance</span>
                      <strong>
                        {money(
                          s.loans
                            .filter(
                              (l) =>
                                l.groupId === groupId &&
                                ["active", "partial"].includes(l.status),
                            )
                            .reduce((n, l) => n + l.remainingBalance, 0),
                        )}
                      </strong>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => requestLoan(undefined, currentGroup.id)}
                    >
                      Request a group loan
                    </button>
                  </section>
                </div>
              )}
              {groupTab === "Expenses" && (
                <section className="panel">
                  <h2>Shared expenses</h2>
                  {s.expenses
                    .filter((e) => e.groupId === groupId)
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((e) => (
                      <div className="expense-detail" key={e.id}>
                        <div className="simple-row">
                          <div>
                            <strong>{e.description}</strong>
                            <p>
                              {name(e.paidBy)} paid - {displayDate(e.createdAt)}
                            </p>
                          </div>
                          <strong>{money(e.amount)}</strong>
                        </div>
                        <div className="split-chips">
                          {s.expenseSplits
                            .filter((x) => x.expenseId === e.id)
                            .map((x) => (
                              <span key={x.id}>
                                {name(x.userId).split(" ")[0]} ·{" "}
                                {money(x.amount)}
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                  {!s.expenses.some((e) => e.groupId === groupId) && (
                    <Empty
                      title="Start with a shared moment."
                      body="Add an expense to split it with the group."
                    />
                  )}
                </section>
              )}
              {groupTab === "Loans" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Group loans</h2>
                    <button
                      className="secondary"
                      onClick={() => requestLoan(undefined, currentGroup.id)}
                    >
                      Request loan
                    </button>
                  </div>
                  {s.loans.filter((l) => l.groupId === groupId).map(loanCard)}
                  <p className="muted">
                    These are the same records shown in each participant’s My
                    Loans. Leaving this group never erases a loan.
                  </p>
                </section>
              )}
              {groupTab === "Fund" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Monthly fund</h2>
                      <p>
                        Members submit payments; another admin confirms receipt.
                      </p>
                    </div>
                    <input
                      type="month"
                      aria-label="Fund month"
                      value={month}
                      onChange={(e) =>
                        e.target.value && setMonth(e.target.value)
                      }
                    />
                  </div>
                  {admin && (
                    <button
                      className="secondary"
                      onClick={() =>
                        open({
                          title: "Set the monthly target.",
                          submit: "Save target",
                          fields: [
                            {
                              name: "target",
                              label: "Total group target (LKR)",
                              type: "number",
                              value: String(currentGroup.monthlyTarget / 100),
                            },
                          ],
                          run: async (d) => {
                            await act({
                              type: "fund.set",
                              groupId: currentGroup.id,
                              month,
                              target: parseMoney(d.target),
                            });
                          },
                        })
                      }
                    >
                      Set {monthName(month)} target
                    </button>
                  )}
                  {(() => {
                    const fund = s.funds.find(
                      (x) => x.groupId === groupId && x.month === month,
                    );
                    if (!fund)
                      return (
                        <Empty
                          title="A new month ahead."
                          body="Ask an admin to set this month’s fund target."
                        />
                      );
                    const paid = s.contributions
                      .filter(
                        (c) => c.fundId === fund.id && c.status === "paid",
                      )
                      .reduce((n, c) => n + c.amount, 0);
                    return (
                      <>
                        <div className="fund-total">
                          <h2>
                            {money(paid)} <small>of {money(fund.target)}</small>
                          </h2>
                          <div className="track">
                            <span
                              style={{
                                width: `${Math.min(100, (paid / fund.target) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        {groupMembers.map((m) => {
                          const p = s.contributions.find(
                            (p) =>
                              p.fundId === fund.id && p.userId === m.userId,
                          );
                          return (
                            <div className="person-row" key={m.id}>
                              <Avatar name={name(m.userId)} />
                              <span className="row-main">
                                <strong>{name(m.userId)}</strong>
                                <small>
                                  {p ? money(p.amount) : "No contribution yet"}
                                </small>
                              </span>
                              <span
                                className={`badge ${p?.status === "paid" ? "green" : "orange"}`}
                              >
                                {p?.status === "paid"
                                  ? "Paid"
                                  : p
                                    ? "Pending"
                                    : "Unpaid"}
                              </span>
                              {!p && m.userId === uid && (
                                <button
                                  className="secondary"
                                  onClick={() =>
                                    open({
                                      title: "Submit your contribution.",
                                      description:
                                        "An admin will confirm receipt before this is marked paid.",
                                      submit: "Submit payment",
                                      fields: [
                                        {
                                          name: "amount",
                                          label: "Amount (LKR)",
                                          type: "number",
                                          value: String(
                                            Math.ceil(
                                              fund.target / groupMembers.length,
                                            ) / 100,
                                          ),
                                        },
                                      ],
                                      run: async (d) => {
                                        await act(
                                          {
                                            type: "contribution.pay",
                                            groupId,
                                            fundId: fund.id,
                                            amount: parseMoney(d.amount),
                                          },
                                          "Contribution submitted.",
                                        );
                                      },
                                    })
                                  }
                                >
                                  I’ve paid
                                </button>
                              )}
                              {p?.status === "pending" &&
                                admin &&
                                m.userId !== uid && (
                                  <button
                                    className="secondary"
                                    disabled={f.busy}
                                    onClick={() =>
                                      void act(
                                        {
                                          type: "contribution.confirm",
                                          groupId,
                                          contributionId: p.id,
                                        },
                                        "Contribution confirmed.",
                                      ).catch(() => {})
                                    }
                                  >
                                    Confirm receipt
                                  </button>
                                )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </section>
              )}
              {groupTab === "Members" && (
                <section className="panel">
                  <h2>The people behind the group</h2>
                  {groupMembers.map((m) => (
                    <div className="person-row" key={m.id}>
                      <Avatar name={name(m.userId)} />
                      <span className="row-main">
                        <strong>{name(m.userId)}</strong>
                        <small>{m.role}</small>
                      </span>
                      {admin && m.userId !== uid && (
                        <button
                          className="secondary"
                          disabled={f.busy}
                          onClick={() =>
                            void act({
                              type: "group.role",
                              groupId,
                              userId: m.userId,
                              role: m.role === "admin" ? "member" : "admin",
                            }).catch(() => {})
                          }
                        >
                          {m.role === "admin" ? "Make member" : "Make admin"}
                        </button>
                      )}
                    </div>
                  ))}
                  {admin &&
                    s.groupMembers
                      .filter(
                        (m) => m.groupId === groupId && m.status === "pending",
                      )
                      .map((m) => (
                        <div className="person-row" key={m.id}>
                          <span className="row-main">
                            <strong>{name(m.userId)}</strong>
                            <small>Requested to join</small>
                          </span>
                          <button
                            className="secondary"
                            disabled={f.busy}
                            onClick={() =>
                              void act({
                                type: "group.approve",
                                groupId,
                                memberId: m.id,
                                accept: false,
                              }).catch(() => {})
                            }
                          >
                            Decline
                          </button>
                          <button
                            className="primary"
                            disabled={f.busy}
                            onClick={() =>
                              void act({
                                type: "group.approve",
                                groupId,
                                memberId: m.id,
                                accept: true,
                              }).catch(() => {})
                            }
                          >
                            Approve
                          </button>
                        </div>
                      ))}
                  <button
                    className="text-button danger"
                    onClick={() =>
                      open({
                        title: "Leave this group?",
                        description:
                          "Your expenses and unsettled loans remain in the records. You can still manage your loans in My Loans.",
                        fields: [],
                        submit: "Leave group",
                        run: async () => {
                          await act(
                            { type: "group.leave", groupId },
                            "You left the group.",
                          );
                          setGroupId(null);
                        },
                      })
                    }
                  >
                    Leave group
                  </button>
                </section>
              )}
            </>
          )}
          {page === "My Loans" && (
            <>
              <div className="metric-grid three">
                <div className="panel metric">
                  <p>You owe</p>
                  <h2>{money(borrowed)}</h2>
                </div>
                <div className="panel metric">
                  <p>You’re owed</p>
                  <h2>{money(lent)}</h2>
                </div>
                <div className="panel metric">
                  <p>Active loans</p>
                  <h2>{activeLoans.length}</h2>
                </div>
              </div>
              <div className="tabbar">
                {["All", "Borrowed", "Lent", "Pending", "Settled"].map((x) => (
                  <button
                    key={x}
                    className={loanFilter === x ? "selected" : ""}
                    onClick={() => setLoanFilter(x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <section className="panel">
                {myLoans
                  .filter(
                    (l) =>
                      loanFilter === "All" ||
                      (loanFilter === "Borrowed" && l.borrowerId === uid) ||
                      (loanFilter === "Lent" && l.lenderId === uid) ||
                      (loanFilter === "Settled" && l.status === "settled") ||
                      (loanFilter === "Pending" &&
                        ["requested", "accepted", "transfer_pending"].includes(
                          l.status,
                        )),
                  )
                  .map(loanCard)}
                {!myLoans.length && (
                  <Empty
                    title="A clean slate."
                    body="Request money from a friend to start a verified loan."
                  />
                )}
              </section>
              <div className="info-note">
                <ShieldCheck size={20} />
                <p>
                  <strong>Always confirmed by both people.</strong> Settle
                  records money you exchange outside the app. A transfer only
                  counts after the receiver shares a verification code.
                </p>
              </div>
            </>
          )}
          {page === "Notifications" && (
            <section className="panel">
              {s.notifications.length ? (
                s.notifications
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((n) => {
                    const friendRequestId = n.id.startsWith("friend_request_")
                      ? n.id.replace("friend_request_", "")
                      : null;
                    const friendRequest = friendRequestId
                      ? s.friendRequests.find(
                          (r) =>
                            r.id === friendRequestId &&
                            r.to === uid &&
                            r.status === "pending",
                        )
                      : null;
                    return (
                      <div
                        className={`notice ${n.read ? "read" : ""}`}
                        key={n.id}
                      >
                        <span className="stat-icon lilac">
                          <Bell size={18} />
                        </span>
                        <div className="row-main">
                          <strong>{n.title}</strong>
                          <p>{n.body}</p>
                          <small>{displayDate(n.createdAt)}</small>
                          {friendRequest && (
                            <div className="notice-actions">
                              <button
                                className="secondary"
                                disabled={f.busy}
                                onClick={() =>
                                  void act(
                                    {
                                      type: "friend.respond",
                                      requestId: friendRequest.id,
                                      accept: false,
                                    },
                                    "Friend request declined.",
                                  ).catch(() => {})
                                }
                              >
                                Decline
                              </button>
                              <button
                                className="primary"
                                disabled={f.busy}
                                onClick={() =>
                                  void act(
                                    {
                                      type: "friend.respond",
                                      requestId: friendRequest.id,
                                      accept: true,
                                    },
                                    "You’re now connected.",
                                  ).catch(() => {})
                                }
                              >
                                Accept
                              </button>
                            </div>
                          )}
                        </div>
                        {!n.read && !friendRequest && (
                          <button
                            className="icon-button"
                            aria-label="Mark read"
                            disabled={f.busy}
                            onClick={() =>
                              void act(
                                {
                                  type: "notification.read",
                                  notificationId: n.id,
                                },
                                "Marked as read.",
                              ).catch(() => {})
                            }
                          >
                            <Check size={18} />
                          </button>
                        )}
                      </div>
                    );
                  })
              ) : (
                <Empty
                  title="All caught up."
                  body="New requests and confirmations will appear here."
                />
              )}
            </section>
          )}
          {page === "Profile / Trust" && (
            <>
              <div className="content-grid">
                <section className="panel profile-card">
                  <Avatar name={me.name} size="large" />
                  <h2>{me.name}</h2>
                  <p>@{me.handle} - {me.publicId}</p>
                  <span className="badge purple">
                    {demo ? "Demo identity" : "Gmail verified"}
                  </span>
                  <button className="secondary" onClick={() => editProfile()}>
                    Edit profile
                  </button>
                  <button
                    className="secondary"
                    onClick={async () => {
                      const shareText = `Add me on Settle. My Settle ID is ${me.publicId}. ${window.location.origin}`;
                      try {
                        await navigator.clipboard.writeText(shareText);
                        setToast("Settle ID copied. Send it to your friend.");
                      } catch {
                        setToast(`Your Settle ID is ${me.publicId}`);
                      }
                    }}
                  >
                    Share my Settle ID
                  </button>
                  <div className="profile-details">
                    <span>
                      <strong>Phone</strong>
                      <small>
                        {me.phoneNumber || "Not added"}
                      </small>
                    </span>
                    <span>
                      <strong>Email</strong>
                      <small>{me.email || f.user?.email || "Not added"}</small>
                    </span>
                    <span>
                      <strong>Settle ID</strong>
                      <small>{me.publicId}</small>
                    </span>
                    <span>
                      <strong>Age</strong>
                      <small>{me.age ? `${me.age} years` : "Not added"}</small>
                    </span>
                  </div>
                  <div className="preference-box">
                    <label>
                      Theme
                      <select
                        value={selectedTheme}
                        onChange={(e) =>
                          void act(
                            {
                              type: "preference.update",
                              theme: e.target.value,
                            },
                            "Theme saved.",
                          ).catch(() => {})
                        }
                      >
                        <option value="ocean">Ocean teal</option>
                        <option value="forest">Forest green</option>
                        <option value="sunrise">Sunrise gold</option>
                      </select>
                    </label>
                    <label>
                      Font
                      <select
                        value={selectedFont}
                        onChange={(e) =>
                          void act(
                            {
                              type: "preference.update",
                              font: e.target.value,
                            },
                            "Font saved.",
                          ).catch(() => {})
                        }
                      >
                        <option value="system">Apple/System</option>
                        <option value="rounded">Rounded</option>
                        <option value="serif">Serif</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      setToast(
                        demo
                          ? "Demo mode is local to this browser."
                          : "You are already signed in with Gmail.",
                      )
                    }
                  >
                    Gmail account active
                  </button>
                  <button
                    className="text-button"
                    onClick={async () => {
                      if (installEvent) {
                        await (
                          installEvent as Event & {
                            prompt: () => Promise<void>;
                          }
                        ).prompt();
                        setInstallEvent(null);
                      } else
                        setToast(
                          "On iPhone: open in Safari, tap Share, then Add to Home Screen.",
                        );
                    }}
                  >
                    <Download size={16} />
                    Install Settle
                  </button>
                  {demo ? (
                    <button
                      className="text-button danger"
                      onClick={() =>
                        open({
                          title: "Reset the demo?",
                          description:
                            "This removes local demo changes and restores the sample people and balances.",
                          fields: [],
                          submit: "Reset demo",
                          run: async () => {
                            f.reset();
                            setToast("Demo reset.");
                          },
                        })
                      }
                    >
                      Reset demo data
                    </button>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => void signOut()}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  )}
                </section>
                <section className="panel trust-profile">
                  <ShieldCheck size={30} />
                  <h2>
                    {(me.trustTenths / 10).toFixed(1)}
                    <span>%</span>
                  </h2>
                  <h3>Your repayment reliability</h3>
                  <p>
                    This is an in-app indicator, not an external credit score.
                  </p>
                  <div className="track">
                    <span style={{ width: `${me.trustTenths / 10}%` }} />
                  </div>
                  <p className="muted">
                    Each confirmed loan has a 72-hour grace period. Every
                    complete overdue day deducts 0.1 percentage points while a
                    balance remains. Full repayment stops future deductions;
                    past deductions stay.
                  </p>
                  <div className="trust-stats">
                    {[
                      [
                        "Total loans",
                        myLoans.filter(
                          (l) =>
                            l.borrowerId === uid && l.activatedAt !== undefined,
                        ).length,
                      ],
                      [
                        "On-time",
                        myLoans.filter(
                          (l) =>
                            l.borrowerId === uid &&
                            l.settledAt !== undefined &&
                            l.settledAt <= l.activatedAt! + 3 * DAY,
                        ).length,
                      ],
                      [
                        "Settled",
                        myLoans.filter(
                          (l) => l.borrowerId === uid && l.status === "settled",
                        ).length,
                      ],
                      [
                        "Active",
                        activeLoans.filter((l) => l.borrowerId === uid).length,
                      ],
                      [
                        "Overdue",
                        activeLoans.filter(
                          (l) =>
                            l.borrowerId === uid &&
                            Date.now() > l.activatedAt! + 3 * DAY,
                        ).length,
                      ],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <strong>{n}</strong>
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="panel">
                <h2>Current overdue loans</h2>
                {activeLoans
                  .filter(
                    (l) =>
                      l.borrowerId === uid &&
                      Date.now() > l.activatedAt! + 3 * DAY,
                  )
                  .map((l) => (
                    <div className="simple-row" key={l.id}>
                      <span>
                        {name(l.lenderId)} - {money(l.remainingBalance)}
                      </span>
                      <strong>
                        {overdueDays(l, Date.now())} complete overdue days - −
                        {(l.penalizedDays / 10).toFixed(1)} pts
                      </strong>
                    </div>
                  ))}
              </section>
              <section className="panel">
                <h2>Your trust history</h2>
                {s.trustEvents.length ? (
                  s.trustEvents
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((e) => (
                      <div className="simple-row" key={e.id}>
                        <div>
                          <strong>{e.reason}</strong>
                          <p>
                            {displayDate(e.createdAt)} - Loan{" "}
                            {e.loanId.slice(0, 12)}
                          </p>
                        </div>
                        <span className="badge orange">
                          {(e.delta / 10).toFixed(1)} pts
                        </span>
                      </div>
                    ))
                ) : (
                  <Empty
                    title="100% fresh start."
                    body="No repayment deductions. Keep building good habits."
                  />
                )}
              </section>
            </>
          )}
          {page === "Reports" && (
            <>
              <div className="metric-grid three">
                <div className="panel metric">
                  <p>Monthly income</p>
                  <h2>{money(summary.income)}</h2>
                </div>
                <div className="panel metric">
                  <p>Monthly spending</p>
                  <h2>{money(summary.spend)}</h2>
                </div>
                <div className="panel metric">
                  <p>Remaining income</p>
                  <h2>{money(summary.remaining)}</h2>
                </div>
              </div>
              <div className="content-grid">
                <section className="panel">
                  <h2>Daily spending</h2>
                  {chart()}
                </section>
                <section className="panel">
                  <h2>Category breakdown</h2>
                  {spending()}
                </section>
              </div>
              <section className="panel">
                <h2>Month by month</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Income</th>
                        <th>Your spending</th>
                        <th>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(
                        new Set([
                          ...entries.map((e) => e.date.slice(0, 7)),
                          month,
                        ]),
                      )
                        .sort()
                        .reverse()
                        .map((m) => {
                          const t = totals(entries, m);
                          return (
                            <tr key={m}>
                              <td>{monthName(m)}</td>
                              <td className="positive">{money(t.income)}</td>
                              <td>{money(t.spend)}</td>
                              <td>{money(t.remaining)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <footer>
            <span className="footer-brand">settle.</span> A little more
            balanced, every day.
            <span className="designer-credit">Designed by Ashan Nandasena</span>
            <span>
              <ShieldCheck size={13} />
              {demo ? "Demo data - saved on this browser" : "Private by design"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {navigation
          .filter((x) =>
            ["Home", "My Balance", "Groups", "My Loans"].includes(x.name),
          )
          .map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => go(name)}
            >
              <Icon size={21} />
              <span>
                {name === "My Balance"
                  ? "Balance"
                  : name === "My Loans"
                    ? "Loans"
                    : name}
              </span>
            </button>
          ))}
        <button onClick={() => setMore(!more)} className={more ? "active" : ""}>
          <MoreHorizontal size={22} />
          <span>More</span>
        </button>
      </nav>
      {more && (
        <div className="more-menu">
          {(
            ["Friends", "Reports", "Notifications", "Profile / Trust"] as Page[]
          ).map((p) => (
            <button key={p} onClick={() => go(p)}>
              {p}
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {currentLoan && !modal && (
        <Dialog
          title="Loan details"
          close={() => {
            setSelectedLoan(null);
            setCode(null);
          }}
        >
          <div className="loan-detail-heading">
            <Avatar
              name={name(
                currentLoan.borrowerId === uid
                  ? currentLoan.lenderId
                  : currentLoan.borrowerId,
              )}
              size="large"
            />
            <h2>{money(currentLoan.remainingBalance)}</h2>
            <p>remaining of {money(currentLoan.amount)}</p>
            <span className="badge purple">{statusName(currentLoan)}</span>
          </div>
          <div className="simple-row">
            <span>Borrower</span>
            <strong>{name(currentLoan.borrowerId)}</strong>
          </div>
          <div className="simple-row">
            <span>Lender</span>
            <strong>{name(currentLoan.lenderId)}</strong>
          </div>
          <p>{currentLoan.reason}</p>
          {currentLoan.groupId && (
            <p className="muted">
              Group loan ·{" "}
              {s.groups.find((g) => g.id === currentLoan.groupId)?.name ??
                "Former group"}
            </p>
          )}
          <div className="loan-steps">
            {[
              "Requested",
              "Accepted",
              "Transfer pending",
              "Active",
              "Settled",
            ].map((x, i) => (
              <span
                key={x}
                className={
                  i <=
                  (currentLoan.status === "partial"
                    ? 3
                    : [
                        "requested",
                        "accepted",
                        "transfer_pending",
                        "active",
                        "settled",
                      ].indexOf(currentLoan.status))
                    ? "done"
                    : ""
                }
              >
                {x}
              </span>
            ))}
          </div>
          {loanActions && (
            <div className="loan-controls">
              {currentLoan.status === "requested" &&
                currentLoan.lenderId === uid && (
                  <>
                    <button
                      className="primary"
                      disabled={f.busy}
                      onClick={() =>
                        void act(
                          {
                            type: "loan.respond",
                            loanId: currentLoan.id,
                            accept: true,
                          },
                          "Request accepted.",
                        ).catch(() => {})
                      }
                    >
                      Accept request
                    </button>
                    <button
                      className="secondary"
                      disabled={f.busy}
                      onClick={() =>
                        void act(
                          {
                            type: "loan.respond",
                            loanId: currentLoan.id,
                            accept: false,
                          },
                          "Request declined.",
                        ).catch(() => {})
                      }
                    >
                      Decline
                    </button>
                  </>
                )}
              {currentLoan.status === "accepted" &&
                currentLoan.lenderId === uid && (
                  <button
                    className="primary"
                    disabled={f.busy}
                    onClick={() => beginTransfer(currentLoan)}
                  >
                    I’ve sent the money
                  </button>
                )}
              {["active", "partial"].includes(currentLoan.status) &&
                currentLoan.borrowerId === uid &&
                !currentChallenge && (
                  <button
                    className="primary"
                    onClick={() => beginTransfer(currentLoan)}
                  >
                    Make a repayment
                  </button>
                )}
              {currentChallenge && (
                <div className="verification-box">
                  <strong>
                    {currentChallenge.kind === "activation"
                      ? "Loan transfer"
                      : "Repayment"}{" "}
                    - {money(currentChallenge.amount)}
                  </strong>
                  <p>
                    {currentChallenge.receiverId === uid
                      ? "Only generate this code once the money has actually reached you. Share it with the sender to confirm receipt."
                      : "Ask the receiver to open this loan and generate a code after receiving your money."}
                  </p>
                  {currentChallenge.receiverId === uid ? (
                    <button
                      className="primary"
                      disabled={f.busy}
                      onClick={async () => {
                        try {
                          const r = await f.act({
                            type: "verification.issue",
                            loanId: currentLoan.id,
                          });
                          setCode({
                            code: String(r.code),
                            expiresAt: Number(r.expiresAt),
                          });
                        } catch {}
                      }}
                    >
                      I received the money - Generate code
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => enterCode(currentLoan)}
                    >
                      Enter receiver’s code
                    </button>
                  )}
                  {code && (
                    <div className="receipt-code">
                      <strong>{code.code}</strong>
                      <small>
                        One use - expires{" "}
                        {new Date(code.expiresAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <h3>Confirmed repayments</h3>
          {s.repayments
            .filter((r) => r.loanId === currentLoan.id)
            .map((r) => (
              <div className="simple-row" key={r.id}>
                <span>{displayDate(r.createdAt)}</span>
                <strong className="positive">{money(r.amount)}</strong>
              </div>
            ))}
          <h3>Audit history</h3>
          {s.auditLogs
            .filter((a) => a.entityId === currentLoan.id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((a) => (
              <div className="audit-row" key={a.id}>
                <span>{a.action.replaceAll(".", " - ")}</span>
                <small>
                  {name(a.actorId).split(" ")[0]} ·{" "}
                  {new Date(a.createdAt).toLocaleString()}
                </small>
              </div>
            ))}
          {demo && (
            <div className="info-note">
              <CircleHelp size={18} />
              <p>
                To test the other side, close this panel and switch people using
                the Demo selector at the top.
              </p>
            </div>
          )}
          {f.error && (
            <div className="error" role="alert">
              {f.error}
            </div>
          )}
        </Dialog>
      )}
      {modal && (
        <FormDialog
          modal={modal}
          close={() => {
            setModal(null);
            f.setError("");
          }}
          busy={f.busy}
        />
      )}
    </div>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function FormDialog({
  modal,
  close,
  busy,
}: {
  modal: Modal;
  close: () => void;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <Dialog title={modal.title} close={close}>
      {modal.description && (
        <p className="modal-description">{modal.description}</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const data = Object.fromEntries(
            new FormData(e.currentTarget).entries(),
          ) as Record<string, string>;
          try {
            await modal.run(data);
            close();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {modal.fields.map((field) => (
          <label
            key={field.name}
            className={field.type === "checkbox" ? "check-field" : ""}
          >
            {field.type === "checkbox" ? (
              <>
                <input
                  type="checkbox"
                  name={field.name}
                  value="true"
                  defaultChecked={field.value === "true"}
                />
                <span>{field.label}</span>
              </>
            ) : (
              <>
                <span>{field.label}</span>
                {field.options ? (
                  <select
                    name={field.name}
                    defaultValue={field.value}
                    required={!field.optional}
                  >
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={field.name}
                    type={field.type ?? "text"}
                    defaultValue={field.value ?? ""}
                    required={!field.optional}
                    step={field.type === "number" ? "0.01" : undefined}
                    min={field.type === "number" ? "0.01" : undefined}
                    inputMode={
                      field.type === "number"
                        ? "decimal"
                        : field.name === "code"
                          ? "numeric"
                          : undefined
                    }
                    maxLength={field.name === "code" ? 6 : 240}
                    autoComplete={
                      field.name === "code" ? "one-time-code" : "off"
                    }
                  />
                )}
              </>
            )}
            {field.help && <small>{field.help}</small>}
          </label>
        ))}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? "Saving…" : modal.submit}
          <ArrowRight size={16} />
        </button>
      </form>
    </Dialog>
  );
}

