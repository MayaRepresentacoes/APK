// screens/DashboardScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 11 — DASHBOARD INTELIGENTE
//
// Checklist:
//   ✅ Cards resumo         — KPIs: visitas hoje, conversão, ticket, parados
//   ✅ Clientes prioritários — getPrioridadesHoje() + PrioridadeCard
//   ✅ Alertas reposição    — detectarOportunidadesIA() + ReposicaoCard
//   ✅ Follow-ups           — getOrcamentosParaFollowup() + FollowupItem
//   ✅ Conversão visitas    — KPI + VisitaHojeCard + clientes sem compra
//
// FUSÃO v2 — correções de comunicação com services:
//
//   [BUG CRÍTICO 1] normalizarOrcamentos() ausente
//     getOrcamentosParaFollowup(todosOrc) recebia lista bruta com
//     status 'aguardando'. O service filtra 'aguardando' OR 'pendente'
//     internamente, mas getPrioridadesHoje() no aiService só verifica
//     o.status === 'pendente' — orçamentos novos não adicionavam +15pts
//     ao score. normalizarOrcamentos() aplicado antes de todas as chamadas.
//
//   [BUG CRÍTICO 2] PrioridadeCard.motivos formato inconsistente
//     getPrioridadesHoje() pode retornar motivos[] como array de strings
//     (aiService) ou objetos {label,color,icon} (rotaService).
//     O card fazia cliente.motivos[0] direto como string — quebrava
//     quando era objeto. Corrigido com helper getMotivoLabel().
//
//   [FIX 1] Bloco de IA sem isolamento
//     setPrioridades e setReposicoes estavam no mesmo try principal.
//     Erro no aiService zeraria visitas e metas também.
//     Agora em bloco try/catch/finally próprio.
//
//   Mantidos integralmente:
//     useSafeAreaInsets, ShimmerLine, KpiCard, MetaBar, VisitaHojeCard,
//     ClienteSemCompraCard, Secao, FollowupItem, PrioridadeCard,
//     ReposicaoCard, todas as funções de cálculo, todos os styles.
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated, Platform,
  RefreshControl, Dimensions, Alert,
} from 'react-native';
import { Icon }                      from 'react-native-elements';
import { useSafeAreaInsets }         from 'react-native-safe-area-context';
import { getMetas }                  from '../services/firebase';
import { getTodosClientes }          from '../services/clienteService';
import { getTodasVisitas }           from '../services/visitaService';
import {
  getTodosOrcamentos,
  getOrcamentosParaFollowup,
  atualizarStatusOrcamento,
}                                    from '../services/orcamentoService';
import {
  getPrioridadesHoje,
  detectarOportunidadesIA,
}                                    from '../services/aiService';

const { width: SW } = Dimensions.get('window');

// ── Paleta ─────────────────────────────────────────────────────
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
  { key:'FORTLEV',       label:'Fortlev',       icon:'water',     color:BLUE        },
  { key:'AFORT',         label:'Afort',          icon:'plumbing',  color:GOLD        },
  { key:'METAL TECH',    label:'Metal Tech',     icon:'settings',  color:SUCCESS     },
  { key:'SOARES TINTAS', label:'Soares Tintas',  icon:'warehouse', color:PURPLE      },
  { key:'geral',         label:'Geral/Outros',   icon:'category',  color:SILVER_DARK },
];

// ════════════════════════════════════════════════════════════════
// [BUG CRÍTICO 1] normalizarOrcamentos
// criarOrcamento() persiste status='aguardando'. getPrioridadesHoje()
// no aiService verifica o.status === 'pendente' para o bônus de score.
// Sem normalização, todos os orçamentos novos ficam invisíveis para a IA.
// ════════════════════════════════════════════════════════════════
function normalizarOrcamentos(lista) {
  return lista.map(o =>
    o.status === 'aguardando' ? { ...o, status: 'pendente' } : o
  );
}

// ════════════════════════════════════════════════════════════════
// [BUG CRÍTICO 2] getMotivoLabel
// getPrioridadesHoje() pode retornar motivos[] como:
//   - string simples: "45d sem compra"   (aiService)
//   - objeto: { label, color, icon }     (rotaService / getClientesPrioritarios)
// PrioridadeCard usava motivos[0] como string diretamente — quebrava
// quando era objeto, renderizando "[object Object]".
// ════════════════════════════════════════════════════════════════
function getMotivoLabel(motivo) {
  if (!motivo) return '';
  if (typeof motivo === 'string') return motivo;
  return motivo.label || motivo.toString();
}

function getMotivoColor(motivo, fallback = GOLD) {
  if (!motivo) return fallback;
  if (typeof motivo === 'object' && motivo.color) return motivo.color;
  return fallback;
}

// ════════════════════════════════════════════════════════════════
// Funções de cálculo (mantidas integralmente)
// ════════════════════════════════════════════════════════════════
function getResumoDia(todasVisitas) {
  const hoje = new Date().toISOString().substring(0, 10);
  const visitasHoje = todasVisitas.filter(v =>
    (v.dataLocal || v.data || '').substring(0, 10) === hoje
  );
  const compras  = visitasHoje.filter(v => v.resultado === 'comprou');
  const vendas   = compras.reduce((s, v) => s + (v.valor || 0), 0);
  const conversao = visitasHoje.length > 0
    ? Math.round((compras.length / visitasHoje.length) * 100)
    : 0;
  return { totalVisitas:visitasHoje.length, totalCompras:compras.length, vendas, conversao, visitas:visitasHoje };
}

function getVisitasHoje(todasVisitas) {
  const hoje = new Date().toISOString().substring(0, 10);
  return todasVisitas.filter(v =>
    (v.dataLocal || v.data || '').substring(0, 10) === hoje
  );
}

