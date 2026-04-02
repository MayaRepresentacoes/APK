// screens/CheckinScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 3 — CHECK-IN INTELIGENTE (tela mais importante do app)
//
// Checklist COMPLETO:
//   ✅ DATA E HORA          → CheckinModel captura automaticamente
//   ✅ SIM/NÃO compra       → estado `resultado` + dois botões grandes
//   ✅ TELEFONE ou VISITA   → tipoRegistro chips
//   ✅ Produtos vendidos    → grid PRODUTOS_LISTA + toggleProduto
//   ✅ Produto → Representada → PRODUTO_REP mapping automático
//   ✅ Valor por representada → inputs separados derivados dos produtos
//   ✅ Observação           → TextInput multiline
//   ✅ Fotos 5×Estoque      → FotoGrupo max:5
//   ✅ Fotos 5×Gôndola      → FotoGrupo max:5
//   ✅ Fotos 5×Concorrentes → FotoGrupo max:5
//   ✅ Ver fotos anteriores → botão abre GaleriaFotosModal
//   ✅ Localização auto     → GPS apenas para visita presencial
//   + Representada          → chips horizontais por marca
//   + Sugestão IA           → CardSugestaoIA baseado no histórico
//   + Motivos não compra    → lista com múltipla seleção (MANTIDO)
//   + Próxima visita        → agendamento quando não comprou (MANTIDO)
//
// FUSÃO v2 — correções sobre doc 12:
//   [NOVO] PRODUTO_REP mapping: produto → representada automático
//   [NOVO] valorPorRep: inputs separados por marca quando produtos selecionados
//   [NOVO] fotos arrays: { estoque:[], gondola:[], concorrentes:[] } — 5 cada
//   [NOVO] GaleriaFotosModal: botão "Ver anteriores" no header de fotos
//   [FIX]  GPS: capturado apenas quando tipoRegistro === 'visita'
//   [FIX]  TIPOS_FOTO: 'obra' substituído por 'concorrentes'
//   Mantidos integralmente: ShimmerLine, CardSugestaoIA, motivos, próxima visita,
//   representada chips, resumo pré-confirmação, todos os styles originais.
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Dimensions, StatusBar, Animated, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Icon }          from 'react-native-elements';
import * as Location     from 'expo-location';
import * as ImagePicker  from 'expo-image-picker';
import { registrarCheckin, getVisitasCliente } from '../services/visitaService';
import { getSugestaoVendaIA }                  from '../services/aiService';
import { getTodasVisitas }                     from '../services/visitaService';
import GaleriaFotosModal                       from '../components/GaleriaFotosModal';

const { width: SW } = Dimensions.get('window');

// ── Paleta ────────────────────────────────────────────────────
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
  loja        : { main:'#E8B432', light:'#F5D07A', bg:'#E8B43220' },
  obra        : { main:'#4CAF50', light:'#81C784', bg:'#4CAF5020' },
  distribuidor: { main:'#29B6F6', light:'#90CAF9', bg:'#29B6F620' },
};
const getTipoColor = (tipo) => TIPO_COLORS[tipo] || { main:SILVER, light:SILVER_LIGHT, bg:SILVER+'18' };
const getTipoIcon  = (tipo) =>
  tipo==='loja' ? 'store' : tipo==='obra' ? 'construction' : tipo==='distribuidor' ? 'business' : 'location-on';

// ════════════════════════════════════════════════════════════════
// [NOVO] PRODUTO_REP — mapeamento produto → representada
// CAIXAS, TUBOS, CONEXÕES → FORTLEV
// TELHAS, VASOS           → AFORT
// METAIS                  → METAL TECH
// TINTAS                  → SOARES TINTAS
// ════════════════════════════════════════════════════════════════
const PRODUTO_REP = {
  caixas   : 'FORTLEV',
  tubos    : 'FORTLEV',
  conexoes : 'FORTLEV',
  telhas   : 'AFORT',
  vasos    : 'AFORT',
  metais   : 'METAL TECH',
  tintas   : 'SOARES TINTAS',
};

// ✅ Produtos vendidos
const PRODUTOS_LISTA = ['caixas','tubos','conexoes','telhas','vasos','metais','tintas'];
const PROD_COLOR = {
  caixas:BLUE, tubos:SILVER, conexoes:WARN, telhas:GOLD,
  vasos:SUCCESS, metais:'#9E9E9E', tintas:'#E91E63',
};
const PROD_ICON = {
  caixas:'inventory-2', tubos:'horizontal-rule', conexoes:'settings-input-component',
  telhas:'roofing', vasos:'local-florist', metais:'hardware', tintas:'format-paint',
};

// ════════════════════════════════════════════════════════════════
// [NOVO] TIPOS_FOTO — 5 por tipo: Estoque / Gôndola / Concorrentes
// Substituído 'obra' por 'concorrentes' conforme checklist
// ════════════════════════════════════════════════════════════════
const TIPOS_FOTO = [
  { key:'estoque',      label:'Estoque',      icone:'inventory', cor:BLUE,   max:5 },
  { key:'gondola',      label:'Gôndola',      icone:'storefront', cor:GOLD,  max:5 },
  { key:'concorrentes', label:'Concorrentes', icone:'business',  cor:DANGER, max:5 },
];

const MOTIVOS_NAO_COMPRA = [
  { key:'semestoque',    label:'Sem espaço / estoque cheio',    icon:'inventory',    color:WARN        },
  { key:'precoalto',     label:'Preço acima do esperado',       icon:'price-change', color:DANGER      },
  { key:'outroforn',     label:'Comprou de outro fornecedor',   icon:'store',        color:PURPLE      },
  { key:'proximasemana', label:'Vai comprar na próxima visita', icon:'event',        color:BLUE        },
  { key:'ausente',       label:'Cliente estava ausente',        icon:'person-off',   color:SILVER_DARK },
  { key:'seminteresse',  label:'Sem interesse no momento',      icon:'thumb-down',   color:DANGER      },
  { key:'aguardpgto',    label:'Aguardando pagamento',          icon:'payment',      color:WARN        },
  { key:'outro',         label:'Outro motivo',                  icon:'more-horiz',   color:SILVER      },
];

