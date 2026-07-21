import { describeExpectedVsActual, describeVsPreviousDay, evaluateATR } from "./atrEngine";
import type { MicrocycleType } from "../model/athletedata/atr";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import type { HealthBaseline , HealthSnapshot } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import type { TrainingLoad } from "../model/athletedata/training";

const baseline: HealthBaseline = { restingHeartRate: 50, hrv: 100 };

/** Aplica un delta porcentual a un valor base (ej. pct(50, 10) === 55). */
function pct(base: number, deltaPercent: number): number {
  return base * (1 + deltaPercent / 100);
}

function mkRecord(
  date: string,
  microcycle: MicrocycleType,
  overrides: {
    health?: HealthSnapshot;
    subjective?: SubjectiveMetrics;
    training?: TrainingLoad;
  } = {}
): DailyRecord {
  return {
    date,
    athleteId: "athlete-1",
    microcycle,
    health: overrides.health ?? {},
    subjective: overrides.subjective ?? {},
    training: overrides.training ?? {},
    savedAt: `${date}T00:00:00.000Z`,
  };
}

const MICROCYCLE_SEQUENCE: MicrocycleType[] = [
  "Ajuste",
  "Carga",
  "Impacto",
  "Recuperacion",
  "Activacion",
  "Competitivo",
];

/** Un macrociclo completo (6 bloques en orden), un día por microciclo. */
function buildCompleteMacrocycle(cycleIndex: number): DailyRecord[] {
  return MICROCYCLE_SEQUENCE.map((microcycle, i) =>
    mkRecord(`2026-${String(cycleIndex).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`, microcycle)
  );
}

describe("Capa 1 — resolución fisiológica FC vs HRV", () => {
  test("FC y HRV coherentes en más fatiga de lo esperado no deben marcar divergencia (regresión)", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 20), hrv: pct(100, -20) },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });

    expect(result.physiological?.fcStatus).toBe("por_encima");
    expect(result.physiological?.hrvStatus).toBe("por_encima");
    expect(result.physiological?.divergenceFcHrv).toBe(false);
  });

  test("FC y HRV coherentes en más fresco de lo esperado no deben marcar divergencia (regresión)", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 1), hrv: pct(100, -1) },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });

    expect(result.physiological?.fcStatus).toBe("por_debajo");
    expect(result.physiological?.hrvStatus).toBe("por_debajo");
    expect(result.physiological?.divergenceFcHrv).toBe(false);
  });

  test("divergencia real: FC dice fatiga y HRV dice fresco — FC manda la decisión", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 25), hrv: pct(100, 0) },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });

    expect(result.physiological?.fcStatus).toBe("por_encima");
    expect(result.physiological?.hrvStatus).toBe("por_debajo");
    expect(result.physiological?.divergenceFcHrv).toBe(true);
    expect(result.physiological?.status).toBe("por_encima");
    expect(result.alerts.some((a) => a.includes("Divergencia FC/HRV"))).toBe(true);
  });

  test("sin datos de FC/HRV no hay conflicto que resolver", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: {},
      subjective: { legFeeling: 5 },
      training: {},
    });

    expect(result.physiological?.fcStatus).toBeUndefined();
    expect(result.physiological?.hrvStatus).toBeUndefined();
    expect(result.physiological?.divergenceFcHrv).toBe(false);
  });
});

