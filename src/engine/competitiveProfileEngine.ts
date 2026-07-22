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
 * Alcance de esta implementación (deliberadamente incompleto, mismo patrón
 * que Nivel 3 -- CLAUDE.md §4): calcula el vector y el gate de "historial
 * insuficiente" cuando corresponde, pero NO reemplaza todavía el perfil
 * genérico dentro de `evaluateCompetitionReadiness` -- eso es un cambio más
 * grande al veredicto "Listo para competir" (qué tolerancia usar alrededor
 * del promedio personalizado, si sigue habiendo variables obligatorias,
 * etc., nada de eso está especificado) que merece su propia ronda, no
 * agregarse al final de esta. Por ahora se expone como información de
 * contexto para el entrenador.
 */

const MIN_PODIUMS_REQUIRED = 3;

function average(values: number[]): number | undefined {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;
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
  };

  return {
    available: true,
    podiumCount: podiumDays.length,
    minimumRequired: MIN_PODIUMS_REQUIRED,
    vector,
    note: `Perfil competitivo individual disponible, construido a partir de ${podiumDays.length} resultados con podio.`,
  };
}
