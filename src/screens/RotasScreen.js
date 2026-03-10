import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform, StatusBar,
  Animated, Dimensions, ScrollView, Share, Linking,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import VisitaModal from './VisitaModal';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
const GOLD_LIGHT   = '#F5D07A';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const SUCCESS      = '#4CAF50';
const DANGER       = '#EF5350';
const WARN         = '#FF9800';

// Dias sem visita que aciona alerta
const DIAS_ALERTA_VISITA = 30;

// Mapeamento completo: qualquer substring do endereço → nome padronizado da cidade

// Extrai cidade padronizada de um cliente — usa campo direto
const getCidadeFromCliente = (c) => {
  if (c.cidade && c.cidade.trim()) return c.cidade.trim();
  return 'Sem cidade';
};

const TIPO_COLORS = {
  loja:         { main: '#E8B432', light: '#F5D07A', bg: '#E8B43220' },
  obra:         { main: '#4CAF50', light: '#81C784', bg: '#4CAF5020' },
  distribuidor: { main: '#5BA3D0', light: '#90CAF9', bg: '#5BA3D020' },
};
const getTipoColor = (tipo) => TIPO_COLORS[tipo] || { main: SILVER, light: SILVER_LIGHT, bg: SILVER + '18' };
const getTipoIcon  = (tipo) => tipo === 'loja' ? 'store' : tipo === 'obra' ? 'construction' : tipo === 'distribuidor' ? 'business' : 'location-on';

// ── HAVERSINE ─────────────────────────────────────────────────
const deg2rad = (d) => d * (Math.PI / 180);
const calcDist = (la1, lo1, la2, lo2) => {
  const R = 6371, dL = deg2rad(la2 - la1), dO = deg2rad(lo2 - lo1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(deg2rad(la1)) * Math.cos(deg2rad(la2)) * Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── OTIMIZADOR: Nearest Neighbor + 2-opt ─────────────────────
const otimizarRota = (pontos) => {
  if (pontos.length <= 2) return pontos;
  const visitados = [pontos[0]];
  const restantes = [...pontos.slice(1)];
  while (restantes.length > 0) {
    const ultimo = visitados[visitados.length - 1];
    let menorDist = Infinity, menorIdx = 0;
    restantes.forEach((p, i) => {
      const d = calcDist(ultimo.latitude, ultimo.longitude, p.latitude, p.longitude);
      if (d < menorDist) { menorDist = d; menorIdx = i; }
    });
    visitados.push(restantes[menorIdx]);
    restantes.splice(menorIdx, 1);
  }
  let melhorou = true;
  while (melhorou) {
    melhorou = false;
    for (let i = 1; i < visitados.length - 1; i++) {
      for (let j = i + 1; j < visitados.length; j++) {
        const distAntes =
          calcDist(visitados[i-1].latitude, visitados[i-1].longitude, visitados[i].latitude, visitados[i].longitude) +
          calcDist(visitados[j-1].latitude, visitados[j-1].longitude, visitados[j] ? visitados[j].latitude : visitados[j-1].latitude, visitados[j] ? visitados[j].longitude : visitados[j-1].longitude);
        const distDepois =
          calcDist(visitados[i-1].latitude, visitados[i-1].longitude, visitados[j-1].latitude, visitados[j-1].longitude) +
          calcDist(visitados[i].latitude, visitados[i].longitude, visitados[j] ? visitados[j].latitude : visitados[i].latitude, visitados[j] ? visitados[j].longitude : visitados[i].longitude);
        if (distDepois < distAntes - 0.001) {
          visitados.splice(i, j - i, ...visitados.slice(i, j).reverse());
          melhorou = true;
        }
      }
    }
  }
  return visitados;
};

const calcularDistanciaTotal = (rota) => {
  let total = 0;
  for (let i = 0; i < rota.length - 1; i++)
    total += calcDist(rota[i].latitude, rota[i].longitude, rota[i+1].latitude, rota[i+1].longitude);
  return total;
};

const estimarTempo = (km) => {
  const min = Math.round((km / 40) * 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const estimarCombustivel = (km, consumo = 8) => (km / consumo).toFixed(1);

// ── SHIMMER ───────────────────────────────────────────────────
function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })).start();
  }, []);
  return (
    <View style={{ height: 1, width: '100%', backgroundColor: color + '25', overflow: 'hidden' }}>
      <Animated.View style={{
        position: 'absolute', height: '100%', width: 80, backgroundColor: color + 'BB',
        transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, SW] }) }],
      }} />
    </View>
  );
}

