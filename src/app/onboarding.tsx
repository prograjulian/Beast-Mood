import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { emptyAthleteProfile, saveAthleteProfile } from "../services/storage";

export default function OnboardingScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [weightDivision, setWeightDivision] = useState("");
  const [age, setAge] = useState("");
  const [guard, setGuard] = useState("");
  const [coachName, setCoachName] = useState("");
  const [mainGoal, setMainGoal] = useState("");
  const [saving, setSaving] = useState(false);

  const canContinue = useMemo(() => {
    return name.trim().length > 0 && category.trim().length > 0;
  }, [name, category]);

  const handleContinue = async () => {
    if (!canContinue || saving) return;

    setSaving(true);
    try {
      await saveAthleteProfile({
        ...emptyAthleteProfile,
        id: `${Date.now()}`,
        name: name.trim(),
        category: category.trim(),
        weightDivision: weightDivision.trim() || undefined,
        age: age.trim() ? Number(age) : undefined,
        guard: guard.trim() || undefined,
        coachName: coachName.trim() || undefined,
        mainGoal: mainGoal.trim() || undefined,
        createdAt: new Date().toISOString(),
        hasCompletedOnboarding: true,
      });

      router.replace("/home");
    } catch {
      Alert.alert("Error", "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>BEAST MOOD</Text>
        <Text style={styles.title}>Primer acceso</Text>
        <Text style={styles.subtitle}>
          Crea el perfil inicial para que la app pueda guardar tu estructura y entrar directo después.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Nombre o alias *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej. Federico" placeholderTextColor="#566175" />

          <Text style={styles.label}>Categoría *</Text>
          <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Ej. Cadete / Junior / Mayor" placeholderTextColor="#566175" />

          <Text style={styles.label}>División de peso</Text>
          <TextInput style={styles.input} value={weightDivision} onChangeText={setWeightDivision} placeholder="Ej. -68 kg" placeholderTextColor="#566175" />

          <Text style={styles.label}>Edad</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="Ej. 19" placeholderTextColor="#566175" />

          <Text style={styles.label}>Guardia</Text>
          <TextInput style={styles.input} value={guard} onChangeText={setGuard} placeholder="Izquierda, Derecha o Ambas" placeholderTextColor="#566175" />

          <Text style={styles.label}>Entrenador</Text>
          <TextInput style={styles.input} value={coachName} onChangeText={setCoachName} placeholder="Nombre del entrenador" placeholderTextColor="#566175" />

          <Text style={styles.label}>Objetivo principal</Text>
          <TextInput style={styles.input} value={mainGoal} onChangeText={setMainGoal} placeholder="Ej. Competencia G3" placeholderTextColor="#566175" />
        </View>

        <Pressable
          style={[styles.button, (!canContinue || saving) && styles.buttonDisabled]}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>{saving ? "Guardando..." : "Continuar"}</Text>
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
    textAlign: "center",
    marginTop: 10,
  },
  title: {
    color: "#F4F7FF",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 18,
  },
  subtitle: {
    color: "#9CA6B8",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 18,
  },
  card: {
    backgroundColor: "#101520",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1F2735",
    padding: 16,
    marginBottom: 18,
  },
  label: {
    color: "#9CA6B8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#0B0F15",
    color: "#F4F7FF",
    borderWidth: 1,
    borderColor: "#1F2735",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  button: {
    backgroundColor: "#B7FF3C",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#0B0F13",
    fontSize: 15,
    fontWeight: "900",
  },
});
