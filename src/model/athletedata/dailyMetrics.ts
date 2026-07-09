export interface DailyMetrics {
date: string;
restingHeartRate?: number;
hrv?: number;
sleepHours?: number;
activityMinutes?: number;
trainingLoad?: number;
borg?: number;
mood?: number;
soreness?: number;
motivation?: number;
technicalQuality?: number;
speed?: number;
explosiveness?: number;
legFeeling?: number;
notes?: string;
}

export const emptyDailyMetrics: DailyMetrics = {
date: new Date().toISOString().slice(0, 10),
};