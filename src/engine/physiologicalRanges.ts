import type { MicrocycleType, RangeStatus } from "../model/athletedata/atr";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";

/**
 * Tablas de rango esperado por microciclo (Motor ATR §1.7) y las funciones
 * de clasificación de Capa 1 (§2). Vive en su propio módulo porque son
 * datos de dominio reales, compartidos entre atrEngine.ts (motor principal)
 * e injuryRiskEngine.ts (IRL) -- duplicarlos en cada archivo sería un
 * riesgo real de que se desincronicen entre sí.
 */

export type ExpectedRange = {
  min?: number;
  max?: number;
};

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function percentChange(current?: number, baseline?: number): number | undefined {
  if (!isNumber(current) || !isNumber(baseline) || baseline === 0) return undefined;
  return ((current - baseline) / baseline) * 100;
}

export function withinRange(value: number | undefined, range: ExpectedRange): boolean {
  if (!isNumber(value)) return false;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
}

export function getBorgExpectedRange(microcycle: MicrocycleType): ExpectedRange {
  switch (microcycle) {
    case "Ajuste":
      return { min: 2, max: 4 };
    case "Carga":
      return { min: 5, max: 8 };
    case "Impacto":
      return { min: 4, max: 7 };
    case "Recuperacion":
      return { min: 2, max: 4 };
    case "Activacion":
      return { min: 2, max: 4 };
    case "Competitivo":
      return { min: 2, max: 3 };
    default:
      return {};
  }
}

export function getFcTargetRange(microcycle: MicrocycleType): ExpectedRange {
  switch (microcycle) {
    case "Ajuste":
      return { min: 8, max: 12 };
    case "Carga":
      return { min: 15, max: 19 };
    case "Impacto":
      return { min: 13, max: 15 };
    case "Recuperacion":
      return { min: 5, max: 9 };
    case "Activacion":
      return { min: 0, max: 5 };
    case "Competitivo":
      return { min: -5, max: 0 };
    default:
      return {};
  }
}

export function getHrvTargetRange(microcycle: MicrocycleType): ExpectedRange {
  switch (microcycle) {
    case "Ajuste":
      return { min: -10, max: -5 };
    case "Carga":
      return { min: -30, max: -20 };
    case "Impacto":
      return { min: -30, max: -20 };
    case "Recuperacion":
      return { min: 0, max: 5 };
    case "Activacion":
      return { min: 0, max: 5 };
    case "Competitivo":
      return { min: 5, max: 20 };
    default:
      return {};
  }
}

// Capa 1 — Lectura fisiológica (Motor ATR §2). La prioridad de FC sobre HRV
// ante contradicción (ver resolvePhysiological en atrEngine.ts) es una
// regla CONFIRMADA (§2.3 -- reconfirmado en el informe de decisiones
// 2026-07-20, Bug E). Lo único que sigue provisional es el ANCHO de la
// banda de tolerancia, ±3% (§2.1, "sugerido, a definir" en el documento
// fuente).
export const PHYSIOLOGICAL_TOLERANCE_PCT = 3;

export function classifyAgainstRange(
  value: number | undefined,
  range: ExpectedRange,
  tolerance = PHYSIOLOGICAL_TOLERANCE_PCT
): RangeStatus | undefined {
  if (!isNumber(value)) return undefined;
  if (typeof range.min === "number" && value < range.min - tolerance) return "por_debajo";
  if (typeof range.max === "number" && value > range.max + tolerance) return "por_encima";
  return "dentro_de_rango";
}

/**
 * Normaliza el resultado de classifyAgainstRange al eje "nivel de fatiga":
 * por_encima = más fatiga de lo esperado, por_debajo = más fresco de lo
 * esperado — independientemente de si el rango esperado de esa variable es
 * positivo o negativo. Un delta de FC más alto que el esperado siempre
 * indica más fatiga (no hay que invertir). Un delta de HRV más bajo que el
 * esperado siempre indica más fatiga aunque el rango esperado sea negativo
 * (ej. Ajuste) o positivo (ej. Competitivo) — por eso HRV sí se invierte.
 * Sin esto, "más fatiga confirmada por ambas fuentes" se leía como
 * divergencia (FC por_encima vs HRV por_debajo son la MISMA señal).
 */
export function toFatigueAxis(raw: RangeStatus | undefined, invert: boolean): RangeStatus | undefined {
  if (!raw || raw === "dentro_de_rango" || !invert) return raw;
  return raw === "por_debajo" ? "por_encima" : "por_debajo";
}

// "Dolor/molestia leve presente" -- el informe de decisiones no da un
// número, se usa el mismo piso que "Leve" en las opciones de captura de
// register.tsx (PAIN_OPTIONS ya usa 1/3/5/7/9) -- provisional razonable, no
// confirmado por el entrenador. Compartido entre injuryRiskEngine.ts (gate
// del árbol de IRL) y la UI (home.tsx: el dolor elevado es la única
// variable con veto visual, sube al resumen aunque el resto de variables
// secundarias esté en el drill-down -- informe de decisiones 2026-07-21,
// sección 5 punto 13).
export const PAIN_PRESENT_THRESHOLD = 3;

export function isPainElevated(subjective: SubjectiveMetrics): boolean {
  return (
    (isNumber(subjective.musclePain) && subjective.musclePain >= PAIN_PRESENT_THRESHOLD) ||
    (isNumber(subjective.discomfort) && subjective.discomfort >= PAIN_PRESENT_THRESHOLD)
  );
}
