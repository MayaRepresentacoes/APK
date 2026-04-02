// screens/AlertaScreen.js
// ════════════════════════════════════════════════════════════════
// CENTRAL DE ALERTAS — Agrega todas as notificações do app
//
// Seções:
//   1. Follow-ups urgentes  — orçamentos com retorno atrasado ou hoje
//   2. Reposições urgentes  — produtos no ciclo de reposição
//   3. Clientes parados     — sem compra há ≥ 30 dias
//
// Funções utilizadas:
//   getOrcamentosParaFollowup()   — orcamentoService
//   getAlertasReposicaoGlobal()   — aiService
//   getDiasSemCompra()            — analyticsService
//   getTodosOrcamentos()          — orcamentoService
//   getTodasVisitas()             — visitaService
//   getTodosClientes()            — clienteService
//   atualizarStatusOrcamento()    — orcamentoService
//
// FUSÕES aplicadas:
//   [FIX 1] normalizarOrcamentos() — status 'aguardando' → 'pendente'
//           antes de getOrcamentosParaFollowup. Orçamentos novos
//           ficam invisíveis no banner sem essa normalização.
//   [FIX 2] Blocos de IA em try/catch/finally isolados
//           → loadingReposicao e loadingParados nunca travam.
//   [FIX 3] getOrcamentosParaFollowup recebe lista completa de
//           orçamentos normalizados (não filtrada por cliente).
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Animated, ActivityIndicator, RefreshControl,
  Alert,
} from 'react-native';
import { Icon }                    from 'react-native-elements';
import { getTodosClientes }        from '../services/clienteService';
import { getTodasVisitas }         from '../services/visitaService';
import {
  getTodosOrcamentos,
  getOrcamentosParaFollowup,
  atualizarStatusOrcamento,
}                                  from '../services/orcamentoService';
import { getAlertasReposicaoGlobal } from '../services/aiService';
import { getDiasSemCompra }        from '../services/analyticsService';

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

const PRODUTO_LABEL = {
  caixas:'Caixas', tubos:'Tubos', conexoes:'Conexões', telhas:'Telhas',
  vasos:'Vasos',   metais:'Metais', tintas:'Tintas',
};

// ════════════════════════════════════════════════════════════════
// [FIX 1] Normaliza 'aguardando' → 'pendente' antes do service
// getOrcamentosParaFollowup filtra por status 'aguardando' ou
// 'pendente' internamente — mas orçamentos criados têm 'aguardando'
// como padrão. Sem normalização, follow-ups novos ficam invisíveis.
// ════════════════════════════════════════════════════════════════
function normalizarOrcamentos(lista) {
  return lista.map(o =>
    o.status === 'aguardando' ? { ...o, status: 'pendente' } : o
  );
}

function formatReal(v) {
  if (!v || v === 0) return '—';
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;
}
function formatData(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }); }
  catch { return '—'; }
}

// ════════════════════════════════════════════════════════════════
// Cabeçalho de seção colapsável
// ════════════════════════════════════════════════════════════════
function SecaoHeader({ icon, titulo, sub, cor, qtd, expandido, onToggle, loading }) {
  return (
    <TouchableOpacity
      style={[sh.container, { borderColor: cor + '35', backgroundColor: cor + '0C' }]}
      onPress={onToggle}
      activeOpacity={0.85}>
      <View style={[sh.iconWrap, { backgroundColor: cor + '20' }]}>
        <Icon name={icon} size={16} color={cor} type="material" />
      </View>
      <View style={{ flex:1 }}>
        <Text style={[sh.titulo, { color: cor }]}>{titulo}</Text>
        {sub ? <Text style={sh.sub}>{sub}</Text> : null}
      </View>
      {loading
        ? <ActivityIndicator size="small" color={cor} />
        : (
          <View style={[sh.qtdBadge, { backgroundColor: cor + '25', borderColor: cor + '50' }]}>
            <Text style={[sh.qtdTxt, { color: cor }]}>{qtd}</Text>
          </View>
        )
      }
      <Icon
        name={expandido ? 'expand-less' : 'expand-more'}
        size={18} color={cor} type="material"
        style={{ marginLeft:4 }}
      />
    </TouchableOpacity>
  );
}
const sh = StyleSheet.create({
  container : { flexDirection:'row', alignItems:'center', gap:10, padding:13, borderRadius:14, borderWidth:1, marginBottom:6 },
  iconWrap  : { width:34, height:34, borderRadius:10, justifyContent:'center', alignItems:'center', flexShrink:0 },
  titulo    : { fontSize:13, fontWeight:'800' },
  sub       : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  qtdBadge  : { paddingHorizontal:9, paddingVertical:3, borderRadius:10, borderWidth:1 },
  qtdTxt    : { fontSize:12, fontWeight:'900' },
});

