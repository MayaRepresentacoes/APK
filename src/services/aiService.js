// services/aiService.js
// ════════════════════════════════════════════════════════════════
// FASE 13 — IA COMPLETA
//
// Checklist:
//   ✅ Sugestão venda       — getSugestaoVendaIA()
//   ✅ Prioridade cliente   — calcularPrioridadeClienteIA() + getPrioridadesHoje()
//   ✅ Previsão reposição   — preverReposicaoIA() + getAlertasReposicaoGlobal()
//   ✅ Rota inteligente     — gerarRotaInteligenteIA()
//   ✅ Bonus               — preverVendasMesIA() (RelatoriosScreen)
//   ✅ Bonus               — detectarOportunidadesIA() (DashboardScreen)
//
// FUSÃO v2 — correções de comunicação com services:
//
//   [BUG CRÍTICO 1] Dependência circular com rotaService
//     aiService importava calcularDistanciaKm de rotaService.
//     rotaService chama gerarRotaInteligenteIA() de aiService — ciclo A→B→A.
//     Metro Bundler resolve módulos circulares de forma lazy — quando
//     gerarRotaInteligenteIA() é invocada antes da inicialização
//     completa, calcularDistanciaKm chega como undefined em runtime,
//     silenciosamente retornando NaN em todos os custos e quebrando
//     o algoritmo nearest-neighbor.
//     Fix: fórmula de Haversine inlinada no próprio aiService.
//     A import de rotaService foi removida completamente.
//
//   [BUG CRÍTICO 2] calcularScore() ignora status 'aguardando'
//     criarOrcamento() persiste status='aguardando' no Firebase.
//     O check o.status === 'pendente' nunca passava para orçamentos
//     recém-criados — o bônus de +15pts "Orçamento sem retorno"
//     era sistematicamente ignorado para todos os orçamentos novos.
//     Fix: helper isOrcPendente(o) aceita 'aguardando' OR 'pendente'.
//
//   [FIX 3] getSugestaoVendaIA() guarda diasDesdeUltimo = 9999
//     Se comprasComProd.length === 0, diasDesdeUltimo = 9999.
//     Como 9999 >= ciclo - 5 sempre é verdadeiro, qualquer produto
//     com ciclo calculável receberia confianca: 'alta' erroneamente.
//     Na prática produtosMaisComprados() garante existência de compras,
//     mas a guarda explícita elimina o risco em chamadas diretas.
//
//   Mantidos integralmente:
//     Todos os algoritmos, cálculos, retornos e assinaturas de função.
//     Nenhuma exportação foi removida.
// ════════════════════════════════════════════════════════════════

// [BUG CRÍTICO 1] import de rotaService removido — Haversine inlinado abaixo.

// ════════════════════════════════════════════════════════════════
// [BUG CRÍTICO 1] Haversine inlinado — quebra o ciclo aiService ↔ rotaService
// rotaService importa gerarRotaInteligenteIA() daqui.
// Se importássemos calcularDistanciaKm de rotaService, o Metro Bundler
// resolveria o módulo de forma lazy e a função chegaria como undefined
// na primeira chamada, silenciosamente retornando NaN para todos os
// custos e quebrando o algoritmo nearest-neighbor.
// ════════════════════════════════════════════════════════════════
function calcularDistanciaKmLocal(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 9999;
  const R   = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a   =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════════════════════════════
// [BUG CRÍTICO 2] isOrcPendente — aceita 'aguardando' e 'pendente'
// criarOrcamento() persiste status='aguardando' no Firebase.
// calcularScore() verificava apenas o.status === 'pendente' —
// nenhum orçamento recém-criado recebia o bônus de +15pts.
// ════════════════════════════════════════════════════════════════
function isOrcPendente(o) {
  return o.status === 'pendente' || o.status === 'aguardando';
}

// ════════════════════════════════════════════════════════════════
// UTILS INTERNOS (mantidos integralmente)
// ════════════════════════════════════════════════════════════════

function diasDesdeData(isoStr) {
  if (!isoStr) return 9999;
  return (Date.now() - new Date(isoStr).getTime()) / 86400000;
}

function ultimaCompra(clienteId, todasVisitas) {
  return todasVisitas
    .filter(v => v.clienteId === clienteId && (v.resultado === 'comprou' || v.comprou))
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0))[0] || null;
}

