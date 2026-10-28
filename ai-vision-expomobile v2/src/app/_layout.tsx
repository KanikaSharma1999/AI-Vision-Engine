import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

// Plain stack: Main screen (index) -> Results screen (results).
// Both screens draw their own header, so the native one is hidden.
export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f4f7f7' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="results" />
      </Stack>
    </ThemeProvider>
  );
}
