// services/mapaService.js
// ════════════════════════════════════════════════════════════════
// MAPA SERVICE — Dados enriquecidos de clientes para o mapa
//
// FUSÃO v2 — bugs corrigidos:
//   [BUG CRÍTICO 1] determinarStatus filtrava só o.status === 'pendente'
//     → Orçamentos criados com status 'aguardando' (padrão do
//       orcamentoService) nunca ativavam o pin 🔵 orçamento.
//     CORREÇÃO: isOrcPendente() aceita 'aguardando' e 'pendente'
//
//   [BUG CRÍTICO 2] getClientesMapa também filtrava só 'pendente'
//     → orcamentosPendentes sempre vazia para orçamentos novos
//     → Banner de orçamento no CardCliente nunca aparecia
//     CORREÇÃO: mesma isOrcPendente() no cálculo de orcamentosPendentes
// ════════════════════════════════════════════════════════════════
import { Linking } from 'react-native';

// ════════════════════════════════════════════════════════════════
// [BUG CRÍTICO 1 + 2] Helper isOrcPendente
// orcamentoService.criarOrcamento() persiste status = 'aguardando'
// Comparação direta === 'pendente' perdia todos os orçamentos novos.
// ════════════════════════════════════════════════════════════════
function isOrcPendente(o) {
  return o.status === 'pendente' || o.status === 'aguardando';
}

// ────────────────────────────────────────────────────────────────
// STATUS — 5 tipos com emoji, cor e ícone
// ────────────────────────────────────────────────────────────────
export const STATUS_MAPA = {
  ativo: {
    key   : 'ativo',
    label : 'Ativo',
    emoji : '🟢',
    cor   : '#4CAF50',
    pinCor: '#4CAF50',
    icone : 'check-circle',
  },
  visitar: {
    key   : 'visitar',
    label : 'Visitar',
    emoji : '🟡',
    cor   : '#FF9800',
    pinCor: '#FF9800',
    icone : 'schedule',
  },
  parado: {
    key   : 'parado',
    label : 'Parado',
    emoji : '🔴',
    cor   : '#EF5350',
    pinCor: '#EF5350',
    icone : 'warning',
  },
  orcamento: {
    key   : 'orcamento',
    label : 'Orçamento',
    emoji : '🔵',
    cor   : '#5BA3D0',
    pinCor: '#5BA3D0',
    icone : 'request-quote',
  },
  reposicao: {
    key   : 'reposicao',
    label : 'Reposição',
    emoji : '🟣',
    cor   : '#C56BF0',
    pinCor: '#C56BF0',
    icone : 'inventory',
  },
};

// ────────────────────────────────────────────────────────────────
// FILTROS DO MAPA — inclui todos os 5 status
// ────────────────────────────────────────────────────────────────
export const FILTROS_MAPA = [
  { key: 'todos',     label: 'Todos',     icone: 'place',          cor: '#C0D2E6' },
  { key: 'ativo',     label: 'Ativos',    icone: 'check-circle',   cor: '#4CAF50' },
  { key: 'visitar',   label: 'Visitar',   icone: 'schedule',       cor: '#FF9800' },
  { key: 'parado',    label: 'Parados',   icone: 'warning',        cor: '#EF5350' },
  { key: 'orcamento', label: 'Orçamento', icone: 'request-quote',  cor: '#5BA3D0' },
  { key: 'reposicao', label: 'Reposição', icone: 'inventory',      cor: '#C56BF0' },
];

// ────────────────────────────────────────────────────────────────
// UTILS INTERNOS
// ────────────────────────────────────────────────────────────────

function diasDesde(isoStr) {
  if (!isoStr) return 9999;
  return (Date.now() - new Date(isoStr).getTime()) / 86400000;
}

function getUltimaCompra(clienteId, visitas) {
  return visitas
    .filter(v => v.clienteId === clienteId && v.resultado === 'comprou')
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0))[0] || null;
}

