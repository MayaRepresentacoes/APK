// screens/VisitasScreen.js
// ════════════════════════════════════════════════════════════════
// FUSÃO v2 — sobre doc 15:
//
//   [FIX] normalizarFornecedores — adicionado 'SOARES TINTAS'
//     CheckinModel gera fornecedores com chave 'SOARES TINTAS'
//     (proveniente do PRODUTO_REP mapping do CheckinScreen).
//     O mapa anterior não tinha esta entrada, causando o ranking
//     de TINTAS SOARES sempre mostrar 0 vendas para novos checkins.
//     Adicionado: 'SOARES TINTAS': 'TINTAS_SOARES'
//
//   [NOVO] normalizar checkin — campo valorPorRep
//     Passthrough de raw.valorPorRep para disponibilizar no PDF
//     e em futuras telas de relatório por representada.
//
//   Mantidos integralmente do doc 15:
//     REPRESENTADAS, FORNECEDORES, todos os componentes (ShimmerLine,
//     KpiCard, FornBar, VisitaCard), toda a lógica de carga e filtros,
//     exportarPDF() completo, todos os styles.
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Dimensions, StatusBar, Animated, Platform,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { getVisitas, getCheckins } from '../services/firebase';
import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const SUCCESS      = '#4CAF50';
const DANGER       = '#EF5350';
const WARN         = '#FF9800';
const BLUE         = '#5BA3D0';
const PURPLE       = '#C56BF0';

const REPRESENTADAS = [
  { key:'fortlev',        label:'Fortlev',        icon:'water',     color:BLUE        },
  { key:'Afort',          label:'Afort',           icon:'plumbing',  color:GOLD        },
  { key:'Metal Tech',     label:'Metal Tech',      icon:'settings',  color:SUCCESS     },
  { key:'Tintas Soares',  label:'Tintas Soares',   icon:'warehouse', color:PURPLE      },
  { key:'geral',          label:'Geral/Outros',    icon:'category',  color:SILVER_DARK },
];

const FORNECEDORES = [
  { key:'FORTLEV',        label:'FORTLEV',        color:BLUE    },
  { key:'AFORT',          label:'AFORT',          color:GOLD    },
  { key:'METAL_TECH',     label:'METAL TECH',     color:SUCCESS },
  { key:'TINTAS_SOARES',  label:'TINTAS SOARES',  color:PURPLE  },
];

const getResultadoColor = r => r === 'comprou' ? SUCCESS : r === 'naocomprou' ? DANGER : WARN;
const getResultadoLabel = r => r === 'comprou' ? 'Comprou' : r === 'naocomprou' ? 'Não comprou' : 'Retornar';
const getResultadoIcon  = r => r === 'comprou' ? 'check-circle' : r === 'naocomprou' ? 'cancel' : 'schedule';

function formatarData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    });
  } catch { return iso; }
}

function formatReal(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2 });
}

// ════════════════════════════════════════════════════════════════
// [FIX] normalizarFornecedores — adicionado 'SOARES TINTAS'
// CheckinModel v2 gera fornecedores com chave 'SOARES TINTAS'.
// Sem esta entrada, o ranking sempre mostrava 0 para Tintas Soares.
// ════════════════════════════════════════════════════════════════
function normalizarFornecedores(raw) {
  const obj = {};
  if (Array.isArray(raw.fornecedoresVendidos)) {
    raw.fornecedoresVendidos.forEach(k => { if (k) obj[k] = true; });
  }
  if (raw.fornecedores && typeof raw.fornecedores === 'object' && !Array.isArray(raw.fornecedores)) {
    const mapa = {
      'FORTLEV'      : 'FORTLEV',
      'AFORT'        : 'AFORT',
      'METAL TECK'   : 'METAL_TECH',
      'METAL TECH'   : 'METAL_TECH',
      'METAL_TECH'   : 'METAL_TECH',
      'TINTAS S.'    : 'TINTAS_SOARES',
      'TINTAS SOARES': 'TINTAS_SOARES',
      'TINTAS_SOARES': 'TINTAS_SOARES',
      // [FIX] adicionado — chave gerada pelo PRODUTO_REP mapping do CheckinScreen
      'SOARES TINTAS': 'TINTAS_SOARES',
    };
    Object.keys(raw.fornecedores).forEach(k => {
      if (raw.fornecedores[k]) { obj[mapa[k] || k] = true; }
    });
  }
  return obj;
}

