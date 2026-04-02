import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';

import * as Location from 'expo-location';
import { Icon } from 'react-native-elements';

// 🚨 IMPORT CONDICIONAL (ESSENCIAL)
let MapView = null;
let Marker = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
}

export default function MapaScreen() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  // 📍 Buscar localização
  const getLocation = async () => {
    try {
      setLoading(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        alert('Permissão de localização negada');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    } catch (error) {
      console.log('Erro localização:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getLocation();
  }, []);

  // 🌐 BLOQUEIO WEB (NÃO QUEBRA MAIS)
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <Text style={styles.webTitle}>📍 Mapa indisponível no navegador</Text>

        <Text style={styles.webText}>
          O mapa funciona apenas no aplicativo Android ou iOS.
        </Text>

        <TouchableOpacity style={styles.button} onPress={getLocation}>
          <Text style={styles.buttonText}>Recarregar localização</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ⏳ Loading
  if (loading || !location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8B432" />
        <Text style={styles.loadingText}>Carregando mapa...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          title="Sua localização"
          description="Você está aqui"
        />
      </MapView>

      {/* 🔄 Botão recarregar */}
      <TouchableOpacity style={styles.fab} onPress={getLocation}>
        <Icon name="refresh" color="#001E2E" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#001E2E',
  },

  loadingText: {
    marginTop: 10,
    color: '#E8EEF5',
  },

  webContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#001E2E',
    padding: 20,
  },

  webTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E8EEF5',
    marginBottom: 10,
    textAlign: 'center',
  },

  webText: {
    color: '#8A9BB0',
    textAlign: 'center',
    marginBottom: 20,
  },

  button: {
    backgroundColor: '#E8B432',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },

  buttonText: {
    color: '#001E2E',
    fontWeight: 'bold',
  },

  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#E8B432',
    padding: 15,
    borderRadius: 50,
    elevation: 5,
  },
});