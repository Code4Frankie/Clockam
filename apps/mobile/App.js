import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Login from './src/screens/Login.js';
import Home from './src/screens/Home.js';
import { clearSession, loadSession, saveSession } from './src/session.js';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => { loadSession().then(setSession); }, []);

  const signedIn = useCallback(async (s) => { await saveSession(s); setSession(s); }, []);
  const signOut = useCallback(async () => { await clearSession(); setSession(null); }, []);

  if (session === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <>
      <StatusBar style="dark" />
      {session ? <Home session={session} onSignOut={signOut} /> : <Login onSignedIn={signedIn} />}
    </>
  );
}
