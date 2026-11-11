import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import Constants from 'expo-constants';
import { api } from '../api.js';
import { friendlyError } from '../logic.js';
import { c } from '../theme.js';

export default function Login({ onSignedIn }) {
  const [f, setF] = useState({ orgSlug: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF({ ...f, [k]: v });

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const data = await api('/auth/login', { method: 'POST', body: { orgSlug: f.orgSlug.trim(), email: f.email.trim(), password: f.password } });
      await onSignedIn({ token: data.token, user: data.user, organization: data.organization });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const input = { borderWidth: 1, borderColor: '#d9cfce', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff', color: c.ink };
  const label = { fontSize: 14, fontWeight: '600', color: c.ink, marginTop: 14, marginBottom: 6 };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64 }} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, alignSelf: 'center' }} accessibilityLabel="ClockAm" />
        <Text style={{ fontSize: 28, fontWeight: '800', color: c.ink, textAlign: 'center', marginTop: 12 }}>Sign in to ClockAm</Text>

        <Text style={label}>Workplace ID</Text>
        <TextInput style={input} value={f.orgSlug} onChangeText={set('orgSlug')} autoCapitalize="none" autoCorrect={false} placeholder="e.g. frankiecode" />
        <Text style={label}>Email</Text>
        <TextInput style={input} value={f.email} onChangeText={set('email')} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
        <Text style={label}>Password</Text>
        <View>
          <TextInput style={{ ...input, paddingRight: 70 }} value={f.password} onChangeText={set('password')} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} />
          <Pressable onPress={() => setShow(!show)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 14 }}>
            <Text style={{ color: c.red, fontWeight: '600' }}>{show ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>

        {!!error && <Text accessibilityLiveRegion="polite" style={{ color: c.red, marginTop: 14 }}>{error}</Text>}

        <Pressable onPress={submit} disabled={busy || !f.orgSlug || !f.email || !f.password} accessibilityRole="button" style={{ backgroundColor: c.red, opacity: busy || !f.orgSlug || !f.email || !f.password ? 0.6 : 1, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Sign in</Text>}
        </Pressable>
        <Pressable onPress={() => Linking.openURL(`${Constants.expoConfig?.extra?.webUrl || 'https://clockam.vercel.app'}/forgot-password`)} accessibilityRole="link" style={{ padding: 14, alignItems: 'center' }}>
          <Text style={{ color: c.red, fontWeight: '600' }}>Forgot your password?</Text>
        </Pressable>
        <Text style={{ color: c.mute, textAlign: 'center', marginTop: 14 }}>ClockAm by Frankiecode Solutions</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
