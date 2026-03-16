import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { createSociety, saveCalculation } from './src/services/carbonazeApi';

type CategoryKey = 'materials' | 'energy' | 'gas' | 'parking' | 'equipment';
type Page = 'home' | 'calculator';
type Material = { id: string; name: string; quantity: number };
type Payload = {
  siteName: string;
  city: string;
  energyMwh: number;
  gasMwh: number;
  employees: number;
  parkingSpaces: number;
  computers: number;
  materials: Material[];
};
type Category = {
  key: CategoryKey;
  label: string;
  emission: number;
  percentage: number;
  color: string;
  helper: string;
};
type MaterialImpact = {
  name: string;
  quantity: number;
  factor: number;
  emission: number;
  share: number;
  color: string;
};
type Result = {
  siteName: string;
  city: string;
  totalEmission: number;
  emissionPerEmployee: number;
  dominantCategory: string;
  dominantShare: number;
  materialCount: number;
  categories: Category[];
  materials: MaterialImpact[];
  insights: string[];
};

const T = {
  canvas: '#F4F0E5',
  ink: '#14332D',
  muted: '#5D736E',
  moss: '#135C52',
  mint: '#2E8B7D',
  sand: '#F3B562',
  line: 'rgba(19, 92, 82, 0.12)',
  lineStrong: 'rgba(19, 92, 82, 0.18)',
  panel: 'rgba(255,255,255,0.92)',
  panelSoft: 'rgba(255,255,255,0.82)',
  colors: ['#14532D', '#0F766E', '#CA8A04', '#B45309', '#155E75'],
};

const DEFAULT_PAYLOAD: Payload = {
  siteName: 'Carbonaze Rive Gauche',
  city: 'Paris',
  energyMwh: 1840,
  gasMwh: 620,
  employees: 920,
  parkingSpaces: 142,
  computers: 1037,
  materials: [
    { id: 'm1', name: 'Béton bas carbone', quantity: 320 },
    { id: 'm2', name: 'Acier', quantity: 85 },
    { id: 'm3', name: 'Verre', quantity: 40 },
  ],
};

const n1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const round = (v: number, d = 1) => Number(v.toFixed(d));
const parse = (v: string) => {
  const n = Number.parseFloat(v.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const factor = (name: string) => {
  const key = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (key.includes('beton')) return 0.18;
  if (key.includes('acier')) return 1.9;
  if (key.includes('verre')) return 1.05;
  if (key.includes('bois')) return 0.08;
  if (key.includes('aluminium')) return 8.2;
  return 0.35;
};
const fmt = (v: number) => `${n1.format(v)} tCO2e`;

const calculate = (payload: Payload): Result => {
  const materials = payload.materials
    .filter((m) => m.name.trim() && m.quantity > 0)
    .map((m, i) => ({
      name: m.name.trim(),
      quantity: m.quantity,
      factor: factor(m.name),
      emission: round(m.quantity * factor(m.name)),
      share: 0,
      color: T.colors[i % T.colors.length],
    }));
  const materialsEmission = materials.reduce((s, m) => s + m.emission, 0);
  const energyEmission = payload.energyMwh * 0.055;
  const gasEmission = payload.gasMwh * 0.227;
  const parkingEmission = payload.parkingSpaces * 0.95 + payload.employees * 0.12;
  const equipmentEmission = payload.computers * 0.16;
  const totalEmission = round(materialsEmission + energyEmission + gasEmission + parkingEmission + equipmentEmission);
  const categories: Category[] = [
    { key: 'materials' as CategoryKey, label: 'Matériaux', emission: round(materialsEmission), percentage: 0, color: '#14532D', helper: 'Impact cumulé des matériaux saisis' },
    { key: 'energy' as CategoryKey, label: 'Électricité', emission: round(energyEmission), percentage: 0, color: '#0F766E', helper: 'Consommation électrique annuelle' },
    { key: 'gas' as CategoryKey, label: 'Gaz', emission: round(gasEmission), percentage: 0, color: '#CA8A04', helper: 'Consommation de gaz annuelle' },
    { key: 'parking' as CategoryKey, label: 'Mobilité & parking', emission: round(parkingEmission), percentage: 0, color: '#B45309', helper: 'Stationnement et mobilité des collaborateurs' },
    { key: 'equipment' as CategoryKey, label: 'Équipement IT', emission: round(equipmentEmission), percentage: 0, color: '#155E75', helper: 'Ordinateurs et équipements des postes' },
  ].map((c) => ({ ...c, percentage: totalEmission > 0 ? round((c.emission / totalEmission) * 100, 1) : 0 }));
  const dominant = [...categories].sort((a, b) => b.emission - a.emission)[0];
  const enriched = materials.map((m) => ({ ...m, share: totalEmission > 0 ? round((m.emission / totalEmission) * 100, 1) : 0 }));
  const topMaterial = [...enriched].sort((a, b) => b.emission - a.emission)[0];
  return {
    siteName: payload.siteName,
    city: payload.city,
    totalEmission,
    emissionPerEmployee: payload.employees > 0 ? round(totalEmission / payload.employees, 2) : 0,
    dominantCategory: dominant.label,
    dominantShare: dominant.percentage,
    materialCount: enriched.length,
    categories,
    materials: enriched,
    insights: [
      `${dominant.label} représente ${dominant.percentage}% des émissions estimées du site.`,
      `Le site émet environ ${n2.format(payload.employees > 0 ? totalEmission / payload.employees : 0)} tCO2e par employé.`,
      topMaterial
        ? `${topMaterial.name} est le matériau le plus impactant avec ${n1.format(topMaterial.emission)} tCO2e estimées.`
        : "Ajoutez des matériaux pour enrichir l'analyse construction.",
      `${payload.parkingSpaces} places et ${payload.computers} postes informatiques alimentent déjà les stats de pilotage.`,
    ],
  };
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.chip}>
      <Text style={s.chipLabel}>{label}</Text>
      <Text style={s.chipValue}>{value}</Text>
    </View>
  );
}

