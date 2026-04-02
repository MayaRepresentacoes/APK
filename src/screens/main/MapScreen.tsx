// src/screens/main/MapScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Text,
  Platform
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { useLocation } from '@hooks/useLocation';
import { usePermissions } from '@hooks/usePermissions';
import ENV from '@config/env';

interface Client {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  lastVisit?: Date;
}

export function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const { location, getCurrentLocation, startWatching } = useLocation({
    enableHighAccuracy: true,
    timeInterval: 10000,
    distanceInterval: 20
  });
  
  const { permissions, requestLocation } = usePermissions();
  
  const [clients, setClients] = useState<Client[]>([
    // Dados mockados - substituir por dados reais do Firebase
    {
      id: '1',
      name: 'Cliente A',
      latitude: -23.5505,
      longitude: -46.6333,
      address: 'Av. Paulista, 1000'
    },
    {
      id: '2',
      name: 'Cliente B',
      latitude: -23.5605,
      longitude: -46.6433,
      address: 'Rua Augusta, 500'
    },
    {
      id: '3',
      name: 'Cliente C',
      latitude: -23.5405,
      longitude: -46.6233,
      address: 'Av. Brigadeiro Faria Lima, 2000'
    }
  ]);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [region, setRegion] = useState<Region>({
    latitude: -23.5505,
    longitude: -46.6333,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421
  });

  useEffect(() => {
    checkPermissionsAndGetLocation();
    startWatching();
  }, []);

  useEffect(() => {
    if (location) {
      setRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421
      });
    }
  }, [location]);

  const checkPermissionsAndGetLocation = async () => {
    if (permissions.location !== 'granted') {
      const granted = await requestLocation();
      if (granted) {
        getCurrentLocation();
      }
    } else {
      getCurrentLocation();
    }
  };

  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      }, 1000);
    } else {
      Alert.alert('Localização não disponível', 'Não foi possível obter sua localização atual.');
    }
  };

  const openInMaps = (client: Client) => {
    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q='
    });
    const latLng = `${client.latitude},${client.longitude}`;
    const label = client.name;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });

    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        region={region}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
        showsBuildings={true}
        showsTraffic={false}
        mapType="standard"
        provider={Platform.OS === 'android' ? 'google' : undefined}
        onMarkerPress={(e) => {
          const client = clients.find(c => c.id === e.nativeEvent.id);
          setSelectedClient(client || null);
        }}
      >
        {clients.map((client) => (
          <Marker
            key={client.id}
            identifier={client.id}
            coordinate={{
              latitude: client.latitude,
              longitude: client.longitude
            }}
            title={client.name}
            description={client.address}
            pinColor="#007AFF"
          />
        ))}
      </MapView>

      {/* Botão de centralizar */}
      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={24} color="#001E2E" />
      </TouchableOpacity>

      {/* Botão de zoom in */}
      <TouchableOpacity 
        style={styles.zoomInButton} 
        onPress={() => {
          if (mapRef.current) {
            mapRef.current.getCamera().then((cam) => {
              cam.zoom = (cam.zoom || 15) + 1;
              mapRef.current?.animateCamera(cam);
            });
          }
        }}
      >
        <Ionicons name="add" size={24} color="#001E2E" />
      </TouchableOpacity>

      {/* Botão de zoom out */}
      <TouchableOpacity 
        style={styles.zoomOutButton} 
        onPress={() => {
          if (mapRef.current) {
            mapRef.current.getCamera().then((cam) => {
              cam.zoom = (cam.zoom || 15) - 1;
              mapRef.current?.animateCamera(cam);
            });
          }
        }}
      >
        <Ionicons name="remove" size={24} color="#001E2E" />
      </TouchableOpacity>

      {/* Card do cliente selecionado */}
      {selectedClient && (
        <View style={styles.clientCard}>
          <Text style={styles.clientName}>{selectedClient.name}</Text>
          <Text style={styles.clientAddress}>{selectedClient.address}</Text>
          <View style={styles.cardButtons}>
            <TouchableOpacity 
              style={[styles.cardButton, styles.routeButton]}
              onPress={() => {
                // Navegar para otimização de rota
                console.log('Otimizar rota para:', selectedClient);
              }}
            >
              <Ionicons name="git-network" size={20} color="#FFF" />
              <Text style={styles.buttonText}>Otimizar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.cardButton, styles.navigateButton]}
              onPress={() => openInMaps(selectedClient)}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.buttonText}>Ir</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.cardButton, styles.checkinButton]}
              onPress={() => {
                // Registrar check-in
                console.log('Check-in em:', selectedClient);
              }}
            >
              <Ionicons name="checkmark" size={20} color="#FFF" />
              <Text style={styles.buttonText}>Check-in</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setSelectedClient(null)}
          >
            <Ionicons name="close" size={20} color="#001E2E" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001E2E'
  },
  map: {
    flex: 1
  },
  centerButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    backgroundColor: '#FFF',
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  zoomInButton: {
    position: 'absolute',
    bottom: 180,
    right: 20,
    backgroundColor: '#FFF',
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  zoomOutButton: {
    position: 'absolute',
    bottom: 240,
    right: 20,
    backgroundColor: '#FFF',
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  clientCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#001E2E',
    marginBottom: 4
  },
  clientAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12
  },
  cardButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  cardButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 4
  },
  routeButton: {
    backgroundColor: '#007AFF'
  },
  navigateButton: {
    backgroundColor: '#34C759'
  },
  checkinButton: {
    backgroundColor: '#001E2E'
  },
  buttonText: {
    color: '#FFF',
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500'
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4
  }
});

export default MapScreen;