describe("Capa 2 — estado subjetivo", () => {
  const perfectPerformance: SubjectiveMetrics = {
    overallPerformance: 9,
    techniqueQuality: 9,
    speedReaction: 9,
    explosiveness: 9,
    strikingPower: 9,
    easeOfExit: 9,
    legFeeling: 9,
  };

  test("dolor >=8 domina el estado subjetivo aunque el resto sea excelente", () => {
    const result = evaluateATR({
      microcycle: "Recuperacion",
      baseline,
      health: {},
      subjective: { ...perfectPerformance, musclePain: 9 },
      training: {},
    });

    expect(result.subjectiveStatus).toBe("peor_de_lo_esperado");
  });

  test("fatiga >=8 domina el estado subjetivo aunque el resto sea excelente", () => {
    const result = evaluateATR({
      microcycle: "Recuperacion",
      baseline,
      health: {},
      subjective: { ...perfectPerformance, fatigue: 8 },
      training: {},
    });

    expect(result.subjectiveStatus).toBe("peor_de_lo_esperado");
  });

  test("promedio de rendimiento bajo en Carga marca peor_de_lo_esperado", () => {
    const low: SubjectiveMetrics = {
      overallPerformance: 3,
      techniqueQuality: 3,
      speedReaction: 3,
      explosiveness: 3,
      strikingPower: 3,
      easeOfExit: 3,
      legFeeling: 3,
    };
    const result = evaluateATR({ microcycle: "Carga", baseline, health: {}, subjective: low, training: {} });
    expect(result.subjectiveStatus).toBe("peor_de_lo_esperado");
  });

  test("promedio de rendimiento alto en Recuperación marca mejor_de_lo_esperado", () => {
    const result = evaluateATR({
      microcycle: "Recuperacion",
      baseline,
      health: {},
      subjective: perfectPerformance,
      training: {},
    });
    expect(result.subjectiveStatus).toBe("mejor_de_lo_esperado");
  });

  test("sin datos subjetivos el estado queda sin definir, no se inventa", () => {
    const result = evaluateATR({ microcycle: "Ajuste", baseline, health: {}, subjective: {}, training: {} });
    expect(result.subjectiveStatus).toBeUndefined();
    expect(result.dissonanceLabel).toBeUndefined();
    expect(result.state).toBe("Pendiente de evaluacion");
  });
});

