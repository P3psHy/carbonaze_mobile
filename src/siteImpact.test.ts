import {
  calculateSiteImpact,
  normalizeConfiguredMaterials,
  type ConfiguredMaterial,
  type SiteInputPayload,
} from './siteImpact';

describe('normalizeConfiguredMaterials', () => {
  it('normalizes valid materials and drops invalid entries', () => {
    const configuredMaterials: ConfiguredMaterial[] = [
      {
        id: ' acier ',
        backendId: 12,
        name: '  Acier recycle  ',
        factor: 2.145,
        pendingSync: 1 as unknown as boolean,
      },
      {
        id: '',
        name: '  ',
        factor: 0,
      },
    ];

    expect(normalizeConfiguredMaterials(configuredMaterials, { fallbackToDefaults: false })).toEqual([
      {
        id: 'acier',
        backendId: 12,
        name: 'Acier recycle',
        factor: 2.15,
        pendingSync: true,
      },
    ]);
  });

  it('falls back to the default catalog when nothing valid is provided', () => {
    const normalized = normalizeConfiguredMaterials(
      [{ id: '', name: '', factor: Number.NaN }],
      { fallbackToDefaults: true },
    );

    expect(normalized).toHaveLength(5);
    expect(normalized[0]).toMatchObject({
      id: 'beton',
      name: 'Beton',
      factor: 0.18,
    });
  });
});

describe('calculateSiteImpact', () => {
  it('calculates emissions, percentages and insights from a mixed payload', () => {
    const payload: SiteInputPayload = {
      siteName: 'Paris HQ',
      city: 'Paris',
      energyMwh: 80,
      gasMwh: 40,
      employees: 10,
      parkingSpaces: 20,
      computers: 30,
      materials: [
        { id: 'row-1', materialId: 'acier', name: 'Acier', quantity: 5 },
        { id: 'row-2', materialId: 'unknown', name: ' Beton ', quantity: 20 },
      ],
    };

    const configuredMaterials: ConfiguredMaterial[] = [
      { id: 'acier', name: 'Acier', factor: 2 },
      { id: 'beton', name: 'Beton', factor: 0.2 },
    ];

    const result = calculateSiteImpact(payload, configuredMaterials);

    expect(result.totalEmission).toBe(52.5);
    expect(result.emissionPerEmployee).toBe(5.25);
    expect(result.dominantCategory).toBe('Mobilité & parking');
    expect(result.dominantShare).toBe(38.5);
    expect(result.materialCount).toBe(2);
    expect(result.categories).toEqual([
      expect.objectContaining({ key: 'materials', emission: 14, percentage: 26.7 }),
      expect.objectContaining({ key: 'energy', emission: 4.4, percentage: 8.4 }),
      expect.objectContaining({ key: 'gas', emission: 9.1, percentage: 17.3 }),
      expect.objectContaining({ key: 'parking', emission: 20.2, percentage: 38.5 }),
      expect.objectContaining({ key: 'equipment', emission: 4.8, percentage: 9.1 }),
    ]);
    expect(result.materials).toEqual([
      expect.objectContaining({ name: 'Acier', emission: 10, share: 19 }),
      expect.objectContaining({ name: 'Beton', emission: 4, share: 7.6 }),
    ]);
    expect(result.insights).toEqual([
      'Mobilité & parking représente 38.5% des émissions estimées du site.',
      'Le site émet environ 5.25 tCO2e par employé.',
      'Acier est le matériau le plus impactant avec 10 tCO2e estimées.',
      '20 places et 30 postes informatiques alimentent déjà les stats de pilotage.',
    ]);
  });

  it('handles an empty payload without dividing by zero', () => {
    const payload: SiteInputPayload = {
      siteName: 'Empty Site',
      city: 'Lille',
      energyMwh: 0,
      gasMwh: 0,
      employees: 0,
      parkingSpaces: 0,
      computers: 0,
      materials: [],
    };

    const result = calculateSiteImpact(payload, []);

    expect(result.totalEmission).toBe(0);
    expect(result.emissionPerEmployee).toBe(0);
    expect(result.materialCount).toBe(0);
    expect(result.categories.every((category) => category.percentage === 0)).toBe(true);
    expect(result.insights[2]).toBe("Ajoutez des matériaux pour enrichir l'analyse construction.");
  });
});