// ════════════════════════════════════════════════════════════════
// SEÇÃO 1 — Card de follow-up
// ════════════════════════════════════════════════════════════════
function CardFollowup({ orc, onAprovar, onPerder, onVerOrcamento }) {
  const urgCor =
    orc.urgencia === 'atrasado' ? DANGER :
    orc.urgencia === 'hoje'     ? WARN   : BLUE;

  const urgLabel =
    orc.urgencia === 'atrasado'
      ? `${orc.diasAtraso ?? 0}d atrasado`
      : orc.urgencia === 'hoje' ? 'Retorno HOJE' : 'Breve';

  return (
    <View style={[cf.card, { borderLeftColor: urgCor }]}>
      <View style={cf.top}>
        <View style={{ flex:1 }}>
          <Text style={cf.cliente} numberOfLines={1}>{orc.clienteNome}</Text>
          <Text style={cf.info}>
            {`Enviado: ${formatData(orc.dataOrcamento)}`}
            {orc.dataFollowup || orc.dataRetorno
              ? `  ·  Retorno: ${formatData(orc.dataFollowup || orc.dataRetorno)}`
              : ''}
          </Text>
          <Text style={cf.valor}>{formatReal(orc.valor)}</Text>
          {orc.produtos?.length > 0 && (
            <Text style={cf.produtos} numberOfLines={1}>
              {orc.produtos.map(p => PRODUTO_LABEL[p] || p).join(' · ')}
            </Text>
          )}
        </View>
        <View style={{ alignItems:'flex-end', gap:6 }}>
          <View style={[cf.urgBadge, { backgroundColor:urgCor+'20', borderColor:urgCor+'40' }]}>
            <Text style={[cf.urgTxt, { color:urgCor }]}>{urgLabel}</Text>
          </View>
        </View>
      </View>
      <View style={cf.acoes}>
        <TouchableOpacity
          style={[cf.acaoBtn, { backgroundColor:SUCCESS+'18', borderColor:SUCCESS+'40', flex:1 }]}
          onPress={() => onAprovar(orc.id)}
          activeOpacity={0.8}>
          <Icon name="check-circle" size={12} color={SUCCESS} type="material" />
          <Text style={[cf.acaoBtnTxt, { color:SUCCESS }]}>Fechou!</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cf.acaoBtn, { backgroundColor:DANGER+'18', borderColor:DANGER+'40', flex:1 }]}
          onPress={() => onPerder(orc.id)}
          activeOpacity={0.8}>
          <Icon name="cancel" size={12} color={DANGER} type="material" />
          <Text style={[cf.acaoBtnTxt, { color:DANGER }]}>Perdido</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cf.acaoBtn, { backgroundColor:BLUE+'18', borderColor:BLUE+'40' }]}
          onPress={() => onVerOrcamento(orc)}
          activeOpacity={0.8}>
          <Icon name="open-in-new" size={12} color={BLUE} type="material" />
          <Text style={[cf.acaoBtnTxt, { color:BLUE }]}>Ver</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const cf = StyleSheet.create({
  card      : { backgroundColor:CARD_BG, borderRadius:13, borderWidth:1, borderLeftWidth:4, borderColor:SILVER+'18', padding:12, marginBottom:8 },
  top       : { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:9 },
  cliente   : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  info      : { fontSize:10, color:SILVER_DARK, marginTop:2 },
  valor     : { fontSize:13, fontWeight:'900', color:GOLD, marginTop:3 },
  produtos  : { fontSize:10, color:SILVER, marginTop:2 },
  urgBadge  : { paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  urgTxt    : { fontSize:9, fontWeight:'900' },
  acoes     : { flexDirection:'row', gap:7 },
  acaoBtn   : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:7, borderRadius:9, borderWidth:1 },
  acaoBtnTxt: { fontSize:11, fontWeight:'800' },
});

