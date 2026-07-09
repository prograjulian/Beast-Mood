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

export const emptySubjectiveMetrics: SubjectiveMetrics = {};
