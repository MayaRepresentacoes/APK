import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, ScrollView, Alert, Dimensions,
  StatusBar, Animated, Share, Image, Platform, Linking
} from 'react-native';
import { Icon } from 'react-native-elements';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import VisitaModal from './VisitaModal';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
const GOLD_LIGHT   = '#F5D07A';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const MODAL_BG     = '#001828';
const SUCCESS      = '#4CAF50';
const DANGER       = '#EF5350';
const WARN         = '#FF9800';

const TIPO_COLORS = {
  loja:         { main: '#E8B432', light: '#F5D07A', bg: '#E8B43220', bar: '#E8B432' },
  obra:         { main: '#4CAF50', light: '#81C784', bg: '#4CAF5020', bar: '#4CAF50' },
  distribuidor: { main: '#29B6F6', light: '#90CAF9', bg: '#29B6F620', bar: '#29B6F6' },
};
const getTipoColor = (tipo) => TIPO_COLORS[tipo] || { main: SILVER, light: SILVER_LIGHT, bg: SILVER + '18', bar: SILVER };
const getTipoIcon  = (tipo) => tipo === 'loja' ? 'store' : tipo === 'obra' ? 'construction' : tipo === 'distribuidor' ? 'business' : 'location-on';

const FORNECEDORES = ['FORTLEV', 'AFORT', 'METAL TECK', 'TINTAS S.'];

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })).start();
  }, []);
  return (
    <View style={{ height: 2, width: '100%', backgroundColor: color + '30', overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', height: '100%', width: 80, backgroundColor: color + 'CC', transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, SW] }) }] }} />
    </View>
  );
}

function FilterChip({ label, active, onPress, icon, tipo }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tc = tipo ? getTipoColor(tipo) : { main: GOLD };
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[fc.chip, active ? { backgroundColor: tc.main, borderColor: tc.main } : { backgroundColor: CARD_BG, borderColor: tc.main + '55' }]}
        onPress={handlePress} activeOpacity={0.85}>
        {icon && <Icon name={icon} size={14} color={active ? DARK_BG : tc.main} type="material" />}
        <Text style={[fc.text, { color: active ? DARK_BG : tc.main, marginLeft: icon ? 5 : 0 }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
const fc = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '700' },
});

