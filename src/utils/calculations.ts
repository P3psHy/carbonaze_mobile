import { CATEGORY_META, ENERGY_PROFILES, MATERIAL_LIBRARY } from '../data/emissions';
import type {
  ImpactCategory,
  ImpactRecommendation,
  SiteImpact,
  SiteInput,
} from '../types';

const PARKING_FACTOR = 420;
const EMPLOYEE_FACTOR = 280;
const WORKSTATION_FACTOR = 110;
const AREA_OPERATIONS_FACTOR = 6.5;

const REDUCTION_FACTORS: Record<ImpactCategory, number> = {
  construction: 0.12,
  energy: 0.28,
  parking: 0.19,
  operations: 0.15,
};

const CATEGORY_ORDER: ImpactCategory[] = [
  'construction',
  'energy',
  'parking',
  'operations',
];

const buildRecommendations = (
  breakdown: Record<ImpactCategory, number>,
): ImpactRecommendation[] => {
  const playbook: Record<
    ImpactCategory,
    Omit<ImpactRecommendation, 'reductionKg'>
  > = {
    construction: {
      title: 'Revoir le mix matériaux',
      detail: 'Privilégiez réemploi, béton bas carbone et substitutions sur les lots lourds.',
    },
    energy: {
      title: 'Décarboner la consommation',
      detail: "Travaillez le contrat énergétique, le pilotage CVC et l'efficacité des usages.",
    },
    parking: {
      title: 'Réduire la dépendance voiture',
      detail: 'Mettez en place un plan mobilité et limitez les surfaces de stationnement.',
    },
    operations: {
      title: "Optimiser l'exploitation",
      detail: "Ajustez l'occupation, les postes de travail et les équipements permanents.",
    },
  };

  return CATEGORY_ORDER.map((key) => ({
    key,
    value: breakdown[key],
  }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map(({ key, value }) => ({
      title: playbook[key].title,
      detail: playbook[key].detail,
      reductionKg: value * REDUCTION_FACTORS[key],
    }));
};

const getBenchmark = (intensityPerM2: number) => {
  if (intensityPerM2 < 95) {
    return {
      label: 'Trajectoire solide',
      detail: "Le site reste dans une zone d'intensité plutôt maîtrisée.",
      tone: 'good' as const,
    };
  }

  if (intensityPerM2 < 150) {
    return {
      label: 'Sous surveillance',
      detail: "Le profil est exploitable mais mérite un plan d'action rapide.",
      tone: 'medium' as const,
    };
  }

  return {
    label: 'Action prioritaire',
    detail: 'Le site concentre une intensité élevée et doit être traité en premier.',
    tone: 'alert' as const,
  };
};

export const calculateSiteImpact = (site: SiteInput): SiteImpact => {
  const construction = site.materials.reduce((total, material) => {
    return total + material.quantity * MATERIAL_LIBRARY[material.key].factor;
  }, 0);

  const energy = site.energyMWh * ENERGY_PROFILES[site.energyProfile].factor;
  const parking = site.parkingSpots * PARKING_FACTOR;
  const operations =
    site.employees * EMPLOYEE_FACTOR +
    site.workstations * WORKSTATION_FACTOR +
    site.areaM2 * AREA_OPERATIONS_FACTOR;

  const breakdown: Record<ImpactCategory, number> = {
    construction,
    energy,
    parking,
    operations,
  };

  const totalKg = CATEGORY_ORDER.reduce((total, key) => total + breakdown[key], 0);
  const intensityPerM2 = site.areaM2 > 0 ? totalKg / site.areaM2 : 0;
  const perEmployeeKg = site.employees > 0 ? totalKg / site.employees : 0;
  const reductionPotentialKg = CATEGORY_ORDER.reduce((total, key) => {
    return total + breakdown[key] * REDUCTION_FACTORS[key];
  }, 0);

  const shares = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_META[key].label,
    color: CATEGORY_META[key].color,
    valueKg: breakdown[key],
    share: totalKg > 0 ? breakdown[key] / totalKg : 0,
  })).sort((left, right) => right.valueKg - left.valueKg);

  return {
    breakdown,
    totalKg,
    intensityPerM2,
    perEmployeeKg,
    reductionPotentialKg,
    shares,
    benchmark: getBenchmark(intensityPerM2),
    recommendations: buildRecommendations(breakdown),
  };
};
