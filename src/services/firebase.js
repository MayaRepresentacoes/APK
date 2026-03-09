import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            "AIzaSyAh2KRJ_4HY3u-gcgWUlwY24SDvf4qwCIc",
  authDomain:        "maya-representaciones.firebaseapp.com",
  projectId:         "maya-representaciones",
  storageBucket:     "maya-representaciones.firebasestorage.app",
  messagingSenderId: "55896839055",
  appId:             "1:55896839055:web:64062c92fc9dd15c7db1fa"
};

// App - inicializa uma única vez
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// Auth - compatível com Expo Go
let auth;
try {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
  });
  console.log('✅ Auth inicializado com sucesso');
} catch (e) {
  auth = getAuth(app);
  console.log('✅ Auth já existente, usando getAuth');
}

// Firestore e Storage
const db      = getFirestore(app);
const storage = getStorage(app);

// Helpers AsyncStorage
const saveLocalData = async (key, data) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};

const loadLocalData = async (key) => {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export { auth, db, storage, saveLocalData, loadLocalData };
export default app;