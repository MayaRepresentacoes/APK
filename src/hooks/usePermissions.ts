// src/hooks/usePermissions.ts
import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Platform, Alert, Linking } from 'react-native';

interface PermissionState {
  location: Location.PermissionStatus | null;
  camera: boolean;
  gallery: boolean;
  notifications: boolean;
}

interface UsePermissionsReturn {
  permissions: PermissionState;
  loading: boolean;
  requestLocation: () => Promise<boolean>;
  requestCamera: () => Promise<boolean>;
  requestGallery: () => Promise<boolean>;
  requestAll: () => Promise<PermissionState>;
  openSettings: () => void;
  checkAll: () => Promise<PermissionState>;
}

export function usePermissions(): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<PermissionState>({
    location: null,
    camera: false,
    gallery: false,
    notifications: false
  });
  const [loading, setLoading] = useState<boolean>(false);

  const checkAll = useCallback(async (): Promise<PermissionState> => {
    try {
      setLoading(true);
      
      const locationPerm = await Location.getForegroundPermissionsAsync();
      const cameraPerm = await ImagePicker.getCameraPermissionsAsync();
      const galleryPerm = await ImagePicker.getMediaLibraryPermissionsAsync();
      
      const newPermissions = {
        location: locationPerm.status,
        camera: cameraPerm.granted,
        gallery: galleryPerm.granted,
        notifications: false
      };
      
      setPermissions(newPermissions);
      return newPermissions;
    } catch (error) {
      console.error('Erro ao verificar permissões:', error);
      return permissions;
    } finally {
      setLoading(false);
    }
  }, [permissions]);

  const requestLocation = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      
      let { status } = await Location.requestForegroundPermissionsAsync();
      
      if (Platform.OS === 'android' && status === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
      }
      
      setPermissions(prev => ({ ...prev, location: status }));
      
      if (status !== 'granted') {
        Alert.alert(
          'Permissão Necessária',
          'Para usar todas as funcionalidades do MAYA, precisamos de acesso à sua localização.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const requestCamera = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      const granted = status === 'granted';
      
      setPermissions(prev => ({ ...prev, camera: granted }));
      
      if (!granted) {
        Alert.alert(
          'Permissão Necessária',
          'Para fotografar estoque e produtos, precisamos de acesso à sua câmera.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openSettings() }
          ]
        );
      }
      
      return granted;
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const requestGallery = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const granted = status === 'granted';
      
      setPermissions(prev => ({ ...prev, gallery: granted }));
      
      if (!granted) {
        Alert.alert(
          'Permissão Necessária',
          'Para anexar fotos às visitas, precisamos de acesso à sua galeria.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir Configurações', onPress: () => Linking.openSettings() }
          ]
        );
      }
      
      return granted;
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const requestAll = useCallback(async (): Promise<PermissionState> => {
    const [location, camera, gallery] = await Promise.all([
      requestLocation(),
      requestCamera(),
      requestGallery()
    ]);
    
    return {
      location: location ? 'granted' : 'denied',
      camera,
      gallery,
      notifications: false
    };
  }, [requestLocation, requestCamera, requestGallery]);

  const openSettings = useCallback((): void => {
    Linking.openSettings();
  }, []);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  return {
    permissions,
    loading,
    requestLocation,
    requestCamera,
    requestGallery,
    requestAll,
    openSettings,
    checkAll
  };
}