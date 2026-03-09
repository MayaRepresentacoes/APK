import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  Dimensions, StatusBar, ScrollView, Animated, ActivityIndicator,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ListaView, GOLD, SILVER, SILVER_DARK, SILVER_LIGHT, DARK_BG, CARD_BG, CARD_BG2, TIPO_COLORS, getTipoColor, getTipoIcon, calcDist } from './MapaUtils';

const { width: SW, height: SH } = Dimensions.get('window');

const SUCCESS = '#4CAF50';
const DANGER  = '#EF5350';

// ── FILTRO CHIP ───────────────────────────────────────────────
function FilterChip({ label, icon, active, color, onPress }) {
  return (
    <TouchableOpacity
      style={[fc.chip, active
        ? { backgroundColor: color, borderColor: color }
        : { backgroundColor: CARD_BG, borderColor: color + '55' }]}
      onPress={onPress} activeOpacity={0.8}>
      <Icon name={icon} size={13} color={active ? DARK_BG : color} />
      <Text style={[fc.txt, { color: active ? DARK_BG : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  txt:  { fontSize: 11, fontWeight: '700' },
});

// ── CARD BOTTOM (cliente selecionado) ─────────────────────────
function ClienteBottomCard({ cliente, userLocation, onClose, onMaps, onWaze }) {
  const tc   = getTipoColor(cliente.tipo);
  const dist = userLocation && cliente.latitude && cliente.longitude
    ? calcDist(userLocation.latitude, userLocation.longitude, cliente.latitude, cliente.longitude)
    : null;
  return (
    <View style={cb.wrap}>
      <View style={[cb.bar, { backgroundColor: tc.main }]} />
      <View style={cb.content}>
        <View style={cb.row}>
          <View style={[cb.iconWrap, { backgroundColor: tc.bg }]}>
            <Icon name={getTipoIcon(cliente.tipo)} size={20} color={tc.main} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cb.nome}>{cliente.nome}</Text>
            <Text style={cb.tipo}>{cliente.tipo}</Text>
            {cliente.endereco ? <Text style={cb.end} numberOfLines={1}>{cliente.endereco}</Text> : null}
          </View>
          {dist !== null && (
            <View style={cb.distWrap}>
              <Text style={[cb.dist, { color: tc.main }]}>{dist < 1 ? `${(dist*1000).toFixed(0)}m` : `${dist.toFixed(1)}km`}</Text>
            </View>
          )}
          <TouchableOpacity style={cb.closeBtn} onPress={onClose}>
            <Icon name="close" size={18} color={SILVER_DARK} />
          </TouchableOpacity>
        </View>
        <View style={cb.actions}>
          <TouchableOpacity style={[cb.btn, { backgroundColor: '#4285F4' }]} onPress={onMaps} activeOpacity={0.85}>
            <Icon name="map" size={15} color="#fff" />
            <Text style={cb.btnTxt}>Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[cb.btn, { backgroundColor: '#33CCFF' }]} onPress={onWaze} activeOpacity={0.85}>
            <Icon name="directions-car" size={15} color={DARK_BG} />
            <Text style={[cb.btnTxt, { color: DARK_BG }]}>Waze</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
const cb = StyleSheet.create({
  wrap:     { backgroundColor: CARD_BG, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 },
  bar:      { height: 3 },
  content:  { padding: 14 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  nome:     { fontSize: 14, fontWeight: 'bold', color: SILVER_LIGHT },
  tipo:     { fontSize: 11, color: SILVER_DARK, textTransform: 'capitalize' },
  end:      { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  distWrap: { alignItems: 'center', marginRight: 4 },
  dist:     { fontSize: 13, fontWeight: 'bold' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  actions:  { flexDirection: 'row', gap: 10 },
  btn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  btnTxt:   { fontSize: 12, fontWeight: 'bold', color: '#fff' },
});

// ── GERA HTML DO MAPA (Leaflet — sem API key) ─────────────────
function buildMapHTML(clientes, userLat, userLng) {
  const markersJS = clientes.map(c => {
    const color = c.tipo === 'loja' ? '#E8B432' : c.tipo === 'obra' ? '#4CAF50' : '#5BA3D0';
    const icon  = c.tipo === 'loja' ? '🏪' : c.tipo === 'obra' ? '🏗️' : '🏢';
    return `
      (function() {
        var el = document.createElement('div');
        el.style.cssText = 'width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid rgba(255,255,255,0.7);box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer;';
        el.innerHTML = '${icon}';
        var marker = L.marker([${c.latitude}, ${c.longitude}], {
          icon: L.divIcon({ html: el.outerHTML, className: '', iconSize: [36,36], iconAnchor: [18,18] })
        }).addTo(map);
        marker.on('click', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ id: '${c.id}' }));
        });
      })();
    `;
  }).join('\n');

  const userMarker = userLat && userLng ? `
    var userEl = document.createElement('div');
    userEl.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#2196F3;border:3px solid #fff;box-shadow:0 0 0 4px rgba(33,150,243,0.3);';
    L.marker([${userLat}, ${userLng}], {
      icon: L.divIcon({ html: userEl.outerHTML, className: '', iconSize: [20,20], iconAnchor: [10,10] }),
      zIndexOffset: 1000
    }).addTo(map).bindPopup('Você está aqui');
  ` : '';

  const centerLat = userLat || (clientes[0]?.latitude) || -14.235;
  const centerLng = userLng || (clientes[0]?.longitude) || -51.925;
  const zoom = userLat ? 13 : 5;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body,#map { width:100%; height:100%; background:#001E2E; }
  .leaflet-control-attribution { display:none; }
  .leaflet-control-zoom a { background:#002840 !important; color:#E8B432 !important; border-color:#E8B43230 !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: true, attributionControl: false })
  .setView([${centerLat}, ${centerLng}], ${zoom});

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19
}).addTo(map);

${userMarker}
${markersJS}

map.on('click', function() {
  window.ReactNativeWebView.postMessage(JSON.stringify({ id: null }));
});
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
export default function MapaScreen({ navigation, route }) {
  const clienteDestino = route?.params?.clienteDestino || null;

  const [clientes,        setClientes]        = useState([]);
  const [selectedFilters, setSelectedFilters] = useState(['loja', 'obra', 'distribuidor']);
  const [userLocation,    setUserLocation]    = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [viewMode,        setViewMode]        = useState('mapa'); // 'mapa' | 'lista'

  const webviewRef = useRef(null);
  const cardAnim   = useRef(new Animated.Value(300)).current;

  useEffect(() => { getUserLocation(); loadClientes(); }, []);

  // Centraliza no clienteDestino vindo do Dashboard
  useEffect(() => {
    if (clienteDestino && viewMode === 'mapa') {
      setSelectedCliente(clienteDestino);
      // Envia comando ao Leaflet para centralizar
      const js = `map.setView([${clienteDestino.latitude}, ${clienteDestino.longitude}], 15); true;`;
      webviewRef.current?.injectJavaScript(js);
    }
  }, [clienteDestino, viewMode]);

  // Animação do card bottom
  useEffect(() => {
    Animated.spring(cardAnim, {
      toValue: selectedCliente ? 0 : 300,
      friction: 8, tension: 60, useNativeDriver: true,
    }).start();
  }, [selectedCliente]);

  const getUserLocation = async () => {
    try {
      if (Platform.OS === 'web') { setLoading(false); return; }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) { console.log('Erro localização:', e); }
    finally { setLoading(false); }
  };

  const loadClientes = async () => {
    try {
      const snap = await getDocs(collection(db, 'clientes'));
      const data = [];
      snap.forEach(d => {
        const c = d.data();
        if (c.latitude && c.longitude) {
          data.push({ id: d.id, ...c, latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) });
        }
      });
      setClientes(data);
    } catch (e) { console.log('Erro clientes:', e); }
    finally { setLoading(false); }
  };

  const toggleFilter = (f) =>
    setSelectedFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const filteredClientes = clientes.filter(c => selectedFilters.includes(c.tipo));

  // Mensagem do WebView (clique no marker)
  const onWebViewMessage = (event) => {
    try {
      const { id } = JSON.parse(event.nativeEvent.data);
      if (!id) { setSelectedCliente(null); return; }
      const found = clientes.find(c => c.id === id);
      if (found) setSelectedCliente(found);
    } catch (e) {}
  };

  const handleMaps = (c) => {
    const { Linking } = require('react-native');
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`);
  };
  const handleWaze = (c) => {
    const { Linking } = require('react-native');
    Linking.openURL(`https://waze.com/ul?ll=${c.latitude},${c.longitude}&navigate=yes`);
  };

  const centralizar = () => {
    if (userLocation) {
      const js = `map.setView([${userLocation.latitude}, ${userLocation.longitude}], 14); true;`;
      webviewRef.current?.injectJavaScript(js);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK_BG }}>
        <Icon name="location-searching" size={44} color={GOLD} />
        <Text style={{ fontSize: 16, color: SILVER, marginTop: 14, fontWeight: '600' }}>Carregando mapa...</Text>
      </View>
    );
  }

  // Web → lista simples
  if (Platform.OS === 'web') {
    return (
      <ListaView
        clientes={filteredClientes}
        userLocation={userLocation}
        navigation={navigation}
        filters={selectedFilters}
        onFilterChange={toggleFilter}
      />
    );
  }

  const mapHTML = buildMapHTML(
    filteredClientes,
    userLocation?.latitude,
    userLocation?.longitude,
  );

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── MAPA WEBVIEW ── */}
      {viewMode === 'mapa' ? (
        <WebView
          ref={webviewRef}
          style={StyleSheet.absoluteFillObject}
          source={{ html: mapHTML }}
          onMessage={onWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK_BG }}>
              <ActivityIndicator size="large" color={GOLD} />
            </View>
          )}
        />
      ) : (
        <ListaView
          clientes={filteredClientes}
          userLocation={userLocation}
          navigation={navigation}
          filters={selectedFilters}
          onFilterChange={toggleFilter}
        />
      )}

      {/* ── HEADER ── */}
      <View style={ds.header}>
        <View style={ds.headerRow}>
          <View>
            <Text style={ds.title}>Mapa</Text>
            <Text style={ds.sub}>{filteredClientes.length} clientes com GPS</Text>
          </View>
          <View style={ds.headerBtns}>
            {/* Toggle mapa/lista */}
            <TouchableOpacity
              style={[ds.iconBtn, viewMode === 'lista' && { backgroundColor: GOLD }]}
              onPress={() => setViewMode(v => v === 'mapa' ? 'lista' : 'mapa')}
              activeOpacity={0.8}>
              <Icon name={viewMode === 'mapa' ? 'list' : 'map'} size={20} color={viewMode === 'lista' ? DARK_BG : GOLD} />
            </TouchableOpacity>
            {/* Centralizar */}
            {viewMode === 'mapa' && (
              <TouchableOpacity style={ds.iconBtn} onPress={centralizar} activeOpacity={0.8}>
                <Icon name="my-location" size={20} color={GOLD} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4, gap: 0 }}>
          <FilterChip label="Lojas"    icon="store"        active={selectedFilters.includes('loja')}         color={TIPO_COLORS.loja.main}         onPress={() => toggleFilter('loja')} />
          <FilterChip label="Obras"    icon="construction" active={selectedFilters.includes('obra')}         color={TIPO_COLORS.obra.main}         onPress={() => toggleFilter('obra')} />
          <FilterChip label="Distrib." icon="business"     active={selectedFilters.includes('distribuidor')} color={TIPO_COLORS.distribuidor.main} onPress={() => toggleFilter('distribuidor')} />
        </ScrollView>
      </View>

      {/* ── CARD BOTTOM ── */}
      {selectedCliente && viewMode === 'mapa' && (
        <Animated.View style={[ds.cardBottom, { transform: [{ translateY: cardAnim }] }]}>
          <ClienteBottomCard
            cliente={selectedCliente}
            userLocation={userLocation}
            onClose={() => setSelectedCliente(null)}
            onMaps={() => handleMaps(selectedCliente)}
            onWaze={() => handleWaze(selectedCliente)}
          />
        </Animated.View>
      )}
    </View>
  );
}

const ds = StyleSheet.create({
  container:  { flex: 1, backgroundColor: DARK_BG },
  header:     { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: DARK_BG + 'EE', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 10, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title:      { fontSize: 22, fontWeight: 'bold', color: SILVER_LIGHT },
  sub:        { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  iconBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: CARD_BG, borderWidth: 1, borderColor: GOLD + '40', justifyContent: 'center', alignItems: 'center' },
  cardBottom: { position: 'absolute', bottom: 90, left: 16, right: 16 },
});