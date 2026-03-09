// Componentes e utilitários compartilhados entre MapaScreen e MapaMobileView
// Arquivo separado para EVITAR import circular.

import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, StatusBar, Linking, Animated, Dimensions,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

export const { width: SW } = Dimensions.get('window');

export const GOLD         = '#E8B432';
export const SILVER       = '#C0D2E6';
export const SILVER_LIGHT = '#E8EEF5';
export const SILVER_DARK  = '#8A9BB0';
export const DARK_BG      = '#001E2E';
export const CARD_BG      = '#002840';
export const CARD_BG2     = '#003352';

export const TIPO_COLORS = {
  loja:         { main: '#E8B432', light: '#F5D07A', bg: '#E8B43220' },
  obra:         { main: '#4CAF50', light: '#81C784', bg: '#4CAF5020' },
  distribuidor: { main: '#5BA3D0', light: '#90CAF9', bg: '#5BA3D020' },
};
export const getTipoColor = (tipo) =>
  TIPO_COLORS[tipo] || { main: SILVER, light: SILVER_LIGHT, bg: SILVER + '18' };
export const getTipoIcon = (tipo) =>
  tipo === 'loja' ? 'store' : tipo === 'obra' ? 'construction' : tipo === 'distribuidor' ? 'business' : 'location-on';

export const deg2rad = (d) => d * (Math.PI / 180);
export const calcDist = (la1, lo1, la2, lo2) => {
  const R = 6371, dL = deg2rad(la2 - la1), dO = deg2rad(lo2 - lo1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(deg2rad(la1)) * Math.cos(deg2rad(la2)) * Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })
    ).start();
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

