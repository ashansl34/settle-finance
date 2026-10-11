import { createClient, Session, User } from "@supabase/supabase-js";
import { Command, emptyState, State } from "./model";
import { accrueTrust, execute, newUser, project, shortPublicId } from "./engine";

export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const supabase = configured
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    )
  : null;

export type AppUser = User;

type PublicProfileRow = {
  user_id: string;
  name: string;
  handle: string;
  public_id: string | null;
  profile_no?: number | null;
  share_slug?: string | null;
  email: string | null;
};

type SharedFriendRequestRow = {
  id: string;
  from_user: string;
  to_user: string;
  status: "pending" | "accepted" | "declined";
};

type SharedFriendshipRow = {
  id: string;
  user_a: string;
  user_b: string;
};

type SharedGroupRow = {
  id: string;
  name: string;
  description: string;
  searchable: boolean;
  monthly_target: number;
  created_by: string;
};

type SharedGroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  status: "pending" | "active" | "left";
};

type SharedGroupLinkRow = {
  id: string;
  group_id: string;
  created_by: string;
  expires_at: number;
  revoked: boolean;
};

type SharedGroupInviteRow = {
  id: string;
  group_id: string;
  group_name: string;
  from_user: string;
  to_user: string;
  status: "pending" | "accepted" | "declined";
  created_at: number;
};

const formatPublicNo = (n: number) => String(Math.max(1, n)).padStart(6, "0");

function pairId(a: string, b: string) {
  return [a, b].sort().join("_");
}

function mergePublicProfiles(s: State, rows: PublicProfileRow[]) {
  for (const row of rows) {
    const existing = s.users.find((u) => u.id === row.user_id);
    if (existing) {
      existing.name = row.name || existing.name;
      existing.handle = row.handle || existing.handle;
      existing.publicId = row.public_id || (row.profile_no ? formatPublicNo(row.profile_no) : existing.publicId);
      existing.shareSlug = row.share_slug || existing.shareSlug;
      existing.email = row.email || existing.email;
    } else {
      s.users.push({
        id: row.user_id,
        name: row.name,
        handle: row.handle,
        publicId: row.public_id || (row.profile_no ? formatPublicNo(row.profile_no) : undefined),
        shareSlug: row.share_slug ?? undefined,
        email: row.email ?? undefined,
        trustTenths: 1000,
        profileComplete: true,
        createdAt: Date.now(),
      });
    }
  }
}

async function publishProfile(profile: State["users"][number]) {
  if (!supabase) return;
  let { data: existing, error: existingError } = await supabase
    .from("public_profiles")
    .select("profile_no,public_id,share_slug")
    .eq("user_id", profile.id)
    .maybeSingle();
  const oldProfileSchema = existingError?.message?.includes("profile_no");
  if (oldProfileSchema) {
    const fallback = await supabase
      .from("public_profiles")
      .select("public_id")
      .eq("user_id", profile.id)
      .maybeSingle();
    existing = fallback.data as typeof existing;
    existingError = fallback.error;
  }
  if (existingError) throw existingError;

  let profileNo = oldProfileSchema ? null : ((existing?.profile_no as number | null) ?? null);
  if (!profileNo) {
    const { data: rows, error: rowsError } = await supabase
      .from("public_profiles")
      .select("profile_no,public_id");
    if (rowsError) throw rowsError;
    profileNo =
      Math.max(
        0,
        ...((rows ?? []) as { profile_no?: number | null; public_id?: string | null }[]).map((row) => {
          const fromNo = typeof row.profile_no === "number" ? row.profile_no : 0;
          const fromId = /^\d{6}$/.test(row.public_id ?? "")
            ? Number(row.public_id)
            : 0;
          return Math.max(fromNo, fromId);
        }),
      ) + 1;
  }

  const publicId = formatPublicNo(profileNo);
  const shareSlug = (existing?.share_slug as string | null) ?? `settle-${publicId}`;
  profile.publicId = publicId;
  profile.shareSlug = shareSlug;

  const payload: Record<string, string | number | null> = oldProfileSchema
    ? {
        user_id: profile.id,
        name: profile.name,
        handle: profile.handle,
        public_id: publicId,
        email: profile.email ?? null,
        updated_at: new Date().toISOString(),
      }
    : {
        user_id: profile.id,
        name: profile.name,
        handle: profile.handle,
        public_id: publicId,
        profile_no: profileNo,
        share_slug: shareSlug,
        email: profile.email ?? null,
        updated_at: new Date().toISOString(),
      };
  const { error } = await supabase.from("public_profiles").upsert(payload);
  if (error) throw error;
}

