import { evaluateCompetitiveProfile } from "./competitiveProfileEngine";
import type { DailyRecord } from "../model/athletedata/dailyRecord";

function mkPodiumDay(date: string, restingHeartRate: number, hrv: number): DailyRecord {
  return {
    date,
    athleteId: "athlete-1",
    microcycle: "Competitivo",
    health: { restingHeartRate, hrv, sleepHours: 8 },
    subjective: { legFeeling: 9, explosiveness: 9 },
    training: {},
    coach: { competitionResult: "podio", confidence: 9 },
    savedAt: `${date}T00:00:00.000Z`,
  };
}

function mkNonPodiumDay(date: string): DailyRecord {
  return {
    date,
    athleteId: "athlete-1",
    microcycle: "Competitivo",
    health: { restingHeartRate: 55, hrv: 90 },
    subjective: {},
    training: {},
    coach: { competitionResult: "sin_podio" },
    savedAt: `${date}T00:00:00.000Z`,
  };
}

describe("evaluateCompetitiveProfile — Motor ATR §13", () => {
  test("sin días de podio -> no disponible, historial 0/3", () => {
    const result = evaluateCompetitiveProfile([mkNonPodiumDay("2026-01-01"), mkNonPodiumDay("2026-01-02")]);
    expect(result.available).toBe(false);
    expect(result.podiumCount).toBe(0);
    expect(result.minimumRequired).toBe(3);
    expect(result.note).toContain("0/3");
  });

  test("2 días de podio (por debajo del mínimo de 3) -> sigue sin disponible", () => {
    const history = [mkPodiumDay("2026-01-01", 48, 100), mkPodiumDay("2026-01-02", 50, 98)];
    const result = evaluateCompetitiveProfile(history);
    expect(result.available).toBe(false);
    expect(result.podiumCount).toBe(2);
    expect(result.vector).toBeUndefined();
  });

  test("3 días de podio -> disponible, vector promedia solo los días de podio", () => {
    const history = [
      mkPodiumDay("2026-01-01", 48, 100),
      mkNonPodiumDay("2026-01-02"),
      mkPodiumDay("2026-01-03", 50, 98),
      mkPodiumDay("2026-01-05", 46, 102),
    ];
    const result = evaluateCompetitiveProfile(history);
    expect(result.available).toBe(true);
    expect(result.podiumCount).toBe(3);
    expect(result.vector?.restingHeartRate).toBeCloseTo((48 + 50 + 46) / 3, 5);
    expect(result.vector?.hrv).toBeCloseTo((100 + 98 + 102) / 3, 5);
    expect(result.vector?.sleepHours).toBeCloseTo(8, 5);
    expect(result.vector?.confidence).toBeCloseTo(9, 5);
  });

  test("historial vacío -> no disponible, sin crash", () => {
    const result = evaluateCompetitiveProfile([]);
    expect(result.available).toBe(false);
    expect(result.podiumCount).toBe(0);
  });
});
