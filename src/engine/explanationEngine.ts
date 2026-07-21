import type { ATRInterpretation, ATRState, MicrocycleType } from "../model/athletedata/atr";

/**
 * Motor de explicación generalizado (informe de decisiones 2026-07-21,
 * resuelve el pendiente de generalizar el modelo qué/por qué/qué hacer más
 * allá de fatiga excesiva -- CLAUDE.md §4, Motor ATR §10.1/§12.3).
 *
 * Arquitectura de 2 pasos, separación estricta entre lógica y redacción:
 * 1. Este archivo (determinístico, sin IA): calcula qué acción corresponde
 *    según una tabla FIJA, a partir de datos ya estructurados. Esto es lo
 *    único que decide QUÉ recomendar -- nunca la IA.
 * 2. Capa de redacción (IA / API de OpenAI) -- NO IMPLEMENTADA todavía.
 *    Requeriría un backend/proxy que no exponga la API key en el cliente
 *    (CLAUDE.md §10: nunca hardcodear secretos, servidor como fuente de
 *    verdad) -- hoy no existe ese backend (Firebase solo "previsto",
 *    CLAUDE.md §3). Decisión explícita: no wirear la llamada a OpenAI hasta
 *    que exista ese proxy. `buildExplanationPayload` deja listo el
 *    contrato de datos que ese paso 2 consumiría.
 */

export type ExplanationOutcomeKey =
  | "Dentro de lo esperado"
  | "Mas fresco de lo esperado (Recuperacion/Activacion)"
  | "Estimulacion insuficiente (Carga/Impacto)"
  | "Fatiga funcional"
  | "Fatiga excesiva"
  | "Recuperacion insuficiente"
  | "Supercompensado"
  | "Pendiente de evaluacion";

// Tabla fija de acciones por defecto (informe de decisiones 2026-07-21) --
// fuente de verdad para la futura capa de redacción. La IA (cuando exista)
// nunca genera una acción libre: siempre debe salir de aquí.
const DEFAULT_ACTIONS: Record<ExplanationOutcomeKey, string> = {
  "Dentro de lo esperado": "Mantener el plan.",
  "Mas fresco de lo esperado (Recuperacion/Activacion)": "Positivo, sin acción — seguir el plan.",
  "Estimulacion insuficiente (Carga/Impacto)":
    "Revisar si la carga planificada es suficiente para el objetivo del bloque.",
  "Fatiga funcional": "Mantener el plan — es la respuesta esperada.",
  "Fatiga excesiva":
    "Revisar la carga antes del siguiente entrenamiento e investigar la causa (nunca atribuirla a una sola variable, Motor ATR §10.1).",
  "Recuperacion insuficiente":
    "Prolongar o ajustar la fase de recuperación antes de avanzar al siguiente microciclo.",
  Supercompensado: "Aprovechar el pico; no agregar carga nueva.",
  "Pendiente de evaluacion": "Recolectando datos para dar un análisis concreto.",
};

const READINESS_ACTIONS: Record<"ready" | "not_ready" | "not_evaluable", string> = {
  ready: "Autorizado. Mencionar como puntos de atención las variables de apoyo bajas, si las hay.",
  not_ready: "Señalar qué variable obligatoria o bloqueadora falló. La decisión final queda en el entrenador.",
  not_evaluable: "No evaluable por falta de un dato obligatorio -- señalar explícitamente cuál falta.",
};

/**
 * Resuelve la fila de la tabla que corresponde a esta interpretación.
 * Prioridad explícita (el informe de decisiones no da una tabla de
 * prioridad exacta cuando varias señales aplican a la vez -- esta es una
 * implementación provisional razonable, no una decisión cerrada):
 * 1. Supercompensación / Fatiga excesiva -- siempre los más urgentes.
 * 2. "Estimulo insuficiente" (Capa 3) -- señal directa y específica.
 * 3. Fatiga funcional.
 * 4. "Preparacion insuficiente" (por Nivel 2 u otra vía) -> fila
 *    "Recuperación insuficiente" de la tabla del informe -- aproximación,
 *    la tabla no distingue explícitamente todas las transiciones de §5.2.
 * 5. "Mas fresco de lo esperado" en Recuperación/Activación -- fila propia.
 * 6. Todo lo demás dentro de lo esperado.
 */
