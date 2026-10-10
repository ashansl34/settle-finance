import {
  Audit,
  Command,
  State,
  User,
  expenseCategories,
  incomeCategories,
  emptyState,
} from "./model";
import {
  DAY,
  equalSplit,
  overdueDays,
  scoreFromEvents,
  accountName,
} from "./finance";
export type Context = {
  uid: string;
  now: number;
  id: () => string;
  hash: (code: string) => string;
  code: () => string;
};
const fail = (message: string): never => {
  throw Error(message);
};
const str = (c: Command, key: string, max = 160): string => {
  const v = c[key];
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(`Invalid ${key}`);
  return (v as string).trim();
};
const amount = (c: Command, key = "amount"): number => {
  const n = c[key];
  if (!Number.isSafeInteger(n) || Number(n) <= 0 || Number(n) > 10000000000)
    fail(`Invalid ${key}`);
  return Number(n);
};
export function accrueTrust(s: State, now: number) {
  for (const loan of s.loans) {
    if (loan.activatedAt === undefined) continue;
    const days = overdueDays(loan, now);
    for (let day = loan.penalizedDays + 1; day <= days; day++) {
      const at = loan.activatedAt + (3 + day) * DAY;
      const id = `${loan.id}_${day}`;
      if (!s.trustEvents.some((e) => e.id === id))
        s.trustEvents.push({
          id,
          userId: loan.borrowerId,
          loanId: loan.id,
          date: new Date(at).toISOString(),
          delta: -1,
          reason: "One complete overdue day with an unpaid balance",
          createdAt: at,
        });
    }
    loan.penalizedDays = days;
  }
  for (const u of s.users)
    u.trustTenths = scoreFromEvents(
      s.trustEvents.filter((e) => e.userId === u.id).map((e) => e.delta),
    );
}
export function execute(
  source: State,
  c: Command,
  ctx: Context,
): { state: State; result: Record<string, unknown> } {
  const s = { ...emptyState(), ...structuredClone(source) },
    { uid, now, id } = ctx;
  const me = s.users.find((u) => u.id === uid);
  if (!me) fail("Create your profile first.");
  const result: Record<string, unknown> = {};
  let entityId = uid;
  let participants = [uid];
  const user = (key: string) => {
    const u = s.users.find((x) => x.id === str(c, key));
    return u ?? fail("User not found");
  };
  const member = (gid: string, who = uid) =>
    s.groupMembers.find(
      (m) => m.groupId === gid && m.userId === who && m.status === "active",
    );
  const group = () => {
    const g = s.groups.find((x) => x.id === str(c, "groupId"));
    if (!g || !member(g.id)) fail("Active group membership required");
    return g!;
  };
  const admin = (gid: string) => {
    if (member(gid)?.role !== "admin") fail("Group admin approval required");
  };
  const notify = (who: string, title: string, body: string) =>
    s.notifications.push({
      id: id(),
      userId: who,
      title,
      body,
      createdAt: now,
      read: false,
    });
  const loan = () => {
    const l = s.loans.find((l) => l.id === str(c, "loanId"));
    if (!l || !l.participants.includes(uid)) fail("Loan not found");
    entityId = l!.id;
    participants = l!.participants;
    return l!;
  };
  switch (c.type) {
    case "budget.set": {
      const dailyLimit = amount(c, "dailyLimit");
      const preference = s.preferences.find((p) => p.userId === uid);
      if (preference) preference.dailyLimit = dailyLimit;
      else s.preferences.push({ id: uid, userId: uid, dailyLimit });
      break;
    }
    case "preference.update": {
      const preference =
        s.preferences.find((p) => p.userId === uid) ??
        (s.preferences.push({ id: uid, userId: uid, dailyLimit: 0 }),
        s.preferences[s.preferences.length - 1]);
      if (typeof c.theme === "string") {
        if (!["ocean", "forest", "sunrise"].includes(c.theme))
          fail("Choose a valid theme.");
        preference.theme = c.theme as "ocean" | "forest" | "sunrise";
      }
      if (typeof c.font === "string") {
        if (!["system", "rounded", "serif"].includes(c.font))
          fail("Choose a valid font.");
        preference.font = c.font as "system" | "rounded" | "serif";
      }
      break;
    }
    case "profile": {
      const name = str(c, "name", 60),
        handle = str(c, "handle", 30).toLowerCase();
      if (!/^[a-z0-9_]{3,30}$/.test(handle))
        fail("Use 3–30 lowercase letters, numbers or underscores");
      if (s.users.some((u) => u.id !== uid && u.handle === handle))
        fail("Handle already taken");
      me!.name = name;
      me!.handle = handle;
      if (typeof c.phoneNumber === "string") {
        const phoneNumber = str(c, "phoneNumber", 20);
        if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber))
          fail("Use an international phone number like +94771234567.");
        me!.phoneNumber = phoneNumber;
      }
      if (typeof c.email === "string") {
        const email = str(c, "email", 120).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          fail("Enter a valid Gmail or email address.");
        me!.email = email;
      }
      if (typeof c.age === "string" || typeof c.age === "number") {
        const age = Number(c.age);
        if (!Number.isInteger(age) || age < 13 || age > 120)
          fail("Age must be between 13 and 120.");
        me!.age = age;
      }
      me!.profileComplete = Boolean(
        me!.name &&
        me!.name !== "New member" &&
        me!.handle &&
        me!.phoneNumber &&
        me!.email &&
        me!.age,
      );
      break;
    }
    case "friend.request": {
      const other = user("userId");
      if (other.id === uid) fail("Choose another person");
      if (
        s.friendships.some(
          (f) => f.members.includes(uid) && f.members.includes(other.id),
        )
      )
        fail("You are already friends");
      if (
        s.friendRequests.some(
          (r) =>
            r.status === "pending" &&
            [r.from, r.to].includes(uid) &&
            [r.from, r.to].includes(other.id),
        )
      )
        fail("A request is already pending");
      entityId = id();
      participants = [uid, other.id];
      s.friendRequests.push({
        id: entityId,
        from: uid,
        to: other.id,
        status: "pending",
      });
      notify(other.id, "New friend request", `${me!.name} wants to connect`);
      break;
    }
    case "friend.respond": {
      const r = s.friendRequests.find((r) => r.id === str(c, "requestId"));
      if (!r || r.to !== uid || r.status !== "pending")
        fail("Pending request not found");
      r!.status = c.accept === true ? "accepted" : "declined";
      entityId = r!.id;
      participants = [r!.from, r!.to];
      if (c.accept === true)
        s.friendships.push({
          id: [...participants].sort().join("_"),
          members: participants,
        });
      notify(
        r!.from,
        "Friend request updated",
        `${me!.name} ${r!.status} your request`,
      );
      break;
    }
    case "group.create": {
      entityId = id();
      s.groups.push({
        id: entityId,
        name: str(c, "name", 60),
        description: str(c, "description", 240),
        searchable: c.searchable === true,
        monthlyTarget: amount(c, "target"),
        createdBy: uid,
      });
      s.groupMembers.push({
        id: `${entityId}_${uid}`,
        groupId: entityId,
        userId: uid,
        role: "admin",
        status: "active",
      });
      break;
    }
    case "group.join": {
      const link = c.token
        ? s.groupLinks.find(
            (x) =>
              x.id === c.token &&
              !x.revoked &&
              x.expiresAt > now &&
              member(x.groupId, x.createdBy),
          )
        : undefined;
      const g = s.groups.find((g) =>
        c.token
          ? g.id === link?.groupId
          : g.id === str(c, "groupId") && g.searchable,
      );
      if (!g) fail("Group not found or invitation link has expired");
      const m = s.groupMembers.find(
        (m) => m.groupId === g!.id && m.userId === uid,
      );
      if (m && m.status !== "left") fail("Already joined or requested");
      if (m) {
        m.status = "pending";
        m.role = "member";
      } else
        s.groupMembers.push({
          id: `${g!.id}_${uid}`,
          groupId: g!.id,
          userId: uid,
          role: "member",
          status: "pending",
        });
      entityId = g!.id;
      s.groupMembers
        .filter(
          (m) =>
            m.groupId === g!.id && m.role === "admin" && m.status === "active",
        )
        .forEach((m) =>
          notify(
            m.userId,
            "Group join request",
            `${me!.name} requested to join ${g!.name}`,
          ),
        );
      break;
    }
    case "group.link.create": {
      const g = group();
      entityId = g.id;
      if (c.reset === true) {
        admin(g.id);
        s.groupLinks
          .filter((x) => x.groupId === g.id)
          .forEach((x) => (x.revoked = true));
      }
      const link = {
        id: id(),
        groupId: g.id,
        createdBy: uid,
        expiresAt: now + 7 * DAY,
        revoked: false,
      };
      s.groupLinks.push(link);
      result.token = link.id;
      result.expiresAt = link.expiresAt;
      break;
    }
    case "group.link.preview": {
      const link = s.groupLinks.find(
        (x) =>
          x.id === str(c, "token") &&
          !x.revoked &&
          x.expiresAt > now &&
          member(x.groupId, x.createdBy),
      );
      const g = link && s.groups.find((g) => g.id === link.groupId);
      if (!g) fail("This invitation link has expired or been reset");
      result.groupName = g!.name;
      result.groupId = g!.id;
      entityId = g!.id;
      break;
    }
    case "group.invite": {
      const g = group(),
        other = user("userId");
      entityId = g.id;
      participants = [uid, other.id];
      if (
        other.id === uid ||
        !s.friendships.some(
          (f) => f.members.includes(uid) && f.members.includes(other.id),
        )
      )
        fail("Choose an accepted friend");
      if (member(g.id, other.id)) fail("Your friend is already a member");
      if (
        s.groupInvites.some(
          (i) =>
            i.groupId === g.id && i.to === other.id && i.status === "pending",
        )
      )
        fail("An invitation is already pending");
      s.groupInvites.push({
        id: id(),
        groupId: g.id,
        groupName: g.name,
        from: uid,
        to: other.id,
        status: "pending",
        createdAt: now,
      });
      notify(
        other.id,
        "Group invitation",
        `${me!.name} invited you to ${g.name}. Open Groups to respond.`,
      );
      break;
    }
    case "group.invite.respond": {
      const invitation = s.groupInvites.find(
        (i) =>
          i.id === str(c, "inviteId") && i.to === uid && i.status === "pending",
      );
      if (!invitation) fail("Pending invitation not found");
      const invite = invitation!;
      entityId = invite.groupId;
      participants = [uid, invite.from];
      if (c.accept !== true) {
        invite.status = "declined";
        break;
      }
      const inviter = member(invite.groupId, invite.from);
      if (!inviter)
        fail("The inviter has left this group. Ask for a new invitation.");
      const m = s.groupMembers.find(
        (m) => m.groupId === invite.groupId && m.userId === uid,
      );
      if (m?.status === "active") fail("You are already a member");
      const status = inviter!.role === "admin" ? "active" : "pending";
      if (m) {
        m.status = status;
        m.role = "member";
      } else
        s.groupMembers.push({
          id: `${invite.groupId}_${uid}`,
          groupId: invite.groupId,
          userId: uid,
          role: "member",
          status,
        });
      invite.status = "accepted";
      result.membershipStatus = status;
      notify(
        invite.from,
        "Group invitation accepted",
        `${me!.name} accepted your invitation to ${invite.groupName}.`,
      );
      if (status === "pending")
        s.groupMembers
          .filter(
            (m) =>
              m.groupId === invite.groupId &&
              m.status === "active" &&
              m.role === "admin",
          )
          .forEach((m) =>
            notify(
              m.userId,
              "Group join request",
              `${me!.name} accepted a member invitation and needs approval.`,
            ),
          );
      break;
    }
    case "group.approve": {
      const g = group();
      admin(g.id);
      const m = s.groupMembers.find(
        (m) =>
          m.id === str(c, "memberId") &&
          m.groupId === g.id &&
          m.status === "pending",
      );
      if (!m) fail("Pending member not found");
      m!.status = c.accept === true ? "active" : "left";
      entityId = g.id;
      notify(
        m!.userId,
        "Membership updated",
        `Your request to ${g.name} was ${c.accept === true ? "approved" : "declined"}`,
      );
      break;
    }
    case "group.role": {
      const g = group();
      admin(g.id);
      const m = member(g.id, str(c, "userId"));
      if (!m) fail("Member not found");
      if (c.role !== "admin" && c.role !== "member") fail("Invalid role");
      if (
        m!.role === "admin" &&
        c.role === "member" &&
        s.groupMembers.filter(
          (x) =>
            x.groupId === g.id && x.role === "admin" && x.status === "active",
        ).length === 1
      )
        fail("Assign another admin first");
      m!.role = c.role as "admin" | "member";
      entityId = g.id;
      break;
    }
    case "group.leave": {
      const g = group();
      const m = member(g.id)!;
      if (
        m.role === "admin" &&
        s.groupMembers.filter(
          (x) =>
            x.groupId === g.id && x.role === "admin" && x.status === "active",
        ).length === 1
      )
        fail("Assign another admin before leaving");
      m.status = "left";
      entityId = g.id;
      break;
    }
    case "fund.set": {
      const g = group();
      admin(g.id);
      const month = str(c, "month");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail("Invalid month");
      const target = amount(c, "target");
      const f = s.funds.find((f) => f.groupId === g.id && f.month === month);
      if (f) f.target = target;
      else
        s.funds.push({ id: `${g.id}_${month}`, groupId: g.id, month, target });
      g.monthlyTarget = target;
      entityId = g.id;
      break;
    }
    case "contribution.pay": {
      const g = group();
      const f = s.funds.find(
        (f) => f.id === str(c, "fundId") && f.groupId === g.id,
      );
      if (!f) fail("Fund not found");
      if (s.contributions.some((x) => x.fundId === f!.id && x.userId === uid))
        fail("Contribution already submitted");
      entityId = id();
      s.contributions.push({
        id: entityId,
        groupId: g.id,
        fundId: f!.id,
        userId: uid,
        amount: amount(c),
        status: "pending",
        createdAt: now,
      });
      break;
    }
    case "contribution.confirm": {
      const g = group();
      admin(g.id);
      const p = s.contributions.find(
        (x) => x.id === str(c, "contributionId") && x.groupId === g.id,
      );
      if (!p || p.status !== "pending") fail("Pending contribution not found");
      if (p!.userId === uid)
        fail("Another admin must confirm your contribution");
      p!.status = "paid";
      p!.confirmedBy = uid;
      entityId = p!.id;
      participants = [uid, p!.userId];
      notify(
        p!.userId,
        "Contribution received",
        `${g.name} confirmed your contribution`,
      );
      break;
    }
    case "expense.add": {
      const g = group();
      const n = amount(c);
      const ids = c.memberIds;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.some((x) => typeof x !== "string" || !member(g.id, x)) ||
        new Set(ids).size !== ids.length
      )
        fail("Choose active group members");
      const shares =
        c.shares === undefined ? equalSplit(n, ids as string[]) : c.shares;
      if (!shares || typeof shares !== "object" || Array.isArray(shares))
        fail("Invalid split");
      const split = shares as Record<string, number>;
      if (
        Object.keys(split).length !== (ids as string[]).length ||
        (ids as string[]).some(
          (k) => !Number.isSafeInteger(split[k]) || split[k] < 0,
        ) ||
        Object.values(split).reduce((a, b) => a + b, 0) !== n
      )
        fail("Custom shares must match the expense exactly");
      entityId = id();
      participants = Array.from(new Set([uid, ...(ids as string[])]));
      s.expenses.push({
        id: entityId,
        groupId: g.id,
        paidBy: uid,
        amount: n,
        description: str(c, "description"),
        createdAt: now,
        memberIds: participants,
      });
      for (const [userId, amount] of Object.entries(split))
        s.expenseSplits.push({
          id: `${entityId}_${userId}`,
          expenseId: entityId,
          groupId: g.id,
          userId,
          amount,
        });
      if (c.linkPersonal === true)
        s.entries.push({
          id: `expense_${entityId}_${uid}`,
          userId: uid,
          type: "expense",
          amount: n,
          expenseShare: split[uid] ?? 0,
          category: "Other",
          note: `Group: ${str(c, "description")}`,
          date: new Date(now).toISOString().slice(0, 10),
          fromAccount: "Cash",
          sourceId: entityId,
        });
      break;
    }
    case "entry.friend_payment":
    case "entry.add": {
      const friendPayment = c.type === "entry.friend_payment";
      let recipientId: string | undefined;
      if (friendPayment) {
        recipientId = user("recipientId").id;
        if (
          !s.friendships.some(
            (f) => f.members.includes(uid) && f.members.includes(recipientId!),
          ) ||
          recipientId === uid
        )
          fail("Choose an accepted friend");
        if (c.paymentKind !== "expense" && c.paymentKind !== "cash_movement")
          fail("Invalid payment purpose");
      }
      const type = friendPayment ? "expense" : str(c, "entryType");
      if (!["income", "expense", "transfer"].includes(type))
        fail("Invalid entry type");
      const date = str(c, "date");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        fail("Invalid date");
      const category = type === "transfer" ? "Transfer" : str(c, "category");
      if (
        (type === "income" && !incomeCategories.includes(category)) ||
        (type === "expense" && !expenseCategories.includes(category))
      )
        fail("Invalid category");
      const fromAccount = accountName(str(c, "fromAccount", 60));
      const toAccount =
        type === "transfer" ? accountName(str(c, "toAccount", 60)) : undefined;
      if (
        !["Wallet", "Bank", "Savings"].includes(fromAccount) ||
        (toAccount && !["Wallet", "Bank", "Savings"].includes(toAccount))
      )
        fail("Choose Wallet, Bank or Savings");
      if (type === "transfer" && fromAccount === toAccount)
        fail("Choose two different accounts");
      entityId = id();
      s.entries.push({
        id: entityId,
        userId: uid,
        type: type as "income" | "expense" | "transfer",
        amount: amount(c),
        category,
        note: typeof c.note === "string" ? c.note.slice(0, 160) : "",
        date,
        fromAccount,
        ...(toAccount ? { toAccount } : {}),
        ...(recipientId
          ? {
              recipientId,
              paymentKind: c.paymentKind as "expense" | "cash_movement",
              ...(c.paymentKind === "cash_movement" ? { expenseShare: 0 } : {}),
            }
          : {}),
      });
      break;
    }
    case "loan.request": {
      const lender = user("lenderId");
      if (lender.id === uid) fail("Choose another person");
      let groupId: string | undefined;
      if (c.groupId) {
        const g = group();
        if (!member(g.id, lender.id)) fail("Lender must be in the group");
        groupId = g.id;
      } else if (
        !s.friendships.some(
          (f) => f.members.includes(uid) && f.members.includes(lender.id),
        )
      )
        fail("Add this person as a friend first");
      entityId = id();
      participants = [uid, lender.id];
      const n = amount(c);
      s.loans.push({
        id: entityId,
        borrowerId: uid,
        lenderId: lender.id,
        participants,
        ...(groupId ? { groupId } : {}),
        amount: n,
        remainingBalance: n,
        reason: str(c, "reason"),
        status: "requested",
        createdAt: now,
        penalizedDays: 0,
      });
      notify(
        lender.id,
        "Money requested",
        `${me!.name} sent you a loan request`,
      );
      break;
    }
    case "loan.respond": {
      const l = loan();
      if (l.lenderId !== uid || l.status !== "requested")
        fail("Only the lender can respond to a new request");
      l.status = c.accept === true ? "accepted" : "declined";
      notify(
        l.borrowerId,
        "Loan request updated",
        `Your request was ${l.status}`,
      );
      break;
    }
    case "transfer.start": {
      const l = loan();
      const activation = l.status === "accepted";
      if (
        (activation && uid !== l.lenderId) ||
        (!activation &&
          (!["active", "partial"].includes(l.status) || uid !== l.borrowerId))
      )
        fail("This transfer cannot be started by you");
      if (s.verificationChallenges.some((x) => x.loanId === l.id && !x.used))
        fail("A transfer is already pending");
      const n = activation ? l.amount : amount(c);
      if (n > l.remainingBalance)
        fail("Repayment exceeds the remaining balance");
      const receiverId = activation ? l.borrowerId : l.lenderId;
      s.verificationChallenges.push({
        id: id(),
        loanId: l.id,
        senderId: uid,
        receiverId,
        kind: activation ? "activation" : "repayment",
        amount: n,
        attempts: 0,
        generation: 0,
        used: false,
        createdAt: now,
      });
      if (activation) l.status = "transfer_pending";
      notify(
        receiverId,
        "Confirm money received",
        "Open this loan after receiving the money to create a verification code.",
      );
      break;
    }
    case "verification.issue": {
      const l = loan();
      const ch = s.verificationChallenges.find(
        (x) => x.loanId === l.id && !x.used,
      );
      if (!ch || ch.receiverId !== uid)
        fail("Only the receiving person can issue a code");
      if (ch!.issuedAt !== undefined && now - ch!.issuedAt < 60_000)
        fail("Wait one minute before replacing the code");
      const code = ctx.code();
      ch!.hash = ctx.hash(code);
      ch!.expiresAt = now + 5 * 60_000;
      ch!.attempts = 0;
      ch!.generation++;
      ch!.issuedAt = now;
      result.code = code;
      result.expiresAt = ch!.expiresAt;
      break;
    }
    case "verification.confirm": {
      const l = loan();
      const ch = s.verificationChallenges.find(
        (x) => x.loanId === l.id && !x.used,
      );
      if (!ch || ch.senderId !== uid)
        fail("Only the sending person can enter the receiver’s code");
      if (!ch!.hash || !ch!.expiresAt || now >= ch!.expiresAt)
        fail(
          "Code expired or not yet issued. Ask the receiver for a new code.",
        );
      if (ch!.attempts >= 5)
        fail("Too many attempts. The receiver must generate a new code.");
      if (ctx.hash(str(c, "code", 6)) !== ch!.hash) {
        ch!.attempts++;
        result.error = `Incorrect code. ${5 - ch!.attempts} attempts left.`;
        break;
      }
      if (ch!.kind === "activation") {
        if (l.status !== "transfer_pending")
          fail("Loan is not awaiting activation");
        l.status = "active";
        l.activatedAt = now;
      } else {
        if (
          !["active", "partial"].includes(l.status) ||
          ch!.amount > l.remainingBalance
        )
          fail("Invalid repayment");
        accrueTrust(s, now);
        l.remainingBalance -= ch!.amount;
        s.repayments.push({
          id: ch!.id,
          loanId: l.id,
          participants: l.participants,
          amount: ch!.amount,
          createdAt: now,
        });
        l.status = l.remainingBalance === 0 ? "settled" : "partial";
        if (l.status === "settled") l.settledAt = now;
      }
      ch!.used = true;
      delete ch!.hash;
      notify(
        ch!.receiverId,
        "Transfer confirmed",
        l.status === "settled"
          ? "Your loan is fully settled."
          : "The confirmed transfer is in your loan history.",
      );
      break;
    }
    case "notification.read": {
      const n = s.notifications.find(
        (n) => n.id === str(c, "notificationId") && n.userId === uid,
      );
      if (!n) fail("Notification not found");
      n!.read = true;
      entityId = n!.id;
      break;
    }
    default:
      fail("Unknown action");
  }
  const audit: Audit = {
    id: id(),
    actorId: uid,
    participants,
    action: result.error ? `${c.type}.failed` : c.type,
    entityId,
    createdAt: now,
  };
  s.auditLogs.push(audit);
  return { state: s, result };
}
export function project(s: State, uid: string): State {
  const active = s.groupMembers
    .filter((m) => m.userId === uid && m.status === "active")
    .map((m) => m.groupId);
  const mine = s.loans.filter((l) => l.participants.includes(uid));
  const groupLoans = s.loans.filter(
    (l) => l.groupId && active.includes(l.groupId),
  );
  const loans = Array.from(
    new Map([...mine, ...groupLoans].map((l) => [l.id, l])).values(),
  );
  const myLoanIds = mine.map((l) => l.id);
  return {
    users: s.users,
    groupInvites: (s.groupInvites ?? []).filter(
      (i) => i.to === uid || i.from === uid || active.includes(i.groupId),
    ),
    groupLinks: [],
    preferences: (s.preferences ?? []).filter((p) => p.userId === uid),
    friendRequests: s.friendRequests.filter(
      (r) => r.from === uid || r.to === uid,
    ),
    friendships: s.friendships.filter((f) => f.members.includes(uid)),
    groups: s.groups.filter(
      (g) =>
        g.searchable ||
        active.includes(g.id) ||
        s.groupMembers.some(
          (m) =>
            m.groupId === g.id && m.userId === uid && m.status === "pending",
        ),
    ),
    groupMembers: s.groupMembers.filter(
      (m) => m.userId === uid || active.includes(m.groupId),
    ),
    funds: s.funds.filter((f) => active.includes(f.groupId)),
    contributions: s.contributions.filter((c) => active.includes(c.groupId)),
    expenses: s.expenses.filter((e) => active.includes(e.groupId)),
    expenseSplits: s.expenseSplits.filter((e) => active.includes(e.groupId)),
    loans,
    repayments: s.repayments.filter((r) => myLoanIds.includes(r.loanId)),
    verificationChallenges: s.verificationChallenges
      .filter((c) => myLoanIds.includes(c.loanId))
      .map((c) => {
        const safe = { ...c };
        delete safe.hash;
        return safe;
      }),
    entries: s.entries.filter((e) => e.userId === uid),
    notifications: s.notifications.filter((n) => n.userId === uid),
    auditLogs: s.auditLogs.filter((a) => a.participants.includes(uid)),
    trustEvents: s.trustEvents.filter((t) => t.userId === uid),
  };
}
export function newUser(uid: string, now: number): User {
  return {
    id: uid,
    name: "New member",
    handle: `u_${uid
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 20)
      .toLowerCase()}`,
    trustTenths: 1000,
    profileComplete: false,
    createdAt: now,
  };
}
