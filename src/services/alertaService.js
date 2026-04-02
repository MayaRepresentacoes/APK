// services/alertaService.js
// ════════════════════════════════════════════════════════════════
// ALERTA SERVICE
// Gera alertas de negócio derivados dos dados do app:
//   1. getAlertasReposicao  — clientes sem compra há X dias
//   2. getClientesParados   — clientes sem nenhum contato
//   3. getClientesQuentes   — clientes com alto score de atividade
//   4. getAlertasDashboard  — agregação para o DashboardScreen
// ════════════════════════════════════════════════════════════════

// [CORRIGIDO] Removidos getDiasSemCompra, getUltimaCompra (analyticsService)
// e getVisitasCliente (visitaService) — importados mas nunca usados.
// As métricas são calculadas diretamente em memória sobre todasVisitas.
import { getTodosClientes } from './clienteService';
import { getTodasVisitas }  from './visitaService';

// ════════════════════════════════════════════════════════════════
// EXPORT 1: getAlertasReposicao
// Clientes que estão sem compra há X dias.
// @param {number} diasLimite — padrão 10 dias
// ════════════════════════════════════════════════════════════════
export async function getAlertasReposicao(diasLimite = 10) {
  const [clientes, todasVisitas] = await Promise.all([
    getTodosClientes(),
    getTodasVisitas(),
  ]);

  const alertas = [];

  clientes.forEach(c => {
    const compras = todasVisitas
      .filter(v => v.clienteId === c.id && (v.resultado === 'comprou' || v.comprou))
      .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));

    if (!compras.length) return;

    const dias = Math.floor(
      (Date.now() - new Date(compras[0].dataLocal || compras[0].data || 0).getTime()) / 86400000
    );

    if (dias < diasLimite) return;

    const prioridade =
      dias >= 30 ? 'alta'  :
      dias >= 20 ? 'media' : 'baixa';

    alertas.push({
      clienteId    : c.id,
      clienteNome  : c.nome,
      clienteTipo  : c.tipo   || '',
      clienteCidade: c.cidade || '',
      diasSemCompra: dias,
      ultimaCompra : compras[0] || null,
      prioridade,
      tipo         : 'reposicao',
      mensagem     : `${c.nome} está há ${dias} dias sem comprar`,
    });
  });

  const ordem = { alta: 0, media: 1, baixa: 2 };
  alertas.sort((a, b) =>
    (ordem[a.prioridade] - ordem[b.prioridade]) ||
    (b.diasSemCompra - a.diasSemCompra)
  );
  return alertas;
}

// ════════════════════════════════════════════════════════════════
// EXPORT 2: getClientesParados
// Clientes sem nenhum contato há X dias.
// @param {number} diasLimite — padrão 15 dias
// ════════════════════════════════════════════════════════════════
export async function getClientesParados(diasLimite = 15) {
  const [clientes, todasVisitas] = await Promise.all([
    getTodosClientes(),
    getTodasVisitas(),
  ]);

  const hoje    = new Date();
  const parados = [];

  clientes.forEach(c => {
    const visitasDoCliente = todasVisitas
      .filter(v => v.clienteId === c.id)
      .map(v => new Date(v.dataLocal || v.data || 0).getTime());

    const ultimoContato = visitasDoCliente.length > 0
      ? new Date(Math.max(...visitasDoCliente))
      : null;

    const diasSem = ultimoContato
      ? Math.floor((hoje - ultimoContato) / 86400000)
      : 999;

    if (diasSem < diasLimite) return;

    parados.push({
      clienteId     : c.id,
      clienteNome   : c.nome,
      clienteTipo   : c.tipo   || '',
      clienteCidade : c.cidade || '',
      diasSemContato: diasSem,
      ultimoContato : ultimoContato
        ? ultimoContato.toISOString().substring(0, 10)
        : null,
      tipo    : 'parado',
      mensagem: diasSem >= 999
        ? `${c.nome} nunca foi visitado`
        : `${c.nome} sem contato há ${diasSem} dias`,
    });
  });

  parados.sort((a, b) => b.diasSemContato - a.diasSemContato);
  return parados;
}

