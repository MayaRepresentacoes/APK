import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

import { auth } from './src/services/firebase';

import LoginScreen        from './src/screens/LoginScreen';
import DashboardScreen    from './src/screens/DashboardScreen';
import ClientesScreen     from './src/screens/ClientesScreen';
import PlanejamentoScreen from './src/screens/PlanejamentoScreen';
import MapaScreen         from './src/screens/MapaScreen';
import RotasScreen        from './src/screens/RotasScreen';
import VisitasScreen      from './src/screens/VisitasScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_ICONS: Record<string, [string, string]> = {
  Dashboard:    ['grid',      'grid-outline'],
  Clientes:     ['people',    'people-outline'],
  Planejamento: ['calendar',  'calendar-outline'],
  Mapa:         ['map',       'map-outline'],
  Rotas:        ['navigate',  'navigate-outline'],
  Visitas:      ['bar-chart', 'bar-chart-outline'],
};

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   '#E8B432',
        tabBarInactiveTintColor: '#8A9BB0',
        tabBarStyle: {
          backgroundColor: '#001828',
          borderTopColor:  '#E8B43230',
          borderTopWidth:  1,
          // Respeita a safe area do Android (botões de navegação)
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          elevation: 10,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard"    component={DashboardScreen}    options={{ title: 'Início'   }} />
      <Tab.Screen name="Clientes"     component={ClientesScreen}     options={{ title: 'Clientes' }} />
      <Tab.Screen name="Planejamento" component={PlanejamentoScreen} options={{ title: 'Planejar' }} />
      <Tab.Screen name="Mapa"         component={MapaScreen}         options={{ title: 'Mapa'     }} />
      <Tab.Screen name="Rotas"        component={RotasScreen}        options={{ title: 'Rotas'    }} />
      <Tab.Screen name="Visitas"      component={VisitasScreen}      options={{ title: 'Visitas'  }} />
    </Tab.Navigator>
  );
}

function AuthStack({ setUser }: { setUser: (u: any) => void }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Login">
        {() => <LoginScreen setUser={setUser} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default function App() {
  const [user,    setUser]    = useState<any>(undefined); // undefined = ainda carregando
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#001E2E' }}>
          <ActivityIndicator size="large" color="#E8B432" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {/* Condicional pura: user logado = tabs, não logado = login */}
        {user
          ? <MainTabs />
          : <AuthStack setUser={setUser} />
        }
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
