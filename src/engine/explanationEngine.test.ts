import { buildExplanationPayload } from "./explanationEngine";
import { evaluateATR } from "./atrEngine";
import type { HealthBaseline } from "../model/athletedata/health";

const baseline: HealthBaseline = { restingHeartRate: 50, hrv: 100 };

function pct(base: number, deltaPercent: number): number {
  return base * (1 + deltaPercent / 100);
}

describe("buildExplanationPayload", () => {
  test("Fatiga funcional -> outcome y acción correctas de la tabla fija", () => {
    const interpretation = evaluateATR({
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
    const payload = buildExplanationPayload(interpretation, "Carga");
    expect(payload.outcomeKey).toBe("Fatiga funcional");
    expect(payload.defaultAction).toBe("Mantener el plan — es la respuesta esperada.");
  });

  test("Fatiga excesiva -> acción de investigar causa, nunca atribuida a una sola variable", () => {
    const interpretation = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: { musclePain: 9, legFeeling: 5 },
      training: { borgCR10: 6 },
    });
    const payload = buildExplanationPayload(interpretation, "Carga");
    expect(payload.outcomeKey).toBe("Fatiga excesiva");
    expect(payload.defaultAction).toContain("investigar la causa");
  });

  test("Supercompensación -> outcome Supercompensado", () => {
    const interpretation = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: { restingHeartRate: pct(50, -12), hrv: pct(100, 15) },
      subjective: { explosiveness: 9, speedReaction: 9, legFeeling: 9, motivation: 8 },
      training: { borgCR10: 2 },
    });
    const payload = buildExplanationPayload(interpretation, "Competitivo");
    expect(payload.outcomeKey).toBe("Supercompensado");
    expect(payload.defaultAction).toContain("no agregar carga nueva");
  });

  test("readiness 'not_ready' se incluye en el payload con la acción de señalar qué falló", () => {
    const interpretation = evaluateATR({
      microcycle: "Competitivo",
      baseline,
      health: { restingHeartRate: pct(50, -3), hrv: pct(100, 12) },
      subjective: { legFeeling: 9, techniqueQuality: 5, explosiveness: 9, speedReaction: 9, motivation: 8 },
      training: { borgCR10: 2 },
      coach: { confidence: 8 },
    });
    const payload = buildExplanationPayload(interpretation, "Competitivo");
    expect(payload.readiness?.status).toBe("not_ready");
    expect(payload.readiness?.action).toContain("obligatoria o bloqueadora");
    expect(payload.readiness?.details.some((d) => d.includes("Técnica"))).toBe(true);
  });

  test("fuera de Competitivo -> payload sin readiness", () => {
    const interpretation = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });
    const payload = buildExplanationPayload(interpretation, "Ajuste");
    expect(payload.readiness).toBeUndefined();
    expect(payload.outcomeKey).toBe("Dentro de lo esperado");
  });

  test("el comentario del atleta se adjunta al payload pero no altera outcomeKey ni el estado", () => {
    const interpretation = evaluateATR({
      microcycle: "Ajuste",
      baseline,
      health: { restingHeartRate: pct(50, 10), hrv: pct(100, -7) },
      subjective: { legFeeling: 5 },
      training: { borgCR10: 3 },
    });
    const payload = buildExplanationPayload(interpretation, "Ajuste", "me sentí como un campeón hoy");
    expect(payload.athleteComment).toBe("me sentí como un campeón hoy");
    expect(payload.outcomeKey).toBe("Dentro de lo esperado");
  });

  test("variablesResponsible reusa las alertas ya calculadas, no inventa una lista nueva", () => {
    const interpretation = evaluateATR({
      microcycle: "Carga",
      baseline,
      health: { restingHeartRate: pct(50, 17), hrv: pct(100, -25) },
      subjective: { musclePain: 9, legFeeling: 5 },
      training: { borgCR10: 6 },
    });
    const payload = buildExplanationPayload(interpretation, "Carga");
    expect(payload.variablesResponsible).toBe(interpretation.alerts);
  });
});
