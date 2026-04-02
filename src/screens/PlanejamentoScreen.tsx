// screens/PlanejamentoScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 6 — PLANEJAMENTO DE VISITAS
//
// Checklist:
//   ✅ Lista clientes     — FlatList com animação por card
//   ✅ Ordenação prioridade — score IA via calcularPrioridadeClienteIA()
//   ✅ Dias sem compra    — getDiasSemCompra() por card
//   ✅ Prioridade         — abas Pendentes/Parados/Visitados/Reposição/Todos
//
// FUSÃO v2 — versão existente + correções de comunicação com services:
//
//   [BUG CRÍTICO 1] calcularPrioridadeClienteIA(c, visitas, clts)
//     → 3º argumento era `clts` (lista de clientes) em vez de orcamentos
//     → aiService tenta o.clienteId === c.id sobre objetos cliente
//     → nunca encontra → bônus de +15pts por orçamento pendente NUNCA disparava
//     CORREÇÃO: carrega getTodosOrcamentos() e passa orcsNormalizados
//
//   [BUG CRÍTICO 2] getTodosOrcamentos() nunca era chamado
//     → calcularPrioridadeClienteIA sempre recebia [] de orcamentos
//     CORREÇÃO: adicionado ao Promise.all() da carga
//
//   [FIX 1] Status 'aguardando' (orcamentoService) ≠ 'pendente' (aiService)
//     → normalizarOrcamentos() converte antes de passar ao aiService
//
//   [FIX 2] Bloco de IA sem try/catch isolado
//     → enriquecimento dos clientes em bloco próprio com fallback por cliente
//     → erro em um cliente não zera a lista inteira
//
//   [FIX 3] Banner de follow-ups atrasados adicionado
//     → getOrcamentosParaFollowup() sobre TODOS os orçamentos
//
//   Mantidos integralmente da versão existente:
//     FlatList, animações por card (slide+fade com delay escalonado),
//     ShimmerLine, busca, abas, barra de progresso, banner potencial,
//     WhatsApp/Waze inline, rank numérico, badges Visitado/Repor,
//     estados vazios por aba.
//
//   Adicionados da versão gerada:
//     Botão Rota Inteligente no header, banner follow-ups atrasados,
//     KPI de follow-up.
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Animated, RefreshControl, ActivityIndicator,
  Dimensions, TextInput, Linking,
} from 'react-native';
import { Icon }                        from 'react-native-elements';
import { getTodosClientes }            from '../services/clienteService';
import { getTodasVisitas }             from '../services/visitaService';
// [BUG CRÍTICO 2] getTodosOrcamentos adicionado — nunca era importado
import {
  getTodosOrcamentos,
  getOrcamentosParaFollowup,
}                                      from '../services/orcamentoService';
import { calcularPrioridadeClienteIA } from '../services/aiService';
import {
  getDiasSemCompra,
  getTicketMedio,
}                                      from '../services/analyticsService';

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

// ════════════════════════════════════════════════════════════════
// [FIX 1] Normaliza 'aguardando' → 'pendente' antes do aiService
// O aiService verifica internamente o.status === 'pendente'.
// Orçamentos criados com 'aguardando' pelo orcamentoService nunca
// ativavam o bônus de +15pts no score de prioridade.
// ════════════════════════════════════════════════════════════════
function normalizarOrcamentos(lista) {
  return lista.map(o =>
    o.status === 'aguardando' ? { ...o, status: 'pendente' } : o
  );
}

// ── Helpers de label ──────────────────────────────────────────
function getUrgenciaLabel(diasSemCompra) {
  if (diasSemCompra === null) return { label:'Nunca comprou',          cor:DANGER, icone:'warning'       };
  if (diasSemCompra >= 60)   return { label:'Parado há muito tempo',  cor:DANGER, icone:'block'          };
  if (diasSemCompra >= 30)   return { label:`${diasSemCompra}d sem compra`, cor:WARN,    icone:'schedule' };
  if (diasSemCompra >= 14)   return { label:`${diasSemCompra}d sem compra`, cor:GOLD,    icone:'info'     };
  return                            { label:`${diasSemCompra}d — recente`,  cor:SUCCESS, icone:'check-circle' };
}

function getScoreLabel(score) {
  if (score >= 70) return { label:'Urgente', cor:DANGER      };
  if (score >= 45) return { label:'Alta',    cor:WARN        };
  if (score >= 25) return { label:'Normal',  cor:BLUE        };
  return               { label:'Baixa',  cor:SILVER_DARK };
}