const REPRESENTADAS_LISTA = [
  { key:'FORTLEV',       label:'Fortlev',      icon:'water',     color:BLUE        },
  { key:'AFORT',         label:'Afort',         icon:'plumbing',  color:GOLD        },
  { key:'METAL TECH',    label:'Metal Tech',    icon:'settings',  color:SUCCESS     },
  { key:'SOARES TINTAS', label:'Soares Tintas', icon:'warehouse', color:PURPLE      },
  { key:'geral',         label:'Geral/Outros',  icon:'category',  color:SILVER_DARK },
];

// ── Helpers de valor ─────────────────────────────────────────
function formatarValorInput(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (isNaN(num)) return '';
  return (num / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBRL(str) {
  return parseFloat(String(str || '0').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatarValorDisplay(num) {
  return Number(num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// ════════════════════════════════════════════════════════════════
// Componente: ShimmerLine (MANTIDO INTEGRALMENTE)
// ════════════════════════════════════════════════════════════════
function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue:1, duration:2200, useNativeDriver:true })
    ).start();
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

// ════════════════════════════════════════════════════════════════
// [NOVO] FotoGrupo — substitui FotoSlot
// Exibe até 5 thumbnails por tipo + botão de adição em scroll horizontal
// ════════════════════════════════════════════════════════════════
function FotoGrupo({ tipo, uris, onAdicionar, onRemover }) {
  const podeAdicionar = uris.length < tipo.max;
  return (
    <View style={fg.container}>
      <View style={fg.header}>
        <View style={[fg.iconWrap, { backgroundColor: tipo.cor + '18' }]}>
          <Icon name={tipo.icone} size={14} color={tipo.cor} type="material" />
        </View>
        <Text style={[fg.titulo, { color: tipo.cor }]}>{tipo.label}</Text>
        <View style={[fg.badge, { borderColor: tipo.cor + '55', backgroundColor: tipo.cor + '15' }]}>
          <Icon name="photo-camera" size={9} color={tipo.cor} type="material" />
          <Text style={[fg.badgeTxt, { color: tipo.cor }]}>{uris.length}/{tipo.max}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fg.row}>
        {uris.map((uri, idx) => (
          <View key={idx} style={fg.thumbWrap}>
            <Image source={{ uri }} style={fg.thumb} resizeMode="cover" />
            <TouchableOpacity
              style={fg.removeBtn}
              onPress={() => onRemover(tipo.key, idx)}
              hitSlop={{ top:5, bottom:5, left:5, right:5 }}>
              <Icon name="close" size={10} color="#fff" type="material" />
            </TouchableOpacity>
            <View style={[fg.numBadge, { backgroundColor: tipo.cor + 'CC' }]}>
              <Text style={fg.numTxt}>{idx + 1}</Text>
            </View>
          </View>
        ))}
        {podeAdicionar && (
          <TouchableOpacity
            style={[fg.addBtn, { borderColor: tipo.cor + '55' }]}
            onPress={() => onAdicionar(tipo.key)}
            activeOpacity={0.8}>
            <View style={[fg.addIconWrap, { backgroundColor: tipo.cor + '18' }]}>
              <Icon name={tipo.icone} size={20} color={tipo.cor} type="material" />
            </View>
            <View style={[fg.addPlusIcon, { backgroundColor: tipo.cor }]}>
              <Icon name="add" size={12} color={DARK_BG} type="material" />
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
const fg = StyleSheet.create({
  container  : { backgroundColor:CARD_BG, borderRadius:14, borderWidth:1, borderColor:SILVER+'18', padding:12, marginBottom:8 },
  header     : { flexDirection:'row', alignItems:'center', gap:7, marginBottom:10 },
  iconWrap   : { width:26, height:26, borderRadius:8, justifyContent:'center', alignItems:'center' },
  titulo     : { flex:1, fontSize:12, fontWeight:'800' },
  badge      : { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:8, borderWidth:1 },
  badgeTxt   : { fontSize:10, fontWeight:'900' },
  row        : { flexDirection:'row', gap:6, paddingBottom:2 },
  thumbWrap  : { width:72, height:72, borderRadius:10, overflow:'hidden', position:'relative' },
  thumb      : { width:'100%', height:'100%' },
  removeBtn  : { position:'absolute', top:3, right:3, width:18, height:18, borderRadius:9, backgroundColor:'rgba(0,0,0,0.65)', justifyContent:'center', alignItems:'center' },
  numBadge   : { position:'absolute', bottom:0, left:0, paddingHorizontal:5, paddingVertical:2, borderTopRightRadius:6 },
  numTxt     : { fontSize:8, fontWeight:'900', color:'#fff' },
  addBtn     : { width:72, height:72, borderRadius:10, borderWidth:1.5, borderStyle:'dashed', backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  addIconWrap: { width:36, height:36, borderRadius:11, justifyContent:'center', alignItems:'center', marginBottom:2 },
  addPlusIcon: { position:'absolute', bottom:6, right:6, width:18, height:18, borderRadius:9, justifyContent:'center', alignItems:'center' },
});

// ════════════════════════════════════════════════════════════════
// Componente: CardSugestaoIA (MANTIDO INTEGRALMENTE)
// ════════════════════════════════════════════════════════════════
function CardSugestaoIA({ sugestoes, produtosSelecionados, onToggle }) {
  const [expandido, setExpandido] = useState(true);
  if (!sugestoes?.length) return null;

  const confCor  = { alta: SUCCESS, media: GOLD, baixa: SILVER_DARK };
  const confIcon = { alta: 'check-circle', media: 'info', baixa: 'radio-button-unchecked' };

  return (
    <View style={ia.container}>
      <TouchableOpacity
        style={ia.header}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>
        <View style={ia.iaIconWrap}>
          <Icon name="auto-awesome" size={14} color={DARK_BG} type="material" />
        </View>
        <Text style={ia.titulo}>Sugestão IA para este cliente</Text>
        <Icon name={expandido ? 'expand-less' : 'expand-more'} size={18} color={SILVER_DARK} type="material" />
      </TouchableOpacity>

      {expandido && (
        <View style={ia.lista}>
          {sugestoes.slice(0, 5).map((s, i) => {
            const cor         = confCor[s.confianca]  || SILVER_DARK;
            const icon        = confIcon[s.confianca] || 'radio-button-unchecked';
            const selecionado = produtosSelecionados.includes(s.nome);
            return (
              <TouchableOpacity
                key={i}
                style={[ia.item, selecionado && { backgroundColor: cor + '18', borderColor: cor + '40', borderWidth: 1 }]}
                onPress={() => onToggle(s.nome)}
                activeOpacity={0.8}>
                <Icon name={icon} size={13} color={cor} type="material" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[ia.itemNome, selecionado && { color: cor }]}>
                    {s.nome.charAt(0).toUpperCase() + s.nome.slice(1)}
                  </Text>
                  <Text style={[ia.itemMotivo, { color: cor }]} numberOfLines={1}>{s.motivo}</Text>
                </View>
                {selecionado && <Icon name="check" size={14} color={cor} type="material" />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
const ia = StyleSheet.create({
  container  : { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: GOLD + '35', overflow: 'hidden', marginBottom: 4 },
  header     : { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: GOLD + '12' },
  iaIconWrap : { width: 26, height: 26, borderRadius: 8, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  titulo     : { flex: 1, fontSize: 12, fontWeight: '800', color: SILVER_LIGHT },
  lista      : { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 },
  item       : { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderRadius: 10, paddingHorizontal: 6, marginBottom: 2 },
  itemNome   : { fontSize: 13, fontWeight: '700', color: SILVER_LIGHT },
  itemMotivo : { fontSize: 10, fontWeight: '600', marginTop: 1 },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function CheckinScreen({ navigation, route }) {
  const cliente             = route?.params?.cliente             || null;
  const tipoRegistroInicial = route?.params?.tipoRegistroInicial || 'visita';

  // ── Estados do formulário ────────────────────────────────────
  const [tipoRegistro,  setTipoRegistro]  = useState(tipoRegistroInicial);
  // ✅ SIM/NÃO compra
  const [resultado,     setResultado]     = useState('');
  // ✅ Valor simples (fallback quando nenhum produto selecionado)
  const [valor,         setValor]         = useState('');
  // [NOVO] Valor separado por representada
  const [valorPorRep,   setValorPorRep]   = useState({});
  // ✅ Produtos vendidos
  const [produtos,      setProdutos]      = useState([]);
  const [motivos,       setMotivos]       = useState([]);
  const [motivoObs,     setMotivoObs]     = useState('');
  // ✅ Observação
  const [observacao,    setObservacao]    = useState('');
  const [salvando,      setSalvando]      = useState(false);
  // ✅ Localização (apenas para visita presencial)
  const [localizacao,   setLocalizacao]   = useState(null);
  const [capturandoGPS, setCapturandoGPS] = useState(false);
  // [NOVO] Fotos como arrays { estoque:[], gondola:[], concorrentes:[] }
  const [fotos,         setFotos]         = useState({ estoque:[], gondola:[], concorrentes:[] });
  // Representada + próxima visita
  const [representada,  setRepresentada]  = useState(cliente?.representada || 'geral');
  const [proximaVisita, setProximaVisita] = useState('');
  // IA
  const [sugestoesIA,   setSugestoesIA]   = useState([]);
  // [NOVO] Galeria de fotos anteriores
  const [galeriaVisible,     setGaleriaVisible]     = useState(false);
  const [historicoFotos,     setHistoricoFotos]     = useState([]);
  const [carregandoGaleria,  setCarregandoGaleria]  = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue:1, duration:350, useNativeDriver:true }).start();
    // [FIX] GPS apenas para visita presencial
    if (tipoRegistroInicial === 'visita') capturarGPSAuto();
    carregarSugestoesIA();
  }, []);

  // ── Carrega sugestões IA (MANTIDO) ───────────────────────────
  const carregarSugestoesIA = async () => {
    if (!cliente?.id) return;
    try {
      const todasVisitas = await getTodasVisitas();
      const sugestoes    = getSugestaoVendaIA(cliente, todasVisitas, []);
      setSugestoesIA(sugestoes);
    } catch (e) {
      console.log('[CheckinScreen] sugestões IA:', e);
    }
  };

  // ── [FIX] GPS apenas para visita presencial ──────────────────
  const capturarGPSAuto = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setCapturandoGPS(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocalizacao({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) {
      // GPS é opcional
    } finally {
      setCapturandoGPS(false);
    }
  };

  // ── Produtos toggle (MANTIDO) ─────────────────────────────────
  const toggleProduto = (p) =>
    setProdutos(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const toggleMotivo = (m) =>
    setMotivos(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  // ── [NOVO] Fotos — adiciona URI ao array do tipo (máx 5) ─────
  const handleAdicionarFoto = (tipoKey) => {
    const tipo = TIPOS_FOTO.find(t => t.key === tipoKey);
    const qtdAtual = (fotos[tipoKey] || []).length;
    if (qtdAtual >= (tipo?.max || 5)) {
      Alert.alert('Limite atingido', `Máximo de ${tipo?.max || 5} fotos para ${tipo?.label || tipoKey}.`);
      return;
    }
    Alert.alert(`Foto — ${tipo?.label || tipoKey}`, 'Escolha a origem:', [
      {
        text: 'Câmera',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permissão negada'); return; }
            const result = await ImagePicker.launchCameraAsync({ allowsEditing:true, aspect:[4,3], quality:0.75 });
            if (!result.canceled && result.assets?.[0]?.uri) {
              setFotos(prev => ({ ...prev, [tipoKey]: [...(prev[tipoKey] || []), result.assets[0].uri] }));
            }
          } catch (e) { Alert.alert('Erro', 'Não foi possível abrir a câmera.'); }
        },
      },
      {
        text: 'Galeria',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permissão negada'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true, aspect: [4,3], quality: 0.75,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              setFotos(prev => ({ ...prev, [tipoKey]: [...(prev[tipoKey] || []), result.assets[0].uri] }));
            }
          } catch (e) { Alert.alert('Erro', 'Não foi possível abrir a galeria.'); }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  // [NOVO] Remove foto por índice
  const handleRemoverFoto = (tipoKey, idx) => {
    setFotos(prev => ({
      ...prev,
      [tipoKey]: (prev[tipoKey] || []).filter((_, i) => i !== idx),
    }));
  };

  // ── [NOVO] Abrir galeria de fotos anteriores ──────────────────
  const abrirGaleria = async () => {
    if (!cliente?.id) return;
    setCarregandoGaleria(true);
    try {
      const visitas = await getVisitasCliente(cliente.id);
      setHistoricoFotos(visitas);
      setGaleriaVisible(true);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível carregar o histórico de fotos.');
    } finally {
      setCarregandoGaleria(false);
    }
  };

  // ── ✅ Valor — máscara R$ ─────────────────────────────────────
  const handleValorChange = (raw) => setValor(formatarValorInput(raw));

  // ── [NOVO] Representadas ativas derivadas dos produtos ────────
  const repsAtivas = [...new Set(produtos.map(p => PRODUTO_REP[p]).filter(Boolean))];

  // [NOVO] Total da venda
  const totalValorVenda = repsAtivas.length > 0
    ? repsAtivas.reduce((sum, rep) => sum + parseBRL(valorPorRep[rep] || ''), 0)
    : parseBRL(valor);

  // Contagem total de fotos
  const qtdFotos = Object.values(fotos).reduce((s, arr) =>
    s + (Array.isArray(arr) ? arr.length : (arr ? 1 : 0)), 0
  );

  // ── Salvar ───────────────────────────────────────────────────
  const salvar = async () => {
    if (!resultado) {
      Alert.alert('Atenção', 'Selecione o resultado da visita.');
      return;
    }
    if (resultado === 'naocomprou' && motivos.length === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos 1 motivo para a não compra.');
      return;
    }
    setSalvando(true);
    try {
      // [NOVO] valorPorRep numérico para o modelo
      const valorPorRepFinal = repsAtivas.reduce((acc, rep) => {
        const num = parseBRL(valorPorRep[rep] || '');
        if (num > 0) acc[rep] = num;
        return acc;
      }, {});

      await registrarCheckin({
        clienteId    : cliente.id,
        clienteNome  : cliente.nome,
        clienteTipo  : cliente.tipo    || '',
        clienteCidade: cliente.cidade  || '',
        tipoRegistro,
        resultado,
        // [NOVO] valor total (soma das representadas ou valor simples)
        valor        : resultado === 'comprou' ? totalValorVenda : 0,
        // [NOVO] valor por representada para relatório
        valorPorRep  : valorPorRepFinal,
        // [NOVO] representadas derivadas dos produtos
        representadas: repsAtivas.length > 0 ? repsAtivas : [],
        representada : repsAtivas[0] || representada,
        produtos,
        motivos,
        motivoObs,
        observacao,
        // [NOVO] fotos como arrays
        fotos,
        // [FIX] localização apenas para visita presencial
        localizacao  : tipoRegistro === 'visita' ? localizacao : null,
        proximaVisita: resultado === 'naocomprou' && proximaVisita ? proximaVisita : '',
      });

      Alert.alert(
        '✅ Check-in registrado!',
        `Visita a "${cliente.nome}" salva com sucesso.`,
        [{ text:'OK', onPress:() => navigation.goBack() }]
      );
    } catch (e) {
      console.log('[CheckinScreen] erro ao salvar:', e);
      Alert.alert('Erro', 'Não foi possível salvar o check-in.');
    } finally {
      setSalvando(false);
    }
  };

  // ── Guard ────────────────────────────────────────────────────
  if (!cliente) return (
    <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor:DARK_BG }}>
      <Icon name="person-off" size={48} color={SILVER_DARK} type="material" />
      <Text style={{ color:SILVER_DARK, marginTop:12 }}>Cliente não encontrado</Text>
      <TouchableOpacity style={ds.voltarBtn} onPress={() => navigation.goBack()}>
        <Text style={{ color:DARK_BG, fontWeight:'bold' }}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Derivados ────────────────────────────────────────────────
  const tc         = getTipoColor(cliente.tipo);
  const comprou    = resultado === 'comprou';
  const naoComprou = resultado === 'naocomprou';
  const repAtual   = REPRESENTADAS_LISTA.find(r => r.key === representada) || REPRESENTADAS_LISTA[4];

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios' ? 'padding' : undefined}>
      <View style={ds.container}>
        <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

        {/* ══ HEADER ══ */}
        <View style={ds.header}>
          <View style={[ds.headerAccent, { backgroundColor:tc.main }]} />
          <View style={ds.headerRow}>
            <TouchableOpacity style={ds.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Icon name="arrow-back" size={20} color={SILVER_LIGHT} type="material" />
            </TouchableOpacity>
            <View style={[ds.headerIcon, { backgroundColor:tc.main }]}>
              <Icon name={getTipoIcon(cliente.tipo)} size={20} color={DARK_BG} type="material" />
            </View>
            <View style={{ flex:1 }}>
              <Text style={ds.headerNome} numberOfLines={1}>{cliente.nome}</Text>
              <Text style={[ds.headerSub, { color:tc.main }]}>
                Registrar {tipoRegistro==='telefone' ? 'venda por telefone' : 'visita presencial'}
              </Text>
            </View>
            {/* [FIX] GPS badge — apenas visita presencial */}
            {tipoRegistro === 'visita' && (
              <View style={[ds.gpsBadge, localizacao ? ds.gpsBadgeOk : ds.gpsBadgeOff]}>
                <Icon
                  name={localizacao ? 'gps-fixed' : capturandoGPS ? 'gps-not-fixed' : 'gps-off'}
                  size={12}
                  color={localizacao ? SUCCESS : SILVER_DARK}
                  type="material"
                />
                <Text style={[ds.gpsBadgeTxt, { color: localizacao ? SUCCESS : SILVER_DARK }]}>
                  {localizacao ? 'GPS' : capturandoGPS ? '...' : 'Sem GPS'}
                </Text>
              </View>
            )}
          </View>
          <ShimmerLine color={tc.main} />
        </View>

        <Animated.ScrollView
          style={{ opacity:fadeAnim }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={ds.scroll}
          keyboardShouldPersistTaps="handled">

          {/* ── Tipo de Registro ── */}
          <Text style={ds.sectionLabel}>Tipo de Registro</Text>
          <View style={ds.tipoRow}>
            {[
              { key:'visita',   label:'🏪 Visita Presencial', icon:'directions-walk', color:SUCCESS },
              { key:'telefone', label:'📞 Venda por Telefone', icon:'phone-in-talk',  color:BLUE   },
            ].map(t => (
              <TouchableOpacity
                key={t.key}
                style={[ds.tipoBtn, tipoRegistro===t.key && { backgroundColor:t.color+'20', borderColor:t.color }]}
                onPress={() => {
                  setTipoRegistro(t.key);
                  // [FIX] captura GPS apenas ao mudar para visita
                  if (t.key === 'visita' && !localizacao) capturarGPSAuto();
                }}
                activeOpacity={0.8}>
                <Icon name={t.icon} size={16} color={tipoRegistro===t.key ? t.color : SILVER_DARK} type="material" />
                <Text style={[ds.tipoBtnTxt, { color: tipoRegistro===t.key ? t.color : SILVER_DARK }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Representada ── */}
          <Text style={ds.sectionLabel}>Representada</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ds.repRow}>
            {REPRESENTADAS_LISTA.map(r => {
              const ativo = representada === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[ds.repChip, ativo && { backgroundColor: r.color + '22', borderColor: r.color }]}
                  onPress={() => setRepresentada(r.key)}
                  activeOpacity={0.8}>
                  <Icon name={r.icon} size={13} color={ativo ? r.color : SILVER_DARK} type="material" />
                  <Text style={[ds.repChipTxt, ativo && { color: r.color }]}>{r.label}</Text>
                  {ativo && <Icon name="check-circle" size={10} color={r.color} type="material" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── ✅ SIM/NÃO compra ── */}
          <Text style={ds.sectionLabel}>Resultado *</Text>
          <View style={ds.resultadoRow}>
            <TouchableOpacity
              style={[ds.resultadoBtn, comprou && ds.resultadoBtnComprou]}
              onPress={() => { setResultado('comprou'); setMotivos([]); setMotivoObs(''); }}
              activeOpacity={0.8}>
              <View style={[ds.resultadoIconWrap, { backgroundColor: comprou ? 'rgba(255,255,255,0.15)' : SUCCESS+'20' }]}>
                <Icon name="check-circle" size={36} color={comprou ? '#fff' : SUCCESS} type="material" />
              </View>
              <Text style={[ds.resultadoBtnTxt, comprou && { color:'#fff' }]}>✅ Comprou</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ds.resultadoBtn, naoComprou && ds.resultadoBtnNao]}
              onPress={() => { setResultado('naocomprou'); setProdutos([]); setValor(''); setValorPorRep({}); }}
              activeOpacity={0.8}>
              <View style={[ds.resultadoIconWrap, { backgroundColor: naoComprou ? 'rgba(255,255,255,0.15)' : DANGER+'20' }]}>
                <Icon name="cancel" size={36} color={naoComprou ? '#fff' : DANGER} type="material" />
              </View>
              <Text style={[ds.resultadoBtnTxt, naoComprou && { color:'#fff' }]}>❌ Não Comprou</Text>
            </TouchableOpacity>
          </View>

          {/* ── ✅ SE COMPROU: Produtos + Valor ── */}
          {comprou && (
            <>
              {sugestoesIA.length > 0 && (
                <>
                  <Text style={ds.sectionLabel}>Sugestão IA</Text>
                  <CardSugestaoIA
                    sugestoes={sugestoesIA}
                    produtosSelecionados={produtos}
                    onToggle={toggleProduto}
                  />
                </>
              )}

              <Text style={ds.sectionLabel}>Produtos Vendidos</Text>
              <View style={ds.produtosGrid}>
                {PRODUTOS_LISTA.map(p => {
                  const ativo     = produtos.includes(p);
                  const cor       = PROD_COLOR[p] || GOLD;
                  const sugerido  = sugestoesIA.some(s => s.nome === p && s.confianca === 'alta');
                  const repDoProd = PRODUTO_REP[p];
                  const repObj    = repDoProd ? REPRESENTADAS_LISTA.find(r => r.key === repDoProd) : null;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        ds.prodChip,
                        ativo && { backgroundColor: cor+'25', borderColor: cor },
                        !ativo && sugerido && { borderColor: cor + '60', borderStyle: 'dashed' },
                      ]}
                      onPress={() => toggleProduto(p)}
                      activeOpacity={0.8}>
                      <Icon name={PROD_ICON[p]||'inventory'} size={14} color={ativo ? cor : SILVER_DARK} type="material" />
                      <View style={{ flex:1 }}>
                        <Text style={[ds.prodChipTxt, ativo && { color: cor }]}>
                          {p.charAt(0).toUpperCase()+p.slice(1)}
                        </Text>
                        {/* [NOVO] Mostra a representada do produto */}
                        {repObj && (
                          <Text style={[ds.prodChipRep, { color: ativo ? repObj.color : SILVER_DARK+'80' }]}>
                            {repObj.label}
                          </Text>
                        )}
                      </View>
                      {ativo && <Icon name="check" size={12} color={cor} type="material" />}
                      {!ativo && sugerido && (
                        <View style={ds.prodIABadge}>
                          <Icon name="auto-awesome" size={8} color={GOLD} type="material" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* [NOVO] Valor por representada (quando produtos selecionados) */}
              {repsAtivas.length > 0 ? (
                <>
                  <Text style={ds.sectionLabel}>Valor por Representada</Text>
                  <Text style={ds.sectionHint}>Distribuído pelos produtos selecionados</Text>
                  {repsAtivas.map(repKey => {
                    const rep        = REPRESENTADAS_LISTA.find(r => r.key === repKey) || { label:repKey, color:SILVER_DARK, icon:'store' };
                    const prodsDaRep = produtos.filter(p => PRODUTO_REP[p] === repKey);
                    return (
                      <View key={repKey} style={ds.valorRepBloco}>
                        <View style={[ds.valorRepHeader, { backgroundColor:rep.color+'14', borderColor:rep.color+'35' }]}>
                          <Icon name={rep.icon} size={13} color={rep.color} type="material" />
                          <View style={{ flex:1 }}>
                            <Text style={[ds.valorRepNome, { color:rep.color }]}>{rep.label}</Text>
                            <Text style={ds.valorRepProds}>{prodsDaRep.join(', ')}</Text>
                          </View>
                        </View>
                        <View style={ds.inputWrap}>
                          <Icon name="attach-money" size={18} color={rep.color} type="material" />
                          <Text style={[ds.inputPrefix, { color:rep.color }]}>R$</Text>
                          <TextInput
                            style={ds.input}
                            placeholder="0,00"
                            placeholderTextColor={SILVER_DARK}
                            value={valorPorRep[repKey] || ''}
                            onChangeText={v => setValorPorRep(prev => ({ ...prev, [repKey]: formatarValorInput(v) }))}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    );
                  })}
                  {repsAtivas.length > 1 && (
                    <View style={ds.totalValorRow}>
                      <Icon name="calculate" size={15} color={GOLD} type="material" />
                      <Text style={ds.totalValorLabel}>Total da visita</Text>
                      <Text style={ds.totalValorTxt}>R$ {formatarValorDisplay(totalValorVenda)}</Text>
                    </View>
                  )}
                </>
              ) : (
                /* Valor simples quando nenhum produto selecionado */
                <>
                  <Text style={ds.sectionLabel}>Valor da Venda (R$)</Text>
                  <View style={ds.inputWrap}>
                    <Icon name="attach-money" size={18} color={GOLD} type="material" />
                    <Text style={ds.inputPrefix}>R$</Text>
                    <TextInput
                      style={ds.input}
                      placeholder="0,00"
                      placeholderTextColor={SILVER_DARK}
                      value={valor}
                      onChangeText={handleValorChange}
                      keyboardType="numeric"
                    />
                  </View>
                </>
              )}
            </>
          )}

          {/* ── ✅ SE NÃO COMPROU: Motivos + Próxima visita (MANTIDO INTEGRALMENTE) ── */}
          {naoComprou && (
            <>
              <Text style={ds.sectionLabel}>Por que não comprou? *</Text>
              <Text style={ds.sectionHint}>Selecione todos que se aplicam</Text>
              {MOTIVOS_NAO_COMPRA.map(m => {
                const ativo = motivos.includes(m.key);
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[ds.motivoItem, ativo && { backgroundColor: m.color+'18', borderColor: m.color, borderWidth:1.5 }]}
                    onPress={() => toggleMotivo(m.key)}
                    activeOpacity={0.8}>
                    <View style={[ds.motivoCheck, ativo && { backgroundColor: m.color, borderColor: m.color }]}>
                      {ativo && <Icon name="check" size={11} color="#fff" type="material" />}
                    </View>
                    <View style={[ds.motivoIconWrap, { backgroundColor: m.color+'20' }]}>
                      <Icon name={m.icon} size={16} color={m.color} type="material" />
                    </View>
                    <Text style={[ds.motivoTxt, ativo && { color: m.color, fontWeight:'700' }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
              {motivos.includes('outro') && (
                <TextInput
                  style={ds.motivoOutroInput}
                  placeholder="Descreva o motivo..."
                  placeholderTextColor={SILVER_DARK}
                  value={motivoObs}
                  onChangeText={setMotivoObs}
                  multiline
                />
              )}

              <Text style={ds.sectionLabel}>Próxima Visita</Text>
              <Text style={ds.sectionHint}>Opcional — agende o retorno a este cliente</Text>
              <View style={ds.inputWrap}>
                <Icon name="event" size={18} color={BLUE} type="material" />
                <TextInput
                  style={ds.input}
                  placeholder="dd/mm/aaaa"
                  placeholderTextColor={SILVER_DARK}
                  value={proximaVisita}
                  onChangeText={setProximaVisita}
                  keyboardType="numeric"
                  maxLength={10}
                />
                {proximaVisita.length > 0 && (
                  <TouchableOpacity onPress={() => setProximaVisita('')}>
                    <Icon name="close" size={16} color={SILVER_DARK} type="material" />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* ── ✅ FOTOS: 5×Estoque / 5×Gôndola / 5×Concorrentes ── */}
          <View style={ds.fotosSectionHeader}>
            <Text style={[ds.sectionLabel, { marginTop:0 }]}>Fotos</Text>
            <View style={ds.fotosHeaderRight}>
              {qtdFotos > 0 && (
                <View style={ds.fotosQtdBadge}>
                  <Icon name="photo-camera" size={10} color={BLUE} type="material" />
                  <Text style={ds.fotosQtdTxt}>{qtdFotos} foto{qtdFotos > 1 ? 's' : ''}</Text>
                </View>
              )}
              {/* [NOVO] Botão ver fotos anteriores */}
              <TouchableOpacity
                style={[ds.galeriaBtn, carregandoGaleria && { opacity:0.7 }]}
                onPress={abrirGaleria}
                disabled={carregandoGaleria}
                activeOpacity={0.8}>
                <Icon name="photo-library" size={12} color={PURPLE} type="material" />
                <Text style={ds.galeriaBtnTxt}>
                  {carregandoGaleria ? 'Carregando...' : 'Ver anteriores'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={ds.sectionHint}>Estoque, gôndola e fotos de concorrentes</Text>

          {TIPOS_FOTO.map(tipo => (
            <FotoGrupo
              key={tipo.key}
              tipo={tipo}
              uris={fotos[tipo.key] || []}
              onAdicionar={handleAdicionarFoto}
              onRemover={handleRemoverFoto}
            />
          ))}

          {/* ── ✅ Observação ── */}
          <Text style={ds.sectionLabel}>Observação</Text>
          <View style={[ds.inputWrap, { alignItems:'flex-start', paddingTop:12 }]}>
            <Icon name="notes" size={18} color={SILVER_DARK} type="material" style={{ marginTop:2 }} />
            <TextInput
              style={[ds.input, { height:80, textAlignVertical:'top' }]}
              placeholder="Anotações sobre a visita..."
              placeholderTextColor={SILVER_DARK}
              value={observacao}
              onChangeText={setObservacao}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* ── Resumo pré-confirmação ── */}
          {resultado !== '' && (
            <View style={[ds.resumoCard, { borderColor: comprou ? SUCCESS+'40' : DANGER+'40' }]}>
              <Icon name="summarize" size={16} color={comprou ? SUCCESS : DANGER} type="material" />
              <View style={{ flex:1, marginLeft:10 }}>
                <Text style={[ds.resumoTxt, { color: comprou ? SUCCESS : DANGER }]}>
                  {comprou ? `✅ Venda — R$ ${formatarValorDisplay(totalValorVenda)}` : '❌ Visita sem compra'}
                </Text>
                {tipoRegistro==='telefone' && (
                  <Text style={[ds.resumoSub, { color:BLUE }]}>📞 Via telefone/WhatsApp</Text>
                )}
                {/* [NOVO] Mostra por representada no resumo */}
                {repsAtivas.length > 0 ? (
                  repsAtivas.map(rep => {
                    const r = REPRESENTADAS_LISTA.find(x => x.key === rep);
                    const v = valorPorRep[rep];
                    return r ? (
                      <Text key={rep} style={[ds.resumoSub, { color:r.color }]}>
                        🏷 {r.label}{v ? ` — R$ ${v}` : ''}
                      </Text>
                    ) : null;
                  })
                ) : (
                  representada && representada !== 'geral' && (
                    <Text style={[ds.resumoSub, { color: repAtual.color }]}>🏷 {repAtual.label}</Text>
                  )
                )}
                {produtos.length > 0 && (
                  <Text style={ds.resumoSub}>{produtos.join(', ')}</Text>
                )}
                {motivos.length > 0 && (
                  <Text style={[ds.resumoSub, { color:WARN }]}>
                    {motivos.map(k => MOTIVOS_NAO_COMPRA.find(m => m.key===k)?.label).filter(Boolean).join(', ')}
                  </Text>
                )}
                {tipoRegistro === 'visita' && localizacao && (
                  <Text style={[ds.resumoSub, { color:SUCCESS }]}>📍 GPS capturado</Text>
                )}
                {qtdFotos > 0 && (
                  <Text style={[ds.resumoSub, { color:BLUE }]}>
                    📷 {qtdFotos} foto{qtdFotos > 1 ? 's' : ''} — {
                      TIPOS_FOTO.filter(t => (fotos[t.key]?.length || 0) > 0)
                        .map(t => `${t.label}: ${fotos[t.key].length}`).join(', ')
                    }
                  </Text>
                )}
                {proximaVisita.length >= 8 && (
                  <Text style={[ds.resumoSub, { color:BLUE }]}>📅 Próxima visita: {proximaVisita}</Text>
                )}
              </View>
            </View>
          )}

          {/* ── Botão Salvar ── */}
          <TouchableOpacity
            style={[ds.salvarBtn, salvando && { opacity:0.7 }]}
            onPress={salvar}
            disabled={salvando}
            activeOpacity={0.85}>
            <Icon name={salvando ? 'hourglass-empty' : 'check'} size={20} color={DARK_BG} type="material" />
            <Text style={ds.salvarBtnTxt}>{salvando ? 'Salvando...' : 'CONFIRMAR CHECK-IN'}</Text>
          </TouchableOpacity>

          <View style={{ height:50 }} />
        </Animated.ScrollView>
      </View>

      {/* ✅ [NOVO] Galeria de fotos anteriores */}
      <GaleriaFotosModal
        visible={galeriaVisible}
        cliente={cliente}
        historico={historicoFotos}
        onClose={() => setGaleriaVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ── STYLES ───────────────────────────────────────────────────
const ds = StyleSheet.create({
  // Originais mantidos integralmente
  container          : { flex:1, backgroundColor:DARK_BG },
  header             : { backgroundColor:MODAL_BG, borderBottomLeftRadius:22, borderBottomRightRadius:22, overflow:'hidden', elevation:10 },
  headerAccent       : { height:3 },
  headerRow          : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingTop:48, paddingBottom:14 },
  backBtn            : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  headerIcon         : { width:44, height:44, borderRadius:14, justifyContent:'center', alignItems:'center' },
  headerNome         : { fontSize:16, fontWeight:'bold', color:SILVER_LIGHT },
  headerSub          : { fontSize:11, marginTop:2, fontWeight:'600' },
  gpsBadge           : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:4, borderRadius:10, borderWidth:1 },
  gpsBadgeOk         : { backgroundColor:SUCCESS+'15', borderColor:SUCCESS+'40' },
  gpsBadgeOff        : { backgroundColor:CARD_BG2, borderColor:SILVER+'20' },
  gpsBadgeTxt        : { fontSize:10, fontWeight:'700' },
  scroll             : { paddingHorizontal:16, paddingTop:20, paddingBottom:80 },
  sectionLabel       : { fontSize:11, fontWeight:'700', color:SILVER_DARK, letterSpacing:0.8, textTransform:'uppercase', marginBottom:8, marginTop:20 },
  sectionHint        : { fontSize:11, color:SILVER_DARK+'90', fontStyle:'italic', marginBottom:10, marginTop:-4 },
  tipoRow            : { gap:8 },
  tipoBtn            : { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:CARD_BG, borderRadius:14, padding:14, borderWidth:1, borderColor:SILVER+'20' },
  tipoBtnTxt         : { fontSize:13, fontWeight:'700' },
  repRow             : { gap:8, paddingVertical:4, flexDirection:'row' },
  repChip            : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:CARD_BG, borderRadius:12, paddingHorizontal:11, paddingVertical:8, borderWidth:1, borderColor:SILVER+'25' },
  repChipTxt         : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  resultadoRow       : { flexDirection:'row', gap:10 },
  resultadoBtn       : { flex:1, alignItems:'center', justifyContent:'center', gap:10, backgroundColor:CARD_BG, borderRadius:18, paddingVertical:20, borderWidth:2, borderColor:SILVER+'20' },
  resultadoBtnComprou: { backgroundColor:SUCCESS, borderColor:SUCCESS },
  resultadoBtnNao    : { backgroundColor:DANGER,  borderColor:DANGER  },
  resultadoIconWrap  : { width:56, height:56, borderRadius:28, justifyContent:'center', alignItems:'center' },
  resultadoBtnTxt    : { fontSize:13, fontWeight:'800', color:SILVER },
  inputWrap          : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG, borderRadius:14, paddingHorizontal:14, paddingVertical:4, borderWidth:1, borderColor:SILVER+'25', gap:8 },
  input              : { flex:1, fontSize:15, color:SILVER_LIGHT, paddingVertical:12 },
  inputPrefix        : { fontSize:15, fontWeight:'700', color:GOLD },
  produtosGrid       : { flexDirection:'row', flexWrap:'wrap', gap:8 },
  prodChip           : { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:CARD_BG, borderRadius:12, paddingHorizontal:12, paddingVertical:9, borderWidth:1, borderColor:SILVER+'25', minWidth:90 },
  prodChipTxt        : { fontSize:12, fontWeight:'700', color:SILVER_DARK },
  // [NOVO] rep do produto abaixo do nome
  prodChipRep        : { fontSize:9, fontWeight:'600', marginTop:1 },
  prodIABadge        : { position:'absolute', top:-4, right:-4, width:14, height:14, borderRadius:7, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  motivoItem         : { flexDirection:'row', alignItems:'center', gap:10, padding:13, borderRadius:14, borderWidth:1, borderColor:SILVER+'20', backgroundColor:CARD_BG, marginBottom:7 },
  motivoCheck        : { width:20, height:20, borderRadius:6, borderWidth:1.5, borderColor:SILVER_DARK, justifyContent:'center', alignItems:'center' },
  motivoIconWrap     : { width:30, height:30, borderRadius:9, justifyContent:'center', alignItems:'center' },
  motivoTxt          : { flex:1, fontSize:12, fontWeight:'600', color:SILVER_DARK },
  motivoOutroInput   : { backgroundColor:CARD_BG, borderRadius:12, borderWidth:1, borderColor:SILVER+'28', padding:12, color:SILVER_LIGHT, fontSize:12, marginTop:4, minHeight:60, textAlignVertical:'top' },
  // [NOVO] Valor por representada
  valorRepBloco      : { marginBottom:10 },
  valorRepHeader     : { flexDirection:'row', alignItems:'center', gap:8, borderRadius:10, borderWidth:1, padding:10, marginBottom:6 },
  valorRepNome       : { fontSize:12, fontWeight:'800' },
  valorRepProds      : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  totalValorRow      : { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:GOLD+'12', borderRadius:12, borderWidth:1, borderColor:GOLD+'35', padding:12, marginTop:4 },
  totalValorLabel    : { flex:1, fontSize:13, fontWeight:'700', color:SILVER_LIGHT },
  totalValorTxt      : { fontSize:16, fontWeight:'900', color:GOLD },
  // Fotos
  fotosSectionHeader : { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:20, marginBottom:0 },
  fotosHeaderRight   : { flexDirection:'row', alignItems:'center', gap:8 },
  fotosQtdBadge      : { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:BLUE+'18', borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:BLUE+'40' },
  fotosQtdTxt        : { fontSize:10, fontWeight:'800', color:BLUE },
  // [NOVO] Botão galeria anterior
  galeriaBtn         : { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:PURPLE+'15', borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor:PURPLE+'40' },
  galeriaBtnTxt      : { fontSize:10, fontWeight:'700', color:PURPLE },
  // Resumo
  resumoCard         : { flexDirection:'row', alignItems:'flex-start', backgroundColor:CARD_BG, borderRadius:14, padding:14, borderWidth:1, marginTop:20 },
  resumoTxt          : { fontSize:13, fontWeight:'700' },
  resumoSub          : { fontSize:11, color:SILVER_DARK, marginTop:4 },
  salvarBtn          : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, backgroundColor:GOLD, borderRadius:16, paddingVertical:18, marginTop:20, shadowColor:GOLD, shadowOffset:{width:0,height:4}, shadowOpacity:0.5, shadowRadius:10, elevation:8 },
  salvarBtnTxt       : { fontSize:15, fontWeight:'bold', color:DARK_BG, letterSpacing:0.5 },
  voltarBtn          : { marginTop:16, paddingHorizontal:20, paddingVertical:10, backgroundColor:GOLD, borderRadius:12 },
});