function mergeSharedFriends(
  s: State,
  requests: SharedFriendRequestRow[],
  friendships: SharedFriendshipRow[],
) {
  const localRequestIds = new Set(s.friendRequests.map((r) => r.id));
  for (const row of requests) {
    const existing = s.friendRequests.find((r) => r.id === row.id);
    if (existing) existing.status = row.status;
    else
      s.friendRequests.push({
        id: row.id,
        from: row.from_user,
        to: row.to_user,
        status: row.status,
      });
    localRequestIds.add(row.id);
  }

  for (const row of friendships) {
    const members = [row.user_a, row.user_b];
    const id = pairId(row.user_a, row.user_b);
    if (!s.friendships.some((f) => f.id === id))
      s.friendships.push({ id, members });
  }
}


function mergeSharedGroups(
  s: State,
  groups: SharedGroupRow[],
  members: SharedGroupMemberRow[],
  links: SharedGroupLinkRow[],
  invites: SharedGroupInviteRow[],
) {
  for (const row of groups) {
    const existing = s.groups.find((g) => g.id === row.id);
    if (existing) {
      existing.name = row.name;
      existing.description = row.description;
      existing.searchable = row.searchable;
      existing.monthlyTarget = row.monthly_target;
      existing.createdBy = row.created_by;
    } else
      s.groups.push({
        id: row.id,
        name: row.name,
        description: row.description,
        searchable: row.searchable,
        monthlyTarget: row.monthly_target,
        createdBy: row.created_by,
      });
  }

  for (const row of members) {
    const existing = s.groupMembers.find((m) => m.id === row.id);
    if (existing) {
      existing.role = row.role;
      existing.status = row.status;
    } else
      s.groupMembers.push({
        id: row.id,
        groupId: row.group_id,
        userId: row.user_id,
        role: row.role,
        status: row.status,
      });
  }

  for (const row of links) {
    const existing = s.groupLinks.find((l) => l.id === row.id);
    if (existing) {
      existing.revoked = row.revoked;
      existing.expiresAt = row.expires_at;
    } else
      s.groupLinks.push({
        id: row.id,
        groupId: row.group_id,
        createdBy: row.created_by,
        expiresAt: row.expires_at,
        revoked: row.revoked,
      });
  }

  for (const row of invites) {
    const existing = s.groupInvites.find((i) => i.id === row.id);
    if (existing) existing.status = row.status;
    else
      s.groupInvites.push({
        id: row.id,
        groupId: row.group_id,
        groupName: row.group_name,
        from: row.from_user,
        to: row.to_user,
        status: row.status,
        createdAt: row.created_at,
      });
  }
}

async function loadSharedGroups(s: State, uid: string) {
  if (!supabase) return;
  const [groupsRes, membersRes, linksRes, invitesRes] = await Promise.all([
    supabase.from("groups_shared").select("id,name,description,searchable,monthly_target,created_by"),
    supabase.from("group_members_shared").select("id,group_id,user_id,role,status"),
    supabase.from("group_links_shared").select("id,group_id,created_by,expires_at,revoked"),
    supabase
      .from("group_invites_shared")
      .select("id,group_id,group_name,from_user,to_user,status,created_at")
      .or(`from_user.eq.${uid},to_user.eq.${uid}`),
  ]);
  if (groupsRes.error?.message?.includes("does not exist")) return;
  mergeSharedGroups(
    s,
    (groupsRes.data ?? []) as SharedGroupRow[],
    (membersRes.data ?? []) as SharedGroupMemberRow[],
    (linksRes.data ?? []) as SharedGroupLinkRow[],
    (invitesRes.data ?? []) as SharedGroupInviteRow[],
  );
  for (const invite of (invitesRes.data ?? []) as SharedGroupInviteRow[]) {
    if (invite.to_user === uid && invite.status === "pending") {
      const id = `group_invite_${invite.id}`;
      if (!s.notifications.some((n) => n.id === id))
        s.notifications.push({
          id,
          userId: uid,
          title: "Group invitation",
          body: `${s.users.find((u) => u.id === invite.from_user)?.name ?? "Someone"} invited you to ${invite.group_name}`,
          createdAt: invite.created_at,
          read: false,
        });
    }
  }
}

