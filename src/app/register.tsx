import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { type MicrocycleType } from "../model/athletedata/atr";
import { type CoachMetrics } from "../model/athletedata/coach";
import { type DailyRecord } from "../model/athletedata/dailyRecord";
import {
    emptyHealthBaseline,
    type HealthBaseline,
    type HealthSnapshot,
} from "../model/athletedata/health";
import { type SubjectiveMetrics } from "../model/athletedata/subjective";
import { calculateInternalLoad, type TrainingLoad } from "../model/athletedata/training";
import {
    getHealthBaseline,
    getLiveHealthSnapshot,
    saveDailyRecord,
    saveHealthBaseline,
} from "../repository/metricsRepository";
import { getAthleteProfile, saveAthleteProfile } from "../services/storage";

const MICROCYCLES: MicrocycleType[] = [
  "Ajuste",
  "Carga",
  "Impacto",
  "Recuperacion",
  "Activacion",
  "Competitivo",
];

type OptionItem = {
  label: string;
  value: number;
};

const FEELING_OPTIONS: OptionItem[] = [
  { label: "Muy bajo", value: 1 },
  { label: "Bajo", value: 3 },
  { label: "Normal", value: 5 },
  { label: "Alto", value: 7 },
  { label: "Muy alto", value: 9 },
];

const FATIGUE_OPTIONS: OptionItem[] = [
  { label: "Muy fresco", value: 1 },
  { label: "Fresco", value: 3 },
  { label: "Normal", value: 5 },
  { label: "Cansado", value: 7 },
  { label: "Muy cansado", value: 9 },
];

const PAIN_OPTIONS: OptionItem[] = [
  { label: "Sin dolor", value: 1 },
  { label: "Leve", value: 3 },
  { label: "Moderado", value: 5 },
  { label: "Alto", value: 7 },
  { label: "Muy alto", value: 9 },
];

const STRESS_OPTIONS: OptionItem[] = [
  { label: "Muy relajado", value: 1 },
  { label: "Relajado", value: 3 },
  { label: "Normal", value: 5 },
  { label: "Estresado", value: 7 },
  { label: "Muy estresado", value: 9 },
];

const MOTIVATION_OPTIONS: OptionItem[] = [
  { label: "Muy motivado", value: 9 },
  { label: "Motivado", value: 7 },
  { label: "Normal", value: 5 },
  { label: "Baja", value: 3 },
  { label: "Sin ganas", value: 1 },
];

const PERFORMANCE_OPTIONS: OptionItem[] = [
  { label: "Excelente", value: 9 },
  { label: "Buena", value: 7 },
  { label: "Normal", value: 5 },
  { label: "Regular", value: 3 },
  { label: "Mala", value: 1 },
];

const SPEED_OPTIONS: OptionItem[] = [
  { label: "Muy rápida", value: 9 },
  { label: "Rápida", value: 7 },
  { label: "Normal", value: 5 },
  { label: "Lenta", value: 3 },
  { label: "Muy lenta", value: 1 },
];

const EXPLOSIVENESS_OPTIONS: OptionItem[] = [
  { label: "Muy explosivo", value: 9 },
  { label: "Explosivo", value: 7 },
  { label: "Normal", value: 5 },
  { label: "Baja", value: 3 },
  { label: "Muy baja", value: 1 },
];

const POWER_OPTIONS: OptionItem[] = [
  { label: "Muy fuerte", value: 9 },
  { label: "Fuerte", value: 7 },
  { label: "Normal", value: 5 },
  { label: "Débil", value: 3 },
  { label: "Muy débil", value: 1 },
];

const LEG_OPTIONS: OptionItem[] = [
  { label: "Muy ligeras", value: 9 },
  { label: "Ligeras", value: 7 },
  { label: "Normales", value: 5 },
  { label: "Pesadas", value: 3 },
  { label: "Muy pesadas", value: 1 },
];