function ultimaVisita(clienteId, todasVisitas) {
  return todasVisitas
    .filter(v => v.clienteId === clienteId)
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0))[0] || null;
}

function cicloMedioCompra(clienteId, todasVisitas) {
  const compras = todasVisitas
    .filter(v => v.clienteId === clienteId && (v.resultado === 'comprou' || v.comprou))
    .map(v => new Date(v.dataLocal || v.data || 0).getTime())
    .sort((a, b) => a - b);
  if (compras.length < 2) return null;
  let total = 0;
  for (let i = 1; i < compras.length; i++) total += (compras[i] - compras[i - 1]) / 86400000;
  return total / (compras.length - 1);
}

function ticketMedioCliente(clienteId, todasVisitas) {
  const compras = todasVisitas.filter(
    v => v.clienteId === clienteId && (v.resultado === 'comprou' || v.comprou) && (v.valor || 0) > 0
  );
  if (!compras.length) return 0;
  return compras.reduce((s, v) => s + v.valor, 0) / compras.length;
}

function totalCompradoUltimos90(clienteId, todasVisitas) {
  const corte = Date.now() - 90 * 86400000;
  return todasVisitas
    .filter(v =>
      v.clienteId === clienteId &&
      (v.resultado === 'comprou' || v.comprou) &&
      new Date(v.dataLocal || 0).getTime() > corte
    )
    .reduce((s, v) => s + (v.valor || 0), 0);
}

function produtosMaisComprados(clienteId, todasVisitas) {
  const mapa = {};
  todasVisitas
    .filter(v => v.clienteId === clienteId && (v.resultado === 'comprou' || v.comprou))
    .forEach(v => (v.produtos || []).forEach(p => { mapa[p] = (mapa[p] || 0) + 1; }));
  return Object.entries(mapa)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, vezes]) => ({ nome, vezes }));
}

