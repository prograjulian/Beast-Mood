import { evaluateInjuryRisk } from "./injuryRiskEngine";
import type { MicrocycleType } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";

const baseline: HealthBaseline = { restingHeartRate: 50, hrv: 100 };

function pct(base: number, deltaPercent: number): number {
  return base * (1 + deltaPercent / 100);
}

function mkRecord(
  date: string,
  microcycle: MicrocycleType,
  restingHeartRate: number,
  hrv: number,
  subjective: SubjectiveMetrics
): DailyRecord {
  return {
    date,
    athleteId: "athlete-1",
    microcycle,
    health: { restingHeartRate, hrv },
    subjective,
    training: {},
    savedAt: `${date}T00:00:00.000Z`,
  };
}

// Perfil "Alto core" en Impacto: dolor presente, FC y HRV fuera del rango
// (incluida la tolerancia ±3%), al menos 1 variable de rendimiento baja.
const altoCoreSubjective: SubjectiveMetrics = {
  musclePain: 5,
  explosiveness: 3,
  speedReaction: 8,
  techniqueQuality: 8,
};
const altoCoreFc = pct(50, 25); // Impacto esperado 13-15%, tolerancia hasta 18% -> 25% está fuera
const altoCoreHrv = pct(100, -40); // Impacto esperado -30/-20%, tolerancia hasta -33% -> -40% está fuera

describe("evaluateInjuryRisk", () => {
  test("sin dolor/molestia presente -> no se evalúa (level undefined, no es 'Bajo')", () => {
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      { musclePain: 1, discomfort: 1, explosiveness: 2 },
      baseline,
      []
    );
    expect(result.level).toBeUndefined();
  });

  test("dolor leve presente, FC/HRV dentro de rango, sin caída de rendimiento -> Bajo", () => {
    const result = evaluateInjuryRisk(
      "Ajuste",
      { restingHeartRate: pct(50, 10), hrv: pct(100, -7) }, // dentro del rango esperado de Ajuste
      { musclePain: 3, explosiveness: 7, speedReaction: 7, techniqueQuality: 7 },
      baseline,
      []
    );
    expect(result.level).toBe("Bajo");
  });

  test("dolor + FC fuera de rango (HRV dentro), sin caída de rendimiento -> Moderado", () => {
    const result = evaluateInjuryRisk(
      "Ajuste",
      { restingHeartRate: pct(50, 30), hrv: pct(100, -7) }, // FC muy fuera, HRV dentro
      { musclePain: 3, explosiveness: 7, speedReaction: 7, techniqueQuality: 7 },
      baseline,
      []
    );
    expect(result.level).toBe("Moderado");
  });

  test("condición 'Alto core' un solo día, sin historial ni sostenido -> Moderado (no confirmado)", () => {
    const history = [mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective)];
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      altoCoreSubjective,
      baseline,
      history
    );
    expect(result.level).toBe("Moderado");
    expect(result.sustainedDays).toBe(1);
  });

  test("condición 'Alto core' sostenida 3 días consecutivos -> Alto", () => {
    const history = [
      mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-02", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-03", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
    ];
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      altoCoreSubjective,
      baseline,
      history
    );
    expect(result.level).toBe("Alto");
    expect(result.sustainedDays).toBe(3);
  });

  test("Alto + 2 variables de rendimiento cayendo + sostenido 5 días -> Crítico", () => {
    const history = [
      mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-02", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-03", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-04", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-05", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
    ];
    const twoVarsDown: SubjectiveMetrics = { ...altoCoreSubjective, speedReaction: 3 }; // ahora explosividad Y velocidad bajas
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      twoVarsDown,
      baseline,
      history
    );
    expect(result.level).toBe("Critico");
    expect(result.sustainedDays).toBe(5);
  });

  test("racha interrumpida (un día sin condición Alto core) -> no llega a 3 días sostenidos", () => {
    const history = [
      mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-02", "Impacto", pct(50, 14), pct(100, -25), { musclePain: 1 }), // día "limpio" rompe la racha
      mkRecord("2026-02-03", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
    ];
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      altoCoreSubjective,
      baseline,
      history
    );
    expect(result.sustainedDays).toBe(1);
    expect(result.level).toBe("Moderado");
  });

  test("sin ocurrencias previas del mismo microciclo -> comparación histórica 'no disponible', nunca asumida", () => {
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      altoCoreSubjective,
      baseline,
      [mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective)]
    );
    expect(result.historicalComparisonAvailable).toBe(false);
    expect(result.worseThanHistoricalPattern).toBeUndefined();
  });

  test("peor que el patrón histórico propio confirma Alto aunque no esté sostenido 3 días", () => {
    const priorBlock = [
      mkRecord("2026-01-01", "Impacto", pct(50, 14), pct(100, -25), {
        explosiveness: 8,
        speedReaction: 8,
        techniqueQuality: 8,
      }),
    ];
    const gapBreaker = mkRecord("2026-01-10", "Recuperacion", 50, 100, {});
    const today = mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective);
    const history = [...priorBlock, gapBreaker, today];

    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      altoCoreSubjective,
      baseline,
      history
    );
    expect(result.sustainedDays).toBe(1); // no sostenido
    expect(result.historicalComparisonAvailable).toBe(true);
    expect(result.worseThanHistoricalPattern).toBe(true);
    expect(result.level).toBe("Alto"); // confirmado por el historial, no por la racha
  });

  test("mensaje nunca usa lenguaje de diagnóstico médico", () => {
    const history = [
      mkRecord("2026-02-01", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-02", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
      mkRecord("2026-02-03", "Impacto", altoCoreFc, altoCoreHrv, altoCoreSubjective),
    ];
    const result = evaluateInjuryRisk(
      "Impacto",
      { restingHeartRate: altoCoreFc, hrv: altoCoreHrv },
      altoCoreSubjective,
      baseline,
      history
    );
    expect(result.message?.toLowerCase()).not.toContain("lesión de");
    expect(result.message?.toLowerCase()).not.toContain("diagnóstico");
    expect(result.message).toContain("Se recomienda");
  });
});