// Escala de Borg CR-10 -- anclajes verbales OFICIALES (informe de
// decisiones 2026-07-21, sección 5 punto 13), no una versión simplificada
// propia. 6 y 8 se omiten a propósito: no tienen anclaje verbal en la
// escala original de Borg, el atleta selecciona por descripción y el
// sistema guarda el número real 0-10 (sin perder resolución en
// calculateInternalLoad).
const BORG_OPTIONS: OptionItem[] = [
  { label: "Nada en absoluto", value: 0 },
  { label: "Muy muy leve", value: 1 },
  { label: "Leve", value: 2 },
  { label: "Moderado", value: 3 },
  { label: "Algo intenso", value: 4 },
  { label: "Intenso", value: 5 },
  { label: "Muy intenso", value: 7 },
  { label: "Muy muy intenso", value: 9 },
  { label: "Máximo esfuerzo", value: 10 },
];

function toNumber(value: string): number | undefined {
  const cleaned = value.trim().replace(",", ".");
  if (cleaned === "") return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function SelectionGroup({
  label,
  subtitle,
  value,
  options,
  onChange,
}: {
  label: string;
  subtitle?: string;
  value?: number;
  options: OptionItem[];
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {subtitle ? <Text style={styles.fieldSubtitle}>{subtitle}</Text> : null}
      <View style={styles.optionWrap}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange(option.value)}
              style={[styles.optionChip, active && styles.optionChipActive]}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NumericField({
  label,
  subtitle,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  subtitle?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#556071"
        keyboardType="numeric"
        style={styles.input}
      />
      {subtitle ? <Text style={styles.fieldSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ReadOnlyMetric({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <View style={styles.readOnlyCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {typeof value === "number" ? `${value}${suffix ?? ""}` : "--"}
      </Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [selectedMicrocycle, setSelectedMicrocycle] = useState<MicrocycleType>("Ajuste");

  const [healthBaseline, setHealthBaseline] = useState<HealthBaseline>(emptyHealthBaseline);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot>({});

  // Lectura matutina en reposo -- la única que alimenta Capa 1 (Bug B.1,
  // informe de decisiones 2026-07-21). Captura manual mientras no exista
  // integración con Apple Health; se precarga con lo último sincronizado
  // si existe, y el atleta/entrenador puede corregirlo.
  const [restingHeartRate, setRestingHeartRate] = useState("");
  const [hrv, setHrv] = useState("");
  const [sleepHours, setSleepHours] = useState("");

  // Recuperación Autonómica Post-Entreno -- métrica nueva (informe de
  // decisiones 2026-07-20). Ventana de captura: 2h ±15min post-entreno.
  const [postWorkoutFc, setPostWorkoutFc] = useState("");
  const [postWorkoutHrv, setPostWorkoutHrv] = useState("");
  const [postWorkoutMinutes, setPostWorkoutMinutes] = useState("");

  // Lectura pre-sueño -- solo contexto, sin peso formal (Bug B.3).
  const [preSleepFc, setPreSleepFc] = useState("");
  const [preSleepHrv, setPreSleepHrv] = useState("");

  const [fatigue, setFatigue] = useState<number | undefined>();
  const [musclePain, setMusclePain] = useState<number | undefined>();
  const [stress, setStress] = useState<number | undefined>();
  const [motivation, setMotivation] = useState<number | undefined>();
  const [discomfort, setDiscomfort] = useState<number | undefined>();
  const [overallPerformance, setOverallPerformance] = useState<number | undefined>();
  const [techniqueQuality, setTechniqueQuality] = useState<number | undefined>();
  const [speedReaction, setSpeedReaction] = useState<number | undefined>();
  const [explosiveness, setExplosiveness] = useState<number | undefined>();
  const [strikingPower, setStrikingPower] = useState<number | undefined>();
  const [easeOfExit, setEaseOfExit] = useState<number | undefined>();
  const [legFeeling, setLegFeeling] = useState<number | undefined>();

  const [borgCR10, setBorgCR10] = useState<number | undefined>();
  const [durationMinutes, setDurationMinutes] = useState("");

  const [notes, setNotes] = useState("");

  // CoachMetrics -- sin pantalla propia todavía (gap documentado en
  // CLAUDE.md §4), captura aquí mismo mientras tanto, en una sección
  // separada y claramente marcada como "uso del staff".
  const [coachTechnique, setCoachTechnique] = useState<number | undefined>();
  const [coachReaction, setCoachReaction] = useState<number | undefined>();
  const [coachSpeed, setCoachSpeed] = useState<number | undefined>();
  const [coachExplosiveness, setCoachExplosiveness] = useState<number | undefined>();
  const [coachStrikingPower, setCoachStrikingPower] = useState<number | undefined>();
  const [coachMood, setCoachMood] = useState<number | undefined>();
  const [coachAttitude, setCoachAttitude] = useState<number | undefined>();
  const [coachFocus, setCoachFocus] = useState<number | undefined>();
  const [coachConfidence, setCoachConfidence] = useState<number | undefined>();
  // Privada por defecto -- nunca llega al chat del atleta (informe de
  // decisiones 2026-07-21). Compartible es un campo aparte, a propósito:
  // compartir es una acción explícita, nunca inferida.
  const [coachNotes, setCoachNotes] = useState("");
  const [shareableNote, setShareableNote] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await getAthleteProfile();
        if (!profile) {
          router.replace("/onboarding");
          return;
        }

        const [storedBaseline, storedSnapshot] = await Promise.all([
          getHealthBaseline(profile.id),
          getLiveHealthSnapshot(profile.id),
        ]);

        if (storedBaseline) setHealthBaseline(storedBaseline);
        if (storedSnapshot) {
          setHealthSnapshot(storedSnapshot);
          // Precarga de lo último sincronizado (si algún día Apple Health
          // escribe acá) -- el atleta/entrenador siempre puede corregirlo.
          if (typeof storedSnapshot.restingHeartRate === "number") {
            setRestingHeartRate(String(storedSnapshot.restingHeartRate));
          }
          if (typeof storedSnapshot.hrv === "number") {
            setHrv(String(storedSnapshot.hrv));
          }
          if (typeof storedSnapshot.sleepHours === "number") {
            setSleepHours(String(storedSnapshot.sleepHours));
          }
        }

        const microcycleFromProfile = profile.currentMicrocycle;
        if (microcycleFromProfile && MICROCYCLES.includes(microcycleFromProfile)) {
          setSelectedMicrocycle(microcycleFromProfile);
        }
      } catch (error) {
        console.error("register.tsx: fallo cargando perfil/baseline/snapshot previo", error);
        Alert.alert(
          "No se pudo cargar el registro",
          "Ocurrió un error leyendo tus datos guardados. Puedes seguir e intentar guardar de nuevo."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const internalLoad = useMemo(() => {
    const borg = borgCR10;
    const duration = toNumber(durationMinutes);

    return calculateInternalLoad(borg, duration);
  }, [borgCR10, durationMinutes]);

  async function handleSave() {
    let profile;
    try {
      profile = await getAthleteProfile();
    } catch (error) {
      console.error("register.tsx: fallo leyendo el perfil antes de guardar", error);
      Alert.alert("No se pudo guardar", "No se pudo leer tu perfil. Intenta de nuevo.");
      return;
    }

    if (!profile) {
      Alert.alert("Perfil no encontrado", "Completa el onboarding primero.");
      router.replace("/onboarding");
      return;
    }

    const now = new Date().toISOString();

    const nextSubjective: SubjectiveMetrics = {
      fatigue,
      musclePain,
      stress,
      motivation,
      discomfort,
      overallPerformance,
      techniqueQuality,
      speedReaction,
      explosiveness,
      strikingPower,
      easeOfExit,
      legFeeling,
      athleteNotes: notes.trim() || undefined,
    };

    const nextTraining: TrainingLoad = {
      borgCR10,
      durationMinutes: toNumber(durationMinutes),
      internalLoad,
    };

    const postWorkoutFcValue = toNumber(postWorkoutFc);
    const postWorkoutHrvValue = toNumber(postWorkoutHrv);
    const postWorkoutMinutesValue = toNumber(postWorkoutMinutes);
    const hasPostWorkout =
      postWorkoutFcValue !== undefined ||
      postWorkoutHrvValue !== undefined ||
      postWorkoutMinutesValue !== undefined;

    const preSleepFcValue = toNumber(preSleepFc);
    const preSleepHrvValue = toNumber(preSleepHrv);
    const hasPreSleep = preSleepFcValue !== undefined || preSleepHrvValue !== undefined;

    const nextHealth: HealthSnapshot = {
      ...healthSnapshot,
      restingHeartRate: toNumber(restingHeartRate),
      hrv: toNumber(hrv),
      sleepHours: toNumber(sleepHours),
      postWorkout: hasPostWorkout
        ? {
            restingHeartRate: postWorkoutFcValue,
            hrv: postWorkoutHrvValue,
            minutesAfterWorkout: postWorkoutMinutesValue,
          }
        : undefined,
      preSleep: hasPreSleep ? { restingHeartRate: preSleepFcValue, hrv: preSleepHrvValue } : undefined,
      updatedAt: now,
    };

    const nextCoach: CoachMetrics = {
      technique: coachTechnique,
      reaction: coachReaction,
      speed: coachSpeed,
      explosiveness: coachExplosiveness,
      strikingPower: coachStrikingPower,
      mood: coachMood,
      attitude: coachAttitude,
      focus: coachFocus,
      confidence: coachConfidence,
      coachNotes: coachNotes.trim() || undefined,
      shareableNote: shareableNote.trim() || undefined,
    };
    const hasCoachData = Object.values(nextCoach).some((value) => value !== undefined);

    const nextRecord: DailyRecord = {
      date: now.slice(0, 10),
      athleteId: profile.id,
      microcycle: selectedMicrocycle,
      health: nextHealth,
      subjective: nextSubjective,
      training: nextTraining,
      coach: hasCoachData ? nextCoach : undefined,
      notes: notes.trim() || undefined,
      savedAt: now,
    };

    try {
      await Promise.all([
        saveDailyRecord(nextRecord),
        saveAthleteProfile({
          ...profile,
          currentMicrocycle: selectedMicrocycle,
        }),
        healthBaseline ? saveHealthBaseline(profile.id, healthBaseline) : Promise.resolve(),
      ]);
    } catch (error) {
      console.error("register.tsx: fallo guardando el registro diario", {
        athleteId: profile.id,
        date: nextRecord.date,
        error,
      });
      Alert.alert(
        "No se pudo guardar",
        "Ocurrió un error guardando tu registro de hoy. Tus respuestas no se perdieron en esta pantalla — intenta guardar de nuevo."
      );
      return;
    }

    Alert.alert("Guardado", "Los datos quedaron registrados correctamente.", [
      {
        text: "Ir al Home",
        onPress: () => router.replace("/home"),
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#05070A" />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Cargando registro...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#05070A" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.brand}>REGISTRO DIARIO</Text>
          <Text style={styles.subtitle}>
            El estado general se responde con botones. FC/HRV se pueden tipear a mano o traerse ya
            cargados desde un Atajo de Salud (ver &ldquo;health-import&rdquo;) — la lógica ATR
            interpreta todo según el microciclo.
          </Text>

          <View style={styles.card}>
            <SectionTitle
              title="Microciclo"
              subtitle="Selecciona la fase actual del ATR."
            />
            <View style={styles.microcycleGrid}>
              {MICROCYCLES.map((item) => {
                const active = selectedMicrocycle === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setSelectedMicrocycle(item)}
                    style={[styles.microcycleChip, active && styles.microcycleChipActive]}
                  >
                    <Text
                      style={[
                        styles.microcycleChipText,
                        active && styles.microcycleChipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Lectura matutina en reposo"
              subtitle="La única lectura que alimenta la Capa 1 del motor ATR. Precargada si viniste de un Atajo de Salud, editable siempre."
            />
            <NumericField
              label="FC reposo (lpm)"
              value={restingHeartRate}
              onChangeText={setRestingHeartRate}
              placeholder="Ej. 52"
            />
            <NumericField
              label="HRV (ms)"
              value={hrv}
              onChangeText={setHrv}
              placeholder="Ej. 95"
            />
            <NumericField
              label="Horas de sueño"
              value={sleepHours}
              onChangeText={setSleepHours}
              placeholder="Ej. 7.5"
            />
            {healthSnapshot.activityMinutes ? (
              <ReadOnlyMetric
                label="Actividad"
                value={healthSnapshot.activityMinutes}
                suffix=" min"
                hint="Sincronizado desde Health"
              />
            ) : null}
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Recuperación post-entreno"
              subtitle="Ventana de captura: 2h ±15min después de terminar el entrenamiento. Fuera de esa ventana, no cuenta para esta métrica."
            />
            <NumericField
              label="FC post-entreno (lpm)"
              value={postWorkoutFc}
              onChangeText={setPostWorkoutFc}
              placeholder="Ej. 58"
            />
            <NumericField
              label="HRV post-entreno (ms)"
              value={postWorkoutHrv}
              onChangeText={setPostWorkoutHrv}
              placeholder="Ej. 85"
            />
            <NumericField
              label="Minutos desde que terminó el entreno"
              value={postWorkoutMinutes}
              onChangeText={setPostWorkoutMinutes}
              placeholder="Ej. 120"
            />
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Lectura pre-sueño (opcional)"
              subtitle="Solo contexto — no se compara contra el baseline ni afecta el estado ATR."
            />
            <NumericField
              label="FC pre-sueño (lpm)"
              value={preSleepFc}
              onChangeText={setPreSleepFc}
              placeholder="Ej. 55"
            />
            <NumericField
              label="HRV pre-sueño (ms)"
              value={preSleepHrv}
              onChangeText={setPreSleepHrv}
              placeholder="Ej. 90"
            />
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Referencia personal"
              subtitle="Baseline calculado automáticamente (ventana móvil de 7 días) — se usa para comparar tu respuesta actual."
            />
            <View style={styles.healthGrid}>
              <ReadOnlyMetric
                label="Baseline FC reposo"
                value={healthBaseline.restingHeartRate}
                suffix=" lpm"
                hint="Línea base individual"
              />
              <ReadOnlyMetric
                label="Baseline HRV"
                value={healthBaseline.hrv}
                suffix=" ms"
                hint="Línea base individual"
              />
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Estado general"
              subtitle="Mismas preguntas para todos los microciclos."
            />
            <SelectionGroup
              label="Sensación física general"
              subtitle="¿Cómo te sentiste hoy en general?"
              value={fatigue}
              options={FATIGUE_OPTIONS}
              onChange={setFatigue}
            />
            <SelectionGroup
              label="Dolor muscular"
              subtitle="¿Cómo estuvo el dolor o la rigidez?"
              value={musclePain}
              options={PAIN_OPTIONS}
              onChange={setMusclePain}
            />
            <SelectionGroup
              label="Estrés"
              subtitle="¿Cómo sentiste el nivel de estrés?"
              value={stress}
              options={STRESS_OPTIONS}
              onChange={setStress}
            />
            <SelectionGroup
              label="Motivación"
              subtitle="¿Qué tan dispuesto estuviste a entrenar?"
              value={motivation}
              options={MOTIVATION_OPTIONS}
              onChange={setMotivation}
            />
            <SelectionGroup
              label="Molestias"
              subtitle="¿Hubo alguna molestia o incomodidad?"
              value={discomfort}
              options={FEELING_OPTIONS}
              onChange={setDiscomfort}
            />
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Rendimiento"
              subtitle="Esta parte también se responde con botones."
            />
            <SelectionGroup
              label="Rendimiento general"
              subtitle="¿Cómo viste tu rendimiento global?"
              value={overallPerformance}
              options={PERFORMANCE_OPTIONS}
              onChange={setOverallPerformance}
            />
            <SelectionGroup
              label="Técnica"
              subtitle="¿Cómo estuvo tu ejecución técnica?"
              value={techniqueQuality}
              options={PERFORMANCE_OPTIONS}
              onChange={setTechniqueQuality}
            />
            <SelectionGroup
              label="Velocidad / reacción"
              subtitle="¿Cómo se sintieron tus tiempos de reacción?"
              value={speedReaction}
              options={SPEED_OPTIONS}
              onChange={setSpeedReaction}
            />
            <SelectionGroup
              label="Explosividad"
              subtitle="¿Cómo sentiste tu salida y potencia?"
              value={explosiveness}
              options={EXPLOSIVENESS_OPTIONS}
              onChange={setExplosiveness}
            />
            <SelectionGroup
              label="Fuerza del golpe"
              subtitle="¿Cómo sentiste la potencia en contacto?"
              value={strikingPower}
              options={POWER_OPTIONS}
              onChange={setStrikingPower}
            />
            <SelectionGroup
              label="Sensación de piernas"
              subtitle="¿Cómo estaban las piernas hoy?"
              value={legFeeling}
              options={LEG_OPTIONS}
              onChange={setLegFeeling}
            />
            <SelectionGroup
              label="Facilidad de salida"
              subtitle="¿Qué tan fácil te resultó arrancar?"
              value={easeOfExit}
              options={PERFORMANCE_OPTIONS}
              onChange={setEaseOfExit}
            />
          </View>

          <View style={styles.card}>
            <SectionTitle
              title="Carga"
              subtitle="Borg en formato de opción, no numérico para el atleta."
            />
            <SelectionGroup
              label="¿Qué tan exigente fue el entrenamiento?"
              subtitle="Selecciona la opción que mejor describa la sesión."
              value={borgCR10}
              options={BORG_OPTIONS}
              onChange={setBorgCR10}
            />

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Duración</Text>
              <TextInput
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                placeholder="Ej. 90"
                placeholderTextColor="#556071"
                keyboardType="numeric"
                style={styles.input}
              />
              <Text style={styles.fieldSubtitle}>Minutos totales de trabajo</Text>
            </View>

            <View style={styles.internalLoadRow}>
              <Text style={styles.metricLabel}>Carga interna calculada</Text>
              <Text style={styles.internalLoadValue}>
                {typeof internalLoad === "number" ? Math.round(internalLoad) : "--"}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle title="Notas" subtitle="Observaciones adicionales del día." />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Escribe aquí..."
              placeholderTextColor="#556071"
              multiline
              style={styles.textArea}
            />
          </View>

          <View style={[styles.card, styles.coachCard]}>
            <SectionTitle
              title="Entrenador (uso del staff)"
              subtitle="Observación directa del entrenador — señal distinta del autoreporte del atleta de arriba."
            />
            <SelectionGroup
              label="Técnica observada"
              subtitle="Muy baja/baja aquí puede escalar el estado a Fatiga excesiva (Capa 4)."
              value={coachTechnique}
              options={PERFORMANCE_OPTIONS}
              onChange={setCoachTechnique}
            />
            <SelectionGroup
              label="Reacción"
              value={coachReaction}
              options={SPEED_OPTIONS}
              onChange={setCoachReaction}
            />
            <SelectionGroup
              label="Velocidad"
              value={coachSpeed}
              options={SPEED_OPTIONS}
              onChange={setCoachSpeed}
            />
            <SelectionGroup
              label="Explosividad"
              value={coachExplosiveness}
              options={EXPLOSIVENESS_OPTIONS}
              onChange={setCoachExplosiveness}
            />
            <SelectionGroup
              label="Fuerza del golpe"
              value={coachStrikingPower}
              options={POWER_OPTIONS}
              onChange={setCoachStrikingPower}
            />
            <SelectionGroup
              label="Ánimo"
              value={coachMood}
              options={FEELING_OPTIONS}
              onChange={setCoachMood}
            />
            <SelectionGroup
              label="Actitud"
              value={coachAttitude}
              options={FEELING_OPTIONS}
              onChange={setCoachAttitude}
            />
            <SelectionGroup
              label="Foco / concentración"
              value={coachFocus}
              options={FEELING_OPTIONS}
              onChange={setCoachFocus}
            />
            <SelectionGroup
              label="Confianza"
              value={coachConfidence}
              options={MOTIVATION_OPTIONS}
              onChange={setCoachConfidence}
            />

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Nota privada</Text>
              <TextInput
                value={coachNotes}
                onChangeText={setCoachNotes}
                placeholder="Nunca visible para el atleta..."
                placeholderTextColor="#556071"
                multiline
                style={styles.textArea}
              />
              <Text style={styles.fieldSubtitle}>
                Privada por defecto — nunca llega al chat del atleta ni a ninguna vista suya.
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Nota compartible</Text>
              <TextInput
                value={shareableNote}
                onChangeText={setShareableNote}
                placeholder="Ej. indicación técnica puntual para el atleta..."
                placeholderTextColor="#556071"
                multiline
                style={styles.textArea}
              />
              <Text style={styles.fieldSubtitle}>
                Marcada explícitamente como compartible — la única que un futuro chat
                &ldquo;Entrenador IA&rdquo; podría usar como contexto (esa capa de redacción con IA
                todavía no está implementada).
              </Text>
            </View>
          </View>

          <Pressable onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Guardar registro</Text>
          </Pressable>

          <Pressable onPress={() => router.replace("/home")} style={styles.backButton}>
            <Text style={styles.backButtonText}>Volver al Home</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#05070A" },
  container: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  brand: {
    color: "#B7FF3C",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 6,
  },
  subtitle: {
    color: "#9CA6B8",
    marginBottom: 18,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#101520",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#1F2735",
    padding: 16,
    marginBottom: 16,
  },
  coachCard: {
    borderColor: "#3A2430",
    backgroundColor: "#15111A",
  },
  sectionHeader: { marginBottom: 14 },
  sectionTitle: {
    color: "#F4F7FF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: "#9CA6B8",
    lineHeight: 20,
    fontSize: 13,
  },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: {
    color: "#9CA6B8",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  fieldSubtitle: {
    color: "#9CA6B8",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  input: {
    backgroundColor: "#0C111A",
    color: "#F4F7FF",
    borderWidth: 1,
    borderColor: "#1F2735",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  readOnlyCard: {
    flex: 1,
    minWidth: "48%",
    backgroundColor: "#0C111A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1F2735",
    padding: 14,
    marginBottom: 12,
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
    lineHeight: 16,
  },
  healthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  sectionBlock: {
    marginBottom: 16,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  optionChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#0C111A",
    borderWidth: 1,
    borderColor: "#1F2735",
  },
  optionChipActive: {
    backgroundColor: "#B7FF3C",
    borderColor: "#B7FF3C",
  },
  optionText: {
    color: "#D6DCE8",
    fontWeight: "800",
  },
  optionTextActive: {
    color: "#05070A",
  },
  microcycleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  microcycleChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#0C111A",
    borderWidth: 1,
    borderColor: "#1F2735",
  },
  microcycleChipActive: {
    backgroundColor: "#B7FF3C",
    borderColor: "#B7FF3C",
  },
  microcycleChipText: {
    color: "#D6DCE8",
    fontWeight: "800",
  },
  microcycleChipTextActive: {
    color: "#05070A",
  },
  textArea: {
    minHeight: 110,
    backgroundColor: "#0C111A",
    color: "#F4F7FF",
    borderWidth: 1,
    borderColor: "#1F2735",
    borderRadius: 18,
    padding: 14,
    textAlignVertical: "top",
    fontSize: 15,
  },
  internalLoadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1F2735",
  },
  internalLoadValue: {
    color: "#B7FF3C",
    fontWeight: "900",
  },
  saveButton: {
    backgroundColor: "#B7FF3C",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  saveButtonText: {
    color: "#05070A",
    fontSize: 16,
    fontWeight: "900",
  },
  backButton: {
    backgroundColor: "#0C111A",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1F2735",
  },
  backButtonText: {
    color: "#D6DCE8",
    fontSize: 16,
    fontWeight: "800",
  },
  loadingText: {
    color: "#9CA6B8",
    fontSize: 16,
  },
});