describe("Capa 3 + Nivel 1 — estados finales por microciclo", () => {
  test("Ajuste dentro de rango con subjetivo coherente -> Recuperación adecuada", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: { legFeeling: 5, overallPerformance: 5 },
      training: { borgCR10: 3 },
    });
    expect(result.dissonanceLabel).toBe("Dentro de lo esperado");
    expect(result.state).toBe("Recuperacion adecuada");
  });

  test("Carga dentro del rango esperado con subjetivo coherente -> Fatiga funcional (no 'adecuada')", () => {
    // Dentro del rango de Carga YA ES la zona de fatiga funcional por diseño
    // (Motor ATR §1.2) — regresión del bug encontrado antes de escribir tests.
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: {
        overallPerformance: 5,
        techniqueQuality: 5,
        speedReaction: 5,
        explosiveness: 5,
        strikingPower: 5,
        easeOfExit: 5,
        legFeeling: 5,
      },
      training: { borgCR10: 6 },
    });
    expect(result.dissonanceLabel).toBe("Dentro de lo esperado");
    expect(result.state).toBe("Fatiga funcional");
  });

  test("Bug C: técnica autoreportada muy baja pesa menos que el resto en Capa 2 (no arrastra sola el promedio)", () => {
    // Con peso igual (comportamiento viejo) este promedio habría dado
    // exactamente 4.0 -> "declining" -> peor_de_lo_esperado. Con el peso
    // reducido de técnica (0.5) el promedio sube a ~4.23 -> ya no declina.
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: {
        overallPerformance: 4.5,
        speedReaction: 4.5,
        explosiveness: 4.5,
        strikingPower: 4.5,
        easeOfExit: 4.5,
        legFeeling: 4.5,
        techniqueQuality: 1,
      },
      training: { borgCR10: 6 },
    });
    expect(result.subjectiveStatus).not.toBe("peor_de_lo_esperado");
  });

  test("Bug C: técnica observada por el entrenador (muy baja) escala Fatiga funcional -> Fatiga excesiva", () => {
    const withoutCoach = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: {
        overallPerformance: 5,
        techniqueQuality: 5,
        speedReaction: 5,
        explosiveness: 5,
        strikingPower: 5,
        easeOfExit: 5,
        legFeeling: 5,
      },
      training: { borgCR10: 6 },
    });
    expect(withoutCoach.state).toBe("Fatiga funcional");

    const withCoach = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: {
        overallPerformance: 5,
        techniqueQuality: 5,
        speedReaction: 5,
        explosiveness: 5,
        strikingPower: 5,
        easeOfExit: 5,
        legFeeling: 5,
      },
      training: { borgCR10: 6 },
      coach: { technique: 1 },
    });
    expect(withCoach.state).toBe("Fatiga excesiva");
    expect(withCoach.alerts.some((a) => a.includes("entrenador reporta técnica"))).toBe(true);
  });

  test("Bug A: Carga con FC +19% (borde exacto de lo esperado) -> Fatiga funcional, NO excesiva", () => {
    // Regresión directa del bug: getFcTargetRange("Carga").max=19. Antes del
    // fix, isExcessiveFatigue usaba fcDelta>18 hardcoded y esto se marcaba
    // "Fatiga excesiva" aunque Capa 1 ya lo consideraba dentro de rango.
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 19), hrv: pct(100, -25) },
      subjective: {
        overallPerformance: 5,
        techniqueQuality: 5,
        speedReaction: 5,
        explosiveness: 5,
        strikingPower: 5,
        easeOfExit: 5,
        legFeeling: 5,
      },
      training: { borgCR10: 6 },
    });
    expect(result.state).toBe("Fatiga funcional");
  });

  test("Bug A: Carga con HRV -31% (dentro de la tolerancia, fuera del umbral fijo viejo) -> Fatiga funcional, NO excesiva", () => {
    // getHrvTargetRange("Carga")={-30,-20}, tolerancia ±3 -> hasta -33 sigue
    // "dentro_de_rango". El umbral viejo (hrvDelta<-30) marcaba esto excesivo.
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -31) },
      subjective: {
        overallPerformance: 5,
        techniqueQuality: 5,
        speedReaction: 5,
        explosiveness: 5,
        strikingPower: 5,
        easeOfExit: 5,
        legFeeling: 5,
      },
      training: { borgCR10: 6 },
    });
    expect(result.state).toBe("Fatiga funcional");
  });

  test("Carga con dolor extremo -> Fatiga excesiva sin importar el resto", () => {
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: { musclePain: 9, legFeeling: 5 },
      training: { borgCR10: 6 },
    });
    expect(result.state).toBe("Fatiga excesiva");
  });

  test("Carga con FC disparada (>18%) -> Fatiga excesiva", () => {
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 25), hrv: pct(100, -25) },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 6 },
    });
    expect(result.state).toBe("Fatiga excesiva");
  });

  test("Carga demasiado fresca (FC/HRV bajos + subjetivo mejor) -> Preparación insuficiente", () => {
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 2), hrv: pct(100, 0) },
      subjective: {
        overallPerformance: 9,
        techniqueQuality: 9,
        speedReaction: 9,
        explosiveness: 9,
        strikingPower: 9,
        easeOfExit: 9,
        legFeeling: 9,
      },
      training: { borgCR10: 2 },
    });
    expect(result.dissonanceLabel).toBe("Estimulo insuficiente");
    expect(result.state).toBe("Preparacion insuficiente");
  });

  test("Competitivo con coherencia total en las 4 obligatorias + 3 de apoyo -> Supercompensación", () => {
    // HRV +30% queda fuera del rango obligatorio +5%/+20% (Bug D) aunque
    // "suene" bien -- la regla es un rango, no solo un piso.
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: { restingHeartRate: pct(50, -12), hrv: pct(100, 15) },
      subjective: {
        explosiveness: 9,
        speedReaction: 9,
        legFeeling: 9,
        motivation: 8,
        overallPerformance: 9,
        techniqueQuality: 9,
        strikingPower: 9,
        easeOfExit: 9,
      },
      training: { borgCR10: 2 },
    });
    expect(result.state).toBe("Supercompensacion");
  });

  test("Competitivo con las 4 obligatorias fuera de rango -> NO alcanza Supercompensación", () => {
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: { restingHeartRate: pct(50, -12), hrv: pct(100, 30) }, // HRV +30% excede el 20% obligatorio
      subjective: {
        explosiveness: 9,
        speedReaction: 9,
        legFeeling: 9,
        motivation: 9,
        overallPerformance: 9,
        techniqueQuality: 9,
        strikingPower: 9,
        easeOfExit: 9,
      },
      training: { borgCR10: 2 },
    });
    expect(result.state).not.toBe("Supercompensacion");
  });

  test("Competitivo con las 4 obligatorias OK pero explosividad baja (de apoyo) -> SÍ alcanza Supercompensación, con advertencia", () => {
    // Bug D: las variables de apoyo (explosividad, velocidad/reacción,
    // motivación) ya no bloquean la declaración -- solo bajan la confianza
    // y deben quedar señaladas explícitamente en las alertas.
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: { restingHeartRate: pct(50, -12), hrv: pct(100, 15) },
      subjective: {
        explosiveness: 3, // por debajo del umbral de apoyo (>=8), ya no bloquea
        speedReaction: 9,
        legFeeling: 9,
        motivation: 9,
      },
      training: { borgCR10: 2 },
    });
    expect(result.state).toBe("Supercompensacion");
    expect(result.alerts.some((a) => a.includes("confianza parcial"))).toBe(true);
    expect(result.alerts.some((a) => a.includes("Explosividad"))).toBe(true);
  });

  test("Competitivo sin dato de Borg (obligatoria ausente) -> no evaluable, no 'Recuperación adecuada' silenciosa", () => {
    // Bug D: falta un dato OBLIGATORIO (no que esté mal, que directamente no
    // se reportó) debe señalarse explícitamente, no caer en silencio.
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: { restingHeartRate: pct(50, -12), hrv: pct(100, 15) },
      subjective: { explosiveness: 9, speedReaction: 9, legFeeling: 9, motivation: 9 },
      training: {}, // sin borgCR10
    });
    expect(result.state).toBe("Recuperacion adecuada");
    expect(result.alerts.some((a) => a.includes("No evaluable como Supercompensación"))).toBe(true);
    expect(result.alerts.some((a) => a.includes("Borg"))).toBe(true);
  });
});