// ════════════════════════════════════════════════════════════════
// EXPORT 3: getClientesQuentes
// Clientes com alto score de atividade.
// Score = 60% dos dias recentes + 40% do valor normalizado
// @param {number} limite — padrão 10
// ════════════════════════════════════════════════════════════════
export async function getClientesQuentes(limite = 10) {
  const [clientes, todasVisitas] = await Promise.all([
    getTodosClientes(),
    getTodasVisitas(),
  ]);

  const hoje    = new Date();
  const quentes = [];

  clientes.forEach(c => {
    const compras = todasVisitas
      .filter(v => v.clienteId === c.id && (v.resultado === 'comprou' || v.comprou));

    if (!compras.length) return;

    const totalComprado = compras.reduce((s, v) => s + (v.valor || 0), 0);
    const qtdCompras    = compras.length;
    const ticketMedio   = qtdCompras > 0 ? totalComprado / qtdCompras : 0;

    const ultimaData = new Date(
      Math.max(...compras.map(v => new Date(v.dataLocal || v.data || 0).getTime()))
    );
    const dias = Math.floor((hoje - ultimaData) / 86400000);

    const scoreDias  = Math.max(0, 100 - dias);
    const scoreValor = Math.min(100, totalComprado / 100);
    const score      = Math.round((scoreDias * 0.6) + (scoreValor * 0.4));

    if (score <= 20) return;

    quentes.push({
      clienteId    : c.id,
      clienteNome  : c.nome,
      clienteTipo  : c.tipo   || '',
      clienteCidade: c.cidade || '',
      totalComprado,
      qtdCompras,
      ticketMedio,
      diasSemCompra: dias,
      score,
      tipo    : 'quente',
      mensagem: `${c.nome} — Score ${score} 🔥`,
    });
  });

  quentes.sort((a, b) => b.score - a.score);
  return quentes.slice(0, limite);
}

// ════════════════════════════════════════════════════════════════
// EXPORT 4: getAlertasDashboard
// Agrega os 3 tipos de alerta em uma única chamada paralela.
// ════════════════════════════════════════════════════════════════
export async function getAlertasDashboard() {
  const [clientes, todasVisitas] = await Promise.all([
    getTodosClientes(),
    getTodasVisitas(),
  ]);

  const hoje      = new Date();
  const reposicao = [];
  const parados   = [];
  const quentes   = [];

  clientes.forEach(c => {
    const visitasDoCliente = todasVisitas.filter(v => v.clienteId === c.id);
    const compras = visitasDoCliente.filter(v => v.resultado === 'comprou' || v.comprou);

    const datesContato    = visitasDoCliente.map(v =>
      new Date(v.dataLocal || v.data || 0).getTime()
    );
    const ultimoContatoTs = datesContato.length > 0 ? Math.max(...datesContato) : null;
    const diasSemContato  = ultimoContatoTs
      ? Math.floor((hoje - new Date(ultimoContatoTs)) / 86400000)
      : 999;

    if (diasSemContato >= 15) {
      parados.push({
        clienteId     : c.id,
        clienteNome   : c.nome,
        clienteTipo   : c.tipo   || '',
        clienteCidade : c.cidade || '',
        diasSemContato,
        ultimoContato : ultimoContatoTs
          ? new Date(ultimoContatoTs).toISOString().substring(0, 10)
          : null,
        tipo    : 'parado',
        mensagem: diasSemContato >= 999
          ? `${c.nome} nunca foi visitado`
          : `${c.nome} sem contato há ${diasSemContato} dias`,
      });
    }

    if (!compras.length) return;

    const ultimaCompraTs = Math.max(
      ...compras.map(v => new Date(v.dataLocal || v.data || 0).getTime())
    );
    const diasSemCompra = Math.floor((hoje - new Date(ultimaCompraTs)) / 86400000);

    if (diasSemCompra >= 10) {
      const prioridade =
        diasSemCompra >= 30 ? 'alta'  :
        diasSemCompra >= 20 ? 'media' : 'baixa';

      reposicao.push({
        clienteId    : c.id,
        clienteNome  : c.nome,
        clienteTipo  : c.tipo   || '',
        clienteCidade: c.cidade || '',
        diasSemCompra,
        prioridade,
        tipo    : 'reposicao',
        mensagem: `${c.nome} está há ${diasSemCompra} dias sem comprar`,
      });
    }

    const totalComprado = compras.reduce((s, v) => s + (v.valor || 0), 0);
    const qtdCompras    = compras.length;
    const scoreDias     = Math.max(0, 100 - diasSemCompra);
    const scoreValor    = Math.min(100, totalComprado / 100);
    const score         = Math.round((scoreDias * 0.6) + (scoreValor * 0.4));

    if (score > 20) {
      quentes.push({
        clienteId    : c.id,
        clienteNome  : c.nome,
        clienteTipo  : c.tipo   || '',
        clienteCidade: c.cidade || '',
        totalComprado,
        qtdCompras,
        ticketMedio  : qtdCompras > 0 ? totalComprado / qtdCompras : 0,
        diasSemCompra,
        score,
        tipo    : 'quente',
        mensagem: `${c.nome} — Score ${score} 🔥`,
      });
    }
  });

  const ordemPrio = { alta: 0, media: 1, baixa: 2 };
  reposicao.sort((a, b) =>
    (ordemPrio[a.prioridade] - ordemPrio[b.prioridade]) ||
    (b.diasSemCompra - a.diasSemCompra)
  );
  parados.sort((a, b) => b.diasSemContato - a.diasSemContato);
  quentes.sort((a, b) => b.score - a.score);

  const totalUrgentes =
    reposicao.filter(r => r.prioridade === 'alta').length +
    parados.filter(p => p.diasSemContato >= 999).length;

  return {
    reposicao : reposicao.slice(0, 20),
    parados   : parados.slice(0, 20),
    quentes   : quentes.slice(0, 10),
    totalUrgentes,
  };
}