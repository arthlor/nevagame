import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  ChronicleLog,
  CHRONICLE_MAX_ENTRIES,
  NoticeQueue,
  deriveNoticeCategory,
  type ChronicleEntry,
  type ChronicleFilter
} from "../../src/ui/notifications";
import {
  CoastalChronicle,
  CHRONICLE_VISIBLE_ROWS,
  formatChronicleTime
} from "../../src/ui/components/CoastalChronicle";

const entry = (over: Partial<ChronicleEntry> = {}): ChronicleEntry => ({
  id: 1,
  text: "Sold 3 Wheat for 42 G",
  tone: "reward",
  category: "trade",
  gameMinute: 62,
  count: 1,
  ...over
});

const render = (
  entries: readonly ChronicleEntry[],
  filter: ChronicleFilter = "all"
): string =>
  renderToString(
    React.createElement(CoastalChronicle, {
      entries,
      activeFilter: filter,
      onSelectFilter: () => {}
    })
  );

describe("Milestone M5 — Coastal Chronicle (F8.3)", () => {
  describe("category derivation", () => {
    it("reads money as trade and goods or labour as the working day", () => {
      expect(deriveNoticeCategory({ kind: "money", amount: 40, label: "Gold" })).toBe("trade");
      expect(deriveNoticeCategory({ kind: "item", amount: 3, label: "Wheat" })).toBe("field");
      expect(deriveNoticeCategory({ kind: "labor", amount: -5, label: "Work" })).toBe("field");
    });

    it("leaves an untagged notice general rather than guessing from wording", () => {
      // Inferring from text would silently reclassify on a copy edit.
      expect(deriveNoticeCategory(undefined)).toBe("general");
    });

    it("stamps the category onto notices the queue creates", () => {
      const queue = new NoticeQueue();
      const sold = queue.push("Sold for 40 G", 0, {
        tone: "reward",
        delta: { kind: "money", amount: 40, label: "Gold" }
      })!;
      expect(sold.category).toBe("trade");
      expect(queue.push("Docked", 0, {})!.category).toBe("general");
      expect(queue.push("Story beat", 0, { category: "story" })!.category).toBe("story");
    });
  });

  describe("log retention", () => {
    it("keeps entries the toast stack has already expired", () => {
      const queue = new NoticeQueue();
      const log = new ChronicleLog();
      const notice = queue.push("Harvested 4 Wheat", 0, {
        tone: "success",
        delta: { kind: "item", amount: 4, label: "Wheat" }
      })!;
      log.record(notice, 62);

      // The toast is gone well before the log should be.
      expect(queue.list(999_999)).toHaveLength(0);
      expect(log.list()).toHaveLength(1);
      expect(log.list()[0].text).toBe("Harvested 4 Wheat");
    });

    it("lists newest first", () => {
      const log = new ChronicleLog();
      log.record({ ...entry({ id: 1, text: "first" }), key: undefined, expiresMs: 0 } as never, 62);
      log.record({ ...entry({ id: 2, text: "second" }), key: undefined, expiresMs: 0 } as never, 62);
      expect(log.list().map((e) => e.text)).toEqual(["second", "first"]);
    });

    it("updates in place when a notice coalesces instead of logging it twice", () => {
      const queue = new NoticeQueue();
      const log = new ChronicleLog();
      const delta = { kind: "item" as const, amount: 1, label: "Wheat" };
      const first = queue.push("+1 Wheat", 0, { tone: "success", delta })!;
      log.record(first, 62);
      const repeat = queue.push("+1 Wheat", 10, { tone: "success", delta })!;
      log.record(repeat, 62);

      expect(log.size).toBe(1);
      expect(log.list()[0].count).toBe(2);
    });

    it("keeps input guidance out of the day's log", () => {
      // "Move closer to plant here" is an answer to a click, not something that
      // happened on the coast. Logging those turns the Chronicle into a list of
      // rejected inputs.
      const queue = new NoticeQueue();
      const log = new ChronicleLog();
      for (const nag of ["Planting cancelled", "Move closer to plant here", "Not enough Work"]) {
        log.record(queue.push(nag, 0, { tone: "danger" })!, 62);
      }
      expect(log.size).toBe(0);
    });

    it("logs anything that actually moved goods, labour, money or the story", () => {
      const queue = new NoticeQueue();
      const log = new ChronicleLog();
      log.record(queue.push("+3 Wheat", 0, {
        tone: "success", delta: { kind: "item", amount: 3, label: "Wheat" }
      })!, 62);
      log.record(queue.push("Sold for 40 G", 1, {
        tone: "reward", delta: { kind: "money", amount: 40, label: "Gold" }
      })!, 63);
      log.record(queue.push("Act 2 begins", 2, { category: "story" })!, 64);

      expect(log.size).toBe(3);
      expect(log.list("story")).toHaveLength(1);
      expect(log.list("trade")).toHaveLength(1);
    });

    it("caps the log rather than growing without bound", () => {
      const log = new ChronicleLog(4);
      for (let i = 1; i <= 10; i += 1) {
        log.record({ ...entry({ id: i, text: `line ${i}` }), expiresMs: 0 } as never, 62);
      }
      expect(log.size).toBe(4);
      // The oldest are the ones dropped.
      expect(log.list().map((e) => e.text)).toEqual(["line 10", "line 9", "line 8", "line 7"]);
      expect(CHRONICLE_MAX_ENTRIES).toBeGreaterThan(4);
    });

    it("filters to a single strand", () => {
      const log = new ChronicleLog();
      log.record({ ...entry({ id: 1, category: "trade" }), expiresMs: 0 } as never, 62);
      log.record({ ...entry({ id: 2, category: "field" }), expiresMs: 0 } as never, 62);
      log.record({ ...entry({ id: 3, category: "story" }), expiresMs: 0 } as never, 62);

      expect(log.list("all")).toHaveLength(3);
      expect(log.list("trade")).toHaveLength(1);
      expect(log.list("field")[0].id).toBe(2);
      expect(log.list("story")[0].id).toBe(3);
    });
  });

  describe("presentation", () => {
    it("starts collapsed so the corner stays quiet", () => {
      const html = render([entry()]);
      expect(html).toContain('data-testid="coastal-chronicle"');
      expect(html).toContain('data-expanded="false"');
      expect(html).toContain("is-collapsed");
      // Collapsed means no feed rows in the DOM at all.
      expect(html).not.toContain('data-testid="chronicle-feed"');
    });

    it("shows the entry count while collapsed", () => {
      const html = render([entry({ id: 1 }), entry({ id: 2 }), entry({ id: 3 })]);
      expect(html).toContain('data-testid="chronicle-count"');
      expect(html).toContain(">3<");
    });

    it("exposes the toggle as a real disclosure control", () => {
      const html = render([entry()]);
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-controls="chronicle-feed"');
    });

    it("renders a clock time per row, not a raw millisecond count", () => {
      expect(formatChronicleTime(62)).toBe("01:02");
      expect(formatChronicleTime(0)).toBe("00:00");
      expect(formatChronicleTime(Number.NaN)).toBe("--:--");
    });

    it("caps the rows it shows while keeping the rest in the log", () => {
      const many = Array.from({ length: 20 }, (_, i) => entry({ id: i + 1, text: `row ${i + 1}` }));
      const log = new ChronicleLog();
      for (const e of many) log.record({ ...e, expiresMs: 0 } as never, 62);
      expect(log.size).toBe(20);
      expect(CHRONICLE_VISIBLE_ROWS).toBeLessThan(20);
    });
  });
});