describe('"Listo para competir" (informe de decisiones 2026-07-21)', () => {
  const readyHealth = { restingHeartRate: pct(50, -3), hrv: pct(100, 12) };

  test("las 4 obligatorias OK, sin bloqueadoras -> listo, sin advertencias si las de apoyo también están altas", () => {
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: readyHealth,
      subjective: { legFeeling: 8, techniqueQuality: 8, explosiveness: 8, speedReaction: 8, motivation: 8 },
      training: { borgCR10: 2 },
      coach: { confidence: 8 },
    });
    expect(result.competitionReadiness?.status).toBe("ready");
    expect(result.competitionReadiness?.supportingConcerns).toHaveLength(0);
  });

  test("obligatorias OK pero una de apoyo baja -> sigue listo, con la advertencia explícita", () => {
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: readyHealth,
      subjective: { legFeeling: 6, techniqueQuality: 6, explosiveness: 2, speedReaction: 8, motivation: 8 },
      training: { borgCR10: 2 },
      coach: { confidence: 8 },
    });
    expect(result.competitionReadiness?.status).toBe("ready");
    expect(result.competitionReadiness?.supportingConcerns.some((c) => c.includes("Explosividad"))).toBe(true);
  });

  test("técnica en 5 (piso individual, aunque el promedio de Capa 2 esté bien) -> NO listo", () => {
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: readyHealth,
      subjective: {
        legFeeling: 9,
        techniqueQuality: 5, // por debajo del piso de 6, aunque el resto compense el promedio
        explosiveness: 9,
        speedReaction: 9,
        overallPerformance: 9,
        strikingPower: 9,
        easeOfExit: 9,
        motivation: 8,
      },
      training: { borgCR10: 2 },
      coach: { confidence: 8 },
    });
    expect(result.competitionReadiness?.status).toBe("not_ready");
    expect(result.competitionReadiness?.failedMandatory.some((f) => f.includes("Técnica"))).toBe(true);
  });

  test("dolor ≥8 bloquea el veredicto aunque todo lo demás esté perfecto", () => {
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: readyHealth,
      subjective: {
        legFeeling: 9,
        techniqueQuality: 9,
        explosiveness: 9,
        speedReaction: 9,
        motivation: 9,
        musclePain: 8,
      },
      training: { borgCR10: 2 },
      coach: { confidence: 9 },
    });
    expect(result.competitionReadiness?.status).toBe("not_ready");
    expect(result.competitionReadiness?.blockedBy.some((b) => b.includes("Dolor"))).toBe(true);
  });

  test("falta un dato obligatorio (piernas) -> no evaluable, no 'no listo' silencioso", () => {
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: readyHealth,
      subjective: { techniqueQuality: 8, explosiveness: 8, speedReaction: 8, motivation: 8 },
      training: { borgCR10: 2 },
      coach: { confidence: 8 },
    });
    expect(result.competitionReadiness?.status).toBe("not_evaluable");
    expect(result.competitionReadiness?.missingMandatory.some((m) => m.includes("Piernas"))).toBe(true);
  });

  test("fuera de Competitivo -> no se evalúa (undefined)", () => {
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: { legFeeling: 8, techniqueQuality: 8 },
      training: { borgCR10: 6 },
    });
    expect(result.competitionReadiness).toBeUndefined();
  });
});

