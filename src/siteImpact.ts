export type SiteMaterialInput = {
  id: string;
  materialId: string;
  name: string;
  quantity: number;
};

export type ConfiguredMaterial = {
  id: string;
  backendId?: number;
  name: string;
  factor: number;
  pendingSync?: boolean;
};

export type SiteInputPayload = {
  siteName: string;
  city: string;
  energyMwh: number;
  gasMwh: number;
  employees: number;
  parkingSpaces: number;
  computers: number;
  materials: SiteMaterialInput[];
};

export type ImpactCategory = {
  key: 'materials' | 'energy' | 'gas' | 'parking' | 'equipment';
  label: string;
  emission: number;
  percentage: number;
  color: string;
  helper: string;
};

export type MaterialImpact = {
  name: string;
  quantity: number;
  factor: number;
  emission: number;
  share: number;
  color: string;
};

export type SiteImpactResult = {
  siteName: string;
  city: string;
  totalEmission: number;
  emissionPerEmployee: number;
  dominantCategory: string;
  dominantShare: number;
  materialCount: number;
  categories: ImpactCategory[];
  materials: MaterialImpact[];
  insights: string[];
};

export const DEFAULT_CONFIGURED_MATERIALS: ConfiguredMaterial[] = [
  {
    id: 'beton',
    name: 'Beton',
    factor: 0.18,
  },
  {
    id: 'acier',
    name: 'Acier',
    factor: 1.9,
  },
  {
    id: 'verre',
    name: 'Verre',
    factor: 1.05,
  },
  {
    id: 'bois',
    name: 'Bois',
    factor: 0.08,
  },
  {
    id: 'aluminium',
    name: 'Aluminium',
    factor: 8.2,
  },
];

const PALETTE = ['#14532D', '#0F766E', '#CA8A04', '#B45309', '#7C2D12', '#155E75'];

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

const normalizeName = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const normalizeMaterialId = (id: string | undefined, index: number) => {
  const trimmedId = id?.trim();

  if (trimmedId) {
    return trimmedId;
  }

  return `material-${index + 1}`;
};

const findMaterialByName = (
  name: string,
  configuredMaterials: ConfiguredMaterial[],
) => {
  const normalized = normalizeName(name);
  return configuredMaterials.find((material) => normalizeName(material.name) === normalized);
};

export const normalizeConfiguredMaterials = (
  configuredMaterials?: ConfiguredMaterial[],
  options?: {
    fallbackToDefaults?: boolean;
  },
) => {
  const fallbackToDefaults = options?.fallbackToDefaults ?? true;

  if (!Array.isArray(configuredMaterials)) {
    return DEFAULT_CONFIGURED_MATERIALS.map((material) => ({ ...material }));
  }

  const normalized = configuredMaterials.reduce<ConfiguredMaterial[]>(
    (materials, material, index) => {
      const normalizedName = material?.name?.trim();
      const normalizedFactor = material?.factor;

      if (
        !normalizedName ||
        typeof normalizedFactor !== 'number' ||
        !Number.isFinite(normalizedFactor) ||
        normalizedFactor <= 0
      ) {
        return materials;
      }

      materials.push({
        id: normalizeMaterialId(material.id, index),
        backendId:
          typeof material.backendId === 'number' && Number.isFinite(material.backendId)
            ? material.backendId
            : undefined,
        name: normalizedName,
        factor: round(normalizedFactor, 2),
        pendingSync: Boolean(material.pendingSync),
      });

      return materials;
    },
    [],
  );

  if (normalized.length > 0 || !fallbackToDefaults) {
    return normalized;
  }

  return DEFAULT_CONFIGURED_MATERIALS.map((material) => ({ ...material }));
};

