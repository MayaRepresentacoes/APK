// services/rotaService.js
// ════════════════════════════════════════════════════════════════
// ROTA SERVICE — Agrupamento, prioridade, rota por cidade e Maps
//
// FUSÃO v2:
//   Base       : versão doc 16/19 (mais completa)
//   +minha     : ordenarRotaPorProximidade mantida como alias de
//                otimizarRota para compatibilidade com telas que
//                importavam esse nome
//
// Exportações:
//   calcularDistanciaKm()
//   getClientesPorCidade()
//   getClientesPrioritarios()
//   gerarRotaCidade()
//   getEstatisticasCidade()
//   otimizarRota()
//   ordenarRotaPorProximidade()   ← alias de otimizarRota
//   calcularTotalKmRota()
//   abrirGoogleMapsRota()
//   abrirGoogleMapsEndereco()
//   estimarTempoRota()
//   abrirWazeRota()
//   getClientesSemGPS()
// ════════════════════════════════════════════════════════════════
import { Linking, Platform } from 'react-native';

const DANGER = '#EF5350';
const WARN   = '#FF9800';
const BLUE   = '#5BA3D0';
const GOLD   = '#E8B432';
const PURPLE = '#C56BF0';

// ── Utils internos ────────────────────────────────────────────
function diasDesde(isoStr) {
  if (!isoStr) return 9999;
  return (Date.now() - new Date(isoStr).getTime()) / 86400000;
}

function _getUltimaCompra(clienteId, visitas) {
  return (visitas || [])
    .filter(v => v.clienteId === clienteId && v.resultado === 'comprou')
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0))[0] || null;
}

function _getTicketMedio(clienteId, visitas) {
  const compras = (visitas || []).filter(
    v => v.clienteId === clienteId && v.resultado === 'comprou' && v.valor > 0
  );
  if (!compras.length) return 0;
  return compras.reduce((s, v) => s + v.valor, 0) / compras.length;
}

function _getOrcsPendentes(clienteId, orcamentos) {
  return (orcamentos || []).filter(
    o => o.clienteId === clienteId &&
    (o.status === 'pendente' || o.status === 'aguardando')
  );
}

