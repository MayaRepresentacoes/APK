// models/CheckinModel.js
// ════════════════════════════════════════════════════════════════
// Modelo padronizado de checkin/visita.
// Usado pelo visitaService e registrarCheckin().
//
// FUSÃO v2 — doc 20 (base real) + campos exigidos pelo firebase.js:
//
//   [+firebase] dataISO
//     addCheckin() no firebase.js persiste:
//     dataISO: dados.dataISO || new Date().toISOString()
//     Sem este campo no modelo, o Firestore recebe undefined.
//
//   [+firebase] motivo (string singular)
//     addCheckin() persiste:
//     motivo: Array.isArray(dados.motivos) && dados.motivos.length > 0
//               ? dados.motivos[0] : (dados.motivo || '')
//     Telas que leem v.motivo (HistoricoClienteScreen etc.) precisam
//     deste campo na raiz do objeto.
//
//   [+segurança] _normalizarResultado()
//     Aceita variantes legadas como 'nao_comprou' que podem vir de
//     dados antigos ou de telas que ainda não foram migradas.
//
//   Mantidos integralmente do doc 20:
//     destructuring + defaults, typeof valor check, fotosNorm,
//     proximaVisita condicional ao !comprou, hora via toTimeString.
// ════════════════════════════════════════════════════════════════

// ── Helper interno ────────────────────────────────────────────
// Aceita variantes legadas sem quebrar o sistema
function _normalizarResultado(resultado) {
  if (resultado === 'comprou')     return 'comprou';
  if (resultado === 'nao_comprou') return 'naocomprou';
  if (resultado === 'naocomprou')  return 'naocomprou';
  if (resultado === 'retornar')    return 'retornar';
  return resultado || 'naocomprou';
}

/**
 * createCheckinModel
 * Constrói o objeto de checkin com todos os campos padronizados.
 * Garante que nenhum campo seja omitido antes de salvar no Firestore.
 *
 * @param {string}   dados.clienteId
 * @param {string}   dados.clienteNome
 * @param {string}   [dados.clienteTipo]
 * @param {string}   [dados.clienteCidade]
 * @param {string}   dados.resultado        — 'comprou' | 'naocomprou' | 'retornar'
 * @param {number}   [dados.valor]
 * @param {string[]} [dados.produtos]
 * @param {string[]} [dados.motivos]
 * @param {string}   [dados.motivoObs]
 * @param {string}   [dados.observacao]
 * @param {object}   [dados.fotos]          — { estoque?, gondola?, obra? }
 * @param {object}   [dados.localizacao]    — { latitude, longitude }
 * @param {string}   [dados.tipoRegistro]   — 'visita' | 'telefone'
 * @param {string}   [dados.representada]
 * @param {string}   [dados.proximaVisita]  — data agendada (quando naocomprou/retornar)
 * @returns {object} Checkin normalizado pronto para o Firestore
 */
export function createCheckinModel({
  clienteId,
  clienteNome   = '',
  clienteTipo   = '',
  clienteCidade = '',
  resultado,
  valor         = 0,
  produtos      = [],
  motivos       = [],
  motivoObs     = '',
  observacao    = '',
  fotos         = {},
  localizacao   = null,
  tipoRegistro  = 'visita',
  representada  = 'geral',
  // ✅ Agendamento de retorno quando não comprou
  // Enviado pelo CheckinScreen e exibido pelo HistoricoClienteScreen
  proximaVisita = '',
}) {
  const agora = new Date();

  // [+segurança] Normaliza variantes legadas de resultado
  const resultadoFinal = _normalizarResultado(resultado);
  const comprou        = resultadoFinal === 'comprou';

  // Timestamps
  const dataLocal = agora.toISOString();
  const dataISO   = dataLocal;                       // [+firebase] exigido por addCheckin()
  const data      = dataLocal.substring(0, 10);
  const hora      = agora.toTimeString().substring(0, 5); // mais confiável que toLocaleTimeString
  const mes       = dataLocal.substring(0, 7);

  // Normaliza o valor numérico (aceita string "1.500,00" ou número)
  let valorNum = 0;
  if (comprou) {
    if (typeof valor === 'number') {
      // [doc20] evita double-parse quando valor já chega como número
      valorNum = valor;
    } else {
      valorNum = parseFloat(
        String(valor || 0).replace(/\./g, '').replace(',', '.')
      ) || 0;
    }
  }

  // Normaliza fotos: só inclui chaves com URI preenchida
  // [doc20] evita persistir {} com chaves vazias no Firestore
  const fotosNorm = {};
  ['estoque', 'gondola', 'obra'].forEach(tipo => {
    if (fotos[tipo]) fotosNorm[tipo] = fotos[tipo];
  });

  // [+firebase] motivo string singular — lido por HistoricoClienteScreen
  // e persistido pelo addCheckin() como campo separado
  const motivo = Array.isArray(motivos) && motivos.length > 0
    ? motivos[0]
    : '';

  return {
    // ── Identificação ────────────────────────────────────────
    clienteId,
    clienteNome,
    clienteTipo,
    clienteCidade,

    // ── Resultado ────────────────────────────────────────────
    tipoRegistro,                // 'visita' | 'telefone'
    resultado : resultadoFinal,  // normalizado
    comprou,

    // ── Compra ───────────────────────────────────────────────
    valor    : comprou ? valorNum : 0,
    produtos : comprou ? produtos : [],

    // ── Não compra ───────────────────────────────────────────
    motivos      : !comprou ? motivos   : [],
    motivo,                      // [+firebase] string singular do motivos[0]
    motivoObs    : !comprou ? motivoObs : '',
    // ✅ proximaVisita: só salvo quando não comprou [doc20]
    proximaVisita: !comprou && proximaVisita ? proximaVisita : '',

    // ── Campos gerais ────────────────────────────────────────
    observacao,
    representada,

    // ── Fotos por tipo ───────────────────────────────────────
    fotos : fotosNorm,

    // ── Localização ──────────────────────────────────────────
    localizacao,

    // ── Datas ────────────────────────────────────────────────
    dataLocal,
    dataISO,   // [+firebase] exigido por addCheckin()
    data,
    hora,
    mes,
  };
}