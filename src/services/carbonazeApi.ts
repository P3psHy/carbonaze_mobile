const API_BASE_URL = 'http://localhost:8080/api';
const DEFAULT_SOCIETY_NAME = 'Carbonaze Mobile';

export type SaveCalculationPayload = {
  siteName: string;
  city: string;
  employees: number;
  parkingSpaces: number;
  computers: number;
  energyMwh: number;
  gasMwh: number;
  totalCo2: number;
};

type SocietyResponse = {
  id: number;
  name: string;
};

type SiteResponse = {
  id: number;
};

type BilanResponse = {
  id: number;
  siteId: number;
  calculationDate: string;
};

const postJson = async <TResponse,>(path: string, body: unknown): Promise<TResponse> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
};

export const createSociety = async (name = DEFAULT_SOCIETY_NAME) => {
  return postJson<SocietyResponse>('/societies', { name });
};

export const saveCalculation = async (
  payload: SaveCalculationPayload,
  societyId: number,
) => {
  const site = await postJson<SiteResponse>('/sites', {
    name: payload.siteName,
    city: payload.city,
    numberEmployee: Math.round(payload.employees),
    parkingPlaces: Math.round(payload.parkingSpaces),
    numberPc: Math.round(payload.computers),
    societyId,
  });

  const bilan = await postJson<BilanResponse>(`/sites/${site.id}/bilans`, {
    electricityKwhYear: payload.energyMwh * 1000,
    gasKwhYear: payload.gasMwh * 1000,
    totalCo2: payload.totalCo2,
    calculationDate: new Date().toISOString().slice(0, 10),
  });

  return {
    siteId: site.id,
    bilanId: bilan.id,
    calculationDate: bilan.calculationDate,
  };
};
