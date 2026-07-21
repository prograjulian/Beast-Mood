import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

import { describeExpectedVsActual, describeVsPreviousDay, evaluateATR } from "../engine/atrEngine";
import { calculateHealthBaseline } from "../engine/baselineEngine";
import { isPainElevated } from "../engine/physiologicalRanges";
import type { ATRInterpretation, MicrocycleType, PreviousDayComparison } from "../model/athletedata/atr";
import type { AthleteProfile } from "../model/athletedata/athlete";
import type { CoachMetrics } from "../model/athletedata/coach";
import {
  emptyHealthBaseline,
  type HealthBaseline,
  type HealthSnapshot,
} from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import type { TrainingLoad } from "../model/athletedata/training";
import {
  getDailyHistory,
  getHealthBaseline,
  saveDailyRecord,
  saveHealthBaseline,
} from "../repository/metricsRepository";
import { getAthleteProfile } from "../services/storage";

// "Vista Atleta / Vista Entrenador" (informe de decisiones 2026-07-21,
// sección 5 punto 13) -- es un filtro de PRESENTACIÓN, no un límite de
// seguridad: el proyecto sigue en fase single-user, sin auth/roles reales
// todavía (CLAUDE.md §0). Lo único que este toggle debe garantizar es que
// "Listo para competir" nunca se muestre en modo Atleta (efecto nocebo
// documentado) -- cuando exista una separación real de dashboards por
// usuario, este toggle se reemplaza, no se elimina la regla.
type ViewMode = "coach" | "athlete";

