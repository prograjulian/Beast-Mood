import { useRouter } from "expo-router";
import { useMemo } from "react";
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

import { buildExplanationPayload } from "../engine/explanationEngine";
import { isPainElevated } from "../engine/physiologicalRanges";
import type { MicrocycleType } from "../model/athletedata/atr";
import { useAtrToday } from "../hooks/useAtrToday";

/**
 * Vista Atleta (Documento Maestro Extendido §6.1): "información mínima
 * necesaria -- el atleta no necesita ver la lógica interna ni todas las
 * variables, necesita saber cómo está y qué debe hacer, sin ruido."
 * Cuatro categorías exactas del documento: Estado general, Tendencias,
 * Recomendaciones, Historial. A propósito NO incluye lo que sí vive en
 * home.tsx (vista entrenador): alertas técnicas variable por variable,
 * Nivel 2/3 crudos, disonancia, desglose subjetivo/carga, y sobre todo
 * "Listo para competir" (exclusivo del entrenador, efecto nocebo
 * documentado -- ver CLAUDE.md §5 punto 1 y home.tsx).
 */
export default function AthleteScreen() {
  const router = useRouter();
  const { loading, profile, activeMicrocycle, history, subjective, atr, coach, previousDayComparison } =
    useAtrToday();

  // Paso 1 (determinístico) del motor de explicación -- audience:"athlete"
  // ya excluye `readiness` en el propio payload (guardrail aplicado en
  // explanationEngine.ts desde la tercera ronda 2026-07-21), no depende de
  // que esta pantalla se acuerde de filtrarlo.
  const explanation = useMemo(() => {
    if (!activeMicrocycle) return null;
    return buildExplanationPayload(atr, activeMicrocycle as MicrocycleType, {
      audience: "athlete",
      athleteComment: subjective.athleteNotes,
      coachShareableNote: coach?.shareableNote,
    });
  }, [atr, activeMicrocycle, subjective.athleteNotes, coach?.shareableNote]);

  const painElevated = isPainElevated(subjective);

  const recentHistory = useMemo(() => [...history].reverse().slice(0, 10), [history]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#05070A" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#B7FF3C" />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#05070A" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>BEAST MOOD</Text>
        <Text style={styles.subtitle}>Hola, {profile?.name || "atleta"}.</Text>

        <Pressable onPress={() => router.replace("/home")} style={styles.coachLinkButton}>
          <Text style={styles.coachLinkText}>Ver vista Entrenador →</Text>
        </Pressable>

        {/* Estado general (§6.1, primera categoría) */}
        <View style={styles.card}>
          <Text style={styles.label}>CÓMO ESTÁS HOY</Text>
          <Text style={styles.value}>{atr.state}</Text>
          <Text style={styles.hint}>{atr.message}</Text>
          {painElevated ? (
            <View style={styles.painBox}>
              <Text style={styles.painText}>
                Reportaste dolor o molestia hoy -- avisale a tu entrenador antes de entrenar.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Tendencias (§6.1, segunda categoría) -- informativo, nunca decide
            el estado (mismo principio que en la vista entrenador). */}
        <View style={styles.card}>
          <Text style={styles.label}>TENDENCIA</Text>
          <Text style={styles.hint}>
            {previousDayComparison.available
              ? previousDayComparison.note
              : "Todavía no hay suficientes registros para comparar la tendencia."}
          </Text>
        </View>

        {/* Recomendaciones (§6.1, tercera categoría) */}
        <View style={styles.card}>
          <Text style={styles.label}>QUÉ HACER</Text>
          <Text style={styles.value}>{explanation?.defaultAction ?? "Completa tu registro de hoy."}</Text>
          {atr.injuryRisk?.level && atr.injuryRisk.level !== "Bajo" && atr.injuryRisk.message ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>{atr.injuryRisk.message}</Text>
          ) : null}
        </View>

        {/* Historial (§6.1, cuarta categoría) */}
        <View style={styles.card}>
          <Text style={styles.label}>HISTORIAL RECIENTE</Text>
          {recentHistory.length === 0 ? (
            <Text style={styles.hint}>Todavía no hay registros.</Text>
          ) : (
            recentHistory.map((record) => (
              <View key={record.date} style={styles.historyRow}>
                <Text style={styles.historyDate}>{record.date}</Text>
                <Text style={styles.historyState}>{record.atrState ?? "Sin evaluar"}</Text>
              </View>
            ))
          )}
        </View>

        <Pressable onPress={() => router.push("/register")} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Registrar hoy</Text>
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
  coachLinkButton: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1F2735",
    backgroundColor: "#0C111A",
  },
  coachLinkText: {
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
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  hint: {
    color: "#9CA6B8",
    lineHeight: 20,
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
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#1F2735",
  },
  historyDate: {
    color: "#9CA6B8",
    fontFamily: "monospace",
  },
  historyState: {
    color: "#F4F7FF",
    fontWeight: "700",
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