function Donut({ categories, total }: { categories: Category[]; total: number }) {
  const size = 166;
  const stroke = 24;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View style={s.donutWrap}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(20,51,45,0.07)" strokeWidth={stroke} fill="none" />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {categories.map((c) => {
            const dash = (c.percentage / 100) * circ;
            const node = (
              <Circle
                key={c.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={c.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return node;
          })}
        </G>
      </Svg>
      <View style={s.donutCenter}>
        <Text style={s.donutValue}>{n1.format(total)}</Text>
        <Text style={s.donutText}>tCO2e</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [draft, setDraft] = useState(DEFAULT_PAYLOAD);
  const [result, setResult] = useState<Result>(() => calculate(DEFAULT_PAYLOAD));
  const [showModal, setShowModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [societyId, setSocietyId] = useState<number | null>(null);

  const hasErrors =
    !draft.siteName.trim() ||
    !draft.city.trim() ||
    draft.employees < 1 ||
    draft.materials.some((m) => !m.name.trim() || m.quantity <= 0);

  const bars = useMemo(() => {
    const max = Math.max(...result.categories.map((c) => c.emission), 1);
    return result.categories.map((c) => ({ ...c, height: Math.max(8, Math.round((c.emission / max) * 100)) }));
  }, [result]);

  const topMaterials = useMemo(() => [...result.materials].sort((a, b) => b.emission - a.emission), [result]);

  const openCalculator = () => {
    setDraft(payload);
    setSubmitted(false);
    setPage('calculator');
    setShowModal(true);
  };

  const applyCalculation = () => {
    setSubmitted(true);
    if (hasErrors) return;
    setPayload(draft);
    setResult(calculate(draft));
    setSaveFeedback(null);
    setSaveError(null);
    setShowModal(false);
  };

  const handleSaveCalculation = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveFeedback(null);
    setSaveError(null);

    try {
      let currentSocietyId = societyId;
      if (!currentSocietyId) {
        const society = await createSociety();
        currentSocietyId = society.id;
        setSocietyId(society.id);
      }

      const saved = await saveCalculation(
        {
          siteName: payload.siteName,
          city: payload.city,
          employees: payload.employees,
          parkingSpaces: payload.parkingSpaces,
          computers: payload.computers,
          energyMwh: payload.energyMwh,
          gasMwh: payload.gasMwh,
          totalCo2: result.totalEmission,
        },
        currentSocietyId,
      );

      setSaveFeedback(`Calcul sauvegardé le ${saved.calculationDate} (site #${saved.siteId}, bilan #${saved.bilanId}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setSaveError(`Impossible de sauvegarder le calcul. Vérifie que le backend Carbonaze écoute sur http://localhost:8080. Détail : ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const setText = (field: 'siteName' | 'city', value: string) => setDraft((p) => ({ ...p, [field]: value }));
  const setNum = (field: 'energyMwh' | 'gasMwh' | 'employees' | 'parkingSpaces' | 'computers', value: string) => setDraft((p) => ({ ...p, [field]: parse(value) }));
  const setMaterial = (index: number, field: 'name' | 'quantity', value: string) =>
    setDraft((p) => ({
      ...p,
      materials: p.materials.map((m, i) => (i === index ? { ...m, [field]: field === 'quantity' ? parse(value) : value } : m)),
    }));

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View style={[s.panel, s.topbar]}>
          <View style={s.brandRow}>
            <View style={s.logo}><View style={s.l1} /><View style={s.l2} /><View style={s.l3} /></View>
            <View style={s.brandBlock}>
              <Text style={s.brand}>Carbonaze</Text>
              <Text style={s.muted}>Plateforme de calcul et d'analyse des émissions CO2</Text>
            </View>
          </View>
          <View style={s.navRow}>
            <Pressable style={[s.navPill, page === 'home' ? s.navPillActive : null]} onPress={() => setPage('home')}><Text style={s.navText}>Home</Text></Pressable>
            <Pressable style={[s.navPill, page === 'calculator' ? s.navPillActive : null]} onPress={openCalculator}><Text style={s.navText}>Calcul</Text></Pressable>
            <View style={s.status}><View style={s.dot} /><Text style={s.statusText}>Analyse instantanée</Text></View>
          </View>
        </View>
      </View>

      <ScrollView style={s.safe} contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        {page === 'home' ? (
          <>
            <View style={[s.panel, s.heroPanel]}>
              <Text style={s.eyebrow}>Landing page</Text>
              <Text style={s.hero}>Pilotez les émissions de vos actifs avec Carbonaze.</Text>
              <Text style={s.copy}>Version mobile en plusieurs pages : une landing d'accueil, puis une page calcul avec édition en modal et dashboard de statistiques en fond.</Text>
              <View style={s.actions}>
                <Pressable style={s.primary} onPress={openCalculator}><Text style={s.primaryText}>Ouvrir le calculateur</Text></Pressable>
              </View>
            </View>

            <View style={[s.panel, s.space]}>
              <Text style={s.eyebrow}>Vue exécutive</Text>
              <Text style={s.title}>Une expérience claire, orientée décision.</Text>
              <View style={s.grid}>
                <Chip label="Workflow" value="Landing, calcul, édition, restitution" />
                <Chip label="Modal" value="La saisie s'ouvre dès l'arrivée sur la page calcul" />
                <Chip label="Dashboard" value="Stats, répartition, détails matériaux et insights" />
                <Chip label="Itération" value="Le bouton d'édition rappelle la modal à tout moment" />
              </View>
              <View style={s.dark}><Text style={s.darkEye}>Preview</Text><Text style={s.darkTitle}>Une base fidèle au front Angular, adaptée au mobile.</Text><Text style={s.darkText}>Les mêmes entrées et les mêmes formules de calcul sont conservées, avec un flux plus naturel pour une application Expo.</Text></View>
            </View>

            <View style={s.grid}>
              <Chip label="Site par défaut" value={result.siteName} />
              <Chip label="Émission totale" value={fmt(result.totalEmission)} />
              <Chip label="Catégorie dominante" value={`${result.dominantCategory} (${n1.format(result.dominantShare)}%)`} />
            </View>
          </>
        ) : (
          <>
            <View style={[s.panel, s.space]}>
              <Text style={s.eyebrow}>Page calcul</Text>
              <Text style={s.title}>{result.siteName}</Text>
              <Text style={s.muted}>{result.city}</Text>
              <View style={s.actions}>
                <Pressable style={s.primary} onPress={() => { setDraft(payload); setSubmitted(false); setShowModal(true); }}><Text style={s.primaryText}>Modifier le calcul</Text></Pressable>
                <Pressable style={[s.secondary, isSaving ? s.disabled : null]} onPress={handleSaveCalculation} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color={T.ink} /> : <Text style={s.secondaryText}>Sauvegarder le calcul</Text>}
                </Pressable>
                <Pressable style={s.secondary} onPress={() => setPage('home')}><Text style={s.secondaryText}>Retour landing</Text></Pressable>
              </View>
              {saveFeedback ? <Text style={s.successText}>{saveFeedback}</Text> : null}
              {saveError ? <Text style={s.errorText}>{saveError}</Text> : null}
            </View>

            <View style={s.grid}>
              <Chip label="Émission totale" value={fmt(result.totalEmission)} />
              <Chip label="Par employé" value={`${n2.format(result.emissionPerEmployee)} tCO2e`} />
              <Chip label="Catégorie dominante" value={result.dominantCategory} />
              <Chip label="Matériaux suivis" value={String(result.materialCount)} />
            </View>

            <View style={[s.panel, s.space]}>
              <Text style={s.eyebrow}>Répartition</Text>
              <Text style={s.sub}>Contribution de chaque poste</Text>
              <Donut categories={result.categories} total={result.totalEmission} />
              {result.categories.map((c) => (
                <View key={c.key} style={s.legend}>
                  <View style={s.legendLeft}><View style={[s.legendDot, { backgroundColor: c.color }]} /><View><Text style={s.legendTitle}>{c.label}</Text><Text style={s.legendHelp}>{c.helper}</Text></View></View>
                  <View><Text style={s.legendTitle}>{fmt(c.emission)}</Text><Text style={s.legendHelp}>{n1.format(c.percentage)}%</Text></View>
                </View>
              ))}
            </View>

            <View style={[s.panel, s.space]}>
              <Text style={s.eyebrow}>Comparatif interne</Text>
              <Text style={s.sub}>Niveau d'émission par catégorie</Text>
              <View style={s.bars}>
                {bars.map((c) => (
                  <View key={c.key} style={s.barCol}>
                    <View style={s.barRail}><View style={[s.barFill, { backgroundColor: c.color, height: `${c.height}%` }]} /></View>
                    <Text style={s.barLabel}>{c.label}</Text>
                    <Text style={s.barValue}>{n1.format(c.emission)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[s.panel, s.space]}>
              <Text style={s.eyebrow}>Matériaux</Text>
              <Text style={s.sub}>Contribution détaillée de l'inventaire</Text>
              {topMaterials.map((m) => (
                <View key={m.name} style={s.materialImpact}>
                  <View style={s.legendLeft}><View style={[s.legendDot, { backgroundColor: m.color }]} /><View><Text style={s.legendTitle}>{m.name}</Text><Text style={s.legendHelp}>Quantité {n1.format(m.quantity)} x facteur {n2.format(m.factor)}</Text></View></View>
                  <Text style={s.legendHelp}>{fmt(m.emission)} - {n1.format(m.share)}%</Text>
                  <View style={s.track}><View style={[s.fill, { width: `${Math.max(m.share, 4)}%`, backgroundColor: m.color }]} /></View>
                </View>
              ))}
            </View>

            <View style={s.grid}>
              <Chip label="Ville" value={result.city} />
              <Chip label="Employés" value={String(payload.employees)} />
              <Chip label="Parking" value={String(payload.parkingSpaces)} />
              <Chip label="Ordinateurs" value={String(payload.computers)} />
            </View>

            <View style={[s.panel, s.space]}>
              <Text style={s.eyebrow}>Commentaires automatiques</Text>
              <Text style={s.sub}>Points d'attention</Text>
              {result.insights.map((insight) => <View key={insight} style={s.note}><Text style={s.copy}>{insight}</Text></View>)}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showModal} animationType="fade" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalContent}>
              <Text style={s.eyebrow}>Calculateur</Text>
              <Text style={s.title}>Configurer le calcul</Text>
              <Text style={s.copy}>La modal s'ouvre automatiquement sur la page calcul. Tu peux la rappeler à tout moment via le bouton d'édition.</Text>

              <View style={s.formGrid}>
                {[
                  { label: 'Nom du site', value: draft.siteName, onChange: (v: string) => setText('siteName', v), placeholder: 'Carbonaze Rive Gauche', numeric: false, error: !draft.siteName.trim(), full: false },
                  { label: 'Ville', value: draft.city, onChange: (v: string) => setText('city', v), placeholder: 'Paris', numeric: false, error: !draft.city.trim(), full: false },
                  { label: 'Consommation électrique (MWh/an)', value: String(draft.energyMwh), onChange: (v: string) => setNum('energyMwh', v), placeholder: '1840', numeric: true, error: false, full: false },
                  { label: 'Consommation de gaz (MWh/an)', value: String(draft.gasMwh), onChange: (v: string) => setNum('gasMwh', v), placeholder: '620', numeric: true, error: false, full: false },
                  { label: "Nombre d'employés", value: String(draft.employees), onChange: (v: string) => setNum('employees', v), placeholder: '920', numeric: true, error: draft.employees < 1, full: false },
                  { label: 'Places de parking', value: String(draft.parkingSpaces), onChange: (v: string) => setNum('parkingSpaces', v), placeholder: '142', numeric: true, error: false, full: false },
                  { label: "Nombre d'ordinateurs", value: String(draft.computers), onChange: (v: string) => setNum('computers', v), placeholder: '1037', numeric: true, error: false, full: true },
                ].map((field) => (
                  <View key={field.label} style={[s.field, field.full ? s.full : null]}>
                    <Text style={s.label}>{field.label}</Text>
                    <TextInput value={field.value} onChangeText={field.onChange} placeholder={field.placeholder} placeholderTextColor={T.muted} keyboardType={field.numeric ? 'numeric' : 'default'} style={[s.input, submitted && field.error ? s.error : null]} />
                  </View>
                ))}
              </View>

              <View style={s.soft}>
                <View style={s.rowBetween}>
                  <View><Text style={s.eyebrow}>Matériaux</Text><Text style={s.sub}>Inventaire construction</Text></View>
                  <Pressable style={s.darkBtn} onPress={() => setDraft((p) => ({ ...p, materials: [...p.materials, { id: `${Date.now()}`, name: '', quantity: 0 }] }))}><Text style={s.darkBtnText}>Ajouter</Text></Pressable>
                </View>
                {draft.materials.map((m, i) => (
                  <View key={m.id} style={s.materialCard}>
                    <View style={s.field}><Text style={s.label}>Matériau</Text><TextInput value={m.name} onChangeText={(v) => setMaterial(i, 'name', v)} placeholder="Béton, acier, bois..." placeholderTextColor={T.muted} style={[s.input, submitted && !m.name.trim() ? s.error : null]} /></View>
                    <View style={s.field}><Text style={s.label}>Quantité</Text><TextInput value={m.quantity ? String(m.quantity) : ''} onChangeText={(v) => setMaterial(i, 'quantity', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={T.muted} style={[s.input, submitted && m.quantity <= 0 ? s.error : null]} /></View>
                    <Pressable disabled={draft.materials.length === 1} style={[s.secondary, draft.materials.length === 1 ? s.disabled : null]} onPress={() => setDraft((p) => ({ ...p, materials: p.materials.length === 1 ? p.materials : p.materials.filter((_, index) => index !== i) }))}><Text style={s.secondaryText}>Supprimer</Text></Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable style={s.secondary} onPress={() => setShowModal(false)}><Text style={s.secondaryText}>Fermer</Text></Pressable>
              <Pressable style={s.primary} onPress={applyCalculation}><Text style={s.primaryText}>Calculer</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.canvas },
  header: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12, backgroundColor: 'transparent' },
  page: { padding: 20, gap: 20, paddingBottom: 40 },
  panel: { backgroundColor: T.panel, borderRadius: 30, borderWidth: 1, borderColor: T.line, padding: 22 },
  topbar: {
    gap: 16,
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandBlock: { flex: 1, minWidth: 0 },
  logo: { width: 48, height: 48, borderRadius: 18, backgroundColor: T.moss, alignItems: 'center', justifyContent: 'center' },
  l1: { position: 'absolute', width: 20, height: 4, borderRadius: 99, backgroundColor: '#fff', transform: [{ rotate: '35deg' }, { translateY: -4 }] },
  l2: { position: 'absolute', width: 16, height: 4, borderRadius: 99, backgroundColor: '#fff', transform: [{ rotate: '-35deg' }, { translateY: 4 }] },
  l3: { position: 'absolute', width: 4, height: 18, borderRadius: 99, backgroundColor: '#fff' },
  brand: { fontSize: 22, fontWeight: '700', color: T.ink },
  muted: { color: T.muted, fontSize: 14, lineHeight: 22 },
  navRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  navPill: { borderWidth: 1, borderColor: T.lineStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.72)', maxWidth: '100%' },
  navPillActive: { backgroundColor: 'rgba(19,92,82,0.08)' },
  navText: { color: T.ink, fontWeight: '700', fontSize: 13 },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 1, borderColor: T.lineStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.72)', maxWidth: '100%', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: T.mint },
  statusText: { color: T.ink, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  heroPanel: { gap: 14 },
  eyebrow: { color: T.moss, fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, fontWeight: '700' },
  hero: { color: T.ink, fontSize: 38, lineHeight: 40, fontWeight: '700', marginTop: 10 },
  title: { color: T.ink, fontSize: 28, lineHeight: 32, fontWeight: '700', marginTop: 10 },
  sub: { color: T.ink, fontSize: 22, lineHeight: 26, fontWeight: '700', marginTop: 8 },
  copy: { color: T.muted, fontSize: 15, lineHeight: 26, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  primary: { backgroundColor: T.moss, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, alignSelf: 'flex-start' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondary: { borderWidth: 1, borderColor: T.lineStrong, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.84)', alignSelf: 'flex-start' },
  secondaryText: { color: T.ink, fontWeight: '700', fontSize: 14 },
  successText: { color: T.moss, fontSize: 14, lineHeight: 22, marginTop: 6, fontWeight: '600' },
  errorText: { color: '#A33A24', fontSize: 14, lineHeight: 22, marginTop: 6, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { minWidth: 150, flex: 1, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(20,51,45,0.08)', borderRadius: 20, padding: 16, gap: 10, minHeight: 100 },
  chipLabel: { color: T.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700' },
  chipValue: { color: T.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
  dark: { backgroundColor: T.ink, borderRadius: 26, padding: 18, gap: 10 },
  darkEye: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2.2, fontWeight: '700' },
  darkTitle: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '700' },
  darkText: { color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 24 },
  space: { gap: 16 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  field: { width: '100%', gap: 8 },
  full: { width: '100%' },
  label: { color: T.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2.2, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: 'rgba(20,51,45,0.12)', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', color: T.ink, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  error: { borderColor: 'rgba(196,66,40,0.55)' },
  soft: { backgroundColor: T.panelSoft, borderWidth: 1, borderColor: 'rgba(20,51,45,0.08)', borderRadius: 26, padding: 18, gap: 14 },
  badge: { color: T.moss, fontSize: 13, fontWeight: '600', backgroundColor: 'rgba(20,51,45,0.04)', borderWidth: 1, borderColor: T.lineStrong, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  rowBetween: { gap: 10 },
  darkBtn: { backgroundColor: T.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-start' },
  darkBtnText: { color: '#fff', fontWeight: '700' },
  materialCard: { backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(20,51,45,0.08)', borderRadius: 20, padding: 14, gap: 12 },
  donutWrap: { width: 166, height: 166, borderRadius: 999, backgroundColor: 'rgba(20,51,45,0.05)', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', width: 92, height: 92, borderRadius: 999, backgroundColor: 'rgba(255,253,247,0.98)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(20,51,45,0.06)' },
  donutValue: { color: T.ink, fontSize: 18, fontWeight: '700' },
  donutText: { color: T.muted, fontSize: 11 },
  legend: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: 'rgba(20,51,45,0.08)', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.76)', padding: 14 },
  legendLeft: { flexDirection: 'row', gap: 12, flex: 1, minWidth: 0 },
  legendDot: { width: 12, height: 12, borderRadius: 99, marginTop: 4 },
  legendTitle: { color: T.ink, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  legendHelp: { color: T.muted, fontSize: 13, lineHeight: 20, marginTop: 2, flexShrink: 1 },
  bars: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 210 },
  barCol: { flex: 1, alignItems: 'center', gap: 8, minWidth: 0 },
  barRail: { width: '100%', maxWidth: 56, height: 170, borderRadius: 999, backgroundColor: 'rgba(20,51,45,0.07)', overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderTopLeftRadius: 999, borderTopRightRadius: 999 },
  barLabel: { color: T.ink, fontSize: 11, textAlign: 'center', fontWeight: '700' },
  barValue: { color: T.muted, fontSize: 12 },
  materialImpact: { backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(20,51,45,0.08)', borderRadius: 20, padding: 14, gap: 12, minWidth: 0 },
  track: { height: 10, borderRadius: 999, backgroundColor: 'rgba(20,51,45,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  note: { backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(20,51,45,0.08)', borderRadius: 20, padding: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20,51,45,0.32)', padding: 16, justifyContent: 'center' },
  modalCard: { maxHeight: '88%', backgroundColor: T.canvas, borderRadius: 28, borderWidth: 1, borderColor: T.line, overflow: 'hidden' },
  modalContent: { padding: 18, gap: 14 },
  modalFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: 'rgba(255,255,255,0.5)' },
});
