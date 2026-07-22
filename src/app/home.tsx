import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { describeExpectedVsActual } from "../engine/atrEngine";
import { isPainElevated } from "../engine/physiologicalRanges";
import type { MicrocycleType } from "../model/athletedata/atr";
import { useAtrToday } from "../hooks/useAtrToday";

function formatNumber(value?: number, suffix = ""): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${value}${suffix}`;
}

function formatMicrocycle(value?: string): string {
  if (!value) return "Pendiente";
  return value;
}

/**
 * Vista Entrenador (Documento Maestro Extendido §6.2: estado, cumplimiento
 * del microciclo, alertas, carga, observaciones privadas -- toda la
 * profundidad, incluidas las banderas de disonancia). La vista Atleta real
 * vive en athlete.tsx (§6.1) como pantalla separada, no como un toggle sobre
 * esta -- ver CLAUDE.md §4 para el historial de esa separación.
 */
export default function HomeScreen() {
  const router = useRouter();
  const {
    loading,
    profile,
    activeMicrocycle,
    healthBaseline,
    healthSnapshot,
    previousDayComparison,
    subjective,
    training,
    coach,
    atr,
  } = useAtrToday();

  const [detailExpanded, setDetailExpanded] = useState(false);

  const liveBlocks = useMemo(
    () => [
      [
        "FC reposo",
        formatNumber(healthSnapshot.restingHeartRate),
        healthBaseline.restingHeartRate
          ? `Baseline: ${healthBaseline.restingHeartRate}`
          : "Desde Health",
      ],
      [
        "HRV",
        formatNumber(healthSnapshot.hrv),
        healthBaseline.hrv ? `Baseline: ${healthBaseline.hrv}` : "Referencia personal",
      ],
      [
        "Sueño",
        formatNumber(healthSnapshot.sleepHours, " h"),
        "Promedio y tendencia",
      ],
      [
        "Actividad",
        formatNumber(healthSnapshot.activityMinutes, " min"),
        "Carga y minutos",
      ],
    ],
    [healthSnapshot, healthBaseline]
  );

  const atrSummary = useMemo(() => {
    const expectedVsActual = describeExpectedVsActual(
      activeMicrocycle as MicrocycleType,
      healthBaseline,
      healthSnapshot,
      training
    );

    return {
      microcycle: formatMicrocycle(activeMicrocycle),
      expectedVsActual,
    };
  }, [activeMicrocycle, healthBaseline, healthSnapshot, training]);

  // Dolor/molestia elevado: única variable con veto visual (informe de
  // decisiones 2026-07-21, sección 5 punto 13) -- sube al resumen aunque el
  // resto de variables subjetivas esté en el drill-down.
  const painElevated = isPainElevated(subjective);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#05070A" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#B7FF3C" />
          <Text style={styles.loadingText}>Cargando perfil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#05070A" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>BEAST MOOD</Text>
        <Text style={styles.subtitle}>Vista Entrenador -- panorama completo.</Text>

        <Pressable onPress={() => router.replace("/athlete")} style={styles.athleteLinkButton}>
          <Text style={styles.athleteLinkText}>Ver vista Atleta →</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.label}>ATLETA</Text>
          <Text style={styles.value}>{profile?.name || "Perfil pendiente"}</Text>
          <Text style={styles.hint}>
            {profile?.category || "Categoría no configurada"}
          </Text>
          <Text style={[styles.hint, { marginTop: 8 }]}>
            Microciclo: {atrSummary.microcycle}
          </Text>
        </View>

        <View style={styles.grid}>
          {liveBlocks.map(([label, value, hint]) => (
            <View key={label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{label}</Text>
              <Text style={styles.metricValue}>{value}</Text>
              <Text style={styles.metricHint}>{hint}</Text>
            </View>
          ))}
        </View>

        {previousDayComparison.available ? (
          <Text style={styles.previousDayHint}>{previousDayComparison.note}</Text>
        ) : null}

        {/*
          Resumen (siempre visible): estado ATR + confianza + IRL + dolor. El
          resto (comparación esperado vs. actual, disonancia, Nivel 2/3,
          desglose subjetivo/carga) vive en el drill-down -- estructura de
          dos niveles del informe de decisiones 2026-07-21, sección 5 punto
          13. Excepción: dolor elevado sube aquí aunque sea "subjetivo",
          nunca puede quedar enterrado un día crítico.
        */}
        <View style={styles.card}>
          <Text style={styles.label}>ATR</Text>
          <Text style={styles.value}>{atr.state}</Text>
          <Text style={styles.hint}>{atr.message}</Text>
          {atr.confidenceLevel ? (
            <Text style={[styles.hint, { marginTop: 4 }]}>
              Confianza del análisis: {atr.confidenceLevel}
            </Text>
          ) : null}
          {atr.injuryRisk?.level && atr.injuryRisk.level !== "Bajo" ? (
            <Text style={[styles.hint, { marginTop: 4, color: "#FFB3C1" }]}>
              Riesgo de lesión: {atr.injuryRisk.level}
            </Text>
          ) : null}
          {painElevated ? (
            <View style={styles.painBox}>
              <Text style={styles.painText}>
                Dolor/molestia reportado hoy -- revisar antes de decidir la carga.
              </Text>
            </View>
          ) : null}

          {atr.alerts.length > 0 ? (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>Alertas</Text>
              {atr.alerts.map((item, index) => (
                <Text key={`${item}-${index}`} style={styles.alertItem}>
                  • {item}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={[styles.hint, { marginTop: 12 }]}>
              Sin alertas por el momento.
            </Text>
          )}
        </View>

        <Pressable onPress={() => setDetailExpanded((prev) => !prev)} style={styles.detailToggle}>
          <Text style={styles.detailToggleText}>
            {detailExpanded ? "Ocultar detalle ▲" : "Ver detalle ▾"}
          </Text>
        </Pressable>

        {detailExpanded ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Comparación ideal vs actual</Text>
              <Text style={styles.monoHint}>{atrSummary.expectedVsActual}</Text>

              {atr.dissonanceLabel ? (
                <>
                  <View style={styles.atrSpacer} />
                  <Text style={styles.label}>Cruce fisiológico × subjetivo</Text>
                  <Text style={styles.hint}>{atr.dissonanceLabel}</Text>
                </>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>NIVEL 2 — vs. microciclo anterior</Text>
              {atr.level2?.evaluated ? (
                <>
                  <Text style={styles.value}>
                    {atr.level2.occurredAsExpected ? "Evolución esperada" : "Evolución no ocurrió"}
                  </Text>
                  <Text style={styles.hint}>{atr.level2.note}</Text>
                </>
              ) : (
                <Text style={styles.hint}>
                  {atr.level2?.note ?? "Sin datos suficientes todavía."}
                </Text>
              )}

              <View style={styles.atrSpacer} />

              <Text style={styles.label}>NIVEL 3 — histórico multi-temporada</Text>
              <Text style={styles.hint}>
                {atr.level3
                  ? `${atr.level3.note} (${atr.level3.completedMacrocycles}/${atr.level3.minimumRequired} macrociclos)`
                  : "Sin evaluar."}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>SUBJETIVO</Text>
              <Text style={styles.hint}>
                Fatiga: {formatNumber(subjective.fatigue)} · Dolor: {formatNumber(subjective.musclePain)} ·
                Estrés: {formatNumber(subjective.stress)} · Motivación: {formatNumber(subjective.motivation)}
              </Text>
              <Text style={[styles.hint, { marginTop: 8 }]}>
                Técnica: {formatNumber(subjective.techniqueQuality)} · Velocidad: {formatNumber(subjective.speedReaction)} ·
                Explosividad: {formatNumber(subjective.explosiveness)}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>CARGA</Text>
              <Text style={styles.hint}>
                Borg: {formatNumber(training.borgCR10)} · Duración: {formatNumber(training.durationMinutes, " min")} ·
                Carga interna: {formatNumber(training.internalLoad)}
              </Text>
              <Text style={[styles.hint, { marginTop: 8 }]}>
                Coach: {coach ? "Disponible" : "Pendiente"}
              </Text>
            </View>
          </>
        ) : null}

        {/*
          "Listo para competir" -- SOLO microciclo Competitivo (informe de
          decisiones 2026-07-21). Visibilidad EXCLUSIVA del entrenador
          (efecto nocebo documentado) -- home.tsx AHORA es exclusivamente la
          vista entrenador (athlete.tsx es la pantalla separada real), así
          que esta card ya no necesita un toggle: por definición, si estás
          en home.tsx sos el entrenador.
        */}
        {atr.competitionReadiness ? (
          <View style={styles.card}>
            <Text style={styles.label}>LISTO PARA COMPETIR (solo entrenador)</Text>
            <Text style={styles.value}>
              {atr.competitionReadiness.status === "ready"
                ? "Listo"
                : atr.competitionReadiness.status === "not_ready"
                  ? "No listo"
                  : "No evaluable"}
            </Text>
            {atr.competitionReadiness.blockedBy.length > 0 ? (
              <Text style={styles.hint}>
                Bloqueado por: {atr.competitionReadiness.blockedBy.join(", ")}
              </Text>
            ) : null}
            {atr.competitionReadiness.failedMandatory.length > 0 ? (
              <Text style={styles.hint}>
                No cumple: {atr.competitionReadiness.failedMandatory.join(", ")}
              </Text>
            ) : null}
            {atr.competitionReadiness.missingMandatory.length > 0 ? (
              <Text style={styles.hint}>
                Falta dato obligatorio: {atr.competitionReadiness.missingMandatory.join(", ")}
              </Text>
            ) : null}
            {atr.competitionReadiness.supportingConcerns.length > 0 ? (
              <Text style={[styles.hint, { marginTop: 8 }]}>
                Puntos de atención: {atr.competitionReadiness.supportingConcerns.join(", ")}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push("/register")}
          style={styles.saveButton}
        >
          <Text style={styles.saveButtonText}>Registrar entrenamiento</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#05070A" },
  container: { padding: 20, paddingBottom: 40 },
  brand: {
    color: "#B7FF3C",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 6,
  },
  subtitle: {
    color: "#9CA6B8",
    marginBottom: 18,
  },
  athleteLinkButton: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2735",
    backgroundColor: "#0C111A",
  },
  athleteLinkText: {
    color: "#B7FF3C",
    fontWeight: "700",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#101520",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#1F2735",
    padding: 16,
    marginBottom: 16,
  },
  label: {
    color: "#9CA6B8",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  value: {
    color: "#F4F7FF",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 6,
  },
  hint: {
    color: "#9CA6B8",
    lineHeight: 20,
  },
  previousDayHint: {
    color: "#7C8AA0",
    fontSize: 12,
    marginBottom: 16,
    fontStyle: "italic",
  },
  monoHint: {
    color: "#B7FF3C",
    lineHeight: 20,
    fontFamily: "monospace",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  metricCard: {
    width: "48%",
    backgroundColor: "#0C111A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1F2735",
    padding: 14,
    marginBottom: 14,
  },
  metricLabel: {
    color: "#9CA6B8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
  },
  metricValue: {
    color: "#F4F7FF",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 6,
  },
  metricHint: {
    color: "#9CA6B8",
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#05070A",
  },
  loadingText: {
    marginTop: 12,
    color: "#9CA6B8",
    fontSize: 16,
  },
  atrSpacer: {
    height: 12,
  },
  painBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#221417",
    borderWidth: 1,
    borderColor: "#4A2530",
  },
  painText: {
    color: "#FFC9D2",
    fontWeight: "700",
  },
  alertBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#17121A",
    borderWidth: 1,
    borderColor: "#3A2430",
  },
  alertTitle: {
    color: "#FFB3C1",
    fontWeight: "800",
    marginBottom: 8,
  },
  alertItem: {
    color: "#FFDCE2",
    lineHeight: 20,
    marginBottom: 4,
  },
  detailToggle: {
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2735",
    backgroundColor: "#0C111A",
  },
  detailToggleText: {
    color: "#9CA6B8",
    fontWeight: "700",
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: "#B7FF3C",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  saveButtonText: {
    color: "#05070A",
    fontSize: 16,
    fontWeight: "900",
  },
});
