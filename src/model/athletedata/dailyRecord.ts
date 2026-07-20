import type { ATRState , MicrocycleType } from "./atr";
import type { CoachMetrics } from "./coach";
import type { HealthSnapshot } from "./health";
import type { SubjectiveMetrics } from "./subjective";
import type { TrainingLoad } from "./training";

/**
 * Un registro por atleta por día. Se acumula en un historial (nunca se
 * sobreescribe un día con otro) — ver CLAUDE.md sección 4 y 8.
 */
export interface DailyRecord {
  date: string; // YYYY-MM-DD, único por atleta
  athleteId: string;
  microcycle?: MicrocycleType;
  health: HealthSnapshot;
  subjective: SubjectiveMetrics;
  training: TrainingLoad;
  coach?: CoachMetrics;
  notes?: string;
  savedAt: string; // ISO timestamp de la última vez que se guardó este día
  /**
   * Resultado del motor ATR calculado para este día. Se guarda para no
   * perder banderas de disonancia (CLAUDE.md §8: "ninguna bandera de
   * disonancia se descarta") aunque el baseline cambie más adelante.
   */
  atrState?: ATRState;
  dissonanceLabel?: string;
  divergenceFcHrv?: boolean;
}
