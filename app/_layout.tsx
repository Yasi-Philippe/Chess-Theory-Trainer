import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
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
        <Stack.Screen name="game" options={{ title: 'Training' }} />
        <Stack.Screen
          name="game-over"
          options={{ title: 'Game Over', headerBackVisible: false }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