function getTicketMedio(clienteId, visitas) {
  const compras = visitas.filter(
    v => v.clienteId === clienteId && v.resultado === 'comprou' && v.valor > 0
  );
  if (!compras.length) return 0;
  return compras.reduce((s, v) => s + v.valor, 0) / compras.length;
}

function determinarStatus(cliente, visitas, orcamentos, reposicaoIds = new Set()) {
  // 1. Orçamento pendente tem prioridade de exibição
  // [BUG CRÍTICO 1] isOrcPendente() em vez de === 'pendente'
  const orcsPend = orcamentos.filter(
    o => o.clienteId === cliente.id && isOrcPendente(o)
  );
  if (orcsPend.length) return STATUS_MAPA.orcamento;

  // 2. IA detectou ciclo de reposição
  if (reposicaoIds.has(cliente.id)) return STATUS_MAPA.reposicao;

  // 3. Baseado na última compra
  const uc = getUltimaCompra(cliente.id, visitas);
  if (!uc) return STATUS_MAPA.parado;

  const dias = diasDesde(uc.dataLocal || uc.data);
  if (dias < 20)  return STATUS_MAPA.ativo;
  if (dias < 45)  return STATUS_MAPA.visitar;
  return STATUS_MAPA.parado;
}

// ────────────────────────────────────────────────────────────────
// EXPORT: getDiasDesdeVisita
// ────────────────────────────────────────────────────────────────
export function getDiasDesdeVisita(clienteId, visitas) {
  const ultimas = visitas
    .filter(v => v.clienteId === clienteId)
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
  if (!ultimas.length) return null;
  return Math.round(diasDesde(ultimas[0].dataLocal || ultimas[0].data));
}

// ────────────────────────────────────────────────────────────────
// EXPORT: getClientesMapa
// Enriquece clientes com status, ticket, última compra e score base
// [BUG CRÍTICO 2] orcamentosPendentes usa isOrcPendente()
// ────────────────────────────────────────────────────────────────
export function getClientesMapa(clientes, visitas, orcamentos, reposicaoIds = new Set()) {
  return clientes
    .filter(c => c.latitude && c.longitude)
    .map(c => {
      const status       = determinarStatus(c, visitas, orcamentos, reposicaoIds);
      const ultimaCompra = getUltimaCompra(c.id, visitas);
      const ticket       = getTicketMedio(c.id, visitas);

      // [BUG CRÍTICO 2] isOrcPendente() em vez de === 'pendente'
      const orcamentosPendentes = orcamentos.filter(
        o => o.clienteId === c.id && isOrcPendente(o)
      );

      // Score base — sobrescrito pelo aiService na tela
      let score = 0;
      if (status.key === 'parado')    score += 40;
      if (status.key === 'visitar')   score += 25;
      if (status.key === 'orcamento') score += 35;
      if (status.key === 'reposicao') score += 50;
      if (ticket > 1000) score += 20;
      if (ticket > 500)  score += 10;

      const diasSemCompra = ultimaCompra
        ? Math.round(diasDesde(ultimaCompra.dataLocal || ultimaCompra.data))
        : null;

      return {
        ...c,
        status,
        ultimaCompra,
        ticket,
        diasSemCompra,
        orcamentosPendentes,
        score: Math.min(score, 100),
      };
    });
}

// ────────────────────────────────────────────────────────────────
// EXPORT: filtrarClientesMapa
// ────────────────────────────────────────────────────────────────
export function filtrarClientesMapa(clientesMapa, filtro) {
  if (!filtro || filtro === 'todos') return clientesMapa;
  return clientesMapa.filter(c => c.status.key === filtro);
}