function normalizar(raw, origem = 'visita') {
  if (origem === 'checkin') {
    let resultadoRaw = raw.resultado || (raw.comprou ? 'comprou' : 'naocomprou');
    if (resultadoRaw === 'nao_comprou') resultadoRaw = 'naocomprou';
    const motivosArr = Array.isArray(raw.motivos) && raw.motivos.length > 0
      ? raw.motivos
      : raw.motivo ? [raw.motivo] : [];
    return {
      id           : raw.id,
      clienteNome  : raw.clienteNome || raw.nomeCliente || '—',
      clienteId    : raw.clienteId,
      dataLocal    : raw.dataLocal || raw.dataISO || raw.data || '',
      dataFormatada: formatarData(raw.dataLocal || raw.dataISO || raw.data),
      resultado    : resultadoRaw,
      valor        : parseFloat(raw.valor) || 0,
      // [NOVO] passthrough de valorPorRep para relatórios futuros
      valorPorRep  : raw.valorPorRep || {},
      representada : raw.representada || 'geral',
      representadas: raw.representadas || [],
      fornecedores : normalizarFornecedores(raw),
      motivos      : motivosArr,
      motivo       : raw.motivo || (motivosArr.length > 0 ? motivosArr[0] : ''),
      motivoObs    : raw.motivoObs || '',
      tipoRegistro : raw.tipoRegistro || 'visita',
      interesse    : raw.interesse    || '',
      observacoes  : raw.observacao   || raw.observacoes || '',
      _origem      : 'checkin',
    };
  }
  let resultadoVisita = raw.resultado || (raw.comprou ? 'comprou' : 'naocomprou');
  if (resultadoVisita === 'nao_comprou') resultadoVisita = 'naocomprou';
  const motivosVisita = Array.isArray(raw.motivos) && raw.motivos.length > 0
    ? raw.motivos
    : raw.motivo ? [raw.motivo] : [];
  return {
    ...raw,
    dataFormatada: formatarData(raw.dataLocal || raw.data),
    resultado    : resultadoVisita,
    valor        : parseFloat(raw.valor || raw.valorVenda) || 0,
    // [NOVO] passthrough
    valorPorRep  : raw.valorPorRep || {},
    representadas: raw.representadas || [],
    representada : raw.representada || 'geral',
    fornecedores : normalizarFornecedores(raw),
    motivos      : motivosVisita,
    motivo       : raw.motivo || (motivosVisita.length > 0 ? motivosVisita[0] : ''),
    motivoObs    : raw.motivoObs || '',
    tipoRegistro : raw.tipoRegistro || 'visita',
    _origem      : 'visita',
  };
}

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver:Platform.OS !== 'web' })
    ).start();
  }, []);
  return (
    <View style={{ height:2, width:'100%', backgroundColor:color+'30', overflow:'hidden' }}>
      <Animated.View style={{
        position:'absolute', height:'100%', width:80,
        backgroundColor:color+'CC',
        transform:[{ translateX:anim.interpolate({ inputRange:[0,1], outputRange:[-80, SW] }) }],
      }} />
    </View>
  );
}

function KpiCard({ icon, value, label, color = GOLD, sub }) {
  return (
    <View style={[kc.card, { borderColor:color+'30' }]}>
      <View style={[kc.icon, { backgroundColor:color+'18' }]}>
        <Icon name={icon} size={20} color={color} type="material" />
      </View>
      <Text style={[kc.value, { color }]}>{value}</Text>
      <Text style={kc.label}>{label}</Text>
      {sub ? <Text style={kc.sub}>{sub}</Text> : null}
    </View>
  );
}
const kc = StyleSheet.create({
  card : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:16, padding:14, borderWidth:1, marginHorizontal:4 },
  icon : { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', marginBottom:8 },
  value: { fontSize:22, fontWeight:'bold' },
  label: { fontSize:10, color:SILVER_DARK, marginTop:2, textAlign:'center', letterSpacing:0.3 },
  sub  : { fontSize:10, color:SILVER_DARK+'80', marginTop:1 },
});

