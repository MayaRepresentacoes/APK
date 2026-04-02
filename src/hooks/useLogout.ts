// src/hooks/useLogout.ts
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import { useNavigation } from '@react-navigation/native';

export function useLogout() {
  const navigation = useNavigation();

  return useCallback((options?: { 
    showAlert?: boolean;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  }) => {
    const { showAlert = true, onSuccess, onError } = options || {};

    const performLogout = async () => {
      try {
        // 1. Limpar dados locais
        await AsyncStorage.multiRemove([
          'stayLoggedIn',
          'userData',
          'lastRoute',
          'settings'
        ]);

        // 2. Deslogar do Firebase
        await signOut(auth);

        // 3. Callback de sucesso
        onSuccess?.();

        // 4. Navegar para login (opcional - o Firebase geralmente faz isso)
        // navigation.reset({
        //   index: 0,
        //   routes: [{ name: 'Login' }],
        // });

      } catch (error) {
        console.error('Erro no logout:', error);
        onError?.(error as Error);
        
        Alert.alert(
          'Erro',
          'Não foi possível fazer logout. Tente novamente.'
        );
      }
    };

    if (showAlert) {
      Alert.alert(
        'Sair do app',
        'Deseja encerrar a sessão?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sair',
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
    } else {
      performLogout();
    }
  }, [navigation]);
}