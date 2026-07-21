import type {
  ATRInput,
  ATRInterpretation,
  ATRState,
  ConfidenceLevel,
  Level2Result,
  Level3Result,
  MicrocycleType,
  PhysiologicalReading,
  RangeStatus,
  ReadinessEvaluation,
  SubjectiveStatus,
} from "../model/athletedata/atr";
import type { CoachMetrics } from "../model/athletedata/coach";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline, HealthSnapshot } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import { calculateInternalLoad, type TrainingLoad } from "../model/athletedata/training";
import { getMicrocycleBlocks, type MicrocycleBlock } from "./microcycleBlocks";
import {
  classifyAgainstRange,
  getBorgExpectedRange,
  getFcTargetRange,
  getHrvTargetRange,
  isNumber,
  percentChange,
  toFatigueAxis,
  withinRange,
} from "./physiologicalRanges";
import { evaluateInjuryRisk } from "./injuryRiskEngine";
import { evaluatePostWorkoutTrend, observePostWorkoutRecovery } from "./postWorkoutEngine";

function formatPercent(value?: number): string {
  if (!isNumber(value)) return "--";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
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
//
// Bug C (informe de decisiones 2026-07-20): la técnica AUTOreportada por el
// atleta (techniqueQuality) sigue en este promedio, pero con menor peso que
// el resto -- no veto, la autopercepción técnica es poco fiable bajo fatiga
// (literatura de aprendizaje motor/autopercepción deportiva). La técnica
// OBSERVADA por el entrenador (coach.technique) es una señal distinta, con
// más peso, manejada aparte en evaluateATR (Capa 4).
// ---------------------------------------------------------------------------

const TECHNIQUE_SELF_REPORT_WEIGHT = 0.5;

type WeightedItem = { value: number; weight: number };

function weighted(value: number | undefined, weight: number): WeightedItem | null {
  return isNumber(value) ? { value, weight } : null;
}

function getPerformanceDirection(
  microcycle: MicrocycleType,
  subjective?: SubjectiveMetrics
): { improving: boolean; declining: boolean } {
  const performanceItems = [
    weighted(subjective?.overallPerformance, 1),
    weighted(subjective?.techniqueQuality, TECHNIQUE_SELF_REPORT_WEIGHT),
    weighted(subjective?.speedReaction, 1),
    weighted(subjective?.explosiveness, 1),
    weighted(subjective?.strikingPower, 1),
    weighted(subjective?.easeOfExit, 1),
    weighted(subjective?.legFeeling, 1),
  ].filter((item): item is WeightedItem => item !== null);

  if (performanceItems.length === 0) {
    return { improving: false, declining: false };
  }

  const totalWeight = performanceItems.reduce((sum, item) => sum + item.weight, 0);
  const avg =
    performanceItems.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;

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

// Bug D (informe de decisiones 2026-07-20): antes exigía coherencia AND de 6
// variables sin distinguir "no cumple el umbral" de "no se reportó ese día".
// Si faltaba un solo dato (ej. motivación sin llenar), el sistema nunca
// declaraba Supercompensación y caía en silencio a "Recuperación adecuada"
// sin señalar que en realidad no pudo evaluar -- justo lo que CLAUDE.md §2
// pide evitar (no declarar/descartar un estado de alto impacto con datos
// incompletos sin marcar la confianza baja). Ahora se separan 4 variables
// OBLIGATORIAS (deben estar presentes Y cumplirse todas) de 3 de apoyo
// (pueden faltar sin bloquear la declaración, pero se avisa explícitamente
// qué falta). Nota de mapeo: el documento de decisiones lista 4 variables de
// apoyo ("explosividad, velocidad, reacción, motivación"), pero el modelo de
// datos actual (SubjectiveMetrics) solo tiene `speedReaction`, que ya cubre
// velocidad+reacción como un único campo -- no hay un campo de "reacción"
// separado que inventar.
export type SupercompensationEvaluation =
  | { status: "coherent"; missingSupporting: string[] }
  | { status: "not_coherent" }
  | { status: "not_evaluable"; missingMandatory: string[] };

interface CoherenceCheck {
  label: string;
  present: boolean;
  met: boolean;
}

function evaluateSupercompensation(
  fcDelta?: number,
  hrvDelta?: number,
  borg?: number,
  subjective?: SubjectiveMetrics
): SupercompensationEvaluation {
  const mandatory: CoherenceCheck[] = [
    {
      label: "FC (≤ baseline -3%)",
      present: isNumber(fcDelta),
      met: isNumber(fcDelta) && fcDelta <= -3,
    },
    {
      label: "HRV (+5% a +20% del baseline)",
      present: isNumber(hrvDelta),
      met: isNumber(hrvDelta) && hrvDelta >= 5 && hrvDelta <= 20,
    },
    {
      label: "Sensación de piernas (≥8)",
      present: isNumber(subjective?.legFeeling),
      met: isNumber(subjective?.legFeeling) && subjective!.legFeeling! >= 8,
    },
    {
      label: "Borg (≤2)",
      present: isNumber(borg),
      met: isNumber(borg) && borg <= 2,
    },
  ];

  const missingMandatory = mandatory.filter((check) => !check.present).map((check) => check.label);
  if (missingMandatory.length > 0) {
    return { status: "not_evaluable", missingMandatory };
  }

  if (!mandatory.every((check) => check.met)) {
    return { status: "not_coherent" };
  }

  const supporting: CoherenceCheck[] = [
    {
      label: "Explosividad (≥8)",
      present: isNumber(subjective?.explosiveness),
      met: isNumber(subjective?.explosiveness) && subjective!.explosiveness! >= 8,
    },
    {
      label: "Velocidad/reacción (≥8)",
      present: isNumber(subjective?.speedReaction),
      met: isNumber(subjective?.speedReaction) && subjective!.speedReaction! >= 8,
    },
    {
      label: "Motivación (≥7)",
      present: isNumber(subjective?.motivation),
      met: isNumber(subjective?.motivation) && subjective!.motivation! >= 7,
    },
  ];

  const missingSupporting = supporting
    .filter((check) => !check.present || !check.met)
    .map((check) => check.label);

  return { status: "coherent", missingSupporting };
}

// "Listo para competir" (informe de decisiones 2026-07-21, formaliza
// Preguntas Estructurales §1). Distinto de Supercompensación: umbral MÍNIMO
// aceptable para competir sin riesgo, no el pico fisiológico ideal -- por
// diseño debe ser alcanzable con más frecuencia que Supercompensación (7
// condiciones simultáneas). Solo se evalúa en Competitivo (mismo gate que
// evaluateSupercompensation).
const READINESS_SUPPORTING_THRESHOLD = 6; // No dado explícitamente en el informe para las "de
// apoyo" de este veredicto (sí lo da para las obligatorias) -- se usa el
// mismo piso de 6 que piernas/técnica para mantener un solo umbral
// coherente en todo el veredicto, en vez de inventar un número distinto.

function evaluateCompetitionReadiness(
  fcDelta: number | undefined,
  hrvDelta: number | undefined,
  subjective: SubjectiveMetrics | undefined,
  coach: CoachMetrics | undefined
): ReadinessEvaluation {
  // Bloqueadoras: veto total, sin importar el resto (informe de decisiones,
  // mismos umbrales ya usados en isExcessiveFatigue/evaluateSupercompensation).
  const blockedBy: string[] = [];
  if (isNumber(subjective?.musclePain) && subjective.musclePain >= 8) blockedBy.push("Dolor (≥8)");
  if (isNumber(subjective?.fatigue) && subjective.fatigue >= 8) blockedBy.push("Fatiga (≥8)");
  if (isNumber(subjective?.discomfort) && subjective.discomfort >= 8) blockedBy.push("Molestia (≥8)");
  if (blockedBy.length > 0) {
    return { status: "not_ready", blockedBy, failedMandatory: [], missingMandatory: [], supportingConcerns: [] };
  }

  const fcRange = getFcTargetRange("Competitivo");
  const mandatory: CoherenceCheck[] = [
    {
      label: "FC (dentro del rango esperado de Competitivo, §1.6)",
      present: isNumber(fcDelta),
      met: isNumber(fcDelta) && withinRange(fcDelta, fcRange),
    },
    {
      label: "HRV (+5% a +20% del baseline)",
      present: isNumber(hrvDelta),
      met: isNumber(hrvDelta) && hrvDelta >= 5 && hrvDelta <= 20,
    },
    {
      label: "Piernas (≥6, piso)",
      present: isNumber(subjective?.legFeeling),
      met: isNumber(subjective?.legFeeling) && subjective!.legFeeling! >= 6,
    },
    {
      // Piso INDIVIDUAL, a propósito distinto del promedio ponderado de
      // Capa 2 (getPerformanceDirection) -- evita que una técnica de 5/10
      // aislada se declare "listo" solo porque el resto del promedio la
      // compensa (caso sin resolver identificado en Preguntas
      // Estructurales §1, ahora cerrado para este veredicto específico).
      label: "Técnica (≥6, piso individual, no el promedio de Capa 2)",
      present: isNumber(subjective?.techniqueQuality),
      met: isNumber(subjective?.techniqueQuality) && subjective!.techniqueQuality! >= 6,
    },
  ];

  const missingMandatory = mandatory.filter((check) => !check.present).map((check) => check.label);
  if (missingMandatory.length > 0) {
    return { status: "not_evaluable", blockedBy: [], failedMandatory: [], missingMandatory, supportingConcerns: [] };
  }

  const failedMandatory = mandatory.filter((check) => !check.met).map((check) => check.label);
  if (failedMandatory.length > 0) {
    return { status: "not_ready", blockedBy: [], failedMandatory, missingMandatory: [], supportingConcerns: [] };
  }

  const supporting: CoherenceCheck[] = [
    {
      label: `Explosividad (≥${READINESS_SUPPORTING_THRESHOLD})`,
      present: isNumber(subjective?.explosiveness),
      met: isNumber(subjective?.explosiveness) && subjective!.explosiveness! >= READINESS_SUPPORTING_THRESHOLD,
    },
    {
      label: `Velocidad/reacción (≥${READINESS_SUPPORTING_THRESHOLD})`,
      present: isNumber(subjective?.speedReaction),
      met: isNumber(subjective?.speedReaction) && subjective!.speedReaction! >= READINESS_SUPPORTING_THRESHOLD,
    },
    {
      // El informe pide "confianza" como variable de apoyo, pero
      // SubjectiveMetrics (autoreporte del atleta) no tiene ese campo --
      // solo CoachMetrics.confidence existe en el modelo. Se usa esa fuente
      // explícitamente en vez de inventar un campo nuevo de atleta.
      label: `Confianza (≥${READINESS_SUPPORTING_THRESHOLD}, reportada por el entrenador — no existe autoreporte del atleta en el modelo)`,
      present: isNumber(coach?.confidence),
      met: isNumber(coach?.confidence) && coach!.confidence! >= READINESS_SUPPORTING_THRESHOLD,
    },
    {
      label: `Motivación (≥${READINESS_SUPPORTING_THRESHOLD})`,
      present: isNumber(subjective?.motivation),
      met: isNumber(subjective?.motivation) && subjective!.motivation! >= READINESS_SUPPORTING_THRESHOLD,
    },
  ];

  const supportingConcerns = supporting
    .filter((check) => !check.present || !check.met)
    .map((check) => check.label);

  return { status: "ready", blockedBy: [], failedMandatory: [], missingMandatory: [], supportingConcerns };
}

// Bug A (informe de decisiones 2026-07-20): antes usaba umbrales fijos
// (fcDelta>18, hrvDelta<-30) que contradecían la tolerancia por microciclo
// ya definida en Capa 1 -- un FC +19% en Carga (centro exacto de la fatiga
// funcional buscada, Motor ATR §1.2) se marcaba "Fatiga excesiva" solo
// porque 19>18, aunque classifyAgainstRange ya lo consideraba
// "dentro_de_rango" con la tolerancia de ±3%. Ahora usa los mismos
// getFcTargetRange/getHrvTargetRange + tolerancia que el resto del motor:
// solo es "excesivo" lo que Capa 1 ya clasificaría como "por_encima" en el
// eje de fatiga, nunca un número inventado aparte.
//
// Restringido a Carga/Impacto a propósito (igual que el FC ya lo estaba
// antes del fix): son los dos microciclos donde "fatiga funcional vs.
// excesiva" es la distinción central del proyecto (§9/§10) y donde el rango
// esperado es ancho por diseño. Generalizar este short-circuit a los demás
// microciclos (bandas mucho más angostas, ej. Activación 0%-+5%) rompía
// casos que el resto del motor ya resuelve bien: cualquier HRV "por_debajo"
// en Activación pasaba a "Fatiga excesiva" de inmediato, saltándose Capa 3
// y Nivel 2 (que es quien debe decidir "Preparación insuficiente" ahí,
// según §5.2 Recuperación→Activación) — se detectó como regresión al correr
// los tests existentes, no estaba en el informe de decisiones.
function isExcessiveFatigue(
  microcycle: MicrocycleType,
  fcDelta?: number,
  hrvDelta?: number,
  subjective?: SubjectiveMetrics
): boolean {
  const isLoadMicrocycle = microcycle === "Carga" || microcycle === "Impacto";
  const fcExcessive =
    isLoadMicrocycle && classifyAgainstRange(fcDelta, getFcTargetRange(microcycle)) === "por_encima";
  const hrvExcessive =
    isLoadMicrocycle &&
    toFatigueAxis(classifyAgainstRange(hrvDelta, getHrvTargetRange(microcycle)), true) === "por_encima";

  return (
    fcExcessive ||
    hrvExcessive ||
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

interface StateResolution {
  state: ATRState;
  // Bug D: mensajes de confianza/datos faltantes que no encajan en el
  // switch normal (ej. "Supercompensación no evaluable"). Se fusionan con
  // el array de alertas general en evaluateATR.
  extraAlerts: string[];
}

function mapDissonanceToState(
  microcycle: MicrocycleType,
  dissonanceLabel: string | undefined,
  fcDelta?: number,
  hrvDelta?: number,
  borg?: number,
  subjective?: SubjectiveMetrics
): StateResolution {
  const borgRange = getBorgExpectedRange(microcycle);
  const borgOk = withinRange(borg, borgRange);

  if (microcycle === "Competitivo" && dissonanceLabel === "Mas fresco de lo esperado") {
    const supercompensation = evaluateSupercompensation(fcDelta, hrvDelta, borg, subjective);
    switch (supercompensation.status) {
      case "coherent":
        return {
          state: "Supercompensacion",
          extraAlerts:
            supercompensation.missingSupporting.length > 0
              ? [
                  `Supercompensación con confianza parcial — faltan o no llegan al óptimo: ${supercompensation.missingSupporting.join(", ")}. El análisis sería más completo con esos datos.`,
                ]
              : [],
        };
      case "not_evaluable":
        return {
          state: "Recuperacion adecuada",
          extraAlerts: [
            `No evaluable como Supercompensación por falta de dato clave: ${supercompensation.missingMandatory.join(", ")}.`,
          ],
        };
      case "not_coherent":
        return { state: "Recuperacion adecuada", extraAlerts: [] };
    }
  }

  if (isExcessiveFatigue(microcycle, fcDelta, hrvDelta, subjective)) {
    return { state: "Fatiga excesiva", extraAlerts: [] };
  }

  switch (dissonanceLabel) {
    case "Fatiga confirmada":
    case "Alerta silenciosa": {
      const fcRange = getFcTargetRange(microcycle);
      const hrvRange = getHrvTargetRange(microcycle);
      const withinFunctionalBand =
        withinRange(fcDelta, fcRange) && withinRange(hrvDelta, hrvRange) && borgOk;
      return { state: withinFunctionalBand ? "Fatiga funcional" : "Fatiga excesiva", extraAlerts: [] };
    }
    case "Estimulo insuficiente":
      return { state: "Preparacion insuficiente", extraAlerts: [] };
    case "Alerta subjetiva temprana":
    case "Disonancia inversa":
      return { state: "Fatiga funcional", extraAlerts: [] };
    case "Dentro de lo esperado":
      // En Carga/Impacto, "dentro del rango esperado" ES la zona de fatiga
      // funcional por diseño (Motor ATR §1.2/§1.3) — no es un estado neutro
      // como en el resto de microciclos.
      return {
        state:
          microcycle === "Carga" || microcycle === "Impacto"
            ? "Fatiga funcional"
            : "Recuperacion adecuada",
        extraAlerts: [],
      };
    case "Mas fresco de lo esperado":
      return { state: "Recuperacion adecuada", extraAlerts: [] };
    default:
      return { state: "Pendiente de evaluacion", extraAlerts: [] };
  }
}

// ---------------------------------------------------------------------------
// Índice de Confianza del Análisis (CLAUDE.md §5 -- propuesta ya aprobada
// para avanzar sin bloquear; esta es una implementación provisional
// razonable de "según variables disponibles", los umbrales exactos de
// completitud NO están confirmados por el entrenador).
// ---------------------------------------------------------------------------

function computeConfidenceLevel(
  baseline: HealthBaseline,
  health: HealthSnapshot,
  subjective: SubjectiveMetrics,
  borg: number | undefined
): ConfidenceLevel {
  const hasBaseline = isNumber(baseline.restingHeartRate) && isNumber(baseline.hrv);
  const hasTodayReading = isNumber(health.restingHeartRate) || isNumber(health.hrv);

  if (!hasBaseline || !hasTodayReading) {
    return "Baja";
  }

  const subjectiveFieldsPresent = Object.values(subjective).filter(isNumber).length;
  const hasBorg = isNumber(borg);

  if (isNumber(health.restingHeartRate) && isNumber(health.hrv) && subjectiveFieldsPresent >= 6 && hasBorg) {
    return "Alta";
  }

  return "Media";
}

// ---------------------------------------------------------------------------
// Comentario libre del atleta -- disonancia texto-vs-número (informe de
// decisiones 2026-07-21). Detección simple por palabras clave, nunca
// análisis de sentimiento complejo (a propósito, para mantener el mecanismo
// trazable). El comentario NUNCA alimenta el motor determinístico más allá
// de esta alerta -- no mueve `state`, igual que la divergencia FC/HRV.
// ---------------------------------------------------------------------------

const PAIN_KEYWORDS = ["dolor", "duele", "molestia", "lesion", "lesión", "incomod"];
const PAIN_SIGNAL_THRESHOLD = 5; // por debajo de esto, el valor numérico se considera "bajo"

function detectFreeTextDissonance(
  athleteNotes: string | undefined,
  subjective: SubjectiveMetrics
): string | undefined {
  if (!athleteNotes) return undefined;
  const normalized = athleteNotes.toLowerCase();
  const mentionsPain = PAIN_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (!mentionsPain) return undefined;

  const musclePainLow = !isNumber(subjective.musclePain) || subjective.musclePain < PAIN_SIGNAL_THRESHOLD;
  const discomfortLow = !isNumber(subjective.discomfort) || subjective.discomfort < PAIN_SIGNAL_THRESHOLD;

  if (musclePainLow && discomfortLow) {
    return "Disonancia texto-vs-número: el comentario del atleta menciona dolor/molestia, pero los valores numéricos reportados son bajos. Revisar con el atleta.";
  }
  return undefined;
}

export function evaluateATR(input: ATRInput): ATRInterpretation {
  const { microcycle, baseline, health, subjective, training, history, coach } = input;

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

  const freeTextDissonance = detectFreeTextDissonance(subjective.athleteNotes, subjective);
  if (freeTextDissonance) {
    alerts.push(freeTextDissonance);
  }

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

  const stateResolution = mapDissonanceToState(
    microcycle,
    dissonanceLabel,
    fcDelta,
    hrvDelta,
    borg,
    subjective
  );
  let state = stateResolution.state;
  alerts.push(...stateResolution.extraAlerts);

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

  // Capa 4 — Entrenador (Motor ATR §6). Bug C: la técnica OBSERVADA por el
  // entrenador (a diferencia de la autoreportada, ver Capa 2 arriba) puede
  // reforzar/disparar una bandera de disonancia -- no tiene veto pleno
  // (§6, nota: sin escala numérica estandarizada todavía), así que solo
  // escala Fatiga funcional -> Fatiga excesiva, nunca degrada un estado ya
  // peor ni mejora uno ya mejor. El rol general de "anular vs. matizar" del
  // entrenador (§14.3) sigue sin resolver — esto cubre solo el caso
  // específico de técnica que el informe de decisiones 2026-07-20 resolvió.
  if (isNumber(coach?.technique) && coach.technique <= 2) {
    alerts.push("El entrenador reporta técnica muy deteriorada (observación directa, Capa 4).");
    if (state === "Fatiga funcional") {
      state = "Fatiga excesiva";
    }
  }

  const level3 = history ? evaluateLevel3(history) : undefined;

  // "Listo para competir" (informe de decisiones 2026-07-21) -- solo se
  // evalúa en Competitivo, mismo gate que Supercompensación. Visibilidad
  // exclusiva del entrenador: se calcula siempre aquí (motor determinístico,
  // sin condicionar a quién lo va a ver), la restricción de a quién se le
  // MUESTRA es responsabilidad de la UI (ver home.tsx).
  const competitionReadiness =
    microcycle === "Competitivo"
      ? evaluateCompetitionReadiness(fcDelta, hrvDelta, subjective, coach)
      : undefined;

  const confidenceLevel = computeConfidenceLevel(baseline, health, subjective, borg);

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

  // Métrica nueva — Recuperación Autonómica Post-Entreno (informe de
  // decisiones 2026-07-20). Nivel 1 es solo observación (nunca toca
  // `state`); Nivel 2 solo agrega una alerta temprana si hay deterioro
  // progresivo dentro del bloque actual, tampoco cambia `state`.
  const postWorkoutObservation = observePostWorkoutRecovery({ health }, baseline);
  const postWorkoutTrend = history
    ? evaluatePostWorkoutTrend(microcycle, history, baseline)
    : undefined;
  if (postWorkoutTrend?.evaluated && postWorkoutTrend.deteriorating) {
    alerts.push(postWorkoutTrend.note);
  }

  // Índice de Riesgo de Lesión (informe de decisiones 2026-07-21, resuelve
  // Motor ATR §11.2). No es un 6to estado (§11.6) -- acompaña a cualquiera
  // de los 5 estados oficiales, nunca los reemplaza. "Bajo" es solo
  // observación sin alerta visible (regla explícita del informe); Moderado/
  // Alto/Crítico sí generan una alerta visible.
  const injuryRisk = evaluateInjuryRisk(microcycle, health, subjective, baseline, history ?? []);
  if (injuryRisk.level && injuryRisk.level !== "Bajo" && injuryRisk.message) {
    alerts.push(`Riesgo de lesión (${injuryRisk.level}): ${injuryRisk.message}`);
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
    postWorkoutObservation,
    postWorkoutTrend,
    competitionReadiness,
    confidenceLevel,
    injuryRisk,
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
