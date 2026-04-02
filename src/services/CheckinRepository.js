/**
 * CheckinRepository.js
 * Camada de dados para checkins/visitas.
 * ✅ Usa helpers do projeto — sem getDocs/collection/db direto.
 */
import { addCheckin, getCheckins, getVisitas } from '../services/firebase';

// ────────────────────────────────────────────────────────────────
// CACHE LOCAL (5 minutos)
// ────────────────────────────────────────────────────────────────
let _cache     = null;
let _cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

export function invalidarCache() {
  _cache     = null;
  _cacheTime = null;
}

// ────────────────────────────────────────────────────────────────
// HELPER INTERNO: merge visitas + checkins (padrão do projeto)
// ────────────────────────────────────────────────────────────────
async function _getTodos(forceRefresh = false) {
  const agora = Date.now();
  if (!forceRefresh && _cache && _cacheTime && (agora - _cacheTime) < CACHE_TTL) {
    return _cache;
  }

  const [visitasRaw, checkinsRaw] = await Promise.all([getVisitas(), getCheckins()]);

  const todos = [
    ...visitasRaw,
    ...checkinsRaw.map(ck => {
      const dataStr = ck.data || ck.dataISO || ck.dataLocal || '';

      // [CORRIGIDO] 'nao_comprou' → 'naocomprou' (padrão unificado do projeto)
      let resultadoNorm = ck.resultado;
      if (!resultadoNorm) {
        resultadoNorm = ck.comprou ? 'comprou' : 'naocomprou';
      } else if (resultadoNorm === 'nao_comprou') {
        resultadoNorm = 'naocomprou';
      }

      return {
        id           : ck.id,
        clienteId    : ck.clienteId,
        clienteNome  : ck.clienteNome   || '',
        clienteTipo  : ck.clienteTipo   || '',
        clienteCidade: ck.clienteCidade || '',
        data         : dataStr.substring(0, 10),
        hora         : ck.hora          || '',
        dataLocal    : dataStr,
        mes          : dataStr.substring(0, 7),
        resultado    : resultadoNorm,
        comprou      : resultadoNorm === 'comprou',
        valor        : ck.valor         || 0,
        produtos     : ck.produtos      || [],
        motivos      : ck.motivos       || [],
        motivoObs    : ck.motivoObs     || '',
        motivo       : ck.motivo        || (Array.isArray(ck.motivos) && ck.motivos[0]) || '',
        observacao   : ck.observacao    || '',
        tipoRegistro : ck.tipoRegistro  || 'visita',
        representada : ck.representada  || 'geral',
        localizacao  : ck.localizacao   || null,
        fotos        : ck.fotos         || null,
        proximaVisita: ck.proximaVisita || '',
        _origem      : 'checkin',
      };
    }),
  ].sort((a, b) => new Date(b.dataLocal || b.data || 0) - new Date(a.dataLocal || a.data || 0));

  _cache     = todos;
  _cacheTime = agora;
  return todos;
}

// ────────────────────────────────────────────────────────────────
// API PÚBLICA
// ────────────────────────────────────────────────────────────────

export async function salvarCheckin(checkinData) {
  const id = await addCheckin(checkinData);
  invalidarCache();
  return id;
}

export async function getCheckinsPorCliente(clienteId) {
  const todos = await _getTodos();
  return todos.filter(v => v.clienteId === clienteId);
}

export async function getCheckinsHoje() {
  const hoje  = new Date().toISOString().substring(0, 10);
  const todos = await _getTodos();
  return todos.filter(v => (v.data || '').substring(0, 10) === hoje);
}

export async function getCheckinsMes(mes) {
  const todos = await _getTodos();
  return todos.filter(v => (v.data || v.dataLocal || '').substring(0, 7) === mes);
}

export async function getTodosCheckins(forceRefresh = false) {
  return _getTodos(forceRefresh);
}

export async function getUltimaCompra(clienteId) {
  const checkins = await getCheckinsPorCliente(clienteId);
  return checkins.find(c => c.comprou || c.resultado === 'comprou') || null;
}

// Checkins entre duas datas (inclusive)
export async function getCheckinsPorPeriodo(dataInicio, dataFim) {
  const todos = await _getTodos();
  return todos.filter(v => {
    const d = (v.data || v.dataLocal || '').substring(0, 10);
    return d >= dataInicio && d <= dataFim;
  });
}

// Apenas checkins com compra concretizada
export async function getCheckinsComVenda(forceRefresh = false) {
  const todos = await _getTodos(forceRefresh);
  return todos.filter(v => v.resultado === 'comprou' || v.comprou);
}