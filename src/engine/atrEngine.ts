import type { ATRInput, ATRInterpretation, ATRState, MicrocycleType } from "../model/athletedata/atr";
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

function getExpectedStateHint(
  microcycle: MicrocycleType,
  fcDelta?: number,
  hrvDelta?: number,
  borg?: number
): ATRState | null {
  const fcRange = getFcTargetRange(microcycle);
  const hrvRange = getHrvTargetRange(microcycle);
  const borgRange = getBorgExpectedRange(microcycle);

  const fcOk = withinRange(fcDelta, fcRange);
  const hrvOk = withinRange(hrvDelta, hrvRange);
  const borgOk = withinRange(borg, borgRange);

  if (microcycle === "Competitivo") {
    if (fcOk && hrvOk && borgOk) return "Supercompensado";
  }

  if (
    (microcycle === "Carga" || microcycle === "Impacto") &&
    isNumber(fcDelta) &&
    isNumber(hrvDelta) &&
    fcDelta < fcRange.min! &&
    hrvDelta > -10
  ) {
    return "Estimulacion insuficiente";
  }

  if (
    (microcycle === "Carga" || microcycle === "Impacto") &&
    isNumber(fcDelta) &&
    isNumber(hrvDelta) &&
    fcDelta <= fcRange.max! &&
    fcDelta >= fcRange.min! &&
    hrvDelta <= hrvRange.max! &&
    hrvDelta >= hrvRange.min! &&
    borgOk
  ) {
    return "Fatiga funcional";
  }

  if (
    (microcycle === "Recuperacion" || microcycle === "Activacion") &&
    isNumber(fcDelta) &&
    isNumber(hrvDelta) &&
    fcDelta <= 5 &&
    hrvDelta >= 0 &&
    borgOk
  ) {
    return "Mas fresco de lo esperado";
  }

  return null;
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
  const hrvRange = getHrvTargetRange(microcycle);
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

export function evaluateATR(input: ATRInput): ATRInterpretation {
  const { microcycle, baseline, health, subjective, training } = input;

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
    training.internalLoad ??
    calculateInternalLoad(training.borgCR10, training.durationMinutes);

  const alerts = buildMicrocycleAlerts(
    microcycle,
    fcDelta,
    hrvDelta,
    sleepHours,
    borg,
    subjective
  );

  const expectedHint = getExpectedStateHint(microcycle, fcDelta, hrvDelta, borg);
  const performance = getPerformanceDirection(microcycle, subjective);

  const fcTarget = getFcTargetRange(microcycle);
  const hrvTarget = getHrvTargetRange(microcycle);
  const borgTarget = getBorgExpectedRange(microcycle);

  const fcOk = withinRange(fcDelta, fcTarget);
  const hrvOk = withinRange(hrvDelta, hrvTarget);
  const borgOk = withinRange(borg, borgTarget);

  let state: ATRState = "Dentro de lo esperado";

  if (expectedHint === "Supercompensado") {
    state = "Supercompensado";
  } else if (expectedHint === "Estimulacion insuficiente") {
    state = "Estimulacion insuficiente";
  } else if (expectedHint === "Mas fresco de lo esperado") {
    state = "Mas fresco de lo esperado";
  } else if (expectedHint === "Fatiga funcional") {
    state = "Fatiga funcional";
  } else if (
    (isNumber(fcDelta) && fcDelta > 18 && (microcycle === "Carga" || microcycle === "Impacto")) ||
    (isNumber(hrvDelta) && hrvDelta < -30) ||
    (isNumber(subjective.discomfort) && subjective.discomfort >= 8) ||
    (isNumber(subjective.musclePain) && subjective.musclePain >= 8) ||
    (isNumber(subjective.fatigue) && subjective.fatigue >= 8)
  ) {
    state = "Fatiga excesiva";
  } else if (
    (microcycle === "Carga" || microcycle === "Impacto") &&
    ((isNumber(fcDelta) && fcDelta < 10) || (isNumber(hrvDelta) && hrvDelta > -10))
  ) {
    state = "Estimulacion insuficiente";
  } else if (
    (microcycle === "Recuperacion" || microcycle === "Activacion") &&
    ((isNumber(fcDelta) && fcDelta > 8) || (isNumber(hrvDelta) && hrvDelta < 0))
  ) {
    state = "Fatiga funcional";
  }

  let message = "";

  switch (state) {
    case "Supercompensado":
      message =
        "El atleta muestra un perfil muy favorable para competir: FC baja, HRV alta y sensaciones positivas.";
      break;
    case "Mas fresco de lo esperado":
      message =
        "El atleta parece demasiado fresco para la fase actual; el estímulo podría estar quedando corto.";
      break;
    case "Fatiga funcional":
      message =
        "La fatiga parece coherente con la fase actual y puede estar cumpliendo su función adaptativa.";
      break;
    case "Fatiga excesiva":
      message =
        "Hay señales de sobrecarga o recuperación insuficiente; conviene ajustar la carga.";
      break;
    case "Estimulacion insuficiente":
      message =
        "La respuesta actual sugiere que el estímulo no está alcanzando el nivel esperado para este microciclo.";
      break;
    case "Dentro de lo esperado":
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

  if (performance.declining && (microcycle === "Recuperacion" || microcycle === "Activacion" || microcycle === "Competitivo")) {
    alerts.push("El rendimiento específico no está mejorando como se espera en esta fase.");
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