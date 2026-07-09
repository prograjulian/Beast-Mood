export interface TrainingLoad {
  borgCR10?: number;
  durationMinutes?: number;
  internalLoad?: number;
}

export interface TrainingSessionDetails {
  sessionType?: string;
  focus?: string;
  intensity?: number;
  volume?: number;
}

export function calculateInternalLoad(
  borgCR10?: number,
  durationMinutes?: number
): number | undefined {
  if (typeof borgCR10 !== "number" || typeof durationMinutes !== "number") {
    return undefined;
  }

  if (borgCR10 < 0 || durationMinutes < 0) {
    return undefined;
  }

  return borgCR10 * durationMinutes;
}

export const emptyTrainingLoad: TrainingLoad = {};
