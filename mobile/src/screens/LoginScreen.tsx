import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { colors, fontSize } from '../theme';

export default function LoginScreen() {
  const { loginEmail, registerEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginEmail(email.trim(), password);
      } else {
        await registerEmail(email.trim(), password);
      }
    } catch (e) {
      setError((e as Error).message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Semaphore</Text>
        <Text style={styles.tagline}>Secure messaging</Text>

        {/* Segment */}
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segBtn, mode === 'login' && styles.segBtnActive]}
            onPress={() => { setMode('login'); setError(''); }}
          >
            <Text style={[styles.segText, mode === 'login' && styles.segTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, mode === 'register' && styles.segBtnActive]}
            onPress={() => { setMode('register'); setError(''); }}
          >
            <Text style={[styles.segText, mode === 'register' && styles.segTextActive]}>Create Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholderTextColor={colors.textTertiary}
            placeholder="Email"
            selectionColor={colors.primary}
          />
          <View style={styles.inputDivider} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholderTextColor={colors.textTertiary}
            placeholder="Password"
            selectionColor={colors.primary}
            onSubmitEditing={submit}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.submitText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 2,
    marginBottom: 24,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  segBtnActive: { backgroundColor: colors.bgElevated },
  segText: { fontSize: fontSize.sm, color: colors.textSecondary },
  segTextActive: { color: colors.text, fontWeight: '600' },
  form: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  input: {
    fontSize: fontSize.md,
    color: colors.text,
    padding: 16,
  },
  inputDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 },
  error: {
    fontSize: fontSize.sm,
    color: colors.red,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitText: {
    fontSize: fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
});
