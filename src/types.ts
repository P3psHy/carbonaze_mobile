export type ImpactCategory = 'construction' | 'energy' | 'parking' | 'operations';

export type EnergyProfileKey = 'france' | 'europe' | 'renewable';

export type MaterialKey = 'concrete' | 'steel' | 'glass' | 'wood' | 'aluminium';

export type MaterialEntry = {
  key: MaterialKey;
  quantity: number;
};

export type SiteInput = {
  id: string;
  name: string;
  city: string;
  areaM2: number;
  parkingSpots: number;
  energyMWh: number;
  employees: number;
  workstations: number;
  energyProfile: EnergyProfileKey;
  materials: MaterialEntry[];
};

export type ImpactShare = {
  key: ImpactCategory;
  label: string;
  color: string;
  valueKg: number;
  share: number;
};

export type BenchmarkTone = 'good' | 'medium' | 'alert';

export type ImpactRecommendation = {
  title: string;
  detail: string;
  reductionKg: number;
};

export type SiteImpact = {
  breakdown: Record<ImpactCategory, number>;
  totalKg: number;
  intensityPerM2: number;
  perEmployeeKg: number;
  reductionPotentialKg: number;
  shares: ImpactShare[];
  benchmark: {
    label: string;
    detail: string;
    tone: BenchmarkTone;
  };
  recommendations: ImpactRecommendation[];
};
