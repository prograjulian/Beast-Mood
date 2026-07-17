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
