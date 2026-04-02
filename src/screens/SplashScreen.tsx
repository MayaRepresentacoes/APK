// src/screens/SplashScreen.js
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions,
  StatusBar, Platform, Image,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

const GOLD         = '#E8B432';
const GOLD_LIGHT   = '#F5D080';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const SILVER       = '#C0D2E6';
const SILVER_DARK  = '#8A9BB0';

// ════════════════════════════════════════════════════════════════
// 📁 COLOQUE SUA LOGO AQUI:
//    src/assets/logo.png
//
// Tamanho recomendado: 400x400 px (fundo transparente .png)
// ════════════════════════════════════════════════════════════════
const LOGO = require('../assets/logo.png');

// ── Partícula dourada animada ─────────────────────────────────
function Particula({ delay, x, size }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.7, duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -40, duration: 2400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0, duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: 0, duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[
      pt.particula,
      {
        left: x, width: size, height: size,
        borderRadius: size / 2,
        opacity, transform: [{ translateY }],
      },
    ]} />
  );
}
const pt = StyleSheet.create({
  particula: { position: 'absolute', bottom: 0, backgroundColor: GOLD },
});

// ── Barra de progresso ────────────────────────────────────────
function BarraProgresso({ progresso }) {
  return (
    <View style={bp.track}>
      <Animated.View style={[bp.fill, {
        width: progresso.interpolate({
          inputRange: [0, 1],
          outputRange: ['0%', '100%'],
        }),
      }]} />
      {/* Brilho deslizando */}
      <Animated.View style={[bp.brilho, {
        left: progresso.interpolate({
          inputRange: [0, 1],
          outputRange: ['-30%', '110%'],
        }),
      }]} />
    </View>
  );
}
const bp = StyleSheet.create({
  track : { height: 4, width: SW * 0.6, backgroundColor: CARD_BG, borderRadius: 2, overflow: 'hidden', position: 'relative' },
  fill  : { height: '100%', backgroundColor: GOLD, borderRadius: 2 },
  brilho: { position: 'absolute', top: 0, width: 30, height: '100%', backgroundColor: 'rgba(255,255,255,0.5)', transform: [{ skewX: '-20deg' }] },
});

