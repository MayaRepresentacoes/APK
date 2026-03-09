import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Dimensions, Alert, Image, StatusBar,
  Animated, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import {
  collection, getDocs, query, orderBy, limit,
  where, addDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import * as Location from 'expo-location';
import colors from '../styles/colors';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
const GOLD_LIGHT   = '#F5D07A';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const DANGER       = '#EF5350';
const SUCCESS      = '#4CAF50';
const WARN         = '#FF9800';

const formatMoney = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate  = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : null;
const diasDesde   = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999;

// ── FORNECEDORES — chaves iguais às do Firestore (objeto fornecedores:{}) ──
// ClientesScreen salva: { FORTLEV, AFORT, 'METAL TECK', 'TINTAS S.' }
const FORN_META = {
  'FORTLEV':    { color: '#29B6F6', icon: 'water',        label: 'FORTLEV'   },
  'AFORT':      { color: '#66BB6A', icon: 'eco',          label: 'AFORT'     },
  'METAL TECK': { color: '#90A4AE', icon: 'settings',     label: 'METAL TECK'},
  'TINTAS S.':  { color: '#FF7043', icon: 'format-paint', label: 'TINTAS S.' },
};
// Retorna array de metadados apenas dos fornecedores marcados como true
const getFornecedoresAtivos = (fornObj) => {
  if (!fornObj || typeof fornObj !== 'object') return [];
  return Object.entries(fornObj)
    .filter(([, v]) => v === true)
    .map(([k]) => FORN_META[k] || { color: SILVER_DARK, icon: 'business', label: k });
};

// ── SHIMMER LINE ─────────────────────────────────────────────
function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })).start();
  }, []);
  return (
    <View style={{ height: 1, width: '100%', backgroundColor: color + '25', overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', height: '100%', width: 80, backgroundColor: color + 'BB', transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, SW] }) }] }} />
    </View>
  );
}

// ── METAL CARD ────────────────────────────────────────────────
function MetalCard({ children, style, gold = false }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 3800, useNativeDriver: true })).start(); }, []);
  return (
    <View style={[mc.card, gold ? mc.gold : mc.silver, style]}>
      <Animated.View style={[mc.shimmer, { transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-150, SW] }) }] }]} />
      {children}
    </View>
  );
}
const mc = StyleSheet.create({
  card:    { borderRadius: 18, padding: 16, overflow: 'hidden', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 7 },
  gold:    { backgroundColor: CARD_BG,  borderWidth: 1, borderColor: GOLD + '45',   shadowColor: GOLD   },
  silver:  { backgroundColor: CARD_BG2, borderWidth: 1, borderColor: SILVER + '35', shadowColor: SILVER },
  shimmer: { position: 'absolute', top: 0, width: 100, height: '100%', backgroundColor: 'rgba(255,255,255,0.035)', transform: [{ skewX: '-15deg' }] },
});

// ── ACTION BUTTON ─────────────────────────────────────────────
function ActionButton({ title, icon, gold = false, onPress }) {
  const accent = gold ? GOLD : SILVER;
  return (
    <TouchableOpacity style={[ab.btn, { borderColor: accent + '45', shadowColor: accent }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[ab.iconWrap, { backgroundColor: accent + '20' }]}><Icon name={icon} size={20} color={accent} /></View>
      <Text style={[ab.text, { color: accent }]}>{title}</Text>
    </TouchableOpacity>
  );
}
const ab = StyleSheet.create({
  btn:     { width: '48%', flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 4 },
  iconWrap:{ width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  text:    { fontSize: 12, fontWeight: '700', flex: 1 },
});

// ── SECTION HEADER ────────────────────────────────────────────
function SectionHeader({ title, onPress, gold = true }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.left}>
        <View style={[sh.bar, { backgroundColor: gold ? GOLD : SILVER }]} />
        <Text style={sh.title}>{title}</Text>
      </View>
      {onPress && <TouchableOpacity onPress={onPress}><Text style={[sh.link, { color: gold ? GOLD : SILVER }]}>Ver todos →</Text></TouchableOpacity>}
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  left:  { flexDirection: 'row', alignItems: 'center' },
  bar:   { width: 3, height: 20, borderRadius: 2, marginRight: 10 },
  title: { fontSize: 15, fontWeight: 'bold', color: SILVER_LIGHT, letterSpacing: 0.3 },
  link:  { fontSize: 12, fontWeight: '600' },
});

