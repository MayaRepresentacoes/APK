// screens/ClientesScreen.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, ScrollView, Alert, Dimensions,
  StatusBar, Animated, Share, Image, Platform, Linking,
  ActivityIndicator,
} from 'react-native';
import { Icon } from 'react-native-elements';
import {
  getClientes, getVisitas, getCheckins,
  addCliente, updateCliente,
  deleteCliente as removerCliente,
} from '../services/firebase';
import VisitaModal                from '../components/VisitaModal';
import * as Location              from 'expo-location';
import * as ImagePicker           from 'expo-image-picker';
import * as Print                 from 'expo-print';
import * as Sharing               from 'expo-sharing';
import { calcularPrioridadeClienteIA, detectarOportunidadesIA } from '../services/aiService';
// [CORRIGIDO] getDiasSemCompra removido — importado mas nunca chamado diretamente
// (diasSemCompra é calculado em enriquecerClientes via funções locais)

const { width: SW } = Dimensions.get('window');

const GOLD        = '#E8B432';
const SILVER      = '#C0D2E6';
const SILVER_LIGHT= '#E8EEF5';
const SILVER_DARK = '#8A9BB0';
const DARK_BG     = '#001E2E';
const CARD_BG     = '#002840';
const CARD_BG2    = '#003352';
const MODAL_BG    = '#001828';
const SUCCESS     = '#4CAF50';
const DANGER      = '#EF5350';
const WARN        = '#FF9800';
const BLUE        = '#5BA3D0';
const PURPLE      = '#C56BF0';

const TIPO_COLORS = {
  loja        : { main:'#E8B432', light:'#F5D07A', bg:'#E8B43220', bar:'#E8B432' },
  obra        : { main:'#4CAF50', light:'#81C784', bg:'#4CAF5020', bar:'#4CAF50' },
  distribuidor: { main:'#29B6F6', light:'#90CAF9', bg:'#29B6F620', bar:'#29B6F6' },
};
const getTipoColor = (tipo) => TIPO_COLORS[tipo] || { main:SILVER, light:SILVER_LIGHT, bg:SILVER+'18', bar:SILVER };
const getTipoIcon  = (tipo) =>
  tipo==='loja'?'store':tipo==='obra'?'construction':tipo==='distribuidor'?'business':'location-on';

const FORNECEDORES = ['FORTLEV', 'AFORT', 'METAL TECK', 'TINTAS S.'];

function diasDesde(dataStr) {
  if (!dataStr) return null;
  const d = new Date(dataStr);
  if (isNaN(d)) return null;
  return Math.floor((new Date() - d) / 86400000);
}

function getUltimaCompraLocal(clienteId, visitasPorCliente) {
  const vs = (visitasPorCliente[clienteId] || []).filter(v => v.comprou || v.resultado === 'comprou');
  if (!vs.length) return null;
  vs.sort((a,b) => new Date(b.dataLocal||0) - new Date(a.dataLocal||0));
  return vs[0];
}

function enriquecerClientes(clientes, visitasPorCliente) {
  return clientes.map(c => {
    const ultimaCompra  = getUltimaCompraLocal(c.id, visitasPorCliente);
    const diasSemCompra = ultimaCompra ? diasDesde(ultimaCompra.dataLocal) : null;
    const ultimaVisita  = (visitasPorCliente[c.id] || [])[0] || null;
    return { ...c, ultimaCompra, diasSemCompra, ultimaVisita };
  });
}

function filtrarClientes(clientes, { searchText, filterTipo, filterStatus, filterCidade, reposicaoIds }) {
  return clientes.filter(c => {
    const textoOk = !searchText
      || c.nome?.toLowerCase().includes(searchText.toLowerCase())
      || c.telefone1?.includes(searchText)
      || c.telefone2?.includes(searchText)
      || c.cidade?.toLowerCase().includes(searchText.toLowerCase());
    const tipoOk   = filterTipo   === 'todos' || c.tipo   === filterTipo;
    const cidadeOk = !filterCidade              || c.cidade === filterCidade;

    let statusOk = true;
    if (filterStatus === 'reposicao') {
      statusOk = reposicaoIds.has(c.id);
    } else if (filterStatus !== 'todos') {
      statusOk = c.status === filterStatus;
    }

    return textoOk && tipoOk && statusOk && cidadeOk;
  });
}

async function buscarCEP(cep) {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await resp.json();
    if (data.erro) return null;
    return {
      endereco: `${data.logradouro || ''}${data.bairro ? ', ' + data.bairro : ''}`.trim(),
      cidade  : data.localidade || '',
      uf      : data.uf || '',
    };
  } catch (e) {
    return null;
  }
}

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver:true })).start();
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

function OptionChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[oc.chip, active && { backgroundColor:GOLD, borderColor:GOLD }]} onPress={onPress}>
      <Text style={[oc.text, active && { color:DARK_BG }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const oc = StyleSheet.create({
  chip: { flex:1, paddingVertical:10, borderRadius:10, borderWidth:1, borderColor:SILVER+'35', alignItems:'center', marginHorizontal:3, backgroundColor:CARD_BG2 },
  text: { fontSize:12, color:SILVER, fontWeight:'600' },
});

function SearchBar({ value, onChangeText, placeholder = 'Buscar...' }) {
  return (
    <View style={sb.wrap}>
      <Icon name="search" size={18} color={SILVER_DARK} type="material" />
      <TextInput
        style={sb.input}
        placeholder={placeholder}
        placeholderTextColor={SILVER_DARK}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
          <Icon name="close" size={16} color={SILVER_DARK} type="material" />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sb = StyleSheet.create({
  wrap : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG, borderRadius:14, paddingHorizontal:14, paddingVertical:10, borderWidth:1, borderColor:SILVER+'30' },
  input: { flex:1, fontSize:13, color:SILVER_LIGHT, marginLeft:8 },
});

function FiltroClientes({ filterTipo, filterStatus, filterCidade, cidades, qtdReposicao, onTipo, onStatus, onCidade }) {
  const [expandido, setExpandido] = useState(false);

  const statusOpcoes = [
    { key:'todos',     label:'Todos',       cor:SILVER,      dot:SILVER    },
    { key:'ativo',     label:'Ativos',      cor:SUCCESS,     dot:SUCCESS   },
    { key:'inativo',   label:'Parados',     cor:DANGER,      dot:DANGER    },
    { key:'potencial', label:'Potenciais',  cor:GOLD,        dot:GOLD      },
    { key:'reposicao', label:`Reposição${qtdReposicao > 0 ? ` (${qtdReposicao})` : ''}`, cor:PURPLE, dot:PURPLE },
  ];

  return (
    <View style={fl.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fl.row}>
        {[
          { key:'todos',        label:'Todos',         icon:null,            tipo:null           },
          { key:'loja',         label:'Lojas',          icon:'store',         tipo:'loja'         },
          { key:'obra',         label:'Obras',          icon:'construction',  tipo:'obra'         },
          { key:'distribuidor', label:'Distribuidores', icon:'business',      tipo:'distribuidor' },
        ].map(item => {
          const tc     = item.tipo ? getTipoColor(item.tipo) : { main:GOLD };
          const active = filterTipo === item.key;
          return (
            <TouchableOpacity key={item.key}
              style={[fl.chip, active && { backgroundColor:tc.main, borderColor:tc.main }]}
              onPress={() => onTipo(item.key)} activeOpacity={0.8}>
              {item.icon && <Icon name={item.icon} size={13} color={active?DARK_BG:tc.main} type="material" />}
              <Text style={[fl.chipTxt, { color:active?DARK_BG:tc.main, marginLeft:item.icon?5:0 }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={fl.statusRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6 }}>
          {statusOpcoes.map(s => {
            const active = filterStatus === s.key;
            return (
              <TouchableOpacity key={s.key}
                style={[fl.statusChip, active && { backgroundColor:s.cor, borderColor:s.cor }]}
                onPress={() => onStatus(s.key)} activeOpacity={0.8}>
                {s.key === 'reposicao'
                  ? <Icon name="inventory" size={11} color={active?DARK_BG:s.cor} type="material" />
                  : <View style={[fl.dot, { backgroundColor:active?DARK_BG:s.dot }]} />}
                <Text style={[fl.statusTxt, { color:active?DARK_BG:s.cor }]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={[fl.cidadeBtn, filterCidade && { backgroundColor:BLUE+'30', borderColor:BLUE }]}
          onPress={() => setExpandido(e => !e)} activeOpacity={0.8}>
          <Icon name="location-city" size={14} color={filterCidade?BLUE:SILVER_DARK} type="material" />
          <Text style={[fl.cidadeBtnTxt, filterCidade && { color:BLUE }]}>{filterCidade || 'Cidade'}</Text>
          <Icon name={expandido?'expand-less':'expand-more'} size={14} color={filterCidade?BLUE:SILVER_DARK} type="material" />
        </TouchableOpacity>
      </View>

      {expandido && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fl.cidadesRow}>
          <TouchableOpacity style={[fl.cidadeChip, !filterCidade && fl.cidadeChipAtivo]}
            onPress={() => { onCidade(''); setExpandido(false); }}>
            <Text style={[fl.cidadeChipTxt, !filterCidade && fl.cidadeChipTxtAtivo]}>Todas</Text>
          </TouchableOpacity>
          {cidades.map(c => (
            <TouchableOpacity key={c}
              style={[fl.cidadeChip, filterCidade===c && fl.cidadeChipAtivo]}
              onPress={() => { onCidade(filterCidade===c?'':c); setExpandido(false); }}>
              <Text style={[fl.cidadeChipTxt, filterCidade===c && fl.cidadeChipTxtAtivo]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {(filterTipo!=='todos' || filterStatus!=='todos' || filterCidade) && (
        <View style={fl.ativos}>
          <Icon name="filter-list" size={12} color={GOLD} type="material" />
          <Text style={fl.ativosTxt}>Filtros ativos</Text>
          <TouchableOpacity onPress={() => { onTipo('todos'); onStatus('todos'); onCidade(''); }} style={fl.limparBtn}>
            <Text style={fl.limparTxt}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const fl = StyleSheet.create({
  container        : { backgroundColor:CARD_BG+'80', borderBottomWidth:1, borderBottomColor:SILVER+'10' },
  row              : { paddingHorizontal:16, paddingVertical:8, gap:6, flexDirection:'row' },
  chip             : { flexDirection:'row', alignItems:'center', paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:SILVER+'30', backgroundColor:CARD_BG },
  chipTxt          : { fontSize:12, fontWeight:'700' },
  statusRow        : { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingBottom:8, gap:6 },
  statusChip       : { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:11, paddingVertical:6, borderRadius:16, borderWidth:1, borderColor:SILVER+'30', backgroundColor:CARD_BG },
  dot              : { width:6, height:6, borderRadius:3 },
  statusTxt        : { fontSize:11, fontWeight:'700' },
  cidadeBtn        : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:6, borderRadius:14, borderWidth:1, borderColor:SILVER+'30', backgroundColor:CARD_BG, marginLeft:'auto' },
  cidadeBtnTxt     : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  cidadesRow       : { paddingHorizontal:16, paddingBottom:10, gap:6, flexDirection:'row' },
  cidadeChip       : { paddingHorizontal:12, paddingVertical:6, borderRadius:16, backgroundColor:CARD_BG2, borderWidth:1, borderColor:SILVER+'25' },
  cidadeChipAtivo  : { backgroundColor:BLUE, borderColor:BLUE },
  cidadeChipTxt    : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  cidadeChipTxtAtivo:{ color:'#fff' },
  ativos           : { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:16, paddingBottom:8 },
  ativosTxt        : { fontSize:11, color:GOLD, flex:1 },
  limparBtn        : { paddingHorizontal:10, paddingVertical:3, backgroundColor:GOLD+'20', borderRadius:8, borderWidth:1, borderColor:GOLD+'40' },
  limparTxt        : { fontSize:11, fontWeight:'700', color:GOLD },
});

function ClienteCard({ item, onPress, onEditar, onCapturarGPS, onCheckin, onRota, onHistorico }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const [capturando, setCapturando] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:350, useNativeDriver:true }),
      Animated.timing(slideAnim, { toValue:0, duration:350, useNativeDriver:true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const temGPS      = !!(item.latitude && item.longitude);
  const tc          = getTipoColor(item.tipo);
  const fornAtivos  = FORNECEDORES.filter(f => item.fornecedores?.[f]);
  const statusCor   = item.status==='ativo' ? SUCCESS : item.status==='potencial' ? GOLD : SILVER_DARK;
  const diasBadgeCor= item.diasSemCompra == null ? SILVER_DARK
    : item.diasSemCompra >= 30 ? DANGER
    : item.diasSemCompra >= 15 ? WARN
    : SUCCESS;

  const aiScore  = item.aiScore  ?? 0;
  const aiCor    = aiScore >= 70 ? DANGER : aiScore >= 45 ? WARN : PURPLE;
  const temIA    = aiScore >= 25;

  const handleGPS = async () => {
    setCapturando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada','Ative a localização.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy:Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let endereco = item.endereco || '';
      if (!endereco) {
        try {
          const addr = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (addr?.length > 0) {
            const a = addr[0];
            endereco = [a.street,a.streetNumber,a.district||a.subregion,a.city,a.region].filter(Boolean).join(', ');
          }
        } catch(e) {}
      }
      await onCapturarGPS(item, latitude.toString(), longitude.toString(), endereco);
    } catch(e) { Alert.alert('Erro','Não foi possível capturar a localização.'); }
    finally { setCapturando(false); }
  };

  return (
    <Animated.View style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }}>
      <TouchableOpacity
        style={[cc.card, { borderColor:tc.main+'45', shadowColor:tc.main }]}
        onPress={onPress} activeOpacity={0.88}>
        <View style={[cc.topBar, { backgroundColor:tc.bar }]} />

        <View style={cc.header}>
          {item.foto ? (
            <Image source={{ uri:item.foto }} style={[cc.foto, { borderColor:tc.main }]} />
          ) : (
            <View style={[cc.iconWrap, { backgroundColor:tc.bg }]}>
              <Icon name={getTipoIcon(item.tipo)} size={20} color={tc.main} type="material" />
            </View>
          )}
          <View style={cc.titleWrap}>
            <Text style={cc.nome} numberOfLines={1}>{item.nome}</Text>
            <Text style={[cc.tipo, { color:tc.light }]}>{item.tipo}</Text>
            {fornAtivos.length > 0 && (
              <View style={cc.fornRow}>
                {fornAtivos.map(f => (
                  <View key={f} style={[cc.fornBadge, { borderColor:tc.main+'60', backgroundColor:tc.bg }]}>
                    <Text style={[cc.fornText, { color:tc.light }]}>{f}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={{ alignItems:'flex-end', gap:4 }}>
            <View style={[cc.statusBadge, { backgroundColor:statusCor+'25', borderColor:statusCor+'60' }]}>
              <View style={[cc.statusDot, { backgroundColor:statusCor }]} />
              <Text style={[cc.statusText, { color:statusCor }]}>{item.status}</Text>
            </View>
            <View style={[cc.diasBadge, { backgroundColor:diasBadgeCor+'20', borderColor:diasBadgeCor+'50' }]}>
              <Icon name="shopping-cart" size={10} color={diasBadgeCor} type="material" />
              <Text style={[cc.diasTxt, { color:diasBadgeCor }]}>
                {item.diasSemCompra != null ? `${item.diasSemCompra}d` : 'nunca'}
              </Text>
            </View>
            {temIA && (
              <View style={[cc.iaBadge, { backgroundColor:aiCor+'20', borderColor:aiCor+'50' }]}>
                <Icon name="auto-awesome" size={9} color={aiCor} type="material" />
                <Text style={[cc.iaBadgeTxt, { color:aiCor }]}>{aiScore}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={cc.divider} />

        {temIA && item.aiMotivos?.length > 0 && (
          <View style={[cc.iaBanner, { borderColor:aiCor+'30', backgroundColor:aiCor+'0D' }]}>
            <Icon name="bolt" size={11} color={aiCor} type="material" />
            <Text style={[cc.iaBannerTxt, { color:aiCor }]} numberOfLines={1}>
              {item.aiMotivos[0]}
            </Text>
          </View>
        )}

        <View style={cc.infoGrid}>
          <View style={cc.infoRow}>
            <Icon name="receipt" size={12} color={item.ultimaCompra?SUCCESS:SILVER_DARK} type="material" />
            <Text style={[cc.infoText, { color:item.ultimaCompra?SUCCESS:SILVER_DARK }]}>
              {item.ultimaCompra
                ? `Última compra: ${new Date(item.ultimaCompra.dataLocal).toLocaleDateString('pt-BR')}`
                : 'Sem compras registradas'}
            </Text>
          </View>
          {item.cidade ? (
            <View style={cc.infoRow}>
              <Icon name="location-city" size={12} color={GOLD} type="material" />
              <Text style={[cc.infoText, { color:GOLD, fontWeight:'700' }]}>{item.cidade}</Text>
            </View>
          ) : null}
          {item.endereco ? (
            <View style={cc.infoRow}>
              <Icon name="location-on" size={12} color={SILVER_DARK} type="material" />
              <Text style={cc.infoText} numberOfLines={1}>{item.endereco}</Text>
            </View>
          ) : null}
          {item.telefone1 ? (
            <View style={cc.infoRow}>
              <Icon name="phone" size={12} color={SILVER_DARK} type="material" />
              <Text style={cc.infoText}>{item.contato1?`${item.contato1}: `:''}{item.telefone1}</Text>
            </View>
          ) : null}
          {item.telefone2 ? (
            <View style={cc.infoRow}>
              <Icon name="phone" size={12} color={SILVER_DARK} type="material" />
              <Text style={cc.infoText}>{item.contato2?`${item.contato2}: `:''}{item.telefone2}</Text>
            </View>
          ) : null}
          {item.cnpj ? (
            <View style={cc.infoRow}>
              <Icon name="business" size={12} color={SILVER_DARK} type="material" />
              <Text style={cc.infoText}>{item.cnpj}</Text>
            </View>
          ) : null}
          <View style={cc.infoRow}>
            <Icon name={temGPS?'gps-fixed':'gps-off'} size={12} color={temGPS?SUCCESS:SILVER_DARK+'80'} type="material" />
            <Text style={[cc.infoText, { color:temGPS?SUCCESS:SILVER_DARK+'80' }]}>
              {temGPS ? 'GPS salvo' : 'Sem GPS'}
            </Text>
          </View>
          {item.lembrete ? (
            <View style={[cc.infoRow, cc.lembreteRow]}>
              <Icon name="notifications-active" size={12} color={WARN} type="material" />
              <Text style={[cc.infoText, { color:WARN }]} numberOfLines={1}>{item.lembrete}</Text>
            </View>
          ) : null}
        </View>

        <View style={cc.footer}>
          <View style={cc.footerActions}>
            <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:BLUE+'18', borderColor:BLUE+'55' }]} onPress={onPress} activeOpacity={0.8}>
              <Icon name="open-in-new" size={14} color={BLUE} type="material" />
              <Text style={[cc.actionBtnText,{ color:BLUE }]}>Abrir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:GOLD+'18', borderColor:GOLD+'55' }]} onPress={onEditar} activeOpacity={0.8}>
              <Icon name="edit" size={14} color={GOLD} type="material" />
              <Text style={[cc.actionBtnText,{ color:GOLD }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[cc.actionBtn, cc.checkinBtn]} onPress={onCheckin} activeOpacity={0.8}>
              <Icon name="location-on" size={14} color={SUCCESS} type="material" />
              <Text style={cc.checkinBtnText}>Check-in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:'#C56BF020', borderColor:'#C56BF060' }]} onPress={onHistorico} activeOpacity={0.8}>
              <Icon name="history" size={14} color="#C56BF0" type="material" />
              <Text style={[cc.actionBtnText,{ color:'#C56BF0' }]}>Histórico</Text>
            </TouchableOpacity>
            {temGPS && (
              <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:WARN+'18', borderColor:WARN+'55' }]} onPress={() => onRota(item)} activeOpacity={0.8}>
                <Icon name="navigation" size={14} color={WARN} type="material" />
                <Text style={[cc.actionBtnText,{ color:WARN }]}>Rota</Text>
              </TouchableOpacity>
            )}
            {!temGPS && (
              <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:SUCCESS+'18', borderColor:SUCCESS+'55' }]} onPress={handleGPS} disabled={capturando} activeOpacity={0.8}>
                <Icon name={capturando?'gps-not-fixed':'add-location'} size={14} color={SUCCESS} type="material" />
                <Text style={[cc.actionBtnText,{ color:SUCCESS }]}>{capturando?'...':'GPS'}</Text>
              </TouchableOpacity>
            )}
            {temGPS && (
              <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:'#4285F420', borderColor:'#4285F460' }]}
                onPress={() => Share.share({ message:`📍 *${item.nome}*\n🗺️ https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}` })}>
                <Icon name="map" size={13} color="#4285F4" type="material" />
                <Text style={[cc.actionBtnText,{ color:'#4285F4' }]}>Maps</Text>
              </TouchableOpacity>
            )}
            {temGPS && (
              <TouchableOpacity style={[cc.actionBtn,{ backgroundColor:'#33CCFF20', borderColor:'#33CCFF60' }]}
                onPress={() => Linking.openURL(`waze://ul?ll=${item.latitude},${item.longitude}&navigate=yes`)}>
                <Icon name="directions-car" size={13} color="#33CCFF" type="material" />
                <Text style={[cc.actionBtnText,{ color:'#33CCFF' }]}>Waze</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const cc = StyleSheet.create({
  card         : { backgroundColor:CARD_BG, borderRadius:18, marginBottom:12, borderWidth:1, overflow:'hidden', shadowOffset:{width:0,height:4}, shadowOpacity:0.2, shadowRadius:10, elevation:6 },
  topBar       : { height:3, width:'100%' },
  header       : { flexDirection:'row', alignItems:'flex-start', padding:14, paddingBottom:10 },
  foto         : { width:44, height:44, borderRadius:14, marginRight:12, borderWidth:2 },
  iconWrap     : { width:44, height:44, borderRadius:14, justifyContent:'center', alignItems:'center', marginRight:12 },
  titleWrap    : { flex:1 },
  nome         : { fontSize:15, fontWeight:'bold', color:SILVER_LIGHT },
  tipo         : { fontSize:11, marginTop:2, textTransform:'capitalize' },
  fornRow      : { flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:5 },
  fornBadge    : { paddingHorizontal:6, paddingVertical:2, borderRadius:6, borderWidth:1 },
  fornText     : { fontSize:9, fontWeight:'700' },
  statusBadge  : { flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingVertical:4, borderRadius:10, borderWidth:1 },
  statusDot    : { width:6, height:6, borderRadius:3, marginRight:5 },
  statusText   : { fontSize:10, fontWeight:'700' },
  diasBadge    : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:9, borderWidth:1 },
  diasTxt      : { fontSize:10, fontWeight:'700' },
  iaBadge      : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:6, paddingVertical:3, borderRadius:8, borderWidth:1 },
  iaBadgeTxt   : { fontSize:9, fontWeight:'900' },
  iaBanner     : { flexDirection:'row', alignItems:'center', gap:6, marginHorizontal:14, marginBottom:6, paddingHorizontal:10, paddingVertical:5, borderRadius:8, borderWidth:1 },
  iaBannerTxt  : { fontSize:10, fontWeight:'700', flex:1 },
  divider      : { height:1, backgroundColor:'rgba(255,255,255,0.06)', marginHorizontal:14 },
  infoGrid     : { paddingHorizontal:14, paddingVertical:10 },
  infoRow      : { flexDirection:'row', alignItems:'center', marginBottom:4 },
  infoText     : { fontSize:12, color:SILVER_DARK, marginLeft:6, flex:1 },
  lembreteRow  : { backgroundColor:WARN+'10', borderRadius:8, padding:4, marginTop:2 },
  footer       : { paddingHorizontal:14, paddingVertical:10, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.06)' },
  footerActions: { flexDirection:'row', flexWrap:'wrap', gap:6 },
  actionBtn    : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:7, borderRadius:10, borderWidth:1 },
  actionBtnText: { fontSize:11, fontWeight:'700' },
  checkinBtn   : { backgroundColor:'#4CAF5018', borderColor:'#4CAF5060' },
  checkinBtnText:{ fontSize:11, fontWeight:'800', color:'#4CAF50', letterSpacing:0.3 },
});

const CIDADES_DF = [
  'Asa Norte','Asa Sul','Plano Piloto','Sobradinho','Planaltina','Gama',
  'Taguatinga','Ceilândia','Samambaia','Recanto das Emas','Santa Maria',
  'São Sebastião','Riacho Fundo','Vicente Pires','Guará','Águas Claras',
  'Sudoeste/Octogonal','Cruzeiro','Lago Norte','Lago Sul','Park Way',
  'Núcleo Bandeirante','Brazlândia','Itapoã','Sol Nascente','Fercal',
  'SCIA/Estrutural','Arniqueiras','Candangolândia','Varjão',
  'Luziânia','Valparaíso','Novo Gama','Cidade Ocidental','Formosa',
  'Planaltina-GO','Águas Lindas','Sto. Antônio do Descoberto',
  'Santo Antônio','Padre Bernardo','Alexânia','Cristalina',
  'Vila Paraíso-GO','Anápolis','Goiânia','Aparecida de Goiânia',
  'Trindade-GO','Senador Canedo','Outras',
];

const emptyForm = () => ({
  nome:'', cnpj:'', cep:'', foto:'',
  contato1:'', telefone1:'',
  contato2:'', telefone2:'',
  email:'', endereco:'', cidade:'',
  latitude:'', longitude:'',
  tipo:'loja', status:'ativo', observacoes:'',
  lembrete:'', proximaVisita:'', custoMedio:'',
  fornecedores:{ FORTLEV:false, AFORT:false, 'METAL TECK':false, 'TINTAS S.':false },
});

export default function ClientesScreen({ route, navigation }) {
  const [clientes,       setClientes]       = useState([]);
  const [visitas,        setVisitas]        = useState([]);
  const [modalVisible,   setModalVisible]   = useState(false);
  const [modalDetalhe,   setModalDetalhe]   = useState(false);
  const [clienteDetalhe, setClienteDetalhe] = useState(null);
  const [editingCliente, setEditingCliente] = useState(null);
  const [searchText,     setSearchText]     = useState('');
  const [filterTipo,     setFilterTipo]     = useState('todos');
  const [filterStatus,   setFilterStatus]   = useState('todos');
  const [filterCidade,   setFilterCidade]   = useState('');
  const [loading,        setLoading]        = useState(false);
  const [buscandoCEP,    setBuscandoCEP]    = useState(false);
  const [gpsTag,         setGpsTag]         = useState(false);
  const [exportando,     setExportando]     = useState(false);
  const [formData,       setFormData]       = useState(emptyForm());
  const [visitaCliente,  setVisitaCliente]  = useState(null);
  const [reposicaoIds,   setReposicaoIds]   = useState(new Set());

  const headerAnim = useRef(new Animated.Value(0)).current;

  const visitasPorCliente = useMemo(() => {
    const mapa = {};
    visitas.forEach(v => {
      if (!mapa[v.clienteId]) mapa[v.clienteId] = [];
      mapa[v.clienteId].push(v);
    });
    Object.values(mapa).forEach(arr => arr.sort((a,b) => new Date(b.dataLocal||0) - new Date(a.dataLocal||0)));
    return mapa;
  }, [visitas]);

  const clientesRicos = useMemo(() => {
    const base = enriquecerClientes(clientes, visitasPorCliente);
    return base.map(c => {
      const ai = calcularPrioridadeClienteIA(c, visitas, []);
      return { ...c, aiScore: ai.score, aiMotivos: ai.motivos, aiEmCicloReposicao: ai.emCicloReposicao };
    });
  }, [clientes, visitasPorCliente, visitas]);

  const filteredClientes   = useMemo(() =>
    filtrarClientes(clientesRicos, { searchText, filterTipo, filterStatus, filterCidade, reposicaoIds }),
    [clientesRicos, searchText, filterTipo, filterStatus, filterCidade, reposicaoIds]
  );
  const cidadesDisponiveis = useMemo(() => {
    const set = new Set(clientes.map(c => c.cidade).filter(Boolean));
    return Array.from(set).sort();
  }, [clientes]);

  useEffect(() => {
    Animated.timing(headerAnim, { toValue:1, duration:800, useNativeDriver:true }).start();
    loadClientes();
    loadVisitas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clientes.length || !visitas.length) return;
    const reps = detectarOportunidadesIA(clientes, visitas, 100);
    setReposicaoIds(new Set(reps.map(r => r.id)));
  }, [clientes, visitas]);

  useEffect(() => {
    if (!route?.params) return;
    const { abrirModalGPS, latitude, longitude, endereco, openCliente } = route.params;
    if (abrirModalGPS) {
      const f = emptyForm();
      f.endereco  = endereco  || '';
      f.latitude  = latitude  || '';
      f.longitude = longitude || '';
      setFormData(f); setEditingCliente(null); setGpsTag(true); setModalVisible(true);
      navigation?.setParams({ abrirModalGPS:false });
    }
    if (openCliente) {
      const c = clientes.find(x => x.id === openCliente);
      if (c) { setClienteDetalhe(c); setModalDetalhe(true); }
      navigation?.setParams({ openCliente:null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params, clientes]);

  const loadClientes = async () => {
    try { setClientes(await getClientes()); }
    catch(e) { console.log('Erro clientes:', e); }
  };

  const loadVisitas = async () => {
    try {
      const [visitasRaw, checkins] = await Promise.all([getVisitas(), getCheckins()]);
      const todas = [
        ...visitasRaw,
        ...checkins.map(ck => ({
          id           : ck.id,
          clienteId    : ck.clienteId,
          dataLocal    : ck.data || ck.dataLocal || ck.dataISO || '',
          resultado    : ck.comprou ? 'comprou' : (ck.resultado || 'naocomprou'),
          comprou      : !!ck.comprou,
          valor        : ck.valor || 0,
          produtos     : ck.produtos || [],
          tipoRegistro : ck.tipoRegistro || 'visita',
          fotoUrl      : ck.fotoUrl || null,
          observacao   : ck.observacao || '',
          _origem      : 'checkin',
        })),
      ];
      todas.sort((a,b) => new Date(b.dataLocal||0) - new Date(a.dataLocal||0));
      setVisitas(todas);
    } catch(e) { console.log('Erro visitas:', e); }
  };

  const salvarCliente = async () => {
    if (!formData.nome) { Alert.alert('Erro','Nome é obrigatório'); return; }
    setLoading(true);
    try {
      if (editingCliente) {
        await updateCliente(editingCliente.id, { ...formData });
        Alert.alert('✅ Sucesso','Cliente atualizado!');
      } else {
        await addCliente({ ...formData });
        Alert.alert('✅ Sucesso','Cliente cadastrado!');
      }
      setModalVisible(false); resetForm(); loadClientes();
    } catch(e) { Alert.alert('Erro','Não foi possível salvar'); }
    finally { setLoading(false); }
  };

  const deleteCliente = (id) => {
    Alert.alert('Confirmar exclusão','Deseja excluir este cliente?', [
      { text:'Cancelar', style:'cancel' },
      { text:'Excluir', style:'destructive', onPress: async () => {
        await removerCliente(id); setModalVisible(false); loadClientes();
      }},
    ]);
  };

  const capturarGPSDoCard = async (cliente, latitude, longitude, endereco) => {
    try {
      const dados = { latitude, longitude };
      if (endereco && !cliente.endereco) dados.endereco = endereco;
      await updateCliente(cliente.id, dados);
      setClientes(prev => prev.map(c => c.id===cliente.id ? { ...c, ...dados } : c));
      Alert.alert('📍 GPS Salvo!',`Localização de "${cliente.nome}" salva.`);
    } catch(e) { Alert.alert('Erro','Não foi possível salvar a localização.'); }
  };

  const capturarGPSModal = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada','Ative a localização.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy:Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let endereco = formData.endereco;
      if (!endereco) {
        try {
          const addr = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (addr?.length > 0) {
            const a = addr[0];
            endereco = [a.street,a.streetNumber,a.district||a.subregion,a.city,a.region].filter(Boolean).join(', ');
          }
        } catch(e) {}
      }
      setFormData(prev => ({ ...prev, latitude:latitude.toString(), longitude:longitude.toString(), endereco }));
      Alert.alert('📍 GPS capturado!',`Lat: ${latitude.toFixed(5)}\nLng: ${longitude.toFixed(5)}`);
    } catch(e) { Alert.alert('Erro','Não foi possível capturar a localização.'); }
  };

  const handleBuscarCEP = async () => {
    if (!formData.cep || formData.cep.replace(/\D/g,'').length !== 8) {
      Alert.alert('CEP inválido','Digite um CEP com 8 dígitos.');
      return;
    }
    setBuscandoCEP(true);
    try {
      const resultado = await buscarCEP(formData.cep);
      if (!resultado) { Alert.alert('CEP não encontrado','Verifique o CEP digitado.'); return; }
      setFormData(prev => ({
        ...prev,
        endereco: resultado.endereco || prev.endereco,
        cidade  : resultado.cidade   || prev.cidade,
      }));
      Alert.alert('✅ Endereço encontrado!',`${resultado.endereco}\n${resultado.cidade} - ${resultado.uf}`);
    } catch(e) {
      Alert.alert('Erro','Não foi possível buscar o CEP.');
    } finally {
      setBuscandoCEP(false);
    }
  };

  const selecionarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada','Precisamos de acesso à galeria.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[1,1], quality:0.7 });
      if (!result.canceled && result.assets?.[0]?.uri)
        setFormData(prev => ({ ...prev, foto:result.assets[0].uri }));
    } catch(e) { Alert.alert('Erro','Não foi possível selecionar a foto.'); }
  };

  const tirarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada','Precisamos de acesso à câmera.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing:true, aspect:[1,1], quality:0.7 });
      if (!result.canceled && result.assets?.[0]?.uri)
        setFormData(prev => ({ ...prev, foto:result.assets[0].uri }));
    } catch(e) { Alert.alert('Erro','Não foi possível abrir a câmera.'); }
  };

  const toggleFornecedor = (f) =>
    setFormData(prev => ({ ...prev, fornecedores:{ ...prev.fornecedores, [f]:!prev.fornecedores?.[f] } }));

  const resetForm    = () => { setFormData(emptyForm()); setEditingCliente(null); setGpsTag(false); };
  const abrirEdicao  = (item) => {
    const f = { ...emptyForm(), ...item, fornecedores:{ ...emptyForm().fornecedores, ...(item.fornecedores||{}) } };
    setFormData(f); setEditingCliente(item); setModalVisible(true);
  };
  const abrirDetalhe = (item) => {
    if (navigation?.navigate) {
      navigation.navigate('ClienteDetalhe', { cliente: item });
    } else {
      setClienteDetalhe(item); setModalDetalhe(true);
    }
  };
  const abrirRota    = (item) => {
    if (item.latitude && item.longitude)
      Linking.openURL(`waze://ul?ll=${item.latitude},${item.longitude}&navigate=yes`);
  };

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const lista = filteredClientes;
      const dataGeracao = new Date().toLocaleDateString('pt-BR');
      const linhas = lista.map((c, i) => {
        const forn = FORNECEDORES.filter(f => c.fornecedores?.[f]).join(', ') || '—';
        return `<tr style="background:${i%2===0?'#f8f9fa':'#fff'}">
          <td>${c.nome||'—'}</td><td>${c.tipo||'—'}</td><td>${c.status||'—'}</td>
          <td>${c.cidade||'—'}</td>
          <td>${c.ultimaCompra?new Date(c.ultimaCompra.dataLocal).toLocaleDateString('pt-BR'):'—'}</td>
          <td>${c.diasSemCompra!=null?c.diasSemCompra+'d':'—'}</td>
          <td>${c.telefone1||'—'}</td><td>${forn}</td>
        </tr>`;
      }).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
        <style>body{font-family:Arial;margin:20px}h1{color:#001E2E}table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#001E2E;color:#E8B432;padding:8px;text-align:left}td{padding:7px;border-bottom:1px solid #eee}</style>
        </head><body><h1>📋 Lista de Clientes — MAYA Representações</h1>
        <p>Gerado em ${dataGeracao} · ${lista.length} cliente(s)</p>
        <table><thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Cidade</th><th>Última Compra</th><th>Dias s/ Compra</th><th>Telefone</th><th>Fornecimento</th></tr></thead>
        <tbody>${linhas}</tbody></table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64:false });
      await Sharing.shareAsync(uri, { mimeType:'application/pdf', dialogTitle:'Exportar lista de clientes' });
    } catch(e) { Alert.alert('Erro','Não foi possível gerar o PDF.'); }
    finally { setExportando(false); }
  };

  const totalAtivos     = clientes.filter(c => c.status==='ativo').length;
  const totalPotenciais = clientes.filter(c => c.status==='potencial').length;
  const totalSemCompra  = clientesRicos.filter(c => c.diasSemCompra != null && c.diasSemCompra >= 15).length;
  const qtdReposicao    = reposicaoIds.size;

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      <Animated.View style={[ds.header, {
        opacity:headerAnim,
        transform:[{ translateY:headerAnim.interpolate({ inputRange:[0,1], outputRange:[-20,0] }) }],
      }]}>
        <View style={ds.headerTop}>
          <View>
            <Text style={ds.headerTitle}>Clientes</Text>
            <Text style={ds.headerSub}>{filteredClientes.length} de {clientes.length} exibidos</Text>
          </View>
          <TouchableOpacity style={ds.pdfBtn} onPress={exportarPDF} disabled={exportando} activeOpacity={0.8}>
            <Icon name="picture-as-pdf" size={16} color={DARK_BG} type="material" />
            <Text style={ds.pdfBtnText}>{exportando ? '...' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
        <ShimmerLine color={GOLD} />
        <View style={ds.kpiBar}>
          {[
            { label:'Total',          value:clientes.length,  gold:true  },
            { label:'Ativos',         value:totalAtivos,      gold:false },
            { label:'Potenciais',     value:totalPotenciais,  gold:true  },
            { label:'≥15d s/ compra', value:totalSemCompra,   gold:false, color:DANGER },
          ].map((k, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={ds.kpiDiv} />}
              <View style={ds.kpiItem}>
                <Text style={[ds.kpiVal, { color:k.color||(k.gold?GOLD:SILVER) }]}>{k.value}</Text>
                <Text style={ds.kpiLabel}>{k.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </Animated.View>

      <View style={ds.searchWrap}>
        <SearchBar value={searchText} onChangeText={setSearchText} placeholder="Buscar por nome, telefone ou cidade..." />
      </View>

      <FiltroClientes
        filterTipo={filterTipo}
        filterStatus={filterStatus}
        filterCidade={filterCidade}
        cidades={cidadesDisponiveis}
        qtdReposicao={qtdReposicao}
        onTipo={setFilterTipo}
        onStatus={setFilterStatus}
        onCidade={setFilterCidade}
      />

      <FlatList
        data={filteredClientes}
        renderItem={({ item }) => (
          <ClienteCard
            item={item}
            onPress={()    => abrirDetalhe(item)}
            onEditar={()   => abrirEdicao(item)}
            onCapturarGPS={capturarGPSDoCard}
            onCheckin={()  => setVisitaCliente(item)}
            onHistorico={()=> navigation.navigate('HistoricoCliente', { cliente:item })}
            onRota={abrirRota}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={ds.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={ds.emptyWrap}>
            <Icon name="people-outline" size={56} color={GOLD+'40'} type="material" />
            <Text style={ds.emptyTitle}>Nenhum cliente encontrado</Text>
            <Text style={ds.emptySub}>
              {searchText||filterTipo!=='todos'||filterStatus!=='todos'||filterCidade
                ? 'Tente outros filtros' : 'Toque no + para adicionar'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={ds.fab} onPress={() => { resetForm(); setModalVisible(true); }} activeOpacity={0.85}>
        <Icon name="add" size={28} color={DARK_BG} type="material" />
      </TouchableOpacity>

      {/* MODAL DETALHE */}
      <Modal visible={modalDetalhe} animationType="slide" transparent onRequestClose={() => setModalDetalhe(false)}>
        <View style={ms.overlay}>
          <View style={[ms.sheet, { maxHeight:'88%' }]}>
            <View style={ms.header}>
              <View style={ms.headerLeft}>
                {clienteDetalhe && (
                  <View style={[ms.headerIcon, { backgroundColor:getTipoColor(clienteDetalhe?.tipo)?.main||GOLD }]}>
                    <Icon name={getTipoIcon(clienteDetalhe?.tipo)} size={20} color={DARK_BG} type="material" />
                  </View>
                )}
                <View>
                  <Text style={ms.headerTitle} numberOfLines={1}>{clienteDetalhe?.nome}</Text>
                  <Text style={{ fontSize:11, color:SILVER_DARK, marginTop:1 }}>{clienteDetalhe?.tipo} · {clienteDetalhe?.status}</Text>
                </View>
              </View>
              <TouchableOpacity style={ms.closeBtn} onPress={() => setModalDetalhe(false)}>
                <Icon name="close" size={20} color={SILVER} type="material" />
              </TouchableOpacity>
            </View>
            <ShimmerLine color={getTipoColor(clienteDetalhe?.tipo)?.main || GOLD} />
            <ScrollView style={ms.body} showsVerticalScrollIndicator={false}>
              <View style={det.resumoRow}>
                <View style={[det.resumoItem, { borderColor:SUCCESS+'30' }]}>
                  <Icon name="receipt" size={18} color={SUCCESS} type="material" />
                  <Text style={det.resumoVal}>
                    {clienteDetalhe?.ultimaCompra ? new Date(clienteDetalhe.ultimaCompra.dataLocal).toLocaleDateString('pt-BR') : '—'}
                  </Text>
                  <Text style={det.resumoLabel}>Última compra</Text>
                </View>
                <View style={[det.resumoItem, { borderColor:(clienteDetalhe?.diasSemCompra>=30?DANGER:WARN)+'30' }]}>
                  <Icon name="schedule" size={18} color={clienteDetalhe?.diasSemCompra>=30?DANGER:WARN} type="material" />
                  <Text style={[det.resumoVal, { color:clienteDetalhe?.diasSemCompra>=30?DANGER:clienteDetalhe?.diasSemCompra>=15?WARN:SUCCESS }]}>
                    {clienteDetalhe?.diasSemCompra != null ? `${clienteDetalhe.diasSemCompra} dias` : '—'}
                  </Text>
                  <Text style={det.resumoLabel}>Sem compra</Text>
                </View>
                <View style={[det.resumoItem, { borderColor:BLUE+'30' }]}>
                  <Icon name="history" size={18} color={BLUE} type="material" />
                  <Text style={det.resumoVal}>{(visitasPorCliente[clienteDetalhe?.id]||[]).length}</Text>
                  <Text style={det.resumoLabel}>Visitas total</Text>
                </View>
              </View>
              {[
                { label:'Cidade',       icon:'location-city',        val:clienteDetalhe?.cidade,        color:GOLD        },
                { label:'Endereço',     icon:'location-on',          val:clienteDetalhe?.endereco,      color:SILVER_DARK },
                { label:'Telefone 1',   icon:'phone',                val:clienteDetalhe?.telefone1,     color:SILVER_DARK },
                { label:'Telefone 2',   icon:'phone',                val:clienteDetalhe?.telefone2,     color:SILVER_DARK },
                { label:'Email',        icon:'email',                val:clienteDetalhe?.email,         color:BLUE        },
                { label:'CNPJ',         icon:'business',             val:clienteDetalhe?.cnpj,          color:SILVER_DARK },
                { label:'Lembrete',     icon:'notifications-active', val:clienteDetalhe?.lembrete,      color:WARN        },
                { label:'Próx. visita', icon:'event',                val:clienteDetalhe?.proximaVisita, color:GOLD        },
              ].filter(x => x.val).map(x => (
                <View key={x.label} style={det.infoRow}>
                  <Icon name={x.icon} size={14} color={x.color} type="material" />
                  <View style={{ flex:1, marginLeft:10 }}>
                    <Text style={det.infoLabel}>{x.label}</Text>
                    <Text style={[det.infoVal, { color:x.color }]}>{x.val}</Text>
                  </View>
                </View>
              ))}
              <View style={det.acoesRow}>
                <TouchableOpacity style={[det.acaoBtn,{ backgroundColor:GOLD+'20', borderColor:GOLD+'50' }]}
                  onPress={() => { setModalDetalhe(false); abrirEdicao(clienteDetalhe); }} activeOpacity={0.8}>
                  <Icon name="edit" size={16} color={GOLD} type="material" />
                  <Text style={[det.acaoBtnTxt,{ color:GOLD }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[det.acaoBtn,{ backgroundColor:SUCCESS+'20', borderColor:SUCCESS+'50' }]}
                  onPress={() => { setModalDetalhe(false); setVisitaCliente(clienteDetalhe); }} activeOpacity={0.8}>
                  <Icon name="location-on" size={16} color={SUCCESS} type="material" />
                  <Text style={[det.acaoBtnTxt,{ color:SUCCESS }]}>Check-in</Text>
                </TouchableOpacity>
                {clienteDetalhe?.latitude && clienteDetalhe?.longitude && (
                  <TouchableOpacity style={[det.acaoBtn,{ backgroundColor:WARN+'20', borderColor:WARN+'50' }]}
                    onPress={() => { setModalDetalhe(false); abrirRota(clienteDetalhe); }} activeOpacity={0.8}>
                    <Icon name="navigation" size={16} color={WARN} type="material" />
                    <Text style={[det.acaoBtnTxt,{ color:WARN }]}>Rota</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ height:30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL CADASTRO/EDIÇÃO */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={ms.overlay}>
          <View style={ms.sheet}>
            <View style={ms.header}>
              <View style={ms.headerLeft}>
                <View style={[ms.headerIcon, gpsTag && { backgroundColor:SUCCESS }]}>
                  <Icon name={gpsTag?'gps-fixed':editingCliente?'edit':'person-add'} size={20} color={DARK_BG} type="material" />
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
            <ShimmerLine color={gpsTag?SUCCESS:GOLD} />

            <ScrollView style={ms.body} showsVerticalScrollIndicator={false}>
              {gpsTag && (
                <View style={ms.gpsBanner}>
                  <Icon name="gps-fixed" size={18} color={SUCCESS} type="material" />
                  <View style={{ flex:1, marginLeft:10 }}>
                    <Text style={ms.gpsBannerTitle}>Localização GPS capturada!</Text>
                    <Text style={ms.gpsBannerSub}>{formData.latitude?`Lat: ${parseFloat(formData.latitude).toFixed(5)}  Lng: ${parseFloat(formData.longitude).toFixed(5)}`:'—'}</Text>
                  </View>
                  <Icon name="check-circle" size={20} color={SUCCESS} type="material" />
                </View>
              )}

              <Text style={ms.label}>Foto do Cliente</Text>
              <View style={ms.fotoRow}>
                {formData.foto
                  ? <Image source={{ uri:formData.foto }} style={ms.fotoPreview} />
                  : <View style={ms.fotoPlaceholder}><Icon name="person" size={32} color={SILVER_DARK} type="material" /></View>
                }
                <View style={ms.fotoBtns}>
                  <TouchableOpacity style={ms.fotoBtn} onPress={selecionarFoto} activeOpacity={0.8}>
                    <Icon name="photo-library" size={16} color={GOLD} type="material" />
                    <Text style={ms.fotoBtnText}>Galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[ms.fotoBtn,{ borderColor:SILVER+'40' }]} onPress={tirarFoto} activeOpacity={0.8}>
                    <Icon name="camera-alt" size={16} color={SILVER} type="material" />
                    <Text style={[ms.fotoBtnText,{ color:SILVER }]}>Câmera</Text>
                  </TouchableOpacity>
                  {formData.foto && (
                    <TouchableOpacity style={[ms.fotoBtn,{ borderColor:DANGER+'50' }]} onPress={() => setFormData(p => ({ ...p, foto:'' }))} activeOpacity={0.8}>
                      <Icon name="delete" size={16} color={DANGER} type="material" />
                      <Text style={[ms.fotoBtnText,{ color:DANGER }]}>Remover</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Text style={ms.label}>Nome *</Text>
              <View style={ms.inputWrap}>
                <Icon name="person" size={16} color={SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="Nome completo" placeholderTextColor={SILVER_DARK} value={formData.nome} onChangeText={t => setFormData(p => ({ ...p, nome:t }))} />
              </View>

              <Text style={ms.label}>CNPJ</Text>
              <View style={ms.inputWrap}>
                <Icon name="business" size={16} color={SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="00.000.000/0000-00" placeholderTextColor={SILVER_DARK} value={formData.cnpj} onChangeText={t => setFormData(p => ({ ...p, cnpj:t }))} keyboardType="numeric" />
              </View>

              <Text style={ms.label}>CEP</Text>
              <View style={ms.inputWrap}>
                <Icon name="local-post-office" size={16} color={SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput
                  style={[ms.input, { flex:1 }]}
                  placeholder="00000-000"
                  placeholderTextColor={SILVER_DARK}
                  value={formData.cep}
                  onChangeText={t => setFormData(p => ({ ...p, cep:t }))}
                  keyboardType="numeric"
                  maxLength={9}
                />
                <TouchableOpacity
                  style={[ms.cepBtn, buscandoCEP && { opacity:0.6 }]}
                  onPress={handleBuscarCEP}
                  disabled={buscandoCEP}
                  activeOpacity={0.8}>
                  {buscandoCEP
                    ? <ActivityIndicator size="small" color={DARK_BG} />
                    : <Icon name="search" size={14} color={DARK_BG} type="material" />}
                  <Text style={ms.cepBtnTxt}>{buscandoCEP ? '...' : 'Buscar'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={ms.label}>Contato 1</Text>
              <View style={ms.inputRow}>
                <View style={[ms.inputWrap,{ flex:1 }]}>
                  <Icon name="person-outline" size={14} color={SILVER_DARK} style={{ marginRight:6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Nome" placeholderTextColor={SILVER_DARK} value={formData.contato1} onChangeText={t => setFormData(p => ({ ...p, contato1:t }))} />
                </View>
                <View style={[ms.inputWrap,{ flex:1 }]}>
                  <Icon name="phone" size={14} color={SILVER_DARK} style={{ marginRight:6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Telefone" placeholderTextColor={SILVER_DARK} value={formData.telefone1} onChangeText={t => setFormData(p => ({ ...p, telefone1:t }))} keyboardType="phone-pad" />
                </View>
              </View>

              <Text style={ms.label}>Contato 2</Text>
              <View style={ms.inputRow}>
                <View style={[ms.inputWrap,{ flex:1 }]}>
                  <Icon name="person-outline" size={14} color={SILVER_DARK} style={{ marginRight:6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Nome" placeholderTextColor={SILVER_DARK} value={formData.contato2} onChangeText={t => setFormData(p => ({ ...p, contato2:t }))} />
                </View>
                <View style={[ms.inputWrap,{ flex:1 }]}>
                  <Icon name="phone" size={14} color={SILVER_DARK} style={{ marginRight:6 }} type="material" />
                  <TextInput style={ms.input} placeholder="Telefone" placeholderTextColor={SILVER_DARK} value={formData.telefone2} onChangeText={t => setFormData(p => ({ ...p, telefone2:t }))} keyboardType="phone-pad" />
                </View>
              </View>

              <Text style={ms.label}>Email</Text>
              <View style={ms.inputWrap}>
                <Icon name="email" size={16} color={SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="email@exemplo.com" placeholderTextColor={SILVER_DARK} value={formData.email} onChangeText={t => setFormData(p => ({ ...p, email:t }))} keyboardType="email-address" autoCapitalize="none" />
              </View>

              <Text style={ms.label}>Endereço</Text>
              <View style={[ms.inputWrap, gpsTag && { borderColor:SUCCESS+'60', backgroundColor:SUCCESS+'10' }]}>
                <Icon name="location-on" size={16} color={gpsTag?SUCCESS:SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="Preenchido pelo CEP ou manualmente" placeholderTextColor={SILVER_DARK} value={formData.endereco} onChangeText={t => setFormData(p => ({ ...p, endereco:t }))} />
              </View>

              <Text style={ms.label}>Cidade</Text>
              <View style={ms.inputWrap}>
                <Icon name="location-city" size={16} color={SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="Preenchida pelo CEP ou selecione abaixo" placeholderTextColor={SILVER_DARK} value={formData.cidade} onChangeText={t => setFormData(p => ({ ...p, cidade:t }))} />
                {formData.cidade ? (
                  <TouchableOpacity onPress={() => setFormData(p => ({ ...p, cidade:'' }))}>
                    <Icon name="clear" size={16} color={SILVER_DARK} type="material" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical:8, gap:6, flexDirection:'row' }}>
                {CIDADES_DF.map(c => (
                  <TouchableOpacity key={c}
                    style={[ms.cidadeChip, formData.cidade===c && ms.cidadeChipAtivo]}
                    onPress={() => setFormData(p => ({ ...p, cidade:p.cidade===c?'':c }))} activeOpacity={0.8}>
                    <Text style={[ms.cidadeChipTxt, formData.cidade===c && ms.cidadeChipTxtAtivo]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={ms.gpsModalBtn} onPress={capturarGPSModal} activeOpacity={0.8}>
                <Icon name="my-location" size={16} color={SUCCESS} type="material" />
                <Text style={ms.gpsModalBtnText}>
                  {formData.latitude
                    ? `📍 GPS: ${parseFloat(formData.latitude).toFixed(4)}, ${parseFloat(formData.longitude).toFixed(4)} — Atualizar`
                    : '📍 Capturar localização atual'}
                </Text>
              </TouchableOpacity>

              <Text style={ms.label}>Tipo de Cliente</Text>
              <View style={ms.optionsRow}>
                {['loja','obra','distribuidor'].map(t => (
                  <OptionChip key={t} label={t} active={formData.tipo===t} onPress={() => setFormData(p => ({ ...p, tipo:t }))} />
                ))}
              </View>

              <Text style={ms.label}>Status</Text>
              <View style={ms.optionsRow}>
                {['ativo','inativo','potencial'].map(s => (
                  <OptionChip key={s} label={s} active={formData.status===s} onPress={() => setFormData(p => ({ ...p, status:s }))} />
                ))}
              </View>

              <Text style={ms.label}>Fornecimento Atual</Text>
              <View style={ms.fornGrid}>
                {FORNECEDORES.map(f => {
                  const ativo = formData.fornecedores?.[f];
                  return (
                    <TouchableOpacity key={f} style={[ms.fornItem, ativo && ms.fornItemActive]} onPress={() => toggleFornecedor(f)} activeOpacity={0.8}>
                      <View style={[ms.fornCheck, ativo && { backgroundColor:GOLD, borderColor:GOLD }]}>
                        {ativo && <Icon name="check" size={12} color={DARK_BG} type="material" />}
                      </View>
                      <Text style={[ms.fornLabel, ativo && { color:GOLD }]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={ms.label}>Observações</Text>
              <View style={[ms.inputWrap,{ alignItems:'flex-start', paddingTop:10 }]}>
                <TextInput style={[ms.input,{ height:70, textAlignVertical:'top' }]} placeholder="Anotações sobre o cliente..." placeholderTextColor={SILVER_DARK} value={formData.observacoes} onChangeText={t => setFormData(p => ({ ...p, observacoes:t }))} multiline numberOfLines={3} />
              </View>

              <View style={ms.sectionDivider}>
                <Icon name="notifications-active" size={14} color={WARN} type="material" />
                <Text style={[ms.sectionDividerText,{ color:WARN }]}>Lembretes & Custos</Text>
              </View>

              <Text style={ms.label}>📅 Próxima Visita</Text>
              <View style={ms.inputWrap}>
                <Icon name="event" size={16} color={SILVER_DARK} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="dd/mm/aaaa" placeholderTextColor={SILVER_DARK} value={formData.proximaVisita} onChangeText={t => setFormData(p => ({ ...p, proximaVisita:t }))} keyboardType="numeric" />
              </View>

              <Text style={ms.label}>🔔 Lembrete</Text>
              <View style={[ms.inputWrap,{ alignItems:'flex-start', paddingTop:10 }]}>
                <Icon name="sticky-note-2" size={16} color={SILVER_DARK} style={{ marginRight:8, marginTop:2 }} type="material" />
                <TextInput style={[ms.input,{ height:60, textAlignVertical:'top' }]} placeholder="Ex: Ligar antes de visitar, trazer catálogo..." placeholderTextColor={SILVER_DARK} value={formData.lembrete} onChangeText={t => setFormData(p => ({ ...p, lembrete:t }))} multiline numberOfLines={2} />
              </View>

              <Text style={ms.label}>💰 Custo Médio de Visita (R$)</Text>
              <View style={ms.inputWrap}>
                <Icon name="attach-money" size={16} color={SUCCESS} style={{ marginRight:8 }} type="material" />
                <TextInput style={ms.input} placeholder="0,00" placeholderTextColor={SILVER_DARK} value={formData.custoMedio} onChangeText={t => setFormData(p => ({ ...p, custoMedio:t }))} keyboardType="numeric" />
              </View>

              <TouchableOpacity style={[ms.saveBtn, loading && { opacity:0.7 }]} onPress={salvarCliente} disabled={loading} activeOpacity={0.85}>
                <Icon name={editingCliente?'save':'person-add'} size={18} color={DARK_BG} style={{ marginRight:8 }} type="material" />
                <Text style={ms.saveBtnText}>{loading ? 'Salvando...' : editingCliente ? 'ATUALIZAR CLIENTE' : 'CADASTRAR CLIENTE'}</Text>
              </TouchableOpacity>

              {editingCliente && (
                <TouchableOpacity style={ms.deleteBtn} onPress={() => deleteCliente(editingCliente.id)} activeOpacity={0.8}>
                  <Icon name="delete-forever" size={18} color={DANGER} style={{ marginRight:8 }} type="material" />
                  <Text style={ms.deleteBtnText}>EXCLUIR CLIENTE</Text>
                </TouchableOpacity>
              )}
              <View style={{ height:40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <VisitaModal
        visible={!!visitaCliente}
        cliente={visitaCliente}
        onClose={() => setVisitaCliente(null)}
        onSaved={() => {
          const nomeCliente = visitaCliente?.nome || '';
          setVisitaCliente(null);
          Alert.alert('✅ Check-in registrado!',`Visita a "${nomeCliente}" salva.`);
          loadVisitas();
        }}
      />
    </View>
  );
}

const det = StyleSheet.create({
  resumoRow  : { flexDirection:'row', gap:8, marginBottom:16 },
  resumoItem : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:12, padding:12, borderWidth:1, gap:4 },
  resumoVal  : { fontSize:14, fontWeight:'bold', color:SILVER_LIGHT },
  resumoLabel: { fontSize:9, color:SILVER_DARK, textAlign:'center' },
  infoRow    : { flexDirection:'row', alignItems:'flex-start', backgroundColor:CARD_BG, borderRadius:10, padding:12, marginBottom:6 },
  infoLabel  : { fontSize:9, color:SILVER_DARK, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 },
  infoVal    : { fontSize:13, fontWeight:'600' },
  acoesRow   : { flexDirection:'row', gap:8, marginTop:8, marginBottom:6 },
  acaoBtn    : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:12, borderRadius:12, borderWidth:1 },
  acaoBtnTxt : { fontSize:12, fontWeight:'700' },
});

const ds = StyleSheet.create({
  container  : { flex:1, backgroundColor:DARK_BG },
  header     : { backgroundColor:'#001828', paddingBottom:16, borderBottomLeftRadius:28, borderBottomRightRadius:28, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.18, shadowRadius:14, elevation:10 },
  headerTop  : { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingTop:20, paddingBottom:12 },
  headerTitle: { fontSize:26, fontWeight:'bold', color:SILVER_LIGHT, letterSpacing:0.5 },
  headerSub  : { fontSize:12, color:SILVER_DARK, marginTop:2 },
  pdfBtn     : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:GOLD, paddingHorizontal:14, paddingVertical:8, borderRadius:12 },
  pdfBtnText : { fontSize:12, fontWeight:'bold', color:DARK_BG },
  kpiBar     : { flexDirection:'row', marginHorizontal:20, marginTop:12, backgroundColor:'rgba(255,255,255,0.05)', borderRadius:14, paddingVertical:10, borderWidth:1, borderColor:GOLD+'20' },
  kpiItem    : { flex:1, alignItems:'center' },
  kpiVal     : { fontSize:12, fontWeight:'bold' },
  kpiLabel   : { fontSize:9, color:SILVER_DARK, marginTop:1, letterSpacing:0.3, textAlign:'center' },
  kpiDiv     : { width:1, backgroundColor:SILVER+'20' },
  searchWrap : { paddingHorizontal:16, paddingTop:14, paddingBottom:6 },
  list       : { paddingHorizontal:16, paddingBottom:100, paddingTop:8 },
  emptyWrap  : { paddingTop:60, alignItems:'center' },
  emptyTitle : { fontSize:16, fontWeight:'bold', color:SILVER, marginTop:16 },
  emptySub   : { fontSize:12, color:SILVER_DARK, marginTop:6 },
  fab        : { position:'absolute', bottom:24, right:20, width:58, height:58, borderRadius:29, backgroundColor:GOLD, justifyContent:'center', alignItems:'center', elevation:10 },
});

const ms = StyleSheet.create({
  overlay           : { flex:1, backgroundColor:'rgba(0,0,0,0.75)', justifyContent:'flex-end' },
  sheet             : { backgroundColor:MODAL_BG, borderTopLeftRadius:28, borderTopRightRadius:28, maxHeight:'94%', overflow:'hidden', borderTopWidth:1, borderColor:GOLD+'30' },
  header            : { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:18 },
  headerLeft        : { flexDirection:'row', alignItems:'center' },
  headerIcon        : { width:36, height:36, borderRadius:12, backgroundColor:GOLD, justifyContent:'center', alignItems:'center', marginRight:12 },
  headerTitle       : { fontSize:18, fontWeight:'bold', color:SILVER_LIGHT },
  closeBtn          : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  body              : { paddingHorizontal:20, paddingTop:16 },
  label             : { fontSize:11, fontWeight:'700', color:SILVER_DARK, letterSpacing:0.8, marginBottom:6, marginTop:14, textTransform:'uppercase' },
  inputWrap         : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG, borderRadius:12, paddingHorizontal:14, paddingVertical:4, borderWidth:1, borderColor:SILVER+'25', marginBottom:4 },
  inputRow          : { flexDirection:'row', gap:8, marginBottom:4 },
  input             : { flex:1, fontSize:14, color:SILVER_LIGHT, paddingVertical:10 },
  optionsRow        : { flexDirection:'row', marginBottom:4 },
  cepBtn            : { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:GOLD, borderRadius:9, paddingHorizontal:10, paddingVertical:7 },
  cepBtnTxt         : { fontSize:11, fontWeight:'800', color:DARK_BG },
  fotoRow           : { flexDirection:'row', alignItems:'center', gap:14, marginBottom:4 },
  fotoPreview       : { width:72, height:72, borderRadius:16, borderWidth:2, borderColor:GOLD },
  fotoPlaceholder   : { width:72, height:72, borderRadius:16, backgroundColor:CARD_BG, borderWidth:1, borderColor:SILVER+'30', justifyContent:'center', alignItems:'center' },
  fotoBtns          : { flex:1, gap:8 },
  fotoBtn           : { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:GOLD+'18', borderRadius:10, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:GOLD+'50' },
  fotoBtnText       : { fontSize:12, fontWeight:'600', color:GOLD },
  gpsModalBtn       : { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:SUCCESS+'15', borderRadius:12, padding:12, borderWidth:1, borderColor:SUCCESS+'40', marginBottom:4 },
  gpsModalBtnText   : { fontSize:12, color:SUCCESS, fontWeight:'600', flex:1 },
  cidadeChip        : { paddingHorizontal:12, paddingVertical:7, borderRadius:18, backgroundColor:CARD_BG2, borderWidth:1, borderColor:SILVER+'25' },
  cidadeChipAtivo   : { backgroundColor:GOLD, borderColor:GOLD },
  cidadeChipTxt     : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  cidadeChipTxtAtivo: { color:DARK_BG },
  sectionDivider    : { flexDirection:'row', alignItems:'center', gap:8, marginTop:20, marginBottom:14, paddingBottom:10, borderBottomWidth:1, borderBottomColor:WARN+'30' },
  sectionDividerText: { fontSize:13, fontWeight:'bold', letterSpacing:0.5 },
  fornGrid          : { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:4 },
  fornItem          : { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:CARD_BG, borderRadius:12, paddingHorizontal:14, paddingVertical:10, borderWidth:1, borderColor:SILVER+'25', width:'47%' },
  fornItemActive    : { borderColor:GOLD+'70', backgroundColor:GOLD+'12' },
  fornCheck         : { width:20, height:20, borderRadius:6, borderWidth:2, borderColor:SILVER_DARK, justifyContent:'center', alignItems:'center' },
  fornLabel         : { fontSize:13, color:SILVER_DARK, fontWeight:'600' },
  saveBtn           : { flexDirection:'row', justifyContent:'center', alignItems:'center', backgroundColor:GOLD, borderRadius:14, paddingVertical:16, marginTop:20 },
  saveBtnText       : { fontSize:15, fontWeight:'bold', color:DARK_BG, letterSpacing:0.5 },
  deleteBtn         : { flexDirection:'row', justifyContent:'center', alignItems:'center', backgroundColor:DANGER+'15', borderRadius:14, paddingVertical:14, marginTop:10, borderWidth:1, borderColor:DANGER+'50' },
  deleteBtnText     : { fontSize:14, fontWeight:'bold', color:DANGER, letterSpacing:0.5 },
  gpsBanner         : { flexDirection:'row', alignItems:'center', backgroundColor:SUCCESS+'15', borderRadius:12, padding:12, borderWidth:1, borderColor:SUCCESS+'50', marginBottom:4 },
  gpsBannerTitle    : { fontSize:12, fontWeight:'bold', color:SUCCESS },
  gpsBannerSub      : { fontSize:10, color:SILVER_DARK, marginTop:2 },
  gpsTag            : { fontSize:10, color:SUCCESS, fontWeight:'600', marginTop:1 },
});