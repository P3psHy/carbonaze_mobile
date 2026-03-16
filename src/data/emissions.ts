import type {
  EnergyProfileKey,
  ImpactCategory,
  MaterialKey,
  SiteInput,
} from '../types';

type CategoryMeta = {
  label: string;
  color: string;
  helper: string;
};

type EnergyProfile = {
  label: string;
  factor: number;
  description: string;
};

type MaterialDefinition = {
  label: string;
  unit: string;
  factor: number;
  hint: string;
  color: string;
};

export const CATEGORY_META: Record<ImpactCategory, CategoryMeta> = {
  construction: {
    label: 'Construction',
    color: '#1F5A45',
    helper: 'Matériaux et structure',
  },
  energy: {
    label: 'Énergie',
    color: '#BE8A3A',
    helper: 'Consommation annuelle',
  },
  parking: {
    label: 'Mobilité parking',
    color: '#D86F4A',
    helper: 'Stationnement et accès',
  },
  operations: {
    label: 'Exploitation',
    color: '#8AAEB8',
    helper: 'Occupation et équipements',
  },
};

export const ENERGY_PROFILES: Record<EnergyProfileKey, EnergyProfile> = {
  france: {
    label: 'France bas carbone',
    factor: 58,
    description: 'Mix électrique proche du réseau français',
  },
  europe: {
    label: 'Europe moyenne',
    factor: 255,
    description: 'Référence prudente pour des campus multi-pays',
  },
  renewable: {
    label: 'Contrat renouvelable',
    factor: 18,
    description: 'Approvisionnement renforcé en électricité décarbonée',
  },
};

export const MATERIAL_LIBRARY: Record<MaterialKey, MaterialDefinition> = {
  concrete: {
    label: 'Béton',
    unit: 'm3',
    factor: 315,
    hint: 'Structure, dalles, fondations',
    color: '#7F8B85',
  },
  steel: {
    label: 'Acier',
    unit: 't',
    factor: 1900,
    hint: 'Ossature et renforts',
    color: '#415C66',
  },
  glass: {
    label: 'Verre',
    unit: 't',
    factor: 1050,
    hint: 'Façades et cloisonnement',
    color: '#8AAEB8',
  },
  wood: {
    label: 'Bois',
    unit: 'm3',
    factor: 110,
    hint: 'Lots intérieurs et structure secondaire',
    color: '#9B7A50',
  },
  aluminium: {
    label: 'Aluminium',
    unit: 't',
    factor: 8700,
    hint: 'Menuiseries et enveloppe',
    color: '#C8A56C',
  },
};

const buildMaterials = (values: Record<MaterialKey, number>) => {
  return (Object.keys(MATERIAL_LIBRARY) as MaterialKey[]).map((key) => ({
    key,
    quantity: values[key] ?? 0,
  }));
};

export const DEFAULT_SITES: SiteInput[] = [
  {
    id: 'site-horizon',
    name: 'Campus Horizon',
    city: 'Paris La Défense',
    areaM2: 11771,
    parkingSpots: 180,
    energyMWh: 1840,
    employees: 920,
    workstations: 1037,
    energyProfile: 'france',
    materials: buildMaterials({
      concrete: 1450,
      steel: 210,
      glass: 165,
      wood: 48,
      aluminium: 28,
    }),
  },
  {
    id: 'site-estuaire',
    name: 'Campus Estuaire',
    city: 'Nantes',
    areaM2: 8600,
    parkingSpots: 96,
    energyMWh: 1310,
    employees: 640,
    workstations: 720,
    energyProfile: 'europe',
    materials: buildMaterials({
      concrete: 1040,
      steel: 165,
      glass: 122,
      wood: 58,
      aluminium: 16,
    }),
  },
  {
    id: 'site-canopee',
    name: 'Hub Canopée',
    city: 'Lyon',
    areaM2: 6400,
    parkingSpots: 42,
    energyMWh: 780,
    employees: 390,
    workstations: 460,
    energyProfile: 'renewable',
    materials: buildMaterials({
      concrete: 660,
      steel: 92,
      glass: 75,
      wood: 72,
      aluminium: 11,
    }),
  },
];