function FornBar({ label, count, total, color = GOLD }) {
  const pct     = total > 0 ? count / total : 0;
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(barAnim, { toValue:pct, friction:8, useNativeDriver:false }).start();
  }, [pct]);
  return (
    <View style={fb.wrap}>
      <View style={fb.labelRow}>
        <View style={fb.nameRow}>
          <View style={[fb.dot, { backgroundColor:color }]} />
          <Text style={fb.nome}>{label}</Text>
        </View>
        <Text style={[fb.count, { color }]}>
          {`${count} venda${count !== 1 ? 's' : ''} `}
          <Text style={fb.pct}>{`(${(pct * 100).toFixed(0)}%)`}</Text>
        </Text>
      </View>
      <View style={fb.track}>
        <Animated.View style={[fb.fill, {
          backgroundColor: color,
          width: barAnim.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }),
        }]} />
      </View>
    </View>
  );
}
const fb = StyleSheet.create({
  wrap    : { marginBottom:14 },
  labelRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  nameRow : { flexDirection:'row', alignItems:'center', gap:8 },
  dot     : { width:8, height:8, borderRadius:4 },
  nome    : { fontSize:13, fontWeight:'600', color:SILVER_LIGHT },
  count   : { fontSize:13, fontWeight:'bold' },
  pct     : { fontSize:11, fontWeight:'400', color:SILVER_DARK },
  track   : { height:8, backgroundColor:CARD_BG2, borderRadius:4, overflow:'hidden' },
  fill    : { height:'100%', borderRadius:4 },
});