function getVendasMes(todasVisitas, mes, ano) {
  const mesRef = mes ?? new Date().getMonth();
  const anoRef = ano ?? new Date().getFullYear();
  return todasVisitas
    .filter(v => {
      if (v.resultado !== 'comprou') return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mesRef && d.getFullYear() === anoRef;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);
}

function getVendasMesPorRep(todasVisitas, mes, ano) {
  const mesRef = mes ?? new Date().getMonth();
  const anoRef = ano ?? new Date().getFullYear();
  const mapa   = {};
  todasVisitas.forEach(v => {
    if (v.resultado !== 'comprou') return;
    const d = new Date(v.dataLocal || v.data || 0);
    if (d.getMonth() !== mesRef || d.getFullYear() !== anoRef) return;
    const rep = v.representada || 'geral';
    mapa[rep] = (mapa[rep] || 0) + (v.valor || 0);
  });
  return mapa;
}

function getConversaoVisitas(todasVisitas, mes, ano) {
  const mesRef = mes ?? new Date().getMonth();
  const anoRef = ano ?? new Date().getFullYear();
  const doMes  = todasVisitas.filter(v => {
    const d = new Date(v.dataLocal || v.data || 0);
    return d.getMonth() === mesRef && d.getFullYear() === anoRef;
  });
  if (!doMes.length) return 0;
  const comp = doMes.filter(v => v.resultado === 'comprou').length;
  return Math.round((comp / doMes.length) * 100);
}

function getClientesSemCompra(clientes, todasVisitas, diasLimite = 30) {
  const hoje = new Date();
  return clientes
    .filter(c => {
      const compras = todasVisitas
        .filter(v => v.clienteId === c.id && v.resultado === 'comprou')
        .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
      if (!compras.length) return true;
      const diasSem = (hoje - new Date(compras[0].dataLocal || 0)) / 86400000;
      return diasSem > diasLimite;
    })
    .map(c => {
      const compras = todasVisitas
        .filter(v => v.clienteId === c.id && v.resultado === 'comprou')
        .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
      const diasSemCompra = compras.length
        ? Math.round((hoje - new Date(compras[0].dataLocal || 0)) / 86400000)
        : 9999;
      return { ...c, diasSemCompra };
    })
    .sort((a, b) => b.diasSemCompra - a.diasSemCompra);
}

function getUltimasVisitasHoje(todasVisitas, n = 5) {
  return getVisitasHoje(todasVisitas)
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0))
    .slice(0, n);
}

function getTicketMedioMes(todasVisitas, mes, ano) {
  const mesRef  = mes ?? new Date().getMonth();
  const anoRef  = ano ?? new Date().getFullYear();
  const compras = todasVisitas.filter(v => {
    if (v.resultado !== 'comprou' || !v.valor) return false;
    const d = new Date(v.dataLocal || v.data || 0);
    return d.getMonth() === mesRef && d.getFullYear() === anoRef;
  });
  if (!compras.length) return 0;
  return compras.reduce((s, v) => s + v.valor, 0) / compras.length;
}

