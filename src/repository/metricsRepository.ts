import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CoachMetrics } from "../model/athletedata/coach";
import type { DailyMetrics } from "../model/athletedata/dailyMetrics";
import type { HealthBaseline, HealthSnapshot } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import type { TrainingLoad } from "../model/athletedata/training";

const KEYS = {
  healthBaseline: "@beastmood:healthBaseline",
  healthSnapshot: "@beastmood:healthSnapshot",
  subjectiveMetrics: "@beastmood:subjectiveMetrics",
  trainingLoad: "@beastmood:trainingLoad",
  coachMetrics: "@beastmood:coachMetrics",
  dailyMetrics: "@beastmood:dailyMetrics",
} as const;

async function saveJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function getJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveHealthBaseline(
  baseline: HealthBaseline
): Promise<void> {
  await saveJson(KEYS.healthBaseline, baseline);
}

export async function getHealthBaseline(): Promise<HealthBaseline | null> {
  return getJson<HealthBaseline>(KEYS.healthBaseline);
}

export async function saveHealthSnapshot(snapshot: HealthSnapshot): Promise<void> {
  await saveJson(KEYS.healthSnapshot, snapshot);
}

export async function getHealthSnapshot(): Promise<HealthSnapshot | null> {
  return getJson<HealthSnapshot>(KEYS.healthSnapshot);
}

export async function saveSubjectiveMetrics(
  subjective: SubjectiveMetrics
): Promise<void> {
  await saveJson(KEYS.subjectiveMetrics, subjective);
}

export async function getSubjectiveMetrics(): Promise<SubjectiveMetrics | null> {
  return getJson<SubjectiveMetrics>(KEYS.subjectiveMetrics);
}

export async function saveTrainingLoad(training: TrainingLoad): Promise<void> {
  await saveJson(KEYS.trainingLoad, training);
}

export async function getTrainingLoad(): Promise<TrainingLoad | null> {
  return getJson<TrainingLoad>(KEYS.trainingLoad);
}

export async function saveCoachMetrics(coach: CoachMetrics): Promise<void> {
  await saveJson(KEYS.coachMetrics, coach);
}

export async function getCoachMetrics(): Promise<CoachMetrics | null> {
  return getJson<CoachMetrics>(KEYS.coachMetrics);
}

export async function saveDailyMetrics(daily: DailyMetrics): Promise<void> {
  await saveJson(KEYS.dailyMetrics, daily);
}

export async function getDailyMetrics(): Promise<DailyMetrics | null> {
  return getJson<DailyMetrics>(KEYS.dailyMetrics);
}

export async function clearAllMetrics(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.healthBaseline,
    KEYS.healthSnapshot,
    KEYS.subjectiveMetrics,
    KEYS.trainingLoad,
    KEYS.coachMetrics,
    KEYS.dailyMetrics,
  ]);
}