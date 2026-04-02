// screens/HistoricoClienteScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 4 — HISTÓRICO DO CLIENTE
//
// FUSÃO v3 — sobre doc 21:
//
//   [FIX] HistoricoItem — fotos aceita arrays e strings
//     Com o novo CheckinScreen, fotos = { estoque:['uri1','uri2'], gondola:['uri3'] }
//     O código anterior usava Object.keys(visita.fotos).length que conta
//     tipos (2), não fotos reais (5).
//     Também não filtrava tipos com array vazio — exibia "gondola" mesmo sem fotos.
//     Correção: helper inline contarFotos() aceita Array[], string URI e {}
//
//   Mantidos integralmente:
//     Todos os componentes, funções, styles, lógica de carga e navegação.
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated, Platform,
  RefreshControl, Dimensions, Share,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { getTodasVisitas }            from '../services/visitaService';
import { getResumoCliente }           from '../services/analyticsService';
import {
  calcularPrioridadeClienteIA,
  preverReposicaoIA,
}                                     from '../services/aiService';

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

const PRODUTO_LABEL = {
  caixas  : 'Caixas',  tubos   : 'Tubos',    conexoes: 'Conexões',
  telhas  : 'Telhas',  vasos   : 'Vasos',    metais  : 'Metais',
  tintas  : 'Tintas',
};

const MOTIVO_LABEL = {
  semestoque   : 'Sem espaço / estoque cheio',
  precoalto    : 'Preço acima do esperado',
  outroforn    : 'Comprou de outro fornecedor',
  proximasemana: 'Vai comprar na próxima visita',
  ausente      : 'Cliente estava ausente',
  seminteresse : 'Sem interesse no momento',
  aguardpgto   : 'Aguardando pagamento',
  outro        : 'Outro motivo',
};

const FILTROS_HISTORICO = [
  { key:'todos',      label:'Todos',      icone:'history',      cor:PURPLE  },
  { key:'comprou',    label:'Compras',    icone:'check-circle', cor:SUCCESS },
  { key:'naocomprou', label:'Sem compra', icone:'cancel',       cor:DANGER  },
  { key:'telefone',   label:'Telefone',   icone:'phone',        cor:BLUE    },
];

function getHistoricoVisitas(clienteId, todasVisitas) {
  return todasVisitas
    .filter(v => v.clienteId === clienteId)
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
}

function getMotivosMaisFrequentes(clienteId, todasVisitas) {
  const contagem = {};
  todasVisitas
    .filter(v => v.clienteId === clienteId && v.resultado === 'naocomprou')
    .forEach(v => {
      const lista = Array.isArray(v.motivos) && v.motivos.length > 0
        ? v.motivos : (v.motivo ? [v.motivo] : []);
      lista.forEach(m => { if (m) contagem[m] = (contagem[m] || 0) + 1; });
    });
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: MOTIVO_LABEL[key] || key, count }));
}

function getTaxaConversao(clienteId, todasVisitas) {
  const hist = todasVisitas.filter(v => v.clienteId === clienteId);
  if (!hist.length) return 0;
  const comp = hist.filter(v => v.resultado === 'comprou').length;
  return Math.round((comp / hist.length) * 100);
}

function getValorTotalCliente(clienteId, todasVisitas) {
  return todasVisitas
    .filter(v => v.clienteId === clienteId && v.resultado === 'comprou')
    .reduce((s, v) => s + (v.valor || 0), 0);
}

// ════════════════════════════════════════════════════════════════
// [FIX] contarFotos — aceita { tipo: URI[] } e { tipo: 'uri' }
// Retorna { tipos: string[], qtdTotal: number }
// Filtra tipos com array vazio ou valor falsy.
// ════════════════════════════════════════════════════════════════
function contarFotos(fotos) {
  if (!fotos || typeof fotos !== 'object') return { tipos: [], qtdTotal: 0 };
  const tiposValidos = Object.entries(fotos).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : !!v
  );
  const qtdTotal = tiposValidos.reduce((s, [, v]) =>
    s + (Array.isArray(v) ? v.length : 1), 0
  );
  return { tipos: tiposValidos.map(([k]) => k), qtdTotal };
}

// ── Helpers ─────────────────────────────────────────────────────
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
  try { return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch { return iso; }
}
function formatDataCurta(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }); }
  catch { return iso; }
}
function formatHora(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
  catch { return ''; }
}

// ════════════════════════════════════════════════════════════════
// COMPONENTES VISUAIS
// ════════════════════════════════════════════════════════════════

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver:Platform.OS !== 'web' })
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ height:2, width:'100%', backgroundColor:color+'30', overflow:'hidden' }}>
      <Animated.View style={{
        position:'absolute', height:'100%', width:80, backgroundColor:color+'CC',
        transform:[{ translateX:anim.interpolate({ inputRange:[0,1], outputRange:[-80,SW] }) }],
      }} />
    </View>
  );
}