function _cicloMedio(clienteId, visitas) {
  const compras = (visitas || [])
    .filter(v => v.clienteId === clienteId && v.resultado === 'comprou')
    .map(v => new Date(v.dataLocal || v.data || 0).getTime())
    .sort((a, b) => a - b);
  if (compras.length < 2) return null;
  let total = 0;
  for (let i = 1; i < compras.length; i++) total += (compras[i] - compras[i - 1]) / 86400000;
  return total / (compras.length - 1);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: calcularDistanciaKm — Haversine
// ════════════════════════════════════════════════════════════════
export function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 9999;
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getClientesPorCidade
// Agrupa clientes por cidade, ordenado pelo maior grupo.
// ════════════════════════════════════════════════════════════════
export function getClientesPorCidade(clientes) {
  if (!clientes?.length) return [];
  const mapa = {};
  clientes.forEach(c => {
    const cidade = (c.cidade || 'Sem cidade').trim();
    if (!mapa[cidade]) mapa[cidade] = [];
    mapa[cidade].push(c);
  });
  return Object.entries(mapa)
    .map(([cidade, clts]) => ({ cidade, clientes: clts }))
    .sort((a, b) => b.clientes.length - a.clientes.length);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getClientesPrioritarios
// Score de prioridade com motivos coloridos para exibição.
// Exclui clientes já visitados hoje.
// ════════════════════════════════════════════════════════════════
export function getClientesPrioritarios(clientes, visitas, orcamentos, limite = 50) {
  if (!clientes?.length) return [];
  const hoje = new Date().toISOString().substring(0, 10);

  return clientes
    .map(c => {
      let score  = 0;
      const motivos = [];
      const uc         = _getUltimaCompra(c.id, visitas);
      const ticket     = _getTicketMedio(c.id, visitas);
      const orcs       = _getOrcsPendentes(c.id, orcamentos);
      const ciclo      = _cicloMedio(c.id, visitas);
      const diasCompra = uc ? diasDesde(uc.dataLocal || uc.data) : null;
      const visitadoHoje = (visitas || []).some(v =>
        v.clienteId === c.id &&
        (v.dataLocal || v.data || '').substring(0, 10) === hoje
      );
      if (visitadoHoje) return null;

      if (orcs.length > 0) {
        score += 30;
        motivos.push({ label:'Orçamento pendente', color:BLUE, icon:'request-quote' });
      }
      if (diasCompra === null) {
        score += 25;
        motivos.push({ label:'Nunca comprou', color:DANGER, icon:'warning' });
      } else if (diasCompra > 60) {
        score += 35;
        motivos.push({ label:`${Math.round(diasCompra)}d sem compra`, color:DANGER, icon:'warning' });
      } else if (diasCompra > 30) {
        score += 20;
        motivos.push({ label:`${Math.round(diasCompra)}d sem compra`, color:WARN, icon:'schedule' });
      }
      if (ciclo && diasCompra !== null) {
        const diasAteProx = ciclo - diasCompra;
        if (diasAteProx >= -5 && diasAteProx <= 5) {
          score += 20;
          motivos.push({ label:'Reposição prevista', color:PURPLE, icon:'inventory' });
        }
      }
      if (ticket > 1000) {
        score += 15;
        motivos.push({
          label: `Ticket ${ticket >= 1000 ? `R$${(ticket/1000).toFixed(1)}k` : `R$${Math.round(ticket)}`}`,
          color: GOLD,
          icon : 'star',
        });
      }
      if (score === 0) return null;
      return { ...c, score: Math.min(score, 100), motivos, ticket, ultimaCompra: uc };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: gerarRotaCidade
// ════════════════════════════════════════════════════════════════
export function gerarRotaCidade(clientes, visitas, orcamentos) {
  const prioritarios = getClientesPrioritarios(clientes, visitas, orcamentos, 100);
  const comGPS = prioritarios.filter(c => c.latitude && c.longitude);
  if (comGPS.length === prioritarios.length && comGPS.length > 1) {
    return otimizarRota(prioritarios);
  }
  return prioritarios;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getEstatisticasCidade
// ════════════════════════════════════════════════════════════════
export function getEstatisticasCidade(clientes, visitas) {
  const hoje  = new Date().toISOString().substring(0, 10);
  const agora = new Date();
  const visitadosHoje = (clientes || []).filter(c =>
    (visitas || []).some(v =>
      v.clienteId === c.id &&
      (v.dataLocal || v.data || '').substring(0, 10) === hoje
    )
  ).length;
  const comprasMes = (visitas || []).filter(v => {
    const d = new Date(v.dataLocal || v.data || 0);
    return (
      (clientes || []).some(c => c.id === v.clienteId) &&
      v.resultado === 'comprou' &&
      d.getMonth()    === agora.getMonth() &&
      d.getFullYear() === agora.getFullYear()
    );
  });
  return {
    total         : (clientes || []).length,
    visitadosHoje,
    totalVendasMes: comprasMes.reduce((s, v) => s + (v.valor || 0), 0),
    comprasMes    : comprasMes.length,
  };
}

// ════════════════════════════════════════════════════════════════
// EXPORT: otimizarRota — Nearest-neighbor greedy
// ════════════════════════════════════════════════════════════════
export function otimizarRota(clientes, origemLat = null, origemLon = null) {
  if (!clientes?.length) return [];
  const comGPS    = clientes.filter(c => c.latitude && c.longitude);
  const semGPS    = clientes.filter(c => !c.latitude || !c.longitude);
  if (!comGPS.length) return clientes;

  const restantes = [...comGPS];
  const rota      = [];
  let latAtual    = origemLat ?? restantes[0].latitude;
  let lonAtual    = origemLon ?? restantes[0].longitude;

  while (restantes.length) {
    let menorDist = Infinity;
    let idxProx   = 0;
    restantes.forEach((c, i) => {
      const dist = calcularDistanciaKm(latAtual, lonAtual, c.latitude, c.longitude);
      if (dist < menorDist) { menorDist = dist; idxProx = i; }
    });
    const proximo = restantes.splice(idxProx, 1)[0];
    rota.push({ ...proximo, distanciaKm: Math.round(menorDist * 10) / 10, ordemRota: rota.length + 1 });
    latAtual = proximo.latitude;
    lonAtual = proximo.longitude;
  }

  return [
    ...rota,
    ...semGPS.map((c, i) => ({ ...c, distanciaKm: null, ordemRota: rota.length + i + 1 })),
  ];
}

// ════════════════════════════════════════════════════════════════
// EXPORT: ordenarRotaPorProximidade
// Alias de otimizarRota — compatibilidade com versão anterior.
// ════════════════════════════════════════════════════════════════
export function ordenarRotaPorProximidade(clientes, origemLat = null, origemLon = null) {
  return otimizarRota(clientes, origemLat, origemLon);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: calcularTotalKmRota
// ════════════════════════════════════════════════════════════════
export function calcularTotalKmRota(clientesOrdenados, origemLat = null, origemLon = null) {
  const pontos = (clientesOrdenados || []).filter(c => c.latitude && c.longitude);
  if (!pontos.length) return 0;
  let total  = 0;
  let latAnt = origemLat ?? pontos[0].latitude;
  let lonAnt = origemLon ?? pontos[0].longitude;
  pontos.forEach(c => {
    total += calcularDistanciaKm(latAnt, lonAnt, c.latitude, c.longitude);
    latAnt = c.latitude;
    lonAnt = c.longitude;
  });
  return Math.round(total * 10) / 10;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: abrirGoogleMapsRota
// ════════════════════════════════════════════════════════════════
export function abrirGoogleMapsRota(clientes) {
  const comGPS = (clientes || []).filter(c => c.latitude && c.longitude);
  if (!comGPS.length) return false;

  if (comGPS.length === 1) {
    const c = comGPS[0];
    if (Platform.OS === 'ios') {
      const appUrl = `comgooglemaps://?daddr=${c.latitude},${c.longitude}&directionsmode=driving`;
      Linking.canOpenURL(appUrl)
        .then(ok => Linking.openURL(ok ? appUrl : `https://maps.apple.com/?daddr=${c.latitude},${c.longitude}&dirflg=d`))
        .catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`));
      return true;
    }
    const androidUrl = `google.navigation:q=${c.latitude},${c.longitude}&mode=d`;
    Linking.canOpenURL(androidUrl)
      .then(ok => Linking.openURL(ok ? androidUrl : `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`))
      .catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`));
    return true;
  }

  const destino   = comGPS[comGPS.length - 1];
  const waypoints = comGPS.slice(0, -1).map(c => `${c.latitude},${c.longitude}`).join('|');
  const url = `https://www.google.com/maps/dir/?api=1`
    + `&destination=${destino.latitude},${destino.longitude}`
    + `&travelmode=driving`
    + (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '');
  Linking.openURL(url);
  return true;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: abrirGoogleMapsEndereco
// ════════════════════════════════════════════════════════════════
export function abrirGoogleMapsEndereco(cliente) {
  const q = [cliente.nome, cliente.endereco, cliente.cidade].filter(Boolean).join(', ');
  if (!q.trim()) return false;
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
  return true;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: estimarTempoRota
// ════════════════════════════════════════════════════════════════
export function estimarTempoRota(
  clientesOrdenados,
  velocidadeKmH    = 50,
  minutosPorVisita = 20
) {
  const totalKm         = calcularTotalKmRota(clientesOrdenados);
  const deslocamentoMin = Math.round((totalKm / velocidadeKmH) * 60);
  const visitasMin      = (clientesOrdenados || []).length * minutosPorVisita;
  const totalMinutos    = deslocamentoMin + visitasMin;
  const horas           = Math.floor(totalMinutos / 60);
  const minutos         = totalMinutos % 60;
  const textoFormatado  = horas > 0
    ? `${horas}h${minutos > 0 ? ` ${minutos}min` : ''}`
    : `${minutos}min`;
  return { totalMinutos, deslocamentoMin, visitasMin, textoFormatado };
}

// ════════════════════════════════════════════════════════════════
// EXPORT: abrirWazeRota
// ════════════════════════════════════════════════════════════════
export function abrirWazeRota(clientes) {
  const comGPS = (clientes || []).filter(c => c.latitude && c.longitude);
  if (!comGPS.length) return false;
  const destino = comGPS[0];
  const wazeApp = `waze://ul?ll=${destino.latitude},${destino.longitude}&navigate=yes`;
  const wazeWeb = `https://waze.com/ul?ll=${destino.latitude},${destino.longitude}&navigate=yes`;
  Linking.canOpenURL(wazeApp)
    .then(ok => Linking.openURL(ok ? wazeApp : wazeWeb))
    .catch(() => Linking.openURL(wazeWeb));
  return true;
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getClientesSemGPS
// ════════════════════════════════════════════════════════════════
export function getClientesSemGPS(clientes) {
  return (clientes || []).filter(c => !c.latitude || !c.longitude);
}