describe("Índice de Confianza del Análisis", () => {
  test("sin baseline -> Baja", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline: {},
      health: { restingHeartRate: 55, hrv: 90 },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });
    expect(result.confidenceLevel).toBe("Baja");
  });

  test("baseline + lectura de hoy + subjetivo casi completo + borg -> Alta", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: {
        fatigue: 5,
        musclePain: 2,
        stress: 3,
        motivation: 7,
        discomfort: 1,
        overallPerformance: 6,
      },
      training: { borgCR10: 3 },
    });
    expect(result.confidenceLevel).toBe("Alta");
  });

  test("baseline + solo HRV de hoy (sin FC) y poco subjetivo -> Media", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { hrv: pct(100, -7) },
      subjective: { legFeeling: 5 },
      training: {},
    });
    expect(result.confidenceLevel).toBe("Media");
  });
});

describe("Disonancia texto-vs-número (comentario libre del atleta)", () => {
  test("comentario menciona dolor pero el valor numérico es bajo -> alerta de disonancia", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: { legFeeling: 5, musclePain: 2, athleteNotes: "me duele un poco la rodilla" },
      training: { borgCR10: 3 },
    });
    expect(result.alerts.some((a) => a.includes("Disonancia texto-vs-número"))).toBe(true);
  });

  test("comentario menciona dolor y el valor numérico también es alto -> sin disonancia (coinciden)", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: { legFeeling: 5, musclePain: 8, athleteNotes: "me duele bastante la rodilla" },
      training: { borgCR10: 3 },
    });
    expect(result.alerts.some((a) => a.includes("Disonancia texto-vs-número"))).toBe(false);
  });

  test("comentario sin palabras clave -> sin disonancia", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: { legFeeling: 5, musclePain: 1, athleteNotes: "me sentí bien hoy" },
      training: { borgCR10: 3 },
    });
    expect(result.alerts.some((a) => a.includes("Disonancia texto-vs-número"))).toBe(false);
  });
});