// ── Helpers ────────────────────────────────────────────────────
function formatReal(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function formatResumo(v) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${formatReal(v)}`;
}
function formatHora(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
  catch { return ''; }
}
function formatData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function getSaudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ════════════════════════════════════════════════════════════════
// Componentes visuais (mantidos integralmente)
// ════════════════════════════════════════════════════════════════

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver: Platform.OS !== 'web' })
    ).start();
  }, []);
  return (
    <View style={{ height:2, width:'100%', backgroundColor:color+'25', overflow:'hidden' }}>
      <Animated.View style={{
        position:'absolute', height:'100%', width:80,
        backgroundColor:color+'BB',
        transform:[{ translateX:anim.interpolate({ inputRange:[0,1], outputRange:[-80, SW] }) }],
      }} />
    </View>
  );
}

function KpiCard({ icon, label, value, sub, color = GOLD, onPress }) {
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue:1, friction:7, useNativeDriver:true }).start();
  }, []);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Animated.View style={{ transform:[{ scale:scaleAnim }], flex:1 }}>
      <Wrap style={[kc.card, { borderColor:color+'30' }]} onPress={onPress} activeOpacity={0.82}>
        <View style={[kc.iconWrap, { backgroundColor:color+'18' }]}>
          <Icon name={icon} size={20} color={color} type="material" />
        </View>
        <Text style={[kc.value, { color }]} numberOfLines={1}>{value}</Text>
        <Text style={kc.label}>{label}</Text>
        {sub ? <Text style={kc.sub}>{sub}</Text> : null}
      </Wrap>
    </Animated.View>
  );
}
const kc = StyleSheet.create({
  card    : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:18, padding:14, borderWidth:1, marginHorizontal:4 },
  iconWrap: { width:42, height:42, borderRadius:13, justifyContent:'center', alignItems:'center', marginBottom:8 },
  value   : { fontSize:21, fontWeight:'bold' },
  label   : { fontSize:10, color:SILVER_DARK, marginTop:2, textAlign:'center', letterSpacing:0.3 },
  sub     : { fontSize:9, color:SILVER_DARK+'80', marginTop:2, textAlign:'center' },
});

function MetaBar({ rep, vendido, meta }) {
  const pct     = meta > 0 ? Math.min((vendido / meta) * 100, 100) : 0;
  const cor     = pct >= 100 ? SUCCESS : pct >= 60 ? GOLD : pct >= 30 ? WARN : DANGER;
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue:pct, duration:900, useNativeDriver:false }).start();
  }, [pct]);
  return (
    <View style={mb.row}>
      <View style={[mb.dot, { backgroundColor:rep.color }]} />
      <View style={{ flex:1, gap:4 }}>
        <View style={mb.labelRow}>
          <Text style={mb.nome}>{rep.label}</Text>
          <Text style={[mb.pct, { color:cor }]}>{meta > 0 ? `${Math.round(pct)}%` : '—'}</Text>
        </View>
        <View style={mb.track}>
          <Animated.View style={[mb.fill, {
            width:barAnim.interpolate({ inputRange:[0,100], outputRange:['0%','100%'] }),
            backgroundColor:cor,
          }]} />
        </View>
        <View style={mb.valRow}>
          <Text style={mb.val}>{formatResumo(vendido)}</Text>
          {meta > 0 && <Text style={mb.valMeta}>/ {formatResumo(meta)}</Text>}
        </View>
      </View>
    </View>
  );
}
const mb = StyleSheet.create({
  row     : { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:14 },
  dot     : { width:8, height:8, borderRadius:4, marginTop:6 },
  labelRow: { flexDirection:'row', justifyContent:'space-between' },
  nome    : { fontSize:12, fontWeight:'700', color:SILVER_LIGHT },
  pct     : { fontSize:12, fontWeight:'800' },
  track   : { height:7, backgroundColor:CARD_BG2, borderRadius:4, overflow:'hidden' },
  fill    : { height:'100%', borderRadius:4 },
  valRow  : { flexDirection:'row', gap:4 },
  val     : { fontSize:10, color:SILVER_LIGHT, fontWeight:'700' },
  valMeta : { fontSize:10, color:SILVER_DARK },
});

function VisitaHojeCard({ v }) {
  const comprou  = v.resultado === 'comprou';
  const retornar = v.resultado === 'retornar';
  const cor      = comprou ? SUCCESS : retornar ? WARN : DANGER;
  const icone    = comprou ? 'check-circle' : retornar ? 'schedule' : 'cancel';
  return (
    <View style={vh.row}>
      <View style={[vh.iconWrap, { backgroundColor:cor+'18' }]}>
        <Icon name={icone} size={14} color={cor} type="material" />
      </View>
      <View style={{ flex:1 }}>
        <Text style={vh.nome} numberOfLines={1}>{v.clienteNome || '—'}</Text>
        <Text style={vh.hora}>{formatHora(v.dataLocal)}</Text>
      </View>
      {comprou && v.valor > 0 && <Text style={vh.valor}>{formatResumo(v.valor)}</Text>}
      {v.tipoRegistro === 'telefone' && <Icon name="phone" size={12} color={BLUE} type="material" />}
    </View>
  );
}
const vh = StyleSheet.create({
  row    : { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  iconWrap:{ width:30, height:30, borderRadius:10, justifyContent:'center', alignItems:'center' },
  nome   : { fontSize:13, fontWeight:'700', color:SILVER_LIGHT },
  hora   : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  valor  : { fontSize:12, fontWeight:'800', color:SUCCESS },
});

function ClienteSemCompraCard({ cliente, onPress }) {
  return (
    <TouchableOpacity style={cs.row} onPress={onPress} activeOpacity={0.82}>
      <View style={cs.avatarWrap}>
        <Text style={cs.avatar}>{(cliente.nome || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={{ flex:1 }}>
        <Text style={cs.nome} numberOfLines={1}>{cliente.nome}</Text>
        {cliente.cidade ? <Text style={cs.cidade}>{cliente.cidade}</Text> : null}
      </View>
      {cliente.diasSemCompra && cliente.diasSemCompra < 9999 && (
        <Text style={cs.dias}>{cliente.diasSemCompra}d</Text>
      )}
      <Icon name="chevron-right" size={18} color={SILVER_DARK} type="material" />
    </TouchableOpacity>
  );
}
const cs = StyleSheet.create({
  row      : { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  avatarWrap:{ width:32, height:32, borderRadius:10, backgroundColor:WARN+'25', borderWidth:1, borderColor:WARN+'45', justifyContent:'center', alignItems:'center' },
  avatar   : { fontSize:14, fontWeight:'800', color:WARN },
  nome     : { fontSize:13, fontWeight:'700', color:SILVER_LIGHT },
  cidade   : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  dias     : { fontSize:11, fontWeight:'800', color:WARN },
});

function Secao({ titulo, cor = GOLD, icone, badge, children, onVerTudo }) {
  return (
    <View style={sec.wrap}>
      <View style={sec.header}>
        <View style={[sec.bar, { backgroundColor:cor }]} />
        {icone && <Icon name={icone} size={14} color={cor} type="material" />}
        <Text style={sec.titulo}>{titulo}</Text>
        {badge != null && (
          <View style={[sec.badge, { backgroundColor:cor+'20', borderColor:cor+'40' }]}>
            <Text style={[sec.badgeTxt, { color:cor }]}>{badge}</Text>
          </View>
        )}
        {onVerTudo && (
          <TouchableOpacity onPress={onVerTudo} activeOpacity={0.8} style={sec.verTudoBtn}>
            <Text style={sec.verTudoTxt}>Ver tudo</Text>
            <Icon name="chevron-right" size={14} color={SILVER_DARK} type="material" />
          </TouchableOpacity>
        )}
      </View>
      <View style={sec.body}>{children}</View>
    </View>
  );
}
const sec = StyleSheet.create({
  wrap     : { marginHorizontal:16, marginBottom:16 },
  header   : { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  bar      : { width:4, height:18, borderRadius:2 },
  titulo   : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT, flex:1, letterSpacing:0.2 },
  badge    : { paddingHorizontal:9, paddingVertical:3, borderRadius:10, borderWidth:1 },
  badgeTxt : { fontSize:10, fontWeight:'800' },
  verTudoBtn:{ flexDirection:'row', alignItems:'center', gap:2 },
  verTudoTxt:{ fontSize:11, color:SILVER_DARK, fontWeight:'600' },
  body     : { backgroundColor:CARD_BG, borderRadius:16, padding:16, borderWidth:1, borderColor:SILVER+'12' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Follow-ups — FollowupItem (mantido integralmente)
// ════════════════════════════════════════════════════════════════
function FollowupItem({ orc, onAtualizar, onVerCliente }) {
  const [expandido, setExpandido] = useState(false);
  const urgCor   = orc.urgencia === 'atrasado' ? DANGER : orc.urgencia === 'hoje' ? WARN : BLUE;
  const urgLabel = orc.urgencia === 'atrasado'
    ? `${orc.diasAtraso}d atrasado`
    : orc.urgencia === 'hoje' ? 'HOJE' : 'Pendente';

  const confirmar = (status) => {
    const label = status === 'aprovado' ? '✅ APROVADO' : '❌ PERDIDO';
    Alert.alert(
      'Confirmar',
      `Marcar orçamento de ${orc.clienteNome} como ${label}?`,
      [
        { text:'Cancelar', style:'cancel' },
        { text:'Confirmar', onPress: () => onAtualizar(orc.id, status) },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[fu.item, { borderLeftColor:urgCor }]}
      onPress={() => setExpandido(e => !e)}
      activeOpacity={0.85}>
      <View style={fu.topRow}>
        <View style={[fu.urgBadge, { backgroundColor:urgCor+'20', borderColor:urgCor+'45' }]}>
          <Icon name="schedule" size={9} color={urgCor} type="material" />
          <Text style={[fu.urgTxt, { color:urgCor }]}>{urgLabel}</Text>
        </View>
        <Text style={fu.nome} numberOfLines={1}>{orc.clienteNome}</Text>
        <Text style={fu.valor}>R$ {formatReal(orc.valor)}</Text>
        <Icon name={expandido ? 'expand-less' : 'expand-more'} size={16} color={SILVER_DARK} type="material" />
      </View>
      <View style={fu.subRow}>
        <Text style={fu.subTxt}>
          Enviado: {formatData(orc.dataOrcamento)}
          {orc.dataFollowup ? `  ·  Retorno: ${formatData(orc.dataFollowup)}` : ''}
        </Text>
        <Text style={fu.diasTxt}>{orc.diasOrcamento}d</Text>
      </View>
      {expandido && (
        <View style={fu.expandido}>
          {orc.produtos?.length > 0 && <Text style={fu.produtos}>{orc.produtos.join(' · ')}</Text>}
          {orc.observacao ? <Text style={fu.obs}>{orc.observacao}</Text> : null}
          <View style={fu.acoesRow}>
            <TouchableOpacity
              style={[fu.acaoBtn, { backgroundColor:SUCCESS+'18', borderColor:SUCCESS+'40' }]}
              onPress={() => confirmar('aprovado')}
              activeOpacity={0.8}>
              <Icon name="check-circle" size={12} color={SUCCESS} type="material" />
              <Text style={[fu.acaoBtnTxt, { color:SUCCESS }]}>Fechou!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fu.acaoBtn, { backgroundColor:DANGER+'18', borderColor:DANGER+'40' }]}
              onPress={() => confirmar('perdido')}
              activeOpacity={0.8}>
              <Icon name="cancel" size={12} color={DANGER} type="material" />
              <Text style={[fu.acaoBtnTxt, { color:DANGER }]}>Perdido</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fu.acaoBtn, { backgroundColor:BLUE+'18', borderColor:BLUE+'40' }]}
              onPress={() => onVerCliente(orc)}
              activeOpacity={0.8}>
              <Icon name="person" size={12} color={BLUE} type="material" />
              <Text style={[fu.acaoBtnTxt, { color:BLUE }]}>Ver cliente</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}
const fu = StyleSheet.create({
  item      : { backgroundColor:CARD_BG2, borderRadius:13, borderWidth:1, borderLeftWidth:4, borderColor:SILVER+'18', padding:11, marginBottom:8 },
  topRow    : { flexDirection:'row', alignItems:'center', gap:7, marginBottom:4 },
  urgBadge  : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:6, paddingVertical:2, borderRadius:7, borderWidth:1 },
  urgTxt    : { fontSize:8, fontWeight:'900' },
  nome      : { flex:1, fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  valor     : { fontSize:12, fontWeight:'900', color:GOLD },
  subRow    : { flexDirection:'row', justifyContent:'space-between' },
  subTxt    : { fontSize:10, color:SILVER_DARK },
  diasTxt   : { fontSize:10, color:SILVER_DARK, fontWeight:'700' },
  expandido : { marginTop:10, gap:5, paddingTop:10, borderTopWidth:1, borderTopColor:SILVER+'12' },
  produtos  : { fontSize:11, color:SILVER, fontWeight:'600' },
  obs       : { fontSize:11, color:SILVER_DARK, fontStyle:'italic' },
  acoesRow  : { flexDirection:'row', gap:7, marginTop:4 },
  acaoBtn   : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:7, borderRadius:9, borderWidth:1 },
  acaoBtnTxt: { fontSize:11, fontWeight:'800' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Clientes prioritários — PrioridadeCard
// [BUG CRÍTICO 2] getMotivoLabel() e getMotivoColor() para aceitar
// motivos como string OU objeto {label, color, icon}
// ════════════════════════════════════════════════════════════════
function PrioridadeCard({ cliente, onPress }) {
  const scoreCor =
    cliente.score >= 70 ? DANGER :
    cliente.score >= 40 ? WARN   : GOLD;

  // [BUG CRÍTICO 2] Extrai label e cor independente do formato
  const primeiroMotivo      = cliente.motivos?.[0];
  const primeiroMotivoLabel = getMotivoLabel(primeiroMotivo);
  const primeiroMotivoCor   = getMotivoColor(primeiroMotivo, GOLD);

  return (
    <TouchableOpacity style={pc.row} onPress={onPress} activeOpacity={0.82}>
      <View style={[pc.avatarWrap, { borderColor:scoreCor+'60' }]}>
        <Text style={[pc.avatar, { color:scoreCor }]}>
          {(cliente.nome || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex:1, gap:2 }}>
        <Text style={pc.nome} numberOfLines={1}>{cliente.nome}</Text>
        {primeiroMotivoLabel ? (
          <Text style={[pc.motivo, { color: primeiroMotivoCor }]} numberOfLines={1}>
            {primeiroMotivoLabel}
          </Text>
        ) : null}
        {cliente.produtos?.length > 0 && (
          <Text style={pc.produto} numberOfLines={1}>
            {cliente.produtos.slice(0, 2).map(p =>
              typeof p === 'string' ? p : p.nome || p.label || ''
            ).join(' · ')}
          </Text>
        )}
      </View>
      <View style={{ alignItems:'flex-end', gap:4 }}>
        <View style={[pc.scoreBadge, { backgroundColor:scoreCor+'20', borderColor:scoreCor+'45' }]}>
          <Text style={[pc.scoreTxt, { color:scoreCor }]}>{cliente.score}</Text>
        </View>
        {cliente.ticketMedio > 0 && (
          <Text style={pc.ticket}>{formatResumo(cliente.ticketMedio)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
const pc = StyleSheet.create({
  row       : { flexDirection:'row', alignItems:'center', gap:11, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  avatarWrap: { width:38, height:38, borderRadius:12, backgroundColor:CARD_BG2, borderWidth:1.5, justifyContent:'center', alignItems:'center' },
  avatar    : { fontSize:16, fontWeight:'900' },
  nome      : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  motivo    : { fontSize:10, fontWeight:'600' },
  produto   : { fontSize:10, color:SILVER_DARK },
  scoreBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  scoreTxt  : { fontSize:11, fontWeight:'900' },
  ticket    : { fontSize:10, color:SILVER_DARK, fontWeight:'600' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Alertas reposição — ReposicaoCard (mantido)
// ════════════════════════════════════════════════════════════════
function ReposicaoCard({ item, onPress }) {
  const urgCor =
    item.urgencia === 'atrasado' ? DANGER :
    item.urgencia === 'hoje'     ? WARN   : BLUE;
  const urgLabel =
    item.urgencia === 'atrasado' ? `${Math.abs(item.diasRestantes)}d atrasado` :
    item.urgencia === 'hoje'     ? 'Repor hoje'                                :
    `Em ${item.diasRestantes}d`;

  return (
    <TouchableOpacity style={rc.row} onPress={onPress} activeOpacity={0.82}>
      <View style={[rc.iconWrap, { backgroundColor:urgCor+'18' }]}>
        <Icon name="inventory" size={16} color={urgCor} type="material" />
      </View>
      <View style={{ flex:1, gap:2 }}>
        <Text style={rc.nome} numberOfLines={1}>{item.nome}</Text>
        {item.produto && <Text style={rc.produto} numberOfLines={1}>{item.produto}</Text>}
        <Text style={rc.ciclo}>Ciclo médio: {item.ciclo}d</Text>
      </View>
      <View style={{ alignItems:'flex-end', gap:4 }}>
        <View style={[rc.urgBadge, { backgroundColor:urgCor+'20', borderColor:urgCor+'45' }]}>
          <Text style={[rc.urgTxt, { color:urgCor }]}>{urgLabel}</Text>
        </View>
        {item.ticketMedio > 0 && <Text style={rc.ticket}>{formatResumo(item.ticketMedio)}</Text>}
      </View>
    </TouchableOpacity>
  );
}
const rc = StyleSheet.create({
  row     : { flexDirection:'row', alignItems:'center', gap:11, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  iconWrap: { width:36, height:36, borderRadius:11, justifyContent:'center', alignItems:'center' },
  nome    : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  produto : { fontSize:10, color:SILVER, fontWeight:'600' },
  ciclo   : { fontSize:10, color:SILVER_DARK },
  urgBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  urgTxt  : { fontSize:10, fontWeight:'900' },
  ticket  : { fontSize:10, color:SILVER_DARK, fontWeight:'600' },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const agora  = new Date();

  const [todasVisitas,  setTodasVisitas]  = useState([]);
  const [clientes,      setClientes]      = useState([]);
  const [metas,         setMetas]         = useState({});
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [verMaisAlerta, setVerMaisAlerta] = useState(false);
  const [followups,     setFollowups]     = useState([]);
  const [prioridades,   setPrioridades]   = useState([]);
  const [reposicoes,    setReposicoes]    = useState([]);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  // ── Carga ─────────────────────────────────────────────────────
  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);

    let visOk  = [];
    let cltsOk = [];
    let orcsOk = [];

    // Bloco base — dados principais
    try {
      const [visitas, clts, metasSalvas, todosOrc] = await Promise.all([
        getTodasVisitas(),
        getTodosClientes(),
        getMetas(),
        getTodosOrcamentos(),
      ]);
      visOk  = visitas   || [];
      cltsOk = clts      || [];
      orcsOk = todosOrc  || [];

      setTodasVisitas(visOk);
      setClientes(cltsOk);
      setMetas(metasSalvas || {});

      // [BUG CRÍTICO 1] Normaliza antes de getOrcamentosParaFollowup
      const orcsNorm = normalizarOrcamentos(orcsOk);
      setFollowups(getOrcamentosParaFollowup(orcsNorm));
    } catch (e) {
      console.log('[Dashboard] carga base:', e);
    }

    // [FIX 1] Bloco de IA isolado — erro não zera visitas/metas
    try {
      // [BUG CRÍTICO 1] normalizarOrcamentos antes de getPrioridadesHoje
      const orcsNorm = normalizarOrcamentos(orcsOk);
      setPrioridades(getPrioridadesHoje(cltsOk, visOk, orcsNorm, 5));
      setReposicoes(detectarOportunidadesIA(cltsOk, visOk, 5));
    } catch (eIA) {
      console.log('[Dashboard] IA:', eIA);
      setPrioridades([]);
      setReposicoes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregar();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:500, useNativeDriver:true }),
      Animated.timing(slideAnim, { toValue:0, duration:500, useNativeDriver:true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────
  const handleAtualizarOrc = async (id, status) => {
    try {
      await atualizarStatusOrcamento(id, status);
      setFollowups(prev => prev.filter(o => o.id !== id));
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível atualizar o orçamento.');
    }
  };

  const handleVerClienteOrc = (orc) => {
    navigation?.navigate?.('ClienteDetalhe', {
      cliente: {
        id    : orc.clienteId,
        nome  : orc.clienteNome,
        tipo  : orc.clienteTipo   || 'loja',
        cidade: orc.clienteCidade || '',
      },
    });
  };

  const handleVerClienteIA = (cliente) => {
    navigation?.navigate?.('ClienteDetalhe', { cliente });
  };

  // ── Dados calculados ──────────────────────────────────────────
  const mesAtual    = agora.getMonth();
  const anoAtual    = agora.getFullYear();
  const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
  const anoAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

  const resumoDia         = getResumoDia(todasVisitas);
  const visitasHoje       = resumoDia.visitas;
  const vendasMes         = getVendasMes(todasVisitas, mesAtual, anoAtual);
  const vendasMesAnt      = getVendasMes(todasVisitas, mesAnterior, anoAnterior);
  const conversaoMes      = getConversaoVisitas(todasVisitas, mesAtual, anoAtual);
  const clientesSemCompra = getClientesSemCompra(clientes, todasVisitas, 30);
  const ticketMedio       = getTicketMedioMes(todasVisitas, mesAtual, anoAtual);
  const vendasPorRep      = getVendasMesPorRep(todasVisitas, mesAtual, anoAtual);

  const variacaoMes = vendasMesAnt > 0
    ? Math.round(((vendasMes - vendasMesAnt) / vendasMesAnt) * 100)
    : null;

  const ultimasHoje   = getUltimasVisitasHoje(todasVisitas, 6);
  const vendasHoje    = visitasHoje.filter(v => v.resultado === 'comprou').reduce((s, v) => s + v.valor, 0);

  const metaTotal    = REPRESENTADAS.reduce((s, r) => s + (metas[r.key] || 0), 0);
  const pctMetaGeral = metaTotal > 0 ? Math.round((vendasMes / metaTotal) * 100) : null;
  const corMeta      = pctMetaGeral == null ? SILVER_DARK
    : pctMetaGeral >= 100 ? SUCCESS
    : pctMetaGeral >= 60  ? GOLD
    : pctMetaGeral >= 30  ? WARN : DANGER;

  const alertasExibidos = verMaisAlerta ? clientesSemCompra : clientesSemCompra.slice(0, 4);
  const corConversao    = conversaoMes >= 70 ? SUCCESS : conversaoMes >= 40 ? GOLD : conversaoMes >= 20 ? WARN : DANGER;

  const fuAtrasados  = followups.filter(o => o.urgencia === 'atrasado').length;
  const fuHoje       = followups.filter(o => o.urgencia === 'hoje').length;
  const repAtrasadas = reposicoes.filter(r => r.urgencia === 'atrasado').length;
  const repHoje      = reposicoes.filter(r => r.urgencia === 'hoje').length;

  if (loading) {
    return (
      <View style={{ flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center' }}>
        <View style={ds.loadingIconWrap}>
          <Icon name="dashboard" size={32} color={GOLD} type="material" />
        </View>
        <Text style={{ color:SILVER, fontSize:14, fontWeight:'600', marginTop:16 }}>
          Carregando dashboard...
        </Text>
        <ActivityIndicator color={GOLD} style={{ marginTop:12 }} />
      </View>
    );
  }

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

      {/* ══ HEADER ══ */}
      <View style={ds.header}>
        <View style={ds.headerAccent} />
        <View style={ds.headerRow}>
          <View style={ds.headerIconWrap}>
            <Icon name="dashboard" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={ds.saudacao}>{getSaudacao()}, Anderson 👋</Text>
            <Text style={ds.headerSub}>
              {agora.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}
            </Text>
          </View>
          <TouchableOpacity style={ds.refreshBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>
        <ShimmerLine color={GOLD} />

        {/* Vendas destaque */}
        <View style={ds.vendaDestaque}>
          <View style={ds.vendaDestaqueLeft}>
            <Text style={ds.vendaDestaqueLabel}>{`Vendas de ${MESES[mesAtual]}`}</Text>
            <Text style={ds.vendaDestaqueValor}>{formatResumo(vendasMes)}</Text>
            {variacaoMes !== null && (
              <View style={ds.variacaoRow}>
                <Icon
                  name={variacaoMes >= 0 ? 'arrow-upward' : 'arrow-downward'}
                  size={12}
                  color={variacaoMes >= 0 ? SUCCESS : DANGER}
                  type="material"
                />
                <Text style={[ds.variacaoTxt, { color:variacaoMes >= 0 ? SUCCESS : DANGER }]}>
                  {`${variacaoMes >= 0 ? '+' : ''}${variacaoMes}% vs ${MESES[mesAnterior]}`}
                </Text>
              </View>
            )}
          </View>
          {pctMetaGeral !== null && (
            <View style={[ds.metaBadge, { backgroundColor:corMeta+'18', borderColor:corMeta+'45' }]}>
              <Icon name="flag" size={13} color={corMeta} type="material" />
              <Text style={[ds.metaBadgeTxt, { color:corMeta }]}>{`${pctMetaGeral}% da meta`}</Text>
            </View>
          )}
        </View>
      </View>

      <Animated.ScrollView
        style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }}
        contentContainerStyle={[ds.scroll, { paddingBottom: Math.max(insets.bottom + 40, 40) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={GOLD} colors={[GOLD]} />
        }>

        {/* ✅ CHECKLIST: Cards resumo — KPIs */}
        <View style={ds.kpiRow}>
          <KpiCard
            icon="today"
            label="Visitas hoje"
            value={resumoDia.totalVisitas}
            sub={`${resumoDia.totalCompras} compra${resumoDia.totalCompras !== 1 ? 's' : ''} · ${resumoDia.conversao}%`}
            color={resumoDia.totalVisitas > 0 ? GOLD : SILVER_DARK}
            onPress={() => navigation?.navigate?.('Visitas')}
          />
          <KpiCard
            icon="show-chart"
            label="Conversão do mês"
            value={`${conversaoMes}%`}
            sub={`${todasVisitas.filter(v => {
              const d = new Date(v.dataLocal || v.data || 0);
              return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
            }).length} visitas`}
            color={corConversao}
          />
        </View>
        <View style={[ds.kpiRow, { marginTop:0 }]}>
          <KpiCard
            icon="receipt-long"
            label="Ticket médio"
            value={ticketMedio > 0 ? formatResumo(ticketMedio) : '—'}
            sub={MESES[mesAtual]}
            color={BLUE}
          />
          <KpiCard
            icon="warning"
            label="Sem compra (30d)"
            value={clientesSemCompra.length}
            sub="Clientes parados"
            color={clientesSemCompra.length > 5 ? DANGER : clientesSemCompra.length > 0 ? WARN : SUCCESS}
            onPress={() => navigation?.navigate?.('CRM')}
          />
        </View>

        {/* ══ METAS ══ */}
        {metaTotal > 0 && (
          <Secao titulo={`Metas de ${MESES[mesAtual]}`} cor={GOLD} icone="flag"
            badge={pctMetaGeral !== null ? `${pctMetaGeral}%` : null}
            onVerTudo={() => navigation?.navigate?.('Metas')}>
            {REPRESENTADAS.filter(r => (metas[r.key] || 0) > 0).map(r => (
              <MetaBar key={r.key} rep={r} vendido={vendasPorRep[r.key] || 0} meta={metas[r.key] || 0} />
            ))}
          </Secao>
        )}

        {/* ══ VENDAS HOJE ══ */}
        {vendasHoje > 0 && (
          <View style={ds.vendaHojeCard}>
            <View style={ds.vendaHojeIconWrap}>
              <Icon name="trending-up" size={24} color={SUCCESS} type="material" />
            </View>
            <View>
              <Text style={ds.vendaHojeLabel}>Vendas realizadas hoje</Text>
              <Text style={ds.vendaHojeValor}>{`R$ ${formatReal(vendasHoje)}`}</Text>
            </View>
          </View>
        )}

        {/* ✅ CHECKLIST: Clientes prioritários — IA */}
        {prioridades.length > 0 && (
          <Secao titulo="IA recomenda — Prioridades hoje" cor={GOLD} icone="auto-awesome"
            badge={prioridades.length}
            onVerTudo={() => navigation?.navigate?.('Clientes')}>
            <View style={[ds.alertaBanner, { borderColor:GOLD+'35', backgroundColor:GOLD+'0D', marginBottom:10 }]}>
              <Icon name="bolt" size={14} color={GOLD} type="material" />
              <Text style={ds.alertaTxt}>
                Clientes com maior potencial de compra hoje, baseado em ciclo, ticket e histórico
              </Text>
            </View>
            {prioridades.map(c => (
              <PrioridadeCard key={c.id} cliente={c} onPress={() => handleVerClienteIA(c)} />
            ))}
          </Secao>
        )}

        {/* ✅ CHECKLIST: Alertas reposição — IA */}
        {reposicoes.length > 0 && (
          <Secao titulo="Reposição provável" cor={PURPLE} icone="inventory"
            badge={reposicoes.length}
            onVerTudo={() => navigation?.navigate?.('Clientes')}>
            <View style={[ds.alertaBanner, {
              borderColor  : repAtrasadas > 0 ? DANGER+'40' : PURPLE+'35',
              backgroundColor: repAtrasadas > 0 ? DANGER+'0D' : PURPLE+'0D',
              marginBottom : 10,
            }]}>
              <Icon
                name={repAtrasadas > 0 ? 'warning' : 'inventory-2'}
                size={14}
                color={repAtrasadas > 0 ? DANGER : PURPLE}
                type="material"
              />
              <Text style={ds.alertaTxt}>
                {repAtrasadas > 0 && (
                  <Text style={{ fontWeight:'800', color:DANGER }}>
                    {`${repAtrasadas} cliente${repAtrasadas > 1 ? 's' : ''} com reposição atrasada  `}
                  </Text>
                )}
                {repHoje > 0 && (
                  <Text style={{ fontWeight:'800', color:WARN }}>
                    {`${repHoje} para repor hoje`}
                  </Text>
                )}
                {repAtrasadas === 0 && repHoje === 0 &&
                  `${reposicoes.length} cliente${reposicoes.length > 1 ? 's' : ''} provavelmente precisando de reposição`}
              </Text>
            </View>
            {reposicoes.map(r => (
              <ReposicaoCard key={r.id} item={r} onPress={() => handleVerClienteIA(r)} />
            ))}
          </Secao>
        )}

        {/* ══ VISITAS DO DIA ══ */}
        <Secao titulo="Visitas de hoje" cor={BLUE} icone="today"
          badge={visitasHoje.length}
          onVerTudo={() => navigation?.navigate?.('Visitas')}>
          {ultimasHoje.length === 0 ? (
            <View style={ds.emptyWrap}>
              <Icon name="event-available" size={32} color={GOLD+'40'} type="material" />
              <Text style={ds.emptyTxt}>Nenhuma visita registrada hoje</Text>
              <TouchableOpacity
                style={ds.novaVisitaBtn}
                onPress={() => navigation?.navigate?.('Clientes')}
                activeOpacity={0.8}>
                <Icon name="add" size={14} color={DARK_BG} type="material" />
                <Text style={ds.novaVisitaTxt}>Registrar visita</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {ultimasHoje.map((v, i) => <VisitaHojeCard key={v.id || i} v={v} />)}
              {visitasHoje.length > 6 && (
                <TouchableOpacity style={ds.verMaisBtn} onPress={() => navigation?.navigate?.('Visitas')} activeOpacity={0.8}>
                  <Text style={ds.verMaisTxt}>{`+ ${visitasHoje.length - 6} visitas hoje`}</Text>
                  <Icon name="chevron-right" size={14} color={BLUE} type="material" />
                </TouchableOpacity>
              )}
            </>
          )}
        </Secao>

        {/* ✅ CHECKLIST: Follow-ups */}
        {followups.length > 0 && (
          <Secao titulo="Follow-ups pendentes"
            cor={fuAtrasados > 0 ? DANGER : WARN}
            icone="notifications-active"
            badge={followups.length}
            onVerTudo={() => navigation?.navigate?.('Orcamentos')}>
            <View style={[ds.alertaBanner, {
              borderColor    : fuAtrasados > 0 ? DANGER+'40' : WARN+'35',
              backgroundColor: fuAtrasados > 0 ? DANGER+'10' : WARN+'10',
            }]}>
              <Icon
                name={fuAtrasados > 0 ? 'warning' : 'schedule'}
                size={15}
                color={fuAtrasados > 0 ? DANGER : WARN}
                type="material"
              />
              <Text style={ds.alertaTxt}>
                {fuAtrasados > 0 && (
                  <Text style={{ fontWeight:'800', color:DANGER }}>
                    {`${fuAtrasados} atrasado${fuAtrasados > 1 ? 's' : ''}  `}
                  </Text>
                )}
                {fuHoje > 0 && (
                  <Text style={{ fontWeight:'800', color:WARN }}>{`${fuHoje} para hoje`}</Text>
                )}
                {fuAtrasados === 0 && fuHoje === 0 &&
                  `${followups.length} orçamento${followups.length > 1 ? 's' : ''} para acompanhar`}
              </Text>
            </View>
            {followups.slice(0, 4).map(orc => (
              <FollowupItem key={orc.id} orc={orc} onAtualizar={handleAtualizarOrc} onVerCliente={handleVerClienteOrc} />
            ))}
            {followups.length > 4 && (
              <TouchableOpacity style={ds.verMaisBtn} onPress={() => navigation?.navigate?.('Orcamentos')} activeOpacity={0.8}>
                <Text style={[ds.verMaisTxt, { color:WARN }]}>
                  {`+ ${followups.length - 4} orçamento${followups.length - 4 > 1 ? 's' : ''} pendente${followups.length - 4 > 1 ? 's' : ''}`}
                </Text>
                <Icon name="chevron-right" size={14} color={WARN} type="material" />
              </TouchableOpacity>
            )}
          </Secao>
        )}

        {/* ══ CLIENTES SEM COMPRA ══ */}
        {clientesSemCompra.length > 0 && (
          <Secao titulo="Clientes sem compra há 30+ dias" cor={WARN} icone="warning"
            badge={clientesSemCompra.length}
            onVerTudo={() => navigation?.navigate?.('CRM')}>
            <View style={[ds.alertaBanner, { borderColor:WARN+'35', backgroundColor:WARN+'10' }]}>
              <Icon name="campaign" size={16} color={WARN} type="material" />
              <Text style={ds.alertaTxt}>
                <Text style={{ fontWeight:'800', color:WARN }}>
                  {`${clientesSemCompra.length} cliente${clientesSemCompra.length !== 1 ? 's' : ''} `}
                </Text>
                precisam de atenção urgente
              </Text>
            </View>
            {alertasExibidos.map(c => (
              <ClienteSemCompraCard
                key={c.id}
                cliente={c}
                onPress={() => navigation?.navigate?.('HistoricoCliente', { cliente:c })}
              />
            ))}
            {clientesSemCompra.length > 4 && (
              <TouchableOpacity style={ds.verMaisBtn} onPress={() => setVerMaisAlerta(t => !t)} activeOpacity={0.8}>
                <Text style={[ds.verMaisTxt, { color:WARN }]}>
                  {verMaisAlerta ? 'Recolher' : `Ver todos (${clientesSemCompra.length - 4} restantes)`}
                </Text>
                <Icon name={verMaisAlerta ? 'unfold-less' : 'unfold-more'} size={14} color={WARN} type="material" />
              </TouchableOpacity>
            )}
          </Secao>
        )}

        {/* ══ AÇÕES RÁPIDAS ══ */}
        <View style={ds.acoesRow}>
          {[
            { label:'Novo\nCheck-in', icon:'pin-drop',  cor:SUCCESS, rota:'Clientes'   },
            { label:'CRM',            icon:'psychology', cor:PURPLE,  rota:'CRM'        },
            { label:'Visitas',        icon:'bar-chart',  cor:BLUE,    rota:'Visitas'    },
            { label:'Metas',          icon:'flag',       cor:GOLD,    rota:'Metas'      },
          ].map(a => (
            <TouchableOpacity
              key={a.rota}
              style={[ds.acaoBtn, { borderColor:a.cor+'35' }]}
              onPress={() => navigation?.navigate?.(a.rota)}
              activeOpacity={0.8}>
              <View style={[ds.acaoBtnIcon, { backgroundColor:a.cor+'18' }]}>
                <Icon name={a.icon} size={18} color={a.cor} type="material" />
              </View>
              <Text style={[ds.acaoBtnTxt, { color:a.cor }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height:90 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES (mantidos integralmente)
// ════════════════════════════════════════════════════════════════
const ds = StyleSheet.create({
  container         : { flex:1, backgroundColor:DARK_BG },
  scroll            : { paddingTop:12, paddingBottom:40 },
  loadingIconWrap   : { width:72, height:72, borderRadius:24, backgroundColor:CARD_BG, borderWidth:1, borderColor:GOLD+'40', justifyContent:'center', alignItems:'center' },
  header            : { backgroundColor:'#001828', borderBottomLeftRadius:26, borderBottomRightRadius:26, overflow:'hidden', elevation:12, shadowColor:GOLD, shadowOffset:{ width:0, height:6 }, shadowOpacity:0.18, shadowRadius:14 },
  headerAccent      : { height:3, backgroundColor:GOLD },
  headerRow         : { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:18, paddingTop:48, paddingBottom:10 },
  headerIconWrap    : { width:42, height:42, borderRadius:14, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  saudacao          : { fontSize:18, fontWeight:'bold', color:SILVER_LIGHT },
  headerSub         : { fontSize:11, color:SILVER_DARK, marginTop:1, textTransform:'capitalize' },
  refreshBtn        : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  vendaDestaque     : { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:18, paddingVertical:14 },
  vendaDestaqueLeft : { gap:2 },
  vendaDestaqueLabel: { fontSize:11, color:SILVER_DARK, fontWeight:'600' },
  vendaDestaqueValor: { fontSize:32, fontWeight:'bold', color:SUCCESS },
  variacaoRow       : { flexDirection:'row', alignItems:'center', gap:3, marginTop:2 },
  variacaoTxt       : { fontSize:11, fontWeight:'700' },
  metaBadge         : { paddingHorizontal:12, paddingVertical:6, borderRadius:12, borderWidth:1, gap:4, flexDirection:'row', alignItems:'center' },
  metaBadgeTxt      : { fontSize:12, fontWeight:'800' },
  kpiRow            : { flexDirection:'row', marginHorizontal:12, marginBottom:10 },
  vendaHojeCard     : { flexDirection:'row', alignItems:'center', gap:14, marginHorizontal:16, marginBottom:16, backgroundColor:SUCCESS+'12', borderRadius:16, padding:14, borderWidth:1, borderColor:SUCCESS+'30' },
  vendaHojeIconWrap : { width:48, height:48, borderRadius:24, backgroundColor:SUCCESS+'22', justifyContent:'center', alignItems:'center' },
  vendaHojeLabel    : { fontSize:11, color:SILVER_DARK, marginBottom:2 },
  vendaHojeValor    : { fontSize:22, fontWeight:'bold', color:SUCCESS },
  alertaBanner      : { flexDirection:'row', alignItems:'center', gap:8, borderRadius:10, padding:10, marginBottom:10, borderWidth:1 },
  alertaTxt         : { fontSize:12, color:SILVER, flex:1 },
  verMaisBtn        : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:10, marginTop:4 },
  verMaisTxt        : { fontSize:12, fontWeight:'700', color:BLUE },
  emptyWrap         : { alignItems:'center', paddingVertical:20, gap:8 },
  emptyTxt          : { fontSize:12, color:SILVER_DARK },
  novaVisitaBtn     : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:GOLD, paddingHorizontal:16, paddingVertical:8, borderRadius:12, marginTop:4 },
  novaVisitaTxt     : { fontSize:12, fontWeight:'bold', color:DARK_BG },
  acoesRow          : { flexDirection:'row', marginHorizontal:16, gap:8, marginBottom:10 },
  acaoBtn           : { flex:1, alignItems:'center', gap:6, backgroundColor:CARD_BG, borderRadius:14, paddingVertical:12, borderWidth:1 },
  acaoBtnIcon       : { width:38, height:38, borderRadius:12, justifyContent:'center', alignItems:'center' },
  acaoBtnTxt        : { fontSize:9, fontWeight:'800', textAlign:'center' },
});