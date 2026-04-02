// screens/CRMScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated, Platform,
  RefreshControl, TextInput, Dimensions,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { getTodosClientes }  from '../services/clienteService';
import { getTodasVisitas }   from '../services/visitaService';

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

// ════════════════════════════════════════════════════════════════
// CATEGORIAS DE CLASSIFICAÇÃO
// ════════════════════════════════════════════════════════════════
const CATEGORIAS = {
  quente    : { key:'quente',     label:'Quentes',        emoji:'🔥', cor:DANGER,      icon:'local-fire-department', desc:'Compraram nos últimos 7 dias'          },
  reposicao : { key:'reposicao',  label:'Reposição',      emoji:'📦', cor:BLUE,        icon:'inventory',             desc:'Janela ideal: 15–25 dias da compra'    },
  parado    : { key:'parado',     label:'Parados',        emoji:'⚠️', cor:WARN,        icon:'warning',               desc:'Sem compra há mais de 30 dias'         },
  semvisita : { key:'semvisita',  label:'Sem visita',     emoji:'🚫', cor:PURPLE,      icon:'event-busy',            desc:'Nunca visitados ou +45 dias sem contato'},
  telefone  : { key:'telefone',   label:'Telefone',       emoji:'📞', cor:SUCCESS,     icon:'phone-in-talk',         desc:'Último contato foi por telefone'       },
  novos     : { key:'novos',      label:'Novos',          emoji:'⭐', cor:GOLD,        icon:'star',                  desc:'Cadastrados nos últimos 30 dias'       },
  regular   : { key:'regular',    label:'Regulares',      emoji:'✅', cor:SILVER_DARK, icon:'check-circle',          desc:'Visitados recentemente e ativos'       },
};

// ════════════════════════════════════════════════════════════════
// 1. FUNÇÃO PRINCIPAL: classificarClientes()
// ════════════════════════════════════════════════════════════════
/**
 * Classifica cada cliente em uma ou mais categorias CRM
 * baseado no histórico real de visitas e compras.
 *
 * Retorna: { quente:[], reposicao:[], parado:[], semvisita:[], telefone:[], novos:[], regular:[] }
 * Cada cliente inclui métricas calculadas: diasSemCompra, diasSemVisita, ticketMedio, etc.
 */