function formatNumber(value?: number, suffix = ""): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${value}${suffix}`;
}

function formatMicrocycle(value?: string): string {
  if (!value) return "Pendiente";
  return value;
}

function getMicrocycleFromProfile(profile: AthleteProfile | null): string {
  return profile?.currentMicrocycle || "";
}

// Días de calendario entre dos fechas "YYYY-MM-DD" -- si el atleta se salta
// días de registro, el "anterior" en el historial puede no ser literalmente
// ayer (hallazgo de code-reviewer: la etiqueta "vs. día anterior" sería
// engañosa en ese caso).
function daysBetweenDates(laterDate: string, earlierDate: string): number {
  const later = new Date(`${laterDate}T00:00:00Z`).getTime();
  const earlier = new Date(`${earlierDate}T00:00:00Z`).getTime();
  return Math.round((later - earlier) / (1000 * 60 * 60 * 24));
}

export default function HomeScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [activeMicrocycle, setActiveMicrocycle] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("coach");
  const [detailExpanded, setDetailExpanded] = useState(false);

  const [healthBaseline, setHealthBaseline] = useState<HealthBaseline>(emptyHealthBaseline);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot>({});
  const [previousHealthSnapshot, setPreviousHealthSnapshot] = useState<HealthSnapshot | undefined>();
  const [daysSincePrevious, setDaysSincePrevious] = useState<number | undefined>();
  const [subjective, setSubjective] = useState<SubjectiveMetrics>({});
  const [training, setTraining] = useState<TrainingLoad>({});
  const [coach, setCoach] = useState<CoachMetrics | null>(null);

  const [atr, setAtr] = useState<ATRInterpretation>({
    state: "Pendiente de evaluacion",
    alerts: [],
    expectedVsActualReady: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const storedProfile = await getAthleteProfile();

        if (!storedProfile) {
          router.replace("/onboarding");
          return;
        }

        const [storedBaseline, history] = await Promise.all([
          getHealthBaseline(storedProfile.id),
          getDailyHistory(storedProfile.id),
        ]);

        const latestRecord = history.length > 0 ? history[history.length - 1] : null;
        const previousRecord = history.length > 1 ? history[history.length - 2] : null;

        // Bug B.2 (informe de decisiones 2026-07-20): baseline con ventana
        // móvil de 7 días, calculado a partir del historial real en vez de
        // depender de un valor guardado manualmente. Si la ventana no tiene
        // suficientes lecturas válidas, calculateHealthBaseline devuelve el
        // baseline anterior sin cambios (no lo sobreescribe con un promedio
        // poco confiable).
        const asOfDate = latestRecord?.date ?? new Date().toISOString().slice(0, 10);
        const nextBaseline = calculateHealthBaseline(
          history,
          asOfDate,
          storedBaseline ?? emptyHealthBaseline
        );
        if (nextBaseline !== storedBaseline) {
          await saveHealthBaseline(storedProfile.id, nextBaseline);
        }

        const nextSnapshot = latestRecord?.health ?? {};
        const nextSubjective = latestRecord?.subjective ?? {};
        const nextTraining = latestRecord?.training ?? {};
        const nextCoach = latestRecord?.coach ?? null;

        setProfile(storedProfile);
        setHealthBaseline(nextBaseline);
        setHealthSnapshot(nextSnapshot);
        setPreviousHealthSnapshot(previousRecord?.health);
        setDaysSincePrevious(
          latestRecord && previousRecord ? daysBetweenDates(latestRecord.date, previousRecord.date) : undefined
        );
        setSubjective(nextSubjective);
        setTraining(nextTraining);
        setCoach(nextCoach);

        const microcycle = latestRecord?.microcycle || getMicrocycleFromProfile(storedProfile);
        setActiveMicrocycle(microcycle);

        const nextAtr = evaluateATR({
          microcycle: microcycle as MicrocycleType | "",
          baseline: nextBaseline,
          health: nextSnapshot,
          subjective: nextSubjective,
          training: nextTraining,
          coach: nextCoach ?? undefined,
          history,
        });

        setAtr(nextAtr);

        if (latestRecord) {
          await saveDailyRecord({
            ...latestRecord,
            atrState: nextAtr.state,
            dissonanceLabel: nextAtr.dissonanceLabel,
            divergenceFcHrv: nextAtr.physiological?.divergenceFcHrv,
          });
        }
      } catch (error) {
        console.error("Error cargando datos de Home:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

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

  // Comparación secundaria "vs. día anterior" -- informe de decisiones
  // 2026-07-21, sección 5 punto 13. Nunca decide el color/estado (eso lo
  // sigue haciendo la comparación primaria contra baseline), solo da
  // contexto de tendencia día a día.
  const previousDayComparison: PreviousDayComparison = useMemo(
    () => describeVsPreviousDay(healthSnapshot, previousHealthSnapshot, daysSincePrevious),
    [healthSnapshot, previousHealthSnapshot, daysSincePrevious]
  );

  // Dolor/molestia elevado: única variable con veto visual (sección 5 punto
  // 13) -- sube al resumen aunque el resto de variables subjetivas esté en
  // el drill-down, un día crítico no puede quedar enterrado.
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
        <Text style={styles.subtitle}>
          Base preparada para sincronizar salud, subjetivo y ATR.
        </Text>

        <View style={styles.viewModeRow}>
          <Pressable
            onPress={() => setViewMode("coach")}
            style={[styles.viewModeChip, viewMode === "coach" && styles.viewModeChipActive]}
          >
            <Text style={[styles.viewModeText, viewMode === "coach" && styles.viewModeTextActive]}>
              Vista Entrenador
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("athlete")}
            style={[styles.viewModeChip, viewMode === "athlete" && styles.viewModeChipActive]}
          >
            <Text style={[styles.viewModeText, viewMode === "athlete" && styles.viewModeTextActive]}>
              Vista Atleta
            </Text>
          </Pressable>
        </View>

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
          decisiones 2026-07-21). Decisión de producto: visibilidad EXCLUSIVA
          del entrenador (efecto nocebo documentado en atletas que reciben
          señales negativas de wearables antes de competir). El toggle de
          arriba (viewMode) es la separación real hoy -- cuando exista una
          pantalla de atleta separada de verdad, esta card sigue excluida
          ahí también.
        */}
        {atr.competitionReadiness && viewMode === "coach" ? (
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
  viewModeRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  viewModeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2735",
    alignItems: "center",
    backgroundColor: "#0C111A",
  },
  viewModeChipActive: {
    backgroundColor: "#B7FF3C",
    borderColor: "#B7FF3C",
  },
  viewModeText: {
    color: "#9CA6B8",
    fontWeight: "700",
    fontSize: 12,
  },
  viewModeTextActive: {
    color: "#05070A",
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
