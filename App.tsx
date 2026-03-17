import { StatusBar } from 'expo-status-bar';
import * as Network from 'expo-network';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  calculateSiteImpact,
  DEFAULT_CONFIGURED_MATERIALS,
  normalizeConfiguredMaterials,
  type ConfiguredMaterial,
  type SiteImpactResult,
  type SiteInputPayload,
  type SiteMaterialInput,
} from './src/siteImpact';
import {
  deleteBilan,
  getAuthSession,
  getBilanById,
  getBilans,
  getMaterials,
  getSiteComparisons,
  loginUser,
  logoutUser,
  registerUser,
  saveCalculation,
  saveMaterials,
  type AuthSession,
  type ApiBilanResponse,
  type ApiMaterialResponse,
  type ApiSiteComparisonResponse,
} from './src/services/carbonazeApi';
import { environment } from './src/environment/environment';

type Page = 'home' | 'calculator' | 'comparison';

const COLORS = {
  bg: '#F4F0E5',
  panel: '#FFFFFF',
  panelSoft: '#F8F6F1',
  ink: '#14332D',
  muted: '#5D736E',
  line: 'rgba(19,92,82,0.12)',
  moss: '#135C52',
  sand: '#C58C3A',
  alert: '#A33A24',
};

const EMPTY_PAYLOAD: SiteInputPayload = {
  siteName: '',
  city: '',
  energyMwh: 0,
  gasMwh: 0,
  employees: 0,
  parkingSpaces: 0,
  computers: 0,
  materials: [],
};

const n1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

