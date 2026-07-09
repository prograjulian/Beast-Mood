import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyAthleteProfile, type AthleteProfile } from "../model/athletedata/athlete";

const ATHLETE_PROFILE_KEY = "@beastmood:athleteProfile";
const ONBOARDING_DONE_KEY = "@beastmood:onboardingDone";

export async function saveAthleteProfile(profile: AthleteProfile): Promise<void> {
  const nextProfile: AthleteProfile = {
    ...profile,
    hasCompletedOnboarding: true,
  };

  await AsyncStorage.multiSet([
    [ATHLETE_PROFILE_KEY, JSON.stringify(nextProfile)],
    [ONBOARDING_DONE_KEY, "true"],
  ]);
}

export async function getAthleteProfile(): Promise<AthleteProfile | null> {
  const raw = await AsyncStorage.getItem(ATHLETE_PROFILE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AthleteProfile;
    return {
      ...emptyAthleteProfile,
      ...parsed,
      hasCompletedOnboarding: true,
    };
  } catch {
    return null;
  }
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
  return value === "true";
}

export async function clearAthleteProfile(): Promise<void> {
  await AsyncStorage.multiRemove([ATHLETE_PROFILE_KEY, ONBOARDING_DONE_KEY]);
}

export { emptyAthleteProfile };