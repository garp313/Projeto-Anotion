import { describe, expect, it } from "vitest";
import { isDue, sendAtOf, timeInBrazil, todayInBrazil } from "@/lib/scheduledEmail";

// 13/11/2026 17:00 UTC = 14:00 em Brasília.
const now = new Date("2026-11-13T17:00:00Z");

describe("horário do e-mail programado", () => {
  it("usa a hora de Brasília", () => {
    expect(timeInBrazil(now)).toBe("14:00");
    expect(todayInBrazil(new Date("2026-11-14T02:30:00Z"))).toBe("2026-11-13");
  });
  it("só vence quando o horário chega", () => {
    expect(isDue({ send_on: "2026-11-13", send_at: "14:30:00" }, now)).toBe(false);
    expect(isDue({ send_on: "2026-11-13", send_at: "14:00:00" }, now)).toBe(true);
    expect(isDue({ send_on: "2026-11-13", send_at: "09:15" }, now)).toBe(true);
  });
  it("atrasado de outro dia sai, futuro não", () => {
    expect(isDue({ send_on: "2026-11-12", send_at: "23:00:00" }, now)).toBe(true);
    expect(isDue({ send_on: "2026-11-14", send_at: "00:00:00" }, now)).toBe(false);
  });
  it("sem horário (programado antes) vale 08:00", () => {
    expect(sendAtOf({})).toBe("08:00");
    expect(isDue({ send_on: "2026-11-13" }, new Date("2026-11-13T10:59:00Z"))).toBe(false);
    expect(isDue({ send_on: "2026-11-13" }, new Date("2026-11-13T11:00:00Z"))).toBe(true);
  });
});

describe("término em aberto", () => {
  it("não vence, aparece como Em aberto e vai até hoje", async () => {
    const { dueDay, rangeEnd, formatDateValue } = await import("@/components/database/values");
    const d = { start: "2026-11-06", end: null, openEnd: true };
    expect(dueDay(d)).toBeNull();
    expect(dueDay({ start: "2026-11-06", end: "2026-11-30" })).toBe("2026-11-30");
    expect(formatDateValue(d)).toMatch(/→ Em aberto$/);
    expect(rangeEnd(d) >= "2026-11-06").toBe(true);
    expect(rangeEnd({ start: "2099-01-01", openEnd: true })).toBe("2099-01-01");
  });
});
