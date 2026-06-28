import 'react-native-reanimated';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppNavigator from './src/navigation/AppNavigator';
import { PumpProvider } from './src/context/PumpContext';
import { ThemeProvider } from './src/theme/ThemeContext';

export default function App() {
  return (
    <SafeAreaProvider>
      {/*
        This app is edge-to-edge (Expo `edgeToEdgeEnabled=true`) but does NOT use
        `react-native-edge-to-edge`, so keyboard-controller's auto-detection thinks
        it is NOT edge-to-edge and pads the bottom by the system-bar inset when the
        keyboard opens — the background-colored box above the keyboard. Passing these
        flags explicitly tells it to treat the app as edge-to-edge (zero bottom pad).
      */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
        <ThemeProvider>
          <PumpProvider>
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </PumpProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