function ClienteCard({ item, onPress, onCapturarGPS, onCheckin }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const [capturando, setCapturando] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const temLocalizacao = !!(item.latitude && item.longitude);
  const tc = getTipoColor(item.tipo);
  const getStatusColor = (s) => s === 'ativo' ? SUCCESS : s === 'potencial' ? GOLD : SILVER_DARK;
  const fornAtivos = FORNECEDORES.filter(f => item.fornecedores?.[f]);

  const handleGPS = async () => {
    setCapturando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Ative a localização.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let endereco = item.endereco || '';
      if (!endereco) {
        try {
          const addr = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (addr?.length > 0) {
            const a = addr[0];
            endereco = [a.street, a.streetNumber, a.district || a.subregion, a.city, a.region].filter(Boolean).join(', ');
          }
        } catch (e) {}
      }
      await onCapturarGPS(item, latitude.toString(), longitude.toString(), endereco);
    } catch (e) { Alert.alert('Erro', 'Não foi possível capturar a localização.'); }
    finally { setCapturando(false); }
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity style={[cc.card, { borderColor: tc.main + '50', shadowColor: tc.main }]} onPress={onPress} activeOpacity={0.85}>
        <View style={[cc.topBar, { backgroundColor: tc.bar }]} />
        <View style={cc.header}>
          {item.foto ? (
            <Image source={{ uri: item.foto }} style={[cc.foto, { borderColor: tc.main }]} />
          ) : (
            <View style={[cc.iconWrap, { backgroundColor: tc.bg }]}>
              <Icon name={getTipoIcon(item.tipo)} size={20} color={tc.main} type="material" />
            </View>
          )}
          <View style={cc.titleWrap}>
            <Text style={cc.nome}>{item.nome}</Text>
            <Text style={[cc.tipo, { color: tc.light }]}>{item.tipo}</Text>
            {fornAtivos.length > 0 && (
              <View style={cc.fornRow}>
                {fornAtivos.map(f => (
                  <View key={f} style={[cc.fornBadge, { borderColor: tc.main + '60', backgroundColor: tc.bg }]}>
                    <Text style={[cc.fornText, { color: tc.light }]}>{f}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={[cc.statusBadge, { backgroundColor: getStatusColor(item.status) + '25', borderColor: getStatusColor(item.status) + '60' }]}>
            <View style={[cc.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[cc.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>

        <View style={cc.divider} />

        <View style={cc.infoGrid}>
          {item.cidade ? (
            <View style={cc.infoRow}>
              <Icon name="location-city" size={12} color={GOLD} type="material" />
              <Text style={[cc.infoText, { color: GOLD, fontWeight: '700' }]}>{item.cidade}</Text>
            </View>
          ) : null}
          {item.endereco ? (
            <View style={cc.infoRow}><Icon name="location-on" size={12} color={SILVER_DARK} type="material" /><Text style={cc.infoText} numberOfLines={1}>{item.endereco}</Text></View>
          ) : null}
          {item.telefone1 ? (
            <View style={cc.infoRow}><Icon name="phone" size={12} color={SILVER_DARK} type="material" /><Text style={cc.infoText}>{item.contato1 ? `${item.contato1}: ` : ''}{item.telefone1}</Text></View>
          ) : null}
          {item.telefone2 ? (
            <View style={cc.infoRow}><Icon name="phone" size={12} color={SILVER_DARK} type="material" /><Text style={cc.infoText}>{item.contato2 ? `${item.contato2}: ` : ''}{item.telefone2}</Text></View>
          ) : null}
          {item.cnpj ? (
            <View style={cc.infoRow}><Icon name="business" size={12} color={SILVER_DARK} type="material" /><Text style={cc.infoText}>{item.cnpj}</Text></View>
          ) : null}
          <View style={cc.infoRow}>
            <Icon name={temLocalizacao ? 'gps-fixed' : 'gps-off'} size={12} color={temLocalizacao ? SUCCESS : SILVER_DARK + '80'} type="material" />
            <Text style={[cc.infoText, { color: temLocalizacao ? SUCCESS : SILVER_DARK + '80' }]}>
              {temLocalizacao ? 'GPS salvo' : 'Sem GPS'}
            </Text>
          </View>
        </View>

        <View style={cc.footer}>
          <View style={cc.footerActions}>
            {!temLocalizacao && (
              <TouchableOpacity style={[cc.actionBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '55' }]} onPress={handleGPS} disabled={capturando} activeOpacity={0.8}>
                <Icon name={capturando ? 'gps-not-fixed' : 'add-location'} size={15} color={SUCCESS} type="material" />
                <Text style={[cc.actionBtnText, { color: SUCCESS }]}>{capturando ? 'Capturando...' : 'Salvar GPS'}</Text>
              </TouchableOpacity>
            )}
            {temLocalizacao && (
              <TouchableOpacity style={[cc.actionBtn, { backgroundColor: '#4285F420', borderColor: '#4285F460' }]}
                onPress={() => { const url = `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`; Share.share({ message: `📍 *${item.nome}*\n🗺️ ${url}` }); }}>
                <Text style={[cc.actionBtnText, { color: '#4285F4' }]}>Maps</Text>
                <Icon name="map" size={13} color="#4285F4" type="material" />
              </TouchableOpacity>
            )}
            {temLocalizacao && (
              <TouchableOpacity style={[cc.actionBtn, { backgroundColor: '#33CCFF20', borderColor: '#33CCFF60' }]}
                onPress={() => { const url = `https://waze.com/ul?ll=${item.latitude},${item.longitude}&navigate=yes`; Share.share({ message: `📍 *${item.nome}*\n🚗 ${url}` }); }}>
                <Text style={[cc.actionBtnText, { color: '#33CCFF' }]}>Waze</Text>
                <Icon name="directions-car" size={13} color="#33CCFF" type="material" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[cc.actionBtn, { backgroundColor: GOLD + '18', borderColor: GOLD + '55' }]} onPress={onPress} activeOpacity={0.8}>
              <Icon name="edit" size={15} color={GOLD} type="material" />
              <Text style={[cc.actionBtnText, { color: GOLD }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[cc.actionBtn, cc.checkinBtn]} onPress={onCheckin} activeOpacity={0.8}>
              <Icon name="location-on" size={15} color="#4CAF50" type="material" />
              <Text style={cc.checkinBtnText}>Check-in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const cc = StyleSheet.create({
  card:         { backgroundColor: CARD_BG, borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  topBar:       { height: 3, width: '100%' },
  header:       { flexDirection: 'row', alignItems: 'flex-start', padding: 14, paddingBottom: 10 },
  foto:         { width: 44, height: 44, borderRadius: 14, marginRight: 12, borderWidth: 2 },
  iconWrap:     { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  titleWrap:    { flex: 1 },
  nome:         { fontSize: 15, fontWeight: 'bold', color: SILVER_LIGHT },
  tipo:         { fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  fornRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  fornBadge:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  fornText:     { fontSize: 9, fontWeight: '700' },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusDot:    { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusText:   { fontSize: 10, fontWeight: '700' },
  divider:      { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 14 },
  infoGrid:     { paddingHorizontal: 14, paddingVertical: 10 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  infoText:     { fontSize: 12, color: SILVER_DARK, marginLeft: 6, flex: 1 },
  footer:       { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  footerActions:{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  actionBtnText:{ fontSize: 11, fontWeight: '700' },
  checkinBtn:   { backgroundColor: '#4CAF5018', borderColor: '#4CAF5060' },
  checkinBtnText:{ fontSize: 11, fontWeight: '800', color: '#4CAF50', letterSpacing: 0.3 },
});

function OptionChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[oc.chip, active && { backgroundColor: GOLD, borderColor: GOLD }]} onPress={onPress}>
      <Text style={[oc.text, active && { color: DARK_BG }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const oc = StyleSheet.create({
  chip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: SILVER + '35', alignItems: 'center', marginHorizontal: 3, backgroundColor: CARD_BG2 },
  text: { fontSize: 12, color: SILVER, fontWeight: '600' },
});

const CIDADES_DF = [
  // DF
  'Asa Norte','Asa Sul','Plano Piloto','Sobradinho','Planaltina','Gama',
  'Taguatinga','Ceilândia','Samambaia','Recanto das Emas','Santa Maria',
  'São Sebastião','Riacho Fundo','Vicente Pires','Guará','Águas Claras',
  'Sudoeste/Octogonal','Cruzeiro','Lago Norte','Lago Sul','Park Way',
  'Núcleo Bandeirante','Brazlândia','Itapoã','Sol Nascente','Fercal',
  'SCIA/Estrutural','Arniqueiras','Candangolândia','Varjão',
  // Entorno GO
  'Luziânia','Valparaíso','Novo Gama','Cidade Ocidental','Formosa',
  'Planaltina-GO','Águas Lindas','Sto. Antônio do Descoberto',
  'Santo Antônio','Padre Bernardo','Alexânia','Cristalina',
  'Vila Paraíso-GO','Anápolis','Goiânia','Aparecida de Goiânia',
  'Trindade-GO','Senador Canedo','Outras',
];

const emptyForm = () => ({
  nome: '', cnpj: '', foto: '',
  contato1: '', telefone1: '',
  contato2: '', telefone2: '',
  email: '', endereco: '', cidade: '',
  latitude: '', longitude: '',
  tipo: 'loja', status: 'ativo', observacoes: '',
  lembrete: '', proximaVisita: '', custoMedio: '',
  fornecedores: { FORTLEV: false, AFORT: false, 'METAL TECK': false, 'TINTAS S.': false },
});

export default function ClientesScreen({ route, navigation }) {
  const [clientes,         setClientes]         = useState([]);
  const [modalVisible,     setModalVisible]     = useState(false);
  const [editingCliente,   setEditingCliente]   = useState(null);
  const [searchText,       setSearchText]       = useState('');
  const [filterType,       setFilterType]       = useState('todos');
  const [loading,          setLoading]          = useState(false);
  const [gpsTag,           setGpsTag]           = useState(false);
  const [exportando,       setExportando]       = useState(false);
  const [formData,         setFormData]         = useState(emptyForm());
  const [visitaCliente,    setVisitaCliente]    = useState(null);

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    loadClientes();
  }, []);

  useEffect(() => {
    if (!route?.params) return;
    const { abrirModalGPS, latitude, longitude, endereco } = route.params;
    if (abrirModalGPS) {
      const f = emptyForm();
      f.endereco  = endereco  || '';
      f.latitude  = latitude  || '';
      f.longitude = longitude || '';
      setFormData(f);
      setEditingCliente(null);
      setGpsTag(true);
      setModalVisible(true);
      navigation?.setParams({ abrirModalGPS: false });
    }
  }, [route?.params]);

  const loadClientes = async () => {
    try {
      const snap = await getDocs(collection(db, 'clientes'));
      const data = []; snap.forEach(d => data.push({ id: d.id, ...d.data() }));
      setClientes(data);
    } catch (e) { console.log('Erro clientes:', e); }
  };

  const salvarCliente = async () => {
    if (!formData.nome) { Alert.alert('Erro', 'Nome é obrigatório'); return; }
    setLoading(true);
    try {
      const dados = { ...formData };
      if (editingCliente) {
        await updateDoc(doc(db, 'clientes', editingCliente.id), dados);
        Alert.alert('✅ Sucesso', 'Cliente atualizado!');
      } else {
        await addDoc(collection(db, 'clientes'), dados);
        Alert.alert('✅ Sucesso', 'Cliente cadastrado!');
      }
      setModalVisible(false); resetForm(); loadClientes();
    } catch (e) { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setLoading(false); }
  };

  const deleteCliente = (id) => {
    Alert.alert('Confirmar exclusão', 'Deseja excluir este cliente?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'clientes', id));
        setModalVisible(false);
        loadClientes();
      }},
    ]);
  };

  const capturarGPSDoCard = async (cliente, latitude, longitude, endereco) => {
    try {
      const dados = { latitude, longitude };
      if (endereco && !cliente.endereco) dados.endereco = endereco;
      await updateDoc(doc(db, 'clientes', cliente.id), dados);
      setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, ...dados } : c));
      Alert.alert('📍 GPS Salvo!', `Localização de "${cliente.nome}" salva com sucesso.`);
    } catch (e) { Alert.alert('Erro', 'Não foi possível salvar a localização.'); }
  };

  const capturarGPSModal = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Ative a localização.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let endereco = formData.endereco;
      if (!endereco) {
        try {
          const addr = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (addr?.length > 0) {
            const a = addr[0];
            endereco = [a.street, a.streetNumber, a.district || a.subregion, a.city, a.region].filter(Boolean).join(', ');
          }
        } catch (e) {}
      }
      setFormData(prev => ({ ...prev, latitude: latitude.toString(), longitude: longitude.toString(), endereco }));
      Alert.alert('📍 GPS capturado!', `Lat: ${latitude.toFixed(5)}\nLng: ${longitude.toFixed(5)}`);
    } catch (e) { Alert.alert('Erro', 'Não foi possível capturar a localização.'); }
  };

  const selecionarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Precisamos de acesso à galeria.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFormData(prev => ({ ...prev, foto: result.assets[0].uri }));
      }
    } catch (e) { Alert.alert('Erro', 'Não foi possível selecionar a foto.'); }
  };

  const tirarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Precisamos de acesso à câmera.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setFormData(prev => ({ ...prev, foto: result.assets[0].uri }));
      }
    } catch (e) { Alert.alert('Erro', 'Não foi possível abrir a câmera.'); }
  };

  const toggleFornecedor = (f) => {
    setFormData(prev => ({ ...prev, fornecedores: { ...prev.fornecedores, [f]: !prev.fornecedores?.[f] } }));
  };

  const resetForm = () => { setFormData(emptyForm()); setEditingCliente(null); setGpsTag(false); };

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const lista = filteredClientes;
      const linhas = lista.map((c, i) => {
        const forn = FORNECEDORES.filter(f => c.fornecedores?.[f]).join(', ') || '—';
        return `
          <tr style="background:${i % 2 === 0 ? '#f8f9fa' : '#ffffff'}">
            <td>${c.nome || '—'}</td>
            <td>${c.cnpj || '—'}</td>
            <td>${c.telefone1 ? (c.contato1 ? c.contato1 + ': ' + c.telefone1 : c.telefone1) : '—'}${c.telefone2 ? '<br>' + (c.contato2 ? c.contato2 + ': ' + c.telefone2 : c.telefone2) : ''}</td>
            <td>${c.email || '—'}</td>
            <td>${c.endereco || '—'}</td>
            <td>${forn}</td>
          </tr>`;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            h1 { color: #001E2E; font-size: 22px; margin-bottom: 4px; }
            p  { color: #666; font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #001E2E; color: #E8B432; padding: 10px 8px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
          </style>
        </head>
        <body>
          <h1>📋 Lista de Clientes — MAYA Representações</h1>
          <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} · ${lista.length} cliente(s)</p>
          <table>
            <thead>
              <tr><th>Nome</th><th>CNPJ</th><th>Telefone(s)</th><th>E-mail</th><th>Endereço</th><th>Fornecimento</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </body>
        </html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar lista de clientes' });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar o PDF.');
      console.log(e);
    } finally { setExportando(false); }
  };

  const filteredClientes = clientes.filter(c =>
    (filterType === 'todos' || c.tipo === filterType) &&
    (c.nome?.toLowerCase().includes(searchText.toLowerCase()) || c.telefone1?.includes(searchText) || c.telefone2?.includes(searchText))
  );

  const totalAtivos     = clientes.filter(c => c.status === 'ativo').length;
  const totalPotenciais = clientes.filter(c => c.status === 'potencial').length;

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      {/* ══ HEADER ══ */}
      <Animated.View style={[ds.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <View style={ds.headerTop}>
          <View>
            <Text style={ds.headerTitle}>Clientes</Text>
            <Text style={ds.headerSub}>{clientes.length} registros encontrados</Text>
          </View>
          <TouchableOpacity style={ds.pdfBtn} onPress={exportarPDF} disabled={exportando} activeOpacity={0.8}>
            <Icon name="picture-as-pdf" size={16} color={DARK_BG} type="material" />
            <Text style={ds.pdfBtnText}>{exportando ? '...' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
        <ShimmerLine color={GOLD} />
        <View style={ds.kpiBar}>
          {[
            { label: 'Total',      value: clientes.length, gold: true  },
            { label: 'Ativos',     value: totalAtivos,     gold: false },
            { label: 'Potenciais', value: totalPotenciais, gold: true  },
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
      </Animated.View>

      {/* ══ BUSCA ══ */}
      <View style={ds.searchWrap}>
        <View style={ds.searchBox}>
          <Icon name="search" size={18} color={SILVER_DARK} type="material" />
          <TextInput style={ds.searchInput} placeholder="Buscar por nome ou telefone..." placeholderTextColor={SILVER_DARK} value={searchText} onChangeText={setSearchText} />
          {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Icon name="close" size={16} color={SILVER_DARK} type="material" /></TouchableOpacity>}
        </View>
      </View>

      {/* ══ FILTROS ══ */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ds.filtersScroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <FilterChip label="Todos"          active={filterType === 'todos'}        onPress={() => setFilterType('todos')} />
        <FilterChip label="Lojas"          icon="store"        tipo="loja"         active={filterType === 'loja'}         onPress={() => setFilterType('loja')} />
        <FilterChip label="Obras"          icon="construction" tipo="obra"         active={filterType === 'obra'}         onPress={() => setFilterType('obra')} />
        <FilterChip label="Distribuidores" icon="business"     tipo="distribuidor" active={filterType === 'distribuidor'} onPress={() => setFilterType('distribuidor')} />
      </ScrollView>

      {/* ══ LISTA ══ */}
      <FlatList
        data={filteredClientes}
        renderItem={({ item }) => (
          <ClienteCard
            item={item}
            onPress={() => {
              const f = { ...emptyForm(), ...item, fornecedores: { ...emptyForm().fornecedores, ...(item.fornecedores || {}) } };
              setFormData(f); setEditingCliente(item); setModalVisible(true);
            }}
            onCapturarGPS={capturarGPSDoCard}
            onCheckin={() => setVisitaCliente(item)}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={ds.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={ds.emptyWrap}>
            <Icon name="people-outline" size={56} color={GOLD + '40'} type="material" />
            <Text style={ds.emptyTitle}>Nenhum cliente encontrado</Text>
            <Text style={ds.emptySub}>Toque no + para adicionar</Text>
          </View>
        }
      />

      {/* ══ FAB ══ */}
      <TouchableOpacity style={ds.fab} onPress={() => { resetForm(); setModalVisible(true); }} activeOpacity={0.85}>
        <Icon name="add" size={28} color={DARK_BG} type="material" />
      </TouchableOpacity>

      {/* ══ MODAL EDITAR/CRIAR ══ */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={ms.overlay}>
          <View style={ms.sheet}>
            <View style={ms.header}>
              <View style={ms.headerLeft}>
                <View style={[ms.headerIcon, gpsTag && { backgroundColor: SUCCESS }]}>
                  <Icon name={gpsTag ? 'gps-fixed' : editingCliente ? 'edit' : 'person-add'} size={20} color={DARK_BG} type="material" />
                </View>
                <View>
                  <Text style={ms.headerTitle}>{editingCliente ? 'Editar Cliente' : 'Novo Cliente'}</Text>
                  {gpsTag && <Text style={ms.gpsTag}>📍 Localização capturada</Text>}
                </View>
              </View>
              <TouchableOpacity style={ms.closeBtn} onPress={() => { setModalVisible(false); setGpsTag(false); }}>
                <Icon name="close" size={20} color={SILVER} type="material" />
              </TouchableOpacity>
            </View>

            <ShimmerLine color={gpsTag ? SUCCESS : GOLD} />

            <ScrollView style={ms.body} showsVerticalScrollIndicator={false}>
              {gpsTag && (
                <View style={ms.gpsBanner}>
                  <Icon name="gps-fixed" size={18} color={SUCCESS} type="material" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={ms.gpsBannerTitle}>Localização GPS capturada!</Text>
                    <Text style={ms.gpsBannerSub}>{formData.latitude ? `Lat: ${parseFloat(formData.latitude).toFixed(5)}  Lng: ${parseFloat(formData.longitude).toFixed(5)}` : '—'}</Text>
                  </View>
                  <Icon name="check-circle" size={20} color={SUCCESS} type="material" />
                </View>
              )}

              <Text style={ms.label}>Foto do Cliente</Text>
              <View style={ms.fotoRow}>
                {formData.foto ? (
                  <Image source={{ uri: formData.foto }} style={ms.fotoPreview} />
                ) : (
                  <View style={ms.fotoPlaceholder}>
                    <Icon name="person" size={32} color={SILVER_DARK} type="material" />
                  </View>
                )}
                <View style={ms.fotoBtns}>
                  <TouchableOpacity style={ms.fotoBtn} onPress={selecionarFoto} activeOpacity={0.8}>
                    <Icon name="photo-library" size={16} color={GOLD} type="material" />
                    <Text style={ms.fotoBtnText}>Galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[ms.fotoBtn, { borderColor: SILVER + '40' }]} onPress={tirarFoto} activeOpacity={0.8}>
                    <Icon name="camera-alt" size={16} color={SILVER} type="material" />
                    <Text style={[ms.fotoBtnText, { color: SILVER }]}>Câmera</Text>
                  </TouchableOpacity>
                  {formData.foto ? (
                    <TouchableOpacity style={[ms.fotoBtn, { borderColor: DANGER + '50' }]} onPress={() => setFormData(p => ({ ...p, foto: '' }))} activeOpacity={0.8}>
                      <Icon name="delete" size={16} color={DANGER} type="material" />
                      <Text style={[ms.fotoBtnText, { color: DANGER }]}>Remover</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <Text style={ms.label}>Nome *</Text>
              <View style={ms.inputWrap}>
                <Icon name="person" size={16} color={SILVER_DARK} style={{ marginRight: 8 }} type="material" />
                <TextInput style={ms.input} placeholder="Nome completo" placeholderTextColor={SILVER_DARK} value={formData.nome} onChangeText={t => setFormData(p => ({ ...p, nome: t }))} />
              </View>

              <Text style={ms.label}>CNPJ</Text>
              <View style={ms.inputWrap}>
                <Icon name="business" size={16} color={SILVER_DARK} style={{ marginRight: 8 }} type="material" />
                <TextInput style={ms.input} placeholder="00.000.000/0000-00" placeholderTextColor={SILVER_DARK} value={formData.cnpj} onChangeText={t => setFormData(p => ({ ...p, cnpj: t }))} keyboardType="numeric" />
              </View>

              <Text style={ms.label}>Contato 1</Text>
              <View style={ms.inputRow}>
                <View style={[ms.inputWrap, { flex: 1 }]}>
                  <Icon name="person-outline" size={14} color={SILVER_DARK} style={{ marginRight: 6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Nome" placeholderTextColor={SILVER_DARK} value={formData.contato1} onChangeText={t => setFormData(p => ({ ...p, contato1: t }))} />
                </View>
                <View style={[ms.inputWrap, { flex: 1 }]}>
                  <Icon name="phone" size={14} color={SILVER_DARK} style={{ marginRight: 6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Telefone" placeholderTextColor={SILVER_DARK} value={formData.telefone1} onChangeText={t => setFormData(p => ({ ...p, telefone1: t }))} keyboardType="phone-pad" />
                </View>
              </View>

              <Text style={ms.label}>Contato 2</Text>
              <View style={ms.inputRow}>
                <View style={[ms.inputWrap, { flex: 1 }]}>
                  <Icon name="person-outline" size={14} color={SILVER_DARK} style={{ marginRight: 6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Nome" placeholderTextColor={SILVER_DARK} value={formData.contato2} onChangeText={t => setFormData(p => ({ ...p, contato2: t }))} />
                </View>
                <View style={[ms.inputWrap, { flex: 1 }]}>
                  <Icon name="phone" size={14} color={SILVER_DARK} style={{ marginRight: 6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Telefone" placeholderTextColor={SILVER_DARK} value={formData.telefone2} onChangeText={t => setFormData(p => ({ ...p, telefone2: t }))} keyboardType="phone-pad" />
                </View>
              </View>

              <Text style={ms.label}>Email</Text>
              <View style={ms.inputWrap}>
                <Icon name="email" size={16} color={SILVER_DARK} style={{ marginRight: 8 }} type="material" />
                <TextInput style={ms.input} placeholder="email@exemplo.com" placeholderTextColor={SILVER_DARK} value={formData.email} onChangeText={t => setFormData(p => ({ ...p, email: t }))} keyboardType="email-address" autoCapitalize="none" />
              </View>

              <Text style={ms.label}>Endereço</Text>
              <View style={[ms.inputWrap, gpsTag && { borderColor: SUCCESS + '60', backgroundColor: SUCCESS + '10' }]}>
                <Icon name="location-on" size={16} color={gpsTag ? SUCCESS : SILVER_DARK} style={{ marginRight: 8 }} type="material" />
                <TextInput style={ms.input} placeholder="Rua, número, bairro" placeholderTextColor={SILVER_DARK} value={formData.endereco} onChangeText={t => setFormData(p => ({ ...p, endereco: t }))} />
              </View>

              <Text style={ms.label}>Cidade</Text>
              <View style={ms.inputWrap}>
                <Icon name="location-city" size={16} color={SILVER_DARK} style={{ marginRight: 8 }} type="material" />
                <TextInput
                  style={ms.input}
                  placeholder="Digite ou selecione abaixo"
                  placeholderTextColor={SILVER_DARK}
                  value={formData.cidade}
                  onChangeText={t => setFormData(p => ({ ...p, cidade: t }))}
                />
                {formData.cidade ? (
                  <TouchableOpacity onPress={() => setFormData(p => ({ ...p, cidade: '' }))}>
                    <Icon name="clear" size={16} color={SILVER_DARK} type="material" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 8, gap: 6, flexDirection: 'row' }}>
                {CIDADES_DF.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[ms.cidadeChip, formData.cidade === c && ms.cidadeChipAtivo]}
                    onPress={() => setFormData(p => ({ ...p, cidade: p.cidade === c ? '' : c }))}
                    activeOpacity={0.8}>
                    <Text style={[ms.cidadeChipTxt, formData.cidade === c && ms.cidadeChipTxtAtivo]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={ms.gpsModalBtn} onPress={capturarGPSModal} activeOpacity={0.8}>
                <Icon name="my-location" size={16} color={SUCCESS} type="material" />
                <Text style={ms.gpsModalBtnText}>
                  {formData.latitude ? `📍 GPS: ${parseFloat(formData.latitude).toFixed(4)}, ${parseFloat(formData.longitude).toFixed(4)} — Atualizar` : '📍 Capturar localização atual'}
                </Text>
              </TouchableOpacity>

              <Text style={ms.label}>Tipo de Cliente</Text>
              <View style={ms.optionsRow}>
                {['loja', 'obra', 'distribuidor'].map(t => (
                  <OptionChip key={t} label={t} active={formData.tipo === t} onPress={() => setFormData(p => ({ ...p, tipo: t }))} />
                ))}
              </View>

              <Text style={ms.label}>Status</Text>
              <View style={ms.optionsRow}>
                {['ativo', 'inativo', 'potencial'].map(s => (
                  <OptionChip key={s} label={s} active={formData.status === s} onPress={() => setFormData(p => ({ ...p, status: s }))} />
                ))}
              </View>

              <Text style={ms.label}>Fornecimento Atual</Text>
              <View style={ms.fornGrid}>
                {FORNECEDORES.map(f => {
                  const ativo = formData.fornecedores?.[f];
                  return (
                    <TouchableOpacity key={f} style={[ms.fornItem, ativo && ms.fornItemActive]} onPress={() => toggleFornecedor(f)} activeOpacity={0.8}>
                      <View style={[ms.fornCheck, ativo && { backgroundColor: GOLD, borderColor: GOLD }]}>
                        {ativo && <Icon name="check" size={12} color={DARK_BG} type="material" />}
                      </View>
                      <Text style={[ms.fornLabel, ativo && { color: GOLD }]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={ms.label}>Observações</Text>
              <View style={[ms.inputWrap, { alignItems: 'flex-start', paddingTop: 10 }]}>
                <TextInput style={[ms.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Anotações sobre o cliente..." placeholderTextColor={SILVER_DARK} value={formData.observacoes} onChangeText={t => setFormData(p => ({ ...p, observacoes: t }))} multiline numberOfLines={3} />
              </View>

              {/* ── SEÇÃO LEMBRETES E CUSTOS ── */}
              <View style={ms.sectionDivider}>
                <Icon name="notifications-active" size={14} color={WARN} type="material" />
                <Text style={[ms.sectionDividerText, { color: WARN }]}>Lembretes & Custos</Text>
              </View>

              <Text style={ms.label}>📅 Próxima Visita</Text>
              <View style={ms.inputWrap}>
                <Icon name="event" size={16} color={SILVER_DARK} style={{ marginRight: 8 }} type="material" />
                <TextInput
                  style={ms.input}
                  placeholder="dd/mm/aaaa"
                  placeholderTextColor={SILVER_DARK}
                  value={formData.proximaVisita}
                  onChangeText={t => setFormData(p => ({ ...p, proximaVisita: t }))}
                  keyboardType="numeric"
                />
              </View>

              <Text style={ms.label}>🔔 Lembrete</Text>
              <View style={[ms.inputWrap, { alignItems: 'flex-start', paddingTop: 10 }]}>
                <Icon name="sticky-note-2" size={16} color={SILVER_DARK} style={{ marginRight: 8, marginTop: 2 }} type="material" />
                <TextInput
                  style={[ms.input, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Ex: Ligar antes de visitar, trazer catálogo..."
                  placeholderTextColor={SILVER_DARK}
                  value={formData.lembrete}
                  onChangeText={t => setFormData(p => ({ ...p, lembrete: t }))}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <Text style={ms.label}>💰 Custo Médio de Visita (R$)</Text>
              <View style={ms.inputWrap}>
                <Icon name="attach-money" size={16} color={SUCCESS} style={{ marginRight: 8 }} type="material" />
                <TextInput
                  style={ms.input}
                  placeholder="0,00"
                  placeholderTextColor={SILVER_DARK}
                  value={formData.custoMedio}
                  onChangeText={t => setFormData(p => ({ ...p, custoMedio: t }))}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity style={[ms.saveBtn, loading && { opacity: 0.7 }]} onPress={salvarCliente} disabled={loading} activeOpacity={0.85}>
                <Icon name={editingCliente ? 'save' : 'person-add'} size={18} color={DARK_BG} style={{ marginRight: 8 }} type="material" />
                <Text style={ms.saveBtnText}>{loading ? 'Salvando...' : editingCliente ? 'ATUALIZAR CLIENTE' : 'CADASTRAR CLIENTE'}</Text>
              </TouchableOpacity>

              {editingCliente && (
                <TouchableOpacity style={ms.deleteBtn} onPress={() => deleteCliente(editingCliente.id)} activeOpacity={0.8}>
                  <Icon name="delete-forever" size={18} color={DANGER} style={{ marginRight: 8 }} type="material" />
                  <Text style={ms.deleteBtnText}>EXCLUIR CLIENTE</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══ MODAL CHECK-IN ══ */}
      <VisitaModal
        visible={!!visitaCliente}
        cliente={visitaCliente}
        onClose={() => setVisitaCliente(null)}
        onSaved={() => {
          setVisitaCliente(null);
          Alert.alert('✅ Check-in registrado!', `Visita a "${visitaCliente?.nome}" salva com sucesso.`);
        }}
      />
    </View>
  );
}

const ds = StyleSheet.create({
  container:    { flex: 1, backgroundColor: DARK_BG },
  header:       { backgroundColor: '#001828', paddingBottom: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 10 },
  headerTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerTitle:  { fontSize: 26, fontWeight: 'bold', color: SILVER_LIGHT, letterSpacing: 0.5 },
  headerSub:    { fontSize: 12, color: SILVER_DARK, marginTop: 2 },
  pdfBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
  pdfBtnText:   { fontSize: 12, fontWeight: 'bold', color: DARK_BG },
  kpiBar:       { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: GOLD + '20' },
  kpiItem:      { flex: 1, alignItems: 'center' },
  kpiVal:       { fontSize: 12, fontWeight: 'bold' },
  kpiLabel:     { fontSize: 9, color: SILVER_DARK, marginTop: 1, letterSpacing: 0.3 },
  kpiDiv:       { width: 1, backgroundColor: SILVER + '20' },
  searchWrap:   { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  searchBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: SILVER + '30' },
  searchInput:  { flex: 1, fontSize: 13, color: SILVER_LIGHT, marginLeft: 8 },
  filtersScroll:{ maxHeight: 48, marginBottom: 4 },
  list:         { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
  emptyWrap:    { paddingTop: 60, alignItems: 'center' },
  emptyTitle:   { fontSize: 16, fontWeight: 'bold', color: SILVER, marginTop: 16 },
  emptySub:     { fontSize: 12, color: SILVER_DARK, marginTop: 6 },
  fab:          { position: 'absolute', bottom: 24, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 14, elevation: 10 },
});

const ms = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: MODAL_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%', overflow: 'hidden', borderTopWidth: 1, borderColor: GOLD + '30' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  headerLeft:     { flexDirection: 'row', alignItems: 'center' },
  headerIcon:     { width: 36, height: 36, borderRadius: 12, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle:    { fontSize: 18, fontWeight: 'bold', color: SILVER_LIGHT },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  body:           { paddingHorizontal: 20, paddingTop: 16 },
  label:          { fontSize: 11, fontWeight: '700', color: SILVER_DARK, letterSpacing: 0.8, marginBottom: 6, marginTop: 14, textTransform: 'uppercase' },
  inputWrap:      { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: SILVER + '25', marginBottom: 4 },
  inputRow:       { flexDirection: 'row', gap: 8, marginBottom: 4 },
  input:          { flex: 1, fontSize: 14, color: SILVER_LIGHT, paddingVertical: 10 },
  optionsRow:     { flexDirection: 'row', marginBottom: 4 },
  fotoRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  fotoPreview:    { width: 72, height: 72, borderRadius: 16, borderWidth: 2, borderColor: GOLD },
  fotoPlaceholder:{ width: 72, height: 72, borderRadius: 16, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '30', justifyContent: 'center', alignItems: 'center' },
  fotoBtns:       { flex: 1, gap: 8 },
  fotoBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GOLD + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: GOLD + '50' },
  fotoBtnText:    { fontSize: 12, fontWeight: '600', color: GOLD },
  gpsModalBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SUCCESS + '15', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: SUCCESS + '40', marginBottom: 4 },
  gpsModalBtnText:{ fontSize: 12, color: SUCCESS, fontWeight: '600', flex: 1 },
  cidadeChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: CARD_BG2, borderWidth: 1, borderColor: SILVER + '25' },
  cidadeChipAtivo:{ backgroundColor: GOLD, borderColor: GOLD },
  cidadeChipTxt:  { fontSize: 11, fontWeight: '700', color: SILVER_DARK },
  cidadeChipTxtAtivo: { color: DARK_BG },
  sectionDivider:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: WARN + '30' },
  sectionDividerText: { fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5 },
  fornGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  fornItem:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD_BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: SILVER + '25', width: '47%' },
  fornItemActive: { borderColor: GOLD + '70', backgroundColor: GOLD + '12' },
  fornCheck:      { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: SILVER_DARK, justifyContent: 'center', alignItems: 'center' },
  fornLabel:      { fontSize: 13, color: SILVER_DARK, fontWeight: '600' },
  saveBtn:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, marginTop: 20, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  saveBtnText:    { fontSize: 15, fontWeight: 'bold', color: DARK_BG, letterSpacing: 0.5 },
  deleteBtn:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: DANGER + '15', borderRadius: 14, paddingVertical: 14, marginTop: 10, borderWidth: 1, borderColor: DANGER + '50' },
  deleteBtnText:  { fontSize: 14, fontWeight: 'bold', color: DANGER, letterSpacing: 0.5 },
  gpsBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: SUCCESS + '15', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: SUCCESS + '50', marginBottom: 4 },
  gpsBannerTitle: { fontSize: 12, fontWeight: 'bold', color: SUCCESS },
  gpsBannerSub:   { fontSize: 10, color: SILVER_DARK, marginTop: 2 },
  gpsTag:         { fontSize: 10, color: SUCCESS, fontWeight: '600', marginTop: 1 },
});