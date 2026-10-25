import { describe, expect, it } from "vitest";
import {
  getResourceAccessEvents,
  getUserTimeline,
  searchAuthEvents
} from "../src/investigation/tools.js";

describe("synthetic investigation tools", () => {
  it("searches authentication events by user ID or source IP", () => {
    expect(searchAuthEvents({ userId: "usr-alex" }).map((event) => event.id)).toEqual([
      "EVT-1001",
      "EVT-1002",
      "EVT-1003",
      "EVT-1004"
    ]);
    expect(
      searchAuthEvents({ sourceIp: "198.51.100.24" }).map((event) => event.id)
    ).toEqual(["EVT-1001", "EVT-1002", "EVT-1003", "EVT-1004"]);
  });

  it("returns the user's events in chronological order", () => {
    expect(getUserTimeline({ userId: "usr-alex" }).map((event) => event.id)).toEqual([
      "EVT-1001",
      "EVT-1002",
      "EVT-1003",
      "EVT-1004",
      "EVT-1005"
    ]);
  });

  it("filters sensitive-resource access events by user", () => {
    expect(
      getResourceAccessEvents({ userId: "usr-alex" }).map((event) => event.id)
    ).toEqual(["EVT-1005"]);
    expect(getResourceAccessEvents({ userId: "usr-jordan" })).toEqual([]);
  });

  it("rejects an authentication search without a usable filter", () => {
    expect(() => searchAuthEvents({})).toThrow();
    expect(() => searchAuthEvents({ sourceIp: "not-an-ip" })).toThrow();
  });
});