function resolveOutcomeKey(
  state: ATRState,
  dissonanceLabel: string | undefined,
  microcycle: MicrocycleType
): ExplanationOutcomeKey {
  if (state === "Supercompensacion") return "Supercompensado";
  if (state === "Fatiga excesiva") return "Fatiga excesiva";
  if (dissonanceLabel === "Estimulo insuficiente") return "Estimulacion insuficiente (Carga/Impacto)";
  if (state === "Fatiga funcional") return "Fatiga funcional";
  if (state === "Preparacion insuficiente") return "Recuperacion insuficiente";
  if (
    dissonanceLabel === "Mas fresco de lo esperado" &&
    (microcycle === "Recuperacion" || microcycle === "Activacion")
  ) {
    return "Mas fresco de lo esperado (Recuperacion/Activacion)";
  }
  if (state === "Recuperacion adecuada") return "Dentro de lo esperado";
  return "Pendiente de evaluacion";
}

export interface ReadinessExplanation {
  status: "ready" | "not_ready" | "not_evaluable";
  action: string;
  details: string[];
}

export interface ExplanationPayload {
  microcycle: MicrocycleType;
  outcomeKey: ExplanationOutcomeKey;
  defaultAction: string;
  // Reusa las alertas ya calculadas por evaluateATR -- nunca se inventa una
  // lista nueva de variables, evita el riesgo de mencionar algo que no
  // vino en los datos reales (guardrail del informe de decisiones).
  variablesResponsible: string[];
  trendNote?: string;
  confidenceLevel: "Alta" | "Media" | "Baja";
  // Solo presente cuando audience==="coach" Y se evaluó (microciclo
  // Competitivo). Coach-only por decisión de producto -- ver
  // ATRInterpretation.competitionReadiness. NUNCA presente cuando
  // audience==="athlete" (guardrail del futuro chat "Entrenador IA",
  // informe de decisiones 2026-07-21: "nunca revela el veredicto de
  // listo/no listo") -- se aplica aquí, en el paso determinístico, para no
  // depender de que la capa de redacción (paso 2, sin implementar) lo
  // recuerde.
  readiness?: ReadinessExplanation;
  // El comentario libre del atleta NUNCA alimenta el motor determinístico
  // (ya calculado arriba) -- solo se adjunta para que un paso 2 lo use como
  // contexto de redacción, tal como pide el informe de decisiones.
  athleteComment?: string;
  // Nota del entrenador explícitamente marcada como compartible
  // (CoachMetrics.shareableNote) -- nunca las notas privadas. Mismo
  // principio que athleteComment: solo contexto de redacción, no mueve el
  // motor determinístico.
  coachShareableNote?: string;
}

export interface BuildExplanationPayloadOptions {
  // Para quién es este payload -- decide si `readiness` puede incluirse.
  // Default "coach" (uso actual en home.tsx). El futuro chat "Entrenador
  // IA" del atleta DEBE pasar "athlete" explícitamente.
  audience?: "coach" | "athlete";
  athleteComment?: string;
  coachShareableNote?: string;
}

export function buildExplanationPayload(
  interpretation: ATRInterpretation,
  microcycle: MicrocycleType,
  options: BuildExplanationPayloadOptions = {}
): ExplanationPayload {
  const { audience = "coach", athleteComment, coachShareableNote } = options;
  const outcomeKey = resolveOutcomeKey(interpretation.state, interpretation.dissonanceLabel, microcycle);

  const readiness =
    audience === "coach" && interpretation.competitionReadiness
      ? {
          status: interpretation.competitionReadiness.status,
          action: READINESS_ACTIONS[interpretation.competitionReadiness.status],
          details:
            interpretation.competitionReadiness.status === "not_ready"
              ? [
                  ...interpretation.competitionReadiness.blockedBy,
                  ...interpretation.competitionReadiness.failedMandatory,
                ]
              : interpretation.competitionReadiness.status === "not_evaluable"
                ? interpretation.competitionReadiness.missingMandatory
                : interpretation.competitionReadiness.supportingConcerns,
        }
      : undefined;

  return {
    microcycle,
    outcomeKey,
    defaultAction: DEFAULT_ACTIONS[outcomeKey],
    variablesResponsible: interpretation.alerts,
    trendNote: interpretation.level2?.note,
    confidenceLevel: interpretation.confidenceLevel ?? "Baja",
    readiness,
    athleteComment,
    coachShareableNote: audience === "athlete" ? coachShareableNote : undefined,
  };
}