export function FilterChip({ label, icon, active, onPress, tipo }) {
  const tc = tipo ? getTipoColor(tipo) : { main: GOLD };
  return (
    <TouchableOpacity
      style={[fc.chip, active
        ? { backgroundColor: tc.main, borderColor: tc.main }
        : { backgroundColor: CARD_BG, borderColor: tc.main + '55' },
      ]}
      onPress={onPress} activeOpacity={0.85}>
      {icon && <Icon name={icon} size={14} color={active ? DARK_BG : tc.main} />}
      <Text style={[fc.text, { color: active ? DARK_BG : tc.main, marginLeft: icon ? 5 : 0 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  text: { fontSize: 13, fontWeight: '700' },
});

export function ClienteCard({ cliente, userLocation, onPress }) {
  const tc   = getTipoColor(cliente.tipo);
  const dist = userLocation && cliente.latitude && cliente.longitude
    ? calcDist(userLocation.latitude, userLocation.longitude, cliente.latitude, cliente.longitude)
    : null;

  const abrirMaps = () => {
    const q = cliente.latitude && cliente.longitude
      ? `${cliente.latitude},${cliente.longitude}`
      : encodeURIComponent(cliente.endereco || cliente.nome);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`)
      .catch(() => Alert.alert('Erro', 'Não foi possível abrir o Google Maps'));
  };
  const abrirWaze = () => {
    const url = cliente.latitude && cliente.longitude
      ? `https://waze.com/ul?ll=${cliente.latitude},${cliente.longitude}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(cliente.endereco || cliente.nome)}&navigate=yes`;
    Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Waze'));
  };

  return (
    <TouchableOpacity
      style={[cc.card, { borderColor: tc.main + '45', shadowColor: tc.main }]}
      onPress={onPress} activeOpacity={0.85}>
      <View style={[cc.topLine, { backgroundColor: tc.main }]} />
      <ShimmerLine color={tc.main} />
      <View style={cc.content}>
        <View style={[cc.iconWrap, { backgroundColor: tc.bg }]}>
          <Icon name={getTipoIcon(cliente.tipo)} size={22} color={tc.main} />
        </View>
        <View style={cc.info}>
          <Text style={cc.nome}>{cliente.nome}</Text>
          {cliente.endereco ? (
            <View style={cc.row}>
              <Icon name="location-on" size={11} color={SILVER_DARK} />
              <Text style={cc.end} numberOfLines={1}>{cliente.endereco}</Text>
            </View>
          ) : null}
          <View style={cc.badges}>
            <View style={[cc.badge, { backgroundColor: tc.bg, borderColor: tc.main + '50' }]}>
              <Text style={[cc.badgeText, { color: tc.light }]}>{cliente.tipo}</Text>
            </View>
            <View style={[cc.badge, {
              backgroundColor: cliente.status === 'ativo' ? '#4CAF5020' : cliente.status === 'potencial' ? GOLD + '20' : SILVER + '20',
              borderColor:     cliente.status === 'ativo' ? '#4CAF5060' : cliente.status === 'potencial' ? GOLD + '60' : SILVER + '60',
            }]}>
              <Text style={[cc.badgeText, {
                color: cliente.status === 'ativo' ? '#4CAF50' : cliente.status === 'potencial' ? GOLD : SILVER_DARK,
              }]}>{cliente.status}</Text>
            </View>
          </View>
        </View>
        <View style={cc.rightCol}>
          {dist !== null && (
            <View style={cc.distWrap}>
              <Text style={[cc.dist, { color: tc.main }]}>{dist.toFixed(1)}</Text>
              <Text style={cc.distKm}>km</Text>
            </View>
          )}
          <TouchableOpacity style={[cc.navBtn, { backgroundColor: '#4285F4' }]} onPress={abrirMaps}>
            <Icon name="map" size={13} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[cc.navBtn, { backgroundColor: '#33CCFF' }]} onPress={abrirWaze}>
            <Icon name="directions-car" size={13} color={DARK_BG} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const cc = StyleSheet.create({
  card:     { backgroundColor: CARD_BG, borderRadius: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5 },
  topLine:  { height: 3 },
  content:  { flexDirection: 'row', alignItems: 'center', padding: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  info:     { flex: 1 },
  nome:     { fontSize: 16, fontWeight: 'bold', color: SILVER_LIGHT, marginBottom: 3 },
  row:      { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  end:      { fontSize: 13, color: SILVER_DARK, marginLeft: 3, flex: 1 },
  badges:   { flexDirection: 'row', gap: 6 },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeText:{ fontSize: 12, fontWeight: '700' },
  rightCol: { alignItems: 'center', gap: 6, minWidth: 52 },
  distWrap: { alignItems: 'center' },
  dist:     { fontSize: 17, fontWeight: 'bold' },
  distKm:   { fontSize: 11, color: SILVER_DARK },
  navBtn:   { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
});

export function ListaView({ clientes, userLocation, navigation, filters, onFilterChange }) {
  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG }}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />
      <View style={lv.header}>
        <View style={lv.hRow}>
          <Icon name="map" size={22} color={GOLD} style={{ marginRight: 10 }} />
          <View>
            <Text style={lv.title}>Mapa de Clientes</Text>
            <Text style={lv.sub}>{clientes.length} cliente(s) cadastrado(s)</Text>
          </View>
        </View>
        <View style={lv.line} />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          {[
            { key: 'loja',         label: 'Lojas',          icon: 'store' },
            { key: 'obra',         label: 'Obras',          icon: 'construction' },
            { key: 'distribuidor', label: 'Distribuidores', icon: 'business' },
          ].map(f => (
            <FilterChip key={f.key} label={f.label} icon={f.icon} tipo={f.key}
              active={filters.includes(f.key)} onPress={() => onFilterChange(f.key)} />
          ))}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        {clientes.length > 0
          ? clientes.map(c => (
            <ClienteCard key={c.id} cliente={c} userLocation={userLocation}
              onPress={() => navigation.navigate('Clientes', { clienteId: c.id })} />
          ))
          : (
            <View style={lv.empty}>
              <Icon name="location-off" size={52} color={GOLD + '40'} />
              <Text style={lv.emptyT}>Nenhum cliente encontrado</Text>
              <Text style={lv.emptySub}>Adicione clientes na aba Clientes</Text>
            </View>
          )}
      </ScrollView>
    </View>
  );
}
const lv = StyleSheet.create({
  header:   { backgroundColor: '#001828', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingTop: 20, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  hRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  title:    { fontSize: 24, fontWeight: 'bold', color: SILVER_LIGHT },
  sub:      { fontSize: 14, color: SILVER_DARK, marginTop: 2 },
  line:     { height: 1, backgroundColor: GOLD + '30', marginHorizontal: 20 },
  empty:    { paddingTop: 80, alignItems: 'center' },
  emptyT:   { fontSize: 18, fontWeight: 'bold', color: SILVER, marginTop: 16 },
  emptySub: { fontSize: 14, color: SILVER_DARK, marginTop: 6 },
});