// ────────────────────────────────────────────────────────────────
// EXPORT: getClientesOportunidade
// ────────────────────────────────────────────────────────────────
export function getClientesOportunidade(clientesMapa, minScore = 45) {
  return clientesMapa
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

// ────────────────────────────────────────────────────────────────
// EXPORT: gerarRotaVisita
// ────────────────────────────────────────────────────────────────
export function gerarRotaVisita(clientes) {
  return [...clientes].sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ────────────────────────────────────────────────────────────────
// EXPORT: abrirRotaMaps (mantido para compatibilidade)
// ────────────────────────────────────────────────────────────────
export function abrirRotaMaps(clientes) {
  const comGPS = (clientes || []).filter(c => c.latitude && c.longitude);
  if (!comGPS.length) return false;
  const destino   = comGPS[comGPS.length - 1];
  const waypoints = comGPS
    .slice(0, -1)
    .map(c => `${c.latitude},${c.longitude}`)
    .join('|');
  let url = `https://www.google.com/maps/dir/?api=1`
    + `&destination=${destino.latitude},${destino.longitude}`
    + `&travelmode=driving`;
  if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  Linking.openURL(url);
  return true;
}

// ────────────────────────────────────────────────────────────────
// EXPORT: calcularHeatmapVendas
// ────────────────────────────────────────────────────────────────
export function calcularHeatmapVendas(clientes, visitas) {
  const mapa = {};
  visitas.forEach(v => {
    if (v.resultado !== 'comprou') return;
    const cliente = clientes.find(c => c.id === v.clienteId);
    const cidade  = cliente?.cidade || 'Sem cidade';
    if (!mapa[cidade]) mapa[cidade] = { cidade, totalVendas: 0, totalCompras: 0 };
    mapa[cidade].totalVendas  += v.valor || 0;
    mapa[cidade].totalCompras += 1;
  });
  return Object.values(mapa)
    .map(d => ({
      ...d,
      ticketMedio: d.totalCompras > 0 ? Math.round(d.totalVendas / d.totalCompras) : 0,
    }))
    .sort((a, b) => b.totalVendas - a.totalVendas);
}

// ────────────────────────────────────────────────────────────────
// EXPORT: getEstatisticasGerais
// ────────────────────────────────────────────────────────────────
export function getEstatisticasGerais(clientes, clientesMapa, todasVisitas) {
  const hoje = new Date().toISOString().substring(0, 10);
  const visitadosHojeSet = new Set(
    todasVisitas
      .filter(v => (v.dataLocal || v.data || '').substring(0, 10) === hoje)
      .map(v => v.clienteId)
  );
  const porStatus = { ativo: 0, visitar: 0, parado: 0, orcamento: 0, reposicao: 0 };
  clientesMapa.forEach(c => {
    const key = c.status?.key;
    if (key && porStatus[key] !== undefined) porStatus[key]++;
  });
  const visitadosHoje = clientes.filter(c => visitadosHojeSet.has(c.id)).length;
  return {
    total            : clientes.length,
    comGPS           : clientesMapa.length,
    semGPS           : clientes.length - clientesMapa.length,
    porStatus,
    visitadosHoje,
    pctVisitadosHoje : clientes.length > 0
      ? Math.round((visitadosHoje / clientes.length) * 100)
      : 0,
  };
}

// ────────────────────────────────────────────────────────────────
// EXPORT: getClientesProximosCoord
// ────────────────────────────────────────────────────────────────
export function getClientesProximosCoord(clientesMapa, lat, lon, raioKm = 10) {
  if (!lat || !lon) return [];
  const haversine = (la1, lo1, la2, lo2) => {
    const R    = 6371;
    const dLat = (la2 - la1) * (Math.PI / 180);
    const dLon = (lo2 - lo1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1 * (Math.PI / 180)) *
      Math.cos(la2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  return clientesMapa
    .map(c => ({
      ...c,
      distanciaKm: Math.round(haversine(lat, lon, c.latitude, c.longitude) * 10) / 10,
    }))
    .filter(c => c.distanciaKm <= raioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}