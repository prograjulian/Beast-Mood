import type { ATRInterpretation, MicrocycleType } from "./atr";
import type { CoachMetrics } from "./coach";
import type { HealthSnapshot } from "./health";
import type { SubjectiveMetrics } from "./subjective";
import type { TrainingLoad } from "./training";

export type SessionPeriod = "AM" | "PM";

export interface DailySessionRecord {
  id: string;
  athleteId: string;
  date: string;
  period: SessionPeriod;
  microcycle: MicrocycleType | "";
  sessionType?: string;
  health: HealthSnapshot;
  subjective: SubjectiveMetrics;
  training: TrainingLoad;
  coach?: CoachMetrics;
  atr?: ATRInterpretation;
  notes?: string;
}

export const emptyDailySessionRecord: DailySessionRecord = {
  id: "",
  athleteId: "",
  date: "",
  period: "AM",
  microcycle: "",
  health: {},
  subjective: {},
  training: {},
};
