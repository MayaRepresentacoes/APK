// screens/RotasScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 10 — ROTAS INTELIGENTES
//
// Checklist:
//   ✅ Agrupar por cidade  — getClientesPorCidade() + getEstatisticasCidade()
//   ✅ Priorizar clientes  — gerarRotaInteligenteIA() + getClientesPrioritarios()
//   ✅ Abrir rota Maps     — abrirGoogleMapsRota() + abrirWazeRota()
//
// Dois modos na mesma tela:
//   MODO IA     — recebe clientes via route.params (vindo do PlanejamentoScreen)
//                 ou calcula do zero. Ordered por score IA + distância.
//   MODO CIDADE — agrupa via getClientesPorCidade(). Usuário seleciona
//                 uma cidade e gera a rota daquela cidade.
//
// Navegação esperada pelo PlanejamentoScreen: 'RotaInteligente'
//
// FUSÃO:
//   [FIX 1] normalizarOrcamentos() — status 'aguardando' → 'pendente'
//           antes de gerarRotaInteligenteIA() para score correto
//   [FIX 2] Blocos de carga isolados com try/catch/finally próprios
//   [FIX 3] Sem GPS: clientes sem coordenadas vão ao final com aviso
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, StatusBar, Animated,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Icon }                    from 'react-native-elements';
import { getTodosClientes }        from '../services/clienteService';
import { getTodasVisitas }         from '../services/visitaService';
import { getTodosOrcamentos }      from '../services/orcamentoService';
import { gerarRotaInteligenteIA }  from '../services/aiService';
import {
  getClientesPorCidade,
  getClientesPrioritarios,
  getEstatisticasCidade,
  abrirGoogleMapsRota,
  abrirWazeRota,
  estimarTempoRota,
  calcularTotalKmRota,
  getClientesSemGPS,
  otimizarRota,
}                                  from '../services/rotaService';

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

// ════════════════════════════════════════════════════════════════
// [FIX 1] normalizarOrcamentos — status 'aguardando' → 'pendente'
// gerarRotaInteligenteIA() e getClientesPrioritarios() verificam
// internamente o.status === 'pendente'. Sem normalização, orçamentos
// recém-criados com 'aguardando' não aumentam o score do cliente.
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