function VisitaCard({ item }) {
  const color      = getResultadoColor(item.resultado);
  const fornAtivos = FORNECEDORES.filter(f => item.fornecedores?.[f.key]);
  const rep        = REPRESENTADAS.find(r => r.key === item.representada);
  const motivosTexto = Array.isArray(item.motivos) && item.motivos.length > 0
    ? item.motivos.join(', ')
    : item.motivo || '';
  return (
    <View style={[vc.card, { borderColor:color+'30' }]}>
      <View style={[vc.topBar, { backgroundColor:color }]} />
      <View style={vc.content}>
        <View style={vc.row}>
          <View style={[vc.iconWrap, { backgroundColor:color+'18' }]}>
            <Icon name={getResultadoIcon(item.resultado)} size={18} color={color} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={vc.nome}>{item.clienteNome}</Text>
            <Text style={vc.data}>{item.dataFormatada}</Text>
          </View>
          <View style={{ alignItems:'flex-end', gap:4 }}>
            <View style={[vc.badge, { backgroundColor:color+'18', borderColor:color+'50' }]}>
              <Text style={[vc.badgeTxt, { color }]}>{getResultadoLabel(item.resultado)}</Text>
            </View>
            {item.valor > 0 && (
              <Text style={[vc.valor, { color }]}>{`R$ ${formatReal(item.valor)}`}</Text>
            )}
          </View>
        </View>
        {rep && (
          <View style={vc.repRow}>
            <View style={[vc.repBadge, { backgroundColor:rep.color+'15', borderColor:rep.color+'35' }]}>
              <Icon name={rep.icon} size={10} color={rep.color} type="material" />
              <Text style={[vc.repTxt, { color:rep.color }]}>{rep.label}</Text>
            </View>
            {item._origem === 'checkin' && (
              <View style={[vc.origemBadge, item.tipoRegistro === 'telefone' && { borderColor:BLUE+'35', backgroundColor:BLUE+'15' }]}>
                <Icon
                  name={item.tipoRegistro === 'telefone' ? 'phone-in-talk' : 'location-on'}
                  size={10}
                  color={item.tipoRegistro === 'telefone' ? BLUE : PURPLE}
                  type="material" />
                <Text style={[vc.origemTxt, item.tipoRegistro === 'telefone' && { color:BLUE }]}>
                  {item.tipoRegistro === 'telefone' ? 'Telefone' : 'Check-in'}
                </Text>
              </View>
            )}
          </View>
        )}
        {fornAtivos.length > 0 && (
          <View style={vc.tagRow}>
            {fornAtivos.map(f => (
              <View key={f.key} style={[vc.tag, { backgroundColor:f.color+'18', borderColor:f.color+'40' }]}>
                <Text style={[vc.tagTxt, { color:f.color }]}>{f.label}</Text>
              </View>
            ))}
          </View>
        )}
        {motivosTexto ? (
          <View style={vc.infoRow}>
            <Icon name="info-outline" size={12} color={DANGER} type="material" />
            <Text style={[vc.infoTxt, { color:DANGER+'CC' }]}>{`Motivo: ${motivosTexto}`}</Text>
          </View>
        ) : null}
        {item.motivoObs ? (
          <View style={vc.infoRow}>
            <Icon name="edit-note" size={12} color={SILVER_DARK} type="material" />
            <Text style={vc.infoTxt} numberOfLines={2}>{item.motivoObs}</Text>
          </View>
        ) : null}
        {item.interesse ? (
          <View style={vc.infoRow}>
            <Icon name="trending-up" size={12} color={SILVER_DARK} type="material" />
            <Text style={vc.infoTxt}>{`Interesse: ${item.interesse}`}</Text>
          </View>
        ) : null}
        {item.observacoes ? (
          <View style={vc.infoRow}>
            <Icon name="notes" size={12} color={SILVER_DARK} type="material" />
            <Text style={vc.infoTxt} numberOfLines={2}>{item.observacoes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
const vc = StyleSheet.create({
  card       : { backgroundColor:CARD_BG, borderRadius:16, marginBottom:10, borderWidth:1, overflow:'hidden' },
  topBar     : { height:3 },
  content    : { padding:14 },
  row        : { flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 },
  iconWrap   : { width:36, height:36, borderRadius:12, justifyContent:'center', alignItems:'center' },
  nome       : { fontSize:14, fontWeight:'bold', color:SILVER_LIGHT },
  data       : { fontSize:11, color:SILVER_DARK, marginTop:2 },
  badge      : { paddingHorizontal:8, paddingVertical:4, borderRadius:10, borderWidth:1 },
  badgeTxt   : { fontSize:10, fontWeight:'700' },
  valor      : { fontSize:12, fontWeight:'800' },
  repRow     : { flexDirection:'row', gap:6, marginBottom:6, flexWrap:'wrap' },
  repBadge   : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  repTxt     : { fontSize:10, fontWeight:'700' },
  origemBadge: { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:PURPLE+'35', backgroundColor:PURPLE+'15' },
  origemTxt  : { fontSize:10, fontWeight:'700', color:PURPLE },
  tagRow     : { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:8 },
  tag        : { borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1 },
  tagTxt     : { fontSize:10, fontWeight:'700' },
  infoRow    : { flexDirection:'row', alignItems:'flex-start', gap:6, marginTop:4 },
  infoTxt    : { fontSize:11, color:SILVER_DARK, flex:1 },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL (MANTIDA INTEGRALMENTE)
// ════════════════════════════════════════════════════════════════
export default function VisitasScreen() {
  const [visitas,    setVisitas]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [exportando, setExportando] = useState(false);
  const [filtro,     setFiltro]     = useState('todos');
  const [filtroRep,  setFiltroRep]  = useState('todas');
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue:1, duration:700, useNativeDriver:Platform.OS !== 'web' }).start();
    loadDados();
  }, []);

  const loadDados = async () => {
    setLoading(true);
    try {
      const [visitasRaw, checkins] = await Promise.all([getVisitas(), getCheckins()]);
      const merged = [
        ...visitasRaw.map(v  => normalizar(v,  'visita')),
        ...checkins.map(ck   => normalizar(ck, 'checkin')),
      ];
      merged.sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
      setVisitas(merged);
    } catch (e) {
      console.log('VisitasScreen error:', e);
    } finally {
      setLoading(false);
    }
  };

  const total         = visitas.length;
  const compraram     = visitas.filter(v => v.resultado === 'comprou').length;
  const naoCompraram  = visitas.filter(v => v.resultado === 'naocomprou').length;
  const retornar      = visitas.filter(v => v.resultado === 'retornar').length;
  const taxaConversao = total > 0 ? ((compraram / total) * 100).toFixed(0) : '0';
  const valorTotal    = visitas.filter(v => v.resultado === 'comprou').reduce((s, v) => s + v.valor, 0);

  const fornRanking = FORNECEDORES.map(f => ({
    ...f,
    count: visitas.filter(v => v.resultado === 'comprou' && v.fornecedores?.[f.key]).length,
  })).sort((a, b) => b.count - a.count);

  const motivosMap = {};
  visitas.filter(v => v.resultado === 'naocomprou').forEach(v => {
    const lista = Array.isArray(v.motivos) && v.motivos.length > 0
      ? v.motivos
      : v.motivo ? [v.motivo] : [];
    lista.forEach(m => { if (m) motivosMap[m] = (motivosMap[m] || 0) + 1; });
  });
  const motivosRank = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]);

  const visitasFiltradas = visitas.filter(v => {
    const passaResultado = filtro === 'todos' || v.resultado === filtro;
    const passaRep       = filtroRep === 'todas' || v.representada === filtroRep;
    return passaResultado && passaRep;
  });

  const FILTROS_RESULTADO = [
    { key:'todos',      label:'Todas',       color:GOLD    },
    { key:'comprou',    label:'Compraram',   color:SUCCESS },
    { key:'naocomprou', label:'Não comprou', color:DANGER  },
    { key:'retornar',   label:'Retornar',    color:WARN    },
  ];

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const fornCols = FORNECEDORES.map(f => '<th>' + f.label + '</th>').join('');
      const linhas   = visitas.map((v, i) => {
        const bg       = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
        const forn     = FORNECEDORES.map(f =>
          '<td style="text-align:center">' + (v.fornecedores?.[f.key] ? 'SIM' : '—') + '</td>'
        ).join('');
        const cor      = getResultadoColor(v.resultado).replace('#', '');
        const label    = getResultadoLabel(v.resultado);
        const repLabel = REPRESENTADAS.find(r => r.key === v.representada)?.label || '—';
        const valorTxt = v.valor > 0 ? 'R$ ' + formatReal(v.valor) : '—';
        const motivoTxt = Array.isArray(v.motivos) && v.motivos.length > 0
          ? v.motivos.join(', ')
          : v.motivo || '—';
        const tipoTxt = v.tipoRegistro === 'telefone' ? '📞 Tel.' : '🏪 Visita';
        return '<tr style="background:' + bg + '">'
          + '<td>' + v.dataFormatada + '</td>'
          + '<td><b>' + v.clienteNome + '</b></td>'
          + '<td><span style="color:#' + cor + ';font-weight:bold">' + label + '</span></td>'
          + '<td>' + repLabel + '</td>'
          + '<td>' + tipoTxt + '</td>'
          + '<td style="text-align:right">' + valorTxt + '</td>'
          + forn
          + '<td>' + motivoTxt + '</td>'
          + '<td>' + (v.observacoes || '—') + '</td>'
          + '</tr>';
      }).join('');

      const fornRankHtml = fornRanking.map(f => {
        const pct = compraram > 0 ? ((f.count / compraram) * 100).toFixed(0) : 0;
        return '<li><b>' + f.label + '</b>: ' + f.count + ' venda' + (f.count !== 1 ? 's' : '') + ' - ' + pct + '%</li>';
      }).join('');

      const motivosHtml = motivosRank.length > 0
        ? '<div><h2>Motivos de Nao Compra</h2><ul>'
          + motivosRank.map(([m, c]) => '<li>' + m + ': <b>' + c + 'x</b></li>').join('')
          + '</ul></div>'
        : '';

      const dataGeracao = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;margin:24px;color:#333;font-size:11px}
  h1{color:#001E2E;font-size:20px;margin-bottom:4px}
  h2{color:#001E2E;font-size:14px;margin:20px 0 8px;border-bottom:2px solid #E8B432;padding-bottom:4px}
  p{color:#666;margin-bottom:16px}
  .kpis{display:flex;gap:12px;margin-bottom:20px}
  .kpi{flex:1;background:#f0f4f8;border-radius:10px;padding:12px;text-align:center}
  .kpi-val{font-size:26px;font-weight:bold;color:#001E2E}
  .kpi-lbl{font-size:10px;color:#666;margin-top:2px}
  .geral{background:#e8f5e9;border-radius:12px;padding:16px;text-align:center;margin-bottom:20px}
  .geral-val{font-size:32px;font-weight:bold;color:#2e7d32}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#001E2E;color:#E8B432;padding:8px 6px;text-align:left}
  td{padding:6px;border-bottom:1px solid #eee;vertical-align:top}
  ul{margin:0;padding-left:20px;line-height:1.8}
  .cols2{display:flex;gap:24px;margin-bottom:20px}
  .cols2>div{flex:1}
</style></head>
<body>
  <h1>Relatorio de Visitas - MAYA Representacoes</h1>
  <p>Gerado em ${dataGeracao} - ${total} registro(s)</p>
  <div class="geral">
    <div class="geral-val">R$ ${formatReal(valorTotal)}</div>
    <div style="font-size:12px;color:#555;margin-top:4px">${compraram} venda${compraram !== 1 ? 's' : ''} realizada${compraram !== 1 ? 's' : ''}</div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-val">${total}</div><div class="kpi-lbl">Total</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#4CAF50">${compraram}</div><div class="kpi-lbl">Compraram</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#EF5350">${naoCompraram}</div><div class="kpi-lbl">Nao compraram</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#FF9800">${retornar}</div><div class="kpi-lbl">Retornar</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#E8B432">${taxaConversao}%</div><div class="kpi-lbl">Conversao</div></div>
  </div>
  <div class="cols2">
    <div><h2>Ranking Fornecedores</h2><ul>${fornRankHtml}</ul></div>
    ${motivosHtml}
  </div>
  <h2>Historico Detalhado</h2>
  <table><thead><tr>
    <th>Data/Hora</th><th>Cliente</th><th>Resultado</th><th>Representada</th><th>Tipo</th><th>Valor</th>
    ${fornCols}<th>Motivo(s)</th><th>Observacoes</th>
  </tr></thead><tbody>${linhas}</tbody></table>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64:false });
      await Sharing.shareAsync(uri, { mimeType:'application/pdf', dialogTitle:'Relatorio de Visitas MAYA' });
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel gerar o PDF.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
      <Animated.View style={[ds.header, {
        opacity  : headerAnim,
        transform: [{ translateY:headerAnim.interpolate({ inputRange:[0,1], outputRange:[-20,0] }) }],
      }]}>
        <View style={ds.headerTop}>
          <View style={ds.headerLeft}>
            <View style={ds.headerIcon}>
              <Icon name="bar-chart" size={20} color={DARK_BG} type="material" />
            </View>
            <View>
              <Text style={ds.headerTitle}>Visitas</Text>
              <Text style={ds.headerSub}>{`${total} registros · ${taxaConversao}% conversão`}</Text>
            </View>
          </View>
          <View style={ds.headerBtns}>
            <TouchableOpacity style={ds.iconBtn} onPress={loadDados} activeOpacity={0.8}>
              <Icon name="refresh" size={16} color={SILVER_DARK} type="material" />
            </TouchableOpacity>
            <TouchableOpacity style={ds.pdfBtn} onPress={exportarPDF} disabled={exportando} activeOpacity={0.8}>
              <Icon name="picture-as-pdf" size={15} color={DARK_BG} type="material" />
              <Text style={ds.pdfBtnTxt}>{exportando ? '...' : 'PDF'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ShimmerLine />
        <View style={ds.kpiRow}>
          <KpiCard icon="check-circle" value={compraram}    label="Compraram"   color={SUCCESS} sub={taxaConversao+'% conv.'} />
          <KpiCard icon="cancel"       value={naoCompraram} label="Não comprou" color={DANGER}  />
          <KpiCard icon="schedule"     value={retornar}     label="Retornar"    color={WARN}    />
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:100 }}>

        {/* VALOR TOTAL */}
        <View style={ds.section}>
          <View style={ds.sectionHeader}>
            <View style={[ds.sectionBar, { backgroundColor:SUCCESS }]} />
            <Text style={ds.sectionTitle}>Valor Vendas GERAL</Text>
          </View>
          <View style={[ds.sectionBody, ds.geralCard]}>
            <View style={ds.geralIconWrap}>
              <Icon name="attach-money" size={30} color={SUCCESS} type="material" />
            </View>
            <View>
              <Text style={ds.geralValor}>{`R$ ${formatReal(valorTotal)}`}</Text>
              <Text style={ds.geralSub}>{`${compraram} venda${compraram !== 1 ? 's' : ''} realizadas`}</Text>
            </View>
          </View>
        </View>

        {/* FORNECEDORES */}
        {compraram > 0 && (
          <View style={ds.section}>
            <View style={ds.sectionHeader}>
              <View style={ds.sectionBar} />
              <Text style={ds.sectionTitle}>Fornecedores mais vendidos</Text>
              <View style={ds.contadorBadge}>
                <Text style={ds.contadorTxt}>{`${compraram} venda${compraram !== 1 ? 's' : ''}`}</Text>
              </View>
            </View>
            <View style={ds.sectionBody}>
              {fornRanking.map(f => (
                <FornBar key={f.key} label={f.label} count={f.count} total={compraram} color={f.color} />
              ))}
            </View>
          </View>
        )}

        {/* MOTIVOS */}
        {motivosRank.length > 0 && (
          <View style={ds.section}>
            <View style={ds.sectionHeader}>
              <View style={[ds.sectionBar, { backgroundColor:DANGER }]} />
              <Text style={ds.sectionTitle}>Motivos de não compra</Text>
            </View>
            <View style={ds.sectionBody}>
              {motivosRank.map(([m, c]) => (
                <View key={m} style={ds.motivoRow}>
                  <Icon name="info-outline" size={14} color={DANGER} type="material" />
                  <Text style={ds.motivoNome}>{m}</Text>
                  <View style={ds.motivoBadge}>
                    <Text style={ds.motivoCount}>{`${c}x`}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* FILTROS */}
        <View style={ds.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ds.filtrosRow}>
            {FILTROS_RESULTADO.map(f => (
              <TouchableOpacity key={f.key}
                style={[ds.filtroChip, filtro===f.key && { backgroundColor:f.color, borderColor:f.color }]}
                onPress={() => setFiltro(f.key)} activeOpacity={0.8}>
                <Text style={[ds.filtroTxt, { color:filtro===f.key ? DARK_BG : f.color }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[ds.filtrosRow, { marginTop:8 }]}>
            <TouchableOpacity
              style={[ds.filtroChipRep, filtroRep==='todas' && { backgroundColor:SILVER_DARK, borderColor:SILVER_DARK }]}
              onPress={() => setFiltroRep('todas')} activeOpacity={0.8}>
              <Text style={[ds.filtroTxtRep, filtroRep==='todas' && { color:DARK_BG }]}>Todas rep.</Text>
            </TouchableOpacity>
            {REPRESENTADAS.map(r => (
              <TouchableOpacity key={r.key}
                style={[ds.filtroChipRep, filtroRep===r.key && { backgroundColor:r.color, borderColor:r.color }]}
                onPress={() => setFiltroRep(r.key)} activeOpacity={0.8}>
                <Icon name={r.icon} size={11} color={filtroRep===r.key ? DARK_BG : r.color} type="material" />
                <Text style={[ds.filtroTxtRep, { color:filtroRep===r.key ? DARK_BG : r.color }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={ds.filtroContador}>
            {`${visitasFiltradas.length} resultado${visitasFiltradas.length !== 1 ? 's' : ''}${filtro !== 'todos' || filtroRep !== 'todas' ? ' (filtrado)' : ''}`}
          </Text>
        </View>

        {/* LISTA */}
        <View style={{ paddingHorizontal:16, paddingTop:4 }}>
          {loading ? (
            <View style={ds.emptyWrap}>
              <Icon name="hourglass-empty" size={40} color={GOLD+'60'} type="material" />
              <Text style={ds.emptyTxt}>Carregando visitas...</Text>
            </View>
          ) : visitasFiltradas.length === 0 ? (
            <View style={ds.emptyWrap}>
              <Icon name="event-busy" size={52} color={GOLD+'40'} type="material" />
              <Text style={ds.emptyTitle}>Nenhuma visita encontrada</Text>
              <Text style={ds.emptyTxt}>{`Tente mudar os filtros\nou registre uma nova visita`}</Text>
            </View>
          ) : (
            visitasFiltradas.map(v => <VisitaCard key={v.id} item={v} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  container     : { flex:1, backgroundColor:DARK_BG },
  header        : { backgroundColor:'#001828', paddingBottom:16, borderBottomLeftRadius:28, borderBottomRightRadius:28, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.18, shadowRadius:14, elevation:10 },
  headerTop     : { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingTop:20, paddingBottom:12 },
  headerLeft    : { flexDirection:'row', alignItems:'center', gap:12 },
  headerIcon    : { width:42, height:42, borderRadius:21, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  headerTitle   : { fontSize:24, fontWeight:'bold', color:SILVER_LIGHT },
  headerSub     : { fontSize:11, color:SILVER_DARK, marginTop:2 },
  headerBtns    : { flexDirection:'row', alignItems:'center', gap:8 },
  iconBtn       : { width:34, height:34, borderRadius:17, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  pdfBtn        : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:GOLD, paddingHorizontal:14, paddingVertical:8, borderRadius:12, shadowColor:GOLD, shadowOffset:{width:0,height:3}, shadowOpacity:0.5, shadowRadius:6, elevation:5 },
  pdfBtnTxt     : { fontSize:12, fontWeight:'bold', color:DARK_BG },
  kpiRow        : { flexDirection:'row', marginHorizontal:16, marginTop:12, gap:0 },
  geralCard     : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:16, paddingVertical:22 },
  geralIconWrap : { width:56, height:56, borderRadius:28, backgroundColor:SUCCESS+'20', justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:SUCCESS+'40' },
  geralValor    : { fontSize:30, fontWeight:'bold', color:SUCCESS },
  geralSub      : { fontSize:12, color:SILVER_DARK, marginTop:3 },
  section       : { marginHorizontal:16, marginTop:18 },
  sectionHeader : { flexDirection:'row', alignItems:'center', marginBottom:14, gap:10 },
  sectionBar    : { width:4, height:18, borderRadius:2, backgroundColor:GOLD },
  sectionTitle  : { fontSize:14, fontWeight:'bold', color:SILVER_LIGHT },
  sectionBody   : { backgroundColor:CARD_BG, borderRadius:16, padding:16, borderWidth:1, borderColor:GOLD+'20' },
  contadorBadge : { marginLeft:'auto', backgroundColor:GOLD+'20', borderRadius:10, paddingHorizontal:10, paddingVertical:3, borderWidth:1, borderColor:GOLD+'40' },
  contadorTxt   : { fontSize:10, color:GOLD, fontWeight:'700' },
  motivoRow     : { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  motivoNome    : { flex:1, fontSize:13, color:SILVER_LIGHT },
  motivoBadge   : { backgroundColor:DANGER+'18', borderRadius:10, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:DANGER+'40' },
  motivoCount   : { fontSize:12, fontWeight:'bold', color:DANGER },
  filtrosRow    : { paddingVertical:4, gap:8, flexDirection:'row' },
  filtroChip    : { paddingHorizontal:16, paddingVertical:8, borderRadius:20, backgroundColor:CARD_BG, borderWidth:1, borderColor:SILVER+'30' },
  filtroTxt     : { fontSize:12, fontWeight:'700' },
  filtroChipRep : { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:12, paddingVertical:6, borderRadius:16, backgroundColor:CARD_BG, borderWidth:1, borderColor:SILVER+'30' },
  filtroTxtRep  : { fontSize:11, fontWeight:'700' },
  filtroContador: { fontSize:11, color:SILVER_DARK, marginTop:8, textAlign:'center' },
  emptyWrap     : { paddingTop:60, alignItems:'center' },
  emptyTitle    : { fontSize:16, fontWeight:'bold', color:SILVER, marginTop:16 },
  emptyTxt      : { fontSize:12, color:SILVER_DARK, marginTop:6, textAlign:'center', lineHeight:18 },
});