import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { api } from '../api.js';
import { fmtTime, friendlyError, isOnBreak, nextAction, needsLocation, todayKey } from '../logic.js';
import { c } from '../theme.js';

async function confirmItsYou(action) {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
  if (!enrolled) throw new Error('Set up a fingerprint or face unlock in your phone settings, then try again.');
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: action === 'out' ? 'Confirm it is you to clock out' : action === 'break' ? 'Confirm it is you to start or end your break' : 'Confirm it is you to clock in',
    cancelLabel: 'Cancel',
    disableDeviceFallback: true, // fingerprint or face only, no PIN
  });
  if (!r.success) throw new Error(r.error === 'user_cancel' ? 'Cancelled.' : 'Fingerprint not recognised. Try again.');
}

async function currentLocation() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('This workplace needs your location to clock in. Allow location for ClockAm in your phone settings.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

export default function Home({ session, onSignOut, onOrgChange }) {
  const { token, user, organization } = session;
  const tz = organization?.timezone || 'Africa/Lagos';
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // The workplace settings (such as the location check) can change after sign-in, so ask for the current ones.
  async function freshOrganization() {
    try {
      const me = await api('/auth/me', { token });
      if (JSON.stringify(me.organization) !== JSON.stringify(organization)) onOrgChange?.(me.organization);
      return me.organization;
    } catch (e) {
      if (e.status === 401) throw e;
      return organization; // offline or server busy: use what we have
    }
  }

  const load = useCallback(async () => {
    try {
      setRecords(await api('/attendance/me', { token }));
    } catch (e) {
      if (e.status === 401) return onSignOut();
      setMsg({ type: 'err', text: friendlyError(e) });
      setRecords((r) => r || []);
    }
  }, [token, onSignOut]);
  useEffect(() => { load(); }, [load]);

  const today = records?.find((r) => r.date === todayKey(tz));
  const action = nextAction(today);

  async function clock() {
    setMsg({ type: '', text: '' });
    setBusy(true);
    try {
      await confirmItsYou(action.kind);
      const location = needsLocation(await freshOrganization()) ? await currentLocation() : undefined;
      const res = await api('/attendance/clock', { method: 'POST', token, body: location ? { location } : {} });
      setMsg({ type: 'ok', text: res.action === 'clock-in' ? (res.record.status === 'late' ? 'Clocked in. You are marked late.' : 'Clocked in. Have a good day.') : 'Clocked out. See you next time.' });
      await load();
    } catch (e) {
      if (e.status === 401) return onSignOut();
      setMsg({ type: 'err', text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const onBreak = isOnBreak(today);
  const disabled = busy || action.kind === 'done' || records === null;

  async function toggleBreak() {
    setMsg({ type: '', text: '' });
    setBusy(true);
    try {
      await confirmItsYou('break');
      const location = needsLocation(await freshOrganization()) ? await currentLocation() : undefined;
      const res = await api('/attendance/break', { method: 'POST', token, body: location ? { location } : {} });
      setMsg({ type: 'ok', text: res.action === 'break-start' ? 'Break started.' : 'Welcome back. Break ended.' });
      await load();
    } catch (e) {
      if (e.status === 401) return onSignOut();
      setMsg({ type: 'err', text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 24, paddingTop: 56, backgroundColor: c.wash }}>
        <Text style={{ color: c.mute }}>{organization?.name}</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: c.ink }}>Hello, {user.name?.split(' ')[0]}</Text>
        <Text style={{ color: c.mute, marginTop: 6 }}>
          {today ? `In ${fmtTime(today.clockIn, tz)}${today.clockOut ? `, out ${fmtTime(today.clockOut, tz)}` : ''}${today.status === 'late' ? ' (late)' : ''}${onBreak ? ' · on break' : ''}` : 'Not clocked in today'}
        </Text>
      </View>

      <View style={{ padding: 24 }}>
        <Pressable onPress={clock} disabled={disabled} accessibilityRole="button" style={{ backgroundColor: action.kind === 'done' ? c.ok : c.red, opacity: disabled && action.kind !== 'done' ? 0.6 : 1, borderRadius: 14, paddingVertical: 28, alignItems: 'center' }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 24 }}>{action.label}</Text>}
        </Pressable>
        {today && !today.clockOut && (
          <Pressable onPress={toggleBreak} disabled={busy} accessibilityRole="button" style={{ marginTop: 12, borderWidth: 2, borderColor: c.red, opacity: busy ? 0.6 : 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: c.red, fontWeight: '700', fontSize: 16 }}>{onBreak ? 'End break' : 'Start break'}</Text>
          </Pressable>
        )}
        {!!msg.text && <Text accessibilityLiveRegion="polite" style={{ marginTop: 14, color: msg.type === 'ok' ? c.ok : c.red, fontWeight: '500' }}>{msg.text}</Text>}
      </View>

      <Text style={{ paddingHorizontal: 24, fontWeight: '700', color: c.ink, fontSize: 16 }}>Recent days</Text>
      <FlatList
        data={records || []}
        keyExtractor={(r) => r._id || r.date}
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={records ? <Text style={{ color: c.mute, marginTop: 12 }}>No attendance yet. Clock in to see it here.</Text> : <ActivityIndicator style={{ marginTop: 16 }} />}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Text style={{ color: c.ink }}>{item.date}</Text>
            <Text style={{ color: item.status === 'late' ? c.warn : c.mute }}>{fmtTime(item.clockIn, tz)} – {fmtTime(item.clockOut, tz)}{item.status === 'late' ? ' · late' : ''}</Text>
          </View>
        )}
      />

      <Pressable onPress={onSignOut} accessibilityRole="button" style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: c.red, fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
