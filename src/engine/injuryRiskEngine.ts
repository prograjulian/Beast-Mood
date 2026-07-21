import type {
  InjuryRiskEvaluation,
  InjuryRiskLevel,
  MicrocycleType,
  RangeStatus,
} from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import { getMicrocycleBlocks } from "./microcycleBlocks";
import {
  classifyAgainstRange,
  getFcTargetRange,
  getHrvTargetRange,
  isNumber,
  percentChange,
  toFatigueAxis,
} from "./physiologicalRanges";

/**
 * Índice de Riesgo de Lesión (informe de decisiones 2026-07-21, resuelve
 * Motor ATR §11.2 y CLAUDE.md §5 punto 8). Árbol de decisión ACUMULATIVO,
 * nunca por una sola variable (mismo principio multivariable de §4/§9/§10):
 * dolor presente → confirmación fisiológica (FC/HRV fuera de rango) →
 * caída de rendimiento → sostenido N días o peor que el historial propio
 * del atleta en ese microciclo.
 *
 * Filosofía (Motor ATR §11, "nunca diagnostica"): esto es una estimación de
 * riesgo, no un diagnóstico de lesión.
 */

// "Dolor/molestia leve presente" -- el informe no da un número, se usa el
// mismo piso que "Leve" en las opciones de captura de register.tsx
// (PAIN_OPTIONS/FEELING_OPTIONS ya usan 1/3/5/7/9) -- provisional razonable,
// no confirmado por el entrenador.
const PAIN_PRESENT_THRESHOLD = 3;

// Umbral de "por debajo de lo esperado" por variable de rendimiento --
// mismos números que ya usa getPerformanceDirection en atrEngine.ts (Capa
// 2) para mantener un solo criterio de "declive" en todo el motor, en vez
// de inventar uno nuevo aquí.
function isBelowExpectedPerformance(value: number | undefined, microcycle: MicrocycleType): boolean {
  if (!isNumber(value)) return false;
  const threshold = microcycle === "Carga" || microcycle === "Impacto" ? 4 : 5;
  return value <= threshold;
}

function countDecliningPerformanceVars(subjective: SubjectiveMetrics, microcycle: MicrocycleType): number {
  return [subjective.explosiveness, subjective.speedReaction, subjective.techniqueQuality].filter((value) =>
    isBelowExpectedPerformance(value, microcycle)
  ).length;
}

function isPainPresent(subjective: SubjectiveMetrics): boolean {
  return (
    (isNumber(subjective.musclePain) && subjective.musclePain >= PAIN_PRESENT_THRESHOLD) ||
    (isNumber(subjective.discomfort) && subjective.discomfort >= PAIN_PRESENT_THRESHOLD)
  );
}

function isOutOfExpectedRange(status: RangeStatus | undefined): boolean {
  return status !== undefined && status !== "dentro_de_rango";
}

interface DaySignals {
  painPresent: boolean;
  fcOut: boolean;
  hrvOut: boolean;
  decliningCount: number;
}

function computeDaySignals(record: DailyRecord, baseline: HealthBaseline): DaySignals | undefined {
  const microcycle = record.microcycle;
  if (!microcycle) return undefined;

  const fcDelta = percentChange(record.health.restingHeartRate, baseline.restingHeartRate);
  const hrvDelta = percentChange(record.health.hrv, baseline.hrv);
  const fcStatus = classifyAgainstRange(fcDelta, getFcTargetRange(microcycle));
  const hrvStatus = toFatigueAxis(classifyAgainstRange(hrvDelta, getHrvTargetRange(microcycle)), true);

  return {
    painPresent: isPainPresent(record.subjective),
    fcOut: isOutOfExpectedRange(fcStatus),
    hrvOut: isOutOfExpectedRange(hrvStatus),
    decliningCount: countDecliningPerformanceVars(record.subjective, microcycle),
  };
}

// "Alto core": dolor + FC y HRV fuera de rango + al menos 1 variable de
// rendimiento por debajo de lo esperado (informe de decisiones). Es la
// condición que se cuenta día a día para "sostenido N días".
function isAltoCoreCandidate(signals: DaySignals): boolean {
  return signals.painPresent && signals.fcOut && signals.hrvOut && signals.decliningCount >= 1;
}

/**
 * Cuenta cuántos días consecutivos MÁS RECIENTES (terminando en el último
 * registro del historial) cumplen la condición "Alto core". Usa el
 * baseline ACTUAL para todos los días de la ventana (simplificación --
 * el baseline histórico real de cada día no se reconstruye, igual que el
 * resto del motor usa un único baseline pasado por parámetro).
 */
function countSustainedAltoCoreDays(history: DailyRecord[], baseline: HealthBaseline): number {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const signals = computeDaySignals(sorted[i], baseline);
    if (!signals || !isAltoCoreCandidate(signals)) break;
    streak += 1;
  }
  return streak;
}

