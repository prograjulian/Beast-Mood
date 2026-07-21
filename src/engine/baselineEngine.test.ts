import { calculateHealthBaseline } from "./baselineEngine";
import type { MicrocycleType } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline } from "../model/athletedata/health";

function mkRecord(
  date: string,
  microcycle: MicrocycleType,
  restingHeartRate?: number,
  hrv?: number
): DailyRecord {
  return {
    date,
    athleteId: "athlete-1",
    microcycle,
    health: { restingHeartRate, hrv },
    subjective: {},
    training: {},
    savedAt: `${date}T00:00:00.000Z`,
  };
}

const previousBaseline: HealthBaseline = { restingHeartRate: 50, hrv: 100, trendWindowDays: 7 };

describe("calculateHealthBaseline", () => {
  test("historial vacío -> mantiene el baseline anterior", () => {
    const result = calculateHealthBaseline([], "2026-01-10", previousBaseline);
    expect(result).toBe(previousBaseline);
  });

  test("promedia solo la lectura matutina de los 7 días calendario anteriores a asOfDate (sin incluir asOfDate)", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Ajuste", 48, 100),
      mkRecord("2026-01-02", "Ajuste", 50, 100),
      mkRecord("2026-01-03", "Ajuste", 52, 100),
      mkRecord("2026-01-04", "Ajuste", 50, 100),
      // 2026-01-10 (asOfDate) NO debe entrar aunque tenga datos -- sería
      // comparar el día contra un baseline que ya lo incluye a él mismo.
      mkRecord("2026-01-10", "Ajuste", 9999, 9999),
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
    expect(result.hrv).toBeCloseTo(100, 5);
    expect(result.trendWindowDays).toBe(7);
  });

  test("excluye días de Carga e Impacto del recálculo (Motor ATR §1.8)", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-05", "Ajuste", 50, 100),
      mkRecord("2026-01-06", "Ajuste", 50, 100),
      mkRecord("2026-01-07", "Ajuste", 50, 100),
      mkRecord("2026-01-08", "Ajuste", 50, 100),
      // Estos dos son "Carga": FC/HRV muy distintos, pero no deben mover el
      // baseline si el fix funciona.
      mkRecord("2026-01-09", "Carga", 70, 60),
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
    expect(result.hrv).toBeCloseTo(100, 5);
  });

  test("menos de 4 lecturas válidas en la ventana -> mantiene el baseline anterior sin cambios", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-08", "Ajuste", 55, 90),
      mkRecord("2026-01-09", "Ajuste", 55, 90),
      // Solo 2 lecturas válidas, por debajo del mínimo de 4.
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result).toBe(previousBaseline);
  });

  test("un valor muy alejado del resto (outlier, Motor ATR §1.8) se excluye del promedio", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-03", "Ajuste", 50, 100),
      mkRecord("2026-01-04", "Ajuste", 50, 100),
      mkRecord("2026-01-05", "Ajuste", 50, 100),
      mkRecord("2026-01-06", "Ajuste", 50, 100),
      mkRecord("2026-01-07", "Ajuste", 50, 100),
      mkRecord("2026-01-08", "Ajuste", 50, 100),
      // Lectura claramente atípica (ej. error de medición) -- no debería
      // arrastrar el promedio.
      mkRecord("2026-01-09", "Ajuste", 300, 100),
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
  });

  test("MAD=0 (mayoría de lecturas idénticas): el valor distinto se excluye por igualdad, no por z-score", () => {
    // 5 de 6 lecturas idénticas -> MAD=0, la rama sin división ("cualquier
    // valor distinto de la mediana es anómalo").
    const history: DailyRecord[] = [
      mkRecord("2026-01-04", "Ajuste", 50, 100),
      mkRecord("2026-01-05", "Ajuste", 50, 100),
      mkRecord("2026-01-06", "Ajuste", 50, 100),
      mkRecord("2026-01-07", "Ajuste", 50, 100),
      mkRecord("2026-01-08", "Ajuste", 65, 100), // única distinta
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
  });

  test("outlier solo en FC, HRV sin outlier -> cada variable se filtra de forma independiente", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-04", "Ajuste", 50, 98),
      mkRecord("2026-01-05", "Ajuste", 50, 100),
      mkRecord("2026-01-06", "Ajuste", 50, 102),
      mkRecord("2026-01-07", "Ajuste", 50, 100),
      // FC atípica ese día, HRV normal -- no deberían contaminarse entre sí.
      mkRecord("2026-01-08", "Ajuste", 300, 101),
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
    expect(result.hrv).toBeCloseTo(100.2, 5);
  });

  test("valores parejos sin outliers -> no se descarta nada", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-05", "Ajuste", 48, 98),
      mkRecord("2026-01-06", "Ajuste", 50, 100),
      mkRecord("2026-01-07", "Ajuste", 52, 102),
      mkRecord("2026-01-08", "Ajuste", 50, 100),
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
    expect(result.hrv).toBeCloseTo(100, 5);
  });

  test("un día sin lectura matutina no entra al promedio, no se busca sustituto", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-04", "Ajuste", 50, 100),
      mkRecord("2026-01-05", "Ajuste", 50, 100),
      mkRecord("2026-01-06", "Ajuste", undefined, undefined), // día sin lectura
      mkRecord("2026-01-07", "Ajuste", 50, 100),
      mkRecord("2026-01-08", "Ajuste", 50, 100),
    ];

    const result = calculateHealthBaseline(history, "2026-01-10", previousBaseline);
    expect(result.restingHeartRate).toBeCloseTo(50, 5);
  });
});
