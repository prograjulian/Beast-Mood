export type SessionPeriod = "AM" | "PM";

export type MicrocycleType =
  | "Ajuste"
  | "Carga"
  | "Impacto"
  | "Recuperacion"
  | "Activacion"
  | "Competitivo";

export type AthleteCategory = string;

export type Guard = "Izquierda" | "Derecha" | "Ambas" | string;

export type ATRState =
  | "Dentro de lo esperado"
  | "Mas fresco de lo esperado"
  | "Fatiga funcional"
  | "Fatiga excesiva"
  | "Estimulacion insuficiente"
  | "Supercompensado"
  | "Pendiente de evaluacion";

export interface AthleteProfile {
  id: string;
  name: string;
  category: AthleteCategory;
  weightDivision?: string;
  age?: number;
  guard?: Guard;
  coachName?: string;
  mainGoal?: string;
  createdAt?: string;
  hasCompletedOnboarding: boolean;
}

export interface HealthBaseline {
  restingHeartRate?: number;
  hrv?: number;
  sleepHours?: number;
  activityMinutes?: number;
  sessionsCount?: number;
  trendWindowDays?: number;
  updatedAt?: string;
}

export interface HealthMetrics {
  restingHeartRate?: number;
  hrv?: number;
  sleepHours?: number;
  activityMinutes?: number;
  sessionsCount?: number;
  trends?: {
    restingHeartRate?: "up" | "down" | "stable";
    hrv?: "up" | "down" | "stable";
    sleep?: "up" | "down" | "stable";
    activity?: "up" | "down" | "stable";
  };
}

export interface SubjectiveMetrics {
  fatigue?: number;
  musclePain?: number;
  stress?: number;
  motivation?: number;
  discomfort?: number;
  overallPerformance?: number;
  techniqueQuality?: number;
  speedReaction?: number;
  explosiveness?: number;
  strikingPower?: number;
  easeOfExit?: number;
  legFeeling?: number;
  athleteNotes?: string;
}

export interface CoachMetrics {
  technique?: number;
  reaction?: number;
  speed?: number;
  explosiveness?: number;
  strikingPower?: number;
  mood?: number;
  attitude?: number;
  focus?: number;
  confidence?: number;
  coachNotes?: string;
}

export interface TrainingLoad {
  borgCR10?: number;
  durationMinutes?: number;
  internalLoad?: number;
}

export interface DailyRecord {
  id: string;
  athleteId: string;
  date: string;
  period: SessionPeriod;
  microcycle: MicrocycleType | "";
  sessionType?: string;
  health: HealthMetrics;
  subjective: SubjectiveMetrics;
  load: TrainingLoad;
  coach?: CoachMetrics;
}

export interface ATRInterpretation {
  state: ATRState;
  message?: string;
  alerts: string[];
  expectedVsActualReady: boolean;
}

export interface AppDataModel {
  athlete: AthleteProfile;
  baseline: HealthBaseline;
  today?: DailyRecord;
  atr?: ATRInterpretation;
}

export const emptyAthleteProfile: AthleteProfile = {
  id: "",
  name: "",
  category: "",
  hasCompletedOnboarding: false,
};

export const emptyHealthBaseline: HealthBaseline = {
  trendWindowDays: 14,
};

export const emptyDailyRecord: DailyRecord = {
  id: "",
  athleteId: "",
  date: "",
  period: "AM",
  microcycle: "",
  health: {},
  subjective: {},
  load: {},
};

export const emptyATRInterpretation: ATRInterpretation = {
  state: "Pendiente de evaluacion",
  alerts: [],
  expectedVsActualReady: false,
};

export const emptyAppDataModel: AppDataModel = {
  athlete: emptyAthleteProfile,
  baseline: emptyHealthBaseline,
};