// ── KPI BOX ───────────────────────────────────────────────────
function KpiBox({ icon, value, label, gold = false }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 2000, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={kb.box}>
      <Animated.View style={[kb.icon, { backgroundColor: (gold ? GOLD : SILVER) + '20', transform: [{ scale: pulse }] }]}>
        <Icon name={icon} size={18} color={gold ? GOLD : SILVER} type="material" />
      </Animated.View>
      <Text style={[kb.val, { color: gold ? GOLD : SILVER }]}>{value}</Text>
      <Text style={kb.label}>{label}</Text>
    </View>
  );
}
const kb = StyleSheet.create({
  box:   { flex: 1, alignItems: 'center', paddingVertical: 10 },
  icon:  { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  val:   { fontSize: 13, fontWeight: 'bold' },
  label: { fontSize: 9, color: SILVER_DARK, marginTop: 2, letterSpacing: 0.3, textAlign: 'center' },
});

// ── CLIENTE ITEM ──────────────────────────────────────────────
function ClienteItem({ item, selected, onPress, userLocation, alerta }) {
  const tc    = getTipoColor(item.tipo);
  const scale = useRef(new Animated.Value(1)).current;
  const dist  = userLocation
    ? calcDist(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude)
    : null;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          ci.card,
          selected && { borderColor: tc.main + '90', backgroundColor: tc.bg },
          alerta?.tipo === 'nao_comprou' && !selected && { borderColor: DANGER + '40' },
          alerta?.tipo === 'sem_visita'  && !selected && { borderColor: DANGER + '30' },
        ]}
        onPress={handlePress} activeOpacity={0.85}>
        {selected && <ShimmerLine color={tc.main} />}
        {/* Barra de alerta no topo do card */}
        {alerta && !selected && (
          <View style={[ci.alertBar, { backgroundColor: alerta.cor + '25', borderBottomColor: alerta.cor + '40' }]}>
            <Icon name={alerta.tipo === 'nao_comprou' ? 'cancel' : alerta.tipo === 'sem_visita' ? 'event-busy' : 'schedule'}
              size={11} color={alerta.cor} type="material" />
            <Text style={[ci.alertTxt, { color: alerta.cor }]}>{alerta.label}</Text>
            {alerta.dias != null && (
              <Text style={[ci.alertDias, { color: alerta.cor + 'AA' }]}>• última há {alerta.dias}d</Text>
            )}
          </View>
        )}
        <View style={ci.row}>
          <View style={[ci.check,
            selected
              ? { backgroundColor: tc.main, borderColor: tc.main }
              : { backgroundColor: 'transparent', borderColor: SILVER + '50' }]}>
            {selected && <Icon name="check" size={14} color={DARK_BG} type="material" />}
          </View>
          <View style={[ci.iconWrap, { backgroundColor: tc.bg }]}>
            <Icon name={getTipoIcon(item.tipo)} size={18} color={tc.main} type="material" />
          </View>
          <View style={ci.info}>
            <Text style={ci.nome}>{item.nome}</Text>
            {item.endereco ? (
              <View style={ci.addrRow}>
                <Icon name="location-on" size={10} color={SILVER_DARK} type="material" />
                <Text style={ci.addr} numberOfLines={1}>{item.endereco}</Text>
              </View>
            ) : null}
          </View>
          <View style={ci.right}>
            {dist !== null && (
              <Text style={[ci.dist, { color: tc.main }]}>
                {dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`}
              </Text>
            )}
            <View style={[ci.badge, { backgroundColor: tc.bg, borderColor: tc.main + '50' }]}>
              <Text style={[ci.badgeTxt, { color: tc.light }]}>{item.tipo}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const ci = StyleSheet.create({
  card:     { backgroundColor: CARD_BG, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: SILVER + '25', overflow: 'hidden' },
  alertBar: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 1 },
  alertTxt: { fontSize: 10, fontWeight: '700' },
  alertDias:{ fontSize: 10 },
  row:      { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  check:    { width: 24, height: 24, borderRadius: 7, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  iconWrap: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  info:     { flex: 1 },
  nome:     { fontSize: 13, fontWeight: 'bold', color: SILVER_LIGHT },
  addrRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  addr:     { fontSize: 10, color: SILVER_DARK, marginLeft: 3, flex: 1 },
  right:    { alignItems: 'flex-end', gap: 4 },
  dist:     { fontSize: 11, fontWeight: 'bold' },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeTxt: { fontSize: 9, fontWeight: '700' },
});

// ── PARADA DA ROTA ────────────────────────────────────────────
function RotaItem({ ponto, index, total, distProxima, isAtual = false, isConcluido = false }) {
  const isStart  = index === 0;
  const isLast   = index === total - 1;
  const tc       = ponto.tipo ? getTipoColor(ponto.tipo) : { main: GOLD, bg: GOLD + '20' };
  const numColor = isStart ? '#2196F3' : isLast ? SUCCESS : tc.main;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isAtual) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isAtual]);

  return (
    <View style={ri.wrap}>
      {index < total - 1 && <View style={[ri.line, { backgroundColor: isConcluido ? SUCCESS + '60' : numColor + '40' }]} />}
      <Animated.View style={[ri.row, isAtual && { transform: [{ scale: pulseAnim }] }]}>
        <View style={[ri.num,
          isConcluido
            ? { backgroundColor: SUCCESS + '30', borderColor: SUCCESS + '80' }
            : isAtual
              ? { backgroundColor: numColor + '40', borderColor: numColor, borderWidth: 2.5 }
              : { backgroundColor: numColor + '20', borderColor: numColor + '60' }
        ]}>
          {isConcluido
            ? <Icon name="check" size={14} color={SUCCESS} type="material" />
            : isStart
              ? <Icon name="my-location" size={14} color={numColor} type="material" />
              : isLast
                ? <Icon name="flag"       size={14} color={numColor} type="material" />
                : <Text style={[ri.numTxt, { color: numColor }]}>{index}</Text>
          }
        </View>
        <View style={[ri.card,
          isConcluido ? { borderColor: SUCCESS + '40', opacity: 0.6 }
          : isAtual   ? { borderColor: numColor + '80', borderWidth: 1.5, shadowColor: numColor, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }
                      : { borderColor: numColor + '35' }
        ]}>
          <View style={[ri.cardTop, { backgroundColor: isConcluido ? SUCCESS : numColor }]} />
          <View style={ri.cardContent}>
            {isAtual && (
              <View style={ri.atualBadge}>
                <Icon name="navigation" size={10} color={DARK_BG} type="material" />
                <Text style={ri.atualBadgeTxt}>EM ROTA</Text>
              </View>
            )}
            {isConcluido && (
              <View style={[ri.atualBadge, { backgroundColor: SUCCESS }]}>
                <Icon name="check-circle" size={10} color={DARK_BG} type="material" />
                <Text style={ri.atualBadgeTxt}>CONCLUÍDO</Text>
              </View>
            )}
            <View style={ri.cardRow}>
              {ponto.tipo
                ? <View style={[ri.typeIcon, { backgroundColor: tc.bg }]}>
                    <Icon name={getTipoIcon(ponto.tipo)} size={14} color={tc.main} type="material" />
                  </View>
                : <Icon name={isStart ? 'my-location' : 'flag'} size={16} color={numColor} style={{ marginRight: 8 }} type="material" />
              }
              <Text style={ri.cardNome}>{ponto.nome}</Text>
            </View>
            {ponto.endereco ? (
              <Text style={ri.cardAddr} numberOfLines={1}>{ponto.endereco}</Text>
            ) : null}
            {distProxima != null && !isConcluido && (
              <View style={ri.distRow}>
                <Icon name="arrow-downward" size={10} color={SILVER_DARK} type="material" />
                <Text style={ri.distTxt}>{distProxima.toFixed(1)} km até o próximo • ≈{estimarTempo(distProxima)}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
const ri = StyleSheet.create({
  wrap:        { marginBottom: 4, paddingLeft: 20 },
  line:        { position: 'absolute', left: 30, top: 36, width: 2, height: 52, zIndex: 0 },
  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  num:         { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, zIndex: 1, marginTop: 4 },
  numTxt:      { fontSize: 13, fontWeight: 'bold' },
  card:        { flex: 1, backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  cardTop:     { height: 2 },
  cardContent: { padding: 10 },
  cardRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  typeIcon:    { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  cardNome:    { fontSize: 13, fontWeight: 'bold', color: SILVER_LIGHT, flex: 1 },
  cardAddr:    { fontSize: 10, color: SILVER_DARK, marginLeft: 34, marginTop: -2 },
  distRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 3 },
  distTxt:     { fontSize: 10, color: SILVER_DARK },
  atualBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6 },
  atualBadgeTxt:{ fontSize: 9, fontWeight: '800', color: DARK_BG, letterSpacing: 0.5 },
  currentBadge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginLeft: 6 },
  currentBadgeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});

// ── HTML DO MAPA LEAFLET ──────────────────────────────────────
function buildRotaHTML(rota) {
  const coords  = rota.map(p => `[${p.latitude},${p.longitude}]`).join(',');
  const markers = rota.map((p, i) => {
    const isStart = i === 0;
    const isLast  = i === rota.length - 1;
    const color   = isStart ? '#2196F3' : isLast ? '#4CAF50' : (TIPO_COLORS[p.tipo]?.main || '#E8B432');
    const emoji   = isStart ? '📍' : isLast ? '🏁' : p.tipo === 'loja' ? '🏪' : p.tipo === 'obra' ? '🏗️' : '🏢';
    const nomeSafe = (p.nome || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const endSafe  = (p.endereco || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const label    = isStart ? 'Minha Localização' : `${i}. ${nomeSafe}`;
    return `
    (function(){
      var el=document.createElement('div');
      el.style.cssText='width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid rgba(255,255,255,0.85);box-shadow:0 3px 10px rgba(0,0,0,0.5);cursor:pointer;';
      el.innerHTML='${emoji}';
      var numEl=document.createElement('div');
      numEl.style.cssText='position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#001E2E;color:${color};font-size:10px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:1px solid ${color};';
      numEl.innerHTML='${isStart ? '📍' : isLast ? '🏁' : i}';
      el.style.position='relative';
      el.appendChild(numEl);
      L.marker([${p.latitude},${p.longitude}],{
        icon:L.divIcon({html:el.outerHTML,className:'',iconSize:[36,36],iconAnchor:[18,18]})
      }).addTo(map).bindPopup('<b>${label}</b>${endSafe ? '<br><small>' + endSafe + '</small>' : ''}');
    })();`;
  }).join('\n');

  const centerLat = rota[0]?.latitude  || -14.235;
  const centerLng = rota[0]?.longitude || -51.925;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body,#map{width:100%;height:100%;background:#001E2E;}
  .leaflet-control-attribution{display:none!important;}
  .leaflet-control-zoom a{background:#002840!important;color:#E8B432!important;border-color:#E8B43230!important;font-weight:bold;}
  .leaflet-popup-content-wrapper{background:#002840;color:#E8EEF5;border:1px solid #E8B43230;border-radius:12px;}
  .leaflet-popup-tip{background:#002840;}
  .leaflet-popup-content{margin:10px 14px;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false}).setView([${centerLat},${centerLng}],12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var coords=[${coords}];
if(coords.length>1){
  L.polyline(coords,{color:'#E8B432',weight:5,opacity:0.9,dashArray:'10,6'}).addTo(map);
  for(var i=0;i<coords.length-1;i++){
    var mid=[(coords[i][0]+coords[i+1][0])/2,(coords[i][1]+coords[i+1][1])/2];
    var angle=Math.atan2(coords[i+1][1]-coords[i][1],coords[i+1][0]-coords[i][0])*180/Math.PI;
    var arrowEl=document.createElement('div');
    arrowEl.style.cssText='color:#E8B432;font-size:16px;transform:rotate('+angle+'deg);';
    arrowEl.innerHTML='➤';
    L.marker(mid,{icon:L.divIcon({html:arrowEl.outerHTML,className:'',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
  }
}
${markers}
if(coords.length>0) map.fitBounds(L.latLngBounds(coords),{padding:[50,50]});
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
export default function RotasScreen() {
  const [clientes,     setClientes]     = useState([]);
  const [selected,     setSelected]     = useState([]);
  const [rota,         setRota]         = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [showRota,     setShowRota]     = useState(false);
  const [showMapa,     setShowMapa]     = useState(false);
  const [showExportar, setShowExportar] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [paradaAtual,  setParadaAtual]  = useState(0);
  const [visitaCliente, setVisitaCliente] = useState(null);
  const [info,         setInfo]         = useState({ distancia: 0, tempo: '', count: 0, economizado: 0, combustivel: 0 });
  // Filtro de cidade
  const [cidadeFiltro, setCidadeFiltro] = useState('Todas');
  // Alertas por cliente: { clienteId: { diasSemVisita, ultimoResultado } }
  const [alertasClientes, setAlertasClientes] = useState({});
  const exportarAnim = useRef(new Animated.Value(0)).current;
  const headerAnim   = useRef(new Animated.Value(0)).current;
  const rotaAnim     = useRef(new Animated.Value(0)).current;
  const scrollRef    = useRef(null);
  const proximoAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    getUserLocation();
    loadDados();
  }, []);

  const getUserLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Precisamos da sua localização para otimizar a rota'); return; }
      let loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) { console.log('Erro localização:', e); }
  };

  const loadDados = async () => {
    try {
      // ── clientes ──
      const snapC = await getDocs(collection(db, 'clientes'));
      const data = [];
      snapC.forEach(d => {
        const c = d.data();
        if (c.latitude && c.longitude)
          data.push({ id: d.id, ...c, latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) });
      });
      setClientes(data);

      // ── visitas → alertas por cliente ──
      const snapV = await getDocs(collection(db, 'visitas'));
      const visitasPorCliente = {};
      snapV.forEach(d => {
        const v = d.data();
        if (!v.clienteId) return;
        if (!visitasPorCliente[v.clienteId]) visitasPorCliente[v.clienteId] = [];
        visitasPorCliente[v.clienteId].push(v);
      });

      const hoje = new Date();
      const alertas = {};
      data.forEach(c => {
        const visitas = visitasPorCliente[c.id] || [];
        if (visitas.length === 0) {
          alertas[c.id] = { tipo: 'sem_visita', label: 'Sem visita', cor: DANGER };
          return;
        }
        visitas.sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));
        const ultima = visitas[0];
        const diasSem = Math.floor((hoje - new Date(ultima.dataLocal || 0)) / (1000 * 60 * 60 * 24));
        if (ultima.resultado === 'nao_comprou') {
          alertas[c.id] = { tipo: 'nao_comprou', label: 'Não comprou', cor: DANGER, dias: diasSem };
        } else if (diasSem >= DIAS_ALERTA_VISITA) {
          alertas[c.id] = { tipo: 'antigo', label: `${diasSem}d sem visita`, cor: WARN, dias: diasSem };
        } else if (ultima.resultado === 'retornar') {
          alertas[c.id] = { tipo: 'retornar', label: 'Retornar', cor: WARN, dias: diasSem };
        }
      });
      setAlertasClientes(alertas);

    } catch (e) { console.log('Erro loadDados:', e); }
  };

  const toggleCliente = (c) =>
    setSelected(prev => prev.find(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]);

  const calcularRota = async () => {
    if (selected.length < 1) { Alert.alert('Atenção', 'Selecione pelo menos 1 cliente'); return; }
    if (!userLocation)        { Alert.alert('Erro', 'Aguardando localização GPS...'); return; }
    setLoading(true);
    try {
      const origem = { latitude: userLocation.latitude, longitude: userLocation.longitude, nome: 'Minha Localização', tipo: null };
      const maisDistante = selected.reduce((max, c) => {
        const d = calcDist(userLocation.latitude, userLocation.longitude, c.latitude, c.longitude);
        return d > max.dist ? { c, dist: d } : max;
      }, { c: selected[0], dist: 0 }).c;
      const intermediarios = selected.filter(c => c.id !== maisDistante.id);
      const pontosOtim = otimizarRota([origem, ...intermediarios]);
      const rotaFinal = [...pontosOtim, maisDistante];
      const distOtimizada = calcularDistanciaTotal(rotaFinal);
      const distSemOtim   = calcularDistanciaTotal([origem, ...selected]);
      const economizado   = Math.max(0, distSemOtim - distOtimizada);
      setRota(rotaFinal);
      setInfo({
        distancia:   distOtimizada.toFixed(1),
        tempo:       estimarTempo(distOtimizada),
        count:       selected.length,
        economizado: economizado.toFixed(1),
        combustivel: estimarCombustivel(distOtimizada),
      });
      rotaAnim.setValue(0);
      setParadaAtual(1); // começa na primeira parada real (índice 0 = origem)
      setShowRota(true);
      setShowMapa(false);
      Animated.timing(rotaAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível calcular a rota');
    } finally {
      setLoading(false);
    }
  };

  const compartilharRota = () => {
    const linhas = rota.map((p, i) => {
      const prefix   = i === 0 ? '📍 Início' : `${i}.`;
      const mapsLink = p.latitude && p.longitude ? `https://maps.google.com/?q=${p.latitude},${p.longitude}` : '';
      return `${prefix} ${p.nome}${mapsLink ? '\n   ' + mapsLink : ''}`;
    });
    const msg = `🗺️ *Rota MAYA Representações*\n`
      + `📏 ${info.distancia} km  ⏱️ ${info.tempo}  👥 ${info.count} clientes\n`
      + `⛽ Combustível estimado: ~${info.combustivel}L  💚 Economia: ${info.economizado} km\n\n`
      + linhas.join('\n\n');
    Share.share({ message: msg, title: 'Rota Otimizada MAYA' });
  };

  const abrirGoogleMaps = () => {
    if (rota.length < 2) return;
    const origin      = `${rota[0].latitude},${rota[0].longitude}`;
    const destination = `${rota[rota.length-1].latitude},${rota[rota.length-1].longitude}`;
    const waypoints   = rota.slice(1, -1).map(p => `${p.latitude},${p.longitude}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? '&waypoints=' + waypoints : ''}&travelmode=driving`;
    Linking.openURL(url).catch(() => Share.share({ message: `🗺️ Rota Google Maps:\n${url}` }));
  };

  const abrirWaze = () => {
    if (rota.length < 2) return;
    const primeiro = rota[1];
    const url = `waze://?ll=${primeiro.latitude},${primeiro.longitude}&navigate=yes`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://waze.com/ul?ll=${primeiro.latitude},${primeiro.longitude}&navigate=yes`)
        .catch(() => Share.share({ message: `🚗 Waze:\nhttps://waze.com/ul?ll=${primeiro.latitude},${primeiro.longitude}&navigate=yes` }));
    });
  };

  const abrirModalExportar = () => {
    setShowExportar(true);
    exportarAnim.setValue(0);
    Animated.spring(exportarAnim, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }).start();
  };

  const fecharModalExportar = () => {
    Animated.timing(exportarAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowExportar(false));
  };

  const reiniciarRota = () => {
    Alert.alert(
      'Reiniciar Rota',
      'Deseja limpar a rota atual e voltar à seleção de clientes?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: () => {
            setRota([]);
            setSelected([]);
            setParadaAtual(0);
            setShowRota(false);
            setShowMapa(false);
          },
        },
      ]
    );
  };

  const avancarProximo = () => {
    const proxIdx = paradaAtual + 1;
    if (proxIdx >= rota.length) {
      Alert.alert('🏁 Rota Concluída!', `Você completou todas as ${info.count} paradas!`, [
        { text: 'Reiniciar', onPress: reiniciarRota },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    // Abre check-in do cliente ATUAL antes de avançar
    const clienteAtual = rota[paradaAtual];
    if (clienteAtual?.id) {
      setVisitaCliente(clienteAtual);
    } else {
      // É a origem (sem id) — avança direto
      _avancarParada(proxIdx);
    }
  };

  const _avancarParada = (proxIdx) => {
    Animated.sequence([
      Animated.timing(proximoAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(proximoAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    setParadaAtual(proxIdx);
    scrollRef.current?.scrollTo({ y: proxIdx * 88, animated: true });
  };

  const ModalExportar = () => {
    if (!showExportar) return null;
    return (
      <View style={me.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={fecharModalExportar} activeOpacity={1} />
        <Animated.View style={[me.sheet, {
          transform: [{ translateY: exportarAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }],
          opacity: exportarAnim,
        }]}>
          <View style={me.handle} />
          <Text style={me.title}>Exportar Rota</Text>
          <Text style={me.sub}>{info.count} paradas • {info.distancia} km • {info.tempo}</Text>
          <ShimmerLine color={GOLD} />
          <View style={me.apps}>
            <TouchableOpacity style={me.appBtn} onPress={() => { fecharModalExportar(); setTimeout(abrirGoogleMaps, 300); }} activeOpacity={0.85}>
              <View style={[me.appIcon, { backgroundColor: '#4285F420' }]}>
                <Text style={me.appEmoji}>🗺️</Text>
              </View>
              <View style={me.appInfo}>
                <Text style={me.appNome}>Google Maps</Text>
                <Text style={me.appDesc}>Rota completa com todas as paradas e waypoints</Text>
              </View>
              <View style={[me.appBadge, { backgroundColor: '#4285F4' }]}>
                <Icon name="open-in-new" size={14} color="#fff" type="material" />
              </View>
            </TouchableOpacity>
            <View style={me.divider} />
            <TouchableOpacity style={me.appBtn} onPress={() => { fecharModalExportar(); setTimeout(abrirWaze, 300); }} activeOpacity={0.85}>
              <View style={[me.appIcon, { backgroundColor: '#33CCFF20' }]}>
                <Text style={me.appEmoji}>🚗</Text>
              </View>
              <View style={me.appInfo}>
                <Text style={me.appNome}>Waze</Text>
                <Text style={me.appDesc}>Navega até a primeira parada com trânsito em tempo real</Text>
              </View>
              <View style={[me.appBadge, { backgroundColor: '#33AACC' }]}>
                <Icon name="open-in-new" size={14} color="#fff" type="material" />
              </View>
            </TouchableOpacity>
            <View style={me.divider} />
            <TouchableOpacity style={me.appBtn} onPress={() => { fecharModalExportar(); setTimeout(compartilharRota, 300); }} activeOpacity={0.85}>
              <View style={[me.appIcon, { backgroundColor: GOLD + '20' }]}>
                <Text style={me.appEmoji}>📋</Text>
              </View>
              <View style={me.appInfo}>
                <Text style={me.appNome}>Compartilhar lista</Text>
                <Text style={me.appDesc}>Envia a rota por WhatsApp, e-mail ou outro app</Text>
              </View>
              <View style={[me.appBadge, { backgroundColor: GOLD }]}>
                <Icon name="share" size={14} color={DARK_BG} type="material" />
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={me.cancelBtn} onPress={fecharModalExportar} activeOpacity={0.8}>
            <Text style={me.cancelTxt}>Cancelar</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  // ── TELA MAPA ─────────────────────────────────────────────
  if (showRota && showMapa) {
    return (
      <View style={ds.container}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
        <WebView
          style={StyleSheet.absoluteFillObject}
          source={{ html: buildRotaHTML(rota) }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK_BG }}>
              <ActivityIndicator size="large" color={GOLD} />
              <Text style={{ color: SILVER, marginTop: 12, fontSize: 13 }}>Carregando mapa...</Text>
            </View>
          )}
        />
        <View style={ds.mapaHeader}>
          <TouchableOpacity style={ds.mapaBackBtn} onPress={() => setShowMapa(false)}>
            <Icon name="arrow-back" size={20} color={DARK_BG} type="material" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={ds.mapaHeaderTitle}>Rota no Mapa</Text>
            <Text style={ds.mapaHeaderSub}>{info.count} paradas • {info.distancia} km • {info.tempo}</Text>
          </View>
          <TouchableOpacity style={ds.mapaShareBtn} onPress={compartilharRota}>
            <Icon name="share" size={18} color={DARK_BG} type="material" />
          </TouchableOpacity>
        </View>
        <View style={ds.rotaFooter}>
          <TouchableOpacity style={ds.exportBtn} onPress={abrirModalExportar} activeOpacity={0.85}>
            <Icon name="directions" size={20} color={DARK_BG} style={{ marginRight: 8 }} type="material" />
            <Text style={ds.exportBtnTxt}>EXPORTAR ROTA</Text>
          </TouchableOpacity>
        </View>
        <ModalExportar />
      </View>
    );
  }

  // ── TELA ROTA (lista) ─────────────────────────────────────
  if (showRota) {
    return (
      <View style={ds.container}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
        <View style={ds.header}>
          <View style={ds.headerTop}>
            <TouchableOpacity style={ds.backBtn} onPress={() => setShowRota(false)}>
              <Icon name="arrow-back" size={20} color={DARK_BG} type="material" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={ds.headerTitle}>Rota Otimizada</Text>
              <Text style={ds.headerSub}>{info.count} paradas • {info.distancia} km</Text>
            </View>
            <TouchableOpacity style={ds.shareBtn} onPress={compartilharRota}>
              <Icon name="share" size={20} color={DARK_BG} type="material" />
            </TouchableOpacity>
          </View>
          <ShimmerLine color={GOLD} />
          <View style={ds.kpiBar}>
            <KpiBox icon="people"            value={info.count}              label="Clientes"    gold />
            <View style={ds.kpiDiv} />
            <KpiBox icon="straighten"        value={`${info.distancia}km`}  label="Distância" />
            <View style={ds.kpiDiv} />
            <KpiBox icon="access-time"       value={info.tempo}             label="Estimado"    gold />
            <View style={ds.kpiDiv} />
            <KpiBox icon="local-gas-station" value={`${info.combustivel}L`} label="Combustível" />
            <View style={ds.kpiDiv} />
            <KpiBox icon="savings"           value={`-${info.economizado}km`} label="Economia"  gold />
          </View>
        </View>

        <TouchableOpacity style={ds.verMapaBtn} onPress={() => setShowMapa(true)} activeOpacity={0.85}>
          <Icon name="map" size={18} color={DARK_BG} style={{ marginRight: 8 }} type="material" />
          <Text style={ds.verMapaTxt}>VER ROTA NO MAPA</Text>
        </TouchableOpacity>

        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1, opacity: rotaAnim }}
          contentContainerStyle={{ paddingVertical: 12, paddingRight: 16, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}>
          {rota.map((ponto, i) => {
            const distProx = i < rota.length - 1
              ? calcDist(ponto.latitude, ponto.longitude, rota[i+1].latitude, rota[i+1].longitude)
              : null;
            return <RotaItem
              key={i}
              ponto={ponto}
              index={i}
              total={rota.length}
              distProxima={distProx}
              isAtual={i === paradaAtual}
              isConcluido={i < paradaAtual}
            />;
          })}
          <View style={ds.chegada}>
            <Icon name="flag" size={22} color={SUCCESS} type="material" />
            <Text style={ds.chegadaTxt}>Destino final — cliente mais distante</Text>
          </View>
        </Animated.ScrollView>

        {/* ── FOOTER FIXO ── */}
        <View style={ds.rotaFooter}>

          {/* Linha 1: REINICIAR + PRÓXIMO */}
          <View style={ds.footerBtnsRow}>
            {/* REINICIAR */}
            <TouchableOpacity style={ds.reiniciarBtn} onPress={reiniciarRota} activeOpacity={0.85}>
              <Icon name="refresh" size={18} color={SILVER} type="material" />
              <Text style={ds.reiniciarBtnTxt}>REINICIAR</Text>
            </TouchableOpacity>

            {/* PRÓXIMO */}
            <Animated.View style={[ds.proximoBtnWrap, { transform: [{ scale: proximoAnim }] }]}>
              <TouchableOpacity
                style={[
                  ds.proximoBtn,
                  paradaAtual >= rota.length - 1 && { backgroundColor: SUCCESS },
                ]}
                onPress={avancarProximo}
                activeOpacity={0.85}>
                <Icon
                  name={paradaAtual >= rota.length - 1 ? 'flag' : 'skip-next'}
                  size={20}
                  color={DARK_BG}
                  type="material"
                />
                <View style={{ flex: 1 }}>
                  <Text style={ds.proximoBtnTxt}>
                    {paradaAtual >= rota.length - 1 ? 'CONCLUIR ROTA' : 'PRÓXIMO'}
                  </Text>
                  {paradaAtual < rota.length - 1 && (
                    <Text style={ds.proximoBtnSub} numberOfLines={1}>
                      {rota[paradaAtual + 1]?.nome || ''}
                    </Text>
                  )}
                </View>
                {paradaAtual < rota.length - 1 && (
                  <Icon name="arrow-forward" size={16} color={DARK_BG} type="material" />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Linha 2: EXPORTAR ROTA */}
          <TouchableOpacity style={ds.exportBtnSmall} onPress={abrirModalExportar} activeOpacity={0.85}>
            <Icon name="directions" size={16} color={GOLD} type="material" />
            <Text style={ds.exportBtnSmallTxt}>Exportar Rota</Text>
          </TouchableOpacity>

        </View>
        <ModalExportar />

        <VisitaModal
          visible={!!visitaCliente}
          cliente={visitaCliente}
          onClose={() => setVisitaCliente(null)}
          onSaved={() => {
            const proxIdx = paradaAtual + 1;
            setVisitaCliente(null);
            _avancarParada(proxIdx);
          }}
        />
      </View>
    );
  }

  // ── TELA SELEÇÃO ──────────────────────────────────────────
  const getCidade = getCidadeFromCliente;

  const cidadesDisponiveis = ['Todas', ...Array.from(new Set(clientes.map(getCidade))).sort()];

  const clientesBase = userLocation
    ? [...clientes].sort((a, b) =>
        calcDist(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) -
        calcDist(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude))
    : clientes;

  const clientesFiltrados = cidadeFiltro === 'Todas'
    ? clientesBase
    : clientesBase.filter(c => getCidade(c) === cidadeFiltro);

  const totalAlertas = clientesFiltrados.filter(c => alertasClientes[c.id]).length;

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      <Animated.View style={[ds.header, {
        opacity: headerAnim,
        transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
      }]}>
        <View style={ds.headerTop}>
          <View style={ds.headerIcon}>
            <Icon name="alt-route" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ds.headerTitle}>Otimizador de Rotas</Text>
            <Text style={ds.headerSub}>
              {selected.length > 0
                ? `${selected.length} selecionado(s) • partindo da sua localização`
                : 'Selecione os clientes da rota de hoje'}
            </Text>
          </View>
          {selected.length > 0 && (
            <TouchableOpacity style={ds.clearBtn} onPress={() => setSelected([])}>
              <Icon name="clear" size={16} color={SILVER_DARK} type="material" />
            </TouchableOpacity>
          )}
        </View>

        <ShimmerLine color={GOLD} />

        {selected.length > 0 && (
          <View style={ds.kpiBar}>
            <KpiBox icon="people"      value={selected.length}                    label="Selecionados" gold />
            <View style={ds.kpiDiv} />
            <KpiBox icon="route"       value={clientesFiltrados.length}           label="Filtrados" />
            <View style={ds.kpiDiv} />
            <KpiBox icon="my-location" value={userLocation ? '✓ GPS' : '...'} label="Localização"  gold />
          </View>
        )}

        {/* ── FILTRO DE CIDADES ── */}
        {cidadesDisponiveis.length > 2 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={ds.cidadesScroll}>
            {cidadesDisponiveis.map(cidade => (
              <TouchableOpacity
                key={cidade}
                style={[ds.cidadeChip, cidadeFiltro === cidade && ds.cidadeChipAtivo]}
                onPress={() => setCidadeFiltro(cidade)}
                activeOpacity={0.8}>
                <Icon
                  name={cidade === 'Todas' ? 'public' : 'location-city'}
                  size={11} color={cidadeFiltro === cidade ? DARK_BG : SILVER_DARK}
                  type="material" />
                <Text style={[ds.cidadeChipTxt, cidadeFiltro === cidade && ds.cidadeChipTxtAtivo]}>
                  {cidade}
                </Text>
                {cidade !== 'Todas' && (
                  <Text style={[ds.cidadeCount, cidadeFiltro === cidade && { color: DARK_BG + 'BB' }]}>
                    {clientesBase.filter(c => getCidade(c) === cidade).length}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── LEGENDA ALERTAS ── */}
        {totalAlertas > 0 && (
          <View style={ds.alertaLegenda}>
            <Icon name="warning" size={12} color={WARN} type="material" />
            <Text style={ds.alertaLegendaTxt}>
              {totalAlertas} cliente{totalAlertas > 1 ? 's' : ''} precisam de atenção
            </Text>
            <View style={ds.alertaBadgesRow}>
              <View style={[ds.alertaBadge, { borderColor: DANGER + '50' }]}>
                <View style={[ds.alertaDot, { backgroundColor: DANGER }]} />
                <Text style={[ds.alertaBadgeTxt, { color: DANGER }]}>Não comprou/Sem visita</Text>
              </View>
              <View style={[ds.alertaBadge, { borderColor: WARN + '50' }]}>
                <View style={[ds.alertaDot, { backgroundColor: WARN }]} />
                <Text style={[ds.alertaBadgeTxt, { color: WARN }]}>+{DIAS_ALERTA_VISITA}d/Retornar</Text>
              </View>
            </View>
          </View>
        )}

      </Animated.View>

      <FlatList
        data={clientesFiltrados}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ClienteItem
            item={item}
            selected={!!selected.find(c => c.id === item.id)}
            onPress={() => toggleCliente(item)}
            userLocation={userLocation}
            alerta={alertasClientes[item.id]}
          />
        )}
        contentContainerStyle={ds.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          clientesFiltrados.length > 0 ? (
            <View style={ds.listHeader}>
              <Text style={ds.listHeaderTxt}>
                {clientesFiltrados.length} cliente{clientesFiltrados.length > 1 ? 's' : ''}
                {cidadeFiltro !== 'Todas' ? ` em ${cidadeFiltro}` : ''}
                {userLocation ? ' • por distância' : ''}
              </Text>
              <TouchableOpacity onPress={() => {
                const todosSelected = clientesFiltrados.every(c => selected.find(s => s.id === c.id));
                if (todosSelected) {
                  setSelected(prev => prev.filter(s => !clientesFiltrados.find(c => c.id === s.id)));
                } else {
                  setSelected(prev => {
                    const novos = clientesFiltrados.filter(c => !prev.find(s => s.id === c.id));
                    return [...prev, ...novos];
                  });
                }
              }}>
                <Text style={ds.selectAll}>
                  {clientesFiltrados.every(c => selected.find(s => s.id === c.id))
                    ? 'Desmarcar cidade' : 'Selecionar cidade'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={ds.empty}>
            <Icon name="location-off" size={52} color={GOLD + '40'} type="material" />
            <Text style={ds.emptyTitle}>
              {cidadeFiltro !== 'Todas' ? `Sem clientes em ${cidadeFiltro}` : 'Nenhum cliente com GPS'}
            </Text>
            <Text style={ds.emptySub}>Adicione coordenadas de localização aos clientes</Text>
          </View>
        }
      />

      <View style={ds.footer}>
        <TouchableOpacity
          style={[ds.calcBtn, (!selected.length || !userLocation || loading) && ds.calcBtnDisabled]}
          onPress={calcularRota}
          disabled={!selected.length || !userLocation || loading}
          activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color={DARK_BG} size="small" />
            : <Icon name="alt-route" size={20} color={DARK_BG} style={{ marginRight: 8 }} type="material" />
          }
          <Text style={ds.calcBtnTxt}>
            {loading ? 'CALCULANDO...' : `OTIMIZAR ROTA${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </Text>
        </TouchableOpacity>

        <View style={ds.quickExportRow}>
          <Text style={ds.quickExportLabel}>Abrir agora em:</Text>
          <View style={ds.quickExportBtns}>
            <TouchableOpacity
              style={[ds.quickBtn, { backgroundColor: '#4285F4' }]}
              onPress={() => {
                if (selected.length === 0) { Alert.alert('Atenção', 'Selecione pelo menos 1 cliente'); return; }
                if (!userLocation) { Alert.alert('Erro', 'Aguardando GPS...'); return; }
                const origin = `${userLocation.latitude},${userLocation.longitude}`;
                const dest   = selected[selected.length - 1];
                const waypts = selected.slice(0, -1).map(p => `${p.latitude},${p.longitude}`).join('|');
                const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest.latitude},${dest.longitude}${waypts ? '&waypoints=' + waypts : ''}&travelmode=driving`;
                Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Google Maps'));
              }}
              activeOpacity={0.85}>
              <Text style={ds.quickBtnEmoji}>🗺️</Text>
              <Text style={ds.quickBtnTxt}>Google Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ds.quickBtn, { backgroundColor: '#33AACC' }]}
              onPress={() => {
                if (selected.length === 0) { Alert.alert('Atenção', 'Selecione pelo menos 1 cliente'); return; }
                const primeiro = selected[0];
                Linking.openURL(`waze://?ll=${primeiro.latitude},${primeiro.longitude}&navigate=yes`)
                  .catch(() => Linking.openURL(`https://waze.com/ul?ll=${primeiro.latitude},${primeiro.longitude}&navigate=yes`)
                  .catch(() => Alert.alert('Erro', 'Não foi possível abrir o Waze')));
              }}
              activeOpacity={0.85}>
              <Text style={ds.quickBtnEmoji}>🚗</Text>
              <Text style={ds.quickBtnTxt}>Waze</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const ds = StyleSheet.create({
  container:       { flex: 1, backgroundColor: DARK_BG },
  header:          { backgroundColor: '#001828', paddingBottom: 14, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  headerTop:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, gap: 12 },
  headerIcon:      { width: 42, height: 42, borderRadius: 21, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitle:     { fontSize: 18, fontWeight: 'bold', color: SILVER_LIGHT },
  headerSub:       { fontSize: 11, color: SILVER_DARK, marginTop: 2 },
  clearBtn:        { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  backBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  shareBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  kpiBar:          { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingVertical: 4, borderWidth: 1, borderColor: GOLD + '20' },
  kpiDiv:          { width: 1, backgroundColor: SILVER + '20' },
  list:            { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 },
  listHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  listHeaderTxt:   { fontSize: 11, color: SILVER_DARK, flex: 1 },
  selectAll:       { fontSize: 11, color: GOLD, fontWeight: '700' },

  // Filtro de cidades
  cidadesScroll:   { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  cidadeChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: CARD_BG2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: SILVER + '25' },
  cidadeChipAtivo: { backgroundColor: GOLD, borderColor: GOLD },
  cidadeChipTxt:   { fontSize: 11, fontWeight: '700', color: SILVER_DARK },
  cidadeChipTxtAtivo: { color: DARK_BG },
  cidadeCount:     { fontSize: 10, color: SILVER_DARK + '80', fontWeight: '600', marginLeft: 2 },

  // Legenda alertas
  alertaLegenda:   { marginHorizontal: 14, marginBottom: 6, backgroundColor: WARN + '10', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: WARN + '30', gap: 6 },
  alertaLegendaTxt:{ fontSize: 11, fontWeight: '700', color: WARN },
  alertaBadgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  alertaBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CARD_BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  alertaDot:       { width: 7, height: 7, borderRadius: 4 },
  alertaBadgeTxt:  { fontSize: 9, fontWeight: '700' },

  empty:           { paddingTop: 80, alignItems: 'center' },
  emptyTitle:      { fontSize: 16, fontWeight: 'bold', color: SILVER, marginTop: 16 },
  emptySub:        { fontSize: 12, color: SILVER_DARK, marginTop: 6, textAlign: 'center' },
  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#001828', borderTopWidth: 1, borderTopColor: GOLD + '20' },
  calcBtn:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
  calcBtnDisabled: { backgroundColor: GOLD + '50', shadowOpacity: 0 },
  calcBtnTxt:      { fontSize: 15, fontWeight: 'bold', color: DARK_BG, letterSpacing: 0.5 },
  quickExportRow:  { marginTop: 10, gap: 6 },
  quickExportLabel:{ fontSize: 10, color: SILVER_DARK, textAlign: 'center', letterSpacing: 0.5, marginBottom: 2 },
  quickExportBtns: { flexDirection: 'row', gap: 10 },
  quickBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, gap: 6 },
  quickBtnEmoji:   { fontSize: 16 },
  quickBtnTxt:     { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  verMapaBtn:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 13, marginHorizontal: 16, marginTop: 10, marginBottom: 4, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  verMapaTxt:      { fontSize: 14, fontWeight: 'bold', color: DARK_BG },
  chegada:         { flexDirection: 'row', alignItems: 'center', paddingLeft: 40, gap: 10, marginBottom: 8 },
  chegadaTxt:      { fontSize: 12, fontWeight: 'bold', color: SUCCESS },
  rotaFooter:      { backgroundColor: '#001828', borderTopWidth: 1, borderTopColor: GOLD + '20', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  footerBtnsRow:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
  reiniciarBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CARD_BG2, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, borderWidth: 1, borderColor: SILVER + '30' },
  reiniciarBtnTxt: { fontSize: 12, fontWeight: 'bold', color: SILVER, letterSpacing: 0.5 },
  proximoBtnWrap:  { flex: 1 },
  proximoBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
  proximoBtnTxt:   { fontSize: 14, fontWeight: 'bold', color: DARK_BG, letterSpacing: 0.5 },
  proximoBtnSub:   { fontSize: 10, color: DARK_BG + 'AA' },
  exportBtnSmall:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CARD_BG2, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: GOLD + '40' },
  exportBtnSmallTxt:{ fontSize: 13, fontWeight: '700', color: GOLD },
  mapaHeader:      { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: DARK_BG + 'EE', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  mapaBackBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  mapaShareBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  mapaHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: SILVER_LIGHT },
  mapaHeaderSub:   { fontSize: 11, color: SILVER_DARK, marginTop: 2 },
  exportBtn:       { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8 },
  exportBtnTxt:    { fontSize: 15, fontWeight: 'bold', color: DARK_BG, letterSpacing: 0.8 },
});

const me = StyleSheet.create({
  overlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', zIndex: 999 },
  sheet:     { backgroundColor: CARD_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, borderWidth: 1, borderColor: GOLD + '25' },
  handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: SILVER_DARK + '60', alignSelf: 'center', marginBottom: 18 },
  title:     { fontSize: 20, fontWeight: 'bold', color: SILVER_LIGHT, marginBottom: 4 },
  sub:       { fontSize: 12, color: SILVER_DARK, marginBottom: 14 },
  apps:      { backgroundColor: CARD_BG2, borderRadius: 18, borderWidth: 1, borderColor: SILVER + '15', marginTop: 16, overflow: 'hidden' },
  appBtn:    { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  appIcon:   { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  appEmoji:  { fontSize: 26 },
  appInfo:   { flex: 1 },
  appNome:   { fontSize: 15, fontWeight: 'bold', color: SILVER_LIGHT, marginBottom: 3 },
  appDesc:   { fontSize: 11, color: SILVER_DARK, lineHeight: 15 },
  appBadge:  { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  divider:   { height: 1, backgroundColor: SILVER + '15', marginHorizontal: 16 },
  cancelBtn: { marginTop: 14, backgroundColor: CARD_BG2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: SILVER + '20' },
  cancelTxt: { fontSize: 14, fontWeight: '700', color: SILVER_DARK },
});