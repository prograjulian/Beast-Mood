import type { MicrocycleType, PostWorkoutObservation, PostWorkoutTrendResult } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline } from "../model/athletedata/health";
import { getMicrocycleBlocks } from "./microcycleBlocks";
import { isNumber, percentChange } from "./physiologicalRanges";

/**
 * Recuperación Autonómica Post-Entreno -- métrica nueva (informe de
 * decisiones 2026-07-20, no estaba en el reporte de bugs original). FC/HRV
 * medidas ~2h después de terminar el entreno son una señal fisiológica
 * distinta de la basal matutina: cómo está tolerando el cuerpo la carga del
 * día, no el estado de reposo general.
 */

// Ventana de captura declarada en el informe: 2h ±15min post-entreno. Fuera
// de esa ventana, la lectura no cuenta para esta métrica ese día.
const CAPTURE_WINDOW_MINUTES = 120;
const CAPTURE_WINDOW_TOLERANCE_MINUTES = 15;

export function isWithinCaptureWindow(minutesAfterWorkout?: number): boolean {
  if (!isNumber(minutesAfterWorkout)) return false;
  return (
    minutesAfterWorkout >= CAPTURE_WINDOW_MINUTES - CAPTURE_WINDOW_TOLERANCE_MINUTES &&
    minutesAfterWorkout <= CAPTURE_WINDOW_MINUTES + CAPTURE_WINDOW_TOLERANCE_MINUTES
  );
}

/**
 * Nivel 1 (día a día): modo OBSERVACIÓN únicamente. No existen rangos
 * esperados por microciclo para esta métrica en ningún documento fuente --
 * no se inventan aquí. Nunca dispara un estado por sí sola.
 */
export function observePostWorkoutRecovery(
  record: Pick<DailyRecord, "health">,
  baseline: HealthBaseline
): PostWorkoutObservation {
  const postWorkout = record.health.postWorkout;
  if (!postWorkout || !isWithinCaptureWindow(postWorkout.minutesAfterWorkout)) {
    return {};
  }
  return {
    fcDelta: percentChange(postWorkout.restingHeartRate, baseline.restingHeartRate),
    hrvDelta: percentChange(postWorkout.hrv, baseline.hrv),
  };
}

// Arranque en frío de esta métrica (informe de decisiones): 7 lecturas
// válidas como objetivo, piso de 5 si la frecuencia de entreno no permite
// llegar a 7 dentro de un microciclo corto. "No necesariamente
// consecutivas, dentro del mismo TIPO de microciclo" -- se cuenta a través
// de todo el historial de ese tipo, no solo el bloque actual.
const COLD_START_TARGET_READINGS = 7;
const COLD_START_FLOOR_READINGS = 5;

// Cuántas lecturas post-entreno dentro del bloque ACTUAL hacen falta para
// poder hablar de una "tendencia" en vez de solo puntos sueltos.
const MIN_READINGS_FOR_TREND = 3;

/**
 * Nivel 2 (tendencia, donde esta métrica tiene valor real según el informe
 * de decisiones): dentro del bloque de microciclo ACTUAL, traza la curva de
 * postHrvDelta día a día. Un deterioro progresivo genera una alerta
 * temprana -- NUNCA un estado de alto impacto, solo una señal de atención.
 *
 * Heurística de "deterioro progresivo" PROVISIONAL: el documento fuente no
 * define la fórmula exacta. Se implementa como 3 lecturas consecutivas
 * dentro del bloque, cada una más lejos del baseline que la anterior --
 * razonable y explícito, no una decisión científica cerrada. Ajustar si el
 * entrenador confirma un criterio distinto.
 */
export function evaluatePostWorkoutTrend(
  microcycle: MicrocycleType,
  history: DailyRecord[],
  baseline: HealthBaseline
): PostWorkoutTrendResult {
  const validReadingsForType = history.filter(
    (record) =>
      record.microcycle === microcycle && isWithinCaptureWindow(record.health.postWorkout?.minutesAfterWorkout)
  ).length;

  if (validReadingsForType < COLD_START_FLOOR_READINGS) {
    return {
      evaluated: false,
      validReadingsForType,
      minimumRequired: COLD_START_TARGET_READINGS,
      note: `Recuperación post-entreno: arranque en frío de esta métrica. Se necesitan ${COLD_START_FLOOR_READINGS}-${COLD_START_TARGET_READINGS} lecturas válidas del mismo tipo de microciclo antes de activar alertas de tendencia. Llevas ${validReadingsForType}.`,
    };
  }

  const blocks = getMicrocycleBlocks(history);
  const currentBlock = blocks[blocks.length - 1];

  if (!currentBlock || currentBlock.microcycle !== microcycle) {
    return {
      evaluated: false,
      validReadingsForType,
      minimumRequired: COLD_START_TARGET_READINGS,
      note: "No hay un bloque de microciclo actual con el que evaluar la tendencia post-entreno.",
    };
  }

  const dailyHrvDeltas = currentBlock.records
    .filter((record) => isWithinCaptureWindow(record.health.postWorkout?.minutesAfterWorkout))
    .map((record) => percentChange(record.health.postWorkout?.hrv, baseline.hrv))
    .filter(isNumber);

  if (dailyHrvDeltas.length < MIN_READINGS_FOR_TREND) {
    return {
      evaluated: false,
      validReadingsForType,
      minimumRequired: COLD_START_TARGET_READINGS,
      note: `Menos de ${MIN_READINGS_FOR_TREND} lecturas post-entreno válidas en el bloque actual -- no alcanza para trazar una tendencia todavía.`,
    };
  }

  const lastThree = dailyHrvDeltas.slice(-MIN_READINGS_FOR_TREND);
  const deteriorating = lastThree[1] < lastThree[0] && lastThree[2] < lastThree[1];

  return {
    evaluated: true,
    validReadingsForType,
    minimumRequired: COLD_START_TARGET_READINGS,
    deteriorating,
    note: deteriorating
      ? "La recuperación de HRV post-entreno viene empeorando día a día dentro de este microciclo -- señal de atención temprana, aunque la lectura matutina parezca normal."
      : "Sin deterioro progresivo detectado en la recuperación post-entreno de este bloque.",
  };
}