// ════════════════════════════════════════════════════════════════
// SEÇÃO 2 — Card de reposição
// ════════════════════════════════════════════════════════════════
function CardReposicao({ alerta, onVerCliente }) {
  const urgCor = {
    atrasado: DANGER,
    hoje    : WARN,
    breve   : PURPLE,
  }[alerta.urgencia] || PURPLE;

  const urgIcon = {
    atrasado: 'warning',
    hoje    : 'schedule',
    breve   : 'autorenew',
  }[alerta.urgencia] || 'autorenew';

  let prazoTxt;
  if (alerta.urgencia === 'atrasado') {
    prazoTxt = `${Math.abs(alerta.diasRestantes)}d atrasado`;
  } else if (alerta.urgencia === 'hoje') {
    prazoTxt = 'repor hoje';
  } else {
    prazoTxt = `em ${alerta.diasRestantes}d`;
  }

  return (
    <TouchableOpacity
      style={[crp.card, { borderLeftColor: urgCor }]}
      onPress={() => onVerCliente(alerta)}
      activeOpacity={0.85}>
      <View style={[crp.iconWrap, { backgroundColor: urgCor + '18' }]}>
        <Icon name={urgIcon} size={16} color={urgCor} type="material" />
      </View>
      <View style={{ flex:1 }}>
        <Text style={crp.cliente} numberOfLines={1}>{alerta.clienteNome}</Text>
        <Text style={[crp.mensagem, { color: urgCor }]}>{alerta.mensagem}</Text>
        {alerta.ciclo > 0 && (
          <Text style={crp.detalhe}>
            {`Ciclo ~${alerta.ciclo}d · ${alerta.totalCompras} compra${alerta.totalCompras > 1 ? 's' : ''}`}
          </Text>
        )}
        {alerta.clienteTipo && (
          <Text style={crp.tipo}>{alerta.clienteTipo}{alerta.clienteCidade ? ` · ${alerta.clienteCidade}` : ''}</Text>
        )}
      </View>
      <View style={[crp.prazoBadge, { backgroundColor:urgCor+'18', borderColor:urgCor+'40' }]}>
        <Text style={[crp.prazoTxt, { color:urgCor }]}>{prazoTxt}</Text>
      </View>
    </TouchableOpacity>
  );
}
const crp = StyleSheet.create({
  card      : { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:CARD_BG, borderRadius:13, borderWidth:1, borderLeftWidth:4, borderColor:SILVER+'18', padding:12, marginBottom:8 },
  iconWrap  : { width:34, height:34, borderRadius:10, justifyContent:'center', alignItems:'center', flexShrink:0 },
  cliente   : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  mensagem  : { fontSize:11, fontWeight:'700', marginTop:2 },
  detalhe   : { fontSize:9, color:SILVER_DARK, marginTop:2 },
  tipo      : { fontSize:9, color:SILVER_DARK, marginTop:1, textTransform:'capitalize' },
  prazoBadge: { paddingHorizontal:8, paddingVertical:4, borderRadius:8, borderWidth:1, flexShrink:0 },
  prazoTxt  : { fontSize:9, fontWeight:'900' },
});