const parseNumber = (value: string) => {
  const parsed = Number.parseFloat(value.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const createLocalId = (prefix: string) => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeName = (value?: string | null) => {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const formatEmission = (value: number) => `${n1.format(value)} tCO2e`;

const formatHistoryDate = (value?: string) => {
  if (!value) {
    return 'Date inconnue';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('fr-FR');
};

const sortComparisonSitesByEmission = (
  left: ApiSiteComparisonResponse,
  right: ApiSiteComparisonResponse,
) => {
  const leftTotal = typeof left.latestTotalCo2 === 'number' ? left.latestTotalCo2 : -1;
  const rightTotal = typeof right.latestTotalCo2 === 'number' ? right.latestTotalCo2 : -1;

  if (rightTotal !== leftTotal) {
    return rightTotal - leftTotal;
  }

  return left.name.localeCompare(right.name, 'fr');
};

const isOnlineState = (state: Network.NetworkState) => {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
};

const buildMaterialRow = (materials: ConfiguredMaterial[]): SiteMaterialInput => {
  const [firstMaterial] = normalizeConfiguredMaterials(materials);
  return {
    id: createLocalId('site-material'),
    materialId: firstMaterial?.id ?? '',
    name: firstMaterial?.name ?? '',
    quantity: 0,
  };
};

const mapApiMaterial = (material: ApiMaterialResponse, index: number): ConfiguredMaterial => ({
  id: `catalog-${material.id ?? index + 1}`,
  backendId: material.id,
  name: material.name,
  factor: Number(material.energeticValue.toFixed(2)),
});

const mergeCatalog = (current: ConfiguredMaterial[], incoming: ConfiguredMaterial[]) => {
  let merged = normalizeConfiguredMaterials(current);

  for (const candidate of incoming) {
    const index = merged.findIndex((material) => {
      return (
        (candidate.backendId !== undefined && material.backendId === candidate.backendId) ||
        normalizeName(material.name) === normalizeName(candidate.name)
      );
    });

    if (index === -1) {
      merged = [...merged, { ...candidate, pendingSync: false }];
      continue;
    }

    const existing = merged[index];
    merged = merged.map((material, materialIndex) => {
      if (materialIndex !== index) {
        return material;
      }

      return {
        ...existing,
        name: candidate.name,
        factor: candidate.factor,
        backendId: candidate.backendId ?? existing.backendId,
        pendingSync: false,
      };
    });
  }

  return normalizeConfiguredMaterials(merged);
};

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function App() {
  const calculatorScrollRef = useRef<ScrollView | null>(null);
  const materialInputOffsets = useRef<Record<string, number>>({});
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getAuthSession());
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authMail, setAuthMail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSocietyName, setAuthSocietyName] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [draft, setDraft] = useState<SiteInputPayload>(EMPTY_PAYLOAD);
  const [payload, setPayload] = useState<SiteInputPayload>(EMPTY_PAYLOAD);
  const [configuredMaterials, setConfiguredMaterials] = useState<ConfiguredMaterial[]>(
    () => DEFAULT_CONFIGURED_MATERIALS.map((material) => ({ ...material })),
  );
  const [result, setResult] = useState<SiteImpactResult>(() => {
    return calculateSiteImpact(EMPTY_PAYLOAD, DEFAULT_CONFIGURED_MATERIALS);
  });
  const [hasCalculated, setHasCalculated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isSyncingMaterials, setIsSyncingMaterials] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialFactor, setNewMaterialFactor] = useState('');
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [settingsSubmitted, setSettingsSubmitted] = useState(false);
  const [editingCatalogMaterialId, setEditingCatalogMaterialId] = useState<string | null>(null);
  const [editingCatalogName, setEditingCatalogName] = useState('');
  const [editingCatalogFactor, setEditingCatalogFactor] = useState('');
  const [activeCatalogMaterialId, setActiveCatalogMaterialId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<ApiBilanResponse[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [deletingBilanId, setDeletingBilanId] = useState<number | null>(null);
  const [openingBilanId, setOpeningBilanId] = useState<number | null>(null);
  const [comparisonSites, setComparisonSites] = useState<ApiSiteComparisonResponse[]>([]);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonFeedback, setComparisonFeedback] = useState<string | null>(null);

  const catalog = useMemo(() => normalizeConfiguredMaterials(configuredMaterials), [configuredMaterials]);
  const filteredCatalog = useMemo(() => {
    const query = normalizeName(materialSearchQuery);

    if (!query) {
      return catalog;
    }

    return catalog.filter((material) => normalizeName(material.name).includes(query));
  }, [catalog, materialSearchQuery]);
  const pendingMaterials = useMemo(() => catalog.filter((material) => material.pendingSync), [catalog]);
  const topMaterials = useMemo(() => [...result.materials].sort((a, b) => b.emission - a.emission), [result]);
  const rankedComparisonSites = useMemo(
    () => [...comparisonSites].sort(sortComparisonSitesByEmission),
    [comparisonSites],
  );
  const comparedSites = useMemo(
    () => rankedComparisonSites.filter((site) => typeof site.latestTotalCo2 === 'number'),
    [rankedComparisonSites],
  );
  const averageComparedEmission = useMemo(() => {
    if (comparedSites.length === 0) {
      return null;
    }

    const total = comparedSites.reduce((sum, site) => sum + (site.latestTotalCo2 ?? 0), 0);
    return total / comparedSites.length;
  }, [comparedSites]);
  const topComparedSite = comparedSites[0] ?? null;

  const hasErrors =
    !draft.siteName.trim() ||
    !draft.city.trim() ||
    draft.employees < 1 ||
    draft.materials.some((material) => !material.materialId || material.quantity <= 0);

  const handleAuthenticate = async () => {
    setAuthError(null);

    const normalizedMail = authMail.trim();
    const normalizedPassword = authPassword.trim();
    const normalizedSocietyName = authSocietyName.trim();

    if (!normalizedMail || !normalizedPassword || (isRegisterMode && !normalizedSocietyName)) {
      setAuthError('Renseignez tous les champs obligatoires.');
      return;
    }

    if (normalizedPassword.length < 8) {
      setAuthError('Le mot de passe doit contenir au moins 8 caracteres.');
      return;
    }

    setIsAuthenticating(true);

    try {
      const session = isRegisterMode
        ? await registerUser(normalizedMail, normalizedPassword, normalizedSocietyName)
        : await loginUser(normalizedMail, normalizedPassword);

      setAuthSession(session);
      setAuthPassword('');
      setAuthSocietyName('');
      setAuthError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setAuthError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    logoutUser();
    setAuthSession(null);
    setAuthPassword('');
    setAuthSocietyName('');
    setAuthError(null);
    setPage('home');
    setShowHistory(false);
    setShowSettings(false);
  };

  useEffect(() => {
    let mounted = true;
    const applyState = (state: Network.NetworkState) => {
      if (mounted) {
        setIsOnline(isOnlineState(state));
      }
    };

    void Network.getNetworkStateAsync()
      .then(applyState)
      .catch(() => {
        if (mounted) {
          setIsOnline(false);
        }
      });

    const subscription = Network.addNetworkStateListener(applyState);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (hasCalculated) {
      setResult(calculateSiteImpact(payload, catalog));
    }
  }, [catalog, hasCalculated, payload]);

  const refreshMaterials = async (showFeedback = true) => {
    if (!isOnline) {
      return;
    }

    setIsCatalogLoading(true);
    if (showFeedback) {
      setCatalogFeedback(null);
      setCatalogError(null);
    }

    try {
      const remoteMaterials = await getMaterials();
      setConfiguredMaterials((current) => mergeCatalog(current, remoteMaterials.map(mapApiMaterial)));

      if (showFeedback) {
        setCatalogFeedback(
          remoteMaterials.length > 0
            ? `${remoteMaterials.length} matériaux récupérés depuis l'API.`
            : 'Catalogue distant vide, catalogue local conservé.',
        );
      }
    } catch (error) {
      if (showFeedback) {
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        setCatalogError(`Impossible de récupérer les matériaux. Détail : ${message}`);
      }
    } finally {
      setIsCatalogLoading(false);
    }
  };

  const openCalculator = () => {
    setPage('calculator');
    if (isOnline) {
      void refreshMaterials(false);
    }
  };

  const loadComparison = async (showLoader = true) => {
    setComparisonError(null);

    if (showLoader) {
      setComparisonFeedback(null);
      setIsComparisonLoading(true);
    }

    try {
      const sites = await getSiteComparisons();
      setComparisonSites(sites);

      if (showLoader) {
        setComparisonFeedback(
          sites.length > 0 ? `${sites.length} sites recuperes pour comparaison.` : 'Aucun site compare.',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setComparisonError(`Impossible de charger la comparaison. Detail : ${message}`);
    } finally {
      if (showLoader) {
        setIsComparisonLoading(false);
      }
    }
  };

  const openComparison = () => {
    setPage('comparison');
    void loadComparison();
  };

  const handleSyncMaterials = async () => {
    if (!isOnline || isSyncingMaterials) {
      return;
    }

    setIsSyncingMaterials(true);
    setCatalogFeedback(null);
    setCatalogError(null);

    try {
      const unsynced = configuredMaterials.filter((material) => material.pendingSync);

      if (unsynced.length > 0) {
        const saved = await saveMaterials(
          unsynced.map((material) => ({
            id: material.backendId,
            name: material.name,
            energeticValue: material.factor,
            quantity: 0,
          })),
        );

        setConfiguredMaterials((current) => mergeCatalog(current, saved.map(mapApiMaterial)));
      }

      const remoteMaterials = await getMaterials();
      setConfiguredMaterials((current) => mergeCatalog(current, remoteMaterials.map(mapApiMaterial)));
      setCatalogFeedback(
        unsynced.length > 0 ? `${unsynced.length} matériaux synchronisés.` : 'Catalogue synchronisé.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setCatalogError(`Synchronisation impossible. Détail : ${message}`);
    } finally {
      setIsSyncingMaterials(false);
    }
  };

  const handleAddConfiguredMaterial = async () => {
    setSettingsSubmitted(true);
    setCatalogFeedback(null);
    setCatalogError(null);

    const materialName = newMaterialName.trim();
    const factor = parseNumber(newMaterialFactor);

    if (!materialName || factor <= 0) {
      return;
    }

    if (catalog.some((material) => normalizeName(material.name) === normalizeName(materialName))) {
      setCatalogError('Ce matériau existe déjà dans le catalogue.');
      return;
    }

    const localMaterial: ConfiguredMaterial = {
      id: createLocalId('catalog'),
      name: materialName,
      factor: Number(factor.toFixed(2)),
      pendingSync: !isOnline,
    };

    setConfiguredMaterials((current) => [...current, localMaterial]);
    setNewMaterialName('');
    setNewMaterialFactor('');
    setSettingsSubmitted(false);
    setShowAddMaterialForm(false);

    if (!isOnline) {
      setCatalogFeedback(`${materialName} ajouté hors ligne. Synchronisez plus tard.`);
      return;
    }

    try {
      const saved = await saveMaterials([
        {
          name: localMaterial.name,
          energeticValue: localMaterial.factor,
          quantity: 0,
        },
      ]);

      setConfiguredMaterials((current) => mergeCatalog(current, saved.map(mapApiMaterial)));
      setCatalogFeedback(`${materialName} ajouté et synchronisé.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setConfiguredMaterials((current) =>
        current.map((material) =>
          material.id === localMaterial.id ? { ...material, pendingSync: true } : material,
        ),
      );
      setCatalogError(`Le matériau est ajouté localement mais pas synchronisé. Détail : ${message}`);
    }
  };

  const handleStartEditingConfiguredMaterial = (material: ConfiguredMaterial) => {
    setEditingCatalogMaterialId(material.id);
    setEditingCatalogName(material.name);
    setEditingCatalogFactor(material.factor ? String(material.factor) : '');
    setCatalogFeedback(null);
    setCatalogError(null);
  };

  const handleCancelEditingConfiguredMaterial = () => {
    setEditingCatalogMaterialId(null);
    setEditingCatalogName('');
    setEditingCatalogFactor('');
  };

  const handleSaveConfiguredMaterial = async (materialId: string) => {
    const material = configuredMaterials.find((item) => item.id === materialId);

    if (!material || editingCatalogMaterialId !== materialId) {
      return;
    }

    const normalizedName = editingCatalogName.trim();
    const normalizedFactor = parseNumber(editingCatalogFactor);

    if (!normalizedName || !Number.isFinite(normalizedFactor) || normalizedFactor <= 0) {
      setCatalogError('Chaque matériau du catalogue doit avoir un nom et un facteur valides.');
      return;
    }

    const duplicateExists = configuredMaterials.some((item) => {
      if (item.id === materialId) {
        return false;
      }

      return normalizeName(item.name) === normalizeName(normalizedName);
    });

    if (duplicateExists) {
      setCatalogError('Un autre matériau du catalogue porte déjà ce nom.');
      return;
    }

    setCatalogFeedback(null);
    setCatalogError(null);

    if (!isOnline) {
      setConfiguredMaterials((current) =>
        current.map((item) =>
          item.id === materialId
            ? {
                ...item,
                name: normalizedName,
                factor: Number(normalizedFactor.toFixed(2)),
                pendingSync: true,
              }
            : item,
        ),
      );
      handleCancelEditingConfiguredMaterial();
      setCatalogFeedback(`${normalizedName} mis à jour hors ligne. Synchronisez plus tard.`);
      return;
    }

    setActiveCatalogMaterialId(materialId);

    try {
      const savedMaterials = await saveMaterials([
        {
          id: material.backendId,
          name: normalizedName,
          energeticValue: Number(normalizedFactor.toFixed(2)),
          quantity: 0,
        },
      ]);

      setConfiguredMaterials((current) => mergeCatalog(current, savedMaterials.map(mapApiMaterial)));
      handleCancelEditingConfiguredMaterial();
      setCatalogFeedback(`${normalizedName} mis à jour et synchronisé.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setConfiguredMaterials((current) =>
        current.map((item) =>
          item.id === materialId
            ? {
                ...item,
                name: normalizedName,
                factor: Number(normalizedFactor.toFixed(2)),
                pendingSync: true,
              }
            : item,
        ),
      );
      handleCancelEditingConfiguredMaterial();
      setCatalogError(`Modification enregistrée localement mais non synchronisée. Détail : ${message}`);
    } finally {
      setActiveCatalogMaterialId(null);
    }
  };

  const setSiteText = (field: 'siteName' | 'city', value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const setSiteNumber = (
    field: 'energyMwh' | 'gasMwh' | 'employees' | 'parkingSpaces' | 'computers',
    value: string,
  ) => {
    setDraft((current) => ({ ...current, [field]: parseNumber(value) }));
  };

  const handleAddMaterialRow = () => {
    setDraft((current) => ({
      ...current,
      materials: [...current.materials, buildMaterialRow(catalog)],
    }));
  };

  const handleSetMaterialQuantity = (rowId: string, value: string) => {
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === rowId ? { ...material, quantity: parseNumber(value) } : material,
      ),
    }));
  };

  const handleRemoveMaterialRow = (rowId: string) => {
    setDraft((current) => ({
      ...current,
      materials: current.materials.filter((material) => material.id !== rowId),
    }));
  };

  const handleMaterialCardLayout = (rowId: string, offsetY: number) => {
    materialInputOffsets.current[rowId] = offsetY;
  };

  const handleMaterialQuantityFocus = (rowId: string) => {
    const offsetY = materialInputOffsets.current[rowId];

    if (offsetY === undefined) {
      return;
    }

    calculatorScrollRef.current?.scrollTo({
      y: Math.max(offsetY - 160, 0),
      animated: true,
    });
  };

  const handleSelectMaterial = (selectedMaterial: ConfiguredMaterial) => {
    if (!pickerRowId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === pickerRowId
          ? {
              ...material,
              materialId: selectedMaterial.id,
              name: selectedMaterial.name,
            }
          : material,
      ),
    }));
    setPickerRowId(null);
  };

  const applyCalculation = () => {
    setSubmitted(true);
    if (hasErrors) {
      return;
    }

    const nextPayload = {
      ...draft,
      materials: draft.materials.filter((material) => material.materialId && material.quantity > 0),
    };

    setPayload(nextPayload);
    setResult(calculateSiteImpact(nextPayload, catalog));
    setHasCalculated(true);
    setSaveFeedback(null);
    setSaveError(null);
  };

  const loadHistory = async (showLoader = true) => {
    setHistoryError(null);

    if (showLoader) {
      setHistoryFeedback(null);
      setIsHistoryLoading(true);
    }

    try {
      const bilans = await getBilans();
      setHistoryItems(bilans);

      if (showLoader) {
        setHistoryFeedback(
          bilans.length > 0 ? `${bilans.length} calculs sauvegard\u00E9s r\u00E9cup\u00E9r\u00E9s.` : 'Aucun calcul sauvegard\u00E9.',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setHistoryError(`Impossible de charger l'historique. D\u00E9tail : ${message}`);
    } finally {
      if (showLoader) {
        setIsHistoryLoading(false);
      }
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    void loadHistory();
  };

  const handleLoadSavedBilan = async (bilan: ApiBilanResponse) => {
    if (openingBilanId !== null) {
      return;
    }

    setOpeningBilanId(bilan.id);
    setHistoryError(null);
    setHistoryFeedback(null);

    try {
      const loadedBilan = await getBilanById(bilan.id);
      const sourceSite = loadedBilan.site ?? bilan.site;
      const siteName = sourceSite?.name?.trim() || '';
      const city = sourceSite?.city?.trim() || '';
      const loadedMaterials = Array.isArray(loadedBilan.materials) ? loadedBilan.materials : [];
      const nextMaterials = loadedMaterials.reduce<SiteMaterialInput[]>((materials, material) => {
        const quantity =
          typeof material.quantity === 'number' && Number.isFinite(material.quantity)
            ? material.quantity
            : 0;

        if (!material.name || quantity <= 0) {
          return materials;
        }

        const configuredMaterial =
          (typeof material.materialId === 'number'
            ? catalog.find((candidate) => candidate.backendId === material.materialId)
            : undefined) ??
          catalog.find((candidate) => normalizeName(candidate.name) === normalizeName(material.name));

        if (!configuredMaterial) {
          return materials;
        }

        materials.push({
          id: createLocalId('site-material'),
          materialId: configuredMaterial.id,
          name: configuredMaterial.name,
          quantity,
        });

        return materials;
      }, []);
      const nextDraft: SiteInputPayload = {
        siteName,
        city,
        energyMwh:
          typeof loadedBilan.electricityKwhYear === 'number' ? loadedBilan.electricityKwhYear / 1000 : 0,
        gasMwh: typeof loadedBilan.gasKwhYear === 'number' ? loadedBilan.gasKwhYear / 1000 : 0,
        employees:
          typeof sourceSite?.numberEmployee === 'number' && Number.isFinite(sourceSite.numberEmployee)
            ? sourceSite.numberEmployee
            : 0,
        parkingSpaces:
          typeof sourceSite?.parkingPlaces === 'number' && Number.isFinite(sourceSite.parkingPlaces)
            ? sourceSite.parkingPlaces
            : 0,
        computers:
          typeof sourceSite?.numberPc === 'number' && Number.isFinite(sourceSite.numberPc)
            ? sourceSite.numberPc
            : 0,
        materials: nextMaterials.length > 0 ? nextMaterials : [buildMaterialRow(catalog)],
      };

      setDraft(nextDraft);
      setPayload(nextDraft);
      setSubmitted(false);
      setHasCalculated(false);
      setPage('calculator');
      setShowHistory(false);
      setHistoryError(null);
      setHistoryFeedback(null);
      setSaveError(null);
      setSaveFeedback(
        `Bilan charge depuis l'API du ${formatHistoryDate(loadedBilan.calculationDate)}. Les donnees de consommation et du site disponibles ont ete pre-remplies.`,
      );

      requestAnimationFrame(() => {
        calculatorScrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setHistoryError(`Impossible de charger ce bilan. Détail : ${message}`);
    } finally {
      setOpeningBilanId(null);
    }
  };

  const handleDeleteBilan = async (bilanId: number) => {
    if (deletingBilanId !== null) {
      return;
    }

    setDeletingBilanId(bilanId);
    setHistoryError(null);
    setHistoryFeedback(null);

    try {
      await deleteBilan(bilanId);
      setHistoryItems((current) => current.filter((item) => item.id !== bilanId));
      setHistoryFeedback('Calcul supprim\u00E9 de l\'historique.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setHistoryError(`Impossible de supprimer ce calcul. D\u00E9tail : ${message}`);
    } finally {
      setDeletingBilanId(null);
    }
  };

  const handleSaveCalculation = async () => {
    if (isSaving || !hasCalculated) {
      return;
    }

    setIsSaving(true);
    setSaveFeedback(null);
    setSaveError(null);

    try {
      const materialsPayload = result.materials.map((material) => {
        const catalogMaterial = catalog.find(
          (candidate) => normalizeName(candidate.name) === normalizeName(material.name),
        );

        return {
          materialId: catalogMaterial?.backendId,
          name: material.name,
          quantity: material.quantity,
          factor: material.factor,
          emission: material.emission,
        };
      });

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
          materials: materialsPayload,
        },
      );

      setSaveFeedback(`Calcul sauvegardé le ${saved.calculationDate}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      setSaveError(
        `Impossible de sauvegarder le calcul. Vérifiez ${environment.apiUrl}. Détail : ${message}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const pickerRow = draft.materials.find((material) => material.id === pickerRowId) ?? null;
  const siteFields: Array<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    numeric: boolean;
    error: boolean;
  }> = [
    {
      label: 'Nom du site',
      value: draft.siteName,
      onChange: (value: string) => setSiteText('siteName', value),
      numeric: false,
      error: !draft.siteName.trim(),
    },
    {
      label: 'Ville',
      value: draft.city,
      onChange: (value: string) => setSiteText('city', value),
      numeric: false,
      error: !draft.city.trim(),
    },
    {
      label: 'Électricité (MWh/an)',
      value: draft.energyMwh ? String(draft.energyMwh) : '',
      onChange: (value: string) => setSiteNumber('energyMwh', value),
      numeric: true,
      error: false,
    },
    {
      label: 'Gaz (MWh/an)',
      value: draft.gasMwh ? String(draft.gasMwh) : '',
      onChange: (value: string) => setSiteNumber('gasMwh', value),
      numeric: true,
      error: false,
    },
    {
      label: 'Employés',
      value: draft.employees ? String(draft.employees) : '',
      onChange: (value: string) => setSiteNumber('employees', value),
      numeric: true,
      error: draft.employees < 1,
    },
    {
      label: 'Places de parking',
      value: draft.parkingSpaces ? String(draft.parkingSpaces) : '',
      onChange: (value: string) => setSiteNumber('parkingSpaces', value),
      numeric: true,
      error: false,
    },
    {
      label: 'Ordinateurs',
      value: draft.computers ? String(draft.computers) : '',
      onChange: (value: string) => setSiteNumber('computers', value),
      numeric: true,
      error: false,
    },
  ];

  const resolveComparisonTotal = (site: ApiSiteComparisonResponse) => {
    if (typeof site.latestTotalCo2 !== 'number' || !Number.isFinite(site.latestTotalCo2)) {
      return 'Aucun bilan';
    }

    return formatEmission(site.latestTotalCo2);
  };

  const resolveComparisonPerEmployee = (site: ApiSiteComparisonResponse) => {
    if (
      typeof site.latestTotalCo2 !== 'number' ||
      !Number.isFinite(site.latestTotalCo2) ||
      typeof site.numberEmployee !== 'number' ||
      site.numberEmployee <= 0
    ) {
      return 'Indisponible';
    }

    return `${n2.format(site.latestTotalCo2 / site.numberEmployee)} tCO2e`;
  };

  const resolveComparisonEnergy = (site: ApiSiteComparisonResponse) => {
    if (
      typeof site.latestElectricityKwhYear !== 'number' ||
      !Number.isFinite(site.latestElectricityKwhYear)
    ) {
      return 'Indisponible';
    }

    return `${n1.format(site.latestElectricityKwhYear / 1000)} MWh/an`;
  };

  const resolveComparisonDate = (site: ApiSiteComparisonResponse) => {
    if (!site.latestCalculationDate) {
      return 'Date inconnue';
    }

    return formatHistoryDate(site.latestCalculationDate);
  };

  if (!authSession) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
          >
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.panel}>
                <Text style={styles.eyebrow}>Authentification JWT</Text>
                <Text style={styles.title}>{isRegisterMode ? "S'inscrire" : 'Se connecter'}</Text>
                <Text style={styles.copy}>
                  {isRegisterMode
                    ? 'Creez un compte pour votre societe afin de recevoir un token JWT.'
                    : 'Connectez-vous pour acceder aux APIs protegees Carbonaze.'}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    style={isRegisterMode ? styles.secondaryButton : styles.primaryButton}
                    onPress={() => {
                      setIsRegisterMode(false);
                      setAuthError(null);
                    }}
                  >
                    <Text style={isRegisterMode ? styles.secondaryButtonText : styles.primaryButtonText}>Connexion</Text>
                  </Pressable>
                  <Pressable
                    style={isRegisterMode ? styles.primaryButton : styles.secondaryButton}
                    onPress={() => {
                      setIsRegisterMode(true);
                      setAuthError(null);
                    }}
                  >
                    <Text style={isRegisterMode ? styles.primaryButtonText : styles.secondaryButtonText}>Inscription</Text>
                  </Pressable>
                </View>

                {isRegisterMode ? (
                  <View style={styles.field}>
                    <Text style={styles.label}>Societe</Text>
                    <TextInput
                      value={authSocietyName}
                      onChangeText={setAuthSocietyName}
                      autoCapitalize="words"
                      placeholder="Nom de votre societe"
                      style={styles.input}
                    />
                  </View>
                ) : null}

                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    value={authMail}
                    onChangeText={setAuthMail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="vous@entreprise.com"
                    style={styles.input}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Mot de passe</Text>
                  <TextInput
                    value={authPassword}
                    onChangeText={setAuthPassword}
                    secureTextEntry
                    placeholder="8 caracteres minimum"
                    style={styles.input}
                  />
                </View>

                {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

                <Pressable
                  style={[styles.primaryButton, isAuthenticating ? styles.disabled : null]}
                  onPress={() => void handleAuthenticate()}
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {isRegisterMode ? 'Creer mon compte' : 'Se connecter'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />

        <View style={styles.header}>
          <Text style={styles.brand}>Carbonaze</Text>
          <Text style={styles.smallText}>
            {authSession.mail} - {authSession.societyName}
          </Text>
          <View style={styles.nav}>
            <Pressable style={[styles.navButton, page === 'home' ? styles.navButtonActive : null]} onPress={() => setPage('home')}>
              <Text style={styles.navButtonText}>Accueil</Text>
            </Pressable>
            <Pressable style={[styles.navButton, page === 'calculator' ? styles.navButtonActive : null]} onPress={openCalculator}>
              <Text style={styles.navButtonText}>Calculateur</Text>
            </Pressable>
            <Pressable style={[styles.navButton, page === 'comparison' ? styles.navButtonActive : null]} onPress={openComparison}>
              <Text style={styles.navButtonText}>Comparaison</Text>
            </Pressable>
            <Pressable style={styles.navButton} onPress={handleLogout}>
              <Text style={styles.navButtonText}>Deconnexion</Text>
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
        <ScrollView
          ref={calculatorScrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
        {page === 'home' ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>Landing page</Text>
              <Text style={styles.title}>Centralisez vos données site</Text>
              <Text style={styles.copy}>
                Carbonaze centralise les données d'un site et restitue une analyse claire des
                émissions CO2.
              </Text>
              <View style={styles.statusRow}>
                <Text style={styles.smallText}>
                  Plateforme de calcul et d'analyse des émissions CO2
                </Text>
              </View>
              <Pressable style={styles.primaryButton} onPress={openCalculator}>
                <Text style={styles.primaryButtonText}>Ouvrir le calculateur</Text>
              </Pressable>
            </View>

            <View style={styles.grid}>
              <Metric
                label="Données site"
                value="Ville, énergie, gaz et effectifs"
                accent={COLORS.moss}
              />
              <Metric
                label="Catalogue"
                value="Matériaux paramétrables et synchronisables"
                accent={COLORS.sand}
              />
              <Metric
                label="Restitution"
                value="Analyse claire des émissions CO2"
                accent={COLORS.ink}
              />
            </View>

            <View style={styles.panelSoft}>
              <Text style={styles.sectionTitle}>Une expérience simple et directe</Text>
              <Text style={styles.copy}>
                La landing mobile reprend le message essentiel du front: partir des données du
                site, structurer l'inventaire et restituer un bilan lisible sans surcharger
                l'écran d'accueil.
              </Text>
            </View>
          </>
        ) : page === 'calculator' ? (
            <>
              <View style={styles.panel}>
                <Text style={styles.eyebrow}>État</Text>
                <Text style={styles.title}>Calculateur mobile</Text>
                <Text style={styles.copy}>
                  {isOnline ? 'Connexion détectée, la synchronisation est disponible.' : 'Hors ligne, les ajouts restent locaux.'}
                </Text>
                <View style={styles.statusRow}>
                  <Text style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
                    {isOnline ? 'En ligne' : 'Hors ligne'}
                  </Text>
                    <Text style={styles.smallText}>{pendingMaterials.length} matériaux en attente</Text>
                </View>
                <View style={styles.actions}>
                  <Pressable style={styles.primaryButton} onPress={() => setShowSettings(true)}>
                    <Text style={styles.primaryButtonText}>Paramètres matériaux</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, !isOnline || isSyncingMaterials ? styles.disabled : null]}
                    onPress={handleSyncMaterials}
                    disabled={!isOnline || isSyncingMaterials}
                  >
                    {isSyncingMaterials ? <ActivityIndicator color={COLORS.ink} /> : <Text style={styles.secondaryButtonText}>Synchroniser</Text>}
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, !hasCalculated || isSaving ? styles.disabled : null]}
                    onPress={handleSaveCalculation}
                    disabled={!hasCalculated || isSaving}
                  >
                    {isSaving ? <ActivityIndicator color={COLORS.ink} /> : <Text style={styles.secondaryButtonText}>Sauvegarder</Text>}
                  </Pressable>
                </View>
                {isCatalogLoading ? (
                  <View style={styles.infoRow}>
                    <ActivityIndicator color={COLORS.moss} />
                    <Text style={styles.smallText}>Récupération des matériaux distants...</Text>
                  </View>
                ) : null}
                {catalogFeedback ? <Text style={styles.successText}>{catalogFeedback}</Text> : null}
                {catalogError ? <Text style={styles.errorText}>{catalogError}</Text> : null}
                {saveFeedback ? <Text style={styles.successText}>{saveFeedback}</Text> : null}
                {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
              </View>

              <View style={styles.panel}>
                <Text style={styles.eyebrow}>Site</Text>
                    <Text style={styles.sectionTitle}>Informations générales</Text>
                {siteFields.map((field) => (
                  <View key={field.label} style={styles.field}>
                    <Text style={styles.label}>{field.label}</Text>
                    <TextInput
                      value={field.value}
                      onChangeText={field.onChange}
                      keyboardType={field.numeric ? 'numeric' : 'default'}
                      style={[styles.input, submitted && field.error ? styles.inputError : null]}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.panel}>
                <View style={styles.rowBetween}>
                  <View>
                  <Text style={styles.eyebrow}>Matériaux</Text>
                  <Text style={styles.sectionTitle}>Sélection depuis le catalogue</Text>
                </View>
                  <Pressable style={styles.secondaryButton} onPress={handleAddMaterialRow}>
                    <Text style={styles.secondaryButtonText}>Ajouter</Text>
                  </Pressable>
                </View>

                {draft.materials.length === 0 ? <Text style={styles.copy}>Aucun matériau sélectionné pour le moment.</Text> : null}

                {draft.materials.map((material) => {
                  const selected = catalog.find((item) => item.id === material.materialId);
                  return (
                    <View
                      key={material.id}
                      style={styles.materialCard}
                      onLayout={(event) => handleMaterialCardLayout(material.id, event.nativeEvent.layout.y)}
                    >
                      <Pressable
                        style={[styles.selectField, submitted && !material.materialId ? styles.inputError : null]}
                        onPress={() => setPickerRowId(material.id)}
                      >
                        <Text style={styles.selectValue}>{(selected?.name ?? material.name) || 'Choisir un matériau'}</Text>
                        <Text style={styles.smallText}>
                          {selected ? `Facteur ${n2.format(selected.factor)} tCO2e / unité` : 'Catalogue requis'}
                        </Text>
                      </Pressable>
                      <TextInput
                        value={material.quantity ? String(material.quantity) : ''}
                        onChangeText={(value) => handleSetMaterialQuantity(material.id, value)}
                        onFocus={() => handleMaterialQuantityFocus(material.id)}
                        keyboardType="numeric"
                        placeholder="Quantité"
                        style={[styles.input, submitted && material.quantity <= 0 ? styles.inputError : null]}
                      />
                      <Pressable style={styles.secondaryButton} onPress={() => handleRemoveMaterialRow(material.id)}>
                        <Text style={styles.secondaryButtonText}>Supprimer</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              <View style={styles.panel}>
                <Text style={styles.eyebrow}>Calcul</Text>
                <Text style={styles.sectionTitle}>Générer le bilan du site</Text>
                <Pressable style={styles.primaryButton} onPress={applyCalculation}>
                  <Text style={styles.primaryButtonText}>Calculer l'impact</Text>
                </Pressable>
                {submitted && hasErrors ? (
                  <Text style={styles.errorText}>
                    Renseignez le nom du site, la ville, les employés et les quantités des matériaux ajoutés.
                  </Text>
                ) : null}
              </View>

              {hasCalculated ? (
                <>
                  <View style={styles.grid}>
                    <Metric label="Total" value={formatEmission(result.totalEmission)} accent={COLORS.moss} />
                    <Metric label="Par employé" value={`${n2.format(result.emissionPerEmployee)} tCO2e`} accent={COLORS.sand} />
                    <Metric label="Catégorie dominante" value={result.dominantCategory} accent={COLORS.ink} />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.eyebrow}>Répartition</Text>
                    <Text style={styles.sectionTitle}>Postes d'émission</Text>
                    {result.categories.map((category) => (
                      <View key={category.key} style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{category.label}</Text>
                          <Text style={styles.smallText}>{category.helper}</Text>
                        </View>
                        <Text style={styles.listValue}>{formatEmission(category.emission)} - {n1.format(category.percentage)}%</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.eyebrow}>Matériaux</Text>
                    <Text style={styles.sectionTitle}>Détail du calcul</Text>
                    {topMaterials.length === 0 ? <Text style={styles.copy}>Aucun matériau saisi.</Text> : null}
                    {topMaterials.map((material) => (
                      <View key={`${material.name}-${material.factor}`} style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{material.name}</Text>
                          <Text style={styles.smallText}>
                          Quantité {n1.format(material.quantity)} x facteur {n2.format(material.factor)}
                          </Text>
                        </View>
                        <Text style={styles.listValue}>{formatEmission(material.emission)}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.eyebrow}>Insights</Text>
                    <Text style={styles.sectionTitle}>Commentaires automatiques</Text>
                    {result.insights.map((insight) => (
                      <Text key={insight} style={styles.copy}>{insight}</Text>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.hotbarSpacer} />
            </>
          ) : (
            <>
              <View style={styles.panel}>
                <Text style={styles.eyebrow}>Comparaison</Text>
                <Text style={styles.title}>Sites sauvegardes</Text>
                <Text style={styles.copy}>
                  Comparez le dernier bilan disponible pour chaque site enregistre dans la base.
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.secondaryButton, isComparisonLoading ? styles.disabled : null]}
                    onPress={() => void loadComparison()}
                    disabled={isComparisonLoading}
                  >
                    {isComparisonLoading ? <ActivityIndicator color={COLORS.ink} /> : <Text style={styles.secondaryButtonText}>Actualiser</Text>}
                  </Pressable>
                </View>

                {isComparisonLoading ? (
                  <View style={styles.infoRow}>
                    <ActivityIndicator color={COLORS.moss} />
                    <Text style={styles.smallText}>Chargement de la comparaison...</Text>
                  </View>
                ) : null}
                {comparisonFeedback ? <Text style={styles.successText}>{comparisonFeedback}</Text> : null}
                {comparisonError ? <Text style={styles.errorText}>{comparisonError}</Text> : null}
              </View>

              <View style={styles.grid}>
                <Metric label="Sites compares" value={`${comparedSites.length}`} accent={COLORS.moss} />
                <Metric
                  label="Moyenne"
                  value={averageComparedEmission === null ? 'Indisponible' : `${n1.format(averageComparedEmission)} tCO2e`}
                  accent={COLORS.sand}
                />
                <Metric label="Plus emetteur" value={topComparedSite?.name ?? 'Indisponible'} accent={COLORS.ink} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.eyebrow}>Classement</Text>
                <Text style={styles.sectionTitle}>Dernier bilan par site</Text>

                {rankedComparisonSites.map((site) => (
                  <View key={site.id} style={styles.catalogCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.listMain}>
                        <Text style={styles.listTitle}>{site.name}</Text>
                        <Text style={styles.smallText}>
                          {site.city} - {resolveComparisonDate(site)}
                        </Text>
                        <Text style={styles.smallText}>
                          Employes {site.numberEmployee} | Parking {site.parkingPlaces} | IT {site.numberPc}
                        </Text>
                      </View>
                      <View style={styles.comparisonValueBlock}>
                        <Text style={styles.listValue}>{resolveComparisonTotal(site)}</Text>
                        <Text style={styles.smallText}>{resolveComparisonPerEmployee(site)}</Text>
                        <Text style={styles.smallText}>{resolveComparisonEnergy(site)}</Text>
                      </View>
                    </View>
                  </View>
                ))}

                {rankedComparisonSites.length === 0 && !isComparisonLoading ? (
                  <Text style={styles.smallText}>Aucun site sauvegarde n'a encore ete trouve.</Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
        </KeyboardAvoidingView>

        {page === 'calculator' ? (
          <View style={styles.hotbar}>
            <Pressable style={styles.hotbarButton} onPress={openHistory}>
              <Text style={styles.hotbarButtonText}>Historique</Text>
            </Pressable>
            <Pressable style={styles.hotbarButton} onPress={() => setShowSettings(true)}>
              <Text style={styles.hotbarButtonText}>Catalogue</Text>
            </Pressable>
            <Pressable
              style={[styles.hotbarButton, !hasCalculated || isSaving ? styles.disabled : null]}
              onPress={handleSaveCalculation}
              disabled={!hasCalculated || isSaving}
            >
              {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.hotbarButtonText}>Sauvegarder</Text>}
            </Pressable>
          </View>
        ) : null}

        <Modal visible={showSettings} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.eyebrow}>Paramètres</Text>
                <Text style={styles.title}>Catalogue matériaux</Text>
                <Text style={styles.copy}>
                  Gérez ici le référentiel des matériaux disponibles dans le calculateur. Le catalogue
                  centralise les facteurs CO2 utilisés par les équipes et facilite la synchronisation
                  avec l'API quand la connexion est disponible.
                </Text>

                <View style={styles.field}>
                  <Text style={styles.label}>Rechercher un matériau</Text>
                  <TextInput
                    value={materialSearchQuery}
                    onChangeText={setMaterialSearchQuery}
                    placeholder="Nom du matériau"
                    style={styles.input}
                  />
                </View>

                <View style={styles.panel}>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => {
                      const nextValue = !showAddMaterialForm;
                      setShowAddMaterialForm(nextValue);
                      if (!nextValue) {
                        setNewMaterialName('');
                        setNewMaterialFactor('');
                        setSettingsSubmitted(false);
                      }
                    }}
                  >
                    <Text style={styles.primaryButtonText}>Ajouter au catalogue</Text>
                  </Pressable>

                  {showAddMaterialForm ? (
                    <View style={styles.panelSoft}>
                      <View style={styles.field}>
                        <Text style={styles.label}>Nom du matériau</Text>
                        <TextInput
                          value={newMaterialName}
                          onChangeText={setNewMaterialName}
                          style={[styles.input, settingsSubmitted && !newMaterialName.trim() ? styles.inputError : null]}
                        />
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.label}>Facteur CO2</Text>
                        <TextInput
                          value={newMaterialFactor}
                          onChangeText={setNewMaterialFactor}
                          keyboardType="numeric"
                          style={[styles.input, settingsSubmitted && parseNumber(newMaterialFactor) <= 0 ? styles.inputError : null]}
                        />
                      </View>
                      <View style={styles.actions}>
                        <Pressable style={styles.primaryButton} onPress={() => void handleAddConfiguredMaterial()}>
                          <Text style={styles.primaryButtonText}>Enregistrer le matériau</Text>
                        </Pressable>
                        <Pressable
                          style={styles.secondaryButton}
                          onPress={() => {
                            setShowAddMaterialForm(false);
                            setNewMaterialName('');
                            setNewMaterialFactor('');
                            setSettingsSubmitted(false);
                          }}
                        >
                          <Text style={styles.secondaryButtonText}>Annuler</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.panelSoft}>
                    {filteredCatalog.map((material) => {
                      const isEditing = editingCatalogMaterialId === material.id;
                      const isBusy = activeCatalogMaterialId === material.id;

                      return (
                        <View key={material.id} style={styles.catalogCard}>
                          {isEditing ? (
                            <>
                              <View style={styles.field}>
                                <Text style={styles.label}>Nom du matériau</Text>
                                <TextInput
                                  value={editingCatalogName}
                                  onChangeText={setEditingCatalogName}
                                  style={styles.input}
                                />
                              </View>
                              <View style={styles.field}>
                                <Text style={styles.label}>Facteur CO2</Text>
                                <TextInput
                                  value={editingCatalogFactor}
                                  onChangeText={setEditingCatalogFactor}
                                  keyboardType="numeric"
                                  style={styles.input}
                                />
                              </View>
                              <View style={styles.rowBetween}>
                                <Text style={styles.smallText}>
                                  {material.pendingSync ? 'En attente' : material.backendId ? 'Synchronisé' : 'Local'}
                                </Text>
                                <View style={styles.actions}>
                                  <Pressable
                                    style={[styles.secondaryButton, isBusy ? styles.disabled : null]}
                                    onPress={() => void handleSaveConfiguredMaterial(material.id)}
                                    disabled={isBusy}
                                  >
                                    {isBusy ? (
                                      <ActivityIndicator color={COLORS.ink} />
                                    ) : (
                                      <Text style={styles.secondaryButtonText}>Enregistrer</Text>
                                    )}
                                  </Pressable>
                                  <Pressable style={styles.secondaryButton} onPress={handleCancelEditingConfiguredMaterial}>
                                    <Text style={styles.secondaryButtonText}>Annuler</Text>
                                  </Pressable>
                                </View>
                              </View>
                            </>
                          ) : (
                            <View style={styles.rowBetween}>
                              <View style={styles.listMain}>
                                <Text style={styles.listTitle}>{material.name}</Text>
                                <Text style={styles.smallText}>Facteur {n2.format(material.factor)} tCO2e / unité</Text>
                                <Text style={styles.smallText}>
                                  {material.pendingSync ? 'En attente' : material.backendId ? 'Synchronisé' : 'Local'}
                                </Text>
                              </View>
                              <Pressable
                                style={[
                                  styles.secondaryButton,
                                  editingCatalogMaterialId && editingCatalogMaterialId !== material.id ? styles.disabled : null,
                                ]}
                                onPress={() => handleStartEditingConfiguredMaterial(material)}
                                disabled={Boolean(editingCatalogMaterialId && editingCatalogMaterialId !== material.id)}
                              >
                                <Text style={styles.secondaryButtonText}>Modifier</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {filteredCatalog.length === 0 ? (
                      <Text style={styles.smallText}>
                        Aucun matériau ne correspond à votre recherche.
                      </Text>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    handleCancelEditingConfiguredMaterial();
                    setShowSettings(false);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Fermer</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showHistory} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.eyebrow}>Historique</Text>
                <Text style={styles.title}>{'Calculs sauvegardés'}</Text>
                <Text style={styles.copy}>
                  {"Retrouvez ici tous les bilans remontés par l'API et supprimez ceux qui ne sont plus utiles."}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.secondaryButton, isHistoryLoading ? styles.disabled : null]}
                    onPress={() => void loadHistory()}
                    disabled={isHistoryLoading}
                  >
                    {isHistoryLoading ? <ActivityIndicator color={COLORS.ink} /> : <Text style={styles.secondaryButtonText}>Actualiser</Text>}
                  </Pressable>
                </View>

                {isHistoryLoading ? (
                  <View style={styles.infoRow}>
                    <ActivityIndicator color={COLORS.moss} />
                    <Text style={styles.smallText}>{'Chargement des bilans sauvegardés...'}</Text>
                  </View>
                ) : null}
                {historyFeedback ? <Text style={styles.successText}>{historyFeedback}</Text> : null}
                {historyError ? <Text style={styles.errorText}>{historyError}</Text> : null}

                <View style={styles.panelSoft}>
                  {historyItems.map((bilan) => {
                    const isDeleting = deletingBilanId === bilan.id;
                    const isOpening = openingBilanId === bilan.id;
                    const siteName = bilan.site?.name?.trim() || `Bilan #${bilan.id}`;
                    const city = bilan.site?.city?.trim();
                    const totalCo2 =
                      typeof bilan.totalCo2 === 'number' ? formatEmission(bilan.totalCo2) : 'Total indisponible';

                    return (
                      <Pressable
                        key={bilan.id}
                        style={[styles.catalogCard, styles.historyCard, isDeleting || isOpening ? styles.disabled : null]}
                        onPress={() => void handleLoadSavedBilan(bilan)}
                        disabled={isDeleting || openingBilanId !== null}
                      >
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{siteName}</Text>
                          <Text style={styles.smallText}>
                            {formatHistoryDate(bilan.calculationDate)}
                            {city ? ` - ${city}` : ''}
                          </Text>
                          <Text style={styles.smallText}>
                            {isOpening ? 'Chargement du bilan...' : totalCo2}
                          </Text>
                        </View>
                        <Pressable
                          style={[styles.dangerButton, isDeleting || openingBilanId !== null ? styles.disabled : null]}
                          onPress={(event) => {
                            event.stopPropagation();
                            void handleDeleteBilan(bilan.id);
                          }}
                          disabled={isDeleting || openingBilanId !== null}
                        >
                          {isDeleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerButtonText}>Supprimer</Text>}
                        </Pressable>
                      </Pressable>
                    );
                  })}
                  {historyItems.length === 0 && !isHistoryLoading ? (
                    <Text style={styles.smallText}>
                      {"Aucun calcul sauvegardé n'a été trouvé."}
                    </Text>
                  ) : null}
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setShowHistory(false);
                    setHistoryError(null);
                    setHistoryFeedback(null);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Fermer</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={pickerRowId !== null} animationType="fade" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.pickerCard}>
              <Text style={styles.eyebrow}>Choisir</Text>
              <Text style={styles.sectionTitle}>Matériau du calcul</Text>
              <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
                {catalog.map((material) => (
                  <Pressable
                    key={material.id}
                    style={[styles.pickerOption, pickerRow?.materialId === material.id ? styles.pickerOptionActive : null]}
                    onPress={() => handleSelectMaterial(material)}
                  >
                    <Text style={styles.listTitle}>{material.name}</Text>
                  <Text style={styles.smallText}>Facteur {n2.format(material.factor)} tCO2e / unité</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable style={styles.secondaryButton} onPress={() => setPickerRowId(null)}>
                  <Text style={styles.secondaryButtonText}>Annuler</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12, gap: 12 },
  brand: { fontSize: 28, fontWeight: '700', color: COLORS.ink },
  nav: { flexDirection: 'row', gap: 10 },
  navButton: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFFCC' },
  navButtonActive: { backgroundColor: 'rgba(19,92,82,0.08)' },
  navButtonText: { color: COLORS.ink, fontWeight: '700' },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  panel: { backgroundColor: COLORS.panel, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: COLORS.line, gap: 12 },
  panelSoft: { backgroundColor: COLORS.panelSoft, borderRadius: 18, padding: 14, gap: 12 },
  eyebrow: { color: COLORS.moss, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2.5 },
  title: { color: COLORS.ink, fontSize: 28, lineHeight: 32, fontWeight: '700' },
  sectionTitle: { color: COLORS.ink, fontSize: 22, lineHeight: 26, fontWeight: '700' },
  copy: { color: COLORS.muted, fontSize: 15, lineHeight: 24 },
  smallText: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  field: { gap: 8 },
  label: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },
  input: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', color: COLORS.ink, fontSize: 16 },
  inputError: { borderColor: 'rgba(163,58,36,0.5)' },
  primaryButton: { backgroundColor: COLORS.moss, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, alignSelf: 'flex-start' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  secondaryButtonText: { color: COLORS.ink, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  disabled: { opacity: 0.45 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  statusBadge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontWeight: '700' },
  statusOnline: { backgroundColor: 'rgba(19,92,82,0.08)', color: COLORS.moss },
  statusOffline: { backgroundColor: 'rgba(163,58,36,0.08)', color: COLORS.alert },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  successText: { color: COLORS.moss, fontWeight: '600' },
  errorText: { color: COLORS.alert, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flex: 1, minWidth: 150, backgroundColor: COLORS.panel, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.line, gap: 8 },
  metricAccent: { width: 36, height: 5, borderRadius: 999 },
  metricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4 },
  metricValue: { color: COLORS.ink, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  catalogCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: COLORS.line },
  historyCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  materialCard: { backgroundColor: COLORS.panelSoft, borderRadius: 18, padding: 14, gap: 12 },
  selectField: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', gap: 4 },
  selectValue: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  listMain: { flex: 1, gap: 2 },
  comparisonValueBlock: { minWidth: 138, alignItems: 'flex-end', gap: 2 },
  listTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  listValue: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20,51,45,0.28)', justifyContent: 'center', padding: 16 },
  modalCard: { maxHeight: '86%', backgroundColor: COLORS.bg, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line },
  modalContent: { padding: 18, gap: 14 },
  modalFooter: { padding: 18, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: '#FFFFFFAA' },
  pickerCard: { maxHeight: '70%', backgroundColor: COLORS.bg, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: COLORS.line },
  pickerList: { marginTop: 12 },
  pickerOption: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: COLORS.line, marginBottom: 10 },
  pickerOptionActive: { backgroundColor: 'rgba(19,92,82,0.08)', borderColor: COLORS.moss },
  hotbarSpacer: { height: 84 },
  hotbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(20,51,45,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hotbarButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
  },
  hotbarButtonText: { color: '#FFFFFF', fontWeight: '700' },
  dangerButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: COLORS.alert,
    alignSelf: 'flex-start',
  },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '700' },
});

