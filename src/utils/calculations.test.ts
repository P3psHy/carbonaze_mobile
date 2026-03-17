import { calculateSiteImpact } from './calculations';
import type { SiteInput } from '../types';

const createSite = (overrides: Partial<SiteInput> = {}): SiteInput => ({
  id: 'site-1',
  name: 'Campus Test',
  city: 'Paris',
  areaM2: 1000,
  parkingSpots: 20,
  energyMWh: 100,
  employees: 50,
  workstations: 60,
  energyProfile: 'europe',
  materials: [
    { key: 'concrete', quantity: 10 },
    { key: 'steel', quantity: 2 },
  ],
  ...overrides,
});

describe('utils/calculateSiteImpact', () => {
  it('aggregates the site footprint and sorts shares by contribution', () => {
    const result = calculateSiteImpact(createSite());

    expect(result.breakdown).toEqual({
      construction: 6950,
      energy: 25500,
      parking: 8400,
      operations: 27100,
    });
    expect(result.totalKg).toBe(67950);
    expect(result.intensityPerM2).toBe(67.95);
    expect(result.perEmployeeKg).toBe(1359);
    expect(result.reductionPotentialKg).toBeCloseTo(13635, 5);
    expect(result.shares.map((share) => share.key)).toEqual([
      'operations',
      'energy',
      'parking',
      'construction',
    ]);
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0]).toMatchObject({
      title: "Optimiser l'exploitation",
    });
    expect(result.recommendations[0].reductionKg).toBeCloseTo(4065, 5);
    expect(result.recommendations[1]).toMatchObject({
      title: 'Décarboner la consommation',
    });
    expect(result.recommendations[1].reductionKg).toBeCloseTo(7140, 5);
    expect(result.recommendations[2]).toMatchObject({
      title: 'Réduire la dépendance voiture',
    });
    expect(result.recommendations[2].reductionKg).toBeCloseTo(1596, 5);
  });

  it.each([
    { areaM2: 100, tone: 'good', label: 'Trajectoire solide' },
    { areaM2: 50, tone: 'medium', label: 'Sous surveillance' },
    { areaM2: 20, tone: 'alert', label: 'Action prioritaire' },
  ])('assigns the right benchmark for areaM2=$areaM2', ({ areaM2, tone, label }) => {
    const result = calculateSiteImpact(
      createSite({
        areaM2,
        parkingSpots: 0,
        employees: 0,
        workstations: 0,
        materials: [],
        energyMWh: 100,
        energyProfile: 'france',
      }),
    );

    expect(result.benchmark).toMatchObject({ tone, label });
  });
});