// ════════════════════════════════════════════════════════════════
// SEÇÃO 3 — Card de cliente parado
// ════════════════════════════════════════════════════════════════
function CardParado({ cliente, todasVisitas, onVerCliente }) {
  const dias    = getDiasSemCompra(cliente.id, todasVisitas);
  const diasCor =
    dias === null   ? DANGER :
    dias >= 60      ? DANGER :
    dias >= 30      ? WARN   : SILVER_DARK;

  const diasLabel =
    dias === null ? 'Nunca comprou' : `${dias} dias sem compra`;

  return (
    <TouchableOpacity
      style={[cpa.card, { borderLeftColor: diasCor }]}
      onPress={() => onVerCliente(cliente)}
      activeOpacity={0.85}>
      <View style={[cpa.diasWrap, { backgroundColor: diasCor + '18' }]}>
        <Text style={[cpa.diasNum, { color: diasCor }]}>
          {dias ?? '∞'}
        </Text>
        <Text style={[cpa.diasLabel, { color: diasCor }]}>dias</Text>
      </View>
      <View style={{ flex:1 }}>
        <Text style={cpa.nome} numberOfLines={1}>{cliente.nome}</Text>
        <Text style={[cpa.sub, { color: diasCor }]}>{diasLabel}</Text>
        {cliente.cidade && <Text style={cpa.cidade}>{cliente.cidade}</Text>}
        {cliente.tipo   && <Text style={cpa.tipo}>{cliente.tipo}</Text>}
      </View>
      <Icon name="chevron-right" size={18} color={SILVER_DARK} type="material" />
    </TouchableOpacity>
  );
}
const cpa = StyleSheet.create({
  card    : { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:CARD_BG, borderRadius:13, borderWidth:1, borderLeftWidth:4, borderColor:SILVER+'18', padding:12, marginBottom:8 },
  diasWrap: { width:46, height:46, borderRadius:12, justifyContent:'center', alignItems:'center', flexShrink:0 },
  diasNum : { fontSize:16, fontWeight:'900', lineHeight:18 },
  diasLabel:{ fontSize:8, fontWeight:'700', textAlign:'center' },
  nome    : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  sub     : { fontSize:11, fontWeight:'700', marginTop:2 },
  cidade  : { fontSize:9, color:SILVER_DARK, marginTop:2 },
  tipo    : { fontSize:9, color:SILVER_DARK, textTransform:'capitalize' },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function AlertaScreen({ navigation }) {
  const [todasVisitas,   setTodasVisitas]   = useState([]);
  const [todosClientes,  setTodosClientes]  = useState([]);

  // Seção 1 — Follow-ups
  const [followups,      setFollowups]      = useState([]);
  const [loadingFollowup,setLoadingFollowup]= useState(true);

  // Seção 2 — Reposições
  const [reposicoes,     setReposicoes]     = useState([]);
  const [loadingRep,     setLoadingRep]     = useState(true);

  // Seção 3 — Clientes parados
  const [parados,        setParados]        = useState([]);
  const [loadingParados, setLoadingParados] = useState(true);

  // Estado expandido por seção
  const [expandFollowup, setExpandFollowup] = useState(true);
  const [expandRep,      setExpandRep]      = useState(true);
  const [expandParados,  setExpandParados]  = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Carga principal ───────────────────────────────────────────
  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else {
      setLoadingFollowup(true);
      setLoadingRep(true);
      setLoadingParados(true);
    }

    let visOk  = [];
    let cltsOk = [];
    let orcsOk = [];

    // Carga base — bloco principal
    try {
      const [visitas, clientes, orcs] = await Promise.all([
        getTodasVisitas(),
        getTodosClientes(),
        getTodosOrcamentos(),
      ]);
      visOk  = visitas  || [];
      cltsOk = clientes || [];
      orcsOk = orcs     || [];

      setTodasVisitas(visOk);
      setTodosClientes(cltsOk);
    } catch (e) {
      console.log('[AlertaScreen] carga base:', e);
    }

    // ════════════════════════════════════════════════════════
    // [FIX 1] + [FIX 3] Follow-ups com normalização de status
    // ════════════════════════════════════════════════════════
    try {
      const orcsNorm = normalizarOrcamentos(orcsOk);
      const fu = getOrcamentosParaFollowup
        ? getOrcamentosParaFollowup(orcsNorm).filter(
            o => o.urgencia === 'atrasado' || o.urgencia === 'hoje'
          )
        : [];
      setFollowups(fu);
    } catch (e) {
      console.log('[AlertaScreen] followups:', e);
      setFollowups([]);
    } finally {
      setLoadingFollowup(false);
    }

    // ════════════════════════════════════════════════════════
    // [FIX 2] Reposições — bloco IA isolado
    // ════════════════════════════════════════════════════════
    try {
      const alertas = getAlertasReposicaoGlobal(cltsOk, visOk, 30);
      setReposicoes(alertas);
    } catch (e) {
      console.log('[AlertaScreen] reposições:', e);
      setReposicoes([]);
    } finally {
      setLoadingRep(false);
    }

    // ════════════════════════════════════════════════════════
    // [FIX 2] Clientes parados — isolado, não trava a tela
    // ════════════════════════════════════════════════════════
    try {
      const listParados = cltsOk
        .map(c => ({
          ...c,
          _dias: getDiasSemCompra(c.id, visOk),
        }))
        .filter(c => c._dias === null || c._dias >= 30)
        .sort((a, b) => {
          if (a._dias === null && b._dias !== null) return -1;
          if (a._dias !== null && b._dias === null) return 1;
          return (b._dias ?? 0) - (a._dias ?? 0);
        });
      setParados(listParados);
    } catch (e) {
      console.log('[AlertaScreen] parados:', e);
      setParados([]);
    } finally {
      setLoadingParados(false);
    }

    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers de orçamento ─────────────────────────────────────
  const handleAprovar = (id) => {
    Alert.alert('Confirmar', 'Marcar como APROVADO?', [
      { text:'Cancelar', style:'cancel' },
      { text:'Confirmar', onPress: async () => {
        try {
          await atualizarStatusOrcamento(id, 'aprovado');
          setFollowups(prev => prev.filter(o => o.id !== id));
        } catch (e) { Alert.alert('Erro','Não foi possível atualizar.'); }
      }},
    ]);
  };

  const handlePerder = (id) => {
    Alert.alert('Confirmar', 'Marcar como PERDIDO?', [
      { text:'Cancelar', style:'cancel' },
      { text:'Confirmar', onPress: async () => {
        try {
          await atualizarStatusOrcamento(id, 'perdido');
          setFollowups(prev => prev.filter(o => o.id !== id));
        } catch (e) { Alert.alert('Erro','Não foi possível atualizar.'); }
      }},
    ]);
  };

  const handleVerOrcamento = (orc) => {
    navigation?.navigate?.('Orcamentos', {
      cliente: { id: orc.clienteId, nome: orc.clienteNome },
    });
  };

  const handleVerCliente = (item) => {
    navigation?.navigate?.('ClienteDetalhe', {
      cliente: {
        id  : item.clienteId   || item.id,
        nome: item.clienteNome || item.nome,
        tipo: item.clienteTipo || item.tipo,
      },
    });
  };

  // ── KPIs globais ─────────────────────────────────────────────
  const totalAlertas =
    followups.length +
    reposicoes.filter(r => r.urgencia === 'atrasado' || r.urgencia === 'hoje').length +
    parados.filter(c => c._dias === null || c._dias >= 60).length;

  const loadingGeral = loadingFollowup && loadingRep && loadingParados && !refreshing;

  // ── Sub-listas de reposição ────────────────────────────────────
  const repAtrasadas = reposicoes.filter(r => r.urgencia === 'atrasado');
  const repHoje      = reposicoes.filter(r => r.urgencia === 'hoje');
  const repBreve     = reposicoes.filter(r => r.urgencia === 'breve');

  if (loadingGeral) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.loadingTxt}>Carregando alertas...</Text>
      </View>
    );
  }

  const semAlertas =
    followups.length === 0 &&
    reposicoes.length === 0 &&
    parados.length === 0 &&
    !loadingFollowup && !loadingRep && !loadingParados;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

      {/* ══ HEADER ══ */}
      <View style={s.header}>
        <View style={s.headerAccent} />
        <View style={s.headerRow}>
          <View style={s.headerIconWrap}>
            <Icon name="notifications-active" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={s.titulo}>Alertas</Text>
            <Text style={s.sub}>Central de notificações</Text>
          </View>
          {totalAlertas > 0 && (
            <View style={s.totalBadge}>
              <Text style={s.totalBadgeTxt}>{totalAlertas}</Text>
            </View>
          )}
          <TouchableOpacity style={s.iconBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>

        {/* KPIs do header */}
        <View style={s.kpiRow}>
          <View style={[s.kpiItem, { borderColor:DANGER+'35' }]}>
            <Icon name="notifications-active" size={12} color={DANGER} type="material" />
            <Text style={[s.kpiVal, { color:DANGER }]}>{followups.filter(o => o.urgencia === 'atrasado').length}</Text>
            <Text style={s.kpiLabel}>Follow-up{'\n'}atrasado</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:WARN+'35' }]}>
            <Icon name="schedule" size={12} color={WARN} type="material" />
            <Text style={[s.kpiVal, { color:WARN }]}>{followups.filter(o => o.urgencia === 'hoje').length}</Text>
            <Text style={s.kpiLabel}>Follow-up{'\n'}hoje</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:DANGER+'35' }]}>
            <Icon name="inventory" size={12} color={DANGER} type="material" />
            <Text style={[s.kpiVal, { color:DANGER }]}>{repAtrasadas.length}</Text>
            <Text style={s.kpiLabel}>Reposição{'\n'}atrasada</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:WARN+'35' }]}>
            <Icon name="autorenew" size={12} color={WARN} type="material" />
            <Text style={[s.kpiVal, { color:WARN }]}>{repHoje.length + repBreve.length}</Text>
            <Text style={s.kpiLabel}>Reposição{'\n'}próxima</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:DANGER+'35' }]}>
            <Icon name="block" size={12} color={DANGER} type="material" />
            <Text style={[s.kpiVal, { color:DANGER }]}>{parados.filter(c => c._dias === null || c._dias >= 60).length}</Text>
            <Text style={s.kpiLabel}>Parados{'\n'}≥60d</Text>
          </View>
        </View>
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => carregar(true)}
            tintColor={GOLD}
            colors={[GOLD]}
          />
        }>

        {/* ══ Estado vazio geral ══ */}
        {semAlertas && (
          <View style={s.vazio}>
            <Icon name="check-circle" size={56} color={SUCCESS + '60'} type="material" />
            <Text style={s.vazioTitulo}>Tudo em dia!</Text>
            <Text style={s.vazioSub}>Nenhum alerta no momento. Puxe para atualizar.</Text>
          </View>
        )}

        {/* ══ SEÇÃO 1 — FOLLOW-UPS URGENTES ══ */}
        <SecaoHeader
          icon="notifications-active"
          titulo="Follow-ups urgentes"
          sub={followups.length > 0
            ? `${followups.filter(o=>o.urgencia==='atrasado').length} atrasado(s) · ${followups.filter(o=>o.urgencia==='hoje').length} hoje`
            : 'Nenhum follow-up pendente'}
          cor={followups.some(o => o.urgencia === 'atrasado') ? DANGER : WARN}
          qtd={followups.length}
          expandido={expandFollowup}
          onToggle={() => setExpandFollowup(e => !e)}
          loading={loadingFollowup}
        />

        {expandFollowup && !loadingFollowup && (
          followups.length === 0 ? (
            <View style={s.secaoVazio}>
              <Icon name="check-circle" size={22} color={SUCCESS + '60'} type="material" />
              <Text style={s.secaoVazioTxt}>Nenhum follow-up atrasado</Text>
            </View>
          ) : (
            followups.map((orc, i) => (
              <CardFollowup
                key={orc.id || i}
                orc={orc}
                onAprovar={handleAprovar}
                onPerder={handlePerder}
                onVerOrcamento={handleVerOrcamento}
              />
            ))
          )
        )}

        <View style={s.separador} />

        {/* ══ SEÇÃO 2 — REPOSIÇÕES URGENTES ══ */}
        <SecaoHeader
          icon="inventory"
          titulo="Reposições previstas"
          sub={reposicoes.length > 0
            ? `${repAtrasadas.length} atrasada(s) · ${repHoje.length} hoje · ${repBreve.length} em breve`
            : 'Nenhuma reposição pendente'}
          cor={repAtrasadas.length > 0 ? DANGER : repHoje.length > 0 ? WARN : PURPLE}
          qtd={reposicoes.length}
          expandido={expandRep}
          onToggle={() => setExpandRep(e => !e)}
          loading={loadingRep}
        />

        {expandRep && !loadingRep && (
          reposicoes.length === 0 ? (
            <View style={s.secaoVazio}>
              <Icon name="check-circle" size={22} color={SUCCESS + '60'} type="material" />
              <Text style={s.secaoVazioTxt}>Nenhuma reposição pendente</Text>
            </View>
          ) : (
            <>
              {/* Atrasadas primeiro */}
              {repAtrasadas.length > 0 && (
                <Text style={[s.subSecaoTitulo, { color:DANGER }]}>Atrasadas</Text>
              )}
              {repAtrasadas.map((alerta, i) => (
                <CardReposicao
                  key={`rep-atr-${i}`}
                  alerta={alerta}
                  onVerCliente={handleVerCliente}
                />
              ))}
              {/* Hoje */}
              {repHoje.length > 0 && (
                <Text style={[s.subSecaoTitulo, { color:WARN }]}>Repor hoje</Text>
              )}
              {repHoje.map((alerta, i) => (
                <CardReposicao
                  key={`rep-hoje-${i}`}
                  alerta={alerta}
                  onVerCliente={handleVerCliente}
                />
              ))}
              {/* Em breve */}
              {repBreve.length > 0 && (
                <Text style={[s.subSecaoTitulo, { color:PURPLE }]}>Em breve</Text>
              )}
              {repBreve.map((alerta, i) => (
                <CardReposicao
                  key={`rep-breve-${i}`}
                  alerta={alerta}
                  onVerCliente={handleVerCliente}
                />
              ))}
            </>
          )
        )}

        <View style={s.separador} />

        {/* ══ SEÇÃO 3 — CLIENTES PARADOS ══ */}
        <SecaoHeader
          icon="block"
          titulo="Clientes parados"
          sub={parados.length > 0
            ? `${parados.filter(c => c._dias === null).length} nunca compraram · ${parados.filter(c => c._dias !== null && c._dias >= 60).length} parados ≥60d`
            : 'Todos compraram recentemente'}
          cor={parados.some(c => c._dias === null || c._dias >= 60) ? DANGER : WARN}
          qtd={parados.length}
          expandido={expandParados}
          onToggle={() => setExpandParados(e => !e)}
          loading={loadingParados}
        />

        {expandParados && !loadingParados && (
          parados.length === 0 ? (
            <View style={s.secaoVazio}>
              <Icon name="check-circle" size={22} color={SUCCESS + '60'} type="material" />
              <Text style={s.secaoVazioTxt}>Todos os clientes compraram recentemente</Text>
            </View>
          ) : (
            parados.map((c, i) => (
              <CardParado
                key={c.id || i}
                cliente={c}
                todasVisitas={todasVisitas}
                onVerCliente={(item) =>
                  navigation?.navigate?.('ClienteDetalhe', { cliente: item })
                }
              />
            ))
          )
        )}

        <View style={{ height:80 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ── STYLES ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container  : { flex:1, backgroundColor:DARK_BG },
  loading    : { flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center', gap:12 },
  loadingTxt : { color:SILVER, fontSize:14, fontWeight:'600' },
  scroll     : { paddingHorizontal:16, paddingTop:14 },

  header         : { backgroundColor:'#001828', borderBottomLeftRadius:24, borderBottomRightRadius:24, overflow:'hidden', elevation:10, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.15, shadowRadius:14 },
  headerAccent   : { height:3, backgroundColor:DANGER },
  headerRow      : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingTop:48, paddingBottom:10 },
  headerIconWrap : { width:42, height:42, borderRadius:14, backgroundColor:DANGER, justifyContent:'center', alignItems:'center' },
  titulo         : { fontSize:18, fontWeight:'900', color:SILVER_LIGHT },
  sub            : { fontSize:11, color:SILVER_DARK, marginTop:1 },
  iconBtn        : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  totalBadge     : { backgroundColor:DANGER, borderRadius:12, paddingHorizontal:10, paddingVertical:4 },
  totalBadgeTxt  : { fontSize:14, fontWeight:'900', color:'#fff' },

  kpiRow     : { flexDirection:'row', paddingHorizontal:12, paddingBottom:14, gap:6 },
  kpiItem    : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:12, paddingVertical:8, gap:2, borderWidth:1 },
  kpiVal     : { fontSize:18, fontWeight:'900' },
  kpiLabel   : { fontSize:7, color:SILVER_DARK, fontWeight:'700', textAlign:'center', lineHeight:10 },

  separador    : { height:1, backgroundColor:SILVER+'12', marginVertical:10 },
  subSecaoTitulo: { fontSize:11, fontWeight:'800', color:SILVER_DARK, marginBottom:6, marginTop:4, letterSpacing:0.3, textTransform:'uppercase' },

  secaoVazio   : { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:12, paddingHorizontal:4, marginBottom:8 },
  secaoVazioTxt: { fontSize:12, color:SILVER_DARK, fontStyle:'italic' },

  vazio        : { alignItems:'center', paddingVertical:60, gap:12 },
  vazioTitulo  : { fontSize:20, fontWeight:'900', color:SILVER_LIGHT },
  vazioSub     : { fontSize:13, color:SILVER_DARK, textAlign:'center', paddingHorizontal:30 },
});