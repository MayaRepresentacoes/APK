// services/fotoService.js
// ════════════════════════════════════════════════════════════════
// FOTO SERVICE — Gerenciamento de fotos por tipo e cliente
//
// Tipos suportados (coleção 'fotos' — fotos avulsas de cliente):
//   'estoque' | 'gondola' | 'obra' | 'fachada' | 'geral'
//
// NOTA: Fotos de checkin (CheckinScreen) são persistidas dentro
// do documento de visita como { estoque:[], gondola:[], concorrentes:[] }.
// GaleriaFotosModal faz flatten de ambos os formatos.
// ════════════════════════════════════════════════════════════════
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

const COLECAO = 'fotos';

export const TIPOS_FOTO = [
  { key:'estoque', label:'Estoque', icone:'inventory',    cor:'#5BA3D0' },
  { key:'gondola', label:'Gôndola', icone:'storefront',   cor:'#E8B432' },
  { key:'obra',    label:'Obra',    icone:'construction', cor:'#4CAF50' },
  { key:'fachada', label:'Fachada', icone:'store',        cor:'#C56BF0' },
  { key:'geral',   label:'Geral',   icone:'photo-camera', cor:'#8A9BB0' },
];

export async function getUltimaFotoTipo(clienteId, tipo) {
  try {
    const db = getFirestore();
    const q  = query(
      collection(db, COLECAO),
      where('clienteId', '==', clienteId),
      where('tipo',      '==', tipo),
      orderBy('criadoEm', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (e) {
    console.log('[fotoService] getUltimaFotoTipo:', e);
    return null;
  }
}

export async function getFotosPorCliente(clienteId) {
  const agrupadas = TIPOS_FOTO.reduce(
    (acc, t) => ({ ...acc, [t.key]: [] }),
    {}
  );
  try {
    const db   = getFirestore();
    const q    = query(
      collection(db, COLECAO),
      where('clienteId', '==', clienteId),
      orderBy('criadoEm', 'desc')
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const f    = { id: d.id, ...d.data() };
      const tipo = f.tipo || 'geral';
      if (agrupadas[tipo]) {
        agrupadas[tipo].push(f);
      } else {
        agrupadas['geral'].push({ ...f, tipo:'geral' });
      }
    });
  } catch (e) {
    console.log('[fotoService] getFotosPorCliente:', e);
  }
  return agrupadas;
}

export async function salvarFoto(foto) {
  try {
    if (!foto.clienteId) throw new Error('clienteId obrigatório');
    const db  = getFirestore();
    const ref = await addDoc(collection(db, COLECAO), {
      clienteId  : foto.clienteId,
      tipo       : foto.tipo       || 'geral',
      url        : foto.url        || '',
      observacao : foto.observacao || '',
      dataISO    : new Date().toISOString(),
      criadoEm  : serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.log('[fotoService] salvarFoto:', e);
    throw e;
  }
}