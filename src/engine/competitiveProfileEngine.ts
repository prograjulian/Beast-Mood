import type { CompetitiveProfileResult, CompetitiveProfileVector } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import { isNumber } from "./physiologicalRanges";

/**
 * Perfil Competitivo Individual (Motor ATR §13, texto completo leído el
 * 2026-07-22 en `Downloads\MotorcentralBeastM\Beast_Mood_Motor_ATR_v1.md` --
 * ver CLAUDE.md §9 para la ubicación). Mecánica DECIDIDA por el documento
 * fuente: tomar los N mejores resultados competitivos históricos del atleta
 * (días marcados como "podio" por el entrenador, `CoachMetrics
 * .competitionResult`) y construir, a partir de esos registros, un vector
 * de referencia personalizado (FC, HRV, sueño, piernas, explosividad,
 * confianza tal como estaban esos días) -- en vez del perfil genérico
 * teórico del microciclo Competitivo (§1.6).
 *
 * Umbral mínimo de resultados NO decidido por el documento ("propuesta a
 * validar: 3-5 podios") -- se usa el extremo más permisivo (3) como valor
 * provisional, documentado como tal, mismo tratamiento que el resto de
 * umbrales no confirmados del proyecto (ej. PAIN_PRESENT_THRESHOLD).
 *
 * Conectado al veredicto "Listo para competir" el 2026-07-22
 * (`evaluateCompetitionReadiness` en atrEngine.ts): cuando el perfil
 * personalizado está disponible, las variables mandatorias/de apoyo que SÍ
 * tienen un target personalizado se comparan contra ese target (con
 * tolerancia, ver `isWithinPersonalizedTolerance`) en vez del rango
 * genérico de §1.6 -- exactamente lo que pide el documento ("el sistema
 * compara al atleta contra su propio perfil ganador, no contra el perfil
 * genérico"). Las variables sin target personalizado disponible (ej. pocos
 * podios registraron esa variable puntual) siguen usando el rango genérico
 * como respaldo -- nunca se bloquea el veredicto por falta de un dato
 * personalizado que el genérico sí puede cubrir.
 *
 * Tolerancia NO especificada por el documento (ninguna sesión de decisiones
 * la definió) -- valor provisional elegido acá, documentado como tal:
 * ±8% para variables fisiológicas (FC, HRV, sueño -- mismo orden de
 * magnitud que el ancho de los rangos genéricos de §1.7, ej. HRV
 * Competitivo es +5% a +20%, 15 puntos de ancho) y ±1 punto para escalas
 * subjetivas 1-9 (piernas, explosividad, técnica, confianza -- una escala
 * de 5 opciones con paso 2, ±1 es "la opción vecina").
 */

const MIN_PODIUMS_REQUIRED = 3;
export const PERSONALIZED_PHYSIOLOGICAL_TOLERANCE_PCT = 8;
export const PERSONALIZED_SUBJECTIVE_TOLERANCE_POINTS = 1;

function average(values: number[]): number | undefined {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;
}

/**
 * ¿El valor actual está lo bastante cerca del target personalizado como
 * para considerarse "igual a como estaba en los días de podio"? `target`
 * puede faltar (esa variable puntual no tiene suficientes podios con ese
 * dato) -- en ese caso el llamador debe usar el rango genérico como
 * respaldo, esta función no decide ese fallback.
 */
export function isWithinPersonalizedTolerance(
  current: number | undefined,
  target: number | undefined,
  tolerance: number,
  mode: "percent" | "points"
): boolean | undefined {
  if (!isNumber(current) || !isNumber(target)) return undefined;
  if (mode === "percent") {
    if (target === 0) return Math.abs(current - target) <= tolerance;
    const percentDiff = (Math.abs(current - target) / Math.abs(target)) * 100;
    return percentDiff <= tolerance;
  }
  return Math.abs(current - target) <= tolerance;
}

export function evaluateCompetitiveProfile(history: DailyRecord[]): CompetitiveProfileResult {
  const podiumDays = history.filter((record) => record.coach?.competitionResult === "podio");

  if (podiumDays.length < MIN_PODIUMS_REQUIRED) {
    return {
      available: false,
      podiumCount: podiumDays.length,
      minimumRequired: MIN_PODIUMS_REQUIRED,
      note: `Historial competitivo insuficiente para un perfil personalizado (${podiumDays.length}/${MIN_PODIUMS_REQUIRED} podios) — se sigue usando el perfil genérico del microciclo Competitivo (Motor ATR §1.6).`,
    };
  }

  const vector: CompetitiveProfileVector = {
    restingHeartRate: average(podiumDays.map((record) => record.health.restingHeartRate).filter(isNumber)),
    hrv: average(podiumDays.map((record) => record.health.hrv).filter(isNumber)),
    sleepHours: average(podiumDays.map((record) => record.health.sleepHours).filter(isNumber)),
    legFeeling: average(podiumDays.map((record) => record.subjective.legFeeling).filter(isNumber)),
    explosiveness: average(podiumDays.map((record) => record.subjective.explosiveness).filter(isNumber)),
    confidence: average(podiumDays.map((record) => record.coach?.confidence).filter(isNumber)),
    techniqueQuality: average(podiumDays.map((record) => record.subjective.techniqueQuality).filter(isNumber)),
  };

  return {
    available: true,
    podiumCount: podiumDays.length,
    minimumRequired: MIN_PODIUMS_REQUIRED,
    vector,
    note: `Perfil competitivo individual disponible, construido a partir de ${podiumDays.length} resultados con podio.`,
  };
}