const buildMaterialImpacts = (
  materials: SiteInputPayload['materials'],
  configuredMaterials: ConfiguredMaterial[],
) => {
  const materialsById = new Map(configuredMaterials.map((material) => [material.id, material]));

  return materials
    .filter((material) => material.quantity > 0)
    .map((material, index) => {
      const configuredMaterial =
        materialsById.get(material.materialId) ??
        findMaterialByName(material.name, configuredMaterials);

      if (!configuredMaterial) {
        return null;
      }

      const emission = round(material.quantity * configuredMaterial.factor);

      return {
        name: configuredMaterial.name,
        quantity: material.quantity,
        factor: configuredMaterial.factor,
        emission,
        share: 0,
        color: PALETTE[index % PALETTE.length],
      };
    })
    .filter((material): material is MaterialImpact => material !== null);
};

export const calculateSiteImpact = (
  payload: SiteInputPayload,
  configuredMaterials?: ConfiguredMaterial[],
): SiteImpactResult => {
  const normalizedMaterials = normalizeConfiguredMaterials(configuredMaterials);
  const materialImpacts = buildMaterialImpacts(payload.materials, normalizedMaterials);
  const materialsEmission = materialImpacts.reduce((total, material) => total + material.emission, 0);
  const energyEmission = payload.energyMwh * 0.055;
  const gasEmission = payload.gasMwh * 0.227;
  const parkingEmission = payload.parkingSpaces * 0.95 + payload.employees * 0.12;
  const equipmentEmission = payload.computers * 0.16;
  const totalEmission = round(
    materialsEmission + energyEmission + gasEmission + parkingEmission + equipmentEmission,
  );

  const categories: ImpactCategory[] = [
    {
      key: 'materials' as const,
      label: 'Matériaux',
      emission: round(materialsEmission),
      percentage: 0,
      color: '#14532D',
      helper: 'Impact cumulé des matériaux sélectionnés',
    },
    {
      key: 'energy' as const,
      label: 'Électricité',
      emission: round(energyEmission),
      percentage: 0,
      color: '#0F766E',
      helper: 'Consommation électrique annuelle',
    },
    {
      key: 'gas' as const,
      label: 'Gaz',
      emission: round(gasEmission),
      percentage: 0,
      color: '#CA8A04',
      helper: 'Consommation de gaz annuelle',
    },
    {
      key: 'parking' as const,
      label: 'Mobilité & parking',
      emission: round(parkingEmission),
      percentage: 0,
      color: '#B45309',
      helper: 'Stationnement et mobilité collaborateurs',
    },
    {
      key: 'equipment' as const,
      label: 'Équipement IT',
      emission: round(equipmentEmission),
      percentage: 0,
      color: '#155E75',
      helper: 'Ordinateurs et équipements postes',
    },
  ].map((category) => ({
    ...category,
    percentage:
      totalEmission > 0 ? round((category.emission / totalEmission) * 100, 1) : 0,
  }));

  const dominantCategory = [...categories].sort((left, right) => right.emission - left.emission)[0];
  const materialBreakdown = materialImpacts.map((material) => ({
    ...material,
    share: totalEmission > 0 ? round((material.emission / totalEmission) * 100, 1) : 0,
  }));
  const topMaterial = [...materialBreakdown].sort((left, right) => right.emission - left.emission)[0];
  const emissionPerEmployee =
    payload.employees > 0 ? round(totalEmission / payload.employees, 2) : 0;

  return {
    siteName: payload.siteName,
    city: payload.city,
    totalEmission,
    emissionPerEmployee,
    dominantCategory: dominantCategory?.label ?? 'Matériaux',
    dominantShare: dominantCategory?.percentage ?? 0,
    materialCount: materialBreakdown.length,
    categories,
    materials: materialBreakdown,
    insights: [
      `${dominantCategory?.label ?? 'Matériaux'} représente ${dominantCategory?.percentage ?? 0}% des émissions estimées du site.`,
      `Le site émet environ ${emissionPerEmployee} tCO2e par employé.`,
      topMaterial
        ? `${topMaterial.name} est le matériau le plus impactant avec ${topMaterial.emission} tCO2e estimées.`
        : "Ajoutez des matériaux pour enrichir l'analyse construction.",
      `${payload.parkingSpaces} places et ${payload.computers} postes informatiques alimentent déjà les stats de pilotage.`,
    ],
  };
};
