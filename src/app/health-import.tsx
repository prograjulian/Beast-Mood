import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";

import type { HealthSnapshot } from "../model/athletedata/health";
import { getLiveHealthSnapshot, saveLiveHealthSnapshot } from "../repository/metricsRepository";
import { getAthleteProfile } from "../services/storage";

/**
 * Puerta de entrada para el Atajo de iOS (Shortcuts) -- CLAUDE.md §3 preveía
 * Apple Health vía HealthKit nativo, pero eso requiere una build con módulo
 * nativo (EAS Build + cuenta Apple Developer de pago). Mientras esa decisión
 * no se tome, esta ruta cubre el mismo objetivo (dejar de tipear FC/HRV/sueño
 * a mano) sin ningún costo ni salir de Expo Go: un Atajo de iOS lee la app de
 * Salud (que ya recibe los datos del Apple Watch) y abre
 * `beastmoodapp://health-import?fc=...&hrv=...&sleep=...`.
 *
 * Escribe en el mismo slot "live" que ya existía sin productor
 * (`getLiveHealthSnapshot`/`saveLiveHealthSnapshot`, CLAUDE.md §4) --
 * `register.tsx` ya lee de ahí al cargar y precarga los campos editables, así
 * que no hace falta tocar `register.tsx` para que esto funcione.
 */

type ImportStatus = "loading" | "success" | "no-params" | "no-profile" | "error";

// A diferencia de un formulario tipeado a mano, esto viene de una URL
// externa (el Atajo, o alguien probando la URL directamente) -- un valor
// absurdo (ej. fc=9999) se guardaría igual en el slot "live" y precargaría
// register.tsx sin que nada lo señale. Rangos fisiológicamente plausibles
// (no clínicos, solo sanity-check) para no dejar pasar eso en silencio.
const PLAUSIBLE_RANGES: Record<"fc" | "hrv" | "sleep" | "activity", { min: number; max: number }> = {
  fc: { min: 20, max: 250 },
  hrv: { min: 0, max: 300 },
  sleep: { min: 0, max: 24 },
  activity: { min: 0, max: 1440 },
};

function toNumber(value: string | string[] | undefined, field: keyof typeof PLAUSIBLE_RANGES): number | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(",", ".");
  if (cleaned === "") return undefined;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  const range = PLAUSIBLE_RANGES[field];
  return parsed >= range.min && parsed <= range.max ? parsed : undefined;
}

export default function HealthImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    fc?: string;
    hrv?: string;
    sleep?: string;
    activity?: string;
  }>();

  const [status, setStatus] = useState<ImportStatus>("loading");
  const [imported, setImported] = useState<HealthSnapshot>({});
  const [rejected, setRejected] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      const restingHeartRate = toNumber(params.fc, "fc");
      const hrv = toNumber(params.hrv, "hrv");
      const sleepHours = toNumber(params.sleep, "sleep");
      const activityMinutes = toNumber(params.activity, "activity");

      const rejectedFields: string[] = [];
      if (params.fc && restingHeartRate === undefined) rejectedFields.push("FC reposo");
      if (params.hrv && hrv === undefined) rejectedFields.push("HRV");
      if (params.sleep && sleepHours === undefined) rejectedFields.push("Sueño");
      if (params.activity && activityMinutes === undefined) rejectedFields.push("Actividad");
      setRejected(rejectedFields);

      if (
        restingHeartRate === undefined &&
        hrv === undefined &&
        sleepHours === undefined &&
        activityMinutes === undefined
      ) {
        setStatus("no-params");
        return;
      }

      try {
        const profile = await getAthleteProfile();
        if (!profile) {
          setStatus("no-profile");
          return;
        }

        const existing = await getLiveHealthSnapshot(profile.id);
        const merged: HealthSnapshot = {
          ...existing,
          restingHeartRate: restingHeartRate ?? existing?.restingHeartRate,
          hrv: hrv ?? existing?.hrv,
          sleepHours: sleepHours ?? existing?.sleepHours,
          activityMinutes: activityMinutes ?? existing?.activityMinutes,
          updatedAt: new Date().toISOString(),
        };

        await saveLiveHealthSnapshot(profile.id, merged);
        setImported({ restingHeartRate, hrv, sleepHours, activityMinutes });
        setStatus("success");
      } catch (error) {
        console.error("health-import.tsx: fallo guardando el snapshot importado", error);
        setStatus("error");
      }
    };

    run();
    // Los params de una URL no cambian dentro de la vida de esta pantalla --
    // cada apertura del Atajo crea una instancia nueva de la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#05070A" />
      <View style={styles.container}>
        {status === "loading" ? (
          <>
            <ActivityIndicator size="large" color="#B7FF3C" />
            <Text style={styles.hint}>Importando datos de Salud...</Text>
          </>
        ) : null}

        {status === "success" ? (
          <>
            <Text style={styles.title}>Datos importados</Text>
            <View style={styles.summaryBox}>
              {imported.restingHeartRate !== undefined ? (
                <Text style={styles.summaryItem}>FC reposo: {imported.restingHeartRate} lpm</Text>
              ) : null}
              {imported.hrv !== undefined ? (
                <Text style={styles.summaryItem}>HRV: {imported.hrv} ms</Text>
              ) : null}
              {imported.sleepHours !== undefined ? (
                <Text style={styles.summaryItem}>Sueño: {imported.sleepHours} h</Text>
              ) : null}
              {imported.activityMinutes !== undefined ? (
                <Text style={styles.summaryItem}>Actividad: {imported.activityMinutes} min</Text>
              ) : null}
            </View>
            <Text style={styles.hint}>
              Quedó guardado como el dato del día -- entra a Registro para revisarlo, completar el
              resto (dolor, RPE, subjetivo) y confirmarlo.
            </Text>
            {rejected.length > 0 ? (
              <Text style={styles.warning}>
                Se ignoraron valores fuera de rango plausible: {rejected.join(", ")}. Revísalos a
                mano en Registro.
              </Text>
            ) : null}
          </>
        ) : null}

        {status === "no-params" ? (
          <>
            <Text style={styles.title}>No se recibieron datos válidos</Text>
            {rejected.length > 0 ? (
              <Text style={styles.warning}>
                Valores fuera de rango plausible, ignorados: {rejected.join(", ")}.
              </Text>
            ) : null}
          </>
        ) : null}

        {status === "no-profile" ? (
          <Text style={styles.title}>Todavía no hay un perfil creado -- completa el onboarding primero.</Text>
        ) : null}

        {status === "error" ? (
          <Text style={styles.title}>Ocurrió un error guardando los datos importados.</Text>
        ) : null}

        {status !== "loading" ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => router.replace(status === "no-profile" ? "/onboarding" : "/register")}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {status === "no-profile" ? "Ir al onboarding" : "Ir a Registro"}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/home")} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Ir al Home</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#05070A" },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "#F4F7FF",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 16,
  },
  warning: {
    color: "#FFB3C1",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 12,
  },
  hint: {
    color: "#9CA6B8",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 16,
  },
  summaryBox: {
    backgroundColor: "#101520",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1F2735",
    padding: 16,
    width: "100%",
  },
  summaryItem: {
    color: "#B7FF3C",
    fontFamily: "monospace",
    fontSize: 15,
    marginBottom: 6,
  },
  actions: {
    width: "100%",
    marginTop: 28,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#B7FF3C",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#05070A",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1F2735",
  },
  secondaryButtonText: {
    color: "#9CA6B8",
    fontSize: 15,
    fontWeight: "700",
  },
});
