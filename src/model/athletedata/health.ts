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

/**
 * Lectura ~2h (±15min) después de terminar el entreno -- métrica nueva del
 * informe de decisiones 2026-07-20 ("Recuperación Autonómica Post-Entreno").
 * Señal distinta de la matutina: cómo tolera el cuerpo la carga del día, no
 * el estado basal. Fuera de la ventana declarada, ese día no cuenta para
 * esta métrica (ver src/engine/postWorkoutEngine.ts).
 */
export interface PostWorkoutReading {
  restingHeartRate?: number;
  hrv?: number;
  minutesAfterWorkout?: number;
}

/**
 * Lectura antes de dormir -- solo contexto, sin peso formal ni comparación
 * contra baseline (informe de decisiones 2026-07-20, Bug B.3: no hay
 * literatura que respalde estandarizarla, más sujeta a variables no
 * controladas). No la usa ninguna capa del motor.
 */
export interface PreSleepReading {
  restingHeartRate?: number;
  hrv?: number;
}

export interface HealthSnapshot {
  /** Lectura matutina en reposo -- la ÚNICA que alimenta Capa 1 (Motor ATR
   * §2.1; informe de decisiones 2026-07-20, Bug B.1). Ninguna otra lectura
   * del día la sustituye si falta. */
  restingHeartRate?: number;
  /** Ídem, matutina. */
  hrv?: number;
  sleepHours?: number;
  activityMinutes?: number;
  sessionsCount?: number;
  postWorkout?: PostWorkoutReading;
  preSleep?: PreSleepReading;
  trends?: HealthTrends;
  updatedAt?: string;
}

export const emptyHealthBaseline: HealthBaseline = {
  trendWindowDays: 7,
};

export const emptyHealthSnapshot: HealthSnapshot = {};
