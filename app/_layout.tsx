import React, { Component } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

// ─── Global error boundary ────────────────────────────────────────────────────

type EBState = { hasError: boolean; message: string };

class ErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): EBState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>Something went wrong</Text>
          <Text style={eb.message}>{this.state.message}</Text>
          <TouchableOpacity
            style={eb.button}
            onPress={() => this.setState({ hasError: false, message: '' })}
          >
            <Text style={eb.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: { color: '#e94560', fontSize: 20, fontWeight: '700' },
  message: { color: '#8892a4', fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: '#e0e0e0', fontWeight: '700' },
});

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