describe("Nivel 2 — comparación con el microciclo anterior", () => {
  test("Ajuste -> Carga sin cambio real: no evaluado como esperado", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Ajuste", {
        health: { restingHeartRate: 50, hrv: 100 },
        subjective: { legFeeling: 5 },
        training: { borgCR10: 3 },
      }),
      mkRecord("2026-01-08", "Carga", {
        health: { restingHeartRate: 50, hrv: 100 },
        subjective: { legFeeling: 5 },
        training: { borgCR10: 3 },
      }),
    ];

    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: 50, hrv: 100 },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
      history,
    });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.transition).toBe("Ajuste -> Carga");
    expect(result.level2?.occurredAsExpected).toBe(false);
  });

  test("Ajuste -> Carga con la respuesta esperada: evaluado como correcto", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Ajuste", {
        health: { restingHeartRate: 50, hrv: 100 },
        subjective: { legFeeling: 7 },
        training: { borgCR10: 3 },
      }),
      mkRecord("2026-01-08", "Carga", {
        health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
        subjective: { legFeeling: 3 },
        training: { borgCR10: 6 },
      }),
    ];

    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: { legFeeling: 3 },
      training: { borgCR10: 6 },
      history,
    });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(true);
  });

  test("Carga -> Impacto con señales de colapso: Fatiga excesiva por Nivel 2", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Carga", {
        health: { restingHeartRate: 58, hrv: 80 },
        subjective: { techniqueQuality: 5 },
        training: { borgCR10: 6 },
      }),
      mkRecord("2026-01-08", "Impacto", {
        health: { restingHeartRate: 65, hrv: 65 },
        subjective: { techniqueQuality: 2 },
        training: { borgCR10: 8 },
      }),
    ];

    const result = evaluateATR({
      microcycle: "Impacto",
      baseline,
      health: { restingHeartRate: 65, hrv: 65 },
      subjective: { techniqueQuality: 2 },
      training: { borgCR10: 8 },
      history,
    });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(false);
    expect(result.state).toBe("Fatiga excesiva");
  });

  test("Carga -> Impacto sin señales de colapso: evaluado como correcto", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Carga", {
        health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
        subjective: { techniqueQuality: 6 },
        training: { borgCR10: 6 },
      }),
      mkRecord("2026-01-08", "Impacto", {
        health: { restingHeartRate: pct(50, 14), hrv: pct(100, -25) },
        subjective: { techniqueQuality: 6 },
        training: { borgCR10: 6 },
      }),
    ];

    const result = evaluateATR({
      microcycle: "Impacto",
      baseline,
      health: { restingHeartRate: pct(50, 14), hrv: pct(100, -25) },
      subjective: { techniqueQuality: 6 },
      training: { borgCR10: 6 },
      history,
    });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(true);
  });

  test("Impacto -> Recuperación sin mejora: Preparación insuficiente", () => {
    // Valores moderados a propósito: si el día actual ya calificara como
    // "Fatiga excesiva" por sí solo (Nivel 1), el override de Nivel 2 no
    // aplicaría (ver evaluateATR: nunca degrada un estado ya más severo).
    // Aquí solo Nivel 2 debe ser responsable del "Preparacion insuficiente".
    const flat = {
      health: { restingHeartRate: pct(50, 4), hrv: pct(100, -2) },
      subjective: { explosiveness: 4, speedReaction: 4, legFeeling: 4, motivation: 4 },
      training: { borgCR10: 3 },
    };
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Impacto", flat),
      mkRecord("2026-01-08", "Recuperacion", flat),
    ];

    const result = evaluateATR({
      microcycle: "Recuperacion",
      baseline,
      ...flat,
      history,
    });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(false);
    expect(result.state).toBe("Preparacion insuficiente");
  });

  test("Impacto -> Recuperación con mejora real: evaluado como correcto", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Impacto", {
        health: { restingHeartRate: pct(50, 13), hrv: pct(100, -25) },
        subjective: { explosiveness: 4, speedReaction: 4, legFeeling: 4, motivation: 4 },
        training: { borgCR10: 5 },
      }),
      mkRecord("2026-01-08", "Recuperacion", {
        health: { restingHeartRate: pct(50, 7), hrv: pct(100, -5) },
        subjective: { explosiveness: 7, speedReaction: 7, legFeeling: 7, motivation: 7 },
        training: { borgCR10: 3 },
      }),
    ];

    const result = evaluateATR({
      microcycle: "Recuperacion",
      baseline,
      health: { restingHeartRate: pct(50, 7), hrv: pct(100, -5) },
      subjective: { explosiveness: 7, speedReaction: 7, legFeeling: 7, motivation: 7 },
      training: { borgCR10: 3 },
      history,
    });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(true);
  });

  test("Recuperación -> Activación sin mejora: Preparación insuficiente", () => {
    const flat = {
      health: { restingHeartRate: pct(50, 7), hrv: pct(100, -5) },
      subjective: { legFeeling: 5, speedReaction: 5, techniqueQuality: 5, overallPerformance: 5 },
      training: { borgCR10: 3 },
    };
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Recuperacion", flat),
      mkRecord("2026-01-08", "Activacion", flat),
    ];

    const result = evaluateATR({ microcycle: "Activacion", baseline, ...flat, history });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(false);
    expect(result.state).toBe("Preparacion insuficiente");
  });

  test("Activación -> Competitivo sin señales de pico: no se alcanza el estado esperado", () => {
    const flat = {
      health: { restingHeartRate: pct(50, 3), hrv: pct(100, 3) },
      subjective: { explosiveness: 5, speedReaction: 5 },
      training: { borgCR10: 3 },
    };
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Activacion", flat),
      mkRecord("2026-01-08", "Competitivo", flat),
    ];

    const result = evaluateATR({ microcycle: "Competitivo", baseline, ...flat, history });

    expect(result.level2?.evaluated).toBe(true);
    expect(result.level2?.occurredAsExpected).toBe(false);
    expect(result.state).not.toBe("Supercompensacion");
  });

  test("sin bloque anterior en el historial: Nivel 2 no se evalúa", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Ajuste", { health: { restingHeartRate: 50, hrv: 100 } }),
    ];

    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: 50, hrv: 100 },
      subjective: {},
      training: {},
      history,
    });

    expect(result.level2?.evaluated).toBe(false);
  });

  test("bloque anterior no es el predecesor esperado (salto de microciclo): no se fuerza una regla", () => {
    const history: DailyRecord[] = [
      mkRecord("2026-01-01", "Ajuste", { health: { restingHeartRate: 50, hrv: 100 } }),
      mkRecord("2026-01-08", "Impacto", { health: { restingHeartRate: 60, hrv: 75 } }),
    ];

    const result = evaluateATR({
      microcycle: "Impacto",
      baseline,
      health: { restingHeartRate: 60, hrv: 75 },
      subjective: {},
      training: {},
      history,
    });

    expect(result.level2?.evaluated).toBe(false);
    expect(result.level2?.note).toContain("Ajuste");
  });

  test("historial vacío: Nivel 2 no se evalúa", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: {},
      subjective: {},
      training: {},
      history: [],
    });

    expect(result.level2?.evaluated).toBe(false);
  });
});

