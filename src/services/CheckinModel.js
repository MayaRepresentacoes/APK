// services/CheckinModel.js
// ════════════════════════════════════════════════════════════════
// CHECKIN MODEL — Normaliza e valida os dados de uma visita/checkin
// antes de persistir no Firestore via addCheckin().
//
// Importado por: visitaService.js → registrarCheckin()
//
// FUSÃO v3 — sobre doc 13:
//
//   [NOVO] valorPorRep
//     CheckinScreen envia valorPorRep = { 'FORTLEV': 1500, 'AFORT': 800 }.
//     valor total = soma de valorPorRep (fallback para valor simples).
//     Persiste valorPorRep no Firestore para o relatório por marca.
//
//   [NOVO] representadas[]
//     Array das marcas envolvidas na venda (derivado de PRODUTO_REP no
//     CheckinScreen). Persiste para filtros e relatórios.
//
//   [NOVO] fornecedores{}
//     Objeto { 'FORTLEV': true, 'AFORT': true } compatível com
//     VisitasScreen.normalizarFornecedores() — alimenta o ranking.
//     Aceita chaves 'METAL TECH' e 'SOARES TINTAS' que o mapa do
//     VisitasScreen converte para 'METAL_TECH' e 'TINTAS_SOARES'.
//
//   [NOVO] fotos aceita arrays
//     CheckinScreen envia fotos = { estoque:[], gondola:[], concorrentes:[] }.
//     fotosNorm aceita Array (novo) e string URI (legado) por tipo.
//     Tipos suportados: estoque, gondola, concorrentes, obra (legado).
//
//   Mantidos integralmente do doc 13:
//     _normalizarResultado(), todos os campos originais, timestamps,
//     motivo string singular, proximaVisita condicional.
// ════════════════════════════════════════════════════════════════

function _normalizarResultado(resultado, comprou) {
  if (resultado === 'comprou')     return 'comprou';
  if (resultado === 'nao_comprou') return 'naocomprou';
  if (resultado === 'naocomprou')  return 'naocomprou';
  if (resultado === 'retornar')    return 'retornar';
  if (comprou === true)            return 'comprou';
  if (comprou === false)           return 'naocomprou';
  return resultado || 'naocomprou';
}

export function createCheckinModel(dados = {}) {
  const agora          = new Date();
  const isoCompleto    = dados.dataLocal || dados.dataISO || agora.toISOString();
  const isoData        = (dados.data     || isoCompleto).substring(0, 10);
  const isoMes         = (dados.mes      || isoCompleto).substring(0, 7);
  const resultadoFinal = _normalizarResultado(dados.resultado, dados.comprou);
  const comprouFinal   = resultadoFinal === 'comprou';

  // ── [NOVO] valorPorRep → numérico ────────────────────────────
  const valorPorRepFinal = {};
  if (comprouFinal && dados.valorPorRep && typeof dados.valorPorRep === 'object') {
    Object.entries(dados.valorPorRep).forEach(([rep, v]) => {
      const num = typeof v === 'number'
        ? v
        : parseFloat(String(v || '0').replace(/\./g, '').replace(',', '.')) || 0;
      if (num > 0) valorPorRepFinal[rep] = num;
    });
  }

  // ── [NOVO] valor total: soma de valorPorRep ou valor simples ──
  let valorNum = 0;
  if (comprouFinal) {
    const somaRep = Object.values(valorPorRepFinal).reduce((s, v) => s + v, 0);
    if (somaRep > 0) {
      valorNum = somaRep;
    } else {
      // Fallback para valor simples (campo original)
      valorNum = parseFloat(
        String(dados.valor || 0).replace(/\./g, '').replace(',', '.')
      ) || 0;
    }
  }

  // ── [NOVO] representadas[] ────────────────────────────────────
  const representadasFinal = comprouFinal && Array.isArray(dados.representadas) && dados.representadas.length > 0
    ? dados.representadas
    : [];

  // ── [NOVO] fornecedores{} para VisitasScreen ranking ─────────
  // VisitasScreen.normalizarFornecedores() aceita raw.fornecedores[key] === true
  // Chaves 'METAL TECH' e 'SOARES TINTAS' mapeadas pelo mapa interno do VisitasScreen
  const fornecedores = {};
  if (comprouFinal) {
    representadasFinal.forEach(rep => { fornecedores[rep] = true; });
    // Fallback: representada simples quando sem array
    if (representadasFinal.length === 0 && dados.representada && dados.representada !== 'geral') {
      fornecedores[dados.representada] = true;
    }
  }

  // ── [NOVO] fotosNorm: aceita arrays (novo) e string URI (legado) ──
  const fotosNorm = {};
  const TIPOS_FOTO_SUPORTADOS = ['estoque', 'gondola', 'concorrentes', 'obra'];
  TIPOS_FOTO_SUPORTADOS.forEach(tipo => {
    const val = dados.fotos?.[tipo];
    if (Array.isArray(val) && val.length > 0) {
      fotosNorm[tipo] = val.filter(Boolean); // novo: array de URIs
    } else if (typeof val === 'string' && val) {
      fotosNorm[tipo] = val;                 // legado: URI única
    }
  });

  return {
    // ── Identificação do cliente (MANTIDO) ──────────────────
    clienteId    : dados.clienteId      || '',
    clienteNome  : dados.clienteNome    || '',
    clienteTipo  : dados.clienteTipo    || '',
    clienteCidade: dados.clienteCidade  || '',

    // ── Timestamps (MANTIDO) ────────────────────────────────
    data         : isoData,
    dataLocal    : isoCompleto,
    dataISO      : isoCompleto,
    hora         : dados.hora || agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    mes          : isoMes,

    // ── Resultado (MANTIDO) ─────────────────────────────────
    resultado    : resultadoFinal,
    comprou      : comprouFinal,

    // ── Dados da venda ──────────────────────────────────────
    // [NOVO] valor = soma das representadas ou valor simples
    valor        : valorNum,
    // [NOVO] valor separado por representada para relatório
    valorPorRep  : comprouFinal ? valorPorRepFinal : {},
    produtos     : comprouFinal ? (dados.produtos || []) : [],
    representada : dados.representada || (representadasFinal[0] || 'geral'),
    // [NOVO] array de marcas envolvidas
    representadas: comprouFinal ? representadasFinal : [],
    // [NOVO] objeto para VisitasScreen.normalizarFornecedores()
    fornecedores : comprouFinal ? fornecedores : {},

    // ── Dados de não compra (MANTIDO) ───────────────────────
    motivos      : !comprouFinal ? (dados.motivos || []) : [],
    motivoObs    : dados.motivoObs || '',
    motivo       : Array.isArray(dados.motivos) && dados.motivos.length > 0
                     ? dados.motivos[0]
                     : (dados.motivo || ''),

    // ── Meta-dados (MANTIDO) ────────────────────────────────
    tipoRegistro : dados.tipoRegistro  || 'visita',
    observacao   : dados.observacao    || '',
    // [NOVO] fotos: array por tipo ou string URI legado
    fotos        : Object.keys(fotosNorm).length > 0 ? fotosNorm : (dados.fotos || null),
    localizacao  : dados.localizacao   || null,

    // ── Próxima visita (MANTIDO) ────────────────────────────
    proximaVisita: dados.proximaVisita || '',
  };
}