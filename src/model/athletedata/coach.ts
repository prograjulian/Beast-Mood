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

export const emptyCoachMetrics: CoachMetrics = {};