// ── ALERTAS ───────────────────────────────────────────────────
function AlertasSection({ clientesRevisar, userLocation, clientes, proximasVisitas, tarefasHoje }) {
  const alertas = [];
  const hoje = new Date().toISOString().split('T')[0];

  proximasVisitas.forEach(v => {
    if ((v.data || '').split('T')[0] === hoje)
      alertas.push({ icon: 'event', color: GOLD, texto: `Visita às ${v.hora || '--:--'}: ${v.titulo || v.clienteNome || 'Agendada'}` });
  });

  tarefasHoje.forEach(t => {
    alertas.push({ icon: 'check-circle-outline', color: SILVER, texto: `Tarefa: ${t.titulo}${t.prioridade === 'alta' ? ' 🔴' : ''}` });
  });

  clientesRevisar.forEach(c => {
    const dias = diasDesde(c.ultimaVisita);
    if (dias >= 15 && dias < 999) alertas.push({ icon: 'schedule', color: WARN, texto: `"${c.nome}" não é visitado há ${dias} dias` });
    else if (dias === 999)        alertas.push({ icon: 'person-off', color: DANGER, texto: `"${c.nome}" nunca foi visitado` });
  });

  if (userLocation && clientes.length > 0) {
    const deg2rad = (d) => d * (Math.PI / 180);
    let menor = null, menorDist = Infinity;
    clientes.forEach(c => {
      if (!c.latitude || !c.longitude) return;
      const dLat = deg2rad(c.latitude - userLocation.latitude);
      const dLon = deg2rad(c.longitude - userLocation.longitude);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(userLocation.latitude)) * Math.cos(deg2rad(c.latitude)) * Math.sin(dLon / 2) ** 2;
      const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist < menorDist) { menorDist = dist; menor = c; }
    });
    if (menor && menorDist < 5)
      alertas.push({ icon: 'near-me', color: SUCCESS, texto: `"${menor.nome}" está a ${(menorDist * 1000).toFixed(0)}m de você` });
  }

  if (alertas.length === 0) return null;
  return (
    <View style={al.wrap}>
      <View style={al.titleRow}>
        <Icon name="notifications-active" size={22} color={WARN} />
        <Text style={al.title}>🔔 Alertas</Text>
        <View style={al.badge}><Text style={al.badgeTxt}>{alertas.length}</Text></View>
      </View>
      {alertas.slice(0, 6).map((a, i) => (
        <View key={i} style={[al.item, { borderLeftColor: a.color }]}>
          <Icon name={a.icon} size={15} color={a.color} style={{ marginRight: 10 }} />
          <Text style={al.texto}>{a.texto}</Text>
        </View>
      ))}
    </View>
  );
}
const al = StyleSheet.create({
  wrap:     { backgroundColor: CARD_BG2, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: WARN + '40', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title:    { fontSize: 18, fontWeight: 'bold', color: WARN, flex: 1, letterSpacing: 0.3 },
  badge:    { backgroundColor: WARN + '30', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: WARN + '60' },
  badgeTxt: { fontSize: 12, fontWeight: 'bold', color: WARN },
  item:     { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8, marginBottom: 5, borderRadius: 4 },
  texto:    { fontSize: 13, color: SILVER_LIGHT, flex: 1, lineHeight: 18 },
});

// ── PENDÊNCIAS ────────────────────────────────────────────────
function PendenciasSection({ pendencias, onPress }) {
  if (!pendencias || pendencias.length === 0) return null;
  return (
    <View style={pe.wrap}>
      <Text style={pe.title}>⚠️ Pendências</Text>
      {pendencias.map((p, i) => (
        <TouchableOpacity key={i} style={pe.item} onPress={() => onPress(p)} activeOpacity={0.8}>
          <View style={pe.dot} />
          <View style={{ flex: 1 }}>
            <Text style={pe.nome}>{p.clienteNome}</Text>
            <Text style={pe.tipo}>{p.tipo}</Text>
          </View>
          <View style={[pe.badge, { backgroundColor: p.urgente ? DANGER + '25' : WARN + '20', borderColor: p.urgente ? DANGER + '60' : WARN + '50' }]}>
            <Text style={[pe.badgeTxt, { color: p.urgente ? DANGER : WARN }]}>{p.urgente ? 'Urgente' : 'Pendente'}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const pe = StyleSheet.create({
  wrap:     { backgroundColor: DANGER + '12', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: DANGER + '35', marginBottom: 10 },
  title:    { fontSize: 13, fontWeight: 'bold', color: DANGER, marginBottom: 8 },
  item:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: DANGER + '20', gap: 10 },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: DANGER },
  nome:     { fontSize: 13, fontWeight: '600', color: SILVER_LIGHT },
  tipo:     { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeTxt: { fontSize: 10, fontWeight: '700' },
});

// ── CHECKLIST KIT DO DIA ──────────────────────────────────────
const KIT_ITENS = [
  { key: 'amostras',  label: 'Amostras',         emoji: '🧴' },
  { key: 'contratos', label: 'Contratos',        emoji: '📄' },
  { key: 'tablet',    label: 'Tablet Carregado', emoji: '📱' },
  { key: 'brindes',   label: 'Brindes',          emoji: '🎁' },
  { key: 'catalogo',  label: 'Catálogo',         emoji: '📋' },
  { key: 'cartao',    label: 'Cartão de Visita', emoji: '💼' },
];
function ChecklistKit() {
  const [marcados, setMarcados] = useState({});
  const total   = KIT_ITENS.length;
  const checked = Object.values(marcados).filter(Boolean).length;
  const toggle  = (key) => setMarcados(prev => ({ ...prev, [key]: !prev[key] }));
  return (
    <View style={ck.wrap}>
      <View style={ck.titleRow}>
        <Text style={ck.title}>✅ Kit do Dia</Text>
        <Text style={[ck.progress, { color: checked === total ? SUCCESS : GOLD }]}>{checked}/{total}</Text>
      </View>
      <View style={ck.progressBar}>
        <View style={[ck.progressFill, { width: `${(checked / total) * 100}%`, backgroundColor: checked === total ? SUCCESS : GOLD }]} />
      </View>
      <View style={ck.grid}>
        {KIT_ITENS.map(item => (
          <TouchableOpacity key={item.key} style={[ck.item, marcados[item.key] && ck.itemChecked]} onPress={() => toggle(item.key)} activeOpacity={0.8}>
            <Text style={ck.emoji}>{item.emoji}</Text>
            <Text style={[ck.itemLabel, marcados[item.key] && { color: SUCCESS }]}>{item.label}</Text>
            {marcados[item.key] && <Icon name="check" size={12} color={SUCCESS} />}
          </TouchableOpacity>
        ))}
      </View>
      {checked === total && (
        <View style={ck.pronto}>
          <Icon name="check-circle" size={16} color={SUCCESS} />
          <Text style={ck.prontoTxt}>Tudo pronto para sair! 🚀</Text>
        </View>
      )}
    </View>
  );
}
const ck = StyleSheet.create({
  wrap:         { backgroundColor: CARD_BG, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: GOLD + '35', marginBottom: 14 },
  titleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title:        { fontSize: 13, fontWeight: 'bold', color: GOLD },
  progress:     { fontSize: 13, fontWeight: 'bold' },
  progressBar:  { height: 4, backgroundColor: GOLD + '25', borderRadius: 2, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item:         { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: CARD_BG2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: SILVER + '25' },
  itemChecked:  { backgroundColor: SUCCESS + '15', borderColor: SUCCESS + '50' },
  emoji:        { fontSize: 14 },
  itemLabel:    { fontSize: 11, color: SILVER_DARK, fontWeight: '600' },
  pronto:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' },
  prontoTxt:    { fontSize: 12, color: SUCCESS, fontWeight: '700' },
});

// ══════════════════════════════════════════════════════════════
// CARD CLIENTE A VISITAR
// FEAT 1 — fornecedores lidos do objeto {FORTLEV:true, AFORT:false…}
// FEAT 2 — botão "Pular" (laranja) que avança a fila de próximos
// ══════════════════════════════════════════════════════════════
function ClienteVisitarCard({ cliente, onPress, historico, onPular, onRota, distancia }) {
  const dias    = diasDesde(cliente.ultimaVisita);
  const urgente = dias > 30;
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const ultimaVisitaHist = historico?.find(h => h.clienteId === cliente.id);
  let resumoVisita = null;
  if (ultimaVisitaHist) {
    const label = ultimaVisitaHist.statusLabel || '';
    const data  = ultimaVisitaHist.data
      ? formatDate(ultimaVisitaHist.data?.toDate ? ultimaVisitaHist.data.toDate() : ultimaVisitaHist.data)
      : '';
    resumoVisita = `📅 ${data}${label ? ': ' + label : ''}`;
  } else if (cliente.ultimaVisita) {
    resumoVisita = `📅 Visitado em ${formatDate(cliente.ultimaVisita)}`;
  }

  // FEAT 1: lê o objeto fornecedores:{FORTLEV:true, AFORT:false, ...}
  const fornsAtivos = getFornecedoresAtivos(cliente.fornecedores);

  // Animação de saída (usada tanto em Pular quanto em Retirar)
  const animarSaida = (callback) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0,   duration: 260, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -24, duration: 260, useNativeDriver: true }),
    ]).start(() => callback && callback());
  };

  const handlePular = () => {
    animarSaida(() => onPular && onPular(cliente));
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
      <TouchableOpacity
        style={[
          cv.card,
          urgente && { borderColor: WARN + '60' },
          distancia != null && distancia < 1 && { borderColor: SUCCESS + '70' },
        ]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {/* badge distância */}
        {distancia != null && (
          <View style={cv.proximoBadge}>
            <Icon name="near-me" size={11} color={SUCCESS} />
            <Text style={cv.proximoBadgeTxt}>
              {distancia < 1 ? `${(distancia * 1000).toFixed(0)}m de você` : `${distancia.toFixed(1)}km de você`}
            </Text>
          </View>
        )}

        <View style={cv.left}>
          <View style={[cv.iconWrap, {
            backgroundColor: distancia != null && distancia < 1 ? SUCCESS + '20' : urgente ? WARN + '20' : GOLD + '18',
          }]}>
            <Icon
              name={distancia != null && distancia < 1 ? 'near-me' : 'schedule'}
              size={18}
              color={distancia != null && distancia < 1 ? SUCCESS : urgente ? WARN : GOLD}
            />
          </View>

          <View style={{ flex: 1 }}>
            {/* Nome + Status */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={cv.nome}>{cliente.nome}</Text>
              <View style={[cv.statusDot, {
                backgroundColor: cliente.status === 'ativo' ? SUCCESS : cliente.status === 'potencial' ? GOLD : SILVER_DARK,
              }]} />
              <Text style={[cv.statusTxt, {
                color: cliente.status === 'ativo' ? SUCCESS : cliente.status === 'potencial' ? GOLD : SILVER_DARK,
              }]}>{cliente.status}</Text>
            </View>

            {/* Data visita */}
            <Text style={[cv.data, { color: urgente ? WARN : SILVER_DARK }]}>
              {resumoVisita || '❌ Nunca visitado'}
            </Text>

            {/* Tags: tipo + dias + FEAT 1 fornecedores ativos */}
            <View style={{ flexDirection: 'row', marginTop: 5, gap: 5, flexWrap: 'wrap' }}>
              <View style={[cv.tag, { backgroundColor: SILVER + '20', borderColor: SILVER + '35' }]}>
                <Text style={[cv.tagTxt, { color: SILVER }]}>{cliente.tipo}</Text>
              </View>
              {dias < 999 && (
                <View style={[cv.tag, { backgroundColor: urgente ? WARN + '20' : CARD_BG2, borderColor: urgente ? WARN + '50' : SILVER + '30' }]}>
                  <Text style={[cv.tagTxt, { color: urgente ? WARN : SILVER_DARK }]}>{dias}d atrás</Text>
                </View>
              )}
              {/* FEAT 1: um badge por fornecedor ativo */}
              {fornsAtivos.map((f, i) => (
                <View key={i} style={[cv.tag, { backgroundColor: f.color + '20', borderColor: f.color + '55', flexDirection: 'row', gap: 3 }]}>
                  <Icon name={f.icon} size={9} color={f.color} />
                  <Text style={[cv.tagTxt, { color: f.color }]}>{f.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* FEAT 2: botão PULAR (laranja) + ROTA (azul) */}
        <View style={cv.actions}>
          {onPular && (
            <TouchableOpacity style={cv.pularBtn} onPress={handlePular} activeOpacity={0.8}>
              <Icon name="skip-next" size={14} color={DARK_BG} />
              <Text style={cv.pularBtnTxt}>Pular</Text>
            </TouchableOpacity>
          )}
          {onRota && (
            <TouchableOpacity style={cv.rotaBtn} onPress={() => onRota && onRota(cliente)} activeOpacity={0.8}>
              <Icon name="directions" size={14} color="#fff" />
              <Text style={cv.rotaBtnTxt}>Rota</Text>
            </TouchableOpacity>
          )}
          <Icon name="chevron-right" size={20} color={SILVER + '55'} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const cv = StyleSheet.create({
  card:            { backgroundColor: CARD_BG2, padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: SILVER + '20' },
  proximoBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SUCCESS + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6, borderWidth: 1, borderColor: SUCCESS + '40' },
  proximoBadgeTxt: { fontSize: 10, color: SUCCESS, fontWeight: '700' },
  left:            { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap:        { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  nome:            { fontSize: 14, fontWeight: 'bold', color: SILVER_LIGHT },
  statusDot:       { width: 7, height: 7, borderRadius: 3.5 },
  statusTxt:       { fontSize: 11, fontWeight: '600' },
  data:            { fontSize: 11, marginTop: 3 },
  tag:             { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  tagTxt:          { fontSize: 9, fontWeight: '600' },
  actions:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, gap: 8 },
  pularBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: WARN, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6, shadowColor: WARN, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
  pularBtnTxt:     { fontSize: 11, fontWeight: 'bold', color: DARK_BG },
  rotaBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2196F3', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6, shadowColor: '#2196F3', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
  rotaBtnTxt:      { fontSize: 11, fontWeight: 'bold', color: '#fff' },
});

// ── CUSTOS ────────────────────────────────────────────────────
const CATEGORIAS = [
  { key: 'combustivel', label: 'Combustível', icon: 'local-gas-station', color: '#FF7043' },
  { key: 'alimentacao', label: 'Alimentação', icon: 'restaurant',        color: '#66BB6A' },
  { key: 'hospedagem',  label: 'Hospedagem',  icon: 'hotel',             color: '#42A5F5' },
  { key: 'outros',      label: 'Outros',      icon: 'more-horiz',        color: SILVER    },
];
const PAGAMENTOS = [
  { key: 'credito',  label: 'Crédito',  icon: 'credit-card'  },
  { key: 'debito',   label: 'Débito',   icon: 'payment'      },
  { key: 'dinheiro', label: 'Dinheiro', icon: 'attach-money' },
];
const getCat = (k) => CATEGORIAS.find(c => c.key === k) || CATEGORIAS[3];
const getPag = (k) => PAGAMENTOS.find(p => p.key === k)  || PAGAMENTOS[0];

function CustoModal({ visible, onClose, onSave }) {
  const [categoria, setCategoria] = useState('combustivel');
  const [pagamento, setPagamento] = useState('dinheiro');
  const [valor,     setValor]     = useState('');
  const [descricao, setDescricao] = useState('');
  const [saving,    setSaving]    = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setCategoria('combustivel'); setPagamento('dinheiro'); setValor(''); setDescricao('');
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleSave = async () => {
    if (!valor || parseFloat(valor.replace(',', '.')) <= 0) { Alert.alert('Atenção', 'Informe um valor válido'); return; }
    setSaving(true);
    try {
      await onSave({ categoria, pagamento, valor: parseFloat(valor.replace(',', '.')), descricao: descricao || getCat(categoria).label, data: new Date().toISOString(), dataFormatada: new Date().toLocaleDateString('pt-BR') });
      onClose();
    } catch (e) { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={cm.overlay}>
          <Animated.View style={[cm.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={cm.header}>
              <View style={cm.headerIcon}><Icon name="account-balance-wallet" size={20} color={DARK_BG} /></View>
              <Text style={cm.headerTitle}>Registrar Custo</Text>
              <TouchableOpacity style={cm.closeBtn} onPress={onClose}><Icon name="close" size={18} color={SILVER_DARK} /></TouchableOpacity>
            </View>
            <ShimmerLine color={GOLD} />
            <ScrollView style={cm.body} showsVerticalScrollIndicator={false}>
              <Text style={cm.label}>CATEGORIA</Text>
              <View style={cm.optGrid}>
                {CATEGORIAS.map(cat => (
                  <TouchableOpacity key={cat.key} style={[cm.optBtn, categoria === cat.key && { backgroundColor: cat.color + '25', borderColor: cat.color + '80' }]} onPress={() => setCategoria(cat.key)}>
                    <Icon name={cat.icon} size={20} color={categoria === cat.key ? cat.color : SILVER_DARK} />
                    <Text style={[cm.optTxt, categoria === cat.key && { color: cat.color }]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={cm.label}>VALOR (R$)</Text>
              <View style={cm.inputWrap}>
                <Icon name="attach-money" size={18} color={GOLD} style={{ marginRight: 8 }} />
                <TextInput style={cm.input} placeholder="0,00" placeholderTextColor={SILVER_DARK} value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
              </View>
              <Text style={cm.label}>FORMA DE PAGAMENTO</Text>
              <View style={cm.pagRow}>
                {PAGAMENTOS.map(p => (
                  <TouchableOpacity key={p.key} style={[cm.pagBtn, pagamento === p.key && { backgroundColor: GOLD + '25', borderColor: GOLD + '80' }]} onPress={() => setPagamento(p.key)}>
                    <Icon name={p.icon} size={16} color={pagamento === p.key ? GOLD : SILVER_DARK} />
                    <Text style={[cm.pagTxt, pagamento === p.key && { color: GOLD }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={cm.label}>DESCRIÇÃO {categoria === 'outros' && <Text style={{ color: DANGER }}>*</Text>}</Text>
              <View style={cm.inputWrap}>
                <Icon name="notes" size={16} color={SILVER_DARK} style={{ marginRight: 8 }} />
                <TextInput style={cm.input} placeholder={categoria === 'outros' ? 'Descreva o gasto...' : 'Opcional'} placeholderTextColor={SILVER_DARK} value={descricao} onChangeText={setDescricao} />
              </View>
              <TouchableOpacity style={[cm.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                <Icon name="save" size={18} color={DARK_BG} style={{ marginRight: 8 }} />
                <Text style={cm.saveTxt}>{saving ? 'SALVANDO...' : 'REGISTRAR CUSTO'}</Text>
              </TouchableOpacity>
              <View style={{ height: 30 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const cm = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#001828', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', borderTopWidth: 1, borderColor: GOLD + '30' },
  header:      { flexDirection: 'row', alignItems: 'center', padding: 18 },
  headerIcon:  { width: 36, height: 36, borderRadius: 12, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: SILVER_LIGHT },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  body:        { paddingHorizontal: 20, paddingTop: 14 },
  label:       { fontSize: 10, fontWeight: '700', color: SILVER_DARK, letterSpacing: 1, marginBottom: 8, marginTop: 14 },
  optGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  optBtn:      { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD_BG, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: SILVER + '25' },
  optTxt:      { fontSize: 12, fontWeight: '600', color: SILVER_DARK },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: SILVER + '25', marginBottom: 4 },
  input:       { flex: 1, fontSize: 15, color: SILVER_LIGHT, paddingVertical: 12 },
  pagRow:      { flexDirection: 'row', gap: 8, marginBottom: 4 },
  pagBtn:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: CARD_BG, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: SILVER + '25' },
  pagTxt:      { fontSize: 10, fontWeight: '700', color: SILVER_DARK },
  saveBtn:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, marginTop: 20, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  saveTxt:     { fontSize: 15, fontWeight: 'bold', color: DARK_BG },
});

function CustosSection({ custos, onAdd, onDelete }) {
  const totalGeral = custos.reduce((s, c) => s + c.valor, 0);
  const totalHoje  = custos.filter(c => c.dataFormatada === new Date().toLocaleDateString('pt-BR')).reduce((s, c) => s + c.valor, 0);
  const totaisCat  = CATEGORIAS.map(cat => ({ ...cat, total: custos.filter(c => c.categoria === cat.key).reduce((s, c) => s + c.valor, 0) }));
  return (
    <View>
      <MetalCard gold style={{ marginBottom: 10 }}>
        <View style={cst.resumoRow}>
          <View style={cst.resumoItem}><Text style={cst.resumoLabel}>Total Geral</Text><Text style={[cst.resumoVal, { color: GOLD }]}>{formatMoney(totalGeral)}</Text></View>
          <View style={cst.resumoDiv} />
          <View style={cst.resumoItem}><Text style={cst.resumoLabel}>Hoje</Text><Text style={[cst.resumoVal, { color: SILVER }]}>{formatMoney(totalHoje)}</Text></View>
          <View style={cst.resumoDiv} />
          <View style={cst.resumoItem}><Text style={cst.resumoLabel}>Registros</Text><Text style={[cst.resumoVal, { color: GOLD }]}>{custos.length}</Text></View>
        </View>
      </MetalCard>
      <View style={cst.catGrid}>
        {totaisCat.map(cat => (
          <View key={cat.key} style={[cst.catCard, { borderColor: cat.color + '40' }]}>
            <View style={[cst.catIcon, { backgroundColor: cat.color + '20' }]}><Icon name={cat.icon} size={16} color={cat.color} /></View>
            <Text style={cst.catLabel}>{cat.label}</Text>
            <Text style={[cst.catVal, { color: cat.color }]}>{formatMoney(cat.total)}</Text>
          </View>
        ))}
      </View>
      {custos.slice(0, 5).map((c, i) => {
        const cat = getCat(c.categoria); const pag = getPag(c.pagamento);
        return (
          <View key={i} style={[cst.item, { borderColor: cat.color + '35' }]}>
            <View style={[cst.itemIcon, { backgroundColor: cat.color + '20' }]}><Icon name={cat.icon} size={18} color={cat.color} /></View>
            <View style={{ flex: 1 }}>
              <Text style={cst.itemDesc}>{c.descricao}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Icon name={pag.icon} size={10} color={SILVER_DARK} /><Text style={cst.itemPag}>{pag.label}</Text>
                <Text style={cst.itemDot}>•</Text><Text style={cst.itemData}>{c.dataFormatada}</Text>
              </View>
            </View>
            <Text style={[cst.itemVal, { color: cat.color }]}>{formatMoney(c.valor)}</Text>
            <TouchableOpacity style={cst.delBtn} onPress={() => onDelete(c)}><Icon name="delete-outline" size={16} color={DANGER} /></TouchableOpacity>
          </View>
        );
      })}
      {custos.length === 0 && (
        <View style={cst.empty}><Icon name="account-balance-wallet" size={36} color={GOLD + '40'} /><Text style={cst.emptyTxt}>Nenhum custo registrado</Text></View>
      )}
      <TouchableOpacity style={cst.addBtn} onPress={onAdd}>
        <Icon name="add" size={18} color={DARK_BG} style={{ marginRight: 6 }} />
        <Text style={cst.addTxt}>REGISTRAR CUSTO</Text>
      </TouchableOpacity>
    </View>
  );
}
const cst = StyleSheet.create({
  resumoRow:   { flexDirection: 'row', paddingVertical: 4 },
  resumoItem:  { flex: 1, alignItems: 'center' },
  resumoDiv:   { width: 1, backgroundColor: GOLD + '30' },
  resumoLabel: { fontSize: 9, color: SILVER_DARK, letterSpacing: 0.5, marginBottom: 4 },
  resumoVal:   { fontSize: 14, fontWeight: 'bold' },
  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catCard:     { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD_BG, borderRadius: 12, padding: 10, borderWidth: 1 },
  catIcon:     { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  catLabel:    { flex: 1, fontSize: 11, color: SILVER_DARK, fontWeight: '600' },
  catVal:      { fontSize: 11, fontWeight: 'bold' },
  item:        { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, gap: 10 },
  itemIcon:    { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  itemDesc:    { fontSize: 13, fontWeight: '600', color: SILVER_LIGHT },
  itemPag:     { fontSize: 10, color: SILVER_DARK },
  itemDot:     { fontSize: 10, color: SILVER_DARK },
  itemData:    { fontSize: 10, color: SILVER_DARK },
  itemVal:     { fontSize: 14, fontWeight: 'bold' },
  delBtn:      { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(244,67,54,0.12)', justifyContent: 'center', alignItems: 'center' },
  empty:       { paddingVertical: 24, alignItems: 'center' },
  emptyTxt:    { fontSize: 12, color: SILVER_DARK, marginTop: 8 },
  addBtn:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 12, paddingVertical: 13, marginTop: 4, shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 5 },
  addTxt:      { fontSize: 13, fontWeight: 'bold', color: DARK_BG, letterSpacing: 0.5 },
});

// ── haversine ─────────────────────────────────────────────────
function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════════════════════════
export default function DashboardScreen({ navigation }) {
  const [stats, setStats]                       = useState({ totalClientes: 0, clientesAtivos: 0, clientesPotenciais: 0 });
  const [topClientes, setTopClientes]           = useState([]);
  const [clientesRevisar, setClientesRevisar]   = useState([]);
  const [todosClientes, setTodosClientes]       = useState([]);
  const [pendencias, setPendencias]             = useState([]);
  const [historicoVisitas, setHistoricoVisitas] = useState([]);
  const [proximasVisitas, setProximasVisitas]   = useState([]);
  const [tarefasHoje, setTarefasHoje]           = useState([]);
  const [userLocation, setUserLocation]         = useState(null);
  const [refreshing, setRefreshing]             = useState(false);
  const [custos, setCustos]                     = useState([]);
  const [modalCusto, setModalCusto]             = useState(false);
  // FEAT 4: nome do usuário logado
  const [nomeUsuario, setNomeUsuario]           = useState('');
  // IDs retirados permanentemente da lista
  const [retirados, setRetirados]               = useState([]);
  // IDs pulados na fila de "clientes mais próximos" (voltam ao fim da fila)
  const [pulados, setPulados]                   = useState([]);
  // ref do ScrollView para scroll automático até Planejamento
  const scrollRef                               = useRef(null);
  const planejamentoY                           = useRef(0);

  useEffect(() => {
    loadDashboardData();
    loadCustos();
    getLocation();
    // FEAT 4: pega displayName do Firebase Auth
    const user = auth.currentUser;
    if (user) {
      const nome = user.displayName || user.email?.split('@')[0] || 'Usuário';
      // Pega apenas o primeiro nome
      setNomeUsuario(nome.split(' ')[0]);
    }
  }, []);

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) {}
  };

  const loadCustos = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'custos'), orderBy('data', 'desc'), limit(50)));
      const data = []; snap.forEach(d => data.push({ id: d.id, ...d.data() }));
      setCustos(data);
    } catch (e) {}
  };

  const salvarCusto = async (custo) => {
    const docRef = await addDoc(collection(db, 'custos'), custo);
    setCustos(prev => [{ id: docRef.id, ...custo }, ...prev]);
  };

  const deletarCusto = (custo) => {
    Alert.alert('Excluir custo', `Remover ${custo.descricao} - ${formatMoney(custo.valor)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try { await deleteDoc(doc(db, 'custos', custo.id)); setCustos(prev => prev.filter(c => c.id !== custo.id)); }
        catch (e) { Alert.alert('Erro', 'Não foi possível excluir'); }
      }},
    ]);
  };

  const loadDashboardData = async () => {
    try {
      const clientesSnap = await getDocs(collection(db, 'clientes'));
      let total = 0, ativos = 0, potenciais = 0, cMap = new Map(), semVisita = [], allClientes = [];
      const hoje     = new Date();
      const limite45 = new Date(); limite45.setDate(hoje.getDate() - 45);

      clientesSnap.forEach(docSnap => {
        const d = docSnap.data(); total++;
        if (d.status === 'ativo')          ativos++;
        else if (d.status === 'potencial') potenciais++;
        const c = {
          id: docSnap.id, ...d,
          latitude:  d.latitude  ? parseFloat(d.latitude)  : null,
          longitude: d.longitude ? parseFloat(d.longitude) : null,
        };
        allClientes.push(c);
        if (d.valorTotalGasto > 0) cMap.set(docSnap.id, { id: docSnap.id, nome: d.nome, valor: d.valorTotalGasto, tipo: d.tipo });
        if (d.dataUltimaVisita) {
          if (new Date(d.dataUltimaVisita) < limite45)
            semVisita.push({ id: docSnap.id, nome: d.nome, ultimaVisita: d.dataUltimaVisita, tipo: d.tipo, status: d.status, fornecedores: d.fornecedores });
        } else if (d.status !== 'potencial') {
          semVisita.push({ id: docSnap.id, nome: d.nome, ultimaVisita: null, tipo: d.tipo, status: d.status, fornecedores: d.fornecedores });
        }
      });

      setTopClientes(Array.from(cMap.values()).sort((a, b) => b.valor - a.valor).slice(0, 5));
      setClientesRevisar(semVisita.slice(0, 10));
      setTodosClientes(allClientes);
      setStats({ totalClientes: total, clientesAtivos: ativos, clientesPotenciais: potenciais });
      setRetirados([]); // reset ao recarregar
      setPulados([]);   // reset fila de pulados

      try {
        const pendSnap = await getDocs(query(collection(db, 'pendencias'), where('resolvida', '==', false), limit(10)));
        const pend = []; pendSnap.forEach(d => pend.push({ id: d.id, ...d.data() }));
        setPendencias(pend);
      } catch (e) {}

      try {
        const histSnap = await getDocs(query(collection(db, 'visitas'), orderBy('data', 'desc'), limit(30)));
        const hist = []; histSnap.forEach(d => hist.push({ id: d.id, ...d.data() }));
        setHistoricoVisitas(hist);
      } catch (e) {}

      try {
        const vs = await getDocs(query(collection(db, 'visitas'), where('data', '>=', new Date().toISOString().split('T')[0]), orderBy('data'), orderBy('hora'), limit(5)));
        const vd = []; vs.forEach(d => vd.push({ id: d.id, ...d.data() }));
        setProximasVisitas(vd);
      } catch (e) {}

      try {
        const hs = new Date().toISOString().split('T')[0];
        const ts = await getDocs(query(collection(db, 'tarefas'), where('data', '==', hs), where('concluido', '==', false), limit(5)));
        const td = []; ts.forEach(d => td.push({ id: d.id, ...d.data() }));
        setTarefasHoje(td);
      } catch (e) {}

    } catch (e) { console.log('Erro dashboard:', e); }
  };

  const onRefresh = async () => { setRefreshing(true); await loadDashboardData(); setRefreshing(false); };

  const adicionarComLocalizacao = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Ative a localização nas configurações.'); return; }
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let endereco = '';
      try {
        const addr = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addr?.length > 0) {
          const a = addr[0];
          endereco = [a.street, a.streetNumber, a.district || a.subregion, a.city, a.region].filter(Boolean).join(', ');
        }
      } catch (e) { endereco = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`; }
      navigation.navigate('Clientes', { abrirModalGPS: true, latitude: latitude.toString(), longitude: longitude.toString(), endereco });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível obter sua localização. Verifique se o GPS está ativo.');
    }
  };

  // ── Fila dinâmica de clientes mais próximos ──────────────────
  // Ordena por distância; pulados vão para o fim da fila
  const clientesComGPS = todosClientes.filter(c => c.latitude && c.longitude);
  const clientesOrdenados = userLocation && clientesComGPS.length > 0
    ? [...clientesComGPS]
        .map(c => ({ cliente: c, dist: calcDistKm(userLocation.latitude, userLocation.longitude, c.latitude, c.longitude) }))
        .sort((a, b) => {
          const aPulado = pulados.includes(a.cliente.id);
          const bPulado = pulados.includes(b.cliente.id);
          if (aPulado && !bPulado) return 1;
          if (!aPulado && bPulado) return -1;
          return a.dist - b.dist;
        })
    : [];

  // Pular: move cliente para o fim da fila; se todos já foram pulados → scroll até Planejamento
  const handlePular = (cliente) => {
    setPulados(prev => {
      const novos = [...prev, cliente.id];
      const filaAtual = clientesOrdenados.filter(({ cliente: c }) => !retirados.includes(c.id));
      const todosForam = filaAtual.every(({ cliente: c }) => novos.includes(c.id));
      if (todosForam) {
        setTimeout(() => scrollRef.current?.scrollTo({ y: planejamentoY.current, animated: true }), 350);
      }
      return novos;
    });
  };

  // Retirar da lista "Clientes a Visitar" permanentemente (só na sessão)
  const handleRetirar = (cliente) => {
    setRetirados(prev => [...prev, cliente.id]);
  };

  // Lista "Clientes a Visitar" sem os retirados
  const clientesVisistaFiltrados = clientesRevisar.filter(c => !retirados.includes(c.id));
  const listaVazia = clientesVisistaFiltrados.length === 0;

  // Fila dos mais próximos: exclui retirados, mostra em ordem (pulados no fim)
  const filaProximos = clientesOrdenados.filter(({ cliente: c }) => !retirados.includes(c.id));
  // Rótulos dinâmicos por posição
  const medalhas = ['🥇 Mais próximo', '🥈 Segundo mais próximo', '🥉 Terceiro mais próximo'];
  const getLabelProximo = (idx) => medalhas[idx] || `📍 ${idx + 1}º mais próximo`;

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent={false} />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: DARK_BG }}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={ds.header}>
          <View style={ds.headerLogoRow}>
            <Image source={require('../../assets/images/logo.png')} style={ds.logo} resizeMode="contain" />
          </View>
          <ShimmerLine color={GOLD} />
          <View style={ds.headerBottom}>
            <View>
              {/* FEAT 4: nome do usuário */}
              <Text style={ds.greetLabel}>
                Olá, <Text style={{ color: GOLD }}>{nomeUsuario || 'bem-vindo'}</Text> 👋
              </Text>
              <Text style={ds.greetDate}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            </View>
            <TouchableOpacity style={ds.locBtn} onPress={adicionarComLocalizacao}>
              <Icon name="add-location" size={16} color={DARK_BG} />
              <Text style={ds.locBtnTxt}>GPS</Text>
            </TouchableOpacity>
          </View>
          <View style={ds.kpiBar}>
            {[
              { label: 'Clientes',   value: stats.totalClientes,      gold: true  },
              { label: 'Ativos',     value: stats.clientesAtivos,     gold: false },
              { label: 'Potenciais', value: stats.clientesPotenciais, gold: true  },
            ].map((k, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={ds.kpiDiv} />}
                <View style={ds.kpiItem}>
                  <Text style={[ds.kpiVal, { color: k.gold ? GOLD : SILVER }]}>{k.value}</Text>
                  <Text style={ds.kpiLabel}>{k.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 1 ── ALERTAS ── */}
        <View style={ds.section}>
          <AlertasSection
            clientesRevisar={clientesRevisar}
            userLocation={userLocation}
            clientes={todosClientes}
            proximasVisitas={proximasVisitas}
            tarefasHoje={tarefasHoje}
          />
        </View>

        {/* ── CLIENTES MAIS PRÓXIMOS — fila dinâmica com Pular ── */}
        {filaProximos.length > 0 && (
          <View style={ds.section}>
            <SectionHeader title="📍 Clientes Mais Próximos" gold />
            {filaProximos.slice(0, 3).map(({ cliente: c, dist }, idx) => (
              <React.Fragment key={c.id}>
                <Text style={[ds.proximoLabel, pulados.includes(c.id) && { color: SILVER_DARK, opacity: 0.6 }]}>
                  {getLabelProximo(idx)}{pulados.includes(c.id) ? ' (pulado)' : ''}
                </Text>
                <ClienteVisitarCard
                  cliente={c}
                  historico={historicoVisitas}
                  distancia={dist}
                  onPress={() => navigation.navigate('Clientes', { screen: 'Clientes', params: { clienteId: c.id } })}
                  onPular={handlePular}
                  onRota={(cl) => navigation.navigate('Mapa', { clienteDestino: cl })}
                />
              </React.Fragment>
            ))}
            {filaProximos.length > 3 && (
              <Text style={ds.maisNaFila}>+{filaProximos.length - 3} na fila</Text>
            )}
          </View>
        )}

        {/* 2 ── PLANEJAMENTO DO DIA ── */}
        <View
          style={ds.section}
          onLayout={(e) => { planejamentoY.current = e.nativeEvent.layout.y; }}
        >
          <SectionHeader title="Planejamento do Dia" onPress={() => navigation.navigate('Planejamento')} gold />
          <View style={ds.planGrid}>
            <MetalCard gold style={ds.planCard}>
              <View style={ds.planHeader}>
                <Icon name="event" size={16} color={GOLD} />
                <Text style={[ds.planTitle, { color: GOLD }]}>Próximas Visitas</Text>
              </View>
              {proximasVisitas.length > 0 ? proximasVisitas.map((v, i) => (
                <TouchableOpacity key={i} style={ds.planItem} onPress={() => navigation.navigate('Planejamento', { screen: 'Planejamento', params: { data: v.data } })}>
                  <Text style={ds.planHora}>{v.hora || '--:--'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={ds.planTitulo} numberOfLines={1}>{v.titulo}</Text>
                    {v.clienteNome && <Text style={ds.planSub}>{v.clienteNome}</Text>}
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={ds.planEmpty}><Icon name="event-available" size={26} color={GOLD + '40'} /><Text style={ds.planEmptyTxt}>Nenhuma visita</Text></View>
              )}
              <TouchableOpacity style={[ds.planBtn, { borderColor: GOLD + '55' }]} onPress={() => navigation.navigate('Planejamento', { screen: 'Planejamento', params: { tab: 'visita' } })}>
                <Text style={[ds.planBtnTxt, { color: GOLD }]}>+ Nova Visita</Text>
              </TouchableOpacity>
            </MetalCard>

            <MetalCard style={ds.planCard}>
              <View style={ds.planHeader}>
                <Icon name="check-circle" size={16} color={SILVER} />
                <Text style={[ds.planTitle, { color: SILVER }]}>Tarefas do Dia</Text>
              </View>
              {tarefasHoje.length > 0 ? tarefasHoje.map((t, i) => (
                <TouchableOpacity key={i} style={ds.planItem} onPress={() => navigation.navigate('Planejamento', { screen: 'Planejamento', params: { tab: 'tarefa' } })}>
                  <View style={[ds.prioD, { backgroundColor: t.prioridade === 'alta' ? DANGER : t.prioridade === 'media' ? GOLD : SUCCESS }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={ds.planTitulo} numberOfLines={1}>{t.titulo}</Text>
                    {t.descricao && <Text style={ds.planSub} numberOfLines={1}>{t.descricao}</Text>}
                  </View>
                </TouchableOpacity>
              )) : (
                <View style={ds.planEmpty}><Icon name="playlist-add-check" size={26} color={SILVER + '40'} /><Text style={ds.planEmptyTxt}>Nenhuma tarefa</Text></View>
              )}
              <TouchableOpacity style={[ds.planBtn, { borderColor: SILVER + '45' }]} onPress={() => navigation.navigate('Planejamento', { screen: 'Planejamento', params: { tab: 'tarefa' } })}>
                <Text style={[ds.planBtnTxt, { color: SILVER }]}>+ Nova Tarefa</Text>
              </TouchableOpacity>
            </MetalCard>
          </View>
        </View>

        {/* 3 ── CLIENTES A VISITAR + botão RETIRAR ── */}
        {/* FEAT 3: só mostra a seção se houver clientes na lista */}
        {!listaVazia && (
          <View style={ds.section}>
            <View style={ds.visitarHeader}>
              <SectionHeader title="Clientes a Visitar" onPress={() => navigation.navigate('Clientes')} gold={false} />
              <Text style={ds.visitaCount}>{clientesVisistaFiltrados.length} restantes</Text>
            </View>
            <PendenciasSection pendencias={pendencias} onPress={(p) => navigation.navigate('Clientes', { clienteId: p.clienteId })} />
            {clientesVisistaFiltrados.map((c, i) => (
              <ClienteVisitarCard
                key={c.id + i}
                cliente={c}
                historico={historicoVisitas}
                distancia={userLocation && c.latitude && c.longitude
                  ? calcDistKm(userLocation.latitude, userLocation.longitude, c.latitude, c.longitude)
                  : null}
                onPress={() => navigation.navigate('Clientes', { screen: 'Clientes', params: { clienteId: c.id } })}
                onRota={(cl) => navigation.navigate('Mapa', { clienteDestino: cl })}
              />
            ))}
          </View>
        )}

        {/* FEAT 3: Preparação sobe quando lista está vazia */}
        <View style={ds.section}>
          <SectionHeader title="Preparação" gold />
          {listaVazia && (
            <View style={ds.listaVaziaCard}>
              <Icon name="check-circle" size={22} color={SUCCESS} />
              <Text style={ds.listaVaziaTxt}>Todos os clientes visitados! 🎉</Text>
            </View>
          )}
          <ChecklistKit />
        </View>

        {/* 4 ── AÇÕES RÁPIDAS ── */}
        <View style={ds.section}>
          <SectionHeader title="Ações Rápidas" gold />
          <View style={ds.actionsGrid}>
            <ActionButton title="Novo Cliente"  icon="person-add"  gold onPress={() => navigation.navigate('Clientes')} />
            <ActionButton title="Ver Mapa"      icon="map"         gold onPress={() => navigation.navigate('Mapa')} />
            <ActionButton title="Planejamento"  icon="event-note"       onPress={() => navigation.navigate('Planejamento')} />
            <ActionButton title="Otimizar Rota" icon="alt-route"        onPress={() => navigation.navigate('Rotas')} />
          </View>
        </View>

        {/* 5 ── CONTROLE DE CUSTOS ── */}
        <View style={ds.section}>
          <SectionHeader title="Controle de Custos" gold />
          <CustosSection custos={custos} onAdd={() => setModalCusto(true)} onDelete={deletarCusto} />
        </View>

        {/* 6 ── CLIENTES MAIS LUCRATIVOS ── */}
        <View style={ds.section}>
          <SectionHeader title="Clientes Mais Lucrativos" onPress={() => navigation.navigate('Clientes')} gold />
          {topClientes.length > 0 ? topClientes.map((c, i) => (
            <TouchableOpacity key={i} style={ds.rankItem} onPress={() => navigation.navigate('Clientes', { screen: 'Clientes', params: { clienteId: c.id } })} activeOpacity={0.85}>
              <View style={[ds.rankBadge, { backgroundColor: i === 0 ? GOLD : i === 1 ? SILVER : SILVER_DARK + '70' }]}>
                <Text style={[ds.rankPos, { color: i < 2 ? DARK_BG : SILVER_LIGHT }]}>{i + 1}°</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ds.rankNome}>{c.nome}</Text>
                <Text style={ds.rankTipo}>{c.tipo}</Text>
              </View>
              <Text style={[ds.rankValor, { color: i === 0 ? GOLD : SILVER }]}>{formatMoney(c.valor)}</Text>
            </TouchableOpacity>
          )) : (
            <MetalCard gold><View style={ds.emptyWrap}>
              <Icon name="bar-chart" size={30} color={GOLD + '50'} />
              <Text style={ds.emptyTxt}>Nenhum dado disponível</Text>
            </View></MetalCard>
          )}
        </View>

      </ScrollView>

      <CustoModal visible={modalCusto} onClose={() => setModalCusto(false)} onSave={salvarCusto} />
    </View>
  );
}

const ds = StyleSheet.create({
  header:         { backgroundColor: '#001828', paddingBottom: 16, paddingHorizontal: 20, paddingTop: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  headerLogoRow:  { alignItems: 'center', paddingBottom: 12 },
  logo:           { width: 160, height: 46 },
  headerBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  greetLabel:     { fontSize: 15, color: SILVER_LIGHT, fontWeight: '600' },
  greetDate:      { fontSize: 10, color: SILVER_DARK, marginTop: 2, textTransform: 'capitalize' },
  locBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
  locBtnTxt:      { fontSize: 11, fontWeight: 'bold', color: DARK_BG },
  kpiBar:         { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: GOLD + '20' },
  kpiItem:        { flex: 1, alignItems: 'center' },
  kpiVal:         { fontSize: 14, fontWeight: 'bold' },
  kpiLabel:       { fontSize: 9, color: SILVER_DARK, marginTop: 2, letterSpacing: 0.5 },
  kpiDiv:         { width: 1, backgroundColor: SILVER + '20' },
  section:        { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 2 },
  proximoLabel:   { fontSize: 11, color: SILVER_DARK, fontWeight: '600', marginBottom: 4, marginLeft: 2 },
  maisNaFila:     { fontSize: 11, color: SILVER_DARK, textAlign: 'center', paddingVertical: 6, fontStyle: 'italic' },
  visitarHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitaCount:    { fontSize: 12, color: SILVER_DARK, fontWeight: '600', marginBottom: 12 },
  listaVaziaCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SUCCESS + '15', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: SUCCESS + '40', marginBottom: 10 },
  listaVaziaTxt:  { fontSize: 13, color: SUCCESS, fontWeight: '600' },
  planGrid:       { flexDirection: 'row', justifyContent: 'space-between' },
  planCard:       { width: '48.5%' },
  planHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  planTitle:      { fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  planItem:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  planHora:       { fontSize: 11, fontWeight: 'bold', color: GOLD, width: 40 },
  prioD:          { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  planTitulo:     { fontSize: 11, fontWeight: '600', color: SILVER_LIGHT },
  planSub:        { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  planEmpty:      { paddingVertical: 16, alignItems: 'center' },
  planEmptyTxt:   { fontSize: 10, color: SILVER_DARK, marginTop: 4 },
  planBtn:        { marginTop: 10, paddingVertical: 7, alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  planBtnTxt:     { fontSize: 11, fontWeight: '600' },
  rankItem:       { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: GOLD + '25', shadowColor: GOLD, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 6, elevation: 3 },
  rankBadge:      { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankPos:        { fontWeight: 'bold', fontSize: 13 },
  rankNome:       { fontSize: 14, fontWeight: 'bold', color: SILVER_LIGHT },
  rankTipo:       { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  rankValor:      { fontSize: 14, fontWeight: 'bold' },
  actionsGrid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emptyWrap:      { alignItems: 'center', paddingVertical: 16 },
  emptyTxt:       { fontSize: 13, color: SILVER_DARK, marginTop: 8 },
});

