import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
  Animated, Dimensions, StatusBar,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const DANGER       = '#EF5350';

export default function LoginScreen({ setUser }) {
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [erroMsg,    setErroMsg]    = useState('');
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPass,  setFocusPass]  = useState(false);

  const logoAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(200, [
      Animated.spring(logoAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: false }),
      Animated.spring(cardAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: false }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    setErroMsg('');
    if (!email.trim()) { setErroMsg('Preencha o e-mail'); return; }
    if (!password.trim()) { setErroMsg('Preencha a senha'); return; }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password.trim()
      );
      // Passa o objeto firebaseUser direto — onAuthStateChanged vai pegar também
      setUser(userCredential.user);
    } catch (error) {
      const code = error?.code || '';
      let msg = `Erro: ${code}`;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        msg = 'Email ou senha incorretos.\nVerifique e tente novamente.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Email inválido.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Conta bloqueada temporariamente.\nRedefina a senha no Firebase Console.';
      } else if (code === 'auth/network-request-failed') {
        msg = 'Sem conexão com a internet.';
      } else if (code === 'auth/operation-not-allowed') {
        msg = 'Login desativado no Firebase.\nAcesse Authentication → Sign-in method → Email/Password → Ativar.';
      } else if (code === 'auth/user-disabled') {
        msg = 'Usuário desativado no Firebase.';
      }
      setErroMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      <View style={s.inner}>

        {/* ── LOGO ── */}
        <Animated.View style={[s.logoWrap, { opacity: logoAnim }]}>
          <View style={s.logoBorder}>
            <Image source={require('../../assets/images/logo.png')} style={s.logoImage} resizeMode="contain" />
          </View>
          <Text style={s.logoSub}>REPRESENTAÇÕES</Text>
        </Animated.View>

        {/* ── CARD ── */}
        <Animated.View style={[s.card, { opacity: cardAnim }]}>

          <View style={s.cardHeader}>
            <View style={s.iconCircle}>
              <Text style={{ fontSize: 20 }}>🔐</Text>
            </View>
            <View>
              <Text style={s.cardTitle}>Bem-vindo</Text>
              <Text style={s.cardSub}>Acesse sua conta MAYA</Text>
            </View>
          </View>

          <View style={s.form}>

            <Text style={s.label}>E-MAIL</Text>
            <View style={[s.inputWrap, focusEmail && s.inputFocused]}>
              <Text style={s.inputIcon}>✉️</Text>
              <TextInput
                style={s.input}
                placeholder="seu@email.com"
                value={email}
                onChangeText={t => setEmail(t.trim())}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={SILVER_DARK}
                onFocus={() => setFocusEmail(true)}
                onBlur={() => setFocusEmail(false)}
              />
            </View>

            <Text style={s.label}>SENHA</Text>
            <View style={[s.inputWrap, focusPass && s.inputFocused]}>
              <Text style={s.inputIcon}>🔒</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                value={password}
                onChangeText={t => setPassword(t.trim())}
                secureTextEntry
                placeholderTextColor={SILVER_DARK}
                onFocus={() => setFocusPass(true)}
                onBlur={() => setFocusPass(false)}
              />
            </View>

            {/* ERRO VISÍVEL NA TELA */}
            {erroMsg ? (
              <View style={s.erroBox}>
                <Text style={s.erroTxt}>⚠️ {erroMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.btn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}>
              {loading
                ? <ActivityIndicator color={DARK_BG} />
                : <Text style={s.btnText}>ENTRAR</Text>
              }
            </TouchableOpacity>

          </View>

          <View style={s.footer}>
            <View style={s.footerDot} />
            <Text style={s.footerTxt}>MAYA Representações © 2025</Text>
            <View style={s.footerDot} />
          </View>

        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: DARK_BG },
  inner:        { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoWrap:     { alignItems: 'center', marginBottom: 28 },
  logoBorder:   { backgroundColor: CARD_BG, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 16, borderWidth: 1, borderColor: GOLD + '30', marginBottom: 12, elevation: 8 },
  logoImage:    { width: 220, height: 80 },
  logoSub:      { fontSize: 10, color: SILVER_DARK, letterSpacing: 4, marginTop: 8, fontWeight: '700' },
  card:         { backgroundColor: CARD_BG, borderRadius: 28, borderWidth: 1, borderColor: GOLD + '25', elevation: 12 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, paddingBottom: 12 },
  iconCircle:   { width: 46, height: 46, borderRadius: 15, backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD + '50', justifyContent: 'center', alignItems: 'center' },
  cardTitle:    { fontSize: 22, fontWeight: 'bold', color: SILVER_LIGHT },
  cardSub:      { fontSize: 12, color: SILVER_DARK, marginTop: 2 },
  form:         { paddingHorizontal: 20, paddingBottom: 8 },
  label:        { fontSize: 10, fontWeight: '700', color: SILVER_DARK, letterSpacing: 1.2, marginBottom: 7, marginTop: 14 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 2, borderWidth: 1, borderColor: '#C0D2E620' },
  inputFocused: { borderColor: GOLD + '80', backgroundColor: GOLD + '08' },
  inputIcon:    { fontSize: 15, marginRight: 10 },
  input:        { flex: 1, fontSize: 15, color: SILVER_LIGHT, paddingVertical: 14 },
  erroBox:      { backgroundColor: DANGER + '18', borderRadius: 12, borderWidth: 1, borderColor: DANGER + '60', padding: 12, marginTop: 14 },
  erroTxt:      { color: DANGER, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  btn:          { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 17, marginTop: 20, marginBottom: 4, elevation: 8 },
  btnText:      { fontSize: 16, fontWeight: 'bold', color: DARK_BG, letterSpacing: 1 },
  footer:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  footerDot:    { width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD + '50' },
  footerTxt:    { fontSize: 10, color: SILVER_DARK + '80', letterSpacing: 0.5 },
});