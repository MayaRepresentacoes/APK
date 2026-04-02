/**
 * CheckinController.js
 * Orquestra as operações de checkin.
 * ✅ Sem nenhum import Firebase — usa Model + Repository.
 */

import {
  createCheckinModel,
  validateCheckin,
  getCheckinStats,
  PRODUTOS_DISPONIVEIS,
  MOTIVOS_NAO_COMPRA,
} from './CheckinModel';

import {
  salvarCheckin,
  getCheckinsPorCliente,
  getCheckinsHoje,
  getCheckinsMes,
  getTodosCheckins,
  getUltimaCompra,
  invalidarCache,
  getCheckinsPorPeriodo,
} from './CheckinRepository';

// ════════════════════════════════════════════════════════════════
// SALVAR
// ════════════════════════════════════════════════════════════════

export async function registrarCheckin({
  cliente,
  comprou,
  produtos     = [],
  valor        = '',
  motivo       = '',
  motivos      = [],
  motivoObs    = '',
  observacao   = '',
  fotos        = {},
  localizacao  = null,
  tipoRegistro = 'visita',
  representada = 'geral',
}) {
  const { valid, erros } = validateCheckin({ cliente, comprou, motivo: motivos[0] || motivo });
  if (!valid) return { ok: false, erros };

  const resultado = comprou ? 'comprou' : 'naocomprou';

  const docModel = createCheckinModel({
    clienteId    : cliente.id,
    clienteNome  : cliente.nome   || '',
    clienteTipo  : cliente.tipo   || '',
    clienteCidade: cliente.cidade || '',
    resultado,
    valor,
    produtos,
    motivos      : motivos.length > 0 ? motivos : (motivo ? [motivo] : []),
    motivoObs,
    observacao,
    fotos,
    localizacao,
    tipoRegistro,
    representada : representada || cliente.representada || 'geral',
  });

  try {
    const id = await salvarCheckin(docModel);
    return { ok: true, id };
  } catch (e) {
    console.log('[CheckinController] Erro ao salvar:', e);
    return { ok: false, erros: ['Não foi possível salvar. Tente novamente.'] };
  }
}

// ════════════════════════════════════════════════════════════════
// LEITURA — por cliente
// ════════════════════════════════════════════════════════════════

export async function buscarHistoricoCliente(clienteId) {
  try {
    const checkins = await getCheckinsPorCliente(clienteId);
    const stats    = getCheckinStats(checkins);
    return { checkins, stats };
  } catch (e) {
    console.log('[CheckinController] Erro buscarHistoricoCliente:', e);
    return { checkins: [], stats: getCheckinStats([]) };
  }
}