// [BUG CRÍTICO 2] isOrcPendente() substituiu o.status === 'pendente'
function calcularScore(cliente, todasVisitas, orcamentos = []) {
  let score = 0;
  const motivos = [];

  const uc            = ultimaCompra(cliente.id, todasVisitas);
  const uv            = ultimaVisita(cliente.id, todasVisitas);
  const ciclo         = cicloMedioCompra(cliente.id, todasVisitas);
  const ticket        = ticketMedioCliente(cliente.id, todasVisitas);
  const diasSemVisita = uv ? diasDesdeData(uv.dataLocal || uv.data) : 9999;
  const diasSemCompra = uc ? diasDesdeData(uc.dataLocal || uc.data) : 9999;

  if (ciclo && uc) {
    const diasAteProxima = ciclo - diasSemCompra;
    if (diasAteProxima >= -5 && diasAteProxima <= 7) {
      score += 30; motivos.push('No prazo de recompra');
    }
  }
  if (diasSemVisita > 20 && diasSemVisita < 9999) {
    score += 25; motivos.push(`${Math.round(diasSemVisita)}d sem visita`);
  }
  if (ticket > 1000) {
    score += 20; motivos.push(`Ticket médio R$ ${Math.round(ticket / 100) * 100}`);
  } else if (ticket > 500) {
    score += 10;
  }
  // [BUG CRÍTICO 2] isOrcPendente aceita 'aguardando' e 'pendente'
  const orcPendente = orcamentos.find(o => o.clienteId === cliente.id && isOrcPendente(o));
  if (orcPendente) {
    score += 15; motivos.push('Orçamento sem retorno');
  }
  if (uv && !uc) {
    score += 10; motivos.push('Nunca converteu');
  }

  return { score: Math.min(score, 100), motivos };
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Prioridade cliente
// EXPORT 1: calcularPrioridadeClienteIA
// Score e contexto de prioridade para UM cliente.
// ════════════════════════════════════════════════════════════════
export function calcularPrioridadeClienteIA(cliente, todasVisitas, orcamentos = []) {
  const { score, motivos } = calcularScore(cliente, todasVisitas, orcamentos);

  const ciclo            = cicloMedioCompra(cliente.id, todasVisitas);
  const uc               = ultimaCompra(cliente.id, todasVisitas);
  const diasSemCompra    = uc ? diasDesdeData(uc.dataLocal || uc.data) : null;
  const emCicloReposicao = ciclo != null && diasSemCompra != null
    ? Math.abs(ciclo - diasSemCompra) <= 7
    : false;

  return {
    score,
    motivos,
    emCicloReposicao,
    ciclo         : ciclo         ? Math.round(ciclo)         : null,
    diasSemCompra : diasSemCompra ? Math.round(diasSemCompra) : null,
    ticketMedio   : ticketMedioCliente(cliente.id, todasVisitas),
    produtos      : produtosMaisComprados(cliente.id, todasVisitas),
    totalUltimos90: totalCompradoUltimos90(cliente.id, todasVisitas),
  };
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Prioridade cliente
// EXPORT 2: getPrioridadesHoje
// Top N clientes para visitar hoje, excluindo visitados.
// ════════════════════════════════════════════════════════════════
export function getPrioridadesHoje(clientes, todasVisitas, orcamentos = [], limite = 5) {
  if (!clientes?.length) return [];

  const hoje = new Date().toISOString().substring(0, 10);
  const visitadosHoje = new Set(
    todasVisitas
      .filter(v => (v.dataLocal || v.data || '').substring(0, 10) === hoje)
      .map(v => v.clienteId)
  );

  return clientes
    .filter(c => !visitadosHoje.has(c.id))
    .map(c => ({ ...c, ...calcularPrioridadeClienteIA(c, todasVisitas, orcamentos) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

// ════════════════════════════════════════════════════════════════
// EXPORT 3: detectarOportunidadesIA
// Clientes no ciclo de reposição (até +7 dias, inclui atrasados).
// ════════════════════════════════════════════════════════════════
export function detectarOportunidadesIA(clientes, todasVisitas, limite = 5) {
  if (!clientes?.length) return [];
  const oportunidades = [];

  clientes.forEach(c => {
    const ciclo = cicloMedioCompra(c.id, todasVisitas);
    if (!ciclo || ciclo < 7) return;
    const uc = ultimaCompra(c.id, todasVisitas);
    if (!uc) return;
    const diasSemCompra = diasDesdeData(uc.dataLocal || uc.data);
    const diasRestantes = Math.round(ciclo - diasSemCompra);
    if (diasRestantes > 7) return;

    const produtos = produtosMaisComprados(c.id, todasVisitas);
    const urgencia = diasRestantes < 0 ? 'atrasado' : diasRestantes <= 2 ? 'hoje' : 'breve';

    oportunidades.push({
      ...c,
      ciclo         : Math.round(ciclo),
      diasRestantes,
      urgencia,
      produto       : produtos[0]?.nome || null,
      produtos,
      ticketMedio   : ticketMedioCliente(c.id, todasVisitas),
      totalUltimos90: totalCompradoUltimos90(c.id, todasVisitas),
    });
  });

  return oportunidades
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .slice(0, limite);
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Rota inteligente
// EXPORT 4: gerarRotaInteligenteIA
// Nearest-neighbor com custo ponderado por score IA.
// [BUG CRÍTICO 1] calcularDistanciaKmLocal() — sem import circular.
// ════════════════════════════════════════════════════════════════
export function gerarRotaInteligenteIA(
  clientes, todasVisitas, orcamentos = [], limite = 8,
  origemLat = null, origemLon = null
) {
  if (!clientes?.length) return [];

  const hoje = new Date().toISOString().substring(0, 10);
  const visitadosHoje = new Set(
    todasVisitas
      .filter(v => (v.dataLocal || v.data || '').substring(0, 10) === hoje)
      .map(v => v.clienteId)
  );

  const candidatos = clientes
    .filter(c => !visitadosHoje.has(c.id))
    .map(c => {
      const ai = calcularPrioridadeClienteIA(c, todasVisitas, orcamentos);
      return { ...c, aiScore: ai.score, aiMotivos: ai.motivos, ...ai };
    })
    .filter(c => c.aiScore > 0)
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, limite * 2);

  if (!candidatos.length) return [];

  const comGPS = candidatos.filter(c => c.latitude && c.longitude);
  if (!comGPS.length) {
    return candidatos.slice(0, limite).map((c, i) => ({ ...c, ordemRota: i + 1 }));
  }

  const restantes = [...comGPS];
  const rota    = [];
  let latAtual  = origemLat ?? restantes[0].latitude;
  let lonAtual  = origemLon ?? restantes[0].longitude;

  while (restantes.length && rota.length < limite) {
    let menorCusto = Infinity;
    let idxProx    = 0;
    restantes.forEach((c, i) => {
      // [BUG CRÍTICO 1] calcularDistanciaKmLocal() — sem import de rotaService
      const distKm = calcularDistanciaKmLocal(latAtual, lonAtual, c.latitude, c.longitude);
      const custo  = distKm / (1 + (c.aiScore || 0) / 100);
      if (custo < menorCusto) { menorCusto = custo; idxProx = i; }
    });
    const proximo = restantes.splice(idxProx, 1)[0];
    const distKm  = calcularDistanciaKmLocal(latAtual, lonAtual, proximo.latitude, proximo.longitude);
    rota.push({ ...proximo, distanciaKm: Math.round(distKm * 10) / 10, ordemRota: rota.length + 1 });
    latAtual = proximo.latitude;
    lonAtual = proximo.longitude;
  }

  const semGPS = candidatos
    .filter(c => !c.latitude || !c.longitude)
    .slice(0, limite - rota.length)
    .map((c, i) => ({ ...c, distanciaKm: null, ordemRota: rota.length + i + 1 }));

  return [...rota, ...semGPS];
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Sugestão de venda
// EXPORT 5: getSugestaoVendaIA
// Sugestão de produtos baseada em histórico + colaborativo.
// [FIX 3] Guarda diasDesdeUltimo < 9999 antes de calcular confiança.
// ════════════════════════════════════════════════════════════════
export function getSugestaoVendaIA(cliente, todasVisitas, todosClientes = []) {
  const sugestoes     = [];
  const jaAdicionados = new Set();

  const produtosHistorico = produtosMaisComprados(cliente.id, todasVisitas);

  produtosHistorico.forEach(({ nome, vezes }) => {
    if (jaAdicionados.has(nome)) return;

    const comprasComProd = todasVisitas.filter(v =>
      v.clienteId === cliente.id &&
      (v.resultado === 'comprou' || v.comprou) &&
      (v.produtos || []).includes(nome)
    ).sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));

    // [FIX 3] diasDesdeUltimo explícito — evita 9999 disparar confiança 'alta'
    const diasDesdeUltimo = comprasComProd.length
      ? diasDesdeData(comprasComProd[0].dataLocal || comprasComProd[0].data)
      : 9999;

    const datas = comprasComProd
      .map(v => new Date(v.dataLocal || 0).getTime())
      .sort((a, b) => a - b);
    let ciclo = null;
    if (datas.length >= 2) {
      let total = 0;
      for (let i = 1; i < datas.length; i++) total += (datas[i] - datas[i - 1]) / 86400000;
      ciclo = total / (datas.length - 1);
    }

    let confianca = 'baixa';
    let motivo    = `Comprado ${vezes}x`;
    let tipo      = 'historico';

    // [FIX 3] diasDesdeUltimo < 9999 garante que só produtos realmente
    // comprados (com data válida) recebem elevação de confiança para 'alta'
    if (ciclo && diasDesdeUltimo < 9999 && diasDesdeUltimo >= ciclo - 5) {
      confianca = 'alta';
      motivo    = `Reposição prevista (~${Math.round(ciclo)}d)`;
      tipo      = 'reposicao';
    } else if (vezes >= 3) {
      confianca = 'media';
      motivo    = `Comprado ${vezes}x — top produto`;
    }

    sugestoes.push({ nome, motivo, confianca, tipo, vezes, diasDesdeUltimo });
    jaAdicionados.add(nome);
  });

  // Filtro colaborativo por tipo de cliente
  const clientesMesmoTipo = todosClientes.filter(c => c.id !== cliente.id && c.tipo === cliente.tipo);
  const mapaColaborativo  = {};
  clientesMesmoTipo.forEach(c => {
    todasVisitas
      .filter(v => v.clienteId === c.id && (v.resultado === 'comprou' || v.comprou))
      .forEach(v => {
        (v.produtos || []).forEach(p => { mapaColaborativo[p] = (mapaColaborativo[p] || 0) + 1; });
      });
  });

  Object.entries(mapaColaborativo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([nome]) => {
      if (jaAdicionados.has(nome)) return;
      sugestoes.push({
        nome,
        motivo      : `Popular em ${cliente.tipo}s da região`,
        confianca   : 'baixa',
        tipo        : 'colaborativo',
        vezes       : 0,
        diasDesdeUltimo: null,
      });
      jaAdicionados.add(nome);
    });

  const ordemConf = { alta: 0, media: 1, baixa: 2 };
  const ordemTipo = { reposicao: 0, historico: 1, colaborativo: 2 };

  return sugestoes
    .sort((a, b) => {
      const dc = (ordemConf[a.confianca] || 0) - (ordemConf[b.confianca] || 0);
      if (dc !== 0) return dc;
      return (ordemTipo[a.tipo] || 0) - (ordemTipo[b.tipo] || 0);
    })
    .slice(0, 8);
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Previsão reposição
// EXPORT 6: preverReposicaoIA
// Prevê data de reposição por produto individual.
// ════════════════════════════════════════════════════════════════
export function preverReposicaoIA(cliente, todasVisitas) {
  const previsoes = [];

  const produtosSet = new Set();
  todasVisitas
    .filter(v => v.clienteId === cliente.id && (v.resultado === 'comprou' || v.comprou))
    .forEach(v => (v.produtos || []).forEach(p => { if (p) produtosSet.add(p); }));

  produtosSet.forEach(produto => {
    const comprasDoProd = todasVisitas
      .filter(v =>
        v.clienteId === cliente.id &&
        (v.resultado === 'comprou' || v.comprou) &&
        (v.produtos || []).includes(produto)
      )
      .map(v => new Date(v.dataLocal || v.data || 0).getTime())
      .sort((a, b) => a - b);

    if (!comprasDoProd.length) return;

    const ultimaCompraTs  = comprasDoProd[comprasDoProd.length - 1];
    const diasDesdeUltima = (Date.now() - ultimaCompraTs) / 86400000;

    let ciclo     = null;
    let confianca = 'baixa';

    if (comprasDoProd.length >= 2) {
      let total = 0;
      for (let i = 1; i < comprasDoProd.length; i++) {
        total += (comprasDoProd[i] - comprasDoProd[i - 1]) / 86400000;
      }
      ciclo     = total / (comprasDoProd.length - 1);
      confianca = comprasDoProd.length >= 3 ? 'alta' : 'media';
    }

    const cicloEfetivo   = ciclo ?? cicloMedioCompra(cliente.id, todasVisitas) ?? 30;
    const diasRestantes  = Math.round(cicloEfetivo - diasDesdeUltima);
    const dataEstimadaMs = ultimaCompraTs + cicloEfetivo * 86400000;
    const dataEstimada   = new Date(dataEstimadaMs).toISOString().substring(0, 10);

    const urgencia =
      diasRestantes < 0   ? 'atrasado' :
      diasRestantes === 0 ? 'hoje'     :
      diasRestantes <= 5  ? 'breve'    : 'ok';

    previsoes.push({
      produto,
      ultimaCompra : new Date(ultimaCompraTs).toISOString(),
      ciclo        : Math.round(cicloEfetivo),
      dataEstimada,
      diasRestantes,
      urgencia,
      confianca,
      totalCompras : comprasDoProd.length,
    });
  });

  const ordemUrgencia = { atrasado: 0, hoje: 1, breve: 2, ok: 3 };
  return previsoes.sort((a, b) => {
    const du = (ordemUrgencia[a.urgencia] || 0) - (ordemUrgencia[b.urgencia] || 0);
    if (du !== 0) return du;
    return a.diasRestantes - b.diasRestantes;
  });
}

// ════════════════════════════════════════════════════════════════
// EXPORT 7: preverVendasMesIA
// Projeta vendas do mês: projeção linear + histórico + sazonalidade + tendência.
// Usado por RelatoriosScreen (CardPrevisaoIA).
// ════════════════════════════════════════════════════════════════
export function preverVendasMesIA(todasVisitas, mes = null, ano = null) {
  const agora   = new Date();
  const mesAlvo = mes  ?? agora.getMonth();
  const anoAlvo = ano  ?? agora.getFullYear();

  const valorAtual = todasVisitas
    .filter(v => {
      if (!(v.resultado === 'comprou' || v.comprou)) return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mesAlvo && d.getFullYear() === anoAlvo;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);

  const diasTotais     = new Date(anoAlvo, mesAlvo + 1, 0).getDate();
  const diaAtual       = mesAlvo === agora.getMonth() && anoAlvo === agora.getFullYear()
    ? agora.getDate()
    : diasTotais;
  const diasDecorridos = diaAtual;
  const pctMes         = Math.round((diasDecorridos / diasTotais) * 100);

  const projecaoLinear = diasDecorridos > 0
    ? (valorAtual / diasDecorridos) * diasTotais
    : 0;

  const mediaUltimos3 = (() => {
    let total = 0;
    let count = 0;
    for (let i = 1; i <= 3; i++) {
      let m = mesAlvo - i;
      let a = anoAlvo;
      if (m < 0) { m += 12; a -= 1; }
      const v = todasVisitas
        .filter(vis => {
          if (!(vis.resultado === 'comprou' || vis.comprou)) return false;
          const d = new Date(vis.dataLocal || vis.data || 0);
          return d.getMonth() === m && d.getFullYear() === a;
        })
        .reduce((s, vis) => s + (vis.valor || 0), 0);
      if (v > 0) { total += v; count++; }
    }
    return count > 0 ? total / count : 0;
  })();

  const mesmoMesAnoPassado = todasVisitas
    .filter(v => {
      if (!(v.resultado === 'comprou' || v.comprou)) return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mesAlvo && d.getFullYear() === anoAlvo - 1;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);

  const fatorSazonal = mesmoMesAnoPassado > 0 && mediaUltimos3 > 0
    ? mesmoMesAnoPassado / mediaUltimos3
    : 1;

  const mesAnt1 = mesAlvo === 0 ? 11 : mesAlvo - 1;
  const anoAnt1 = mesAlvo === 0 ? anoAlvo - 1 : anoAlvo;
  const mesAnt2 = mesAnt1 === 0 ? 11 : mesAnt1 - 1;
  const anoAnt2 = mesAnt1 === 0 ? anoAnt1 - 1 : anoAnt1;

  const vendMesAnt1 = todasVisitas
    .filter(v => {
      if (!(v.resultado === 'comprou' || v.comprou)) return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mesAnt1 && d.getFullYear() === anoAnt1;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);

  const vendMesAnt2 = todasVisitas
    .filter(v => {
      if (!(v.resultado === 'comprou' || v.comprou)) return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mesAnt2 && d.getFullYear() === anoAnt2;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);

  const tendencia = vendMesAnt2 > 0
    ? Math.round(((vendMesAnt1 - vendMesAnt2) / vendMesAnt2) * 100)
    : 0;
  const fatorTendencia = 1 + (tendencia / 200);

  const baseHistorica = mediaUltimos3 * fatorSazonal * fatorTendencia;
  const pesoLinear    = diasDecorridos >= 10 ? 0.65 : 0.35;
  const pesoHistorico = 1 - pesoLinear;

  const valorPrevisto = Math.round(
    projecaoLinear * pesoLinear + baseHistorica * pesoHistorico
  );

  const margemPct   = Math.max(0.08, 0.20 - (diasDecorridos / diasTotais) * 0.12);
  const valorMinimo = Math.round(valorPrevisto * (1 - margemPct));
  const valorMaximo = Math.round(valorPrevisto * (1 + margemPct));

  const confianca =
    diasDecorridos >= 20 && mediaUltimos3 > 0 ? 'alta'  :
    diasDecorridos >= 10 || mediaUltimos3 > 0 ? 'media' : 'baixa';

  return {
    valorAtual,
    valorPrevisto,
    valorMinimo,
    valorMaximo,
    confianca,
    diasDecorridos,
    diasTotais,
    pctMes,
    tendencia,
    fatorSazonal  : Math.round(fatorSazonal * 100) / 100,
    mediaUltimos3 : Math.round(mediaUltimos3),
    metodologia   : diasDecorridos >= 10 ? 'linear+historico' : 'historico',
  };
}

// ════════════════════════════════════════════════════════════════
// EXPORT 8: getAlertasReposicaoGlobal
// Agrega alertas de reposição de TODOS os clientes.
// Usado por AlertaScreen e DashboardScreen.
// ════════════════════════════════════════════════════════════════
export function getAlertasReposicaoGlobal(todosClientes, todasVisitas, limite = 20) {
  if (!todosClientes?.length || !todasVisitas?.length) return [];

  const alertas = [];

  todosClientes.forEach(cliente => {
    const previsoes = preverReposicaoIA(cliente, todasVisitas);

    previsoes
      .filter(p => p.urgencia === 'atrasado' || p.urgencia === 'hoje' || p.urgencia === 'breve')
      .forEach(p => {
        let mensagem;
        const diasAbs = Math.abs(p.diasRestantes);
        if (p.urgencia === 'atrasado') {
          mensagem = `Reposição de ${p.produto} atrasada ${diasAbs}d`;
        } else if (p.urgencia === 'hoje') {
          mensagem = `Repor ${p.produto} hoje`;
        } else {
          mensagem = `${p.diasRestantes}d para repor ${p.produto}`;
        }

        alertas.push({
          clienteId    : cliente.id,
          clienteNome  : cliente.nome,
          clienteTipo  : cliente.tipo,
          clienteCidade: cliente.cidade || null,
          produto      : p.produto,
          diasRestantes: p.diasRestantes,
          urgencia     : p.urgencia,
          confianca    : p.confianca,
          ciclo        : p.ciclo,
          dataEstimada : p.dataEstimada,
          ultimaCompra : p.ultimaCompra,
          totalCompras : p.totalCompras,
          mensagem,
        });
      });
  });

  const ordemUrgencia = { atrasado: 0, hoje: 1, breve: 2 };
  return alertas
    .sort((a, b) => {
      const du = (ordemUrgencia[a.urgencia] ?? 3) - (ordemUrgencia[b.urgencia] ?? 3);
      if (du !== 0) return du;
      return a.diasRestantes - b.diasRestantes;
    })
    .slice(0, limite);
}