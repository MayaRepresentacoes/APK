// ════════════════════════════════════════════════════════════════
// FIREBASE SERVICE — Camada central de acesso ao Firestore
// Versão unificada — contém TODAS as funções de ambas as versões
// ════════════════════════════════════════════════════════════════
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ── Configuração do Firebase ──────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey           : 'AIzaSyAh2KRJ_4HY3u-gcgWUlwY24SDvf4qwCIc',
  authDomain       : 'maya-representaciones.firebaseapp.com',
  projectId        : 'maya-representaciones',
  storageBucket    : 'maya-representaciones.firebasestorage.app',
  messagingSenderId: '55896839055',
  appId            : '1:55896839055:web:64062c92fc9dd15c7db1fa',
};

// Inicializa apenas uma vez (evita erro em hot reload)
const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
const db  = getFirestore(app);

// initializeAuth com AsyncStorage para persistência real entre sessões
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // initializeAuth lança erro se já foi inicializado (hot reload)
    auth = getAuth(app);
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ════════════════════════════════════════════════════════════════

function docToObj(snap) {
  if (!snap.exists()) return null;
  const data      = snap.data();
  const converted = {};
  Object.keys(data).forEach(key => {
    const val = data[key];
    converted[key] = val instanceof Timestamp ? val.toDate().toISOString() : val;
  });
  return { id: snap.id, ...converted };
}

function snapToArray(snap) {
  return snap.docs.map(d => docToObj(d)).filter(Boolean);
}

function _normalizarResultado(resultado, comprou) {
  if (resultado === 'comprou')     return 'comprou';
  if (resultado === 'nao_comprou') return 'naocomprou';
  if (resultado === 'naocomprou')  return 'naocomprou';
  if (resultado === 'retornar')    return 'retornar';
  if (comprou === true)            return 'comprou';
  if (comprou === false)           return 'naocomprou';
  return resultado || 'naocomprou';
}

