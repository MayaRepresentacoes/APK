// App.tsx
// ════════════════════════════════════════════════════════════════
// MAYA Representações — Navegação principal
// Versão unificada — contém TODAS as telas de ambas as versões
//
// CORREÇÃO v2 — BottomTabNavigator sobrepondo UI do sistema:
//
//   [FIX] tabBarStyle.paddingBottom era hardcoded em 24 no iOS
//     → Dispositivos iPhone X+ têm home indicator de 34px.
//     → Valor fixo 24 era insuficiente: tab bar ficava por baixo
//       do indicador home, e botões ficavam inacessíveis.
//     CORREÇÃO: paddingBottom = insets.bottom + 8 (dinâmico)
//
//   [FIX] tabBarStyle.height era fixo em 82 (iOS) / 62 (Android)
//     → Não escalava para dispositivos com safe area diferente.
//     CORREÇÃO: height = 60 + insets.bottom (base + safe area)
//     → 60px base cobre ícone + label confortavelmente
//     → insets.bottom adiciona apenas o espaço do sistema
//
//   [FIX] Android com insets.bottom = 0 (sem gesture nav)
//     → Math.max(..., 8) garante padding mínimo em qualquer device
//
//   Mantido integralmente:
//     Todas as rotas, screens, tipos, AppSplash, RootNavigator,
//     estilos ts, MayaTheme, imports.
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator }          from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator }        from '@react-navigation/native-stack';
import { Icon }                              from 'react-native-elements';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Screens — Tabs ────────────────────────────────────────────
import DashboardScreen    from './src/screens/DashboardScreen';
import ClientesScreen     from './src/screens/ClientesScreen';
import PlanejamentoScreen from './src/screens/PlanejamentoScreen';
import RotasScreen        from './src/screens/RotasScreen';
import RelatoriosScreen   from './src/screens/RelatoriosScreen';

// ── Screens — Stack (acessados por navigate) ──────────────────
import ClienteDetalheScreen   from './src/screens/ClienteDetalheScreen';
import CheckinScreen          from './src/screens/CheckinScreen';
import HistoricoClienteScreen from './src/screens/HistoricoClienteScreen';
import MapaScreen             from './src/screens/MapaScreen';
import OrcamentosScreen       from './src/screens/OrcamentosScreen';
import VisitasScreen          from './src/screens/VisitasScreen';
import MetasScreen            from './src/screens/MetasScreen';
import CRMScreen              from './src/screens/CRMScreen';

// ── Firebase init ─────────────────────────────────────────────
import './src/services/firebase';

// ── Paleta ────────────────────────────────────────────────────
const GOLD        = '#E8B432';
const SILVER      = '#C0D2E6';
const SILVER_DARK = '#8A9BB0';
const DARK_BG     = '#001E2E';
const CARD_BG     = '#001828';
const CARD_BG2    = '#003352';

// ── Tema de navegação ─────────────────────────────────────────
const MayaTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary     : GOLD,
    background  : DARK_BG,
    card        : CARD_BG,
    text        : SILVER,
    border      : 'rgba(192,210,230,0.12)',
    notification: GOLD,
  },
};

// ════════════════════════════════════════════════════════════════
// TIPOS DE NAVEGAÇÃO
// ════════════════════════════════════════════════════════════════
export type RootStackParamList = {
  MainTabs         : undefined;
  ClienteDetalhe   : { cliente: any };
  HistoricoCliente : { cliente: any };
  Checkin          : { cliente: any; tipoRegistroInicial?: string };
  Orcamentos       : { cliente?: any };
  EditarCliente    : { cliente: any };
  Mapa             : undefined;
  Visitas          : undefined;
  Metas            : undefined;
  CRM              : undefined;
  // [FIX] RotaInteligente — PlanejamentoScreen navega aqui passando
  // clientes prioritários. RotasScreen aceita route.params.clientes
  // e entra automaticamente em modo IA com a lista pré-carregada.
  RotaInteligente  : { clientes?: any[] };
};

export type TabParamList = {
  Dashboard   : undefined;
  Clientes    : undefined;
  Planejamento: undefined;
  Rotas       : undefined;
  Relatorios  : undefined;
};

// ════════════════════════════════════════════════════════════════
// NAVIGATORS
// ════════════════════════════════════════════════════════════════
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab       = createBottomTabNavigator<TabParamList>();

