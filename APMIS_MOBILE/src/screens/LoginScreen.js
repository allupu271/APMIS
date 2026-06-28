import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { usePump } from '../context/PumpContext';
import { useTheme } from '../theme/ThemeContext';
import { Screen, Field, Button, ThemeToggle } from '../components';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = '176554484893-48gg0k5k5k21qc002soglji5h14ho9k5.apps.googleusercontent.com';
const WEB_CLIENT_ID = '176554484893-387jhseqt5ajbo833kd7nebr05c4in9g.apps.googleusercontent.com';

export default function LoginScreen() {
  const { setUser, setIdToken } = usePump();
  const { theme } = useTheme();
  const c = theme.colors;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri({
  native: 'com.googleusercontent.apps.176554484893-48gg0k5k5k21qc002soglji5h14ho9k5:/oauth2redirect/google'
});

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
    redirectUri,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      setLoading(true);
      signInWithCredential(auth, credential)
        .then(handleSuccess)
        .catch(handleError)
        .finally(() => setLoading(false));
    }
  }, [response]);

  async function handleSuccess(userCredential) {
    const token = await userCredential.user.getIdToken();
    setUser(userCredential.user);
    setIdToken(token);
    // AppNavigator re-renders automatically when user is set
  }

  function handleError(err) {
    setError(err.message ?? 'Authentication failed');
  }

  async function handleLogin() {
    if (!email || !password) { setError('Enter email and password'); return; }
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await handleSuccess(cred);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!email || !password) { setError('Enter email and password'); return; }
    setError('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await handleSuccess(cred);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.toggle}><ThemeToggle /></View>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
          <Animated.View entering={FadeInDown.duration(600)} style={styles.hero}>
            <LinearGradient
              colors={c.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logo}
            >
              <Ionicons name="leaf" size={44} color="#fff" />
            </LinearGradient>
            <Text style={[styles.title, { color: c.text }]}>APMIS</Text>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>
              Automated Plant Irrigation
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(120)} style={styles.form}>
            <Field
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              icon="lock-closed-outline"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error ? (
              <Animated.View entering={FadeIn} style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                <Ionicons name="alert-circle" size={16} color={c.danger} />
                <Text style={[styles.error, { color: c.danger }]}>{error}</Text>
              </Animated.View>
            ) : null}

            <View style={styles.actions}>
              <Button title="Login" icon="log-in-outline" onPress={handleLogin} loading={loading} />
              <Button title="Create account" variant="outline" onPress={handleRegister} disabled={loading} style={{ marginTop: 12 }} />
            </View>

            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: c.cardBorder }]} />
              <Text style={[styles.dividerText, { color: c.textFaint }]}>or</Text>
              <View style={[styles.line, { backgroundColor: c.cardBorder }]} />
            </View>

            <Button
              title="Continue with Google"
              variant="ghost"
              icon="logo-google"
              onPress={() => promptAsync()}
              disabled={!request || loading}
              style={[styles.googleBtn, { borderColor: c.cardBorder, backgroundColor: c.card }]}
            />
          </Animated.View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle:      { position: 'absolute', right: 16, top: 8, zIndex: 10 },
  container:   { flexGrow: 1, padding: 28, justifyContent: 'center' },
  hero:        { alignItems: 'center', marginBottom: 36 },
  logo:        {
    width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
    shadowColor: '#2E7D32', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 8,
  },
  title:       { fontSize: 36, fontWeight: '800', letterSpacing: 1 },
  subtitle:    { fontSize: 15, marginTop: 4 },
  form:        { gap: 14 },
  actions:     { marginTop: 8 },
  errorBox:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  error:       { fontSize: 13, flex: 1 },
  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  line:        { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },
  googleBtn:   { borderWidth: 1.5 },
});
