import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CoachMetrics } from "../model/athletedata/coach";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline, HealthSnapshot } from "../model/athletedata/health";

function historyKey(athleteId: string): string {
  return `@beastmood:history:${athleteId}`;
}

function baselineKey(athleteId: string): string {
  return `@beastmood:healthBaseline:${athleteId}`;
}

function liveHealthSnapshotKey(athleteId: string): string {
  return `@beastmood:liveHealthSnapshot:${athleteId}`;
}

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

/**
 * Guarda (o reemplaza) el registro de un día puntual dentro del historial del
 * atleta. Un mismo `date` se actualiza in place; fechas distintas se acumulan
 * — nunca se pierde un día anterior por guardar uno nuevo.
 */
export async function saveDailyRecord(record: DailyRecord): Promise<void> {
  const history = await getDailyHistory(record.athleteId);
  const withoutSameDate = history.filter((entry) => entry.date !== record.date);
  const next = [...withoutSameDate, record].sort((a, b) => a.date.localeCompare(b.date));
  await saveJson(historyKey(record.athleteId), next);
}

export async function getDailyHistory(athleteId: string): Promise<DailyRecord[]> {
  const history = await getJson<DailyRecord[]>(historyKey(athleteId));
  return history ?? [];
}

export async function getDailyRecordsInRange(
  athleteId: string,
  startDate: string,
  endDate: string
): Promise<DailyRecord[]> {
  const history = await getDailyHistory(athleteId);
  return history.filter((entry) => entry.date >= startDate && entry.date <= endDate);
}

export async function getLatestDailyRecord(athleteId: string): Promise<DailyRecord | null> {
  const history = await getDailyHistory(athleteId);
  return history.length > 0 ? history[history.length - 1] : null;
}

export async function saveHealthBaseline(
  athleteId: string,
  baseline: HealthBaseline
): Promise<void> {
  await saveJson(baselineKey(athleteId), baseline);
}

export async function getHealthBaseline(athleteId: string): Promise<HealthBaseline | null> {
  return getJson<HealthBaseline>(baselineKey(athleteId));
}

/**
 * Snapshot de Health "en vivo" del día en curso, todavía no confirmado como
 * parte del historial (eso ocurre recién con saveDailyRecord). No es
 * historial: representa el dato más reciente sincronizado, pendiente de guardar.
 */
export async function saveLiveHealthSnapshot(
  athleteId: string,
  snapshot: HealthSnapshot
): Promise<void> {
  await saveJson(liveHealthSnapshotKey(athleteId), snapshot);
}

export async function getLiveHealthSnapshot(athleteId: string): Promise<HealthSnapshot | null> {
  return getJson<HealthSnapshot>(liveHealthSnapshotKey(athleteId));
}

export async function clearAllMetrics(athleteId: string): Promise<void> {
  await AsyncStorage.multiRemove([
    historyKey(athleteId),
    baselineKey(athleteId),
    liveHealthSnapshotKey(athleteId),
  ]);
}
