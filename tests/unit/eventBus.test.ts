import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/simulation/core/EventBus";

describe("EventBus", () => {
  it("still delivers to a listener unsubscribed by an earlier listener in the same emit", () => {
    const events = new EventBus();
    const calls: string[] = [];
    let offB!: () => void;
    events.on("Notification", () => {
      calls.push("a");
      offB();
    });
    offB = events.on("Notification", () => {
      calls.push("b");
    });
    events.emit("Notification", { title: "t", message: "m", type: "info" });
    expect(calls).toEqual(["a", "b"]);
  });

  it("holds a listener added mid-emit for the next emit", () => {
    const events = new EventBus();
    const calls: string[] = [];
    events.on("Notification", () => {
      calls.push("a");
      events.on("Notification", () => {
        calls.push("late");
      });
    });
    events.emit("Notification", { title: "t", message: "m", type: "info" });
    expect(calls).toEqual(["a"]);
    events.emit("Notification", { title: "t", message: "m", type: "info" });
    expect(calls).toEqual(["a", "a", "late"]);
  });
});