/**
 * "Peor que el patrón histórico propio del atleta en este microciclo":
 * promedio de las 3 variables de rendimiento en el bloque ACTUAL vs. el
 * promedio de esas mismas variables en ocurrencias PREVIAS del mismo tipo
 * de microciclo (bloques anteriores, no el actual). Si no hay ocurrencias
 * previas, queda marcado "no disponible" -- nunca se asume cumplida ni
 * incumplida (mismo principio de confianza que el resto del motor).
 */
function compareToHistoricalPattern(
  microcycle: MicrocycleType,
  subjective: SubjectiveMetrics,
  history: DailyRecord[]
): { available: boolean; worse?: boolean } {
  const blocks = getMicrocycleBlocks(history).filter((block) => block.microcycle === microcycle);
  const priorBlocks = blocks.slice(0, -1); // todo menos el bloque actual (el último)

  const priorValues = priorBlocks
    .flatMap((block) => block.records)
    .flatMap((record) => [
      record.subjective.explosiveness,
      record.subjective.speedReaction,
      record.subjective.techniqueQuality,
    ])
    .filter(isNumber);

  if (priorValues.length === 0) {
    return { available: false };
  }

  const historicalAverage = priorValues.reduce((sum, v) => sum + v, 0) / priorValues.length;

  const todayValues = [subjective.explosiveness, subjective.speedReaction, subjective.techniqueQuality].filter(
    isNumber
  );
  if (todayValues.length === 0) {
    return { available: false };
  }
  const todayAverage = todayValues.reduce((sum, v) => sum + v, 0) / todayValues.length;

  return { available: true, worse: todayAverage < historicalAverage };
}

const MESSAGES: Record<InjuryRiskLevel, string> = {
  Bajo: "Se observa dolor o molestia leve, sin otras señales de alerta. Se activa solo observación, sin acción inmediata.",
  Moderado:
    "Existe un patrón compatible con un incremento leve del riesgo. Se recomienda observar la evolución de FC/HRV y del dolor en los próximos días.",
  Alto: "Existe un patrón compatible con incremento del riesgo de lesión. Se recomienda revisar la carga de entrenamiento, valorar recuperación y realizar evaluación del atleta.",
  Critico:
    "Existe un patrón sostenido compatible con incremento del riesgo de lesión. Se recomienda revisar la carga de entrenamiento, valorar recuperación y realizar evaluación del atleta de forma prioritaria.",
};

export function evaluateInjuryRisk(
  microcycle: MicrocycleType,
  health: DailyRecord["health"],
  subjective: SubjectiveMetrics,
  baseline: HealthBaseline,
  history: DailyRecord[]
): InjuryRiskEvaluation {
  if (!isPainPresent(subjective)) {
    // El árbol completo está gateado por "dolor dispara investigación"
    // (informe de decisiones) -- sin dolor/molestia, IRL no se evalúa.
    return { sustainedDays: 0, historicalComparisonAvailable: false };
  }

  const fcDelta = percentChange(health.restingHeartRate, baseline.restingHeartRate);
  const hrvDelta = percentChange(health.hrv, baseline.hrv);
  const fcOut = isOutOfExpectedRange(classifyAgainstRange(fcDelta, getFcTargetRange(microcycle)));
  const hrvOut = isOutOfExpectedRange(
    toFatigueAxis(classifyAgainstRange(hrvDelta, getHrvTargetRange(microcycle)), true)
  );
  const decliningCount = countDecliningPerformanceVars(subjective, microcycle);

  const sustainedDays = countSustainedAltoCoreDays(history, baseline);
  const historical = compareToHistoricalPattern(microcycle, subjective, history);

  const altoCoreToday = fcOut && hrvOut && decliningCount >= 1;
  const altoConfirmed = altoCoreToday && (sustainedDays >= 3 || historical.worse === true);
  const criticoConfirmed = altoConfirmed && decliningCount >= 2 && sustainedDays >= 5;

  let level: InjuryRiskLevel;
  if (criticoConfirmed) {
    level = "Critico";
  } else if (altoConfirmed) {
    level = "Alto";
  } else if (!fcOut && !hrvOut && decliningCount === 0) {
    level = "Bajo";
  } else {
    // Cubre: (fcOut xor hrvOut) sin caída de rendimiento (Moderado tal como
    // lo define el informe), Y los casos borde que el informe no cubre
    // explícitamente (ej. altoCoreToday=true pero sin sostenido>=3 ni peor
    // que historial todavía) -- se reporta como Moderado en vez de Alto sin
    // confirmar, para no sobre-alertar antes de tiempo.
    level = "Moderado";
  }

  return {
    level,
    message: MESSAGES[level],
    sustainedDays,
    historicalComparisonAvailable: historical.available,
    worseThanHistoricalPattern: historical.worse,
  };
}
