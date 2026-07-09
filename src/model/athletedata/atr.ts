import type { CoachMetrics } from "./coach";
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

export type ATRState =
  | "Dentro de lo esperado"
  | "Mas fresco de lo esperado"
  | "Fatiga funcional"
  | "Fatiga excesiva"
  | "Estimulacion insuficiente"
  | "Supercompensado"
  | "Pendiente de evaluacion";

export interface ATRInterpretation {
  state: ATRState;
  message?: string;
  alerts: string[];
  expectedVsActualReady: boolean;
}

export interface ATRInput {
  microcycle: MicrocycleType | "";
  baseline: HealthBaseline;
  health: HealthSnapshot;
  subjective: SubjectiveMetrics;
  training: TrainingLoad;
  coach?: CoachMetrics;
}

export const emptyATRInterpretation: ATRInterpretation = {
  state: "Pendiente de evaluacion",
  alerts: [],
  expectedVsActualReady: false,
};  