async function publishGroupState(s: State, groupId: string) {
  if (!supabase) return;
  const group = s.groups.find((g) => g.id === groupId);
  if (!group) return;
  const { error: groupError } = await supabase.from("groups_shared").upsert({
    id: group.id,
    name: group.name,
    description: group.description,
    searchable: group.searchable,
    monthly_target: group.monthlyTarget,
    created_by: group.createdBy,
    updated_at: new Date().toISOString(),
  });
  if (groupError) throw groupError;

  for (const member of s.groupMembers.filter((m) => m.groupId === groupId)) {
    const { error } = await supabase.from("group_members_shared").upsert(
      {
        id: member.id,
        group_id: member.groupId,
        user_id: member.userId,
        role: member.role,
        status: member.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,user_id" },
    );
    if (error) throw error;
  }
}

async function publishGroupLink(link: State["groupLinks"][number]) {
  if (!supabase) return;
  const { error } = await supabase.from("group_links_shared").upsert({
    id: link.id,
    group_id: link.groupId,
    created_by: link.createdBy,
    expires_at: link.expiresAt,
    revoked: link.revoked,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function publishGroupInvite(invite: State["groupInvites"][number]) {
  if (!supabase) return;
  const { error } = await supabase.from("group_invites_shared").upsert(
    {
      id: invite.id,
      group_id: invite.groupId,
      group_name: invite.groupName,
      from_user: invite.from,
      to_user: invite.to,
      status: invite.status,
      created_at: invite.createdAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id,to_user" },
  );
  if (error) throw error;
}

async function loadSharedFriends(s: State, uid: string) {
  if (!supabase) return;
  const [{ data: requests, error: requestError }, { data: friendships }] = await Promise.all([
    supabase
      .from("friend_requests_shared")
      .select("id,from_user,to_user,status")
      .or(`from_user.eq.${uid},to_user.eq.${uid}`),
    supabase
      .from("friendships_shared")
      .select("id,user_a,user_b")
      .or(`user_a.eq.${uid},user_b.eq.${uid}`),
  ]);
  if (requestError?.message?.includes("does not exist")) return;
  mergeSharedFriends(
    s,
    (requests ?? []) as SharedFriendRequestRow[],
    (friendships ?? []) as SharedFriendshipRow[],
  );
  for (const request of (requests ?? []) as SharedFriendRequestRow[]) {
    if (request.to_user === uid && request.status === "pending") {
      const id = `friend_request_${request.id}`;
      if (!s.notifications.some((n) => n.id === id))
        s.notifications.push({
          id,
          userId: uid,
          title: "New friend request",
          body: `${s.users.find((u) => u.id === request.from_user)?.name ?? "Someone"} wants to connect with you`,
          createdAt: Date.now(),
          read: false,
        });
    }
  }
}


export async function signInWithEmail(email: string) {
  if (!supabase) throw Error("Supabase is not configured.");
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: origin ? { emailRedirectTo: origin } : undefined,
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  if (!supabase) throw Error("Supabase is not configured.");
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: origin ? { redirectTo: origin } : undefined,
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onSessionChange(callback: (session: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(session),
  );
  return () => data.subscription.unsubscribe();
}

export async function remote(
  command?: Command,
): Promise<{ state: State; result: Record<string, unknown> }> {
  if (!supabase) throw Error("Supabase is not configured.");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user?.email) throw Error("Sign in with Gmail first.");
  const uid = user.id;
  const { data: row, error: readError } = await supabase
    .from("app_states")
    .select("state")
    .eq("user_id", uid)
    .maybeSingle();
  if (readError) throw readError;

  let s: State = row?.state ? ({ ...emptyState(), ...row.state } as State) : emptyState();
  const now = Date.now();
  for (const existing of s.users) existing.publicId ??= shortPublicId(existing.id);
  if (!s.users.some((u) => u.id === uid)) {
    const profile = newUser(uid, now);
    profile.name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split("@")[0] ||
      profile.name;
    profile.email = user.email;
    profile.profileComplete = Boolean(profile.name && profile.email);
    s.users.push(profile);
  }
  const me = s.users.find((u) => u.id === uid)!;
  await publishProfile(me);
  let { data: profiles, error: profilesError } = await supabase
    .from("public_profiles")
    .select("user_id,name,handle,public_id,profile_no,share_slug,email");
  if (profilesError?.message?.includes("profile_no")) {
    const fallback = await supabase
      .from("public_profiles")
      .select("user_id,name,handle,public_id,email");
    profiles = fallback.data as typeof profiles;
    profilesError = fallback.error;
  }
  if (!profilesError && profiles) mergePublicProfiles(s, profiles as PublicProfileRow[]);
  await loadSharedFriends(s, uid);
  await loadSharedGroups(s, uid);
  accrueTrust(s, now);
  let result: Record<string, unknown> = {};
  if (command) {
    if (command.type === "group.link.preview" || command.type === "group.join") {
      await loadSharedGroups(s, uid);
    }
    if (command.type === "group.invite.respond") {
      const inviteId = String(command.inviteId ?? "");
      if (!s.groupInvites.some((i) => i.id === inviteId)) {
        const { data: sharedInvite } = await supabase
          .from("group_invites_shared")
          .select("id,group_id,group_name,from_user,to_user,status,created_at")
          .eq("id", inviteId)
          .maybeSingle();
        if (sharedInvite)
          mergeSharedGroups(s, [], [], [], [sharedInvite as SharedGroupInviteRow]);
      }
    }
    if (command.type === "friend.respond") {
      const requestId = String(command.requestId ?? "");
      if (!s.friendRequests.some((r) => r.id === requestId)) {
        const { data: sharedRequest } = await supabase
          .from("friend_requests_shared")
          .select("id,from_user,to_user,status")
          .eq("id", requestId)
          .maybeSingle();
        if (sharedRequest)
          mergeSharedFriends(s, [sharedRequest as SharedFriendRequestRow], []);
      }
    }
    const outcome = execute(s, command, {
      uid,
      now,
      id: () => crypto.randomUUID(),
      code: () =>
        String(
          100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
        ),
      hash: (code) => `SUPABASE-MVP-${code}`,
    });
    s = outcome.state;
    result = outcome.result;
    await publishProfile(s.users.find((u) => u.id === uid)!);

    if (command.type === "friend.request") {
      const other = String(command.userId);
      const request = s.friendRequests.find(
        (r) => r.from === uid && r.to === other && r.status === "pending",
      );
      if (request) {
        const payload = {
          id: request.id,
          from_user: request.from,
          to_user: request.to,
          status: request.status,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("friend_requests_shared")
          .upsert(payload, { onConflict: "from_user,to_user" });
        if (error?.code === "23505" || error?.message?.includes("duplicate key")) {
          const { error: updateError } = await supabase
            .from("friend_requests_shared")
            .update({ status: "pending", updated_at: new Date().toISOString() })
            .eq("from_user", request.from)
            .eq("to_user", request.to);
          if (updateError) throw updateError;
        } else if (error) throw error;
      }
    }

    if (command.type === "group.link.preview" || command.type === "group.join") {
      await loadSharedGroups(s, uid);
    }
    if (command.type === "group.invite.respond") {
      const inviteId = String(command.inviteId ?? "");
      if (!s.groupInvites.some((i) => i.id === inviteId)) {
        const { data: sharedInvite } = await supabase
          .from("group_invites_shared")
          .select("id,group_id,group_name,from_user,to_user,status,created_at")
          .eq("id", inviteId)
          .maybeSingle();
        if (sharedInvite)
          mergeSharedGroups(s, [], [], [], [sharedInvite as SharedGroupInviteRow]);
      }
    }
    if (command.type === "friend.respond") {
      const request = s.friendRequests.find((r) => r.id === command.requestId);
      if (request) {
        const { error } = await supabase
          .from("friend_requests_shared")
          .update({ status: request.status, updated_at: new Date().toISOString() })
          .eq("id", request.id);
        if (error) throw error;
        if (request.status === "accepted") {
          const [userA, userB] = [request.from, request.to].sort();
          const { error: friendshipError } = await supabase
            .from("friendships_shared")
            .upsert({ id: pairId(userA, userB), user_a: userA, user_b: userB });
          if (friendshipError) throw friendshipError;
        }
      }
    }

    if (command.type === "group.create") {
      const created = s.groups.find((g) => g.createdBy === uid);
      if (created) await publishGroupState(s, created.id);
    }
    if (["group.link.create", "group.join", "group.invite", "group.invite.respond", "group.member.approve", "group.member.role", "group.leave"].includes(command.type)) {
      const groupId = String(command.groupId ?? result.groupId ?? "");
      const linkToken = String(result.token ?? "");
      const inviteId = String(command.inviteId ?? "");
      const targetGroupId = groupId ||
        s.groupLinks.find((l) => l.id === linkToken)?.groupId ||
        s.groupInvites.find((i) => i.id === inviteId)?.groupId ||
        s.groupMembers.find((m) => m.userId === uid && m.status !== "left")?.groupId ||
        "";
      if (targetGroupId) await publishGroupState(s, targetGroupId);
      if (command.type === "group.link.create") {
        const link = s.groupLinks.find((l) => l.id === result.token);
        if (link) await publishGroupLink(link);
      }
      if (command.type === "group.invite") {
        const invite = s.groupInvites.find((i) => i.groupId === targetGroupId && i.to === command.userId);
        if (invite) await publishGroupInvite(invite);
      }
      if (command.type === "group.invite.respond") {
        const invite = s.groupInvites.find((i) => i.id === command.inviteId);
        if (invite) await publishGroupInvite(invite);
      }
    }

    await loadSharedFriends(s, uid);
    await loadSharedGroups(s, uid);
  }
  const { error: writeError } = await supabase.from("app_states").upsert({
    user_id: uid,
    state: s,
    updated_at: new Date().toISOString(),
  });
  if (writeError) throw writeError;
  return { state: project(s, uid), result };
}

