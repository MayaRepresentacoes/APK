import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            "AIzaSyAh2KRJ_4HY3u-gcgWUlwY24SDvf4qwCIc",
  authDomain:        "maya-representaciones.firebaseapp.com",
  projectId:         "maya-representaciones",
  storageBucket:     "maya-representaciones.firebasestorage.app",
  messagingSenderId: "55896839055",
  appId:             "1:55896839055:web:64062c92fc9dd15c7db1fa"
};

// ── App ───────────────────────────────────────────────────────
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// ── Auth — getAuth simples, funciona em Expo Go E browser ─────
const auth = getAuth(app);

// ── Firestore e Storage ───────────────────────────────────────
const db      = getFirestore(app);
const storage = getStorage(app);

// ── Helpers locais ────────────────────────────────────────────
const saveLocalData = async (key, data) => {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch { return false; }
};

const loadLocalData = async (key) => {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
};

export { auth, db, storage, saveLocalData, loadLocalData };
export default app;