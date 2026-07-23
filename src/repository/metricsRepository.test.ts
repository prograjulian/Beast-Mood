// ts-jest no aplica el hoisting automático de babel-plugin-jest-hoist, así
// que jest.mock debe ir antes que los imports en el orden real del archivo
// para que el mock quede activo cuando metricsRepository.ts importa
// AsyncStorage.
/* eslint-disable @typescript-eslint/no-require-imports, import/first */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import {
  clearAllMetrics,
  getDailyHistory,
  getDailyRecordByDate,
  getDailyRecordsInRange,
  getHealthBaseline,
  getLatestDailyRecord,
  getLiveHealthSnapshot,
  saveDailyRecord,
  saveHealthBaseline,
  saveLiveHealthSnapshot,
} from "./metricsRepository";

const ATHLETE_ID = "athlete-1";

function record(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    athleteId: ATHLETE_ID,
    health: {},
    subjective: {},
    training: {},
    savedAt: `${date}T08:00:00.000Z`,
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("saveDailyRecord / getDailyHistory", () => {
  it("acumula fechas distintas en vez de sobreescribir", async () => {
    await saveDailyRecord(record("2026-07-20"));
    await saveDailyRecord(record("2026-07-21"));

    const history = await getDailyHistory(ATHLETE_ID);
    expect(history.map((r) => r.date)).toEqual(["2026-07-20", "2026-07-21"]);
  });

  it("hace upsert por fecha -- guardar la misma fecha dos veces reemplaza solo ese día", async () => {
    await saveDailyRecord(record("2026-07-20", { notes: "primera versión" }));
    await saveDailyRecord(record("2026-07-21"));
    await saveDailyRecord(record("2026-07-20", { notes: "segunda versión" }));

    const history = await getDailyHistory(ATHLETE_ID);
    expect(history).toHaveLength(2);
    expect(history.find((r) => r.date === "2026-07-20")?.notes).toBe("segunda versión");
  });

  it("no mezcla el historial de distintos atletas", async () => {
    await saveDailyRecord(record("2026-07-20", { athleteId: ATHLETE_ID }));
    await saveDailyRecord(record("2026-07-20", { athleteId: "otro-atleta" }));

    expect(await getDailyHistory(ATHLETE_ID)).toHaveLength(1);
    expect(await getDailyHistory("otro-atleta")).toHaveLength(1);
  });
});

describe("getDailyRecordByDate", () => {
  it("devuelve el registro exacto de esa fecha, sin importar el orden de inserción", async () => {
    await saveDailyRecord(record("2026-07-22"));
    await saveDailyRecord(record("2026-07-20", { notes: "hace dos días" }));
    await saveDailyRecord(record("2026-07-21", { notes: "ayer" }));

    const result = await getDailyRecordByDate(ATHLETE_ID, "2026-07-21");
    expect(result?.notes).toBe("ayer");
  });

  it("devuelve null cuando no hay registro para esa fecha", async () => {
    await saveDailyRecord(record("2026-07-20"));

    expect(await getDailyRecordByDate(ATHLETE_ID, "2026-07-25")).toBeNull();
  });

  it("no se confunde con getLatestDailyRecord cuando se pide una fecha que no es la más reciente", async () => {
    await saveDailyRecord(record("2026-07-20", { notes: "vieja" }));
    await saveDailyRecord(record("2026-07-22", { notes: "más reciente" }));

    const latest = await getLatestDailyRecord(ATHLETE_ID);
    const byDate = await getDailyRecordByDate(ATHLETE_ID, "2026-07-20");

    expect(latest?.notes).toBe("más reciente");
    expect(byDate?.notes).toBe("vieja");
  });

  it("devuelve null cuando el atleta no tiene historial", async () => {
    expect(await getDailyRecordByDate(ATHLETE_ID, "2026-07-20")).toBeNull();
  });
});

describe("getLatestDailyRecord / getDailyRecordsInRange", () => {
  it("getLatestDailyRecord devuelve el de fecha más alta, no el guardado más recientemente", async () => {
    await saveDailyRecord(record("2026-07-22"));
    await saveDailyRecord(record("2026-07-20"));

    expect((await getLatestDailyRecord(ATHLETE_ID))?.date).toBe("2026-07-22");
  });

  it("getLatestDailyRecord devuelve null sin historial", async () => {
    expect(await getLatestDailyRecord(ATHLETE_ID)).toBeNull();
  });

  it("getDailyRecordsInRange filtra por rango inclusivo", async () => {
    await saveDailyRecord(record("2026-07-18"));
    await saveDailyRecord(record("2026-07-20"));
    await saveDailyRecord(record("2026-07-22"));

    const inRange = await getDailyRecordsInRange(ATHLETE_ID, "2026-07-19", "2026-07-21");
    expect(inRange.map((r) => r.date)).toEqual(["2026-07-20"]);
  });
});

describe("baseline y snapshot live", () => {
  it("guarda y lee el baseline por atleta", async () => {
    await saveHealthBaseline(ATHLETE_ID, { restingHeartRate: 52, hrv: 90 });
    expect(await getHealthBaseline(ATHLETE_ID)).toEqual({ restingHeartRate: 52, hrv: 90 });
  });

  it("devuelve null cuando no hay baseline guardado", async () => {
    expect(await getHealthBaseline(ATHLETE_ID)).toBeNull();
  });

  it("guarda y lee el snapshot live por atleta", async () => {
    await saveLiveHealthSnapshot(ATHLETE_ID, { restingHeartRate: 55 });
    expect(await getLiveHealthSnapshot(ATHLETE_ID)).toEqual({ restingHeartRate: 55 });
  });
});

describe("clearAllMetrics", () => {
  it("borra historial, baseline y snapshot live de ese atleta", async () => {
    await saveDailyRecord(record("2026-07-20"));
    await saveHealthBaseline(ATHLETE_ID, { restingHeartRate: 52 });
    await saveLiveHealthSnapshot(ATHLETE_ID, { restingHeartRate: 55 });

    await clearAllMetrics(ATHLETE_ID);

    expect(await getDailyHistory(ATHLETE_ID)).toEqual([]);
    expect(await getHealthBaseline(ATHLETE_ID)).toBeNull();
    expect(await getLiveHealthSnapshot(ATHLETE_ID)).toBeNull();
  });
});
