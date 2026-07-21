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

// Exclusión de outliers (Motor ATR §1.8: "±2-3 DE, sugerido, a definir" --
// sin confirmar por el entrenador). NO se implementa literalmente como
// media±desviación estándar clásica: con ventanas chicas (4-7 lecturas,
// exactamente el caso real acá) ese método sufre "masking" -- un único
// valor extremo infla su propia desviación estándar lo suficiente como para
// nunca superar el umbral y terminar excluyéndose a sí mismo (verificado
// empíricamente: un valor de 300 lpm entre seis lecturas de 50 lpm NO se
// excluía con ±2.5 DE clásico). Eso derrotaría el propósito real de la
// regla -- descartar una lectura errónea -- así que se usa en su lugar la
// mediana + MAD (desviación absoluta mediana), un estimador robusto
// estándar para este problema exacto que no sufre masking. Umbral 3.5 en
// el "modified z-score" (Iglewicz & Hoya 1993), la referencia más citada
// para este método -- elegido en vez del ±2-3 "DE" literal del documento
// porque el objetivo declarado (descartar lecturas erróneas) importa más
// que la letra literal de "desviación estándar" (CLAUDE.md §1: ante tensión
// entre más fácil de programar y más fiel a la lógica deportiva, gana la
// lógica deportiva -- acá la lógica deportiva es "detectar el outlier de
// verdad", no "usar la fórmula de DE clásica que en la práctica no detecta
// nada"). Sigue siendo provisional, sin confirmar por el entrenador.
const OUTLIER_MODIFIED_ZSCORE_THRESHOLD = 3.5;
const MIN_SAMPLE_FOR_OUTLIER_CHECK = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function excludeOutliers(values: number[]): number[] {
  if (values.length < MIN_SAMPLE_FOR_OUTLIER_CHECK) return values;

  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));

  let filtered: number[];
  if (mad === 0) {
    // Sin dispersión típica en la muestra (MAD=0, ej. 6 de 7 lecturas
    // idénticas): cualquier valor distinto de la mediana ya es anómalo --
    // el modified z-score no se puede calcular (división por cero), pero
    // la señal de outlier es incluso más clara en este caso, no menos.
    filtered = values.filter((v) => v === med);
  } else {
    filtered = values.filter((v) => (0.6745 * Math.abs(v - med)) / mad <= OUTLIER_MODIFIED_ZSCORE_THRESHOLD);
  }

  // Si el filtro dejara la muestra vacía (caso degenerado), se prefiere el
  // promedio sin filtrar antes que quedarse sin ningún dato.
  return filtered.length > 0 ? filtered : values;
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
 * Exclusión de outliers (Motor ATR §1.8, "±2-3 DE, sugerido, a definir"):
 * implementada con mediana + MAD en vez de media/DE clásica -- ver el
 * comentario en excludeOutliers() más abajo para el porqué (masking con
 * muestras chicas). Provisional, sin confirmar por el entrenador.
 *
 * Pendiente, NO resuelto (no se inventa aquí): transformación ln() a HRV --
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

  const fcAverage = average(excludeOutliers(eligible.map((r) => r.health.restingHeartRate).filter(isNumber)));
  const hrvAverage = average(excludeOutliers(eligible.map((r) => r.health.hrv).filter(isNumber)));

  return {
    ...previousBaseline,
    restingHeartRate: fcAverage ?? previousBaseline.restingHeartRate,
    hrv: hrvAverage ?? previousBaseline.hrv,
    trendWindowDays: ROLLING_WINDOW_DAYS,
    updatedAt: new Date().toISOString(),
  };
}