describe("Nivel 3 — gate honesto de historial insuficiente", () => {
  test("sin historial no se evalúa Nivel 3 en absoluto", () => {
    const result = evaluateATR({ microcycle: "Ajuste", baseline, health: {}, subjective: {}, training: {} });
    expect(result.level3).toBeUndefined();
  });

  test("0 macrociclos completos: evaluated false y lo dice explícitamente", () => {
    const history = [mkRecord("2026-01-01", "Ajuste"), mkRecord("2026-01-08", "Carga")];
    const result = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: {},
      subjective: {},
      training: {},
      history,
    });

    expect(result.level3?.evaluated).toBe(false);
    expect(result.level3?.completedMacrocycles).toBe(0);
    expect(result.level3?.note).toContain("0");
  });

  test("1 macrociclo completo: sigue sin evaluarse, pero cuenta bien", () => {
    const history = buildCompleteMacrocycle(1);
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: {},
      subjective: {},
      training: {},
      history,
    });

    expect(result.level3?.evaluated).toBe(false);
    expect(result.level3?.completedMacrocycles).toBe(1);
  });

  test("2 macrociclos completos: cantidad suficiente, pero el motor de patrones sigue sin implementar", () => {
    const history = [...buildCompleteMacrocycle(1), ...buildCompleteMacrocycle(2)];
    const result = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: {},
      subjective: {},
      training: {},
      history,
    });

    expect(result.level3?.evaluated).toBe(false);
    expect(result.level3?.completedMacrocycles).toBe(2);
    expect(result.level3?.note.toLowerCase()).toContain("suficientes");
  });
});

