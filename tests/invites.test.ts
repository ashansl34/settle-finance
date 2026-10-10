import { describe, it, expect } from "vitest";
import { seed } from "../src/lib/seed";
import { execute, project } from "../src/lib/engine";
import { DAY } from "../src/lib/finance";
import { State, Command } from "../src/lib/model";
const now = Date.UTC(2026, 8, 29);
const run = (s: State, c: Command, uid = "ashan", time = now) =>
  execute(s, c, {
    uid,
    now: time,
    id: () => crypto.randomUUID(),
    hash: (x) => x,
    code: () => "123456",
  });
function setup() {
  const s = run(seed(now), {
    type: "group.create",
    name: "Private group",
    description: "Invite only",
    searchable: false,
    target: 100000,
  }).state;
  return { s, g: s.groups[s.groups.length - 1].id };
}
describe("Group invitations", () => {
  it("lets an admin invite a friend, but only that friend can accept and become a member", () => {
    let { s, g } = setup();
    s = run(s, { type: "group.invite", groupId: g, userId: "kasun" }).state;
    const invite = s.groupInvites[0];
    expect(project(s, "kasun").groupInvites).toHaveLength(1);
    expect(project(s, "dilshan").groupInvites).toHaveLength(0);
    expect(() =>
      run(
        s,
        { type: "group.invite.respond", inviteId: invite.id, accept: true },
        "nethmi",
      ),
    ).toThrow();
    s = run(
      s,
      { type: "group.invite.respond", inviteId: invite.id, accept: true },
      "kasun",
    ).state;
    expect(
      s.groupMembers.find((m) => m.groupId === g && m.userId === "kasun")
        ?.status,
    ).toBe("active");
    expect(() =>
      run(
        s,
        { type: "group.invite.respond", inviteId: invite.id, accept: true },
        "kasun",
      ),
    ).toThrow();
  });
  it("requires approval for invitations from ordinary members, using current role at acceptance", () => {
    let { s, g } = setup();
    s.groupMembers.push({
      id: `${g}_kasun`,
      groupId: g,
      userId: "kasun",
      status: "active",
      role: "member",
    });
    s.friendships.push({ id: "kasun_dilshan", members: ["kasun", "dilshan"] });
    s = run(
      s,
      { type: "group.invite", groupId: g, userId: "dilshan" },
      "kasun",
    ).state;
    s = run(
      s,
      {
        type: "group.invite.respond",
        inviteId: s.groupInvites[0].id,
        accept: true,
      },
      "dilshan",
    ).state;
    expect(
      s.groupMembers.find((m) => m.groupId === g && m.userId === "dilshan")
        ?.status,
    ).toBe("pending");
    expect(project(s, "dilshan").expenses.some((e) => e.groupId === g)).toBe(
      false,
    );
  });
  it("rejects outsiders, non-friends and duplicate invitations; decline does not join", () => {
    let { s, g } = setup();
    expect(() =>
      run(s, { type: "group.invite", groupId: g, userId: "kasun" }, "dilshan"),
    ).toThrow();
    expect(() =>
      run(s, { type: "group.invite", groupId: g, userId: "dilshan" }),
    ).toThrow("accepted friend");
    s = run(s, { type: "group.invite", groupId: g, userId: "kasun" }).state;
    expect(() =>
      run(s, { type: "group.invite", groupId: g, userId: "kasun" }),
    ).toThrow("already pending");
    s = run(
      s,
      {
        type: "group.invite.respond",
        inviteId: s.groupInvites[0].id,
        accept: false,
      },
      "kasun",
    ).state;
    expect(
      s.groupMembers.some((m) => m.groupId === g && m.userId === "kasun"),
    ).toBe(false);
  });
});
describe("Reusable expiring group links", () => {
  it("supports a private group join request without granting financial access or exposing link tokens", () => {
    let { s, g } = setup();
    const r = run(s, { type: "group.link.create", groupId: g });
    s = r.state;
    expect(project(s, "ashan").groupLinks).toEqual([]);
    expect(
      run(s, { type: "group.link.preview", token: r.result.token }, "dilshan")
        .result.groupName,
    ).toBe("Private group");
    s = run(s, { type: "group.join", token: r.result.token }, "dilshan").state;
    expect(
      s.groupMembers.find((m) => m.groupId === g && m.userId === "dilshan")
        ?.status,
    ).toBe("pending");
    expect(project(s, "dilshan").groups.some((x) => x.id === g)).toBe(true);
    expect(project(s, "dilshan").groupLinks).toEqual([]);
  });
  it("expires exactly at seven days and supports admin link reset", () => {
    let { s, g } = setup();
    const r = run(s, { type: "group.link.create", groupId: g });
    s = r.state;
    expect(() =>
      run(
        s,
        { type: "group.join", token: r.result.token },
        "dilshan",
        now + 7 * DAY,
      ),
    ).toThrow();
    s = run(s, { type: "group.link.create", groupId: g, reset: true }).state;
    expect(() =>
      run(s, { type: "group.link.preview", token: r.result.token }, "dilshan"),
    ).toThrow("expired");
  });
  it("invalidates links if the creator leaves and prevents non-admin resets", () => {
    let { s, g } = setup();
    s.groupMembers.push({
      id: `${g}_kasun`,
      groupId: g,
      userId: "kasun",
      status: "active",
      role: "member",
    });
    const r = run(s, { type: "group.link.create", groupId: g }, "kasun");
    s = r.state;
    expect(() =>
      run(s, { type: "group.link.create", groupId: g, reset: true }, "kasun"),
    ).toThrow("admin");
    s = run(s, { type: "group.leave", groupId: g }, "kasun").state;
    expect(() =>
      run(s, { type: "group.join", token: r.result.token }, "dilshan"),
    ).toThrow();
  });
});