// ════════════════════════════════════════════════════════════════
// CACHE LOCAL via AsyncStorage (TTL: 5 minutos)
// ════════════════════════════════════════════════════════════════
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function saveLocalData(key, data) {
  try { await AsyncStorage.setItem(key, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}

export async function loadLocalData(key) {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

export async function getLocalData(key) {
  return loadLocalData(key);
}

export async function removeLocalData(key) {
  try { await AsyncStorage.removeItem(key); return true; }
  catch (e) { return false; }
}

export async function clearCache(prefixo) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const alvo = prefixo ? keys.filter(k => k.startsWith(prefixo)) : keys;
    await AsyncStorage.multiRemove(alvo);
    return true;
  } catch (e) { return false; }
}

export async function getCached(cacheKey, ttl = CACHE_TTL_MS) {
  try {
    const cached = await loadLocalData(cacheKey);
    if (!cached) return null;
    const age = Date.now() - (cached._cachedAt || 0);
    if (age > ttl) {
      await removeLocalData(cacheKey); // Limpa cache expirado
      return null;
    }
    return cached.data;
  } catch (e) {
    console.log('[firebase] getCached error:', e);
    return null;
  }
}

export async function setCached(cacheKey, data) {
  await saveLocalData(cacheKey, { data, _cachedAt: Date.now() });
}

// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════

export async function login(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

export async function logout() {
  await clearCache('cache:');
  await signOut(auth);
}

export function getCurrentUser()          { return auth.currentUser; }
export function onAuthChange(callback)    { return onAuthStateChanged(auth, callback); }

// ════════════════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════════════════

export async function getClientes() {
  const cacheKey = 'cache:clientes';
  try {
    const snap = await getDocs(collection(db, 'clientes'));
    const data = snapToArray(snap);
    await setCached(cacheKey, data);
    return data;
  } catch (e) {
    console.log('[firebase] getClientes offline:', e.message);
    return (await getCached(cacheKey, Infinity)) || [];
  }
}

export async function getCliente(id) {
  try {
    const snap = await getDoc(doc(db, 'clientes', id));
    return docToObj(snap);
  } catch (e) {
    console.log('[firebase] getCliente:', e.message);
    return null;
  }
}

export async function addCliente(dados) {
  const ref = await addDoc(collection(db, 'clientes'), {
    ...dados,
    criadoEm    : serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  await removeLocalData('cache:clientes');
  return ref.id;
}

export async function updateCliente(id, dados) {
  await updateDoc(doc(db, 'clientes', id), { ...dados, atualizadoEm: serverTimestamp() });
  await removeLocalData('cache:clientes');
}

export async function deleteCliente(id) {
  await deleteDoc(doc(db, 'clientes', id));
  await removeLocalData('cache:clientes');
}

export async function salvarCliente(dados, id) {
  if (id) { await updateCliente(id, dados); } else { await addCliente(dados); }
}

// ════════════════════════════════════════════════════════════════
// VISITAS
// ════════════════════════════════════════════════════════════════

export async function getVisitas() {
  const cacheKey = 'cache:visitas';
  try {
    const snap = await getDocs(
      query(collection(db, 'visitas'), orderBy('dataLocal', 'desc'))
    );
    const data = snapToArray(snap).map(v => ({
      ...v,
      resultado: _normalizarResultado(v.resultado, v.comprou),
      comprou  : _normalizarResultado(v.resultado, v.comprou) === 'comprou',
    }));
    await setCached(cacheKey, data);
    return data;
  } catch (e) {
    console.log('[firebase] getVisitas offline:', e.message);
    return (await getCached(cacheKey, Infinity)) || [];
  }
}

export async function addVisita(dados) {
  const payload = {
    ...dados,
    resultado: _normalizarResultado(dados.resultado, dados.comprou),
    criadoEm : serverTimestamp(),
  };
  payload.comprou = payload.resultado === 'comprou';
  const ref = await addDoc(collection(db, 'visitas'), payload);
  await removeLocalData('cache:visitas');
  return ref.id;
}

export async function salvarVisita(dados) {
  return addVisita(dados);
}

// ════════════════════════════════════════════════════════════════
// CHECKINS
// ════════════════════════════════════════════════════════════════

export async function getCheckins() {
  const cacheKey = 'cache:checkins';
  try {
    const snap = await getDocs(
      query(collection(db, 'checkins'), orderBy('data', 'desc'))
    );
    const data = snapToArray(snap).map(ck => ({
      ...ck,
      resultado: _normalizarResultado(ck.resultado, ck.comprou),
      comprou  : _normalizarResultado(ck.resultado, ck.comprou) === 'comprou',
    }));
    await setCached(cacheKey, data);
    return data;
  } catch (e) {
    console.log('[firebase] getCheckins offline:', e.message);
    return (await getCached(cacheKey, Infinity)) || [];
  }
}

export async function addCheckin(dados) {
  const uid   = auth.currentUser?.uid   || '';
  const email = auth.currentUser?.email || '';

  const valorNum = parseFloat(
    String(dados.valor || 0).replace(/\./g, '').replace(',', '.')
  ) || 0;

  const resultadoFinal = _normalizarResultado(dados.resultado, dados.comprou);

  const ref = await addDoc(collection(db, 'checkins'), {
    clienteId    : dados.clienteId      || '',
    clienteNome  : dados.clienteNome    || '',
    clienteTipo  : dados.clienteTipo    || '',
    clienteCidade: dados.clienteCidade  || '',
    data         : dados.data           || new Date().toISOString().substring(0, 10),
    dataLocal    : dados.dataLocal      || new Date().toISOString(),
    dataISO      : dados.dataISO        || new Date().toISOString(),
    hora         : dados.hora           || '',
    mes          : dados.mes            || new Date().toISOString().substring(0, 7),
    comprou      : resultadoFinal === 'comprou',
    resultado    : resultadoFinal,
    tipoRegistro : dados.tipoRegistro   || 'visita',
    produtos     : dados.produtos       || [],
    valor        : resultadoFinal === 'comprou' ? valorNum : 0,
    motivos      : dados.motivos        || [],
    motivoObs    : dados.motivoObs      || '',
    motivo       : Array.isArray(dados.motivos) && dados.motivos.length > 0
                     ? dados.motivos[0]
                     : (dados.motivo || ''),
    observacao   : dados.observacao     || '',
    fotos        : dados.fotos          || null,
    localizacao  : dados.localizacao    || null,
    representada : dados.representada   || 'geral',
    proximaVisita: dados.proximaVisita  || '',
    usuarioId    : uid,
    usuarioEmail : email,
    criadoEm     : serverTimestamp(),
  });

  await removeLocalData('cache:checkins');
  await removeLocalData('cache:visitas');
  return ref.id;
}

export async function salvarCheckin(dados) {
  return addCheckin(dados);
}

// ════════════════════════════════════════════════════════════════
// ORÇAMENTOS
// ════════════════════════════════════════════════════════════════

export async function getTodosOrcamentos() {
  const cacheKey = 'cache:orcamentos';
  try {
    const snap = await getDocs(
      query(collection(db, 'orcamentos'), orderBy('criadoEm', 'desc'))
    );
    const data = snapToArray(snap);
    await setCached(cacheKey, data);
    return data;
  } catch (e) {
    console.log('[firebase] getTodosOrcamentos offline:', e.message);
    return (await getCached(cacheKey, Infinity)) || [];
  }
}

export async function getOrcamentosDoCliente(clienteId) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'orcamentos'),
        where('clienteId', '==', clienteId),
        orderBy('criadoEm', 'desc')
      )
    );
    return snapToArray(snap);
  } catch (e) {
    console.log('[firebase] getOrcamentosDoCliente:', e.message);
    return [];
  }
}

