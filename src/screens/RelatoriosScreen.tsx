// screens/RelatoriosScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated, Platform,
  RefreshControl, Dimensions,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { getTodasVisitas }  from '../services/visitaService';
import { getTodosClientes } from '../services/clienteService';
import { getMetas }         from '../services/firebase';
import { preverVendasMesIA } from '../services/aiService';

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

const MESES_NOME = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const REPRESENTADAS = [
  { key:'FORTLEV',       label:'Fortlev',       icon:'water',     color:BLUE        },
  { key:'AFORT',         label:'Afort',          icon:'plumbing',  color:GOLD        },
  { key:'METAL TECH',    label:'Metal Tech',     icon:'settings',  color:SUCCESS     },
  { key:'SOARES TINTAS', label:'Soares Tintas',  icon:'warehouse', color:PURPLE      },
  { key:'geral',         label:'Geral/Outros',   icon:'category',  color:SILVER_DARK },
];

const PRODUTO_LABEL = {
  caixas  : 'Caixas',
  tubos   : 'Tubos',
  conexoes: 'Conexões',
  telhas  : 'Telhas',
  vasos   : 'Vasos',
  metais  : 'Metais',
  tintas  : 'Tintas',
};

const ABAS = [
  { key:'resumo',   label:'Resumo',   icon:'dashboard'   },
  { key:'marcas',   label:'Marcas',   icon:'business'    },
  { key:'clientes', label:'Clientes', icon:'people'      },
  { key:'produtos', label:'Produtos', icon:'inventory-2' },
  { key:'evolucao', label:'Evolução', icon:'show-chart'  },
];

// ════════════════════════════════════════════════════════════════
// FUNÇÕES DE RELATÓRIO
// (TypeScript annotations removidas — JS puro)
// ════════════════════════════════════════════════════════════════

function getVendasMes(visitas, mes, ano) {
  return visitas
    .filter(v => {
      if (v.resultado !== 'comprou') return false;
      const d = new Date(v.dataLocal || v.data || 0);
      return d.getMonth() === mes && d.getFullYear() === ano;
    })
    .reduce((s, v) => s + (v.valor || 0), 0);
}

function getVendasMarca(visitas, mes, ano) {
  const mapa = {};
  visitas.forEach(v => {
    if (v.resultado !== 'comprou') return;
    const d = new Date(v.dataLocal || v.data || 0);
    if (d.getMonth() !== mes || d.getFullYear() !== ano) return;
    const rep = v.representada || 'geral';
    mapa[rep] = (mapa[rep] || 0) + (v.valor || 0);
  });
  return REPRESENTADAS
    .map(r => ({ ...r, valor: mapa[r.key] || 0 }))
    .filter(r => r.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

function getTopClientes(visitas, clientes, mes, ano, n = 10) {
  const mapa = {};
  visitas.forEach(v => {
    if (v.resultado !== 'comprou') return;
    const d = new Date(v.dataLocal || v.data || 0);
    if (d.getMonth() !== mes || d.getFullYear() !== ano) return;
    const id = v.clienteId || v.clienteNome || 'desconhecido';
    if (!mapa[id]) mapa[id] = { valor: 0, qtd: 0 };
    mapa[id].valor += (v.valor || 0);
    mapa[id].qtd   += 1;
  });
  return Object.entries(mapa)
    .map(([id, dados]) => {
      const cli = clientes.find(c => c.id === id);
      return {
        id,
        nome       : cli?.nome || id,
        cidade     : cli?.cidade || '',
        valor      : dados.valor,
        qtdCompras : dados.qtd,
        ticketMedio: dados.qtd > 0 ? dados.valor / dados.qtd : 0,
      };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n);
}

function getProdutosMaisVendidosGeral(visitas, mes, ano) {
  const mapa = {};
  visitas.forEach(v => {
    if (v.resultado !== 'comprou') return;
    const d = new Date(v.dataLocal || v.data || 0);
    if (d.getMonth() !== mes || d.getFullYear() !== ano) return;
    const lista    = Array.isArray(v.produtos) ? v.produtos : [];
    const valorUnit = lista.length > 0 ? (v.valor || 0) / lista.length : 0;
    lista.forEach(p => {
      if (!p) return;
      if (!mapa[p]) mapa[p] = { count: 0, valor: 0 };
      mapa[p].count += 1;
      mapa[p].valor += valorUnit;
    });
  });
  return Object.entries(mapa)
    .map(([key, dados]) => ({
      key,
      label: PRODUTO_LABEL[key] || key,
      count: dados.count,
      valor: dados.valor,
    }))
    .sort((a, b) => b.count - a.count);
}

function getEvolucaoMensal(visitas, mesesAtras = 6) {
  const hoje  = new Date();
  const meses = [];
  for (let i = mesesAtras - 1; i >= 0; i--) {
    const d          = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes        = d.getMonth();
    const ano        = d.getFullYear();
    const total      = getVendasMes(visitas, mes, ano);
    const qtdVisitas = visitas.filter(v => {
      const dv = new Date(v.dataLocal || v.data || 0);
      return dv.getMonth() === mes && dv.getFullYear() === ano;
    }).length;
    const qtdCompras = visitas.filter(v => {
      const dv = new Date(v.dataLocal || v.data || 0);
      return dv.getMonth() === mes && dv.getFullYear() === ano && v.resultado === 'comprou';
    }).length;
    meses.push({
      label: MESES_CURTO[mes], mes, ano, total, qtdVisitas, qtdCompras,
      conversao: qtdVisitas > 0 ? Math.round((qtdCompras / qtdVisitas) * 100) : 0,
    });
  }
  return meses;
}

function getResumoGeral(visitas, mes, ano) {
  const doMes   = visitas.filter(v => {
    const d = new Date(v.dataLocal || v.data || 0);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
  const compras   = doMes.filter(v => v.resultado === 'comprou');
  const totalVend = compras.reduce((s, v) => s + (v.valor || 0), 0);
  const ticket    = compras.length > 0 ? totalVend / compras.length : 0;
  const conversao = doMes.length > 0 ? Math.round((compras.length / doMes.length) * 100) : 0;
  const clientesUnicos = new Set(compras.map(v => v.clienteId)).size;
  return { totalVend, totalVisitas: doMes.length, totalCompras: compras.length, ticket, conversao, clientesUnicos };
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

// ════════════════════════════════════════════════════════════════
// COMPONENTES
// ════════════════════════════════════════════════════════════════

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: Platform.OS !== 'web' })
    ).start();
  }, []);
  return (
    <View style={{ height: 2, width: '100%', backgroundColor: color + '25', overflow: 'hidden' }}>
      <Animated.View style={{
        position: 'absolute', height: '100%', width: 80,
        backgroundColor: color + 'BB',
        transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, SW] }) }],
      }} />
    </View>
  );
}

