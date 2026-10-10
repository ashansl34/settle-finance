import { describe, expect, it } from "vitest";
import { assertSameIdentity } from "../src/lib/finance";

describe("Gmail identity invariant", () => {
  it("allows a stable Supabase Gmail user ID", () => {
    expect(() =>
      assertSameIdentity({ uid: "gmail-uid" }, { uid: "gmail-uid" }),
    ).not.toThrow();
  });

  it("rejects a changed Supabase user ID", () => {
    expect(() =>
      assertSameIdentity({ uid: "gmail-uid" }, { uid: "other-uid" }),
    ).toThrow("identity changed");
  });
});
