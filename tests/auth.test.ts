import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
const mocks = vi.hoisted(() => ({ link: vi.fn() }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: class {},
  linkWithPopup: mocks.link,
}));
import { linkGoogle } from "../src/lib/firebase";
const phoneUser = { uid: "phone-uid", phoneNumber: "+94771234567" } as User;
describe("Google linking to the existing phone identity", () => {
  beforeEach(() => {
    mocks.link.mockReset();
  });
  it("passes the existing user to linking and preserves its UID", async () => {
    mocks.link.mockResolvedValue({ user: phoneUser });
    expect(await linkGoogle(phoneUser)).toBe(phoneUser);
    expect(mocks.link).toHaveBeenCalledOnce();
    expect(mocks.link.mock.calls[0][0]).toBe(phoneUser);
  });
  it("rejects credential collision without switching or retrying sign-in", async () => {
    mocks.link.mockRejectedValue({ code: "auth/credential-already-in-use" });
    await expect(linkGoogle(phoneUser)).rejects.toThrow(
      "already linked elsewhere",
    );
    expect(mocks.link).toHaveBeenCalledOnce();
  });
  it("does not invoke a provider when phone identity is missing", async () => {
    await expect(
      linkGoogle({ uid: "x", phoneNumber: null } as User),
    ).rejects.toThrow("phone");
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("rejects an unexpected changed UID returned by the provider", async () => {
    mocks.link.mockResolvedValue({ user: { uid: "wrong-user" } });
    await expect(linkGoogle(phoneUser)).rejects.toThrow("identity changed");
  });
});
