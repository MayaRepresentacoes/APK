// services/analyticsService.js
// ════════════════════════════════════════════════════════════════
// ANALYTICS SERVICE — KPIs e resumos calculados por cliente
// Usado por: PlanejamentoScreen, ClienteDetalheScreen, RelatoriosScreen
// ════════════════════════════════════════════════════════════════

// ── Helpers internos ──────────────────────────────────────────
function _compras(clienteId, visitas) {
  return visitas.filter(v =>
    v.clienteId === clienteId && (v.resultado === 'comprou' || v.comprou)
  ).sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getDiasSemCompra
// Dias desde a última compra do cliente. null = nunca comprou.
// ════════════════════════════════════════════════════════════════
export function getDiasSemCompra(clienteId, visitas) {
  const compras = _compras(clienteId, visitas);
  if (!compras.length) return null;
  const ultima = new Date(compras[0].dataLocal || compras[0].data || 0);
  return Math.floor((Date.now() - ultima.getTime()) / 86400000);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getTicketMedio
// Ticket médio do cliente (só compras com valor > 0).
// ════════════════════════════════════════════════════════════════
export function getTicketMedio(clienteId, visitas) {
  const compras = _compras(clienteId, visitas).filter(v => (v.valor || 0) > 0);
  if (!compras.length) return 0;
  return compras.reduce((s, v) => s + v.valor, 0) / compras.length;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getUltimaCompra
// Objeto da última visita com compra.
// ════════════════════════════════════════════════════════════════
export function getUltimaCompra(clienteId, visitas) {
  return _compras(clienteId, visitas)[0] || null;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getFrequenciaVisitas
// Ciclo médio entre visitas em dias. null = menos de 2 visitas.
// ════════════════════════════════════════════════════════════════
export function getFrequenciaVisitas(clienteId, visitas) {
  const todas = visitas
    .filter(v => v.clienteId === clienteId)
    .map(v => new Date(v.dataLocal || v.data || 0).getTime())
    .sort((a, b) => a - b);
  if (todas.length < 2) return null;
  let total = 0;
  for (let i = 1; i < todas.length; i++) total += (todas[i] - todas[i - 1]) / 86400000;
  return Math.round(total / (todas.length - 1));
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getTotalVendasMes
// Soma de vendas do cliente no mês/ano indicado.
// ════════════════════════════════════════════════════════════════
export function getTotalVendasMes(clienteId, visitas, mes = null, ano = null) {
  const agora  = new Date();
  const mesRef = mes  ?? agora.getMonth();
  const anoRef = ano  ?? agora.getFullYear();
  return visitas
    .filter(v => {
      if (v.clienteId !== clienteId) return false;
      if (!(v.resultado === 'comprou' || v.comprou)) return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mesRef && d.getFullYear() === anoRef;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getResumoCliente
// KPIs consolidados — consumido pelo ClienteDetalheScreen.
// Retorna um único objeto com todos os indicadores.
// ════════════════════════════════════════════════════════════════
export function getResumoCliente(clienteId, visitas) {
  const todasDoCliente = visitas.filter(v => v.clienteId === clienteId);
  const compras        = todasDoCliente.filter(v => v.resultado === 'comprou' || v.comprou);

  const totalVendido   = compras.reduce((s, v) => s + (v.valor || 0), 0);
  const totalCompras   = compras.length;
  const totalVisitas   = todasDoCliente.length;
  const ticketMedio    = totalCompras > 0 ? totalVendido / totalCompras : 0;

  const sorted = [...compras].sort((a, b) =>
    new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0)
  );
  const ultimaCompra    = sorted[0] || null;
  const diasSemCompra   = ultimaCompra
    ? Math.floor((Date.now() - new Date(ultimaCompra.dataLocal || ultimaCompra.data || 0).getTime()) / 86400000)
    : null;

  const agora   = new Date();
  const totalMes = visitas
    .filter(v => {
      if (v.clienteId !== clienteId) return false;
      if (!(v.resultado === 'comprou' || v.comprou)) return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    })
    .reduce((s, v) => s + (v.valor || 0), 0);

  // Ciclo médio de visitas
  const datas = todasDoCliente
    .map(v => new Date(v.dataLocal || v.data || 0).getTime())
    .sort((a, b) => a - b);
  let frequenciaVisitas = null;
  if (datas.length >= 2) {
    let soma = 0;
    for (let i = 1; i < datas.length; i++) soma += (datas[i] - datas[i - 1]) / 86400000;
    frequenciaVisitas = Math.round(soma / (datas.length - 1));
  }

  return {
    totalVendido,
    totalCompras,
    totalVisitas,
    ticketMedio,
    ultimaCompra,
    diasSemCompra,
    totalMes,
    frequenciaVisitas,
  };
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getProdutosMaisVendidos
// Top N produtos mais comprados por um cliente.
// Retorna array { nome, vezes, valorTotal, ultimaCompra }.
// ════════════════════════════════════════════════════════════════
export function getProdutosMaisVendidos(clienteId, visitas, n = 3) {
  const mapa = {};
  visitas
    .filter(v => v.clienteId === clienteId && (v.resultado === 'comprou' || v.comprou))
    .forEach(v => {
      const valorUnit = Array.isArray(v.produtos) && v.produtos.length > 0
        ? (v.valor || 0) / v.produtos.length
        : 0;
      (v.produtos || []).forEach(p => {
        if (!p) return;
        if (!mapa[p]) mapa[p] = { nome: p, vezes: 0, valorTotal: 0, ultimaCompra: null };
        mapa[p].vezes     += 1;
        mapa[p].valorTotal += valorUnit;
        // Mantém a data da última compra deste produto
        const data = v.dataLocal || v.data || '';
        if (!mapa[p].ultimaCompra || data > mapa[p].ultimaCompra) {
          mapa[p].ultimaCompra = data;
        }
      });
    });
  return Object.values(mapa)
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, n);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getHistoricoVisitas
// Histórico completo de visitas de um cliente, com campos
// normalizados e enriquecidos (duração desde a visita, etc.)
// ════════════════════════════════════════════════════════════════
export function getHistoricoVisitas(clienteId, visitas) {
  return visitas
    .filter(v => v.clienteId === clienteId)
    .sort((a, b) => new Date(b.dataLocal || b.data || 0) - new Date(a.dataLocal || a.data || 0))
    .map(v => ({
      ...v,
      diasAtras: Math.floor(
        (Date.now() - new Date(v.dataLocal || v.data || 0).getTime()) / 86400000
      ),
    }));
}