import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const Centre = ({ children }: { children: ReactNode }) => <View style={ui.centre}>{children}</View>;

export const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[ui.button, disabled && { opacity: 0.4 }]}>
    <Text style={ui.buttonText}>{label}</Text>
  </Pressable>
);

export const ui = StyleSheet.create({
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  dim: { color: '#999' },
  error: { color: '#ff8a80', textAlign: 'center', padding: 8 },
  button: { backgroundColor: '#0078d4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
