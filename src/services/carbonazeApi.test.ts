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
} from './carbonazeApi';
import { environment } from '../environment/environment';

describe('carbonazeApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-16T09:15:00.000Z'));
    mockFetch.mockReset();
    global.fetch = mockFetch as typeof fetch;
    logoutUser();
  });

  afterEach(() => {
    jest.useRealTimers();
    logoutUser();
  });

  it('logs in and stores the auth session', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'jwt-token',
        userId: 7,
        mail: 'demo@carbonaze.fr',
        societyId: 42,
        societyName: 'Carbonaze Mobile',
      }),
    });

    await expect(loginUser('demo@carbonaze.fr', 'password123')).resolves.toEqual({
      token: 'jwt-token',
      userId: 7,
      mail: 'demo@carbonaze.fr',
      societyId: 42,
      societyName: 'Carbonaze Mobile',
    });

    expect(getAuthSession()).toMatchObject({
      token: 'jwt-token',
      societyId: 42,
    });
    expect(mockFetch).toHaveBeenCalledWith(`${environment.apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mail: 'demo@carbonaze.fr', password: 'password123' }),
    });
  });

  it('registers a user and stores the auth session', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'jwt-token-register',
        userId: 8,
        mail: 'new@carbonaze.fr',
        societyId: 52,
        societyName: 'New Society',
      }),
    });

    await expect(registerUser('new@carbonaze.fr', 'password123', 'New Society')).resolves.toEqual({
      token: 'jwt-token-register',
      userId: 8,
      mail: 'new@carbonaze.fr',
      societyId: 52,
      societyName: 'New Society',
    });
  });

  it('reads the materials catalog with the bearer token', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1, name: 'Acier', energeticValue: 1.9, quantity: 0 }],
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(getMaterials()).resolves.toEqual([
      { id: 1, name: 'Acier', energeticValue: 1.9, quantity: 0 },
    ]);

    expect(mockFetch).toHaveBeenNthCalledWith(2, `${environment.apiUrl}/materials`, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer jwt-token',
      },
    });
  });

  it('reads saved bilans', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 3, calculationDate: '2026-03-16', totalCo2: 18.2 }],
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(getBilans()).resolves.toEqual([
      { id: 3, calculationDate: '2026-03-16', totalCo2: 18.2 },
    ]);
  });

  it('reads site comparison entries', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 8, name: 'Site Paris', city: 'Paris', numberEmployee: 100, latestTotalCo2: 17.9 },
        ],
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(getSiteComparisons()).resolves.toEqual([
      { id: 8, name: 'Site Paris', city: 'Paris', numberEmployee: 100, latestTotalCo2: 17.9 },
    ]);
    expect(mockFetch).toHaveBeenNthCalledWith(2, `${environment.apiUrl}/sites/comparison`, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer jwt-token',
      },
    });
  });

  it('reads a saved bilan by id', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 7,
          siteId: 3,
          electricityKwhYear: 10000,
          gasKwhYear: 2000,
          totalCo2: 12.4,
          calculationDate: '2026-03-17',
        }),
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(getBilanById(7)).resolves.toEqual({
      id: 7,
      siteId: 3,
      electricityKwhYear: 10000,
      gasKwhYear: 2000,
      totalCo2: 12.4,
      calculationDate: '2026-03-17',
    });
  });

  it('saves materials through the sync endpoint', async () => {
    const payload = [{ name: 'Bois', energeticValue: 0.08, quantity: 3 }];
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 9, name: 'Bois', energeticValue: 0.08, quantity: 3 }],
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(saveMaterials(payload)).resolves.toEqual([
      { id: 9, name: 'Bois', energeticValue: 0.08, quantity: 3 },
    ]);
  });

  it('creates a site then its bilan with transformed payload values', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 87, siteId: 12, calculationDate: '2026-03-16' }),
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(
      saveCalculation({
        siteName: 'Site Paris',
        city: 'Paris',
        employees: 12.8,
        parkingSpaces: 7.2,
        computers: 18.5,
        energyMwh: 12.4,
        gasMwh: 7.5,
        totalCo2: 22.7,
        materials: [
          { name: 'Acier', quantity: 2, factor: 1.9, emission: 3.8 },
        ],
      }),
    ).resolves.toEqual({
      siteId: 12,
      bilanId: 87,
      calculationDate: '2026-03-16',
    });

    expect(mockFetch).toHaveBeenNthCalledWith(2, `${environment.apiUrl}/sites`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-token',
      },
      body: JSON.stringify({
        name: 'Site Paris',
        city: 'Paris',
        numberEmployee: 13,
        parkingPlaces: 7,
        numberPc: 19,
        societyId: 42,
      }),
    });
    expect(mockFetch).toHaveBeenNthCalledWith(3, `${environment.apiUrl}/sites/12/bilans`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-token',
      },
      body: JSON.stringify({
        electricityKwhYear: 12400,
        gasKwhYear: 7500,
        totalCo2: 22.7,
        calculationDate: '2026-03-16',
        materials: [{ name: 'Acier', quantity: 2, factor: 1.9, emission: 3.8 }],
      }),
    });
  });

  it('surfaces the backend response text on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'backend exploded',
    });

    await expect(loginUser('demo@carbonaze.fr', 'password123')).rejects.toThrow('backend exploded');
  });

  it('deletes a saved bilan', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'jwt-token',
          userId: 7,
          mail: 'demo@carbonaze.fr',
          societyId: 42,
          societyName: 'Carbonaze Mobile',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

    await loginUser('demo@carbonaze.fr', 'password123');
    await expect(deleteBilan(7)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenNthCalledWith(2, `${environment.apiUrl}/bilans/7`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer jwt-token',
      },
    });
  });
});
