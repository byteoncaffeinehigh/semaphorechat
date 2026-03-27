import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, fonts, fontSize } from '../theme';

export default function LoginScreen() {
  const { loginEmail, registerEmail } = useAuth();
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>SEMAPHORE</Text>
        <Text style={styles.tagline}>{'> secure channel established'}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholderTextColor={colors.muted}
            placeholder="user@domain.com"
            selectionColor={colors.amber}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholderTextColor={colors.muted}
            placeholder="••••••••"
            selectionColor={colors.amber}
          />

          {error ? <Text style={styles.error}>{`! ${error}`}</Text> : null}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={submit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.bg} size="small" />
              : <Text style={styles.submitText}>
                  {mode === 'login' ? '[ LOGIN ]' : '[ REGISTER ]'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            <Text style={styles.toggleText}>
              {mode === 'login'
                ? '> No account? Register'
                : '> Have an account? Login'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    fontFamily: fonts.mono,
    fontSize: 28,
    color: colors.amber,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.green,
    textAlign: 'center',
    marginBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    backgroundColor: colors.bgElevated,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.amberDim,
    letterSpacing: 2,
    marginBottom: 6,
  },
  input: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.amber,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    borderRadius: 0,
  },
  error: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.red,
    marginTop: 12,
  },
  submitBtn: {
    backgroundColor: colors.amber,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.bg,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  toggleBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  toggleText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
  },
});