// ════════════════════════════════════════════════════════════════
// Card de cliente na rota
// ════════════════════════════════════════════════════════════════
function CardClienteRota({ item, posicao, onVerDetalhe }) {
  const scoreCor =
    (item.score ?? item.aiScore ?? 0) >= 70 ? DANGER :
    (item.score ?? item.aiScore ?? 0) >= 45 ? WARN   :
    (item.score ?? item.aiScore ?? 0) >= 20 ? BLUE   : SILVER_DARK;

  const temGPS = !!(item.latitude && item.longitude);
  const motivos = item.motivos || item.aiMotivos || [];

  return (
    <TouchableOpacity
      style={[cr.card, !temGPS && cr.cardSemGPS]}
      onPress={() => onVerDetalhe(item)}
      activeOpacity={0.85}>
      {/* Barra lateral de urgência */}
      <View style={[cr.urgBar, { backgroundColor: scoreCor }]} />

      {/* Número da posição na rota */}
      <View style={[cr.posWrap, {
        backgroundColor: posicao <= 3 ? GOLD + '20' : CARD_BG2,
        borderColor    : posicao <= 3 ? GOLD + '50' : SILVER + '20',
      }]}>
        <Text style={[cr.posTxt, { color: posicao <= 3 ? GOLD : SILVER_DARK }]}>{posicao}</Text>
      </View>

      <View style={{ flex:1 }}>
        <View style={cr.nameRow}>
          <Text style={cr.nome} numberOfLines={1}>{item.nome}</Text>
          {!temGPS && (
            <View style={cr.semGpsBadge}>
              <Icon name="gps-off" size={9} color={SILVER_DARK} type="material" />
              <Text style={cr.semGpsTxt}>Sem GPS</Text>
            </View>
          )}
        </View>

        {item.cidade ? <Text style={cr.cidade}>📍 {item.cidade}</Text> : null}

        {/* Distância ao próximo */}
        {item.distanciaKm != null && (
          <Text style={cr.distancia}>
            {posicao === 1 ? 'Primeiro destino' : `+${item.distanciaKm} km do anterior`}
          </Text>
        )}

        {/* Motivos IA */}
        {motivos.length > 0 && (
          <View style={cr.motivosRow}>
            {motivos.slice(0, 2).map((m, i) => {
              const label = typeof m === 'string' ? m : m.label;
              const color = typeof m === 'object' ? m.color : SILVER_DARK;
              return (
                <View key={i} style={[cr.motivoBadge, { backgroundColor: (color || SILVER_DARK) + '18', borderColor: (color || SILVER_DARK) + '35' }]}>
                  <Text style={[cr.motivoTxt, { color: color || SILVER_DARK }]} numberOfLines={1}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Ticket médio */}
        {(item.ticketMedio ?? item.ticket ?? 0) > 0 && (
          <Text style={cr.ticket}>
            Ticket médio: {formatReal(item.ticketMedio ?? item.ticket)}
          </Text>
        )}
      </View>

      {/* Score badge */}
      <View style={[cr.scoreBadge, { backgroundColor:scoreCor+'20', borderColor:scoreCor+'40' }]}>
        <Icon name="auto-awesome" size={9} color={scoreCor} type="material" />
        <Text style={[cr.scoreTxt, { color:scoreCor }]}>{item.score ?? item.aiScore ?? 0}</Text>
      </View>
    </TouchableOpacity>
  );
}
const cr = StyleSheet.create({
  card         : { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:CARD_BG, borderRadius:14, borderWidth:1, borderColor:SILVER+'18', overflow:'hidden', marginBottom:8, paddingRight:12, paddingVertical:11 },
  cardSemGPS   : { opacity:0.7 },
  urgBar       : { width:4, alignSelf:'stretch' },
  posWrap      : { width:28, height:28, borderRadius:9, justifyContent:'center', alignItems:'center', borderWidth:1, flexShrink:0 },
  posTxt       : { fontSize:12, fontWeight:'900' },
  nameRow      : { flexDirection:'row', alignItems:'center', gap:6, marginBottom:2 },
  nome         : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT, flex:1 },
  cidade       : { fontSize:10, color:SILVER_DARK, marginBottom:3 },
  distancia    : { fontSize:10, color:BLUE, fontWeight:'700', marginBottom:3 },
  motivosRow   : { flexDirection:'row', gap:5, flexWrap:'wrap', marginBottom:3 },
  motivoBadge  : { paddingHorizontal:7, paddingVertical:2, borderRadius:7, borderWidth:1 },
  motivoTxt    : { fontSize:9, fontWeight:'700' },
  ticket       : { fontSize:10, color:SILVER_DARK },
  semGpsBadge  : { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:CARD_BG2, borderRadius:6, paddingHorizontal:5, paddingVertical:2 },
  semGpsTxt    : { fontSize:9, color:SILVER_DARK, fontWeight:'600' },
  scoreBadge   : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:4, borderRadius:8, borderWidth:1, flexShrink:0 },
  scoreTxt     : { fontSize:10, fontWeight:'900' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Agrupar por cidade — CardCidade
// ════════════════════════════════════════════════════════════════
function CardCidade({ item, selecionada, onSelecionar, estatisticas }) {
  const ativo = selecionada;
  return (
    <TouchableOpacity
      style={[cc.card, ativo && { borderColor: GOLD + '60', backgroundColor: GOLD + '12' }]}
      onPress={() => onSelecionar(item.cidade)}
      activeOpacity={0.85}>
      <View style={[cc.iconWrap, { backgroundColor: ativo ? GOLD + '25' : CARD_BG2 }]}>
        <Icon name="location-city" size={16} color={ativo ? GOLD : SILVER_DARK} type="material" />
      </View>
      <View style={{ flex:1 }}>
        <Text style={[cc.cidade, ativo && { color: GOLD }]}>{item.cidade}</Text>
        <Text style={cc.qtd}>
          {item.clientes.length} cliente{item.clientes.length > 1 ? 's' : ''}
          {estatisticas?.visitadosHoje > 0 ? ` · ${estatisticas.visitadosHoje} visitado${estatisticas.visitadosHoje > 1 ? 's' : ''} hoje` : ''}
        </Text>
        {(estatisticas?.totalVendasMes ?? 0) > 0 && (
          <Text style={cc.vendas}>Mês: {formatReal(estatisticas.totalVendasMes)}</Text>
        )}
      </View>
      <Icon
        name={ativo ? 'check-circle' : 'chevron-right'}
        size={18}
        color={ativo ? GOLD : SILVER_DARK}
        type="material"
      />
    </TouchableOpacity>
  );
}
const cc = StyleSheet.create({
  card    : { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:CARD_BG, borderRadius:13, borderWidth:1, borderColor:SILVER+'18', padding:12, marginBottom:8 },
  iconWrap: { width:34, height:34, borderRadius:10, justifyContent:'center', alignItems:'center', flexShrink:0 },
  cidade  : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  qtd     : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  vendas  : { fontSize:10, color:SUCCESS, fontWeight:'700', marginTop:1 },
});

// ════════════════════════════════════════════════════════════════
// Painel de ações (Maps, Waze, estimativa)
// ════════════════════════════════════════════════════════════════
function PainelAcoes({ rota, onAbrirMaps, onAbrirWaze }) {
  if (!rota?.length) return null;

  const comGPS  = rota.filter(c => c.latitude && c.longitude);
  const totalKm = calcularTotalKmRota(rota);
  const tempo   = estimarTempoRota(rota);

  return (
    <View style={pa.container}>
      {/* KPIs da rota */}
      <View style={pa.kpis}>
        <View style={pa.kpi}>
          <Icon name="group" size={13} color={GOLD} type="material" />
          <Text style={[pa.kpiVal, { color:GOLD }]}>{rota.length}</Text>
          <Text style={pa.kpiLabel}>clientes</Text>
        </View>
        <View style={pa.kpi}>
          <Icon name="navigation" size={13} color={BLUE} type="material" />
          <Text style={[pa.kpiVal, { color:BLUE }]}>{totalKm > 0 ? `${totalKm}km` : '—'}</Text>
          <Text style={pa.kpiLabel}>distância</Text>
        </View>
        <View style={pa.kpi}>
          <Icon name="schedule" size={13} color={PURPLE} type="material" />
          <Text style={[pa.kpiVal, { color:PURPLE }]}>{tempo.textoFormatado}</Text>
          <Text style={pa.kpiLabel}>estimado</Text>
        </View>
        {rota.length - comGPS.length > 0 && (
          <View style={pa.kpi}>
            <Icon name="gps-off" size={13} color={WARN} type="material" />
            <Text style={[pa.kpiVal, { color:WARN }]}>{rota.length - comGPS.length}</Text>
            <Text style={pa.kpiLabel}>sem GPS</Text>
          </View>
        )}
      </View>

      {/* Botões de abertura */}
      <View style={pa.botoes}>
        <TouchableOpacity
          style={[pa.btn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}
          onPress={onAbrirMaps}
          activeOpacity={0.85}
          disabled={comGPS.length === 0}>
          <Icon name="map" size={16} color={comGPS.length > 0 ? SUCCESS : SILVER_DARK} type="material" />
          <Text style={[pa.btnTxt, { color: comGPS.length > 0 ? SUCCESS : SILVER_DARK }]}>Google Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[pa.btn, { backgroundColor: BLUE + '18', borderColor: BLUE + '40' }]}
          onPress={onAbrirWaze}
          activeOpacity={0.85}
          disabled={comGPS.length === 0}>
          <Icon name="navigation" size={16} color={comGPS.length > 0 ? BLUE : SILVER_DARK} type="material" />
          <Text style={[pa.btnTxt, { color: comGPS.length > 0 ? BLUE : SILVER_DARK }]}>Waze</Text>
        </TouchableOpacity>
      </View>

      {comGPS.length === 0 && (
        <Text style={pa.aviso}>
          Nenhum cliente com GPS cadastrado. Cadastre latitude/longitude para usar a rota.
        </Text>
      )}
    </View>
  );
}
const pa = StyleSheet.create({
  container: { backgroundColor:CARD_BG, borderRadius:14, borderWidth:1, borderColor:GOLD+'25', padding:12, marginBottom:12 },
  kpis     : { flexDirection:'row', gap:8, marginBottom:10 },
  kpi      : { flex:1, alignItems:'center', backgroundColor:CARD_BG2, borderRadius:10, paddingVertical:8, gap:2 },
  kpiVal   : { fontSize:14, fontWeight:'900' },
  kpiLabel : { fontSize:8, color:SILVER_DARK, fontWeight:'700', textAlign:'center' },
  botoes   : { flexDirection:'row', gap:10 },
  btn      : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7, borderRadius:12, paddingVertical:12, borderWidth:1 },
  btnTxt   : { fontSize:13, fontWeight:'800' },
  aviso    : { fontSize:11, color:WARN, textAlign:'center', marginTop:8, fontStyle:'italic' },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function RotasScreen({ navigation, route }) {
  // Clientes podem vir do PlanejamentoScreen via params
  const clientesParam = route?.params?.clientes ?? null;

  const [todasVisitas,   setTodasVisitas]   = useState([]);
  const [todosClientes,  setTodosClientes]  = useState([]);

  // Modo IA — rota gerada por gerarRotaInteligenteIA()
  const [rotaIA,         setRotaIA]         = useState(clientesParam ?? []);
  const [loadingIA,      setLoadingIA]       = useState(false);

  // Modo cidade — agrupamento por getClientesPorCidade()
  const [cidades,        setCidades]         = useState([]);
  const [cidadeSelecionada, setCidadeSelecionada] = useState(null);
  const [rotaCidade,     setRotaCidade]      = useState([]);
  const [estatCidade,    setEstatCidade]     = useState({});
  const [loadingCidade,  setLoadingCidade]   = useState(false);

  // Aba ativa: 'ia' | 'cidade'
  const [abaAtiva,       setAbaAtiva]        = useState(clientesParam ? 'ia' : 'cidade');
  const [loadingInit,    setLoadingInit]     = useState(true);
  const [refreshing,     setRefreshing]      = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Carga base ───────────────────────────────────────────────
  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoadingInit(true);

    let visOk  = [];
    let cltsOk = [];
    let orcsOk = [];

    try {
      const [vis, clts, orcs] = await Promise.all([
        getTodasVisitas(),
        getTodosClientes(),
        getTodosOrcamentos(),
      ]);
      visOk  = vis  || [];
      cltsOk = clts || [];
      orcsOk = orcs || [];
      setTodasVisitas(visOk);
      setTodosClientes(cltsOk);
    } catch (e) {
      console.log('[RotasScreen] carga base:', e);
    }

    // [FIX 1] Normaliza antes de passar ao aiService/rotaService
    const orcsNorm = normalizarOrcamentos(orcsOk);

    // ── ✅ CHECKLIST: Agrupar por cidade ───────────────────────
    try {
      const grupos   = getClientesPorCidade(cltsOk);
      const estatMap = {};
      grupos.forEach(g => {
        estatMap[g.cidade] = getEstatisticasCidade(g.clientes, visOk);
      });
      setCidades(grupos);
      setEstatCidade(estatMap);
    } catch (e) {
      console.log('[RotasScreen] cidades:', e);
    }

    // ── ✅ CHECKLIST: Priorizar clientes — rota IA ─────────────
    // [FIX 2] Bloco IA isolado
    setLoadingIA(true);
    try {
      // Se vieram clientes do PlanejamentoScreen, usa eles
      // Senão, calcula do zero via gerarRotaInteligenteIA()
      if (clientesParam?.length) {
        const rotaOtimizada = otimizarRota(clientesParam);
        setRotaIA(rotaOtimizada);
      } else {
        const rota = gerarRotaInteligenteIA(cltsOk, visOk, orcsNorm, 20);
        setRotaIA(rota);
      }
    } catch (eIA) {
      console.log('[RotasScreen] rota IA:', eIA);
      setRotaIA([]);
    } finally {
      setLoadingIA(false);
    }

    setLoadingInit(false);
    setRefreshing(false);
    Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
  }, [clientesParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gerar rota de uma cidade específica ───────────────────────
  const gerarRotaDaCidade = useCallback(async (nomeCidade) => {
    if (!nomeCidade) return;
    setCidadeSelecionada(nomeCidade);
    setLoadingCidade(true);

    // [FIX 2] Isolado com try/catch/finally
    try {
      const clientesDaCidade = todosClientes.filter(
        c => (c.cidade || '').trim() === nomeCidade
      );
      const orcsNorm = normalizarOrcamentos(await getTodosOrcamentos().catch(() => []));

      // ✅ CHECKLIST: Priorizar + otimizar por distância
      const prioritarios = getClientesPrioritarios(clientesDaCidade, todasVisitas, orcsNorm, 30);
      const rotaOtimizada = otimizarRota(
        prioritarios.length > 0 ? prioritarios : clientesDaCidade
      );
      setRotaCidade(rotaOtimizada);
    } catch (e) {
      console.log('[RotasScreen] rota cidade:', e);
      setRotaCidade([]);
    } finally {
      setLoadingCidade(false);
    }
  }, [todosClientes, todasVisitas]);

  // ── Handlers Maps / Waze ──────────────────────────────────────
  const rotaAtiva = abaAtiva === 'ia' ? rotaIA : rotaCidade;

  const handleAbrirMaps = () => {
    if (!rotaAtiva.length) return;
    const aberto = abrirGoogleMapsRota(rotaAtiva);
    if (!aberto) Alert.alert('Sem GPS', 'Nenhum cliente com localização cadastrada.');
  };

  const handleAbrirWaze = () => {
    if (!rotaAtiva.length) return;
    const aberto = abrirWazeRota(rotaAtiva);
    if (!aberto) Alert.alert('Sem GPS', 'Nenhum cliente com localização cadastrada.');
  };

  const handleVerDetalhe = (cliente) => {
    navigation?.navigate?.('ClienteDetalhe', { cliente });
  };

  if (loadingInit && !refreshing) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.loadingTxt}>Calculando rotas...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

      {/* ══ HEADER ══ */}
      <View style={s.header}>
        <View style={s.headerAccent} />
        <View style={s.headerRow}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Icon name="arrow-back" size={20} color={SILVER} type="material" />
            </TouchableOpacity>
          )}
          <View style={s.headerIconWrap}>
            <Icon name="alt-route" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={s.titulo}>Rotas Inteligentes</Text>
            <Text style={s.sub}>
              {abaAtiva === 'ia'
                ? `${rotaIA.length} cliente${rotaIA.length !== 1 ? 's' : ''} priorizados`
                : cidadeSelecionada
                  ? `${cidadeSelecionada} · ${rotaCidade.length} clientes`
                  : `${cidades.length} cidade${cidades.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>

        {/* Abas de modo */}
        <View style={s.abasRow}>
          <TouchableOpacity
            style={[s.aba, abaAtiva === 'ia' && { backgroundColor:GOLD, borderColor:GOLD }]}
            onPress={() => setAbaAtiva('ia')}
            activeOpacity={0.8}>
            <Icon name="auto-awesome" size={12} color={abaAtiva === 'ia' ? DARK_BG : GOLD} type="material" />
            <Text style={[s.abaTxt, { color: abaAtiva === 'ia' ? DARK_BG : GOLD }]}>Rota IA</Text>
            {rotaIA.length > 0 && (
              <View style={[s.abaQtd, { backgroundColor: abaAtiva === 'ia' ? DARK_BG + '25' : GOLD + '25' }]}>
                <Text style={[s.abaQtdTxt, { color: abaAtiva === 'ia' ? DARK_BG : GOLD }]}>{rotaIA.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.aba, abaAtiva === 'cidade' && { backgroundColor:BLUE, borderColor:BLUE }]}
            onPress={() => setAbaAtiva('cidade')}
            activeOpacity={0.8}>
            <Icon name="location-city" size={12} color={abaAtiva === 'cidade' ? DARK_BG : BLUE} type="material" />
            <Text style={[s.abaTxt, { color: abaAtiva === 'cidade' ? DARK_BG : BLUE }]}>Por cidade</Text>
            {cidades.length > 0 && (
              <View style={[s.abaQtd, { backgroundColor: abaAtiva === 'cidade' ? DARK_BG + '25' : BLUE + '25' }]}>
                <Text style={[s.abaQtdTxt, { color: abaAtiva === 'cidade' ? DARK_BG : BLUE }]}>{cidades.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ══ CONTEÚDO ══ */}
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

        {/* ── ABA: ROTA IA ── */}
        {abaAtiva === 'ia' && (
          <>
            {loadingIA ? (
              <View style={s.loadingIA}>
                <ActivityIndicator color={GOLD} />
                <Text style={s.loadingIATxt}>Calculando rota com IA...</Text>
              </View>
            ) : rotaIA.length === 0 ? (
              <View style={s.vazio}>
                <Icon name="check-circle" size={48} color={SUCCESS + '50'} type="material" />
                <Text style={s.vazioTitulo}>Nenhum cliente prioritário</Text>
                <Text style={s.vazioSub}>Todos os clientes já foram visitados hoje ou não há pendências.</Text>
              </View>
            ) : (
              <>
                {/* ✅ CHECKLIST: Painel Maps/Waze */}
                <PainelAcoes
                  rota={rotaIA}
                  onAbrirMaps={handleAbrirMaps}
                  onAbrirWaze={handleAbrirWaze}
                />

                {/* Aviso sem GPS */}
                {getClientesSemGPS(rotaIA).length > 0 && (
                  <View style={s.avisoBanner}>
                    <Icon name="gps-off" size={13} color={WARN} type="material" />
                    <Text style={s.avisoBannerTxt}>
                      {`${getClientesSemGPS(rotaIA).length} cliente${getClientesSemGPS(rotaIA).length > 1 ? 's' : ''} sem GPS — aparecem ao final da lista`}
                    </Text>
                  </View>
                )}

                <View style={s.secaoHeaderRow}>
                  <Icon name="auto-awesome" size={13} color={GOLD} type="material" />
                  <Text style={s.secaoTitulo}>Ordem sugerida pela IA</Text>
                  <Text style={s.secaoSub}>{rotaIA.length} paradas</Text>
                </View>

                {/* ✅ CHECKLIST: Priorizar clientes — lista ordenada */}
                {rotaIA.map((c, i) => (
                  <CardClienteRota
                    key={c.id || i}
                    item={c}
                    posicao={i + 1}
                    onVerDetalhe={handleVerDetalhe}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* ── ABA: POR CIDADE ── */}
        {abaAtiva === 'cidade' && (
          <>
            {/* ✅ CHECKLIST: Agrupar por cidade — lista de cidades */}
            {!cidadeSelecionada ? (
              cidades.length === 0 ? (
                <View style={s.vazio}>
                  <Icon name="location-city" size={48} color={SILVER_DARK + '50'} type="material" />
                  <Text style={s.vazioTitulo}>Sem cidades cadastradas</Text>
                  <Text style={s.vazioSub}>Cadastre a cidade nos dados dos clientes.</Text>
                </View>
              ) : (
                <>
                  <Text style={s.secaoDescricao}>
                    Selecione uma cidade para gerar a rota otimizada dos clientes prioritários.
                  </Text>
                  {cidades.map((item, i) => (
                    <CardCidade
                      key={item.cidade || i}
                      item={item}
                      selecionada={false}
                      onSelecionar={gerarRotaDaCidade}
                      estatisticas={estatCidade[item.cidade]}
                    />
                  ))}
                </>
              )
            ) : (
              <>
                {/* Cidade selecionada — botão voltar */}
                <TouchableOpacity
                  style={s.voltarCidadeBtn}
                  onPress={() => { setCidadeSelecionada(null); setRotaCidade([]); }}
                  activeOpacity={0.8}>
                  <Icon name="arrow-back" size={14} color={BLUE} type="material" />
                  <Text style={s.voltarCidadeTxt}>Todas as cidades</Text>
                </TouchableOpacity>

                {loadingCidade ? (
                  <View style={s.loadingIA}>
                    <ActivityIndicator color={GOLD} />
                    <Text style={s.loadingIATxt}>Otimizando rota para {cidadeSelecionada}...</Text>
                  </View>
                ) : rotaCidade.length === 0 ? (
                  <View style={s.vazio}>
                    <Icon name="check-circle" size={40} color={SUCCESS + '50'} type="material" />
                    <Text style={s.vazioTitulo}>Nenhum cliente prioritário</Text>
                    <Text style={s.vazioSub}>Todos já visitados ou sem pendências em {cidadeSelecionada}.</Text>
                  </View>
                ) : (
                  <>
                    {/* ✅ CHECKLIST: Painel Maps/Waze para a cidade */}
                    <PainelAcoes
                      rota={rotaCidade}
                      onAbrirMaps={handleAbrirMaps}
                      onAbrirWaze={handleAbrirWaze}
                    />

                    <View style={s.secaoHeaderRow}>
                      <Icon name="location-city" size={13} color={BLUE} type="material" />
                      <Text style={[s.secaoTitulo, { color:BLUE }]}>{cidadeSelecionada}</Text>
                      <Text style={s.secaoSub}>{rotaCidade.length} paradas</Text>
                    </View>

                    {rotaCidade.map((c, i) => (
                      <CardClienteRota
                        key={c.id || i}
                        item={c}
                        posicao={i + 1}
                        onVerDetalhe={handleVerDetalhe}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height:80 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ── STYLES ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container    : { flex:1, backgroundColor:DARK_BG },
  loading      : { flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center', gap:12 },
  loadingTxt   : { color:SILVER, fontSize:14, fontWeight:'600' },
  scroll       : { paddingHorizontal:16, paddingTop:14 },

  header       : { backgroundColor:'#001828', borderBottomLeftRadius:24, borderBottomRightRadius:24, overflow:'hidden', elevation:10, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.15, shadowRadius:14 },
  headerAccent : { height:3, backgroundColor:GOLD },
  headerRow    : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingTop:48, paddingBottom:10 },
  backBtn      : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  headerIconWrap:{ width:42, height:42, borderRadius:14, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  titulo       : { fontSize:18, fontWeight:'900', color:SILVER_LIGHT },
  sub          : { fontSize:11, color:SILVER_DARK, marginTop:1, textTransform:'capitalize' },
  iconBtn      : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },

  abasRow      : { flexDirection:'row', paddingHorizontal:16, paddingBottom:14, gap:10 },
  aba          : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9, borderRadius:13, backgroundColor:CARD_BG2, borderWidth:1, borderColor:SILVER+'18' },
  abaTxt       : { fontSize:12, fontWeight:'800' },
  abaQtd       : { paddingHorizontal:7, paddingVertical:1, borderRadius:8 },
  abaQtdTxt    : { fontSize:10, fontWeight:'900' },

  avisoBanner    : { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:WARN+'10', borderRadius:10, borderWidth:1, borderColor:WARN+'35', paddingHorizontal:12, paddingVertical:8, marginBottom:10 },
  avisoBannerTxt : { flex:1, fontSize:11, color:SILVER, fontWeight:'600' },

  secaoHeaderRow : { flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 },
  secaoTitulo    : { flex:1, fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  secaoSub       : { fontSize:11, color:SILVER_DARK, fontWeight:'600' },
  secaoDescricao : { fontSize:12, color:SILVER_DARK, marginBottom:12, fontStyle:'italic' },

  voltarCidadeBtn: { flexDirection:'row', alignItems:'center', gap:6, paddingVertical:8, marginBottom:10 },
  voltarCidadeTxt: { fontSize:13, fontWeight:'700', color:BLUE },

  loadingIA    : { alignItems:'center', paddingVertical:30, gap:10 },
  loadingIATxt : { fontSize:13, color:SILVER_DARK },

  vazio        : { alignItems:'center', paddingVertical:50, gap:10 },
  vazioTitulo  : { fontSize:17, fontWeight:'900', color:SILVER_LIGHT },
  vazioSub     : { fontSize:13, color:SILVER_DARK, textAlign:'center', paddingHorizontal:20 },
});