describe("Casos borde generales", () => {
  test("sin microciclo seleccionado -> Pendiente de evaluación", () => {
    const result = evaluateATR({ microcycle: "", baseline, health: {}, subjective: {}, training: {} });
    expect(result.state).toBe("Pendiente de evaluacion");
    expect(result.alerts).toEqual([]);
    expect(result.expectedVsActualReady).toBe(false);
  });

  test("sin baseline no hay comparación lista aunque haya datos del día", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline: {},
      health: { restingHeartRate: 55, hrv: 90 },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });
    expect(result.expectedVsActualReady).toBe(false);
  });

  test("sin baseline y sin dissonanceLabel -> mensaje específico de arranque en frío (Motor ATR §1.8), no el genérico", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline: {},
      health: {},
      subjective: {},
      training: {},
    });
    expect(result.state).toBe("Pendiente de evaluacion");
    expect(result.message).toContain("Recolectando datos");
    expect(result.message).not.toBe("Pendiente de evaluación.");
  });

  test("con baseline completo pero sin dissonanceLabel -> mensaje genérico, no el de arranque en frío", () => {
    const result = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: {},
      subjective: {},
      training: {},
    });
    expect(result.state).toBe("Pendiente de evaluacion");
    expect(result.message).toBe("Pendiente de evaluación.");
  });
});

describe("describeExpectedVsActual", () => {
  test("formatea FC, HRV y Borg esperados vs. actuales", () => {
    const text = describeExpectedVsActual(
      "Ajuste",
      baseline,
      { restingHeartRate: 55, hrv: 92 },
      { borgCR10: 3 }
    );

    expect(text).toBe(
      "FC: esperado +8% a +12%, actual +10%\n" +
        "HRV: esperado -10% a -5%, actual -8%\n" +
        "Borg: esperado 2 a 4, actual 3"
    );
  });
});

describe("describeVsPreviousDay — comparación secundaria, nunca decide el estado", () => {
  test("sin registro del día anterior -> no disponible", () => {
    const result = describeVsPreviousDay({ restingHeartRate: 55, hrv: 90 }, undefined);
    expect(result.available).toBe(false);
  });

  test("con datos de ambos días -> deltas informativos", () => {
    const result = describeVsPreviousDay(
      { restingHeartRate: 55, hrv: 88, sleepHours: 6 },
      { restingHeartRate: 52, hrv: 95, sleepHours: 7.5 }
    );
    expect(result.available).toBe(true);
    expect(result.restingHeartRateDelta).toBe(3);
    expect(result.hrvDelta).toBe(-7);
    expect(result.sleepHoursDelta).toBe(-1.5);
    expect(result.note).toContain("no determina el estado");
  });

  test("día anterior sin ninguna variable comparable -> no disponible", () => {
    const result = describeVsPreviousDay({ restingHeartRate: 55 }, {});
    expect(result.available).toBe(false);
  });

  test("con un salto de varios días, la etiqueta lo refleja en vez de decir 'día anterior'", () => {
    const result = describeVsPreviousDay(
      { restingHeartRate: 55 },
      { restingHeartRate: 50 },
      4
    );
    expect(result.available).toBe(true);
    expect(result.note).toContain("hace 4 días");
    expect(result.note).not.toContain("vs. día anterior");
  });

  test("sin gap explícito (undefined) o gap de 1 día -> etiqueta 'vs. día anterior'", () => {
    const result = describeVsPreviousDay({ restingHeartRate: 55 }, { restingHeartRate: 50 }, 1);
    expect(result.note).toContain("vs. día anterior");
  });
});
