import type { MicrocycleType } from "./atr";

export type Guard = "Izquierda" | "Derecha" | "Ambas" | string;

export interface AthleteProfile {
  id: string;
  name: string;
  category: string;
  weightDivision?: string;
  age?: number;
  guard?: Guard;
  coachName?: string;
  mainGoal?: string;
  createdAt?: string;
  hasCompletedOnboarding: boolean;
  /** Microciclo activo elegido por última vez en el registro — default para la próxima carga. */
  currentMicrocycle?: MicrocycleType;
}

export const emptyAthleteProfile: AthleteProfile = {
  id: "",
  name: "",
  category: "",
  hasCompletedOnboarding: false,
};
