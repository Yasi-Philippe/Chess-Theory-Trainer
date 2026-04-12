import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Suppress strict-mode warnings produced by react-native-chessboard (it reads
// shared values during render, which is harmless here but noisy in the console).
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#16213e' },
            headerTintColor: '#e0e0e0',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: '#1a1a2e' },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="setup" options={{ title: 'Choose Opening' }} />
          <Stack.Screen name="game" options={{ title: 'Training', headerShown: false }} />
          <Stack.Screen
            name="game-over"
            options={{ title: 'Game Over', headerBackVisible: false }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