function formatResumo(v) {
  if (!v || v === 0) return '—';
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;
}

// ── ShimmerLine (mantido da versão existente) ─────────────────
function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver:true })
    ).start();
  }, []);
  return (
    <View style={{ height:2, width:'100%', backgroundColor:color+'25', overflow:'hidden' }}>
      <Animated.View style={{
        position:'absolute', height:'100%', width:80, backgroundColor:color+'BB',
        transform:[{ translateX:anim.interpolate({ inputRange:[0,1], outputRange:[-80, SW] }) }],
      }} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Card de cliente com animação, rank, dias sem compra,
// score IA e ações rápidas WhatsApp/Waze (mantido da versão existente)
// ════════════════════════════════════════════════════════════════
function ClientePriorCard({ item, rank, onPress, onCheckin }) {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(rank * 60, 400);
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue:1, duration:350, useNativeDriver:true }),
        Animated.spring(slideAnim, { toValue:0, friction:8,   useNativeDriver:true }),
      ]).start();
    }, delay);
  }, []);

  const urgencia    = getUrgenciaLabel(item.diasSemCompra);
  const scoreLabel  = getScoreLabel(item.aiScore);
  const visitadoHoje = item.visitadoHoje;

  const handleWhatsApp = () => {
    const tel = item.telefone1 || item.telefone2;
    if (!tel) return;
    const num = tel.replace(/\D/g, '');
    Linking.openURL(`whatsapp://send?phone=55${num}`).catch(() =>
      Linking.openURL(`https://wa.me/55${num}`).catch(() => null));
  };

  const handleRota = () => {
    if (!item.latitude || !item.longitude) return;
    Linking.openURL(`waze://ul?ll=${item.latitude},${item.longitude}&navigate=yes`).catch(() =>
      Linking.openURL(`https://waze.com/ul?ll=${item.latitude},${item.longitude}&navigate=yes`).catch(() => null));
  };

  const temTelefone = !!(item.telefone1 || item.telefone2);
  const temGPS      = !!(item.latitude && item.longitude);

  return (
    <Animated.View style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }}>
      <TouchableOpacity
        style={[cp.card, { borderColor: urgencia.cor + '30' }, visitadoHoje && cp.cardVisitado]}
        onPress={onPress}
        activeOpacity={0.85}>

        <View style={[cp.urgBar, { backgroundColor: urgencia.cor }]} />

        {/* Rank numérico */}
        <View style={[cp.rankWrap, {
          backgroundColor: rank <= 3 ? GOLD + '20' : CARD_BG2,
          borderColor    : rank <= 3 ? GOLD + '50' : SILVER + '20',
        }]}>
          <Text style={[cp.rankTxt, { color: rank <= 3 ? GOLD : SILVER_DARK }]}>{rank}</Text>
        </View>

        <View style={{ flex:1 }}>
          <View style={cp.nameRow}>
            <Text style={cp.nome} numberOfLines={1}>{item.nome}</Text>
            {visitadoHoje && (
              <View style={cp.visitadoBadge}>
                <Icon name="check" size={10} color={SUCCESS} type="material" />
                <Text style={cp.visitadoTxt}>Visitado</Text>
              </View>
            )}
            {item.emReposicao && !visitadoHoje && (
              <View style={cp.reposicaoBadge}>
                <Icon name="autorenew" size={10} color={PURPLE} type="material" />
                <Text style={cp.reposicaoTxt}>Repor</Text>
              </View>
            )}
          </View>

          {item.cidade ? <Text style={cp.cidade}>📍 {item.cidade}</Text> : null}

          {/* ✅ CHECKLIST: Dias sem compra + motivo IA */}
          <View style={cp.tagsRow}>
            <View style={[cp.urgBadge, { backgroundColor:urgencia.cor+'18', borderColor:urgencia.cor+'40' }]}>
              <Icon name={urgencia.icone} size={10} color={urgencia.cor} type="material" />
              <Text style={[cp.urgTxt, { color:urgencia.cor }]}>{urgencia.label}</Text>
            </View>
            {item.aiMotivos?.[0] && !visitadoHoje && (
              <View style={[cp.motivoBadge, { backgroundColor:scoreLabel.cor+'15', borderColor:scoreLabel.cor+'35' }]}>
                <Icon name="bolt" size={9} color={scoreLabel.cor} type="material" />
                <Text style={[cp.motivoTxt, { color:scoreLabel.cor }]} numberOfLines={1}>{item.aiMotivos[0]}</Text>
              </View>
            )}
          </View>

          {item.ticketMedio > 0 && (
            <Text style={cp.ticket}>Ticket médio: {formatResumo(item.ticketMedio)}</Text>
          )}

          {/* Ações rápidas WhatsApp + Waze */}
          {!visitadoHoje && (temTelefone || temGPS) && (
            <View style={cp.acoesRapidas}>
              {temTelefone && (
                <TouchableOpacity style={cp.acaoRapidaBtn} onPress={handleWhatsApp} activeOpacity={0.8}>
                  <Icon name="chat" size={11} color={SUCCESS} type="material" />
                  <Text style={[cp.acaoRapidaTxt, { color:SUCCESS }]}>WhatsApp</Text>
                </TouchableOpacity>
              )}
              {temGPS && (
                <TouchableOpacity style={cp.acaoRapidaBtn} onPress={handleRota} activeOpacity={0.8}>
                  <Icon name="navigation" size={11} color={BLUE} type="material" />
                  <Text style={[cp.acaoRapidaTxt, { color:BLUE }]}>Rota</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Coluna direita: score + check-in */}
        <View style={cp.rightCol}>
          {/* ✅ CHECKLIST: Badge de prioridade IA */}
          <View style={[cp.scoreBadge, { backgroundColor:scoreLabel.cor+'20', borderColor:scoreLabel.cor+'40' }]}>
            <Icon name="auto-awesome" size={10} color={scoreLabel.cor} type="material" />
            <Text style={[cp.scoreTxt, { color:scoreLabel.cor }]}>{item.aiScore}</Text>
          </View>
          {!visitadoHoje && (
            <TouchableOpacity style={cp.checkinBtn} onPress={onCheckin} activeOpacity={0.8}>
              <Icon name="pin-drop" size={14} color={DARK_BG} type="material" />
              <Text style={cp.checkinTxt}>Check-in</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const cp = StyleSheet.create({
  card          : { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, overflow:'hidden', marginBottom:10, paddingRight:12, paddingVertical:12 },
  cardVisitado  : { opacity:0.6 },
  urgBar        : { width:4, alignSelf:'stretch' },
  rankWrap      : { width:28, height:28, borderRadius:9, justifyContent:'center', alignItems:'center', borderWidth:1, flexShrink:0 },
  rankTxt       : { fontSize:12, fontWeight:'900' },
  nameRow       : { flexDirection:'row', alignItems:'center', gap:8, marginBottom:2 },
  nome          : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT, flex:1 },
  cidade        : { fontSize:10, color:SILVER_DARK, marginBottom:5 },
  tagsRow       : { flexDirection:'row', gap:6, flexWrap:'wrap', marginBottom:4 },
  urgBadge      : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:8, borderWidth:1 },
  urgTxt        : { fontSize:9, fontWeight:'800' },
  motivoBadge   : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:8, borderWidth:1, flex:1 },
  motivoTxt     : { fontSize:9, fontWeight:'700', flex:1 },
  ticket        : { fontSize:10, color:SILVER_DARK, fontWeight:'600' },
  visitadoBadge : { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:SUCCESS+'18', borderRadius:7, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:SUCCESS+'40' },
  visitadoTxt   : { fontSize:9, fontWeight:'800', color:SUCCESS },
  reposicaoBadge: { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:PURPLE+'18', borderRadius:7, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:PURPLE+'40' },
  reposicaoTxt  : { fontSize:9, fontWeight:'800', color:PURPLE },
  acoesRapidas  : { flexDirection:'row', gap:6, marginTop:6 },
  acaoRapidaBtn : { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:CARD_BG2, borderRadius:8, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:SILVER+'18' },
  acaoRapidaTxt : { fontSize:9, fontWeight:'700' },
  rightCol      : { alignItems:'center', gap:6, flexShrink:0 },
  scoreBadge    : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:4, borderRadius:8, borderWidth:1 },
  scoreTxt      : { fontSize:11, fontWeight:'900' },
  checkinBtn    : { backgroundColor:GOLD, borderRadius:9, paddingHorizontal:8, paddingVertical:6, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:3 },
  checkinTxt    : { fontSize:9, fontWeight:'900', color:DARK_BG },
});

// ── Abas (mantidas da versão existente) ───────────────────────
const ABAS = [
  { key:'pendentes', label:'Pendentes',      icone:'schedule',     cor:WARN    },
  { key:'parados',   label:'Parados',        icone:'warning',      cor:DANGER  },
  { key:'visitados', label:'Visitados hoje', icone:'check-circle', cor:SUCCESS },
  { key:'reposicao', label:'Reposição',      icone:'autorenew',    cor:PURPLE  },
  { key:'todos',     label:'Todos',          icone:'people',       cor:BLUE    },
];

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function PlanejamentoScreen({ navigation }) {
  const [clientes,     setClientes]     = useState([]);
  const [todasVisitas, setTodasVisitas] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [abaAtiva,     setAbaAtiva]     = useState('pendentes');
  const [clientesIA,   setClientesIA]   = useState([]);
  const [textoBusca,   setTextoBusca]   = useState('');
  const [buscaVisivel, setBuscaVisivel] = useState(false);
  // [FIX 3] Follow-ups globais sobre todos os orçamentos
  const [followupsUrgentes, setFollowupsUrgentes] = useState([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Carga principal ───────────────────────────────────────────
  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);

    try {
      // [BUG CRÍTICO 2] getTodosOrcamentos adicionado ao Promise.all
      const [clts, visitas, orcs] = await Promise.all([
        getTodosClientes(),
        getTodasVisitas(),
        getTodosOrcamentos(),
      ]);

      const cltsOk = clts    || [];
      const visOk  = visitas || [];
      const orcsOk = orcs    || [];

      setClientes(cltsOk);
      setTodasVisitas(visOk);

      // [FIX 3] Follow-ups calculados sobre TODOS os orçamentos
      try {
        const followups = getOrcamentosParaFollowup
          ? getOrcamentosParaFollowup(orcsOk).filter(
              o => o.urgencia === 'atrasado' || o.urgencia === 'hoje'
            )
          : [];
        setFollowupsUrgentes(followups);
      } catch (eF) {
        console.log('[PlanejamentoScreen] followup:', eF);
      }

      // ════════════════════════════════════════════════════════
      // [BUG CRÍTICO 1] + [FIX 1] Enriquecimento IA corrigido
      //
      // ANTES: calcularPrioridadeClienteIA(c, visitas, clts)
      //   → clts era passado como orcamentos
      //   → aiService faz o.clienteId === c.id sobre objetos de cliente
      //   → nunca bate → bônus +15pts jamais ativava
      //
      // DEPOIS: normalizarOrcamentos(orcsOk) converte 'aguardando'
      //   → 'pendente' e passa a lista correta de orçamentos
      // ════════════════════════════════════════════════════════
      const orcsNormalizados = normalizarOrcamentos(orcsOk);

      const hoje = new Date().toISOString().substring(0, 10);
      const visitadosHojeSet = new Set(
        visOk
          .filter(v => (v.dataLocal || v.data || '').substring(0, 10) === hoje)
          .map(v => v.clienteId)
      );

      // [FIX 2] Enriquecimento IA com fallback por cliente
      // Erro em um cliente retorna dados neutros sem zerar a lista
      let enriquecidos = [];
      try {
        enriquecidos = cltsOk.map(c => {
          try {
            const ai          = calcularPrioridadeClienteIA(c, visOk, orcsNormalizados);
            const diasSemComp = getDiasSemCompra(c.id, visOk);
            const ticket      = getTicketMedio(c.id, visOk);
            return {
              ...c,
              aiScore      : ai.score,
              aiMotivos    : ai.motivos,
              emReposicao  : ai.emCicloReposicao,
              diasSemCompra: diasSemComp,
              ticketMedio  : ticket,
              visitadoHoje : visitadosHojeSet.has(c.id),
            };
          } catch (eCliente) {
            console.log('[PlanejamentoScreen] IA cliente:', c.id, eCliente);
            return {
              ...c,
              aiScore:0, aiMotivos:[], emReposicao:false,
              diasSemCompra:null, ticketMedio:0,
              visitadoHoje: visitadosHojeSet.has(c.id),
            };
          }
        });
      } catch (eIA) {
        console.log('[PlanejamentoScreen] enriquecimento IA:', eIA);
      }

      setClientesIA(enriquecidos);

    } catch (e) {
      console.log('[PlanejamentoScreen] carga:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ✅ CHECKLIST: Filtro por aba + busca ─────────────────────
  const clientesFiltrados = (() => {
    let lista;
    switch (abaAtiva) {
      case 'pendentes':
        lista = clientesIA
          .filter(c => !c.visitadoHoje && c.aiScore > 0)
          .sort((a, b) => b.aiScore - a.aiScore);
        break;
      case 'parados':
        lista = clientesIA
          .filter(c => !c.visitadoHoje && (c.diasSemCompra === null || c.diasSemCompra >= 30))
          .sort((a, b) => {
            if (a.diasSemCompra === null && b.diasSemCompra !== null) return -1;
            if (a.diasSemCompra !== null && b.diasSemCompra === null) return 1;
            return (b.diasSemCompra ?? 0) - (a.diasSemCompra ?? 0);
          });
        break;
      case 'visitados':
        lista = clientesIA
          .filter(c => c.visitadoHoje)
          .sort((a, b) => b.aiScore - a.aiScore);
        break;
      case 'reposicao':
        lista = clientesIA
          .filter(c => c.emReposicao && !c.visitadoHoje)
          .sort((a, b) => b.aiScore - a.aiScore);
        break;
      case 'todos':
      default:
        lista = [...clientesIA].sort((a, b) => {
          if (a.visitadoHoje !== b.visitadoHoje) return a.visitadoHoje ? 1 : -1;
          return b.aiScore - a.aiScore;
        });
        break;
    }
    if (textoBusca.trim().length > 0) {
      const termo = textoBusca.trim().toLowerCase();
      lista = lista.filter(c =>
        c.nome?.toLowerCase().includes(termo)   ||
        c.cidade?.toLowerCase().includes(termo) ||
        c.tipo?.toLowerCase().includes(termo)
      );
    }
    return lista;
  })();

  // ── KPIs ─────────────────────────────────────────────────────
  const qtdPendentes = clientesIA.filter(c => !c.visitadoHoje && c.aiScore > 0).length;
  const qtdVisitados = clientesIA.filter(c => c.visitadoHoje).length;
  const qtdParados   = clientesIA.filter(c => !c.visitadoHoje && (c.diasSemCompra === null || c.diasSemCompra >= 30)).length;
  const qtdUrgentes  = clientesIA.filter(c => !c.visitadoHoje && c.aiScore >= 70).length;
  const qtdReposicao = clientesIA.filter(c => c.emReposicao && !c.visitadoHoje).length;
  const potencialDia = clientesIA
    .filter(c => !c.visitadoHoje && c.aiScore >= 45 && c.ticketMedio > 0)
    .reduce((acc, c) => acc + c.ticketMedio, 0);

  const pctProgresso = qtdPendentes + qtdVisitados > 0
    ? Math.min(Math.round((qtdVisitados / (qtdPendentes + qtdVisitados)) * 100), 100)
    : 0;

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.loadingTxt}>Montando planejamento...</Text>
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
          <View style={s.headerIconWrap}>
            <Icon name="event-note" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={s.titulo}>Planejamento do dia</Text>
            <Text style={s.sub}>
              {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}
            </Text>
          </View>
          {/* Busca */}
          <TouchableOpacity
            style={[s.refreshBtn, buscaVisivel && { backgroundColor:GOLD+'30', borderColor:GOLD+'50', borderWidth:1 }]}
            onPress={() => { setBuscaVisivel(v => !v); setTextoBusca(''); }}
            activeOpacity={0.8}>
            <Icon name={buscaVisivel ? 'search-off' : 'search'} size={18} color={buscaVisivel ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
          {/* Rota inteligente */}
          <TouchableOpacity
            style={[s.rotaBtn,
              clientesIA.filter(c => !c.visitadoHoje && c.aiScore > 0).length === 0 && { opacity:0.4 }]}
            onPress={() => navigation?.navigate?.('RotaInteligente', {
              clientes: clientesIA.filter(c => !c.visitadoHoje && c.aiScore > 0),
            })}
            activeOpacity={0.85}
            disabled={clientesIA.filter(c => !c.visitadoHoje && c.aiScore > 0).length === 0}>
            <Icon name="alt-route" size={15} color={DARK_BG} type="material" />
            <Text style={s.rotaBtnTxt}>Rota</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.refreshBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>

        <ShimmerLine color={GOLD} />

        {/* Campo de busca */}
        {buscaVisivel && (
          <View style={s.buscaWrap}>
            <Icon name="search" size={16} color={SILVER_DARK} type="material" style={{ marginLeft:10 }} />
            <TextInput
              style={s.buscaInput}
              placeholder="Buscar por nome, cidade ou tipo..."
              placeholderTextColor={SILVER_DARK}
              value={textoBusca}
              onChangeText={setTextoBusca}
              autoFocus
              returnKeyType="search"
            />
            {textoBusca.length > 0 && (
              <TouchableOpacity onPress={() => setTextoBusca('')} activeOpacity={0.8} style={{ paddingRight:10 }}>
                <Icon name="close" size={16} color={SILVER_DARK} type="material" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* KPIs do dia */}
        <View style={s.kpiRow}>
          <View style={[s.kpiItem, { borderColor:DANGER+'35' }]}>
            <Icon name="local-fire-department" size={13} color={DANGER} type="material" />
            <Text style={[s.kpiVal, { color:DANGER }]}>{qtdUrgentes}</Text>
            <Text style={s.kpiLabel}>Urgentes</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:WARN+'35' }]}>
            <Icon name="schedule" size={13} color={WARN} type="material" />
            <Text style={[s.kpiVal, { color:WARN }]}>{qtdPendentes}</Text>
            <Text style={s.kpiLabel}>Pendentes</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:SUCCESS+'35' }]}>
            <Icon name="check-circle" size={13} color={SUCCESS} type="material" />
            <Text style={[s.kpiVal, { color:SUCCESS }]}>{qtdVisitados}</Text>
            <Text style={s.kpiLabel}>Visitados</Text>
          </View>
          <View style={[s.kpiItem, { borderColor:DANGER+'35' }]}>
            <Icon name="block" size={13} color={DANGER} type="material" />
            <Text style={[s.kpiVal, { color:DANGER }]}>{qtdParados}</Text>
            <Text style={s.kpiLabel}>Parados</Text>
          </View>
          {/* [FIX 3] KPI de follow-ups atrasados */}
          {followupsUrgentes.length > 0 && (
            <View style={[s.kpiItem, { borderColor:WARN+'35' }]}>
              <Icon name="notifications-active" size={13} color={WARN} type="material" />
              <Text style={[s.kpiVal, { color:WARN }]}>{followupsUrgentes.length}</Text>
              <Text style={s.kpiLabel}>Follow-up</Text>
            </View>
          )}
          {qtdReposicao > 0 && (
            <View style={[s.kpiItem, { borderColor:PURPLE+'35' }]}>
              <Icon name="autorenew" size={13} color={PURPLE} type="material" />
              <Text style={[s.kpiVal, { color:PURPLE }]}>{qtdReposicao}</Text>
              <Text style={s.kpiLabel}>Reposição</Text>
            </View>
          )}
        </View>

        {/* Banner potencial estimado */}
        {potencialDia > 0 && (
          <View style={s.potencialBanner}>
            <Icon name="trending-up" size={14} color={GOLD} type="material" />
            <Text style={s.potencialTxt}>
              Potencial estimado:{' '}
              <Text style={s.potencialValor}>{formatResumo(potencialDia)}</Text>
              {' '}em {clientesIA.filter(c => !c.visitadoHoje && c.aiScore >= 45 && c.ticketMedio > 0).length} clientes prioritários
            </Text>
          </View>
        )}

        {/* [FIX 3] Banner follow-ups atrasados */}
        {followupsUrgentes.length > 0 && (
          <TouchableOpacity
            style={s.followBanner}
            onPress={() => navigation?.navigate?.('Orcamentos')}
            activeOpacity={0.85}>
            <Icon name="notifications-active" size={13} color={DANGER} type="material" />
            <Text style={s.followBannerTxt}>
              {`${followupsUrgentes.length} follow-up${followupsUrgentes.length > 1 ? 's' : ''} `}
              {`atrasado${followupsUrgentes.length > 1 ? 's' : ''} — toque para ver`}
            </Text>
            <Icon name="chevron-right" size={14} color={DANGER} type="material" />
          </TouchableOpacity>
        )}

        {/* Barra de progresso do dia */}
        {qtdVisitados > 0 && (
          <View style={s.progressoWrap}>
            <View style={s.progressoBar}>
              <View style={[s.progressoFill, { width:`${pctProgresso}%` }]} />
            </View>
            <Text style={s.progressoTxt}>{`${qtdVisitados} de ${qtdPendentes + qtdVisitados} visitados`}</Text>
          </View>
        )}

        {/* ✅ CHECKLIST: Abas de filtro */}
        <View style={s.abasRow}>
          {ABAS.map(a => {
            if (a.key === 'reposicao' && qtdReposicao === 0) return null;
            const ativo = abaAtiva === a.key;
            const qtd =
              a.key === 'pendentes' ? qtdPendentes :
              a.key === 'parados'   ? qtdParados   :
              a.key === 'visitados' ? qtdVisitados :
              a.key === 'reposicao' ? qtdReposicao :
              clientesIA.length;
            return (
              <TouchableOpacity
                key={a.key}
                style={[s.aba, ativo && { backgroundColor:a.cor, borderColor:a.cor }]}
                onPress={() => setAbaAtiva(a.key)}
                activeOpacity={0.8}>
                <Icon name={a.icone} size={12} color={ativo ? DARK_BG : a.cor} type="material" />
                <Text style={[s.abaTxt, { color:ativo ? DARK_BG : a.cor }]}>{a.label}</Text>
                {qtd > 0 && (
                  <View style={[s.abaQtd, { backgroundColor:ativo ? DARK_BG+'25' : a.cor+'25' }]}>
                    <Text style={[s.abaQtdTxt, { color:ativo ? DARK_BG : a.cor }]}>{qtd}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ══ ✅ CHECKLIST: Lista clientes + Ordenação por prioridade ══ */}
      <Animated.View style={[s.listaWrap, { opacity:fadeAnim }]}>
        <FlatList
          data={clientesFiltrados}
          keyExtractor={item => item.id}
          contentContainerStyle={s.lista}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => carregar(true)}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
          ListHeaderComponent={
            clientesFiltrados.length > 0 ? (
              <View style={s.listaHeader}>
                <Icon name="auto-awesome" size={12} color={GOLD} type="material" />
                <Text style={s.listaHeaderTxt}>
                  {textoBusca.trim().length > 0
                    ? `Resultado da busca por "${textoBusca.trim()}"`
                    : abaAtiva === 'pendentes' ? 'Ordenado por prioridade IA'
                    : abaAtiva === 'parados'   ? 'Ordenado por tempo sem compra'
                    : abaAtiva === 'visitados' ? 'Clientes visitados hoje'
                    : abaAtiva === 'reposicao' ? 'Em ciclo de reposição'
                    : 'Todos os clientes'}
                </Text>
                <Text style={s.listaHeaderQtd}>{clientesFiltrados.length}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.empty}>
              {textoBusca.trim().length > 0 ? (
                <>
                  <Text style={s.emptyEmoji}>🔍</Text>
                  <Text style={s.emptyTitulo}>Nenhum resultado</Text>
                  <Text style={s.emptyTxt}>Nenhum cliente encontrado para "{textoBusca.trim()}".</Text>
                </>
              ) : abaAtiva === 'pendentes' ? (
                <>
                  <Text style={s.emptyEmoji}>🎉</Text>
                  <Text style={s.emptyTitulo}>Tudo em dia!</Text>
                  <Text style={s.emptyTxt}>Nenhum cliente pendente de visita no momento.</Text>
                </>
              ) : abaAtiva === 'parados' ? (
                <>
                  <Text style={s.emptyEmoji}>✅</Text>
                  <Text style={s.emptyTitulo}>Sem clientes parados</Text>
                  <Text style={s.emptyTxt}>Todos os clientes compraram recentemente.</Text>
                </>
              ) : abaAtiva === 'visitados' ? (
                <>
                  <Text style={s.emptyEmoji}>📋</Text>
                  <Text style={s.emptyTitulo}>Nenhuma visita hoje</Text>
                  <Text style={s.emptyTxt}>Faça um check-in para registrar a primeira visita do dia.</Text>
                </>
              ) : abaAtiva === 'reposicao' ? (
                <>
                  <Text style={s.emptyEmoji}>🔄</Text>
                  <Text style={s.emptyTitulo}>Sem reposições pendentes</Text>
                  <Text style={s.emptyTxt}>Nenhum cliente em ciclo de reposição ativo no momento.</Text>
                </>
              ) : (
                <>
                  <Text style={s.emptyEmoji}>👥</Text>
                  <Text style={s.emptyTitulo}>Sem clientes cadastrados</Text>
                  <Text style={s.emptyTxt}>Adicione clientes para visualizar o planejamento.</Text>
                </>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <ClientePriorCard
              item={item}
              rank={index + 1}
              onPress={() => navigation?.navigate?.('ClienteDetalhe', { cliente:item })}
              onCheckin={() => navigation?.navigate?.('Checkin', { cliente:item })}
            />
          )}
        />
      </Animated.View>
    </View>
  );
}

// ── STYLES ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container      : { flex:1, backgroundColor:DARK_BG },
  loading        : { flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center', gap:12 },
  loadingTxt     : { color:SILVER, fontSize:14, fontWeight:'600' },
  header         : { backgroundColor:'#001828', borderBottomLeftRadius:26, borderBottomRightRadius:26, overflow:'hidden', elevation:12, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.15, shadowRadius:14 },
  headerAccent   : { height:3, backgroundColor:GOLD },
  headerRow      : { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:16, paddingTop:48, paddingBottom:10 },
  headerIconWrap : { width:42, height:42, borderRadius:14, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  titulo         : { fontSize:18, fontWeight:'bold', color:SILVER_LIGHT },
  sub            : { fontSize:11, color:SILVER_DARK, marginTop:1, textTransform:'capitalize' },
  refreshBtn     : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  rotaBtn        : { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:GOLD, borderRadius:12, paddingHorizontal:10, paddingVertical:8 },
  rotaBtnTxt     : { fontSize:11, fontWeight:'900', color:DARK_BG },
  buscaWrap      : { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginTop:8, backgroundColor:CARD_BG2, borderRadius:12, borderWidth:1, borderColor:GOLD+'40', gap:6 },
  buscaInput     : { flex:1, color:SILVER_LIGHT, fontSize:13, paddingVertical:10, paddingLeft:8, fontWeight:'600' },
  kpiRow         : { flexDirection:'row', paddingHorizontal:16, paddingTop:10, paddingBottom:6, gap:6 },
  kpiItem        : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:12, paddingVertical:8, gap:3, borderWidth:1 },
  kpiVal         : { fontSize:18, fontWeight:'900' },
  kpiLabel       : { fontSize:8, color:SILVER_DARK, fontWeight:'700', textAlign:'center' },
  potencialBanner: { flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginBottom:6, paddingHorizontal:12, paddingVertical:8, backgroundColor:GOLD+'10', borderRadius:10, borderWidth:1, borderColor:GOLD+'30' },
  potencialTxt   : { flex:1, fontSize:11, color:SILVER, fontWeight:'600' },
  potencialValor  : { fontSize:12, fontWeight:'900', color:GOLD },
  followBanner   : { flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginBottom:6, paddingHorizontal:12, paddingVertical:8, backgroundColor:DANGER+'10', borderRadius:10, borderWidth:1, borderColor:DANGER+'40' },
  followBannerTxt: { flex:1, fontSize:11, color:SILVER, fontWeight:'600' },
  progressoWrap  : { paddingHorizontal:16, paddingBottom:10, gap:5 },
  progressoBar   : { height:5, backgroundColor:CARD_BG2, borderRadius:4, overflow:'hidden' },
  progressoFill  : { height:'100%', backgroundColor:SUCCESS, borderRadius:4 },
  progressoTxt   : { fontSize:10, color:SILVER_DARK, fontWeight:'600' },
  abasRow        : { flexDirection:'row', paddingHorizontal:16, paddingBottom:12, gap:6 },
  aba            : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:8, borderRadius:12, backgroundColor:CARD_BG2, borderWidth:1, borderColor:SILVER+'18' },
  abaTxt         : { fontSize:9, fontWeight:'800' },
  abaQtd         : { paddingHorizontal:5, paddingVertical:1, borderRadius:6 },
  abaQtdTxt      : { fontSize:9, fontWeight:'900' },
  listaWrap      : { flex:1 },
  lista          : { paddingHorizontal:16, paddingTop:12, paddingBottom:100 },
  listaHeader    : { flexDirection:'row', alignItems:'center', gap:6, marginBottom:10 },
  listaHeaderTxt : { flex:1, fontSize:11, color:SILVER_DARK, fontStyle:'italic' },
  listaHeaderQtd : { fontSize:12, fontWeight:'800', color:GOLD },
  empty          : { alignItems:'center', paddingTop:60, gap:10 },
  emptyEmoji     : { fontSize:52 },
  emptyTitulo    : { fontSize:18, fontWeight:'bold', color:SILVER },
  emptyTxt       : { fontSize:13, color:SILVER_DARK, textAlign:'center', paddingHorizontal:24, lineHeight:20 },
});