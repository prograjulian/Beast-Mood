import { useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { describeVsPreviousDay, evaluateATR } from "../engine/atrEngine";
import { calculateHealthBaseline } from "../engine/baselineEngine";
import type { AthleteProfile } from "../model/athletedata/athlete";
import type { ATRInterpretation, MicrocycleType, PreviousDayComparison } from "../model/athletedata/atr";
import type { CoachMetrics } from "../model/athletedata/coach";
import type { DailyRecord } from "../model/athletedata/dailyRecord";
import { emptyHealthBaseline, type HealthBaseline, type HealthSnapshot } from "../model/athletedata/health";
import type { SubjectiveMetrics } from "../model/athletedata/subjective";
import type { TrainingLoad } from "../model/athletedata/training";
import {
  getDailyHistory,
  getHealthBaseline,
  saveDailyRecord,
  saveHealthBaseline,
} from "../repository/metricsRepository";
import { getAthleteProfile } from "../services/storage";

function getMicrocycleFromProfile(profile: AthleteProfile | null): string {
  return profile?.currentMicrocycle || "";
}

/**
 * Carga y evalúa el estado ATR de hoy -- la lógica compartida entre
 * home.tsx (vista entrenador) y athlete.tsx (vista atleta, Documento Maestro
 * Extendido §6.1). Centraliza el código (antes vivía duplicado solo en
 * home.tsx) para que un futuro cambio a esta lógica no tenga que repetirse
 * en dos archivos -- NO es una garantía de que el recálculo/guardado del
 * baseline corra una sola vez si ambas pantallas están montadas a la vez
 * (cada instancia del hook sigue disparando su propio efecto); el cálculo
 * es determinístico dado el mismo historial, así que escrituras redundantes
 * convergen al mismo valor, pero es trabajo duplicado real (hallazgo de
 * code-reviewer). Se usa `router.replace` en vez de `router.push` para
 * navegar entre home/athlete precisamente para no apilar instancias
 * montadas innecesariamente.
 */
export function useAtrToday() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [activeMicrocycle, setActiveMicrocycle] = useState<string>("");
  const [history, setHistory] = useState<DailyRecord[]>([]);

  const [healthBaseline, setHealthBaseline] = useState<HealthBaseline>(emptyHealthBaseline);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot>({});
  const [previousDayComparison, setPreviousDayComparison] = useState<PreviousDayComparison>({
    available: false,
    note: "",
  });
  const [subjective, setSubjective] = useState<SubjectiveMetrics>({});
  const [training, setTraining] = useState<TrainingLoad>({});
  const [coach, setCoach] = useState<CoachMetrics | null>(null);

  const [atr, setAtr] = useState<ATRInterpretation>({
    state: "Pendiente de evaluacion",
    alerts: [],
    expectedVsActualReady: false,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const storedProfile = await getAthleteProfile();

        if (!storedProfile) {
          router.replace("/onboarding");
          return;
        }

        const [storedBaseline, fetchedHistory] = await Promise.all([
          getHealthBaseline(storedProfile.id),
          getDailyHistory(storedProfile.id),
        ]);

        const latestRecord = fetchedHistory.length > 0 ? fetchedHistory[fetchedHistory.length - 1] : null;
        const previousRecord = fetchedHistory.length > 1 ? fetchedHistory[fetchedHistory.length - 2] : null;

        // Bug B.2 (informe de decisiones 2026-07-20): baseline con ventana
        // móvil de 7 días, calculado a partir del historial real en vez de
        // depender de un valor guardado manualmente.
        const asOfDate = latestRecord?.date ?? new Date().toISOString().slice(0, 10);
        const nextBaseline = calculateHealthBaseline(
          fetchedHistory,
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

        // Si el componente se desmontó mientras esto cargaba (ej. navegar
        // rápido entre /home y /athlete), no actualizar estado de un
        // componente ya desmontado -- el guardado de arriba ya se completó,
        // solo se evita el setState innecesario.
        if (cancelled) return;

        setProfile(storedProfile);
        setHistory(fetchedHistory);
        setHealthBaseline(nextBaseline);
        setHealthSnapshot(nextSnapshot);
        setPreviousDayComparison(describeVsPreviousDay(nextSnapshot, previousRecord?.health));
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
          history: fetchedHistory,
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
        console.error("useAtrToday: fallo cargando datos de ATR", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return {
    loading,
    profile,
    activeMicrocycle,
    history,
    healthBaseline,
    healthSnapshot,
    previousDayComparison,
    subjective,
    training,
    coach,
    atr,
  };
}
