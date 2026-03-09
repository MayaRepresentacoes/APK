import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

import { auth } from './src/services/firebase';

// Importar telas
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ClientesScreen from './src/screens/ClientesScreen';
import PlanejamentoScreen from './src/screens/PlanejamentoScreen';
import MapaScreen from './src/screens/MapaScreen';
import RotasScreen from './src/screens/RotasScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, [string, string]> = {
  Dashboard: ['grid', 'grid-outline'],
  Clientes: ['people', 'people-outline'],
  Planejamento: ['calendar', 'calendar-outline'],
  Mapa: ['map', 'map-outline'],
  Rotas: ['navigate', 'navigate-outline'],
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#E8B432',
        tabBarInactiveTintColor: '#8A9BB0',
        tabBarStyle: {
          backgroundColor: '#001828',
          borderTopColor: '#E8B43230',
          borderTopWidth: 1,
          height: 62 + bottomPad,
          paddingBottom: bottomPad + 4,
          paddingTop: 6,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          elevation: 20,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Início' }} />
      <Tab.Screen name="Clientes" component={ClientesScreen} options={{ title: 'Clientes' }} />
      <Tab.Screen name="Planejamento" component={PlanejamentoScreen} options={{ title: 'Planejar' }} />
      <Tab.Screen name="Mapa" component={MapaScreen} options={{ title: 'Mapa' }} />
      <Tab.Screen name="Rotas" component={RotasScreen} options={{ title: 'Rotas' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
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
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <Stack.Screen name="MainTabs" component={MainTabs} />
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}