function KpiCard({ icon, label, value, sub, color = GOLD }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[kpi.card, { borderColor:color+'30', opacity:fadeAnim }]}>
      <View style={[kpi.iconWrap, { backgroundColor:color+'18' }]}>
        <Icon name={icon} size={18} color={color} type="material" />
      </View>
      <Text style={[kpi.value, { color }]}>{value}</Text>
      <Text style={kpi.label}>{label}</Text>
      {sub ? <Text style={kpi.sub}>{sub}</Text> : null}
    </Animated.View>
  );
}
const kpi = StyleSheet.create({
  card    : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:16, padding:14, borderWidth:1, marginHorizontal:4 },
  iconWrap: { width:38, height:38, borderRadius:12, justifyContent:'center', alignItems:'center', marginBottom:8 },
  value   : { fontSize:20, fontWeight:'bold' },
  label   : { fontSize:10, color:SILVER_DARK, marginTop:2, textAlign:'center', letterSpacing:0.3 },
  sub     : { fontSize:9, color:SILVER_DARK+'80', marginTop:2, textAlign:'center' },
});

function BarraProgresso({ pct, cor }) {
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue:Math.min(pct, 100), duration:700, useNativeDriver:false }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);
  return (
    <View style={bar.bg}>
      <Animated.View style={[bar.fill, {
        width     : barAnim.interpolate({ inputRange:[0,100], outputRange:['0%','100%'] }),
        backgroundColor: cor,
      }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  bg  : { height:6, backgroundColor:CARD_BG2, borderRadius:4, overflow:'hidden', flex:1 },
  fill: { height:'100%', borderRadius:4 },
});

function ProdutoRankCard({ produto, idx, maxVezes }) {
  const pct    = maxVezes > 0 ? Math.round((produto.vezes / maxVezes) * 100) : 0;
  const medals = ['🥇','🥈','🥉'];
  const cor    = idx === 0 ? GOLD : idx === 1 ? SILVER : idx === 2 ? WARN : SILVER_DARK;
  return (
    <View style={prk.row}>
      <Text style={prk.medal}>{medals[idx] || `${idx + 1}.`}</Text>
      <View style={{ flex:1, gap:4 }}>
        <View style={prk.labelRow}>
          <Text style={prk.nome}>{PRODUTO_LABEL[produto.nome] || produto.nome}</Text>
          <Text style={[prk.count, { color:cor }]}>{produto.vezes}x</Text>
        </View>
        <BarraProgresso pct={pct} cor={cor} />
      </View>
    </View>
  );
}
const prk = StyleSheet.create({
  row     : { flexDirection:'row', alignItems:'center', gap:10, marginBottom:12 },
  medal   : { fontSize:18, width:26, textAlign:'center' },
  labelRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  nome    : { fontSize:13, fontWeight:'700', color:SILVER_LIGHT },
  count   : { fontSize:12, fontWeight:'800' },
});

// ════════════════════════════════════════════════════════════════
// ✅ HistoricoItem
// [FIX] fotos: usa contarFotos() que aceita arrays e strings
// ════════════════════════════════════════════════════════════════
function HistoricoItem({ visita, isUltima }) {
  const comprou  = visita.resultado === 'comprou';
  const retornar = visita.resultado === 'retornar';
  const cor      = comprou ? SUCCESS : retornar ? WARN : DANGER;
  const icone    = comprou ? 'check-circle' : retornar ? 'schedule' : 'cancel';
  const label    = comprou ? 'Comprou' : retornar ? 'Retornar' : 'Não comprou';

  const produtos = Array.isArray(visita.produtos) && visita.produtos.length > 0
    ? visita.produtos.map(p => PRODUTO_LABEL[p] || p).join(', ')
    : '';
  const motivosArr = Array.isArray(visita.motivos) && visita.motivos.length > 0
    ? visita.motivos : (visita.motivo ? [visita.motivo] : []);
  const motivosTxt = motivosArr.map(m => MOTIVO_LABEL[m] || m).join(', ');

  const canal    = visita.tipoRegistro === 'telefone' ? '📞' : '🏪';
  const [expandido, setExpandido] = useState(false);

  // [FIX] contarFotos aceita { tipo: string[] } e { tipo: 'uri' }
  const { tipos: tiposFotos, qtdTotal: qtdFotos } = contarFotos(visita.fotos);

  return (
    <View style={[hi.row, isUltima && hi.rowLast]}>
      <View style={hi.timelineCol}>
        <View style={[hi.dot, { backgroundColor:cor }]} />
        {!isUltima && <View style={hi.line} />}
      </View>

      <TouchableOpacity
        style={hi.content}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>

        <View style={hi.topRow}>
          <Text style={hi.data}>{formatDataCurta(visita.dataLocal)}</Text>
          <Text style={hi.hora}>{formatHora(visita.dataLocal)}</Text>
          <View style={{ flex:1 }} />
          <Text style={hi.canal}>{canal}</Text>
          <View style={[hi.badge, { backgroundColor:cor+'18', borderColor:cor+'50' }]}>
            <Icon name={icone} size={10} color={cor} type="material" />
            <Text style={[hi.badgeTxt, { color:cor }]}>{label}</Text>
          </View>
          <Icon name={expandido ? 'expand-less' : 'expand-more'} size={14} color={SILVER_DARK} type="material" />
        </View>

        {comprou && visita.valor > 0 && (
          <Text style={hi.valor}>{`R$ ${formatReal(visita.valor)}`}</Text>
        )}
        {comprou && produtos ? (
          <View style={hi.infoRow}>
            <Icon name="inventory-2" size={11} color={SILVER_DARK} type="material" />
            <Text style={hi.infoTxt} numberOfLines={expandido ? undefined : 1}>{produtos}</Text>
          </View>
        ) : null}
        {!comprou && motivosTxt ? (
          <View style={hi.infoRow}>
            <Icon name="info-outline" size={11} color={DANGER+'CC'} type="material" />
            <Text style={[hi.infoTxt, { color:DANGER+'CC' }]} numberOfLines={expandido ? undefined : 1}>{motivosTxt}</Text>
          </View>
        ) : null}
        {(visita.observacoes || visita.observacao) ? (
          <View style={hi.infoRow}>
            <Icon name="notes" size={11} color={SILVER_DARK} type="material" />
            <Text style={hi.infoTxt} numberOfLines={expandido ? undefined : 2}>
              {visita.observacoes || visita.observacao}
            </Text>
          </View>
        ) : null}

        {expandido && (
          <View style={hi.expandidoWrap}>
            {visita.representada && visita.representada !== 'geral' && (
              <View style={hi.infoRow}>
                <Icon name="business" size={11} color={BLUE} type="material" />
                <Text style={[hi.infoTxt, { color:BLUE }]}>{visita.representada}</Text>
              </View>
            )}
            {visita.proximaVisita ? (
              <View style={hi.infoRow}>
                <Icon name="event" size={11} color={GOLD} type="material" />
                <Text style={[hi.infoTxt, { color:GOLD }]}>Próxima: {visita.proximaVisita}</Text>
              </View>
            ) : null}
            {visita.localizacao?.latitude ? (
              <View style={hi.infoRow}>
                <Icon name="gps-fixed" size={11} color={SUCCESS} type="material" />
                <Text style={[hi.infoTxt, { color:SUCCESS }]}>GPS registrado</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* [FIX] Fotos: contarFotos() aceita arrays (novo) e string URI (legado) */}
        {qtdFotos > 0 && (
          <View style={hi.infoRow}>
            <Icon name="photo-camera" size={11} color={PURPLE} type="material" />
            <Text style={[hi.infoTxt, { color:PURPLE }]}>
              {`${qtdFotos} foto${qtdFotos > 1 ? 's' : ''} (${tiposFotos.join(', ')})`}
            </Text>
          </View>
        )}

        {visita.aiScore >= 45 && (
          <View style={[hi.iaBadge, {
            backgroundColor : visita.aiScore >= 70 ? DANGER+'18' : WARN+'18',
            borderColor     : visita.aiScore >= 70 ? DANGER+'40' : WARN+'40',
          }]}>
            <Icon name="auto-awesome" size={9} color={visita.aiScore >= 70 ? DANGER : WARN} type="material" />
            <Text style={[hi.iaTxt, { color: visita.aiScore >= 70 ? DANGER : WARN }]}>Score IA {visita.aiScore}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
const hi = StyleSheet.create({
  row          : { flexDirection:'row', gap:10, paddingBottom:4 },
  rowLast      : { paddingBottom:0 },
  timelineCol  : { alignItems:'center', width:18 },
  dot          : { width:12, height:12, borderRadius:6, marginTop:3 },
  line         : { width:2, flex:1, backgroundColor:SILVER_DARK+'30', marginTop:4 },
  content      : { flex:1, paddingBottom:16 },
  topRow       : { flexDirection:'row', alignItems:'center', gap:6, marginBottom:3 },
  data         : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  hora         : { fontSize:10, color:SILVER_DARK },
  canal        : { fontSize:12 },
  badge        : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:10, borderWidth:1 },
  badgeTxt     : { fontSize:10, fontWeight:'700' },
  valor        : { fontSize:15, fontWeight:'800', color:SUCCESS, marginBottom:2 },
  infoRow      : { flexDirection:'row', alignItems:'flex-start', gap:5, marginTop:2 },
  infoTxt      : { fontSize:11, color:SILVER_DARK, flex:1 },
  expandidoWrap: { marginTop:6, paddingTop:6, borderTopWidth:1, borderTopColor:SILVER+'12' },
  iaBadge      : { flexDirection:'row', alignItems:'center', gap:4, alignSelf:'flex-start', paddingHorizontal:7, paddingVertical:2, borderRadius:7, borderWidth:1, marginTop:4 },
  iaTxt        : { fontSize:9, fontWeight:'800' },
});

function Secao({ titulo, cor = GOLD, children, icone }) {
  return (
    <View style={sec.wrap}>
      <View style={sec.header}>
        <View style={[sec.bar, { backgroundColor:cor }]} />
        {icone && <Icon name={icone} size={14} color={cor} type="material" />}
        <Text style={sec.titulo}>{titulo}</Text>
      </View>
      <View style={sec.body}>{children}</View>
    </View>
  );
}
const sec = StyleSheet.create({
  wrap  : { marginHorizontal:16, marginBottom:16 },
  header: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:12 },
  bar   : { width:4, height:18, borderRadius:2 },
  titulo: { fontSize:13, fontWeight:'800', color:SILVER_LIGHT, flex:1, letterSpacing:0.2 },
  body  : { backgroundColor:CARD_BG, borderRadius:16, padding:16, borderWidth:1, borderColor:SILVER+'15' },
});

function GraficoFrequencia({ visitas }) {
  const hoje    = new Date();
  const semanas = [];

  for (let i = 7; i >= 0; i--) {
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - (i * 7) - hoje.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    fimSemana.setHours(23, 59, 59, 999);

    const doPeríodo = visitas.filter(v => {
      const d = new Date(v.dataLocal || 0);
      return d >= inicioSemana && d <= fimSemana;
    });

    semanas.push({
      count   : doPeríodo.length,
      comprou : doPeríodo.some(v => v.resultado === 'comprou'),
      isSemana: i === 0,
    });
  }

  const maxCount = Math.max(...semanas.map(s => s.count), 1);

  return (
    <View style={gf.container}>
      <Text style={gf.titulo}>Frequência — últimas 8 semanas</Text>
      <View style={gf.barras}>
        {semanas.map((s, i) => {
          const altura = Math.max((s.count / maxCount) * 48, s.count > 0 ? 6 : 2);
          const cor    = s.count === 0 ? CARD_BG2 : s.comprou ? SUCCESS : DANGER;
          return (
            <View key={i} style={gf.coluna}>
              {s.count > 0 && (
                <Text style={[gf.barCount, { color: s.isSemana ? GOLD : SILVER_DARK }]}>{s.count}</Text>
              )}
              <View style={gf.barTrack}>
                <View style={[gf.barra, { height: altura, backgroundColor: cor, opacity: s.isSemana ? 1 : 0.7 }]} />
              </View>
              <Text style={[gf.barLabel, s.isSemana && { color: GOLD }]}>
                {i === 7 ? 'Hoje' : `S${i + 1}`}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={gf.legenda}>
        <View style={gf.legendaItem}>
          <View style={[gf.legendaDot, { backgroundColor: SUCCESS }]} />
          <Text style={gf.legendaTxt}>Comprou</Text>
        </View>
        <View style={gf.legendaItem}>
          <View style={[gf.legendaDot, { backgroundColor: DANGER }]} />
          <Text style={gf.legendaTxt}>Sem compra</Text>
        </View>
      </View>
    </View>
  );
}
const gf = StyleSheet.create({
  container  : { backgroundColor:CARD_BG, borderRadius:14, padding:14, marginBottom:0 },
  titulo     : { fontSize:11, fontWeight:'700', color:SILVER_DARK, letterSpacing:0.4, textTransform:'uppercase', marginBottom:12 },
  barras     : { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end', height:72 },
  coluna     : { flex:1, alignItems:'center', gap:3 },
  barCount   : { fontSize:8, fontWeight:'800' },
  barTrack   : { width:'70%', alignItems:'center', justifyContent:'flex-end', height:48 },
  barra      : { width:'100%', borderRadius:3 },
  barLabel   : { fontSize:8, color:SILVER_DARK, fontWeight:'600' },
  legenda    : { flexDirection:'row', gap:14, marginTop:10, justifyContent:'flex-end' },
  legendaItem: { flexDirection:'row', alignItems:'center', gap:5 },
  legendaDot : { width:8, height:8, borderRadius:4 },
  legendaTxt : { fontSize:9, color:SILVER_DARK, fontWeight:'600' },
});

function CardReposicaoIA({ previsoes }) {
  const [expandido, setExpandido] = useState(false);
  if (!previsoes?.length) return null;

  const urgentes  = previsoes.filter(p => p.urgencia === 'atrasado' || p.urgencia === 'hoje');
  const corHeader = urgentes.length > 0 ? DANGER : PURPLE;
  const urgCor    = { atrasado:DANGER, hoje:WARN, breve:BLUE, ok:SUCCESS };
  const urgLabel  = { atrasado:'Atrasado', hoje:'Hoje', breve:'Em breve', ok:'Ok' };
  const exibir    = expandido ? previsoes : previsoes.slice(0, 3);

  return (
    <View style={[rep.container, { borderColor:corHeader+'35' }]}>
      <TouchableOpacity
        style={[rep.header, { backgroundColor:corHeader+'10' }]}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>
        <View style={[rep.iaIconWrap, { backgroundColor:corHeader+'18' }]}>
          <Icon name="inventory" size={14} color={corHeader} type="material" />
        </View>
        <View style={{ flex:1 }}>
          <Text style={rep.titulo}>Previsão de Reposição (IA)</Text>
          {urgentes.length > 0 ? (
            <Text style={[rep.sub, { color:DANGER }]}>
              {`${urgentes.length} produto${urgentes.length > 1 ? 's' : ''} precisando de atenção`}
            </Text>
          ) : (
            <Text style={rep.sub}>{`${previsoes.length} produto${previsoes.length > 1 ? 's' : ''} monitorados`}</Text>
          )}
        </View>
        <Icon name={expandido ? 'expand-less' : 'expand-more'} size={18} color={SILVER_DARK} type="material" />
      </TouchableOpacity>
      <View style={rep.lista}>
        {exibir.map((p, i) => {
          const cor      = urgCor[p.urgencia]   || SILVER_DARK;
          const labelUrg = urgLabel[p.urgencia] || '—';
          const confCor  = p.confianca === 'alta' ? SUCCESS : p.confianca === 'media' ? GOLD : SILVER_DARK;
          return (
            <View key={i} style={[rep.item, i < exibir.length - 1 && rep.itemBorder]}>
              <View style={{ flex:1 }}>
                <Text style={rep.prodNome}>{PRODUTO_LABEL[p.produto] || p.produto}</Text>
                <Text style={rep.prodInfo}>{`Ciclo: ~${p.ciclo}d · Última: ${formatDataCurta(p.ultimaCompra)}`}</Text>
                <Text style={rep.prodInfo}>{`Prev.: ${formatData(p.dataEstimada)}`}</Text>
              </View>
              <View style={{ alignItems:'flex-end', gap:5 }}>
                <View style={[rep.urgBadge, { backgroundColor:cor+'20', borderColor:cor+'40' }]}>
                  <Text style={[rep.urgTxt, { color:cor }]}>{labelUrg}</Text>
                  {p.diasRestantes !== 0 && (
                    <Text style={[rep.urgDias, { color:cor }]}>
                      {p.diasRestantes > 0 ? `${p.diasRestantes}d` : `${Math.abs(p.diasRestantes)}d atr.`}
                    </Text>
                  )}
                </View>
                <View style={[rep.confBadge, { backgroundColor:confCor+'15' }]}>
                  <Text style={[rep.confTxt, { color:confCor }]}>{p.confianca}</Text>
                </View>
              </View>
            </View>
          );
        })}
        {previsoes.length > 3 && (
          <TouchableOpacity style={rep.verMaisBtn} onPress={() => setExpandido(e => !e)} activeOpacity={0.8}>
            <Text style={rep.verMaisTxt}>
              {expandido ? 'Recolher' : `Ver todos (${previsoes.length - 3} restantes)`}
            </Text>
            <Icon name={expandido ? 'unfold-less' : 'unfold-more'} size={13} color={PURPLE} type="material" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const rep = StyleSheet.create({
  container : { backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, overflow:'hidden', marginBottom:0 },
  header    : { flexDirection:'row', alignItems:'center', gap:10, padding:14 },
  iaIconWrap: { width:32, height:32, borderRadius:10, justifyContent:'center', alignItems:'center' },
  titulo    : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  sub       : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  lista     : { paddingHorizontal:14, paddingBottom:10 },
  item      : { flexDirection:'row', alignItems:'center', paddingVertical:10, gap:10 },
  itemBorder: { borderBottomWidth:1, borderBottomColor:SILVER+'0D' },
  prodNome  : { fontSize:13, fontWeight:'700', color:SILVER_LIGHT },
  prodInfo  : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  urgBadge  : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  urgTxt    : { fontSize:9, fontWeight:'900' },
  urgDias   : { fontSize:9, fontWeight:'700' },
  confBadge : { paddingHorizontal:7, paddingVertical:2, borderRadius:6 },
  confTxt   : { fontSize:9, fontWeight:'700', textTransform:'capitalize' },
  verMaisBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:10, borderTopWidth:1, borderTopColor:SILVER+'10', marginTop:4 },
  verMaisTxt: { fontSize:11, fontWeight:'700', color:PURPLE },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function HistoricoClienteScreen({ route, navigation }) {
  const cliente = route?.params?.cliente || {};

  const [todasVisitas, setTodasVisitas] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [verTodos,     setVerTodos]     = useState(false);
  const [resumo,       setResumo]       = useState(null);
  const [aiData,       setAiData]       = useState(null);
  const [previsaoRep,  setPrevisaoRep]  = useState([]);
  const [filtroAtivo,  setFiltroAtivo]  = useState('todos');

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    try {
      const visitas = await getTodasVisitas();
      setTodasVisitas(visitas);
      setResumo(getResumoCliente(cliente.id, visitas));
      if (cliente.id) {
        setAiData(calcularPrioridadeClienteIA(cliente, visitas, []));
        setPrevisaoRep(preverReposicaoIA(cliente, visitas));
      }
    } catch (e) {
      console.log('[HistoricoCliente] erro:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregar();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:450, useNativeDriver:true }),
      Animated.timing(slideAnim, { toValue:0, duration:450, useNativeDriver:true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const historico     = getHistoricoVisitas(cliente.id, todasVisitas);
  const motivosRank   = getMotivosMaisFrequentes(cliente.id, todasVisitas);
  const taxaConversao = getTaxaConversao(cliente.id, todasVisitas);
  const valorTotal    = getValorTotalCliente(cliente.id, todasVisitas);
  const totalCompras  = historico.filter(v => v.resultado === 'comprou').length;

  const ultimaCompra  = resumo?.ultimaCompra;
  const diasSemCompra = resumo?.diasSemCompra;
  const ticketMedio   = resumo?.ticketMedio ?? 0;
  const produtosRank  = resumo?.produtosMais ?? [];
  const maxVezes      = produtosRank.length > 0 ? produtosRank[0].vezes : 1;

  const historicoFiltrado = (() => {
    switch (filtroAtivo) {
      case 'comprou':    return historico.filter(v => v.resultado === 'comprou');
      case 'naocomprou': return historico.filter(v => v.resultado === 'naocomprou');
      case 'telefone':   return historico.filter(v => v.tipoRegistro === 'telefone');
      default:           return historico;
    }
  })();

  const historicoExibido = verTodos ? historicoFiltrado : historicoFiltrado.slice(0, 10);

  const corConversao = taxaConversao >= 70 ? SUCCESS
    : taxaConversao >= 40 ? GOLD
    : taxaConversao >= 20 ? WARN : DANGER;

  const statusCliente = diasSemCompra === null
    ? { label:'Sem compras',              cor:SILVER_DARK, icone:'remove-circle-outline' }
    : diasSemCompra <= 7
      ? { label:'Cliente quente 🔥',      cor:SUCCESS,     icone:'local-fire-department' }
      : diasSemCompra <= 20
        ? { label:'Reposição em breve 📦', cor:BLUE,        icone:'inventory'             }
        : diasSemCompra <= 30
          ? { label:'Atenção ⚠️',          cor:WARN,        icone:'warning'               }
          : { label:'Cliente parado ❌',    cor:DANGER,      icone:'block'                 };

  const aiScore  = aiData?.score  ?? 0;
  const aiMotivo = aiData?.motivos?.[0] ?? null;
  const aiCor    = aiScore >= 70 ? DANGER : aiScore >= 45 ? WARN : PURPLE;

  const handleCompartilhar = async () => {
    try {
      const msg = [
        `📋 *${cliente.nome}*`,
        cliente.cidade ? `📍 ${cliente.cidade}` : '',
        ``,
        `💰 Total comprado: ${formatResumo(valorTotal)}`,
        `🎯 Ticket médio: ${ticketMedio > 0 ? formatResumo(ticketMedio) : '—'}`,
        `📅 Última compra: ${ultimaCompra ? formatData(ultimaCompra.dataLocal || ultimaCompra.data) : '—'}`,
        `⏱ Dias sem compra: ${diasSemCompra !== null ? diasSemCompra + 'd' : '—'}`,
        `📊 Conversão: ${taxaConversao}%`,
        `🔢 Total visitas: ${historico.length}`,
      ].filter(Boolean).join('\n');
      await Share.share({ message: msg });
    } catch (e) {
      console.log('[HistoricoCliente] compartilhar:', e);
    }
  };

  if (loading) {
    return (
      <View style={{ flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center' }}>
        <View style={ds.loadingIconWrap}>
          <Icon name="history" size={32} color={GOLD} type="material" />
        </View>
        <Text style={{ color:SILVER, fontSize:14, fontWeight:'600', marginTop:16 }}>
          Carregando histórico...
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
        <View style={[ds.headerAccent, { backgroundColor:statusCliente.cor }]} />
        <View style={ds.headerRow}>
          <TouchableOpacity style={ds.backBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-back" size={20} color={SILVER_LIGHT} type="material" />
          </TouchableOpacity>
          <View style={[ds.headerIconWrap, { backgroundColor:statusCliente.cor }]}>
            <Icon name="person" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={ds.headerNome} numberOfLines={1}>{cliente.nome || 'Cliente'}</Text>
            <Text style={ds.headerSub}>
              {cliente.cidade ? `${cliente.cidade} · ` : ''}
              {`${historico.length} registro${historico.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity style={ds.shareBtn} onPress={handleCompartilhar} activeOpacity={0.8}>
            <Icon name="share" size={16} color={SILVER_DARK} type="material" />
          </TouchableOpacity>
          <TouchableOpacity
            style={ds.checkinBtn}
            onPress={() => navigation?.navigate?.('Checkin', { cliente })}
            activeOpacity={0.8}>
            <Icon name="pin-drop" size={16} color={DARK_BG} type="material" />
            <Text style={ds.checkinBtnTxt}>Check-in</Text>
          </TouchableOpacity>
        </View>
        <ShimmerLine color={statusCliente.cor} />

        <View style={ds.statusRow}>
          <View style={[ds.statusBadge, { backgroundColor:statusCliente.cor+'18', borderColor:statusCliente.cor+'45' }]}>
            <Icon name={statusCliente.icone} size={12} color={statusCliente.cor} type="material" />
            <Text style={[ds.statusTxt, { color:statusCliente.cor }]}>{statusCliente.label}</Text>
          </View>
          {diasSemCompra !== null && (
            <Text style={ds.statusInfo}>
              Última compra: <Text style={{ color:SILVER_LIGHT, fontWeight:'700' }}>
                {ultimaCompra ? formatData(ultimaCompra.dataLocal || ultimaCompra.data) : '—'}
              </Text>
            </Text>
          )}
          {aiScore >= 25 && (
            <View style={[ds.iaBadge, { backgroundColor:aiCor+'18', borderColor:aiCor+'40' }]}>
              <Icon name="auto-awesome" size={10} color={aiCor} type="material" />
              <Text style={[ds.iaBadgeTxt, { color:aiCor }]}>IA {aiScore}</Text>
            </View>
          )}
        </View>

        {aiMotivo && (
          <View style={[ds.aiMotivoBanner, { borderColor:aiCor+'30', backgroundColor:aiCor+'0C' }]}>
            <Icon name="bolt" size={12} color={aiCor} type="material" />
            <Text style={[ds.aiMotivoTxt, { color:aiCor }]}>{aiMotivo}</Text>
          </View>
        )}
      </View>

      <Animated.ScrollView
        style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }}
        contentContainerStyle={ds.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={GOLD} colors={[GOLD]} />
        }>

        {/* ══ KPIs ══ */}
        <View style={ds.kpiRow}>
          <KpiCard
            icon="calendar-today"
            label="Última compra"
            value={ultimaCompra ? formatData(ultimaCompra.dataLocal || ultimaCompra.data) : '—'}
            color={diasSemCompra !== null && diasSemCompra <= 7 ? SUCCESS : GOLD}
          />
          <KpiCard icon="receipt" label="Ticket médio" value={ticketMedio > 0 ? formatResumo(ticketMedio) : '—'} color={BLUE} />
        </View>
        <View style={[ds.kpiRow, { marginTop:0 }]}>
          <KpiCard
            icon="hourglass-bottom"
            label="Dias sem compra"
            value={diasSemCompra !== null ? `${diasSemCompra}d` : '—'}
            sub={diasSemCompra !== null ? (diasSemCompra <= 7 ? '✅ Ativo' : diasSemCompra <= 30 ? '⚠️ Atenção' : '❌ Parado') : 'Sem histórico'}
            color={diasSemCompra === null ? SILVER_DARK : diasSemCompra <= 7 ? SUCCESS : diasSemCompra <= 30 ? WARN : DANGER}
          />
          <KpiCard
            icon="show-chart"
            label="Taxa conversão"
            value={`${taxaConversao}%`}
            sub={`${totalCompras} compra${totalCompras !== 1 ? 's' : ''} de ${historico.length}`}
            color={corConversao}
          />
        </View>
        {resumo && (
          <View style={[ds.kpiRow, { marginTop:0 }]}>
            <KpiCard
              icon="trending-up"
              label="Vendas no mês"
              value={resumo.totalMes > 0 ? formatResumo(resumo.totalMes) : '—'}
              color={resumo.totalMes > 0 ? SUCCESS : SILVER_DARK}
            />
            <KpiCard
              icon="event-repeat"
              label="Freq. visitas"
              value={resumo.frequenciaVisitas != null ? `${resumo.frequenciaVisitas}d` : '—'}
              sub="ciclo médio"
              color={PURPLE}
            />
          </View>
        )}

        {valorTotal > 0 && (
          <View style={ds.valorTotalCard}>
            <View style={ds.valorTotalIconWrap}>
              <Icon name="attach-money" size={28} color={SUCCESS} type="material" />
            </View>
            <View>
              <Text style={ds.valorTotalLabel}>Total vendido para este cliente</Text>
              <Text style={ds.valorTotalNum}>{formatResumo(valorTotal)}</Text>
            </View>
          </View>
        )}

        {historico.length > 0 && (
          <Secao titulo="Frequência de visitas" cor={BLUE} icone="bar-chart">
            <GraficoFrequencia visitas={historico} />
          </Secao>
        )}

        {produtosRank.length > 0 && (
          <Secao titulo="Produtos mais comprados" cor={GOLD} icone="inventory-2">
            {produtosRank.slice(0, 5).map((p, idx) => (
              <ProdutoRankCard key={p.nome} produto={p} idx={idx} maxVezes={maxVezes} />
            ))}
          </Secao>
        )}

        {previsaoRep.length > 0 && (
          <Secao titulo="Reposição prevista" cor={PURPLE} icone="inventory">
            <CardReposicaoIA previsoes={previsaoRep} />
          </Secao>
        )}

        {motivosRank.length > 0 && (
          <Secao titulo="Motivos de não compra" cor={DANGER} icone="info-outline">
            {motivosRank.map(m => (
              <View key={m.key} style={ds.motivoRow}>
                <View style={[ds.motivoDot, { backgroundColor:DANGER }]} />
                <Text style={ds.motivoTxt}>{m.label}</Text>
                <View style={ds.motivoBadge}>
                  <Text style={ds.motivoCount}>{`${m.count}x`}</Text>
                </View>
              </View>
            ))}
          </Secao>
        )}

        {/* ══ Histórico com filtros ══ */}
        <Secao
          titulo={`Histórico de visitas (${historicoFiltrado.length}${filtroAtivo !== 'todos' ? ' filtrado' : ''})`}
          cor={PURPLE}
          icone="history">

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={ds.filtrosRow}
            style={{ marginBottom:12, marginHorizontal:-4 }}>
            {FILTROS_HISTORICO.map(f => {
              const ativo = filtroAtivo === f.key;
              const qtd   = f.key === 'todos'    ? historico.length
                : f.key === 'telefone' ? historico.filter(v => v.tipoRegistro === 'telefone').length
                : historico.filter(v => v.resultado === f.key).length;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[ds.filtroChip, ativo && { backgroundColor:f.cor, borderColor:f.cor }]}
                  onPress={() => { setFiltroAtivo(f.key); setVerTodos(false); }}
                  activeOpacity={0.8}>
                  <Icon name={f.icone} size={11} color={ativo ? DARK_BG : f.cor} type="material" />
                  <Text style={[ds.filtroChipTxt, { color:ativo ? DARK_BG : f.cor }]}>{f.label}</Text>
                  {qtd > 0 && (
                    <View style={[ds.filtroQtdBadge, { backgroundColor:ativo ? DARK_BG+'30' : f.cor+'25' }]}>
                      <Text style={[ds.filtroQtdTxt, { color:ativo ? DARK_BG : f.cor }]}>{qtd}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {historicoFiltrado.length === 0 ? (
            <View style={ds.emptyWrap}>
              <Icon name="event-busy" size={36} color={GOLD+'40'} type="material" />
              <Text style={ds.emptyTxt}>
                {filtroAtivo === 'todos'
                  ? 'Nenhuma visita registrada'
                  : `Nenhuma visita com filtro "${FILTROS_HISTORICO.find(f => f.key === filtroAtivo)?.label}"`}
              </Text>
            </View>
          ) : (
            <>
              {historicoExibido.map((v, idx) => (
                <HistoricoItem key={v.id || idx} visita={v} isUltima={idx === historicoExibido.length - 1} />
              ))}
              {historicoFiltrado.length > 10 && (
                <TouchableOpacity style={ds.verMaisBtn} onPress={() => setVerTodos(t => !t)} activeOpacity={0.8}>
                  <Icon name={verTodos ? 'unfold-less' : 'unfold-more'} size={16} color={PURPLE} type="material" />
                  <Text style={ds.verMaisTxt}>
                    {verTodos ? 'Recolher' : `Ver todos (${historicoFiltrado.length - 10} restantes)`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Secao>

        <TouchableOpacity
          style={ds.novoCheckinBtn}
          onPress={() => navigation?.navigate?.('Checkin', { cliente })}
          activeOpacity={0.85}>
          <Icon name="add-location" size={20} color={DARK_BG} type="material" />
          <Text style={ds.novoCheckinTxt}>Registrar nova visita</Text>
        </TouchableOpacity>

        <View style={{ height:80 }} />
      </Animated.ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  container         : { flex:1, backgroundColor:DARK_BG },
  scroll            : { paddingTop:14, paddingBottom:40 },
  loadingIconWrap   : { width:72, height:72, borderRadius:24, backgroundColor:CARD_BG, borderWidth:1, borderColor:GOLD+'40', justifyContent:'center', alignItems:'center' },
  header            : { backgroundColor:'#001828', borderBottomLeftRadius:24, borderBottomRightRadius:24, overflow:'hidden', elevation:10 },
  headerAccent      : { height:3 },
  headerRow         : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingTop:48, paddingBottom:10 },
  backBtn           : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  headerIconWrap    : { width:42, height:42, borderRadius:21, justifyContent:'center', alignItems:'center' },
  headerNome        : { fontSize:17, fontWeight:'bold', color:SILVER_LIGHT },
  headerSub         : { fontSize:11, color:SILVER_DARK, marginTop:1 },
  shareBtn          : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  checkinBtn        : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:GOLD, paddingHorizontal:12, paddingVertical:8, borderRadius:12 },
  checkinBtnTxt     : { fontSize:11, fontWeight:'bold', color:DARK_BG },
  statusRow         : { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:16, paddingVertical:8, flexWrap:'wrap' },
  statusBadge       : { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:4, borderRadius:12, borderWidth:1 },
  statusTxt         : { fontSize:11, fontWeight:'800' },
  statusInfo        : { fontSize:11, color:SILVER_DARK },
  iaBadge           : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  iaBadgeTxt        : { fontSize:10, fontWeight:'900' },
  aiMotivoBanner    : { flexDirection:'row', alignItems:'center', gap:6, marginHorizontal:16, marginBottom:8, paddingHorizontal:12, paddingVertical:6, borderRadius:10, borderWidth:1 },
  aiMotivoTxt       : { fontSize:11, fontWeight:'700', flex:1 },
  kpiRow            : { flexDirection:'row', marginHorizontal:12, marginBottom:10 },
  valorTotalCard    : { flexDirection:'row', alignItems:'center', gap:14, marginHorizontal:16, marginBottom:16, backgroundColor:CARD_BG, borderRadius:16, padding:16, borderWidth:1, borderColor:SUCCESS+'30' },
  valorTotalIconWrap: { width:52, height:52, borderRadius:26, backgroundColor:SUCCESS+'18', justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:SUCCESS+'35' },
  valorTotalLabel   : { fontSize:11, color:SILVER_DARK, marginBottom:3 },
  valorTotalNum     : { fontSize:24, fontWeight:'bold', color:SUCCESS },
  motivoRow         : { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  motivoDot         : { width:7, height:7, borderRadius:4 },
  motivoTxt         : { flex:1, fontSize:12, color:SILVER_LIGHT },
  motivoBadge       : { backgroundColor:DANGER+'18', borderRadius:10, paddingHorizontal:9, paddingVertical:3, borderWidth:1, borderColor:DANGER+'40' },
  motivoCount       : { fontSize:11, fontWeight:'bold', color:DANGER },
  filtrosRow        : { paddingHorizontal:4, paddingVertical:2, gap:6, flexDirection:'row' },
  filtroChip        : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:CARD_BG2, borderRadius:12, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:SILVER+'18' },
  filtroChipTxt     : { fontSize:10, fontWeight:'800' },
  filtroQtdBadge    : { paddingHorizontal:5, paddingVertical:1, borderRadius:6 },
  filtroQtdTxt      : { fontSize:9, fontWeight:'900' },
  verMaisBtn        : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:12, borderTopWidth:1, borderTopColor:SILVER+'15', marginTop:4 },
  verMaisTxt        : { fontSize:12, fontWeight:'700', color:PURPLE },
  emptyWrap         : { alignItems:'center', paddingVertical:28, gap:10 },
  emptyTxt          : { fontSize:13, color:SILVER_DARK, textAlign:'center' },
  novoCheckinBtn    : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, marginHorizontal:16, backgroundColor:GOLD, borderRadius:16, paddingVertical:15, elevation:6 },
  novoCheckinTxt    : { fontSize:14, fontWeight:'bold', color:DARK_BG },
});