function classificarClientes(clientes, todasVisitas) {
  const hoje = new Date();

  const resultado = {
    quente   : [],
    reposicao: [],
    parado   : [],
    semvisita: [],
    telefone : [],
    novos    : [],
    regular  : [],
  };

  clientes.forEach(c => {
    // ── Histórico completo do cliente ────────────────────────
    const historico = todasVisitas
      .filter(v => v.clienteId === c.id)
      .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));

    const compras = historico.filter(v => v.resultado === 'comprou');

    // ── Métricas calculadas ──────────────────────────────────
    const ultimaVisitaObj = historico[0] ?? null;
    const ultimaCompraObj = compras[0]   ?? null;

    const diasSemVisita = ultimaVisitaObj
      ? Math.floor((hoje - new Date(ultimaVisitaObj.dataLocal || 0)) / 86400000)
      : null; // null = nunca visitado

    const diasSemCompra = ultimaCompraObj
      ? Math.floor((hoje - new Date(ultimaCompraObj.dataLocal || 0)) / 86400000)
      : null;

    const ticketMedio = compras.length > 0
      ? compras.reduce((s, v) => s + (v.valor || 0), 0) / compras.length
      : 0;

    const valorTotal = compras.reduce((s, v) => s + (v.valor || 0), 0);

    const taxaConversao = historico.length > 0
      ? Math.round((compras.length / historico.length) * 100)
      : 0;

    const ultimoTipo = ultimaVisitaObj?.tipoRegistro ?? null;

    // Data de cadastro do cliente (se existir)
    const diasCadastro = c.criadoEm
      ? Math.floor((hoje - new Date(c.criadoEm)) / 86400000)
      : null;

    // ── Objeto enriquecido ────────────────────────────────────
    const clienteEnriquecido = {
      ...c,
      diasSemVisita,
      diasSemCompra,
      ticketMedio,
      valorTotal,
      taxaConversao,
      totalCompras : compras.length,
      totalVisitas : historico.length,
      ultimoTipo,
      ultimaVisitaData: ultimaVisitaObj?.dataLocal ?? null,
      ultimaCompraData: ultimaCompraObj?.dataLocal ?? null,
    };

    // ═══════════════════════════════════════════════════════════
    // REGRAS DE CLASSIFICAÇÃO (ordem de prioridade)
    // ═══════════════════════════════════════════════════════════

    // 🔥 QUENTE — comprou nos últimos 7 dias
    if (diasSemCompra !== null && diasSemCompra <= 7) {
      resultado.quente.push(clienteEnriquecido);
      return;
    }

    // ⭐ NOVO — cadastrado há menos de 30 dias e nunca comprou
    if (diasCadastro !== null && diasCadastro <= 30 && compras.length === 0) {
      resultado.novos.push(clienteEnriquecido);
      return;
    }

    // 🚫 SEM VISITA — nunca visitado ou +45 dias sem contato
    if (diasSemVisita === null || diasSemVisita > 45) {
      resultado.semvisita.push(clienteEnriquecido);
      return;
    }

    // ⚠️ PARADO — mais de 30 dias sem comprar
    if (diasSemCompra !== null && diasSemCompra > 30) {
      resultado.parado.push(clienteEnriquecido);
      return;
    }

    // 📦 REPOSIÇÃO — entre 15 e 25 dias da última compra (janela ideal)
    if (diasSemCompra !== null && diasSemCompra >= 15 && diasSemCompra <= 25) {
      resultado.reposicao.push(clienteEnriquecido);
      return;
    }

    // 📞 TELEFONE — último contato foi por telefone
    if (ultimoTipo === 'telefone') {
      resultado.telefone.push(clienteEnriquecido);
      return;
    }

    // ✅ REGULAR — ativo e sem outra classificação especial
    resultado.regular.push(clienteEnriquecido);
  });

  // Ordena cada categoria por ticket médio DESC (maiores clientes primeiro)
  Object.keys(resultado).forEach(key => {
    resultado[key].sort((a, b) => b.ticketMedio - a.ticketMedio);
  });

  return resultado;
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════
function formatReal(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function formatResumo(v) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${formatReal(v)}`;
}

function formatData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
  } catch { return '—'; }
}

// ════════════════════════════════════════════════════════════════
// Componentes visuais
// ════════════════════════════════════════════════════════════════

// ── ShimmerLine ─────────────────────────────────────────────────
function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver: Platform.OS !== 'web' })
    ).start();
  }, []);
  return (
    <View style={{ height:2, width:'100%', backgroundColor: color+'25', overflow:'hidden' }}>
      <Animated.View style={{
        position:'absolute', height:'100%', width:80,
        backgroundColor: color+'BB',
        transform:[{ translateX: anim.interpolate({ inputRange:[0,1], outputRange:[-80, SW] }) }],
      }} />
    </View>
  );
}

// ── Cards de categoria no topo ───────────────────────────────────
function CategoriaCard({ cat, count, ativo, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue:0.93, duration:80, useNativeDriver:true }),
      Animated.timing(scaleAnim, { toValue:1,    duration:80, useNativeDriver:true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform:[{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[cc.card,
          { borderColor: ativo ? cat.cor : cat.cor+'30' },
          ativo && { backgroundColor: cat.cor+'18' },
        ]}
        onPress={handlePress}
        activeOpacity={0.85}>
        <Text style={cc.emoji}>{cat.emoji}</Text>
        <Text style={[cc.count, { color: ativo ? cat.cor : SILVER_LIGHT }]}>{count}</Text>
        <Text style={[cc.label, { color: ativo ? cat.cor : SILVER_DARK }]}>{cat.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
const cc = StyleSheet.create({
  card  : { width:82, alignItems:'center', backgroundColor:CARD_BG, borderRadius:16, paddingVertical:12, paddingHorizontal:8, borderWidth:1.5, marginRight:8, gap:3 },
  emoji : { fontSize:20 },
  count : { fontSize:20, fontWeight:'900' },
  label : { fontSize:10, fontWeight:'700', textAlign:'center' },
});

// ── Card de cliente CRM ──────────────────────────────────────────
function ClienteCRMCard({ cliente, cat, idx, onCheckin, onHistorico }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const delay = Math.min(idx * 50, 300);
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue:1, duration:280, useNativeDriver:true }),
        Animated.timing(slideAnim, { toValue:0, duration:280, useNativeDriver:true }),
      ]).start();
    }, delay);
  }, []);

  const cor = cat.cor;

  return (
    <Animated.View style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }}>
      <View style={[clc.card, { borderLeftColor:cor, borderColor:cor+'22' }]}>

        {/* Linha 1: Avatar + Nome + Badge categoria */}
        <View style={clc.topRow}>
          <View style={[clc.avatar, { backgroundColor:cor+'20', borderColor:cor+'40' }]}>
            <Text style={[clc.avatarTxt, { color:cor }]}>
              {(cliente.nome || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex:1 }}>
            <Text style={clc.nome} numberOfLines={1}>{cliente.nome}</Text>
            <Text style={clc.cidade} numberOfLines={1}>
              {[cliente.cidade, cliente.tipo].filter(Boolean).join(' · ') || '—'}
            </Text>
          </View>
          <View style={[clc.catBadge, { backgroundColor:cor+'15', borderColor:cor+'40' }]}>
            <Text style={[clc.catBadgeTxt, { color:cor }]}>{cat.emoji} {cat.label}</Text>
          </View>
        </View>

        {/* Linha 2: Métricas rápidas */}
        <View style={clc.metricsRow}>
          <View style={clc.metricItem}>
            <Icon name="shopping-cart" size={11} color={SILVER_DARK} type="material" />
            <Text style={clc.metricLabel}>Última compra</Text>
            <Text style={[clc.metricValue, {
              color: cliente.diasSemCompra !== null && cliente.diasSemCompra <= 7 ? SUCCESS : SILVER_LIGHT,
            }]}>
              {cliente.diasSemCompra !== null
                ? cliente.diasSemCompra === 0 ? 'Hoje'
                : `${cliente.diasSemCompra}d atrás`
                : '—'}
            </Text>
          </View>

          <View style={clc.divV} />

          <View style={clc.metricItem}>
            <Icon name="attach-money" size={11} color={SILVER_DARK} type="material" />
            <Text style={clc.metricLabel}>Ticket médio</Text>
            <Text style={[clc.metricValue, { color: cliente.ticketMedio > 0 ? SUCCESS : SILVER_DARK }]}>
              {cliente.ticketMedio > 0 ? formatResumo(cliente.ticketMedio) : '—'}
            </Text>
          </View>

          <View style={clc.divV} />

          <View style={clc.metricItem}>
            <Icon name="show-chart" size={11} color={SILVER_DARK} type="material" />
            <Text style={clc.metricLabel}>Conversão</Text>
            <Text style={[clc.metricValue, {
              color: cliente.taxaConversao >= 50 ? SUCCESS : cliente.taxaConversao > 0 ? WARN : SILVER_DARK,
            }]}>
              {cliente.totalVisitas > 0 ? `${cliente.taxaConversao}%` : '—'}
            </Text>
          </View>

          <View style={clc.divV} />

          <View style={clc.metricItem}>
            <Icon name="check-circle" size={11} color={SILVER_DARK} type="material" />
            <Text style={clc.metricLabel}>Compras</Text>
            <Text style={clc.metricValue}>{cliente.totalCompras}</Text>
          </View>
        </View>

        {/* Linha 3: Valor total (se tiver) + canal */}
        {(cliente.valorTotal > 0 || cliente.ultimoTipo) && (
          <View style={clc.infoRow}>
            {cliente.valorTotal > 0 && (
              <View style={clc.infoChip}>
                <Icon name="paid" size={11} color={GOLD} type="material" />
                <Text style={[clc.infoChipTxt, { color:GOLD }]}>
                  {`Total: ${formatResumo(cliente.valorTotal)}`}
                </Text>
              </View>
            )}
            {cliente.ultimoTipo === 'telefone' && (
              <View style={[clc.infoChip, { backgroundColor:BLUE+'15', borderColor:BLUE+'30' }]}>
                <Icon name="phone-in-talk" size={11} color={BLUE} type="material" />
                <Text style={[clc.infoChipTxt, { color:BLUE }]}>Telefone</Text>
              </View>
            )}
            {cliente.ultimaVisitaData && (
              <View style={clc.infoChip}>
                <Icon name="schedule" size={11} color={SILVER_DARK} type="material" />
                <Text style={clc.infoChipTxt}>
                  {`Última visita: ${formatData(cliente.ultimaVisitaData)}`}
                </Text>
              </View>
            )}
            {cliente.diasSemVisita === null && (
              <View style={[clc.infoChip, { backgroundColor:DANGER+'12', borderColor:DANGER+'30' }]}>
                <Icon name="new-releases" size={11} color={DANGER} type="material" />
                <Text style={[clc.infoChipTxt, { color:DANGER }]}>Nunca visitado</Text>
              </View>
            )}
          </View>
        )}

        {/* Botões */}
        <View style={clc.botoesRow}>
          <TouchableOpacity style={clc.btnHistorico} onPress={onHistorico} activeOpacity={0.8}>
            <Icon name="history" size={13} color={SILVER_DARK} type="material" />
            <Text style={clc.btnHistoricoTxt}>Histórico</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[clc.btnCheckin, { backgroundColor:cor, shadowColor:cor }]}
            onPress={onCheckin}
            activeOpacity={0.85}>
            <Icon name="pin-drop" size={13} color={DARK_BG} type="material" />
            <Text style={clc.btnCheckinTxt}>Check-in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}
const clc = StyleSheet.create({
  card         : { backgroundColor:CARD_BG, borderRadius:18, borderWidth:1, borderLeftWidth:4, marginBottom:10, padding:14 },
  topRow       : { flexDirection:'row', alignItems:'center', gap:10, marginBottom:10 },
  avatar       : { width:40, height:40, borderRadius:13, borderWidth:1, justifyContent:'center', alignItems:'center' },
  avatarTxt    : { fontSize:17, fontWeight:'900' },
  nome         : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  cidade       : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  catBadge     : { paddingHorizontal:9, paddingVertical:4, borderRadius:10, borderWidth:1 },
  catBadgeTxt  : { fontSize:10, fontWeight:'800' },
  metricsRow   : { flexDirection:'row', backgroundColor:CARD_BG2, borderRadius:12, padding:10, marginBottom:8 },
  metricItem   : { flex:1, alignItems:'center', gap:3 },
  metricLabel  : { fontSize:9, color:SILVER_DARK, fontWeight:'600' },
  metricValue  : { fontSize:12, fontWeight:'800', color:SILVER_LIGHT },
  divV         : { width:1, backgroundColor:SILVER+'15', marginVertical:2 },
  infoRow      : { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
  infoChip     : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:8, backgroundColor:CARD_BG2, borderWidth:1, borderColor:SILVER+'18' },
  infoChipTxt  : { fontSize:10, color:SILVER_DARK, fontWeight:'600' },
  botoesRow    : { flexDirection:'row', gap:8 },
  btnHistorico : { flex:0.42, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:8, borderRadius:12, borderWidth:1, borderColor:SILVER+'20', backgroundColor:CARD_BG2 },
  btnHistoricoTxt:{ fontSize:12, fontWeight:'700', color:SILVER_DARK },
  btnCheckin   : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:8, borderRadius:12, elevation:3, shadowOffset:{width:0,height:2}, shadowOpacity:0.35, shadowRadius:5 },
  btnCheckinTxt: { fontSize:12, fontWeight:'bold', color:DARK_BG },
});

// ── Resumo CRM (Funil) ───────────────────────────────────────────
function FunilCRM({ grupos }) {
  const total = Object.values(grupos).reduce((s, arr) => s + arr.length, 0);
  if (total === 0) return null;
  return (
    <View style={fu.card}>
      <View style={fu.header}>
        <Icon name="filter-alt" size={14} color={GOLD} type="material" />
        <Text style={fu.titulo}>Funil de Clientes</Text>
        <Text style={fu.total}>{total} total</Text>
      </View>
      {Object.entries(CATEGORIAS).map(([key, cat]) => {
        const count = grupos[key]?.length ?? 0;
        if (!count) return null;
        const pct = Math.round((count / total) * 100);
        return (
          <View key={key} style={fu.row}>
            <Text style={fu.emoji}>{cat.emoji}</Text>
            <View style={{ flex:1, gap:3 }}>
              <View style={fu.labelRow}>
                <Text style={fu.label}>{cat.label}</Text>
                <Text style={[fu.count, { color:cat.cor }]}>{count}</Text>
              </View>
              <View style={fu.track}>
                <View style={[fu.fill, { width:`${pct}%`, backgroundColor:cat.cor }]} />
              </View>
            </View>
            <Text style={[fu.pct, { color:cat.cor }]}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}
const fu = StyleSheet.create({
  card    : { marginHorizontal:16, marginBottom:16, backgroundColor:CARD_BG, borderRadius:18, padding:16, borderWidth:1, borderColor:GOLD+'25' },
  header  : { flexDirection:'row', alignItems:'center', gap:8, marginBottom:14 },
  titulo  : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT, flex:1 },
  total   : { fontSize:12, color:SILVER_DARK, fontWeight:'600' },
  row     : { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  emoji   : { fontSize:16, width:22, textAlign:'center' },
  labelRow: { flexDirection:'row', justifyContent:'space-between' },
  label   : { fontSize:12, fontWeight:'700', color:SILVER_LIGHT },
  count   : { fontSize:12, fontWeight:'800' },
  track   : { height:6, backgroundColor:CARD_BG2, borderRadius:3, overflow:'hidden' },
  fill    : { height:'100%', borderRadius:3 },
  pct     : { fontSize:11, fontWeight:'800', width:32, textAlign:'right' },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function CRMScreen({ navigation }) {
  const [clientes,     setClientes]     = useState([]);
  const [todasVisitas, setTodasVisitas] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState('quente');
  const [busca,        setBusca]        = useState('');
  const [mostrarBusca, setMostrarBusca] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const buscaAnim = useRef(new Animated.Value(0)).current;

  // ── Carga ─────────────────────────────────────────────────────
  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    try {
      const [clts, visitas] = await Promise.all([
        getTodosClientes(),
        getTodasVisitas(),
      ]);
      setClientes(clts);
      setTodasVisitas(visitas);
    } catch (e) {
      console.log('[CRM] erro:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:450, useNativeDriver:true }),
      Animated.timing(slideAnim, { toValue:0, duration:450, useNativeDriver:true }),
    ]).start();
  }, []);

  // Animação da barra de busca
  const toggleBusca = () => {
    const toValue = mostrarBusca ? 0 : 1;
    if (!mostrarBusca) setBusca('');
    setMostrarBusca(!mostrarBusca);
    Animated.timing(buscaAnim, { toValue, duration:220, useNativeDriver:false }).start();
  };

  // ── Classificação ─────────────────────────────────────────────
  const grupos = classificarClientes(clientes, todasVisitas);

  // Filtra por busca dentro da categoria ativa
  const listaAtiva = (grupos[categoriaAtiva] || []).filter(c => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      c.nome?.toLowerCase().includes(q) ||
      c.cidade?.toLowerCase().includes(q)
    );
  });

  const catAtual = CATEGORIAS[categoriaAtiva];
  const totalClientes = Object.values(grupos).reduce((s, a) => s + a.length, 0);
  const urgentes = (grupos.semvisita?.length || 0) + (grupos.parado?.length || 0);

  if (loading) {
    return (
      <View style={{ flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center' }}>
        <View style={ds.loadingIconWrap}>
          <Icon name="psychology" size={32} color={GOLD} type="material" />
        </View>
        <Text style={{ color:SILVER, fontSize:14, fontWeight:'600', marginTop:16 }}>
          Analisando clientes...
        </Text>
        <Text style={{ color:SILVER_DARK, fontSize:11, marginTop:4 }}>
          Classificando por comportamento de compra
        </Text>
        <ActivityIndicator color={GOLD} style={{ marginTop:16 }} />
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
            <Icon name="psychology" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={ds.headerTitulo}>CRM Inteligente</Text>
            <Text style={ds.headerSub}>
              {`${totalClientes} clientes classificados`}
              {urgentes > 0 ? ` · ${urgentes} precisam de atenção` : ''}
            </Text>
          </View>

          <TouchableOpacity style={ds.iconBtn} onPress={toggleBusca} activeOpacity={0.8}>
            <Icon
              name={mostrarBusca ? 'close' : 'search'}
              size={18}
              color={mostrarBusca ? GOLD : SILVER_DARK}
              type="material" />
          </TouchableOpacity>
          <TouchableOpacity style={ds.iconBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>

        {/* Barra de busca animada */}
        <Animated.View style={{
          height: buscaAnim.interpolate({ inputRange:[0,1], outputRange:[0, 52] }),
          overflow:'hidden',
          paddingHorizontal:16,
        }}>
          <View style={ds.searchWrap}>
            <Icon name="search" size={16} color={SILVER_DARK} type="material" />
            <TextInput
              style={ds.searchInput}
              placeholder={`Buscar em ${catAtual?.label || ''}...`}
              placeholderTextColor={SILVER_DARK}
              value={busca}
              onChangeText={setBusca}
              autoFocus={mostrarBusca}
            />
            {busca.length > 0 && (
              <TouchableOpacity onPress={() => setBusca('')}>
                <Icon name="close" size={16} color={SILVER_DARK} type="material" />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        <ShimmerLine color={GOLD} />
      </View>

      <Animated.ScrollView
        style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }}
        contentContainerStyle={ds.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => carregar(true)}
            tintColor={GOLD}
            colors={[GOLD]}
          />
        }>

        {/* ══ FUNIL ══ */}
        <FunilCRM grupos={grupos} />

        {/* ══ CHIPS DE CATEGORIA ══ */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={ds.categoriasRow}>
          {Object.values(CATEGORIAS).map(cat => (
            <CategoriaCard
              key={cat.key}
              cat={cat}
              count={grupos[cat.key]?.length ?? 0}
              ativo={categoriaAtiva === cat.key}
              onPress={() => { setCategoriaAtiva(cat.key); setBusca(''); }}
            />
          ))}
        </ScrollView>

        {/* ══ HEADER DA CATEGORIA ATIVA ══ */}
        {catAtual && (
          <View style={ds.catHeaderRow}>
            <View style={[ds.catHeaderIcon, { backgroundColor: catAtual.cor+'18' }]}>
              <Icon name={catAtual.icon} size={16} color={catAtual.cor} type="material" />
            </View>
            <View style={{ flex:1 }}>
              <Text style={ds.catHeaderTitulo}>
                {`${catAtual.emoji} ${catAtual.label}`}
                <Text style={[ds.catHeaderCount, { color:catAtual.cor }]}>
                  {`  ${listaAtiva.length} cliente${listaAtiva.length !== 1 ? 's' : ''}`}
                </Text>
              </Text>
              <Text style={ds.catHeaderDesc}>{catAtual.desc}</Text>
            </View>
          </View>
        )}

        {/* ══ LISTA ══ */}
        <View style={ds.listaWrap}>
          {listaAtiva.length === 0 ? (
            <View style={ds.emptyWrap}>
              <Text style={ds.emptyEmoji}>{busca ? '🔍' : '🎉'}</Text>
              <Text style={ds.emptyTitulo}>
                {busca
                  ? `Nenhum resultado para "${busca}"`
                  : `Nenhum cliente ${catAtual?.label?.toLowerCase()}`}
              </Text>
              <Text style={ds.emptyTxt}>
                {busca ? 'Tente outro termo' : 'Isso é uma boa notícia! 👍'}
              </Text>
            </View>
          ) : (
            listaAtiva.map((c, idx) => (
              <ClienteCRMCard
                key={c.id}
                cliente={c}
                cat={catAtual}
                idx={idx}
                onCheckin={() => navigation?.navigate?.('Checkin', { cliente:c })}
                onHistorico={() => navigation?.navigate?.('HistoricoCliente', { cliente:c })}
              />
            ))
          )}
        </View>

        <View style={{ height:90 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════
const ds = StyleSheet.create({
  container      : { flex:1, backgroundColor:DARK_BG },
  scroll         : { paddingTop:12, paddingBottom:40 },
  loadingIconWrap: { width:72, height:72, borderRadius:24, backgroundColor:CARD_BG, borderWidth:1, borderColor:GOLD+'40', justifyContent:'center', alignItems:'center' },

  // Header
  header        : { backgroundColor:'#001828', borderBottomLeftRadius:24, borderBottomRightRadius:24, overflow:'hidden', elevation:10, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.15, shadowRadius:14 },
  headerAccent  : { height:3, backgroundColor:GOLD },
  headerRow     : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingTop:48, paddingBottom:10 },
  headerIconWrap: { width:42, height:42, borderRadius:14, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  headerTitulo  : { fontSize:18, fontWeight:'bold', color:SILVER_LIGHT },
  headerSub     : { fontSize:11, color:SILVER_DARK, marginTop:1 },
  iconBtn       : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },

  // Busca
  searchWrap  : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG2, borderRadius:12, paddingHorizontal:12, gap:8, marginVertical:6, borderWidth:1, borderColor:SILVER+'20' },
  searchInput : { flex:1, color:SILVER_LIGHT, fontSize:14, paddingVertical:10 },

  // Categorias
  categoriasRow : { paddingHorizontal:16, paddingVertical:10, flexDirection:'row', marginBottom:4 },

  // Header categoria ativa
  catHeaderRow  : { flexDirection:'row', alignItems:'center', gap:10, marginHorizontal:16, marginBottom:12, backgroundColor:CARD_BG, borderRadius:14, padding:12, borderWidth:1, borderColor:SILVER+'15' },
  catHeaderIcon : { width:38, height:38, borderRadius:12, justifyContent:'center', alignItems:'center' },
  catHeaderTitulo:{ fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  catHeaderCount : { fontSize:13, fontWeight:'700' },
  catHeaderDesc  : { fontSize:11, color:SILVER_DARK, marginTop:2 },

  // Lista
  listaWrap    : { paddingHorizontal:16 },
  emptyWrap    : { alignItems:'center', paddingVertical:50, gap:8 },
  emptyEmoji   : { fontSize:48 },
  emptyTitulo  : { fontSize:16, fontWeight:'bold', color:SILVER, textAlign:'center' },
  emptyTxt     : { fontSize:12, color:SILVER_DARK, textAlign:'center' },
});