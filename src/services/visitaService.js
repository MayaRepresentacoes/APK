// ════════════════════════════════════════════════════════════════
// VISITA SERVICE — Ponto de entrada para visitas e checkins
// ════════════════════════════════════════════════════════════════
import { addCheckin, getVisitas, getCheckins } from './firebase';
import { createCheckinModel }                  from './CheckinModel';

// ════════════════════════════════════════════════════════════════
// EXPORT: registrarCheckin
// Ponto de entrada principal para salvar uma visita/checkin.
// Normaliza via CheckinModel e persiste via addCheckin().
// ════════════════════════════════════════════════════════════════
export async function registrarCheckin(dados) {
  const modelo = createCheckinModel(dados);
  return addCheckin(modelo);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: registrarVisita
// Alias de registrarCheckin — mantém compatibilidade.
// ════════════════════════════════════════════════════════════════
export async function registrarVisita(dados) {
  return registrarCheckin(dados);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: salvarVisita
// Alias de registrarCheckin — compatibilidade com VisitaModal
// e outras telas que importavam este nome.
// ════════════════════════════════════════════════════════════════
export async function salvarVisita(dados) {
  return registrarCheckin(dados);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getTodasVisitas
// Merge das coleções visitas + checkins, ordenado por data desc.
// Normaliza TODOS os campos incluindo proximaVisita, fotos e
// representada — consumidos por HistoricoClienteScreen, aiService
// e analyticsService sem verificações extras.
// ════════════════════════════════════════════════════════════════
export async function getTodasVisitas() {
  try {
    const [visitasRaw, checkinsRaw] = await Promise.all([
      getVisitas(),
      getCheckins(),
    ]);

    const todas = [
      // ── Coleção legada: visitas ────────────────────────────
      ...(visitasRaw || []).map(v => ({
        id            : v.id,
        clienteId     : v.clienteId      || '',
        clienteNome   : v.clienteNome    || '',
        clienteTipo   : v.clienteTipo    || '',
        clienteCidade : v.clienteCidade  || '',
        dataLocal     : v.dataLocal      || v.data || '',
        data          : (v.dataLocal || v.data || '').substring(0, 10),
        hora          : v.hora           || '',
        mes           : (v.dataLocal || v.data || '').substring(0, 7),
        resultado     : v.resultado      || (v.comprou ? 'comprou' : 'naocomprou'),
        comprou       : v.comprou !== undefined ? !!v.comprou : v.resultado === 'comprou',
        valor         : v.valor          || 0,
        produtos      : v.produtos       || [],
        motivos       : v.motivos        || [],
        motivoObs     : v.motivoObs      || '',
        motivo        : v.motivo         || '',
        observacao    : v.observacoes    || v.observacao || '',
        tipoRegistro  : v.tipoRegistro   || 'visita',
        representada  : v.representada   || 'geral',
        fotos         : v.fotos          || {},
        localizacao   : v.localizacao    || null,
        proximaVisita : v.proximaVisita  || '',
        _origem       : 'visita',
      })),

      // ── Coleção nova: checkins ─────────────────────────────
      ...(checkinsRaw || []).map(ck => ({
        id            : ck.id,
        clienteId     : ck.clienteId     || '',
        clienteNome   : ck.clienteNome   || '',
        clienteTipo   : ck.clienteTipo   || '',
        clienteCidade : ck.clienteCidade || '',
        dataLocal     : ck.dataLocal     || ck.data || ck.dataISO || '',
        data          : (ck.dataLocal || ck.data || ck.dataISO || '').substring(0, 10),
        hora          : ck.hora          || '',
        mes           : (ck.dataLocal || ck.data || ck.dataISO || '').substring(0, 7),
        resultado     : ck.resultado     || (ck.comprou ? 'comprou' : 'naocomprou'),
        comprou       : ck.comprou !== undefined ? !!ck.comprou : ck.resultado === 'comprou',
        valor         : ck.valor         || 0,
        produtos      : ck.produtos      || [],
        motivos       : ck.motivos       || [],
        motivoObs     : ck.motivoObs     || '',
        motivo        : ck.motivo        || '',
        observacao    : ck.observacao    || '',
        tipoRegistro  : ck.tipoRegistro  || 'visita',
        representada  : ck.representada  || 'geral',
        fotos         : ck.fotos         || {},
        localizacao   : ck.localizacao   || null,
        proximaVisita : ck.proximaVisita || '',
        _origem       : 'checkin',
      })),
    ].sort(
      (a, b) => new Date(b.dataLocal || b.data || 0) - new Date(a.dataLocal || a.data || 0)
    );

    return todas;
  } catch (e) {
    console.log('[visitaService] getTodasVisitas:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getVisitasCliente
// Retorna todas as visitas de um cliente específico.
// ════════════════════════════════════════════════════════════════
export async function getVisitasCliente(clienteId) {
  try {
    const todas = await getTodasVisitas();
    return todas
      .filter(v => v.clienteId === clienteId)
      .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
  } catch (e) {
    console.log('[visitaService] getVisitasCliente:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getVisitasHoje
// Retorna apenas as visitas registradas no dia atual.
// ════════════════════════════════════════════════════════════════
export async function getVisitasHoje() {
  try {
    const hoje  = new Date().toISOString().substring(0, 10);
    const todas = await getTodasVisitas();
    return todas.filter(v => (v.dataLocal || v.data || '').substring(0, 10) === hoje);
  } catch (e) {
    console.log('[visitaService] getVisitasHoje:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getVisitasMes
// Retorna visitas do mês informado (AAAA-MM). Padrão: mês atual.
// ════════════════════════════════════════════════════════════════
export async function getVisitasMes(mes = null) {
  try {
    const mesAlvo = mes || new Date().toISOString().substring(0, 7);
    const todas   = await getTodasVisitas();
    return todas.filter(v => (v.dataLocal || v.data || '').substring(0, 7) === mesAlvo);
  } catch (e) {
    console.log('[visitaService] getVisitasMes:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getVisitasComCompra