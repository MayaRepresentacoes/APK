// components/SugestaoVendaCard.js
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Platform,
} from 'react-native';
import { Icon } from 'react-native-elements';

const GOLD         = '#E8B432';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const SUCCESS      = '#4CAF50';
const WARN         = '#FF9800';
const BLUE         = '#5BA3D0';
const PURPLE       = '#C56BF0';
const DANGER       = '#EF5350';

// ── Mapa de produtos com detalhes completos ──────────────────────
const PRODUTOS_DETALHES = {
  caixas   : { label:"Caixas d'água",  icon:'water',                    cor:BLUE,    representada:'FORTLEV',       descricao:'Caixas polietileno'     },
  tubos    : { label:'Tubos PVC',       icon:'horizontal-rule',           cor:GOLD,    representada:'AFORT',         descricao:'Linha hidráulica'       },
  conexoes : { label:'Conexões',        icon:'settings-input-component',  cor:GOLD,    representada:'AFORT',         descricao:'Joelhos, tês, luvas'    },
  telhas   : { label:'Telhas',          icon:'roofing',                   cor:WARN,    representada:'METAL TECH',    descricao:'Linha cobertura'        },
  vasos    : { label:'Vasos sanitários',icon:'local-florist',             cor:BLUE,    representada:'FORTLEV',       descricao:'Linha sanitária'        },
  metais   : { label:'Metais',          icon:'hardware',                  cor:SUCCESS, representada:'METAL TECH',    descricao:'Torneiras e acessórios' },
  tintas   : { label:'Tintas',          icon:'format-paint',              cor:PURPLE,  representada:'SOARES TINTAS', descricao:'Linha completa de tintas'},
};

// ════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: getSugestaoVenda()
// ════════════════════════════════════════════════════════════════
/**
 * Gera sugestões inteligentes de venda para um cliente
 * baseado no histórico real de compras.
 */