// ════════════════════════════════════════════════════════════════
// TAB NAVIGATOR — Barra inferior principal
//
// [FIX] Usa insets.bottom dinâmico para respeitar a safe area de
// cada dispositivo. Isso resolve a sobreposição no iPhone X/11/12/
// 13/14/15 (home indicator 34px) e em Android com gesture nav.
//
// height  = 60 + insets.bottom
//   → 60px base sempre visível (ícone 22px + label 10px + gaps)
//   → insets.bottom varia: 0 (botão físico), 20-34px (gesto)
//
// paddingBottom = insets.bottom + 8
//   → Empurra o conteúdo da tab para cima do home indicator
//   → +8px de respiro visual entre label e borda inferior
// ════════════════════════════════════════════════════════════════
function MainTabs() {
  const insets = useSafeAreaInsets();

  // ── Calculados uma vez por render ──────────────────────────────
  const tabHeight     = 60 + insets.bottom;
  const tabPadBottom  = Math.max(insets.bottom + 8, 16);  // mínimo 16px

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: CARD_BG,
          borderTopWidth : 1,
          borderTopColor : 'rgba(232,180,50,0.15)',
          // [FIX] height e paddingBottom dinâmicos — não sobrepõem sistema
          height         : tabHeight,
          paddingBottom  : tabPadBottom,
          paddingTop     : 8,
          elevation      : 20,
          shadowColor    : '#000',
          shadowOffset   : { width: 0, height: -4 },
          shadowOpacity  : 0.3,
          shadowRadius   : 12,
        },
        tabBarActiveTintColor  : GOLD,
        tabBarInactiveTintColor: SILVER_DARK,
        tabBarLabelStyle: {
          fontSize  : 10,
          fontWeight: '600',
          marginTop : 1,
        },
        tabBarIcon: ({ focused, color, size: _size }) => {
          const icons: Record<string, string> = {
            Dashboard   : 'dashboard',
            Clientes    : focused ? 'people' : 'people-outline',
            Planejamento: 'event-note',
            Rotas       : 'alt-route',
            Relatorios  : 'assessment',
          };
          const iconName = icons[route.name] || 'circle';
          return (
            <View style={focused ? ts.iconActive : ts.iconInactive}>
              <Icon name={iconName} size={22} color={color} type="material" />
            </View>
          );
        },
      })}>

      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Início' }}
      />
      <Tab.Screen
        name="Clientes"
        component={ClientesScreen}
        options={{ tabBarLabel: 'Clientes' }}
      />
      <Tab.Screen
        name="Planejamento"
        component={PlanejamentoScreen}
        options={{
          tabBarLabel: 'Planejar',
          tabBarIcon : ({ focused, color: _color }) => (
            <View style={[ts.iconCentral, focused && { backgroundColor: GOLD }]}>
              <Icon
                name="event-note"
                size={24}
                color={focused ? DARK_BG : SILVER_DARK}
                type="material"
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Rotas"
        component={RotasScreen}
        options={{ tabBarLabel: 'Rotas' }}
      />
      <Tab.Screen
        name="Relatorios"
        component={RelatoriosScreen}
        options={{ tabBarLabel: 'Relatórios' }}
      />
    </Tab.Navigator>
  );
}

// ── Estilos da tab bar ────────────────────────────────────────
const ts = StyleSheet.create({
  iconActive  : { alignItems: 'center', justifyContent: 'center' },
  iconInactive: { alignItems: 'center', justifyContent: 'center' },
  iconCentral : {
    width          : 46,
    height         : 46,
    borderRadius   : 23,
    alignItems     : 'center',
    justifyContent : 'center',
    backgroundColor: CARD_BG2,
    marginTop      : -12,
    borderWidth    : 1.5,
    borderColor    : 'rgba(232,180,50,0.35)',
    elevation      : 6,
    shadowColor    : GOLD,
    shadowOffset   : { width: 0, height: 2 },
    shadowOpacity  : 0.4,
    shadowRadius   : 6,
  },
});

// ════════════════════════════════════════════════════════════════
// SPLASH LOADING INICIAL
// ════════════════════════════════════════════════════════════════
function AppSplash() {
  return (
    <View style={sp.container}>
      <View style={sp.logoWrap}>
        <Icon name="storefront" size={52} color={GOLD} type="material" />
      </View>
      <Text style={sp.titulo}>MAYA</Text>
      <Text style={sp.sub}>Representações</Text>
      <ActivityIndicator color={GOLD} style={{ marginTop: 32 }} />
    </View>
  );
}

const sp = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG, alignItems: 'center', justifyContent: 'center' },
  logoWrap : { width: 88, height: 88, borderRadius: 28, backgroundColor: '#001828', borderWidth: 1.5, borderColor: GOLD + '40', alignItems: 'center', justifyContent: 'center', marginBottom: 16, elevation: 10, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  titulo   : { fontSize: 36, fontWeight: '900', color: GOLD, letterSpacing: 4 },
  sub      : { fontSize: 14, color: SILVER_DARK, letterSpacing: 3, marginTop: 4, fontWeight: '600' },
});

// ════════════════════════════════════════════════════════════════
// ROOT NAVIGATOR — Stack principal
// ════════════════════════════════════════════════════════════════
function RootNavigator() {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown             : false,
        animation               : 'slide_from_right',
        contentStyle            : { backgroundColor: DARK_BG },
        gestureEnabled          : true,
        fullScreenGestureEnabled: true,
      }}>

      {/* ── Tabs principais ── */}
      <RootStack.Screen name="MainTabs" component={MainTabs} />

      {/* ── Modais de cliente ── */}
      <RootStack.Screen
        name="ClienteDetalhe"
        component={ClienteDetalheScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <RootStack.Screen name="HistoricoCliente" component={HistoricoClienteScreen} />
      <RootStack.Screen
        name="Checkin"
        component={CheckinScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <RootStack.Screen
        name="EditarCliente"
        component={ClientesScreen}
        options={{ animation: 'slide_from_bottom' }}
      />

      {/* ── Telas de negócio ── */}
      <RootStack.Screen name="Orcamentos" component={OrcamentosScreen} />
      <RootStack.Screen name="Mapa"       component={MapaScreen} options={{ animation: 'fade' }} />

      {/* ── Telas acessadas pelo Dashboard ── */}
      <RootStack.Screen name="Visitas"         component={VisitasScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="Metas"           component={MetasScreen}   options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen name="CRM"             component={CRMScreen}     options={{ animation: 'slide_from_right' }} />
      {/* [FIX] RotaInteligente — Planejamento passa clientes via params para RotasScreen */}
      <RootStack.Screen name="RotaInteligente" component={RotasScreen}   options={{ animation: 'slide_from_bottom' }} />

    </RootStack.Navigator>
  );
}

// ════════════════════════════════════════════════════════════════
// APP ROOT
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1200));
      } catch (e) {
        console.log('[App] init error:', e);
      } finally {
        setAppReady(true);
      }
    };
    init();
  }, []);

  if (!appReady) return <AppSplash />;

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={MayaTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
