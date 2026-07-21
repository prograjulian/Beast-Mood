import {
  evaluatePostWorkoutTrend,
  isWithinCaptureWindow,
  observePostWorkoutRecovery,
} from "./postWorkoutEngine";
import type { MicrocycleType } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline } from "../model/athletedata/health";

const baseline: HealthBaseline = { restingHeartRate: 50, hrv: 100 };

function mkRecord(
  date: string,
  microcycle: MicrocycleType,
  postWorkout?: { restingHeartRate?: number; hrv?: number; minutesAfterWorkout?: number }
): DailyRecord {
  return {
    date,
    athleteId: "athlete-1",
    microcycle,
    health: { restingHeartRate: 50, hrv: 100, postWorkout },
    subjective: {},
    training: {},
    savedAt: `${date}T00:00:00.000Z`,
  };
}

describe("isWithinCaptureWindow", () => {
  test("120 minutos (centro exacto) -> dentro de la ventana", () => {
    expect(isWithinCaptureWindow(120)).toBe(true);
  });
  test("135 minutos (borde +15min) -> dentro de la ventana", () => {
    expect(isWithinCaptureWindow(135)).toBe(true);
  });
  test("136 minutos -> fuera de la ventana", () => {
    expect(isWithinCaptureWindow(136)).toBe(false);
  });
  test("90 minutos -> fuera de la ventana", () => {
    expect(isWithinCaptureWindow(90)).toBe(false);
  });
  test("sin dato -> fuera de la ventana", () => {
    expect(isWithinCaptureWindow(undefined)).toBe(false);
  });
});

describe("observePostWorkoutRecovery (Nivel 1 — solo observación)", () => {
  test("lectura dentro de la ventana -> calcula deltas contra baseline", () => {
    const result = observePostWorkoutRecovery(
      { health: { postWorkout: { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 } } },
      baseline
    );
    expect(result.fcDelta).toBeCloseTo(10, 5);
    expect(result.hrvDelta).toBeCloseTo(-10, 5);
  });

  test("lectura fuera de la ventana (2h ±15min) -> no cuenta ese día", () => {
    const result = observePostWorkoutRecovery(
      { health: { postWorkout: { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 200 } } },
      baseline
    );
    expect(result).toEqual({});
  });

  test("sin lectura post-entreno -> observación vacía", () => {
    const result = observePostWorkoutRecovery({ health: {} }, baseline);
    expect(result).toEqual({});
  });
});

describe("evaluatePostWorkoutTrend (Nivel 2 — tendencia dentro del bloque actual)", () => {
  test("menos de 5 lecturas históricas del mismo tipo de microciclo -> arranque en frío, no evaluado", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2026-01-02", "Carga", { restingHeartRate: 55, hrv: 88, minutesAfterWorkout: 120 }),
    ];
    const result = evaluatePostWorkoutTrend("Carga", history, baseline);
    expect(result.evaluated).toBe(false);
    expect(result.validReadingsForType).toBe(2);
  });

  test("suficientes lecturas históricas pero <3 en el bloque actual -> no alcanza para trazar tendencia", () => {
    const history: DailyRecord[] = [
      // 5 lecturas históricas de tipo "Carga" repartidas en bloques previos.
      mkRecord("2025-11-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-11-02", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-11-03", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-11-04", "Impacto", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-12-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      // Impacto rompe la contigüidad para que el bloque de Carga de arriba
      // no se fusione con el bloque actual (getMicrocycleBlocks agrupa por
      // contigüidad en la secuencia ordenada, no por cercanía de fechas).
      mkRecord("2025-12-15", "Impacto", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      // bloque actual: solo 2 lecturas válidas.
      mkRecord("2026-01-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2026-01-02", "Carga", { restingHeartRate: 55, hrv: 88, minutesAfterWorkout: 120 }),
    ];
    const result = evaluatePostWorkoutTrend("Carga", history, baseline);
    expect(result.evaluated).toBe(false);
    expect(result.validReadingsForType).toBeGreaterThanOrEqual(5);
  });

  test("deterioro progresivo en las últimas 3 lecturas del bloque actual -> alerta de tendencia", () => {
    const history: DailyRecord[] = [
      mkRecord("2025-11-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-11-02", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-12-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      // bloque actual: HRV post-entreno cada vez más lejos del baseline (100).
      mkRecord("2026-01-01", "Carga", { restingHeartRate: 55, hrv: 92, minutesAfterWorkout: 120 }), // -8%
      mkRecord("2026-01-02", "Carga", { restingHeartRate: 55, hrv: 85, minutesAfterWorkout: 120 }), // -15%
      mkRecord("2026-01-03", "Carga", { restingHeartRate: 55, hrv: 78, minutesAfterWorkout: 120 }), // -22%
    ];
    const result = evaluatePostWorkoutTrend("Carga", history, baseline);
    expect(result.evaluated).toBe(true);
    expect(result.deteriorating).toBe(true);
  });

  test("sin deterioro progresivo (fluctúa) -> sin alerta de tendencia", () => {
    const history: DailyRecord[] = [
      mkRecord("2025-11-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-11-02", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2025-12-01", "Carga", { restingHeartRate: 55, hrv: 90, minutesAfterWorkout: 120 }),
      mkRecord("2026-01-01", "Carga", { restingHeartRate: 55, hrv: 85, minutesAfterWorkout: 120 }),
      mkRecord("2026-01-02", "Carga", { restingHeartRate: 55, hrv: 92, minutesAfterWorkout: 120 }),
      mkRecord("2026-01-03", "Carga", { restingHeartRate: 55, hrv: 87, minutesAfterWorkout: 120 }),
    ];
    const result = evaluatePostWorkoutTrend("Carga", history, baseline);
    expect(result.evaluated).toBe(true);
    expect(result.deteriorating).toBe(false);
  });
});
