import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Image, Animated, Dimensions, StatusBar,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { Icon } from 'react-native-elements';

const { width: SW, height: SH } = Dimensions.get('window');

const GOLD         = '#E8B432';
const GOLD_LIGHT   = '#F5D07A';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const SILVER       = '#C0D2E6';
const SILVER_DARK  = '#8A9BB0';
const SILVER_LIGHT = '#E8EEF5';

// ── Partícula decorativa animada ────────────────────────────
function Particle({ delay, x, size, color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setTimeout(() => {
      Animated.loop(
        Animated.timing(anim, { toValue: 1, duration: 4000 + Math.random() * 3000, useNativeDriver: true })
      ).start();
    }, delay);
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute',
      left: x,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 0] }),
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [SH, -100] }) }],
    }} />
  );
}

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const logoAnim  = useRef(new Animated.Value(0)).current;
  const formAnim  = useRef(new Animated.Value(60)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(logoAnim,  { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      Animated.spring(formAnim,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email || !password) {
      shake();
      Alert.alert('Campos obrigatórios', 'Preencha e-mail e senha para continuar.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      // onAuthStateChanged no App.tsx cuida da navegação automaticamente
    } catch (error) {
      shake();
      let mensagem = 'Erro ao fazer login';
      if      (error.code === 'auth/user-not-found')          mensagem = 'Usuário não encontrado';
      else if (error.code === 'auth/wrong-password')          mensagem = 'Senha incorreta';
      else if (error.code === 'auth/invalid-email')           mensagem = 'E-mail inválido';
      else if (error.code === 'auth/invalid-credential')      mensagem = 'E-mail ou senha incorretos';
      else if (error.code === 'auth/too-many-requests')       mensagem = 'Muitas tentativas. Aguarde e tente novamente';
      else if (error.code === 'auth/network-request-failed')  mensagem = 'Sem conexão. Verifique sua internet';
      Alert.alert('Erro de acesso', mensagem);
    } finally {
      setLoading(false);
    }
  };

  const particles = [
    { x: SW * 0.1,  size: 4,  color: GOLD + '60',   delay: 0    },
    { x: SW * 0.25, size: 6,  color: GOLD + '40',   delay: 800  },
    { x: SW * 0.5,  size: 3,  color: SILVER + '50', delay: 1600 },
    { x: SW * 0.7,  size: 5,  color: GOLD + '50',   delay: 400  },
    { x: SW * 0.85, size: 4,  color: SILVER + '40', delay: 1200 },
    { x: SW * 0.4,  size: 3,  color: GOLD + '30',   delay: 2000 },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={ls.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      {/* Partículas de fundo */}
      {particles.map((p, i) => <Particle key={i} {...p} />)}

      {/* Círculos decorativos */}
      <View style={[ls.circle, ls.circle1]} />
      <View style={[ls.circle, ls.circle2]} />
      <View style={[ls.circle, ls.circle3]} />

      <Animated.View style={[ls.inner, { opacity: fadeAnim }]}>

        {/* ── LOGO ── */}
        <Animated.View style={[ls.logoWrap, {
          transform: [
            { scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            { translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
          ],
        }]}>
          <View style={ls.logoShadow}>
            <Image source={require('../../assets/images/logo.png')} style={ls.logo} resizeMode="contain" />
          </View>
          <View style={ls.logoUnderline}>
            <View style={ls.underlineLeft} />
            <View style={ls.underlineDot} />
            <View style={ls.underlineRight} />
          </View>
          <Text style={ls.logoSubtitle}>Representações Comerciais</Text>
        </Animated.View>

        {/* ── FORM CARD ── */}
        <Animated.View style={[ls.card, {
          transform: [
            { translateY: formAnim },
            { translateX: shakeAnim },
          ],
        }]}>
          {/* Linha dourada topo */}
          <View style={ls.cardTopBar} />

          <Text style={ls.cardTitle}>Acesso ao Sistema</Text>
          <Text style={ls.cardSub}>Entre com suas credenciais para continuar</Text>

          {/* E-mail */}
          <View style={ls.fieldWrap}>
            <Text style={ls.fieldLabel}>E-MAIL</Text>
            <View style={ls.inputRow}>
              <Icon name="email" size={16} color={SILVER_DARK} style={{ marginRight: 10 }} />
              <TextInput
                style={ls.input}
                placeholder="seu@email.com"
                placeholderTextColor={SILVER_DARK}
                value={email}
                onChangeText={t => setEmail(t.trim())}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Senha */}
          <View style={ls.fieldWrap}>
            <Text style={ls.fieldLabel}>SENHA</Text>
            <View style={ls.inputRow}>
              <Icon name="lock" size={16} color={SILVER_DARK} style={{ marginRight: 10 }} />
              <TextInput
                style={ls.input}
                placeholder="••••••••"
                placeholderTextColor={SILVER_DARK}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity onPress={() => setShowPass(p => !p)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name={showPass ? 'visibility-off' : 'visibility'} size={16} color={SILVER_DARK} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Botão entrar */}
          <TouchableOpacity
            style={[ls.btn, loading && ls.btnLoading]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={DARK_BG} size="small" />
            ) : (
              <>
                <Icon name="login" size={18} color={DARK_BG} style={{ marginRight: 8 }} />
                <Text style={ls.btnText}>ENTRAR</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Rodapé */}
          <View style={ls.footer}>
            <View style={ls.footerLine} />
            <Text style={ls.footerText}>MAYA © {new Date().getFullYear()}</Text>
            <View style={ls.footerLine} />
          </View>
        </Animated.View>

      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const ls = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  inner:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },

  // Círculos decorativos
  circle:  { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  circle1: { width: 300, height: 300, borderColor: GOLD + '12', top: -80,   left: -80   },
  circle2: { width: 200, height: 200, borderColor: GOLD + '18', bottom: 40, right: -60  },
  circle3: { width: 140, height: 140, borderColor: SILVER + '10', top: SH * 0.4, right: 20 },

  // Logo
  logoWrap:     { alignItems: 'center', marginBottom: 36, width: '100%' },
  logoShadow:   { shadowColor: GOLD, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 12 },
  logo:         { width: SW * 0.62, height: 80 },
  logoUnderline:{ flexDirection: 'row', alignItems: 'center', marginTop: 12, width: SW * 0.5 },
  underlineLeft: { flex: 1, height: 1, backgroundColor: GOLD + '40' },
  underlineDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: GOLD, marginHorizontal: 8 },
  underlineRight:{ flex: 1, height: 1, backgroundColor: GOLD + '40' },
  logoSubtitle:  { fontSize: 11, color: SILVER_DARK, letterSpacing: 2.5, marginTop: 8, textTransform: 'uppercase' },

  // Card
  card:       { width: '100%', backgroundColor: CARD_BG, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: GOLD + '30', shadowColor: GOLD, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  cardTopBar: { height: 3, backgroundColor: GOLD, width: '100%' },
  cardTitle:  { fontSize: 20, fontWeight: 'bold', color: SILVER_LIGHT, marginTop: 24, marginHorizontal: 24 },
  cardSub:    { fontSize: 12, color: SILVER_DARK, marginTop: 4, marginHorizontal: 24, marginBottom: 20 },

  // Fields
  fieldWrap:  { marginHorizontal: 24, marginBottom: 16 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 1.5, marginBottom: 8 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: SILVER + '20' },
  input:      { flex: 1, fontSize: 14, color: SILVER_LIGHT, paddingVertical: 12 },

  // Botão
  btn:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginHorizontal: 24, marginTop: 8, backgroundColor: GOLD, borderRadius: 16, paddingVertical: 16, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  btnLoading: { opacity: 0.75 },
  btnText:    { fontSize: 16, fontWeight: 'bold', color: DARK_BG, letterSpacing: 1 },

  // Footer
  footer:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, marginTop: 24, marginBottom: 24 },
  footerLine: { flex: 1, height: 1, backgroundColor: SILVER + '18' },
  footerText: { fontSize: 10, color: SILVER_DARK, marginHorizontal: 10, letterSpacing: 1 },
});