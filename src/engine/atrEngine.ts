import type {
  ATRInput,
  ATRInterpretation,
  ATRState,
  Level2Result,
  Level3Result,
  MicrocycleType,
  PhysiologicalReading,
  RangeStatus,
  SubjectiveStatus,
} from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline, HealthSnapshot } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import { calculateInternalLoad, type TrainingLoad } from "../model/athletedata/training";

type ExpectedRange = {
  min?: number;
  max?: number;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percentChange(current?: number, baseline?: number): number | undefined {
  if (!isNumber(current) || !isNumber(baseline) || baseline === 0) return undefined;
  return ((current - baseline) / baseline) * 100;
}

function formatPercent(value?: number): string {
  if (!isNumber(value)) return "--";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function withinRange(value: number | undefined, range: ExpectedRange): boolean {
  if (!isNumber(value)) return false;
  if (typeof range.min === "number" && value < range.min) return false;
  if (typeof range.max === "number" && value > range.max) return false;
  return true;
}

function getBorgExpectedRange(microcycle: MicrocycleType): ExpectedRange {
  switch (microcycle) {
    case "Ajuste":
      return { min: 2, max: 4 };
    case "Carga":
      return { min: 5, max: 8 };
    case "Impacto":
      return { min: 4, max: 7 };
    case "Recuperacion":
      return { min: 2, max: 4 };
    case "Activacion":
      return { min: 2, max: 4 };
    case "Competitivo":
      return { min: 2, max: 3 };
    default:
      return {};
  }
}

function getFcTargetRange(microcycle: MicrocycleType): ExpectedRange {
  switch (microcycle) {
    case "Ajuste":
      return { min: 8, max: 12 };
    case "Carga":
      return { min: 15, max: 19 };
    case "Impacto":
      return { min: 13, max: 15 };
    case "Recuperacion":
      return { min: 5, max: 9 };
    case "Activacion":
      return { min: 0, max: 5 };
    case "Competitivo":
      return { min: -5, max: 0 };
    default:
      return {};
  }
}

function getHrvTargetRange(microcycle: MicrocycleType): ExpectedRange {
  switch (microcycle) {
    case "Ajuste":
      return { min: -10, max: -5 };
    case "Carga":
      return { min: -30, max: -20 };
    case "Impacto":
      return { min: -30, max: -20 };
    case "Recuperacion":
      return { min: 0, max: 5 };
    case "Activacion":
      return { min: 0, max: 5 };
    case "Competitivo":
      return { min: 5, max: 20 };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Capa 1 — Lectura fisiológica (Motor ATR §2). Banda de tolerancia ±3%
// (§2.1, "sugerido", no confirmada por el entrenador — provisional).
// ---------------------------------------------------------------------------

const PHYSIOLOGICAL_TOLERANCE_PCT = 3;

function classifyAgainstRange(
  value: number | undefined,
  range: ExpectedRange,
  tolerance = PHYSIOLOGICAL_TOLERANCE_PCT
): RangeStatus | undefined {
  if (!isNumber(value)) return undefined;
  if (typeof range.min === "number" && value < range.min - tolerance) return "por_debajo";
  if (typeof range.max === "number" && value > range.max + tolerance) return "por_encima";
  return "dentro_de_rango";
}

/**
 * Normaliza el resultado de classifyAgainstRange al eje "nivel de fatiga":
 * por_encima = más fatiga de lo esperado, por_debajo = más fresco de lo
 * esperado — independientemente de si el rango esperado de esa variable es
 * positivo o negativo. Un delta de FC más alto que el esperado siempre
 * indica más fatiga (no hay que invertir). Un delta de HRV más bajo que el
 * esperado siempre indica más fatiga aunque el rango esperado sea negativo
 * (ej. Ajuste) o positivo (ej. Competitivo) — por eso HRV sí se invierte.
 * Sin esto, "más fatiga confirmada por ambas fuentes" se leía como
 * divergencia (FC por_encima vs HRV por_debajo son la MISMA señal).
 */
function toFatigueAxis(raw: RangeStatus | undefined, invert: boolean): RangeStatus | undefined {
  if (!raw || raw === "dentro_de_rango" || !invert) return raw;
  return raw === "por_debajo" ? "por_encima" : "por_debajo";
}

function resolvePhysiological(
  fcStatus?: RangeStatus,
  hrvStatus?: RangeStatus
): PhysiologicalReading {
  if (fcStatus && hrvStatus) {
    return {
      fcStatus,
      hrvStatus,
      status: fcStatus,
      divergenceFcHrv: fcStatus !== hrvStatus,
    };
  }

  return {
    fcStatus,
    hrvStatus,
    status: fcStatus ?? hrvStatus,
    divergenceFcHrv: false,
  };
}

// ---------------------------------------------------------------------------
// Capa 2 — Lectura subjetiva (Motor ATR §3). La fórmula exacta de agregación
// ponderada sigue pendiente de validar (§14.1) — esta es una implementación
// provisional: dolor/fatiga/molestia altos dominan (umbral >=8, ya usado en
// el motor para "fatiga excesiva"), el resto se agrega como promedio de
// rendimiento igual que antes.
// ---------------------------------------------------------------------------

function getPerformanceDirection(
  microcycle: MicrocycleType,
  subjective?: SubjectiveMetrics
): { improving: boolean; declining: boolean } {
  const performanceItems = [
    subjective?.overallPerformance,
    subjective?.techniqueQuality,
    subjective?.speedReaction,
    subjective?.explosiveness,
    subjective?.strikingPower,
    subjective?.easeOfExit,
    subjective?.legFeeling,
  ].filter(isNumber);

  if (performanceItems.length === 0) {
    return { improving: false, declining: false };
  }

  const avg = performanceItems.reduce((sum, n) => sum + n, 0) / performanceItems.length;

  if (microcycle === "Carga" || microcycle === "Impacto") {
    return {
      improving: avg >= 6,
      declining: avg <= 4,
    };
  }

  if (microcycle === "Recuperacion" || microcycle === "Activacion" || microcycle === "Competitivo") {
    return {
      improving: avg >= 7,
      declining: avg <= 5,
    };
  }

  return {
    improving: avg >= 6,
    declining: avg <= 4,
  };
}

function getSubjectiveStatus(
  microcycle: MicrocycleType,
  subjective: SubjectiveMetrics
): SubjectiveStatus | undefined {
  const hasAnyData = Object.values(subjective).some((value) => isNumber(value));
  if (!hasAnyData) return undefined;

  if (
    (isNumber(subjective.musclePain) && subjective.musclePain >= 8) ||
    (isNumber(subjective.fatigue) && subjective.fatigue >= 8) ||
    (isNumber(subjective.discomfort) && subjective.discomfort >= 8)
  ) {
    return "peor_de_lo_esperado";
  }

  const { improving, declining } = getPerformanceDirection(microcycle, subjective);
  if (declining) return "peor_de_lo_esperado";
  if (improving) return "mejor_de_lo_esperado";
  return "coherente_con_lo_esperado";
}

// ---------------------------------------------------------------------------
// Capa 3 — Cruce fisiológico × subjetivo (Motor ATR §4, el corazón del
// motor). Produce una etiqueta de disonancia y, junto con Nivel 1, el estado
// oficial de primer nivel.
// ---------------------------------------------------------------------------

function crossPhysiologicalSubjective(
  microcycle: MicrocycleType,
  physio?: RangeStatus,
  subjectiveStatus?: SubjectiveStatus
): string | undefined {
  if (!physio || !subjectiveStatus) return undefined;

  if (physio === "por_encima" && subjectiveStatus === "peor_de_lo_esperado") {
    return "Fatiga confirmada";
  }
  if (physio === "por_encima") {
    return "Alerta silenciosa";
  }
  if (physio === "dentro_de_rango" && subjectiveStatus === "peor_de_lo_esperado") {
    return "Alerta subjetiva temprana";
  }
  if (physio === "dentro_de_rango") {
    return "Dentro de lo esperado";
  }
  // physio === "por_debajo"
  if (subjectiveStatus === "peor_de_lo_esperado") {
    return "Disonancia inversa";
  }
  if (microcycle === "Carga" || microcycle === "Impacto") {
    return "Estimulo insuficiente";
  }
  return "Mas fresco de lo esperado";
}

function buildMicrocycleAlerts(
  microcycle: MicrocycleType,
  fcDelta?: number,
  hrvDelta?: number,
  sleepHours?: number,
  borg?: number,
  subjective?: SubjectiveMetrics
): string[] {
  const alerts: string[] = [];
  const fcRange = getFcTargetRange(microcycle);
  const borgRange = getBorgExpectedRange(microcycle);

  if (isNumber(sleepHours) && sleepHours < 7) {
    alerts.push("Sueño por debajo de 7 horas.");
  }

  if (isNumber(subjective?.discomfort) && subjective.discomfort >= 7) {
    alerts.push("Molestias o malestar elevados.");
  }

  if (isNumber(subjective?.musclePain) && subjective.musclePain >= 7) {
    alerts.push("Dolor muscular alto.");
  }

  if (isNumber(fcDelta) && fcDelta > 20) {
    alerts.push("FC reposo muy por encima de la referencia.");
  }

  if (isNumber(hrvDelta) && hrvDelta < -30) {
    alerts.push("HRV muy por debajo de la referencia.");
  }

  if (isNumber(borg) && !withinRange(borg, borgRange)) {
    alerts.push(`Borg fuera del rango esperado para ${microcycle}.`);
  }

  if (microcycle === "Carga" || microcycle === "Impacto") {
    if (isNumber(fcDelta) && fcDelta < fcRange.min!) {
      alerts.push("La FC está más baja de lo esperado para una carga alta.");
    }
    if (isNumber(hrvDelta) && hrvDelta > -5) {
      alerts.push("HRV demasiado conservada para una carga alta.");
    }
  }

  if (microcycle === "Recuperacion" || microcycle === "Activacion") {
    if (isNumber(fcDelta) && fcDelta > 10) {
      alerts.push("La FC sigue elevada para una fase de recuperación/activación.");
    }
  }

  if (microcycle === "Competitivo") {
    if (isNumber(fcDelta) && fcDelta > 0) {
      alerts.push("La FC no está lo suficientemente baja para competitivo.");
    }
    if (isNumber(hrvDelta) && hrvDelta < 5) {
      alerts.push("La HRV todavía no entra en un perfil competitivo óptimo.");
    }
  }

  return alerts;
}

function isSupercompensationCoherent(
  fcDelta?: number,
  hrvDelta?: number,
  subjective?: SubjectiveMetrics
): boolean {
  // Motor ATR §1.6: requiere coherencia simultánea, un solo indicador alto no basta.
  const fcVeryLow = isNumber(fcDelta) && fcDelta <= -5;
  const hrvHigh = isNumber(hrvDelta) && hrvDelta >= 5;
  const explosivenessHigh = isNumber(subjective?.explosiveness) && subjective.explosiveness >= 8;
  const speedHigh = isNumber(subjective?.speedReaction) && subjective.speedReaction >= 8;
  const legsLight = isNumber(subjective?.legFeeling) && subjective.legFeeling >= 8;
  const motivationHigh = isNumber(subjective?.motivation) && subjective.motivation >= 7;

  return fcVeryLow && hrvHigh && explosivenessHigh && speedHigh && legsLight && motivationHigh;
}

function isExcessiveFatigue(
  microcycle: MicrocycleType,
  fcDelta?: number,
  hrvDelta?: number,
  subjective?: SubjectiveMetrics
): boolean {
  return (
    (isNumber(fcDelta) && fcDelta > 18 && (microcycle === "Carga" || microcycle === "Impacto")) ||
    (isNumber(hrvDelta) && hrvDelta < -30) ||
    (isNumber(subjective?.discomfort) && subjective.discomfort >= 8) ||
    (isNumber(subjective?.musclePain) && subjective.musclePain >= 8) ||
    (isNumber(subjective?.fatigue) && subjective.fatigue >= 8)
  );
}

// ---------------------------------------------------------------------------
// Nivel 2 — Comparación con el microciclo anterior (Motor ATR §5.2).
// ---------------------------------------------------------------------------

const MICROCYCLE_SEQUENCE: MicrocycleType[] = [
  "Ajuste",
  "Carga",
  "Impacto",
  "Recuperacion",
  "Activacion",
  "Competitivo",
];

interface MicrocycleBlock {
  microcycle: MicrocycleType;
  records: DailyRecord[];
}

function getMicrocycleBlocks(history: DailyRecord[]): MicrocycleBlock[] {
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

function averageField(
  records: DailyRecord[],
  picker: (record: DailyRecord) => number | undefined
): number | undefined {
  const values = records.map(picker).filter(isNumber);
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function blockFcHrvDeltas(
  records: DailyRecord[],
  baseline: HealthBaseline
): { fcDelta?: number; hrvDelta?: number } {
  const fcDeltas = records
    .map((r) => percentChange(r.health.restingHeartRate, baseline.restingHeartRate))
    .filter(isNumber);
  const hrvDeltas = records
    .map((r) => percentChange(r.health.hrv, baseline.hrv))
    .filter(isNumber);

  return {
    fcDelta: fcDeltas.length ? fcDeltas.reduce((s, v) => s + v, 0) / fcDeltas.length : undefined,
    hrvDelta: hrvDeltas.length ? hrvDeltas.reduce((s, v) => s + v, 0) / hrvDeltas.length : undefined,
  };
}

const CHANGE_EPSILON = 1e-6;

function evaluateTransition(
  from: MicrocycleType,
  to: MicrocycleType,
  previousBlock: MicrocycleBlock,
  currentBlock: MicrocycleBlock,
  baseline: HealthBaseline
): Level2Result {
  const transition = `${from} -> ${to}`;
  const prevPhysio = blockFcHrvDeltas(previousBlock.records, baseline);
  const currPhysio = blockFcHrvDeltas(currentBlock.records, baseline);
  const prevBorg = averageField(previousBlock.records, (r) => r.training.borgCR10);
  const currBorg = averageField(currentBlock.records, (r) => r.training.borgCR10);

  const field = (picker: (r: DailyRecord) => number | undefined) => ({
    prev: averageField(previousBlock.records, picker),
    curr: averageField(currentBlock.records, picker),
  });

  const legFeeling = field((r) => r.subjective.legFeeling);
  const explosiveness = field((r) => r.subjective.explosiveness);
  const speedReaction = field((r) => r.subjective.speedReaction);
  const techniqueQuality = field((r) => r.subjective.techniqueQuality);
  const overallPerformance = field((r) => r.subjective.overallPerformance);
  const motivation = field((r) => r.subjective.motivation);

  function increased(prev?: number, curr?: number): boolean | undefined {
    if (!isNumber(prev) || !isNumber(curr)) return undefined;
    return curr - prev > CHANGE_EPSILON;
  }

  function decreased(prev?: number, curr?: number): boolean | undefined {
    if (!isNumber(prev) || !isNumber(curr)) return undefined;
    return prev - curr > CHANGE_EPSILON;
  }

  function countTrue(values: (boolean | undefined)[]): { occurred: number; measurable: number } {
    const measurable = values.filter((v) => v !== undefined);
    return { occurred: measurable.filter(Boolean).length, measurable: measurable.length };
  }

  if (from === "Ajuste" && to === "Carga") {
    const checks = countTrue([
      increased(prevPhysio.fcDelta, currPhysio.fcDelta),
      decreased(prevPhysio.hrvDelta, currPhysio.hrvDelta),
      increased(prevBorg, currBorg),
      decreased(legFeeling.prev, legFeeling.curr),
    ]);
    if (checks.measurable === 0) {
      return { evaluated: false, transition, note: "Datos insuficientes para comparar Ajuste -> Carga." };
    }
    const occurredAsExpected = checks.occurred > 0;
    return {
      evaluated: true,
      transition,
      occurredAsExpected,
      note: occurredAsExpected
        ? "El organismo respondió al mayor estímulo de Carga como se esperaba."
        : "El atleta se mantiene igual que en Ajuste; el estímulo de Carga probablemente fue insuficiente.",
    };
  }

  if (from === "Carga" && to === "Impacto") {
    const excessiveSignals = [
      isNumber(techniqueQuality.curr) && techniqueQuality.curr <= 2,
      isNumber(currPhysio.hrvDelta) && currPhysio.hrvDelta < -30,
      isNumber(currPhysio.fcDelta) && currPhysio.fcDelta > 20,
    ].filter(Boolean).length;

    if (excessiveSignals === 0 && !isNumber(techniqueQuality.curr) && !isNumber(currPhysio.hrvDelta)) {
      return { evaluated: false, transition, note: "Datos insuficientes para comparar Carga -> Impacto." };
    }

    const occurredAsExpected = excessiveSignals < 2;
    return {
      evaluated: true,
      transition,
      occurredAsExpected,
      note: occurredAsExpected
        ? "La acumulación de fatiga hacia Impacto luce dentro de lo tolerado."
        : "Varias señales (técnica, HRV, FC) sugieren que el atleta está colapsando en vez de acumular fatiga funcional hacia Impacto.",
    };
  }

  if (from === "Impacto" && to === "Recuperacion") {
    const checks = countTrue([
      increased(explosiveness.prev, explosiveness.curr),
      increased(speedReaction.prev, speedReaction.curr),
      increased(legFeeling.prev, legFeeling.curr),
      increased(motivation.prev, motivation.curr),
      increased(prevPhysio.hrvDelta, currPhysio.hrvDelta),
      decreased(prevPhysio.fcDelta, currPhysio.fcDelta),
    ]);
    if (checks.measurable === 0) {
      return { evaluated: false, transition, note: "Datos insuficientes para comparar Impacto -> Recuperación." };
    }
    const occurredAsExpected = checks.occurred >= Math.ceil(checks.measurable / 2);
    return {
      evaluated: true,
      transition,
      occurredAsExpected,
      note: occurredAsExpected
        ? "La recuperación tras Impacto muestra la mejora esperada."
        : "No se observa la mejora esperada tras Impacto; la recuperación parece insuficiente.",
    };
  }

  if (from === "Recuperacion" && to === "Activacion") {
    const checks = countTrue([
      increased(legFeeling.prev, legFeeling.curr),
      increased(speedReaction.prev, speedReaction.curr),
      increased(techniqueQuality.prev, techniqueQuality.curr),
      increased(overallPerformance.prev, overallPerformance.curr),
    ]);
    if (checks.measurable === 0) {
      return { evaluated: false, transition, note: "Datos insuficientes para comparar Recuperación -> Activación." };
    }
    const occurredAsExpected = checks.occurred >= Math.ceil(checks.measurable / 2);
    return {
      evaluated: true,
      transition,
      occurredAsExpected,
      note: occurredAsExpected
        ? "La Activación muestra la mejora adicional esperada respecto a Recuperación."
        : "El atleta sigue similar a como estaba en Recuperación; probablemente no llegará al pico competitivo así.",
    };
  }

  if (from === "Activacion" && to === "Competitivo") {
    const checks = countTrue([
      decreased(prevPhysio.fcDelta, currPhysio.fcDelta),
      increased(prevPhysio.hrvDelta, currPhysio.hrvDelta),
      increased(explosiveness.prev, explosiveness.curr),
      increased(speedReaction.prev, speedReaction.curr),
    ]);
    if (checks.measurable === 0) {
      return { evaluated: false, transition, note: "Datos insuficientes para comparar Activación -> Competitivo." };
    }
    const occurredAsExpected = checks.occurred >= Math.ceil(checks.measurable / 2);
    return {
      evaluated: true,
      transition,
      occurredAsExpected,
      note: occurredAsExpected
        ? "Aparecen señales del pico esperado hacia Competitivo."
        : "No aparecen todavía las señales del pico esperado hacia Competitivo; probablemente no se alcanzó la adaptación buscada en Activación (Supercompensación en sí la sigue decidiendo el Nivel 1 con su regla de coherencia, sección 1.6).",
    };
  }

  return { evaluated: false, transition, note: "No hay una regla de transición documentada para este par de microciclos." };
}

function evaluateLevel2(microcycle: MicrocycleType, history: DailyRecord[], baseline: HealthBaseline): Level2Result {
  const blocks = getMicrocycleBlocks(history);
  if (blocks.length < 2) {
    return { evaluated: false, note: "No hay microciclo anterior registrado todavía para comparar evolución." };
  }

  const currentBlock = blocks[blocks.length - 1];
  const previousBlock = blocks[blocks.length - 2];

  if (currentBlock.microcycle !== microcycle) {
    return { evaluated: false, note: "El microciclo seleccionado no coincide con el último bloque del historial." };
  }

  const expectedPreviousIndex = MICROCYCLE_SEQUENCE.indexOf(microcycle) - 1;
  const expectedPrevious = expectedPreviousIndex >= 0 ? MICROCYCLE_SEQUENCE[expectedPreviousIndex] : null;

  if (!expectedPrevious || previousBlock.microcycle !== expectedPrevious) {
    return {
      evaluated: false,
      note: `El bloque anterior fue "${previousBlock.microcycle}", no "${expectedPrevious ?? "(ninguno, Ajuste es el primero)"}" — no hay una regla de transición documentada para ese salto.`,
    };
  }

  return evaluateTransition(expectedPrevious, microcycle, previousBlock, currentBlock, baseline);
}

// ---------------------------------------------------------------------------
// Nivel 3 — Comparación histórica multi-temporada (Motor ATR §5.3). Ligado al
// roadmap de IA; aquí solo se determina si hay suficiente historial y se
// explica honestamente por qué todavía no se evalúa (arranque en frío).
// ---------------------------------------------------------------------------

const MIN_MACROCYCLES_FOR_LEVEL3 = 2;

function countCompletedMacrocycles(blocks: MicrocycleBlock[]): number {
  let completed = 0;
  let expectedIndex = 0;

  for (const block of blocks) {
    if (block.microcycle === MICROCYCLE_SEQUENCE[expectedIndex]) {
      expectedIndex += 1;
      if (expectedIndex === MICROCYCLE_SEQUENCE.length) {
        completed += 1;
        expectedIndex = 0;
      }
    } else if (block.microcycle === MICROCYCLE_SEQUENCE[0]) {
      expectedIndex = 1;
    } else {
      expectedIndex = 0;
    }
  }

  return completed;
}

function evaluateLevel3(history: DailyRecord[]): Level3Result {
  const blocks = getMicrocycleBlocks(history);
  const completedMacrocycles = countCompletedMacrocycles(blocks);

  if (completedMacrocycles < MIN_MACROCYCLES_FOR_LEVEL3) {
    return {
      evaluated: false,
      completedMacrocycles,
      minimumRequired: MIN_MACROCYCLES_FOR_LEVEL3,
      note: `Nivel 3 requiere al menos ${MIN_MACROCYCLES_FOR_LEVEL3} macrociclos completos para comparar patrones entre temporadas (Motor ATR §5.3/§14.7, propuesta no confirmada). Llevas ${completedMacrocycles}.`,
    };
  }

  return {
    evaluated: false,
    completedMacrocycles,
    minimumRequired: MIN_MACROCYCLES_FOR_LEVEL3,
    note: "Ya hay suficientes macrociclos en cantidad, pero el motor de aprendizaje de patrones de Nivel 3 (ligado al roadmap de IA) todavía no está implementado.",
  };
}

// ---------------------------------------------------------------------------
// Nivel 1 + ensamblado final
// ---------------------------------------------------------------------------

function mapDissonanceToState(
  microcycle: MicrocycleType,
  dissonanceLabel: string | undefined,
  fcDelta?: number,
  hrvDelta?: number,
  borg?: number,
  subjective?: SubjectiveMetrics
): ATRState {
  const borgRange = getBorgExpectedRange(microcycle);
  const borgOk = withinRange(borg, borgRange);

  if (microcycle === "Competitivo" && dissonanceLabel === "Mas fresco de lo esperado") {
    if (isSupercompensationCoherent(fcDelta, hrvDelta, subjective)) {
      return "Supercompensacion";
    }
    return "Recuperacion adecuada";
  }

  if (isExcessiveFatigue(microcycle, fcDelta, hrvDelta, subjective)) {
    return "Fatiga excesiva";
  }

  switch (dissonanceLabel) {
    case "Fatiga confirmada":
    case "Alerta silenciosa": {
      const fcRange = getFcTargetRange(microcycle);
      const hrvRange = getHrvTargetRange(microcycle);
      const withinFunctionalBand =
        withinRange(fcDelta, fcRange) && withinRange(hrvDelta, hrvRange) && borgOk;
      return withinFunctionalBand ? "Fatiga funcional" : "Fatiga excesiva";
    }
    case "Estimulo insuficiente":
      return "Preparacion insuficiente";
    case "Alerta subjetiva temprana":
    case "Disonancia inversa":
      return "Fatiga funcional";
    case "Dentro de lo esperado":
      // En Carga/Impacto, "dentro del rango esperado" ES la zona de fatiga
      // funcional por diseño (Motor ATR §1.2/§1.3) — no es un estado neutro
      // como en el resto de microciclos.
      return microcycle === "Carga" || microcycle === "Impacto"
        ? "Fatiga funcional"
        : "Recuperacion adecuada";
    case "Mas fresco de lo esperado":
      return "Recuperacion adecuada";
    default:
      return "Pendiente de evaluacion";
  }
}

export function evaluateATR(input: ATRInput): ATRInterpretation {
  const { microcycle, baseline, health, subjective, training, history } = input;

  if (!microcycle) {
    return {
      state: "Pendiente de evaluacion",
      message: "Selecciona un microciclo para interpretar el estado ATR.",
      alerts: [],
      expectedVsActualReady: false,
    };
  }

  const fcCurrent = health.restingHeartRate;
  const hrvCurrent = health.hrv;
  const sleepHours = health.sleepHours;
  const borg = training.borgCR10;

  const fcBaseline = baseline.restingHeartRate;
  const hrvBaseline = baseline.hrv;

  const fcDelta = percentChange(fcCurrent, fcBaseline);
  const hrvDelta = percentChange(hrvCurrent, hrvBaseline);
  const internalLoad =
    training.internalLoad ?? calculateInternalLoad(training.borgCR10, training.durationMinutes);

  const alerts = buildMicrocycleAlerts(microcycle, fcDelta, hrvDelta, sleepHours, borg, subjective);

  // Capa 1 — ambos normalizados al eje "nivel de fatiga" antes de comparar
  // (ver toFatigueAxis: FC alto y HRV bajo son la misma señal de fatiga).
  const fcStatus = classifyAgainstRange(fcDelta, getFcTargetRange(microcycle));
  const hrvStatus = toFatigueAxis(classifyAgainstRange(hrvDelta, getHrvTargetRange(microcycle)), true);
  const physiological = resolvePhysiological(fcStatus, hrvStatus);
  if (physiological.divergenceFcHrv) {
    alerts.push("Divergencia FC/HRV: las dos fuentes no coinciden; se resolvió a favor de FC (guardado para historial).");
  }

  // Capa 2
  const subjectiveStatus = getSubjectiveStatus(microcycle, subjective);

  // Capa 3
  const dissonanceLabel = crossPhysiologicalSubjective(microcycle, physiological.status, subjectiveStatus);

  let state = mapDissonanceToState(microcycle, dissonanceLabel, fcDelta, hrvDelta, borg, subjective);

  // Nivel 2 — puede promover el estado final (Motor ATR §5.2: "alimentan
  // directamente los estados Preparación insuficiente y Fatiga excesiva").
  let level2: Level2Result | undefined;
  if (history) {
    level2 = evaluateLevel2(microcycle, history, baseline);
    if (level2.evaluated && level2.occurredAsExpected === false) {
      if (level2.transition === "Carga -> Impacto") {
        state = "Fatiga excesiva";
        alerts.push(level2.note ?? "Nivel 2: transición no ocurrió como se esperaba.");
      } else if (state !== "Fatiga excesiva") {
        state = "Preparacion insuficiente";
        alerts.push(level2.note ?? "Nivel 2: transición no ocurrió como se esperaba.");
      }
    }
  }

  const level3 = history ? evaluateLevel3(history) : undefined;

  let message = "";
  switch (state) {
    case "Supercompensacion":
      message =
        "El atleta muestra un perfil muy favorable para competir: FC baja, HRV alta y sensaciones positivas coherentes entre sí.";
      break;
    case "Preparacion insuficiente":
      message =
        "La evolución respecto al microciclo anterior no ocurrió como se esperaba; el bloque previo probablemente no generó la adaptación buscada.";
      break;
    case "Fatiga funcional":
      message =
        "La fatiga parece coherente con la fase actual y puede estar cumpliendo su función adaptativa.";
      break;
    case "Fatiga excesiva":
      message =
        "Hay señales de sobrecarga o recuperación insuficiente; conviene ajustar la carga.";
      break;
    case "Recuperacion adecuada":
      message =
        "La respuesta del atleta se mantiene alineada con lo esperado para este microciclo.";
      break;
    default:
      message = "Pendiente de evaluación.";
      break;
  }

  if (isNumber(sleepHours) && sleepHours < 7 && alerts.length > 0) {
    message += " El sueño bajo puede estar afectando la recuperación.";
  }

  if (internalLoad !== undefined && internalLoad > 0) {
    alerts.push(`Carga interna calculada: ${Math.round(internalLoad)}.`);
  }

  return {
    state,
    message,
    alerts,
    expectedVsActualReady:
      isNumber(fcBaseline) &&
      isNumber(hrvBaseline) &&
      (isNumber(fcCurrent) || isNumber(hrvCurrent) || isNumber(borg)),
    physiological,
    subjectiveStatus,
    dissonanceLabel,
    level2,
    level3,
  };
}

export function describeExpectedVsActual(
  microcycle: MicrocycleType,
  baseline: HealthBaseline,
  health: HealthSnapshot,
  training: TrainingLoad
): string {
  const fcDelta = percentChange(health.restingHeartRate, baseline.restingHeartRate);
  const hrvDelta = percentChange(health.hrv, baseline.hrv);
  const borg = training.borgCR10;

  const fcText = `FC: esperado ${formatPercent(getFcTargetRange(microcycle).min)} a ${formatPercent(getFcTargetRange(microcycle).max)}, actual ${formatPercent(fcDelta)}`;
  const hrvText = `HRV: esperado ${formatPercent(getHrvTargetRange(microcycle).min)} a ${formatPercent(getHrvTargetRange(microcycle).max)}, actual ${formatPercent(hrvDelta)}`;
  const borgRange = getBorgExpectedRange(microcycle);

  const borgText = `Borg: esperado ${borgRange.min ?? "--"} a ${borgRange.max ?? "--"}, actual ${isNumber(borg) ? borg : "--"}`;

  return `${fcText}\n${hrvText}\n${borgText}`;
}