export async function addOrcamento(dados) {
  const ref = await addDoc(collection(db, 'orcamentos'), {
    ...dados,
    status      : dados.status || 'aguardando',
    criadoEm    : serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  await removeLocalData('cache:orcamentos');
  return ref.id;
}

export async function updateOrcamento(id, dados) {
  await updateDoc(doc(db, 'orcamentos', id), { ...dados, atualizadoEm: serverTimestamp() });
  await removeLocalData('cache:orcamentos');
}

export async function deleteOrcamento(id) {
  await deleteDoc(doc(db, 'orcamentos', id));
  await removeLocalData('cache:orcamentos');
}

// ════════════════════════════════════════════════════════════════
// METAS
// ════════════════════════════════════════════════════════════════

export async function getMetas() {
  const cacheKey = 'cache:metas';
  try {
    const snap = await getDoc(doc(db, 'metas', 'atual'));
    const data = snap.exists() ? snap.data() : {};
    await setCached(cacheKey, data);
    return data;
  } catch (e) {
    console.log('[firebase] getMetas offline:', e.message);
    return (await getCached(cacheKey, Infinity)) || {};
  }
}

export async function saveMetas(metas) {
  try {
    await updateDoc(doc(db, 'metas', 'atual'), { ...metas, atualizadoEm: serverTimestamp() });
  } catch (e) {
    try {
      await setDoc(doc(db, 'metas', 'atual'), { ...metas, criadoEm: serverTimestamp() });
    } catch (e2) {
      console.log('[firebase] saveMetas:', e2.message);
      throw e2;
    }
  }
  await removeLocalData('cache:metas');
}

// Alias para compatibilidade
export async function salvarMetas(metas) {
  return saveMetas(metas);
}

// ════════════════════════════════════════════════════════════════
// FOTOS
// ════════════════════════════════════════════════════════════════

export async function getFotosCliente(clienteId) {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'fotos'),
        where('clienteId', '==', clienteId),
        orderBy('criadoEm', 'desc')
      )
    );
    return snapToArray(snap);
  } catch (e) {
    console.log('[firebase] getFotosCliente:', e.message);
    return [];
  }
}

export async function addFoto(dados) {
  const ref = await addDoc(collection(db, 'fotos'), {
    ...dados,
    criadoEm: serverTimestamp(),
    dataISO : new Date().toISOString(),
  });
  return ref.id;
}

// ════════════════════════════════════════════════════════════════
// DESPESAS / CUSTOS
// ════════════════════════════════════════════════════════════════

export async function getDespesas() {
  const cacheKey = 'cache:despesas';
  try {
    const snap = await getDocs(
      query(collection(db, 'despesas'), orderBy('criadoEm', 'desc'))
    );
    const data = snapToArray(snap);
    await setCached(cacheKey, data);
    return data;
  } catch (e) {
    console.log('[firebase] getDespesas offline:', e.message);
    return (await getCached(cacheKey, Infinity)) || [];
  }
}

export async function salvarDespesa(dados) {
  const ref = await addDoc(collection(db, 'despesas'), {
    descricao: (dados.descricao || '').trim(),
    valor    : parseFloat(String(dados.valor).replace(',', '.')) || 0,
    tipo     : dados.tipo || 'outro',
    data     : dados.data || '',
    criadoEm : serverTimestamp(),
    usuario  : auth.currentUser?.email || '',
  });
  await removeLocalData('cache:despesas');
  return ref.id;
}

// Aliases para compatibilidade com custos
export async function getCustos() {
  return getDespesas();
}

export async function addCusto(dados) {
  return salvarDespesa(dados);
}

export async function deleteCusto(id) {
  await deleteDoc(doc(db, 'despesas', id));
  await removeLocalData('cache:despesas');
}

// ════════════════════════════════════════════════════════════════
// CARGA COMBINADA — DashboardScreen
// ════════════════════════════════════════════════════════════════

export async function carregarDadosDashboard() {
  const [clientesList, visitasRaw, checkins, metas, despesas] = await Promise.all([
    getClientes(), getVisitas(), getCheckins(), getMetas(), getDespesas(),
  ]);

  const visitas = [
    ...visitasRaw,
    ...checkins.map(ck => {
      const d = ck.data || ck.dataLocal || ck.dataISO || '';
      return {
        id           : ck.id,
        clienteId    : ck.clienteId,
        clienteNome  : ck.clienteNome    || '',
        clienteTipo  : ck.clienteTipo    || '',
        clienteCidade: ck.clienteCidade  || '',
        dataLocal    : d,
        data         : d.substring(0, 10),
        hora         : ck.hora           || '',
        mes          : ck.mes            || d.substring(0, 7),
        resultado    : ck.resultado,
        comprou      : ck.comprou,
        valor        : parseFloat(ck.valor) || 0,
        valorVenda   : parseFloat(ck.valor) || 0,
        tipoRegistro : ck.tipoRegistro   || 'visita',
        produtos     : ck.produtos       || [],
        motivos      : ck.motivos        || [],
        motivoObs    : ck.motivoObs      || '',
        motivo       : ck.motivo         || '',
        observacao   : ck.observacao     || '',
        localizacao  : ck.localizacao    || null,
        representada : ck.representada   || 'geral',
        proximaVisita: ck.proximaVisita  || '',
        _origem      : 'checkin',
      };
    }),
  ].sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));

  return { clientes: clientesList, visitas, metas, despesas };
}

// ════════════════════════════════════════════════════════════════
// EXPORTAÇÕES
// ════════════════════════════════════════════════════════════════
export { db, auth, serverTimestamp, Timestamp };
export { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc, query, where, orderBy };
export { onAuthStateChanged };
export default app;