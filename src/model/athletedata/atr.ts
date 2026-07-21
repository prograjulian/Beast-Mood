import type { CoachMetrics } from "./coach";
import type { DailyRecord } from "./dailyRecord";
import type { HealthBaseline, HealthSnapshot } from "./health";
import type { SubjectiveMetrics } from "./subjective";
import type { TrainingLoad } from "./training";

export type MicrocycleType =
  | "Ajuste"
  | "Carga"
  | "Impacto"
  | "Recuperacion"
  | "Activacion"
  | "Competitivo";

/**
 * Los 5 estados oficiales del motor (Motor ATR v1 §0.1). No agregar estados
 * paralelos: las capas (fisiológica, subjetiva, cruce, transición) son el
 * mecanismo interno para llegar a uno de estos 5, no estados adicionales.
 */
export type ATRState =
  | "Recuperacion adecuada"
  | "Fatiga funcional"
  | "Fatiga excesiva"
  | "Preparacion insuficiente"
  | "Supercompensacion"
  | "Pendiente de evaluacion";

export type RangeStatus = "por_debajo" | "dentro_de_rango" | "por_encima";
export type SubjectiveStatus =
  | "peor_de_lo_esperado"
  | "coherente_con_lo_esperado"
  | "mejor_de_lo_esperado";

// Capa 1 — Motor ATR §2. FC manda si hay conflicto con HRV.
export interface PhysiologicalReading {
  fcStatus?: RangeStatus;
  hrvStatus?: RangeStatus;
  status?: RangeStatus;
  divergenceFcHrv: boolean;
}

// Nivel 2 — Motor ATR §5.2. Comparación contra el microciclo anterior.
export interface Level2Result {
  evaluated: boolean;
  transition?: string;
  occurredAsExpected?: boolean;
  note?: string;
}

// Nivel 3 — Motor ATR §5.3. Comparación histórica multi-temporada (IA).
export interface Level3Result {
  evaluated: false;
  completedMacrocycles: number;
  minimumRequired: number;
  note: string;
}

// Métrica nueva (informe de decisiones 2026-07-20) -- observación de Nivel 1
// (día a día, nunca dispara estado) y tendencia de Nivel 2 (dentro del
// bloque actual). Ver src/engine/postWorkoutEngine.ts.
export interface PostWorkoutObservation {
  fcDelta?: number;
  hrvDelta?: number;
}

export interface PostWorkoutTrendResult {
  evaluated: boolean;
  validReadingsForType: number;
  minimumRequired: number;
  deteriorating?: boolean;
  note: string;
}

/**
 * "Listo para competir" (informe de decisiones 2026-07-21, formaliza
 * Preguntas Estructurales §1) -- veredicto DISTINTO de Supercompensación:
 * umbral mínimo aceptable para competir sin riesgo, no el pico fisiológico
 * ideal. Todo atleta supercompensado está listo; no todo atleta listo está
 * supercompensado. Solo se evalúa en el microciclo Competitivo.
 * Visibilidad exclusiva del entrenador (decisión de producto: efecto
 * nocebo documentado en atletas que reciben señales negativas de wearables
 * antes de competir) -- ver home.tsx.
 */
export interface ReadinessEvaluation {
  status: "ready" | "not_ready" | "not_evaluable";
  blockedBy: string[];
  failedMandatory: string[];
  missingMandatory: string[];
  supportingConcerns: string[];
}

/**
 * Índice de Confianza del Análisis (CLAUDE.md §5, ya propuesto, ahora
 * implementado como versión provisional razonable -- los umbrales exactos
 * de completitud de datos no están confirmados por el entrenador).
 */
export type ConfidenceLevel = "Alta" | "Media" | "Baja";

export interface ATRInterpretation {
  state: ATRState;
  message?: string;
  alerts: string[];
  expectedVsActualReady: boolean;
  physiological?: PhysiologicalReading;
  subjectiveStatus?: SubjectiveStatus;
  dissonanceLabel?: string;
  level2?: Level2Result;
  level3?: Level3Result;
  postWorkoutObservation?: PostWorkoutObservation;
  postWorkoutTrend?: PostWorkoutTrendResult;
  competitionReadiness?: ReadinessEvaluation;
  confidenceLevel?: ConfidenceLevel;
}

export interface ATRInput {
  microcycle: MicrocycleType | "";
  baseline: HealthBaseline;
  health: HealthSnapshot;
  subjective: SubjectiveMetrics;
  training: TrainingLoad;
  coach?: CoachMetrics;
  /** Historial completo del atleta (todas las fechas), para Nivel 2/3. */
  history?: DailyRecord[];
}

export const emptyATRInterpretation: ATRInterpretation = {
  state: "Pendiente de evaluacion",
  alerts: [],
  expectedVsActualReady: false,
};
