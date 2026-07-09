import { emptyAthleteProfile, type AthleteProfile } from "./athlete";
import { emptyDailyMetrics, type DailyMetrics } from "./dailyMetrics";

export interface AppDataModel {
  athlete: AthleteProfile;
  dailyMetrics: DailyMetrics;
}

export const emptyAppDataModel: AppDataModel = {
  athlete: emptyAthleteProfile,
  dailyMetrics: emptyDailyMetrics,
};

export { emptyAthleteProfile, emptyDailyMetrics };
export type { AthleteProfile, DailyMetrics };