function Secao({ titulo, cor = GOLD, icone, children }) {
  return (
    <View style={sec.wrap}>
      <View style={sec.header}>
        <View style={[sec.bar, { backgroundColor: cor }]} />
        {icone && <Icon name={icone} size={14} color={cor} type="material" />}
        <Text style={sec.titulo}>{titulo}</Text>
      </View>
      <View style={[sec.body, { borderColor: cor + '18' }]}>{children}</View>
    </View>
  );
}
const sec = StyleSheet.create({
  wrap  : { marginHorizontal: 16, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bar   : { width: 4, height: 18, borderRadius: 2 },
  titulo: { fontSize: 13, fontWeight: '800', color: SILVER_LIGHT, flex: 1 },
  body  : { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, borderWidth: 1 },
});

function KpiCard({ icon, label, value, sub, color = GOLD }) {
  return (
    <View style={[kpi.card, { borderColor: color + '30' }]}>
      <View style={[kpi.iconWrap, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={18} color={color} type="material" />
      </View>
      <Text style={[kpi.value, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={kpi.label}>{label}</Text>
      {sub ? <Text style={kpi.sub}>{sub}</Text> : null}
    </View>
  );
}
const kpi = StyleSheet.create({
  card    : { flex: 1, alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 16, padding: 12, borderWidth: 1, marginHorizontal: 4 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  value   : { fontSize: 18, fontWeight: 'bold' },
  label   : { fontSize: 9, color: SILVER_DARK, marginTop: 2, textAlign: 'center' },
  sub     : { fontSize: 9, color: SILVER_DARK + '80', marginTop: 1, textAlign: 'center' },
});

function BarraValor({ pct, cor, animado = true }) {
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animado) return;
    Animated.timing(barAnim, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct]);
  const width = animado
    ? barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] })
    : `${pct}%`;
  return (
    <View style={{ height: 6, backgroundColor: CARD_BG2, borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <Animated.View style={{ height: '100%', borderRadius: 3, width, backgroundColor: cor }} />
    </View>
  );
}

function RankRow({ idx, nome, sub, valor, pct, cor, icon }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={rr.row}>
      <Text style={rr.medal}>{medals[idx] || `${idx + 1}`}</Text>
      {icon && <Icon name={icon} size={14} color={cor} type="material" />}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={rr.labelRow}>
          <Text style={rr.nome} numberOfLines={1}>{nome}</Text>
          <Text style={[rr.valor, { color: cor }]}>{formatResumo(valor)}</Text>
        </View>
        {sub ? <Text style={rr.sub}>{sub}</Text> : null}
        <BarraValor pct={pct} cor={cor} />
      </View>
    </View>
  );
}
const rr = StyleSheet.create({
  row     : { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14 },
  medal   : { fontSize: 16, width: 24, textAlign: 'center', marginTop: 1 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nome    : { fontSize: 13, fontWeight: '700', color: SILVER_LIGHT, flex: 1, marginRight: 8 },
  valor   : { fontSize: 13, fontWeight: '800' },
  sub     : { fontSize: 10, color: SILVER_DARK },
});

// ✅ CORRIGIDO — BarraGrafico extraído como componente separado para
// evitar erro react-hooks/rules-of-hooks (hooks não podem ser chamados dentro de .map())
function BarraGrafico({ d, i, maxVal, isAtual, metaTotal }) {
  const pct     = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
  const cor     = isAtual ? GOLD : d.total > 0 ? BLUE : CARD_BG2;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue     : pct,
      duration    : 700 + i * 80,
      useNativeDriver: false,
    }).start();
  }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={ge.colWrap}>
      {d.total > 0 && (
        <Text style={[ge.barValor, { color: isAtual ? GOLD : SILVER_DARK }]}>
          {d.total >= 1000 ? `${(d.total / 1000).toFixed(0)}k` : formatReal(d.total)}
        </Text>
      )}
      <View style={ge.barTrack}>
        {metaTotal > 0 && (
          <View style={[ge.metaLine, { bottom: `${Math.min((metaTotal / maxVal) * 100, 100)}%` }]} />
        )}
        <Animated.View style={[ge.bar, {
          height         : barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          backgroundColor: cor,
          opacity        : isAtual ? 1 : 0.7,
        }]} />
      </View>
      <Text style={[ge.barLabel, isAtual && { color: GOLD, fontWeight: '800' }]}>{d.label}</Text>
      <Text style={ge.barConv}>{d.conversao > 0 ? `${d.conversao}%` : '—'}</Text>
    </View>
  );
}

