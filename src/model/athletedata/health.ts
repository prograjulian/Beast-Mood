export type TrendDirection = "up" | "down" | "stable";

export interface HealthTrends {
  restingHeartRate?: TrendDirection;
  hrv?: TrendDirection;
  sleep?: TrendDirection;
  activity?: TrendDirection;
  sessions?: TrendDirection;
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

export interface HealthSnapshot {
  restingHeartRate?: number;
  hrv?: number;
  sleepHours?: number;
  activityMinutes?: number;
  sessionsCount?: number;
  trends?: HealthTrends;
  updatedAt?: string;
}

export const emptyHealthBaseline: HealthBaseline = {
  trendWindowDays: 14,
};

export const emptyHealthSnapshot: HealthSnapshot = {};