// ── Anel pulsante ao redor da logo ────────────────────────────
function AnelPulsante({ delay, tamanho, cor }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.35, duration: 1800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,    duration: 1800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={{
      position    : 'absolute',
      width       : tamanho,
      height      : tamanho,
      borderRadius: tamanho / 2,
      borderWidth : 1.5,
      borderColor : cor,
      opacity,
      transform   : [{ scale }],
    }} />
  );
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function SplashScreen() {
  // Animações principais
  const fadeGeral    = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.5)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const slideTexto   = useRef(new Animated.Value(30)).current;
  const fadeTexto    = useRef(new Animated.Value(0)).current;
  const progresso    = useRef(new Animated.Value(0)).current;
  const rotateLine   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequência de entrada
    Animated.sequence([
      // 1. Fundo aparece
      Animated.timing(fadeGeral, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }),
      // 2. Logo entra com spring
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1, friction: 6, tension: 80, useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1, duration: 600, useNativeDriver: true,
        }),
      ]),
      // 3. Texto sobe
      Animated.parallel([
        Animated.timing(slideTexto, {
          toValue: 0, duration: 500, useNativeDriver: true,
        }),
        Animated.timing(fadeTexto, {
          toValue: 1, duration: 500, useNativeDriver: true,
        }),
      ]),
      // 4. Barra de progresso
      Animated.timing(progresso, {
        toValue: 1, duration: 2000, useNativeDriver: false,
      }),
    ]).start();

    // Rotação contínua do anel decorativo
    Animated.loop(
      Animated.timing(rotateLine, {
        toValue: 1, duration: 6000, useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotateInterp = rotateLine.interpolate({
    inputRange : [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Partículas
  const particulas = [
    { delay: 0,    x: SW * 0.15, size: 5  },
    { delay: 300,  x: SW * 0.30, size: 3  },
    { delay: 600,  x: SW * 0.50, size: 6  },
    { delay: 200,  x: SW * 0.65, size: 4  },
    { delay: 900,  x: SW * 0.78, size: 3  },
    { delay: 400,  x: SW * 0.88, size: 5  },
  ];

  return (
    <Animated.View style={[s.container, { opacity: fadeGeral }]}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

      {/* ── Partículas de fundo ── */}
      <View style={s.particulasWrap} pointerEvents="none">
        {particulas.map((p, i) => (
          <Particula key={i} delay={p.delay} x={p.x} size={p.size} />
        ))}
      </View>

      {/* ── Gradiente de fundo decorativo ── */}
      <View style={s.bgCircle1} />
      <View style={s.bgCircle2} />

      {/* ── Conteúdo central ── */}
      <View style={s.centro}>

        {/* Container da logo com anéis */}
        <View style={s.logoContainer}>

          {/* Anéis pulsantes */}
          <AnelPulsante delay={0}    tamanho={180} cor={GOLD + '60'} />
          <AnelPulsante delay={600}  tamanho={210} cor={GOLD + '30'} />
          <AnelPulsante delay={1200} tamanho={240} cor={GOLD + '15'} />

          {/* Anel giratório */}
          <Animated.View style={[s.anelGiratorio, { transform: [{ rotate: rotateInterp }] }]}>
            <View style={s.anelPonto} />
          </Animated.View>

          {/* Círculo da logo */}
          <View style={s.logoCirculo}>
            <Image
              source={LOGO}
              style={s.logo}
              resizeMode="contain"
            />
          </View>

        </View>

        {/* Textos */}
        <Animated.View style={[
          s.textoWrap,
          { opacity: fadeTexto, transform: [{ translateY: slideTexto }] },
        ]}>
          <Text style={s.nomeApp}>MAYA Representações</Text>
          <Text style={s.tagline}>Gestão Comercial Inteligente</Text>

          {/* Divisor dourado */}
          <View style={s.divisor}>
            <View style={s.divisorLinha} />
            <View style={s.divisorDiamante} />
            <View style={s.divisorLinha} />
          </View>

          {/* Barra de progresso */}
          <BarraProgresso progresso={progresso} />

          {/* Texto carregando */}
          <Animated.Text style={[s.carregandoTxt, { opacity: fadeTexto }]}>
            Carregando seu painel...
          </Animated.Text>
        </Animated.View>

      </View>

      {/* ── Rodapé ── */}
      <Animated.View style={[s.rodape, { opacity: fadeTexto }]}>
        <Text style={s.versaoTxt}>v1.0.0</Text>
        <View style={s.rodapePonto} />
        <Text style={s.rodapeTxt}>Anderson · MAYA Representações</Text>
      </Animated.View>

    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container     : { flex: 1, backgroundColor: DARK_BG, alignItems: 'center', justifyContent: 'center' },

  // Fundo decorativo
  bgCircle1     : { position: 'absolute', width: SW * 1.4, height: SW * 1.4, borderRadius: SW * 0.7, backgroundColor: GOLD + '07', top: -SW * 0.5 },
  bgCircle2     : { position: 'absolute', width: SW * 1.2, height: SW * 1.2, borderRadius: SW * 0.6, backgroundColor: '#003352', bottom: -SW * 0.6 },
  particulasWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },

  // Centro
  centro        : { alignItems: 'center', gap: 32 },

  // Logo
  logoContainer : { alignItems: 'center', justifyContent: 'center', width: 240, height: 240 },
  anelGiratorio : { position: 'absolute', width: 200, height: 200, borderRadius: 100 },
  anelPonto     : { position: 'absolute', top: 0, left: '50%', marginLeft: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD },
  logoCirculo   : { width: 140, height: 140, borderRadius: 70, backgroundColor: CARD_BG, borderWidth: 2, borderColor: GOLD + '40', justifyContent: 'center', alignItems: 'center', elevation: 20, shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20 },
  logo          : { width: 110, height: 110 },

  // Textos
  textoWrap     : { alignItems: 'center', gap: 10 },
  nomeApp       : { fontSize: 22, fontWeight: '900', color: SILVER, letterSpacing: 1.5 },
  tagline       : { fontSize: 12, color: SILVER_DARK, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600' },

  // Divisor
  divisor       : { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 },
  divisorLinha  : { flex: 1, height: 1, backgroundColor: GOLD + '40', maxWidth: 60 },
  divisorDiamante:{ width: 6, height: 6, backgroundColor: GOLD, transform: [{ rotate: '45deg' }] },

  // Barra e texto carregando
  carregandoTxt : { fontSize: 11, color: SILVER_DARK, fontWeight: '600', letterSpacing: 0.5, marginTop: 8 },

  // Rodapé
  rodape        : { position: 'absolute', bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  versaoTxt     : { fontSize: 10, color: SILVER_DARK + '80', fontWeight: '600' },
  rodapePonto   : { width: 3, height: 3, borderRadius: 1.5, backgroundColor: SILVER_DARK + '60' },
  rodapeTxt     : { fontSize: 10, color: SILVER_DARK + '80', fontWeight: '600' },
});
