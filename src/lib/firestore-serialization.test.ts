import { describe, expect, it } from "vitest";
import { serializeFirestore } from "./firestore-serialization";

describe("Firestore server-to-client serialization", () => {
  it("converts Timestamp-like values at every nested level", () => {
    const date = new Date("2026-10-03T20:18:35.200Z");
    const timestamp = { toDate: () => date };
    expect(
      serializeFirestore({
        id: "stage-1",
        createdAt: timestamp,
        nested: [{ updatedAt: timestamp }],
      }),
    ).toEqual({
      id: "stage-1",
      createdAt: date.toISOString(),
      nested: [{ updatedAt: date.toISOString() }],
    });
  });
});
