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
}

export const emptyAthleteProfile: AthleteProfile = {
  id: "",
  name: "",
  category: "",
  hasCompletedOnboarding: false,
};