export function getSugestaoVenda(clienteId, todasVisitas) {
  const hoje = new Date();

  const compras = todasVisitas
    .filter(v => v.clienteId === clienteId && v.resultado === 'comprou')
    .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));

  if (!compras.length) {
    return _sugestoesSemHistorico();
  }

  const frequencia = {};

  compras.forEach((v, idx) => {
    const lista = Array.isArray(v.produtos) ? v.produtos : [];
    const dataV = new Date(v.dataLocal || 0);

    lista.forEach(p => {
      if (!p || !PRODUTOS_DETALHES[p]) return;
      if (!frequencia[p]) frequencia[p] = { count:0, ultimaVez:null, intervalos:[] };
      frequencia[p].count++;

      if (frequencia[p].ultimaVez) {
        const diff = Math.floor(
          (frequencia[p].ultimaVez.getTime() - dataV.getTime()) / 86400000
        );
        if (diff > 0) frequencia[p].intervalos.push(diff);
      }
      if (idx === 0) frequencia[p].ultimaVez = dataV;
    });
  });

  const sugestoes = [];

  Object.entries(frequencia).forEach(([produto, dados]) => {
    const det       = PRODUTOS_DETALHES[produto];
    const diasDesde = dados.ultimaVez
      ? Math.floor((hoje.getTime() - dados.ultimaVez.getTime()) / 86400000)
      : null;

    const intervaloMedio = dados.intervalos.length > 0
      ? Math.round(dados.intervalos.reduce((s, i) => s + i, 0) / dados.intervalos.length)
      : null;

    let prioridade = '';
    let motivo     = '';
    let score      = 0;

    if (intervaloMedio && diasDesde !== null && diasDesde >= intervaloMedio * 0.8) {
      prioridade = 'alta';
      motivo     = `Reposição — compra a cada ~${intervaloMedio} dias`;
      score      = 100 + dados.count * 10;
    } else if (dados.count >= 2) {
      prioridade = 'alta';
      motivo     = `Comprou ${dados.count}x — produto recorrente`;
      score      = 80 + dados.count * 8;
    } else if (diasDesde !== null && diasDesde <= 60) {
      prioridade = 'media';
      motivo     = `Comprou há ${diasDesde} dias`;
      score      = 50 + (60 - diasDesde);
    }

    if (prioridade) {
      sugestoes.push({
        produto, prioridade, motivo, score,
        label        : det.label,
        icon         : det.icon,
        cor          : det.cor,
        representada : det.representada,
        descricao    : det.descricao,
        vezes        : dados.count,
        diasDesde,
        intervaloMedio,
      });
    }
  });

  // Cross-sell
  const produtosComprados = new Set(Object.keys(frequencia));
  const CROSS_SELL = {
    caixas  : ['tubos',    'conexoes'],
    tubos   : ['conexoes', 'caixas' ],
    conexoes: ['tubos',    'caixas' ],
    telhas  : ['metais'             ],
    vasos   : ['metais'             ],
    metais  : ['vasos',    'telhas' ],
    tintas  : [],
  };

  produtosComprados.forEach(p => {
    (CROSS_SELL[p] || []).forEach(comp => {
      if (!produtosComprados.has(comp) && PRODUTOS_DETALHES[comp]) {
        const det = PRODUTOS_DETALHES[comp];
        if (!sugestoes.find(s => s.produto === comp)) {
          sugestoes.push({
            produto      : comp,
            prioridade   : 'bonus',
            motivo       : `Complementa ${PRODUTOS_DETALHES[p]?.label || p}`,
            score        : 30,
            label        : det.label,
            icon         : det.icon,
            cor          : det.cor,
            representada : det.representada,
            descricao    : det.descricao,
            vezes        : 0,
            diasDesde    : null,
            intervaloMedio: null,
          });
        }
      }
    });
  });

  return sugestoes
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function _sugestoesSemHistorico() {
  return ['caixas', 'tubos', 'conexoes'].map(p => {
    const det = PRODUTOS_DETALHES[p];
    return {
      produto      : p,
      prioridade   : 'media',
      motivo       : 'Produtos mais vendidos',
      score        : 50,
      label        : det.label,
      icon         : det.icon,
      cor          : det.cor,
      representada : det.representada,
      descricao    : det.descricao,
      vezes        : 0,
      diasDesde    : null,
      intervaloMedio: null,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// SUBCOMPONENTE: ItemSugestao
// ════════════════════════════════════════════════════════════════
const PRIORIDADE_CONFIG = {
  alta  : { label:'Alta prioridade', cor:SUCCESS, icone:'star'              },
  media : { label:'Sugerido',        cor:GOLD,    icone:'thumb-up'          },
  bonus : { label:'Cross-sell',      cor:BLUE,    icone:'add-shopping-cart' },
};

function ItemSugestao({ s, idx, selecionado, onToggle }) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = idx * 70;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue:1, friction:7, useNativeDriver:true }),
        Animated.timing(fadeAnim,  { toValue:1, duration:250, useNativeDriver:true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const cfg = PRIORIDADE_CONFIG[s.prioridade] || PRIORIDADE_CONFIG.media;

  return (
    <Animated.View style={{ opacity:fadeAnim, transform:[{ scale:scaleAnim }] }}>
      <TouchableOpacity
        style={[
          it.card,
          { borderColor: selecionado ? s.cor : s.cor + '25' },
          selecionado && { backgroundColor: s.cor + '12' },
        ]}
        onPress={onToggle}
        activeOpacity={0.82}>

        <View style={it.topRow}>
          <View style={[it.check, selecionado && { backgroundColor:s.cor, borderColor:s.cor }]}>
            {selecionado && (
              <Icon name="check" size={12} color={DARK_BG} type="material" />
            )}
          </View>

          <View style={[it.iconWrap, { backgroundColor: s.cor + '20' }]}>
            <Icon name={s.icon} size={16} color={s.cor} type="material" />
          </View>

          <View style={{ flex:1 }}>
            <Text style={[it.nome, selecionado && { color:s.cor }]}>
              {s.label}
            </Text>
            <Text style={it.descricao}>{s.descricao}</Text>
          </View>

          <View style={[it.badge, { backgroundColor:cfg.cor + '18', borderColor:cfg.cor + '40' }]}>
            <Icon name={cfg.icone} size={9} color={cfg.cor} type="material" />
            <Text style={[it.badgeTxt, { color:cfg.cor }]}>{cfg.label}</Text>
          </View>
        </View>

        <View style={it.bottomRow}>
          <View style={it.motivoRow}>
            <Icon name="info-outline" size={10} color={SILVER_DARK} type="material" />
            <Text style={it.motivoTxt}>{s.motivo}</Text>
          </View>
          <View style={[it.repChip, { backgroundColor: s.cor + '15' }]}>
            <Text style={[it.repTxt, { color:s.cor }]}>{s.representada}</Text>
          </View>
        </View>

        {s.intervaloMedio != null && (
          <View style={it.intervaloRow}>
            <Icon name="repeat" size={10} color={BLUE} type="material" />
            <Text style={it.intervaloTxt}>
              {`Ciclo: ~${s.intervaloMedio} dias`}
              {s.diasDesde !== null ? ` · Última: ${s.diasDesde}d atrás` : ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const it = StyleSheet.create({
  card        : { backgroundColor:CARD_BG, borderRadius:14, borderWidth:1.5, padding:12, marginBottom:8 },
  topRow      : { flexDirection:'row', alignItems:'center', gap:10, marginBottom:6 },
  check       : { width:22, height:22, borderRadius:7, borderWidth:1.5, borderColor:SILVER_DARK, justifyContent:'center', alignItems:'center' },
  iconWrap    : { width:34, height:34, borderRadius:10, justifyContent:'center', alignItems:'center' },
  nome        : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  descricao   : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  badge       : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:8, borderWidth:1 },
  badgeTxt    : { fontSize:9, fontWeight:'800' },
  bottomRow   : { flexDirection:'row', alignItems:'center', gap:8 },
  motivoRow   : { flexDirection:'row', alignItems:'center', gap:4, flex:1 },
  motivoTxt   : { fontSize:10, color:SILVER_DARK, flex:1 },
  repChip     : { paddingHorizontal:8, paddingVertical:2, borderRadius:8 },
  repTxt      : { fontSize:9, fontWeight:'800' },
  intervaloRow: { flexDirection:'row', alignItems:'center', gap:4, marginTop:5, paddingTop:5, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.05)' },
  intervaloTxt: { fontSize:10, color:BLUE + 'CC' },
});

// ════════════════════════════════════════════════════════════════
// CARD PRINCIPAL EXPORTADO
// ════════════════════════════════════════════════════════════════
export default function SugestaoVendaCard({
  clienteId,
  todasVisitas,
  onIniciarCheckin,
}) {
  const [selecionados, setSelecionados] = useState([]);
  const [expandido,    setExpandido]    = useState(true);

  // ── [CORRIGIDO] useMemo fora de qualquer outro hook ───────────
  const sugestoes = useMemo(() => {
    if (!clienteId || !todasVisitas) return [];
    return getSugestaoVenda(clienteId, todasVisitas);
  }, [clienteId, todasVisitas]);

  // ── [CORRIGIDO] selecionadosAlta fora do useEffect ────────────
  const selecionadosAlta = useMemo(() => {
    return sugestoes
      .filter(s => s.prioridade === 'alta')
      .map(s => s.produto);
  }, [sugestoes]);

  // ── [CORRIGIDO] useEffect separado e fechado corretamente ─────
  useEffect(() => {
    setSelecionados(selecionadosAlta);
  }, [selecionadosAlta]);

  const toggleProduto = (produto) => {
    setSelecionados(prev =>
      prev.includes(produto)
        ? prev.filter(p => p !== produto)
        : [...prev, produto]
    );
  };

  const toggleExpandido = () => {
    setExpandido(e => !e);
  };

  const selecionarTodos = () => {
    setSelecionados(sugestoes.map(s => s.produto));
  };

  const limparSelecao = () => setSelecionados([]);

  if (!sugestoes.length) return null;

  const altaPrioridade = sugestoes.filter(s => s.prioridade === 'alta').length;
  const totalSel       = selecionados.length;

  return (
    <View style={sv.container}>
      {/* ── Cabeçalho do card ── */}
      <TouchableOpacity
        style={sv.header}
        onPress={toggleExpandido}
        activeOpacity={0.85}>
        <View style={sv.headerLeft}>
          <View style={sv.headerIconWrap}>
            <Icon name="auto-awesome" size={16} color={DARK_BG} type="material" />
          </View>
          <View>
            <Text style={sv.headerTitulo}>Sugestão de venda hoje</Text>
            <Text style={sv.headerSub}>
              {altaPrioridade > 0
                ? `${altaPrioridade} de alta prioridade · ${sugestoes.length} total`
                : `${sugestoes.length} produto${sugestoes.length !== 1 ? 's' : ''} sugerido${sugestoes.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
        <View style={sv.headerRight}>
          {totalSel > 0 && (
            <View style={sv.selBadge}>
              <Text style={sv.selBadgeTxt}>{totalSel} sel.</Text>
            </View>
          )}
          <Icon
            name={expandido ? 'expand-less' : 'expand-more'}
            size={20}
            color={GOLD}
            type="material"
          />
        </View>
      </TouchableOpacity>

      {/* ── Conteúdo expansível ── */}
      {expandido && (
        <View style={sv.body}>

          {/* Ações rápidas */}
          <View style={sv.acoesRow}>
            <TouchableOpacity style={sv.acaoChip} onPress={selecionarTodos} activeOpacity={0.8}>
              <Icon name="done-all" size={12} color={GOLD} type="material" />
              <Text style={sv.acaoChipTxt}>Selecionar todos</Text>
            </TouchableOpacity>
            {totalSel > 0 && (
              <TouchableOpacity style={sv.acaoChip} onPress={limparSelecao} activeOpacity={0.8}>
                <Icon name="clear" size={12} color={SILVER_DARK} type="material" />
                <Text style={[sv.acaoChipTxt, { color:SILVER_DARK }]}>Limpar</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex:1 }} />
            <Text style={sv.baseadoTxt}>🧠 Baseado no histórico</Text>
          </View>

          {/* Lista de sugestões */}
          {sugestoes.map((s, idx) => (
            <ItemSugestao
              key={s.produto}
              s={s}
              idx={idx}
              selecionado={selecionados.includes(s.produto)}
              onToggle={() => toggleProduto(s.produto)}
            />
          ))}

          {/* Botão de iniciar check-in com sugestões */}
          {onIniciarCheckin && (
            <TouchableOpacity
              style={[sv.checkinBtn, totalSel === 0 && { opacity:0.5 }]}
              onPress={() => onIniciarCheckin(selecionados)}
              disabled={totalSel === 0}
              activeOpacity={0.85}>
              <Icon name="pin-drop" size={18} color={DARK_BG} type="material" />
              <Text style={sv.checkinBtnTxt}>
                {totalSel > 0
                  ? `Registrar visita com ${totalSel} produto${totalSel !== 1 ? 's' : ''}`
                  : 'Selecione pelo menos 1 produto'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Dica */}
          <View style={sv.dica}>
            <Icon name="lightbulb-outline" size={11} color={SILVER_DARK} type="material" />
            <Text style={sv.dicaTxt}>
              Sugestões baseadas em frequência de compra, ciclo de reposição e produtos complementares.
            </Text>
          </View>

        </View>
      )}
    </View>
  );
}

const sv = StyleSheet.create({
  container     : { marginHorizontal:16, marginBottom:16, backgroundColor:CARD_BG, borderRadius:18, borderWidth:1.5, borderColor:GOLD+'35', overflow:'hidden' },

  header        : { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:14, backgroundColor:GOLD+'12' },
  headerLeft    : { flexDirection:'row', alignItems:'center', gap:10, flex:1 },
  headerIconWrap: { width:36, height:36, borderRadius:12, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  headerTitulo  : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  headerSub     : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  headerRight   : { flexDirection:'row', alignItems:'center', gap:8 },
  selBadge      : { backgroundColor:SUCCESS+'25', paddingHorizontal:8, paddingVertical:3, borderRadius:10, borderWidth:1, borderColor:SUCCESS+'50' },
  selBadgeTxt   : { fontSize:10, fontWeight:'800', color:SUCCESS },

  body          : { padding:14, paddingTop:10 },
  acoesRow      : { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  acaoChip      : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:5, borderRadius:10, backgroundColor:CARD_BG2, borderWidth:1, borderColor:GOLD+'30' },
  acaoChipTxt   : { fontSize:10, fontWeight:'700', color:GOLD },
  baseadoTxt    : { fontSize:9, color:SILVER_DARK },

  checkinBtn    : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:GOLD, borderRadius:14, paddingVertical:13, marginTop:4, elevation:5, shadowColor:GOLD, shadowOffset:{width:0,height:3}, shadowOpacity:0.4, shadowRadius:7 },
  checkinBtnTxt : { fontSize:13, fontWeight:'bold', color:DARK_BG },

  dica          : { flexDirection:'row', alignItems:'flex-start', gap:6, marginTop:10, paddingTop:10, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.06)' },
  dicaTxt       : { fontSize:10, color:SILVER_DARK, flex:1, lineHeight:14 },
});