function GraficoEvolucao({ dados, metaTotal }) {
  const maxVal = Math.max(...dados.map(d => d.total), 1);
  return (
    <View style={ge.wrap}>
      {dados.map((d, i) => (
        <BarraGrafico
          key={i}
          d={d}
          i={i}
          maxVal={maxVal}
          isAtual={i === dados.length - 1}
          metaTotal={metaTotal}
        />
      ))}
    </View>
  );
}
const ge = StyleSheet.create({
  wrap    : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 160, paddingTop: 20 },
  colWrap : { flex: 1, alignItems: 'center', gap: 4 },
  barValor: { fontSize: 8, fontWeight: '700', color: SILVER_DARK, marginBottom: 2 },
  barTrack: { flex: 1, width: '70%', backgroundColor: CARD_BG2, borderRadius: 4, overflow: 'visible', justifyContent: 'flex-end', position: 'relative' },
  bar     : { width: '100%', borderRadius: 4 },
  metaLine: { position: 'absolute', left: -2, right: -2, height: 1.5, backgroundColor: DANGER + '70', zIndex: 10 },
  barLabel: { fontSize: 10, color: SILVER_DARK, fontWeight: '600' },
  barConv : { fontSize: 8, color: SILVER_DARK + '80' },
});

function NavMes({ mes, ano, onAnterior, onProximo, bloqueado }) {
  return (
    <View style={nm.wrap}>
      <TouchableOpacity style={nm.btn} onPress={onAnterior} activeOpacity={0.8}>
        <Icon name="chevron-left" size={22} color={GOLD} type="material" />
      </TouchableOpacity>
      <View style={nm.center}>
        <Text style={nm.mes}>{MESES_NOME[mes]}</Text>
        <Text style={nm.ano}>{ano}</Text>
      </View>
      <TouchableOpacity style={[nm.btn, bloqueado && { opacity: 0.3 }]} onPress={onProximo} disabled={bloqueado} activeOpacity={0.8}>
        <Icon name="chevron-right" size={22} color={GOLD} type="material" />
      </TouchableOpacity>
    </View>
  );
}
const nm = StyleSheet.create({
  wrap  : { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: GOLD + '25', overflow: 'hidden' },
  btn   : { width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', gap: 2 },
  mes   : { fontSize: 16, fontWeight: '800', color: SILVER_LIGHT },
  ano   : { fontSize: 11, color: SILVER_DARK },
});

// ✅ NOVO — Card de previsão IA
function CardPrevisaoIA({ previsao, mes }) {
  if (!previsao || previsao.valorPrevisto === 0) return null;

  const isMesAtual = mes === new Date().getMonth();
  if (!isMesAtual) return null; // só exibe para mês atual

  const corConfianca = previsao.confianca === 'alta' ? SUCCESS : previsao.confianca === 'media' ? GOLD : SILVER_DARK;
  const corTendencia = previsao.tendencia > 0 ? SUCCESS : previsao.tendencia < 0 ? DANGER : SILVER_DARK;
  const iconTendencia = previsao.tendencia > 0 ? 'trending-up' : previsao.tendencia < 0 ? 'trending-down' : 'trending-flat';

  return (
    <View style={[pv.container, { borderColor: corConfianca + '35' }]}>
      {/* Header */}
      <View style={pv.header}>
        <View style={[pv.iaIcon, { backgroundColor: corConfianca + '18' }]}>
          <Icon name="auto-awesome" size={14} color={corConfianca} type="material" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pv.titulo}>Previsão do mês (IA)</Text>
          <Text style={pv.sub}>
            {`${previsao.diasDecorridos}/${previsao.diasTotais} dias · ${previsao.pctMes}% do mês`}
          </Text>
        </View>
        <View style={[pv.confBadge, { backgroundColor: corConfianca + '18', borderColor: corConfianca + '40' }]}>
          <Text style={[pv.confTxt, { color: corConfianca }]}>
            {previsao.confianca === 'alta' ? 'Alta' : previsao.confianca === 'media' ? 'Média' : 'Baixa'}
          </Text>
        </View>
      </View>

      {/* Valor previsto */}
      <View style={pv.valoresRow}>
        <View style={pv.valorItem}>
          <Text style={pv.valorLabel}>Previsto</Text>
          <Text style={[pv.valorNum, { color: corConfianca }]}>{formatResumo(previsao.valorPrevisto)}</Text>
        </View>
        <View style={pv.valorDiv} />
        <View style={pv.valorItem}>
          <Text style={pv.valorLabel}>Mínimo</Text>
          <Text style={[pv.valorNum, { color: SILVER_DARK }]}>{formatResumo(previsao.valorMinimo)}</Text>
        </View>
        <View style={pv.valorDiv} />
        <View style={pv.valorItem}>
          <Text style={pv.valorLabel}>Máximo</Text>
          <Text style={[pv.valorNum, { color: SUCCESS }]}>{formatResumo(previsao.valorMaximo)}</Text>
        </View>
      </View>

      {/* Progresso do mês */}
      <View style={pv.progressoWrap}>
        <View style={pv.progressoBar}>
          <View style={[pv.progressoFill, {
            width: `${previsao.pctMes}%`,
            backgroundColor: corConfianca,
          }]} />
          {/* Marcador de valor atual */}
          <View style={[pv.progressoAtual, { left: `${previsao.pctMes}%` }]} />
        </View>
        <View style={pv.progressoLabels}>
          <Text style={pv.progressoLbl}>Hoje: {formatResumo(previsao.valorAtual)}</Text>
          <View style={[pv.tendBadge, { backgroundColor: corTendencia + '18' }]}>
            <Icon name={iconTendencia} size={11} color={corTendencia} type="material" />
            <Text style={[pv.tendTxt, { color: corTendencia }]}>
              {previsao.tendencia !== 0
                ? `${previsao.tendencia > 0 ? '+' : ''}${previsao.tendencia}% tendência`
                : 'Estável'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
const pv = StyleSheet.create({
  container   : { marginHorizontal: 16, marginBottom: 16, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header      : { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 10 },
  iaIcon      : { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  titulo      : { fontSize: 13, fontWeight: '800', color: SILVER_LIGHT },
  sub         : { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  confBadge   : { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  confTxt     : { fontSize: 10, fontWeight: '800' },
  valoresRow  : { flexDirection: 'row', backgroundColor: CARD_BG2, paddingVertical: 12 },
  valorItem   : { flex: 1, alignItems: 'center', gap: 3 },
  valorDiv    : { width: 1, backgroundColor: SILVER + '15' },
  valorLabel  : { fontSize: 9, color: SILVER_DARK, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  valorNum    : { fontSize: 15, fontWeight: '900' },
  progressoWrap: { padding: 14, paddingTop: 10 },
  progressoBar : { height: 6, backgroundColor: CARD_BG2, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressoFill: { height: '100%', borderRadius: 3 },
  progressoAtual:{ position: 'absolute', top: -3, width: 2, height: 12, backgroundColor: SILVER_LIGHT, borderRadius: 1 },
  progressoLabels:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressoLbl : { fontSize: 10, color: SILVER_DARK, fontWeight: '600' },
  tendBadge   : { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  tendTxt     : { fontSize: 10, fontWeight: '700' },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function RelatoriosScreen({ navigation }) {
  const agora = new Date();
  const [mesSel,     setMesSel]     = useState(agora.getMonth());
  const [anoSel,     setAnoSel]     = useState(agora.getFullYear());
  const [abaAtiva,   setAbaAtiva]   = useState('resumo');

  const [visitas,    setVisitas]    = useState([]);
  const [clientes,   setClientes]   = useState([]);
  const [metas,      setMetas]      = useState({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // ✅ Previsão IA
  const [previsaoIA, setPrevisaoIA] = useState(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const scrollRef = useRef(null);

  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    try {
      const [vis, clts, mts] = await Promise.all([
        getTodasVisitas(),
        getTodosClientes(),
        getMetas(),
      ]);
      setVisitas(vis   || []);
      setClientes(clts || []);
      setMetas(mts     || {});

      // ✅ Previsão IA — só calcula para o mês atual
      setPrevisaoIA(preverVendasMesIA(vis || []));

    } catch (e) {
      console.log('[Relatorios] erro:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Dados calculados ──────────────────────────────────────────
  const resumo       = getResumoGeral(visitas, mesSel, anoSel);
  const vendasMarca  = getVendasMarca(visitas, mesSel, anoSel);
  const topClientes  = getTopClientes(visitas, clientes, mesSel, anoSel);
  const produtosRank = getProdutosMaisVendidosGeral(visitas, mesSel, anoSel);
  const evolucao     = getEvolucaoMensal(visitas, 6);

  const metaTotal  = REPRESENTADAS.reduce((s, r) => s + (metas[r.key] || 0), 0);
  const pctMeta    = metaTotal > 0 ? Math.round((resumo.totalVend / metaTotal) * 100) : null;
  const corMeta    = pctMeta == null ? SILVER_DARK
    : pctMeta >= 100 ? SUCCESS : pctMeta >= 60 ? GOLD : pctMeta >= 30 ? WARN : DANGER;

  const mesAnt    = mesSel === 0 ? 11 : mesSel - 1;
  const anoAnt    = mesSel === 0 ? anoSel - 1 : anoSel;
  const vendAnt   = getVendasMes(visitas, mesAnt, anoAnt);
  const variacao  = vendAnt > 0
    ? Math.round(((resumo.totalVend - vendAnt) / vendAnt) * 100)
    : null;

  const maxMarca   = vendasMarca.length  > 0 ? vendasMarca[0].valor  : 1;
  const maxCliente = topClientes.length  > 0 ? topClientes[0].valor  : 1;
  const maxProduto = produtosRank.length > 0 ? produtosRank[0].count : 1;

  const mesAnterior = () => {
    if (mesSel === 0) { setMesSel(11); setAnoSel(a => a - 1); }
    else setMesSel(m => m - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  const mesProximo = () => {
    if (mesSel === 11) { setMesSel(0); setAnoSel(a => a + 1); }
    else setMesSel(m => m + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };
  const bloqueado = mesSel === agora.getMonth() && anoSel === agora.getFullYear();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK_BG, justifyContent: 'center', alignItems: 'center' }}>
        <View style={ds.loadingIconWrap}>
          <Icon name="assessment" size={32} color={GOLD} type="material" />
        </View>
        <Text style={{ color: SILVER, fontSize: 14, fontWeight: '600', marginTop: 16 }}>
          Gerando relatórios...
        </Text>
        <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} />
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
          {navigation?.canGoBack?.() && (
            <TouchableOpacity style={ds.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Icon name="arrow-back" size={20} color={SILVER_LIGHT} type="material" />
            </TouchableOpacity>
          )}
          <View style={ds.headerIconWrap}>
            <Icon name="assessment" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ds.headerTitulo}>Relatórios</Text>
            <Text style={ds.headerSub}>
              {`${MESES_NOME[mesSel]} ${anoSel}`}
              {pctMeta !== null ? ` · ${pctMeta}% da meta` : ''}
            </Text>
          </View>
          <TouchableOpacity style={ds.iconBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>

        {/* Abas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ds.abasRow}>
          {ABAS.map(aba => (
            <TouchableOpacity
              key={aba.key}
              style={[ds.abaBtn, abaAtiva === aba.key && ds.abaBtnAtiva]}
              onPress={() => { setAbaAtiva(aba.key); scrollRef.current?.scrollTo({ y: 0, animated: true }); }}
              activeOpacity={0.8}>
              <Icon name={aba.icon} size={13} color={abaAtiva === aba.key ? DARK_BG : SILVER_DARK} type="material" />
              <Text style={[ds.abaTxt, abaAtiva === aba.key && ds.abaTxtAtiva]}>{aba.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ShimmerLine color={GOLD} />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        contentContainerStyle={ds.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={GOLD} colors={[GOLD]} />
        }>

        {/* ══ NAVEGADOR DE MÊS ══ */}
        <NavMes mes={mesSel} ano={anoSel} onAnterior={mesAnterior} onProximo={mesProximo} bloqueado={bloqueado} />

        {/* ══ ABA: RESUMO ══ */}
        {abaAtiva === 'resumo' && (
          <>
            {/* Total vendas destaque */}
            <View style={ds.totalCard}>
              <View style={ds.totalLeft}>
                <Text style={ds.totalLabel}>{`Total de vendas — ${MESES_NOME[mesSel]}`}</Text>
                <Text style={[ds.totalValor, { color: resumo.totalVend > 0 ? SUCCESS : SILVER_DARK }]}>
                  {`R$ ${formatReal(resumo.totalVend)}`}
                </Text>
                {variacao !== null && (
                  <View style={ds.variacaoRow}>
                    <Icon name={variacao >= 0 ? 'arrow-upward' : 'arrow-downward'} size={12}
                      color={variacao >= 0 ? SUCCESS : DANGER} type="material" />
                    <Text style={[ds.variacaoTxt, { color: variacao >= 0 ? SUCCESS : DANGER }]}>
                      {`${variacao >= 0 ? '+' : ''}${variacao}% vs ${MESES_CURTO[mesAnt]}`}
                    </Text>
                  </View>
                )}
              </View>
              {pctMeta !== null && (
                <View style={[ds.metaBadge, { backgroundColor: corMeta + '18', borderColor: corMeta + '45' }]}>
                  <Icon name="flag" size={13} color={corMeta} type="material" />
                  <Text style={[ds.metaBadgeTxt, { color: corMeta }]}>{`${pctMeta}%\nda meta`}</Text>
                </View>
              )}
            </View>

            {/* ✅ Card de previsão IA (só mês atual) */}
            <CardPrevisaoIA previsao={previsaoIA} mes={mesSel} />

            {/* KPIs 3x2 */}
            <View style={ds.kpiRow}>
              <KpiCard icon="receipt-long" label="Total vendas"    value={formatResumo(resumo.totalVend)} color={SUCCESS} />
              <KpiCard icon="show-chart"   label="Conversão"       value={`${resumo.conversao}%`}          color={resumo.conversao >= 50 ? SUCCESS : WARN} />
            </View>
            <View style={[ds.kpiRow, { marginTop: 0 }]}>
              <KpiCard icon="pin-drop"     label="Visitas"         value={resumo.totalVisitas}              color={BLUE}   />
              <KpiCard icon="people"       label="Clientes ativos" value={resumo.clientesUnicos}            color={PURPLE} />
            </View>
            <View style={[ds.kpiRow, { marginTop: 0 }]}>
              <KpiCard icon="attach-money" label="Ticket médio"    value={formatResumo(resumo.ticket)}      color={GOLD}   />
              <KpiCard icon="check-circle" label="Compras"         value={resumo.totalCompras}              color={SUCCESS} />
            </View>

            {/* Top 3 marcas */}
            {vendasMarca.length > 0 && (
              <Secao titulo="Top marcas do mês" cor={GOLD} icone="business">
                {vendasMarca.slice(0, 3).map((r, idx) => (
                  <RankRow key={r.key} idx={idx} nome={r.label} sub={null}
                    valor={r.valor} pct={Math.round((r.valor / maxMarca) * 100)}
                    cor={r.color} icon={r.icon} />
                ))}
              </Secao>
            )}

            {/* Top 3 clientes */}
            {topClientes.length > 0 && (
              <Secao titulo="Top clientes do mês" cor={BLUE} icone="people">
                {topClientes.slice(0, 3).map((c, idx) => (
                  <RankRow key={c.id} idx={idx} nome={c.nome} sub={c.cidade || null}
                    valor={c.valor} pct={Math.round((c.valor / maxCliente) * 100)} cor={BLUE} />
                ))}
              </Secao>
            )}
          </>
        )}

        {/* ══ ABA: MARCAS ══ */}
        {abaAtiva === 'marcas' && (
          <>
            {vendasMarca.length === 0 ? (
              <View style={ds.emptyWrap}>
                <Text style={ds.emptyEmoji}>📊</Text>
                <Text style={ds.emptyTitulo}>Sem vendas neste mês</Text>
                <Text style={ds.emptyTxt}>Registre visitas com resultado "comprou" para ver o relatório</Text>
              </View>
            ) : (
              <Secao titulo="Vendas por representada" cor={GOLD} icone="business">
                <View style={ds.totalMarcaRow}>
                  <Text style={ds.totalMarcaLabel}>Total do mês</Text>
                  <Text style={[ds.totalMarcaValor, { color: SUCCESS }]}>
                    {`R$ ${formatReal(resumo.totalVend)}`}
                  </Text>
                </View>
                <View style={{ height: 1, backgroundColor: SILVER + '12', marginBottom: 14 }} />
                {vendasMarca.map((r, idx) => {
                  const pct      = Math.round((r.valor / resumo.totalVend) * 100);
                  const meta     = metas[r.key] || 0;
                  const pctMetaR = meta > 0 ? Math.round((r.valor / meta) * 100) : null;
                  const corR     = pctMetaR == null ? r.color
                    : pctMetaR >= 100 ? SUCCESS : pctMetaR >= 60 ? GOLD : pctMetaR >= 30 ? WARN : DANGER;
                  return (
                    <View key={r.key} style={ds.marcaRow}>
                      <View style={[ds.marcaDot, { backgroundColor: r.color }]} />
                      <View style={{ flex: 1, gap: 5 }}>
                        <View style={ds.marcaLabelRow}>
                          <View style={[ds.marcaIconWrap, { backgroundColor: r.color + '18' }]}>
                            <Icon name={r.icon} size={13} color={r.color} type="material" />
                          </View>
                          <Text style={ds.marcaNome}>{r.label}</Text>
                          <Text style={[ds.marcaValor, { color: r.color }]}>{formatResumo(r.valor)}</Text>
                        </View>
                        <BarraValor pct={pct} cor={r.color} />
                        <View style={ds.marcaInfoRow}>
                          <Text style={ds.marcaPct}>{`${pct}% do total`}</Text>
                          {pctMetaR !== null && (
                            <Text style={[ds.marcaMeta, { color: corR }]}>
                              {`Meta: ${pctMetaR}% (${formatResumo(meta)})`}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Secao>
            )}
          </>
        )}

        {/* ══ ABA: CLIENTES ══ */}
        {abaAtiva === 'clientes' && (
          <>
            {topClientes.length === 0 ? (
              <View style={ds.emptyWrap}>
                <Text style={ds.emptyEmoji}>👥</Text>
                <Text style={ds.emptyTitulo}>Sem compras neste mês</Text>
                <Text style={ds.emptyTxt}>Os clientes aparecerão aqui quando houver compras registradas</Text>
              </View>
            ) : (
              <Secao titulo={`Top ${topClientes.length} clientes — ${MESES_NOME[mesSel]}`} cor={BLUE} icone="people">
                {topClientes.map((c, idx) => (
                  <View key={c.id} style={ds.clienteRow}>
                    <View style={[ds.clientePos, {
                      backgroundColor: idx === 0 ? GOLD + '25' : idx === 1 ? SILVER + '18' : idx === 2 ? WARN + '20' : CARD_BG2,
                    }]}>
                      <Text style={[ds.clientePosNum, {
                        color: idx === 0 ? GOLD : idx === 1 ? SILVER : idx === 2 ? WARN : SILVER_DARK,
                      }]}>
                        {['🥇', '🥈', '🥉'][idx] || idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={ds.clienteLabelRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={ds.clienteNome} numberOfLines={1}>{c.nome}</Text>
                          {c.cidade ? <Text style={ds.clienteCidade}>{c.cidade}</Text> : null}
                        </View>
                        <Text style={[ds.clienteValor, { color: BLUE }]}>{formatResumo(c.valor)}</Text>
                      </View>
                      <BarraValor pct={Math.round((c.valor / maxCliente) * 100)} cor={BLUE} />
                      <View style={ds.clienteMetricsRow}>
                        <Text style={ds.clienteMetric}>{`${c.qtdCompras} compra${c.qtdCompras !== 1 ? 's' : ''}`}</Text>
                        <Text style={ds.clienteMetricSep}>·</Text>
                        <Text style={ds.clienteMetric}>{`Ticket: ${formatResumo(c.ticketMedio)}`}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={ds.clienteVerBtn}
                      onPress={() => {
                        const cli = clientes.find(cl => cl.id === c.id);
                        if (cli) navigation?.navigate?.('HistoricoCliente', { cliente: cli });
                      }}
                      activeOpacity={0.8}>
                      <Icon name="chevron-right" size={18} color={SILVER_DARK} type="material" />
                    </TouchableOpacity>
                  </View>
                ))}
              </Secao>
            )}
          </>
        )}

        {/* ══ ABA: PRODUTOS ══ */}
        {abaAtiva === 'produtos' && (
          <>
            {produtosRank.length === 0 ? (
              <View style={ds.emptyWrap}>
                <Text style={ds.emptyEmoji}>📦</Text>
                <Text style={ds.emptyTitulo}>Sem produtos registrados</Text>
                <Text style={ds.emptyTxt}>Selecione produtos ao registrar uma venda no Check-in</Text>
              </View>
            ) : (
              <Secao titulo={`Produtos mais vendidos — ${MESES_NOME[mesSel]}`} cor={PURPLE} icone="inventory-2">
                {produtosRank.map((p, idx) => {
                  const pct    = Math.round((p.count / maxProduto) * 100);
                  const medals = ['🥇', '🥈', '🥉'];
                  const cores  = [GOLD, SILVER, WARN, BLUE, PURPLE, SUCCESS, DANGER];
                  const cor    = cores[idx % cores.length];
                  return (
                    <View key={p.key} style={ds.produtoRow}>
                      <Text style={ds.produtoMedal}>{medals[idx] || `${idx + 1}`}</Text>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={ds.produtoLabelRow}>
                          <Text style={ds.produtoNome}>{p.label}</Text>
                          <View style={[ds.produtoBadge, { backgroundColor: cor + '18', borderColor: cor + '35' }]}>
                            <Text style={[ds.produtoBadgeTxt, { color: cor }]}>{`${p.count}x`}</Text>
                          </View>
                        </View>
                        <BarraValor pct={pct} cor={cor} />
                        {p.valor > 0 && <Text style={ds.produtoValor}>{`≈ ${formatResumo(p.valor)} estimado`}</Text>}
                      </View>
                    </View>
                  );
                })}
              </Secao>
            )}
          </>
        )}

        {/* ══ ABA: EVOLUÇÃO ══ */}
        {abaAtiva === 'evolucao' && (
          <>
            <Secao titulo="Vendas — últimos 6 meses" cor={SUCCESS} icone="show-chart">
              <GraficoEvolucao dados={evolucao} metaTotal={metaTotal} />
              {metaTotal > 0 && (
                <View style={ds.legendaMeta}>
                  <View style={[ds.legendaMetaLinha, { backgroundColor: DANGER }]} />
                  <Text style={ds.legendaMetaTxt}>{`Linha de meta mensal: ${formatResumo(metaTotal)}`}</Text>
                </View>
              )}
            </Secao>

            <Secao titulo="Comparativo mensal" cor={BLUE} icone="table-chart">
              <View style={[ds.tabelaRow, ds.tabelaHeader]}>
                <Text style={[ds.tabelaCell, ds.tabelaHeaderTxt, { flex: 2 }]}>Mês</Text>
                <Text style={[ds.tabelaCell, ds.tabelaHeaderTxt]}>Vendas</Text>
                <Text style={[ds.tabelaCell, ds.tabelaHeaderTxt]}>Visitas</Text>
                <Text style={[ds.tabelaCell, ds.tabelaHeaderTxt]}>Conv.</Text>
              </View>
              {[...evolucao].reverse().map((d, idx) => {
                const isAtual = idx === 0;
                return (
                  <View key={idx} style={[ds.tabelaRow, isAtual && ds.tabelaRowAtual]}>
                    <Text style={[ds.tabelaCell, { flex: 2, color: isAtual ? GOLD : SILVER_LIGHT, fontWeight: isAtual ? '800' : '600' }]}>
                      {d.label} {d.ano !== agora.getFullYear() ? d.ano : ''}
                    </Text>
                    <Text style={[ds.tabelaCell, { color: d.total > 0 ? SUCCESS : SILVER_DARK }]}>
                      {d.total > 0 ? formatResumo(d.total) : '—'}
                    </Text>
                    <Text style={[ds.tabelaCell, { color: BLUE }]}>{d.qtdVisitas}</Text>
                    <Text style={[ds.tabelaCell, { color: d.conversao >= 50 ? SUCCESS : d.conversao > 0 ? WARN : SILVER_DARK }]}>
                      {d.conversao > 0 ? `${d.conversao}%` : '—'}
                    </Text>
                  </View>
                );
              })}
            </Secao>
          </>
        )}

        <View style={{ height: 90 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════
const ds = StyleSheet.create({
  container      : { flex: 1, backgroundColor: DARK_BG },
  scroll         : { paddingTop: 14, paddingBottom: 40 },
  loadingIconWrap: { width: 72, height: 72, borderRadius: 24, backgroundColor: CARD_BG, borderWidth: 1, borderColor: GOLD + '40', justifyContent: 'center', alignItems: 'center' },

  header        : { backgroundColor: '#001828', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', elevation: 10 },
  headerAccent  : { height: 3, backgroundColor: GOLD },
  headerRow     : { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 10 },
  backBtn       : { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  headerIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitulo  : { fontSize: 18, fontWeight: 'bold', color: SILVER_LIGHT },
  headerSub     : { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  iconBtn       : { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },

  abasRow    : { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  abaBtn     : { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '25' },
  abaBtnAtiva: { backgroundColor: GOLD, borderColor: GOLD },
  abaTxt     : { fontSize: 11, fontWeight: '700', color: SILVER_DARK },
  abaTxtAtiva: { color: DARK_BG },

  totalCard    : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 16, backgroundColor: SUCCESS + '12', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: SUCCESS + '30' },
  totalLeft    : { gap: 3 },
  totalLabel   : { fontSize: 11, color: SILVER_DARK, fontWeight: '600' },
  totalValor   : { fontSize: 28, fontWeight: 'bold' },
  variacaoRow  : { flexDirection: 'row', alignItems: 'center', gap: 3 },
  variacaoTxt  : { fontSize: 11, fontWeight: '700' },
  metaBadge    : { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, gap: 3 },
  metaBadgeTxt : { fontSize: 13, fontWeight: '800', textAlign: 'center' },

  kpiRow       : { flexDirection: 'row', marginHorizontal: 12, marginBottom: 10 },

  totalMarcaRow  : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  totalMarcaLabel: { fontSize: 12, color: SILVER_DARK, fontWeight: '600' },
  totalMarcaValor: { fontSize: 16, fontWeight: '800' },
  marcaRow       : { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  marcaDot       : { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  marcaLabelRow  : { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marcaIconWrap  : { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  marcaNome      : { flex: 1, fontSize: 13, fontWeight: '700', color: SILVER_LIGHT },
  marcaValor     : { fontSize: 13, fontWeight: '800' },
  marcaInfoRow   : { flexDirection: 'row', justifyContent: 'space-between' },
  marcaPct       : { fontSize: 10, color: SILVER_DARK },
  marcaMeta      : { fontSize: 10, fontWeight: '700' },

  clienteRow       : { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  clientePos       : { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  clientePosNum    : { fontSize: 16, fontWeight: '900' },
  clienteLabelRow  : { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  clienteNome      : { fontSize: 13, fontWeight: '700', color: SILVER_LIGHT },
  clienteCidade    : { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  clienteValor     : { fontSize: 14, fontWeight: '800' },
  clienteMetricsRow: { flexDirection: 'row', gap: 6 },
  clienteMetric    : { fontSize: 10, color: SILVER_DARK, fontWeight: '600' },
  clienteMetricSep : { fontSize: 10, color: SILVER_DARK },
  clienteVerBtn    : { padding: 4 },

  produtoRow     : { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  produtoMedal   : { fontSize: 16, width: 26, textAlign: 'center', marginTop: 2 },
  produtoLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  produtoNome    : { fontSize: 13, fontWeight: '700', color: SILVER_LIGHT },
  produtoBadge   : { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  produtoBadgeTxt: { fontSize: 11, fontWeight: '800' },
  produtoValor   : { fontSize: 10, color: SILVER_DARK, fontStyle: 'italic' },

  tabelaRow      : { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  tabelaHeader   : { borderBottomWidth: 1, borderBottomColor: SILVER + '20', marginBottom: 4 },
  tabelaHeaderTxt: { color: SILVER_DARK, fontWeight: '800', fontSize: 10, letterSpacing: 0.4 },
  tabelaRowAtual : { backgroundColor: GOLD + '08', borderRadius: 8 },
  tabelaCell     : { flex: 1, fontSize: 12, fontWeight: '600', color: SILVER_LIGHT, textAlign: 'center' },

  legendaMeta      : { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: SILVER + '12' },
  legendaMetaLinha : { width: 20, height: 2, borderRadius: 1 },
  legendaMetaTxt   : { fontSize: 11, color: SILVER_DARK },

  emptyWrap  : { alignItems: 'center', paddingVertical: 60, gap: 10, marginHorizontal: 16 },
  emptyEmoji : { fontSize: 48 },
  emptyTitulo: { fontSize: 16, fontWeight: 'bold', color: SILVER, textAlign: 'center' },
  emptyTxt   : { fontSize: 12, color: SILVER_DARK, textAlign: 'center', lineHeight: 18 },
});