import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline } from "../model/athletedata/health";

// Informe de decisiones 2026-07-20 (Bug B.2) + Motor ATR §1.8.
const ROLLING_WINDOW_DAYS = 7;
// "Mínimo aceptable: 4-5 lecturas válidas por semana" -- se usa 4 como piso;
// si el entrenador quiere el piso más estricto de 5, ajustar esta constante.
const MIN_VALID_READINGS = 4;
// Motor ATR §1.8, ya confirmado antes de este informe: Carga/Impacto
// cambian FC/HRV mucho por diseño, no son días "basales" -- se excluyen del
// recálculo del baseline (pero sí se siguen usando para la interpretación
// del día en Capas 1-3, eso no cambia).
const BASELINE_EXCLUDED_MICROCYCLES = new Set(["Carga", "Impacto"]);

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function average(values: number[]): number | undefined {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;
}

/**
 * Calcula el baseline individual con ventana móvil de 7 días calendario
 * (informe de decisiones 2026-07-20, Bug B.2, y Motor ATR §1.8).
 *
 * Reglas:
 * - Solo la lectura MATUTINA (`health.restingHeartRate`/`health.hrv`) cuenta
 *   -- la única que alimenta Capa 1 (Bug B.1). Si falta ese día, no se
 *   busca sustituto (ni post-entreno ni pre-sueño): ese día simplemente no
 *   entra al promedio.
 * - Días en microciclo Carga o Impacto quedan excluidos (§1.8): cambian
 *   mucho por diseño, no reflejan el estado basal real.
 * - La ventana son los 7 días calendario ANTERIORES a `asOfDate`, sin
 *   incluir `asOfDate` -- si incluyera el propio día que se va a interpretar,
 *   el baseline se compararía parcialmente contra sí mismo.
 * - Si hay menos de 4 lecturas válidas en esa ventana, el promedio no se
 *   considera representativo (Bug B.2) y se mantiene el baseline anterior
 *   sin cambios, en vez de sobreescribirlo con un promedio poco confiable.
 *
 * Pendiente, NO resuelto por el informe de decisiones (no se inventa aquí):
 * exclusión de outliers por desviación estándar (Motor ATR §1.8, "±2-3 DE,
 * sugerido, a definir"). Tampoco se aplica transformación ln() a HRV --
 * depende del índice real que entregue Apple Health (rMSSD vs. SDNN, sin
 * confirmar todavía; Apple Health por defecto reporta SDNN, no rMSSD, que
 * es a lo que aplica la literatura citada en el informe de decisiones).
 */
export function calculateHealthBaseline(
  history: DailyRecord[],
  asOfDate: string,
  previousBaseline: HealthBaseline
): HealthBaseline {
  if (history.length === 0) return previousBaseline;

  const windowEnd = addDays(asOfDate, -1);
  const windowStart = addDays(asOfDate, -ROLLING_WINDOW_DAYS);

  const eligible = history.filter((record) => {
    if (record.date < windowStart || record.date > windowEnd) return false;
    if (record.microcycle && BASELINE_EXCLUDED_MICROCYCLES.has(record.microcycle)) return false;
    return isNumber(record.health.restingHeartRate) || isNumber(record.health.hrv);
  });

  if (eligible.length < MIN_VALID_READINGS) {
    return previousBaseline;
  }

  const fcAverage = average(eligible.map((r) => r.health.restingHeartRate).filter(isNumber));
  const hrvAverage = average(eligible.map((r) => r.health.hrv).filter(isNumber));

  return {
    ...previousBaseline,
    restingHeartRate: fcAverage ?? previousBaseline.restingHeartRate,
    hrv: hrvAverage ?? previousBaseline.hrv,
    trendWindowDays: ROLLING_WINDOW_DAYS,
    updatedAt: new Date().toISOString(),
  };
}
