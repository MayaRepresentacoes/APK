// src/hooks/useLocation.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { Alert, Platform, AppState, AppStateStatus } from 'react-native';

// Tipos
export interface LocationState {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp?: number;
}

export interface LocationError {
  code: string;
  message: string;
}

export interface UseLocationOptions {
  enableHighAccuracy?: boolean;
  timeInterval?: number;
  distanceInterval?: number;
  backgroundUpdates?: boolean;
  showsBackgroundLocationIndicator?: boolean;
  pausesUpdatesAutomatically?: boolean;
  activityType?: Location.LocationActivityType;
}

export interface UseLocationReturn {
  location: LocationState | null;
  error: LocationError | null;
  loading: boolean;
  permissionStatus: Location.PermissionStatus | null;
  getCurrentLocation: () => Promise<LocationState | null>;
  startWatching: () => Promise<void>;
  stopWatching: () => void;
  requestPermissions: () => Promise<boolean>;
  checkPermissions: () => Promise<Location.PermissionStatus>;
  isWatching: boolean;
  getAddressFromCoordinates: (latitude: number, longitude: number) => Promise<string | null>;
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number;
  geocodeAddress: (address: string) => Promise<{ latitude: number; longitude: number } | null>;
}

export function useLocation(options?: UseLocationOptions): UseLocationReturn {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [error, setError] = useState<LocationError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isWatching, setIsWatching] = useState<boolean>(false);
  
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const appState = useRef(AppState.currentState);
  const optionsRef = useRef<UseLocationOptions>({
    enableHighAccuracy: true,
    timeInterval: 5000,
    distanceInterval: 10,
    backgroundUpdates: false,
    showsBackgroundLocationIndicator: false,
    pausesUpdatesAutomatically: true,
    activityType: Location.LocationActivityType.Other,
    ...options
  });

  // Verificar permissões
  const checkPermissions = useCallback(async (): Promise<Location.PermissionStatus> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(status);
      return status;
    } catch (err) {
      console.error('Erro ao verificar permissões:', err);
      setError({
        code: 'PERMISSION_CHECK_ERROR',
        message: 'Erro ao verificar permissões de localização'
      });
      return Location.PermissionStatus.UNDETERMINED;
    }
  }, []);

  // Solicitar permissões
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      
      // Solicitar permissão de foreground
      let { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        setPermissionStatus(Location.PermissionStatus.DENIED);
        setError({
          code: 'PERMISSION_DENIED',
          message: 'Permissão de localização negada'
        });
        
        Alert.alert(
          'Permissão Necessária',
          'O MAYA precisa da sua localização para funcionar corretamente. Por favor, permita o acesso nas configurações do dispositivo.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }

      // Se necessário, solicitar permissão de background
      if (optionsRef.current.backgroundUpdates && Platform.OS === 'android') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.log('Permissão de localização em background negada');
        }
      }

      setPermissionStatus(Location.PermissionStatus.GRANTED);
      setError(null);
      return true;
    } catch (err) {
      console.error('Erro ao solicitar permissões:', err);
      setError({
        code: 'PERMISSION_REQUEST_ERROR',
        message: 'Erro ao solicitar permissões de localização'
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Obter localização atual
  const getCurrentLocation = useCallback(async (): Promise<LocationState | null> => {
    try {
      setLoading(true);
      
      const hasPermission = await requestPermissions();
      if (!hasPermission) return null;

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: optionsRef.current.enableHighAccuracy 
          ? Location.Accuracy.High 
          : Location.Accuracy.Balanced
      });

      const newLocation: LocationState = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy || undefined,
        altitude: currentLocation.coords.altitude || undefined,
        heading: currentLocation.coords.heading || undefined,
        speed: currentLocation.coords.speed || undefined,
        timestamp: currentLocation.timestamp
      };
      
      setLocation(newLocation);
      setError(null);
      return newLocation;
    } catch (err) {
      console.error('Erro ao obter localização:', err);
      setError({
        code: 'GET_LOCATION_ERROR',
        message: 'Erro ao obter localização atual'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestPermissions]);

  // Iniciar monitoramento contínuo
  const startWatching = useCallback(async (): Promise<void> => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      // Parar subscription anterior se existir
      if (subscription.current) {
        subscription.current.remove();
      }

      const accuracy = optionsRef.current.enableHighAccuracy
        ? Location.Accuracy.High
        : Location.Accuracy.Balanced;

      const newSubscription = await Location.watchPositionAsync(
        {
          accuracy,
          timeInterval: optionsRef.current.timeInterval,
          distanceInterval: optionsRef.current.distanceInterval,
          mayShowUserSettingsDialog: true,
          activityType: optionsRef.current.activityType,
          pausesUpdatesAutomatically: optionsRef.current.pausesUpdatesAutomatically,
          showsBackgroundLocationIndicator: optionsRef.current.showsBackgroundLocationIndicator
        },
        (currentLocation) => {
          setLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            accuracy: currentLocation.coords.accuracy || undefined,
            altitude: currentLocation.coords.altitude || undefined,
            heading: currentLocation.coords.heading || undefined,
            speed: currentLocation.coords.speed || undefined,
            timestamp: currentLocation.timestamp
          });
          setError(null);
        }
      );

      subscription.current = newSubscription;
      setIsWatching(true);
    } catch (err) {
      console.error('Erro ao iniciar monitoramento:', err);
      setError({
        code: 'WATCH_LOCATION_ERROR',
        message: 'Erro ao iniciar monitoramento de localização'
     