export async function buscarUltimaCompra(clienteId) {
  try {
    return await getUltimaCompra(clienteId);
  } catch (e) {
    console.log('[CheckinController] Erro buscarUltimaCompra:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// LEITURA — dashboard / relatórios
// ════════════════════════════════════════════════════════════════

export async function buscarCheckinsHoje() {
  try {
    const checkins = await getCheckinsHoje();
    const stats    = getCheckinStats(checkins);
    return { checkins, stats };
  } catch (e) {
    console.log('[CheckinController] Erro buscarCheckinsHoje:', e);
    return { checkins: [], stats: getCheckinStats([]) };
  }
}

export async function buscarCheckinsMes(mes) {
  const mesAlvo = mes || _mesAtual();
  try {
    const checkins = await getCheckinsMes(mesAlvo);
    const stats    = getCheckinStats(checkins);
    return { checkins, stats, mes: mesAlvo };
  } catch (e) {
    console.log('[CheckinController] Erro buscarCheckinsMes:', e);
    return { checkins: [], stats: getCheckinStats([]), mes: mesAlvo };
  }
}

export async function buscarTodosCheckins(forceRefresh = false) {
  try {
    const checkins = await getTodosCheckins(forceRefresh);
    const stats    = getCheckinStats(checkins);
    return { checkins, stats };
  } catch (e) {
    console.log('[CheckinController] Erro buscarTodosCheckins:', e);
    return { checkins: [], stats: getCheckinStats([]) };
  }
}

// ════════════════════════════════════════════════════════════════
// AGRUPAMENTOS — para gráficos e relatórios
// ════════════════════════════════════════════════════════════════

export async function buscarCheckinsPorMesAgrupados(ultimosMeses = 6) {
  try {
    const { checkins } = await buscarTodosCheckins();
    const agora = new Date();
    const meses = [];

    for (let i = ultimosMeses - 1; i >= 0; i--) {
      const d     = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const mes   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const doMes = checkins.filter(c => (c.data || c.dataLocal || '').substring(0, 7) === mes);
      const stats = getCheckinStats(doMes);
      meses.push({
        mes,
        mesLabel     : d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        total        : stats.total,
        compraram    : stats.compraram,
        naoCompraram : stats.naoCompraram,
        faturado     : stats.totalFaturado,
        conversao    : stats.conversao,
      });
    }
    return meses;
  } catch (e) {
    console.log('[CheckinController] Erro buscarCheckinsPorMesAgrupados:', e);
    return [];
  }
}

export async function buscarProdutosMaisVendidos(top = 5) {
  try {
    const { stats } = await buscarTodosCheckins();
    return stats.produtosMaisVendidos
      .slice(0, top)
      .map(p => {
        const meta = PRODUTOS_DISPONIVEIS.find(pd => pd.key === p.key);
        return {
          key  : p.key,
          label: meta?.label || p.key,
          count: p.count,
          color: meta?.color || '#C0D2E6',
          icon : meta?.icon  || 'inventory',
        };
      });
  } catch (e) {
    console.log('[CheckinController] Erro buscarProdutosMaisVendidos:', e);
    return [];
  }
}

export async function buscarMotivosMaisFrequentes(top = 5) {
  try {
    const { stats } = await buscarTodosCheckins();
    return stats.motivosMaisFrequentes
      .slice(0, top)
      .map(m => {
        const meta = MOTIVOS_NAO_COMPRA.find(mn => mn.key === m.key || mn.label === m.key);
        return {
          key  : m.key,
          label: meta?.label || m.key,
          count: m.count,
          color: meta?.color || '#8A9BB0',
          icon : meta?.icon  || 'help-outline',
        };
      });
  } catch (e) {
    console.log('[CheckinController] Erro buscarMotivosMaisFrequentes:', e);
    return [];
  }
}

export async function buscarCheckinsComLocalizacao() {
  try {
    const { checkins } = await buscarTodosCheckins();
    return checkins.filter(c => c.localizacao?.latitude && c.localizacao?.longitude);
  } catch (e) {
    console.log('[CheckinController] Erro buscarCheckinsComLocalizacao:', e);
    return [];
  }
}

export async function buscarCheckinsPorPeriodo(dataInicio, dataFim) {
  try {
    const checkins = await getCheckinsPorPeriodo(dataInicio, dataFim);
    const stats    = getCheckinStats(checkins);
    return { checkins, stats };
  } catch (e) {
    console.log('[CheckinController] Erro buscarCheckinsPorPeriodo:', e);
    return { checkins: [], stats: getCheckinStats([]) };
  }
}

export async function buscarKPIsVendas() {
  try {
    const [{ checkins: hoje }, { checkins: mes }] = await Promise.all([
      buscarCheckinsHoje(),
      buscarCheckinsMes(),
    ]);
    const statsHoje = getCheckinStats(hoje);
    const statsMes  = getCheckinStats(mes);
    return {
      totalVendasMes  : statsMes.totalFaturado,
      totalVisitasMes : statsMes.total,
      conversaoMes    : statsMes.conversao,
      ticketMedioMes  : statsMes.ticketMedio,
      totalVendasHoje : statsHoje.totalFaturado,
      totalVisitasHoje: statsHoje.total,
      conversaoHoje   : statsHoje.conversao,
    };
  } catch (e) {
    console.log('[CheckinController] Erro buscarKPIsVendas:', e);
    return {
      totalVendasMes: 0, totalVisitasMes: 0, conversaoMes: 0, ticketMedioMes: 0,
      totalVendasHoje: 0, totalVisitasHoje: 0, conversaoHoje: 0,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// CACHE
// ════════════════════════════════════════════════════════════════

export function limparCache() {
  invalidarCache();
}

// ── Helpers internos ──────────────────────────────────────────
function _mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}