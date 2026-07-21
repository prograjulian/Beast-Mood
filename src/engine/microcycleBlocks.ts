import type { MicrocycleType } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";

/**
 * Agrupa el historial en bloques contiguos del mismo microciclo, ordenados
 * por fecha. Compartido entre atrEngine.ts (Nivel 2, §5.2) y
 * postWorkoutEngine.ts (tendencia de recuperación post-entreno) para no
 * duplicar la lógica de agrupación.
 */
export interface MicrocycleBlock {
  microcycle: MicrocycleType;
  records: DailyRecord[];
}

export function getMicrocycleBlocks(history: DailyRecord[]): MicrocycleBlock[] {
  const sorted = [...history]
    .filter((record) => !!record.microcycle)
    .sort((a, b) => a.date.localeCompare(b.date));

  const blocks: MicrocycleBlock[] = [];
  for (const record of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.microcycle === record.microcycle) {
      last.records.push(record);
    } else {
      blocks.push({ microcycle: record.microcycle as MicrocycleType, records: [record] });
    }
  }
  return blocks;
}
