import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { hasCompletedOnboarding } from "../services/storage";

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    const go = async () => {
      const done = await hasCompletedOnboarding();
      router.replace(done ? "/home" : "/onboarding");
    };

    go();
  }, [router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#B7FF3C" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#05070A",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
