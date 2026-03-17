import { environment } from '../environment/environment';

const API_BASE_URL = environment.apiUrl;
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

export type ApiMaterialResponse = {
  id: number;
  name: string;
  energeticValue: number;
  quantity: number;
};

export type SaveMaterialPayload = {
  id?: number;
  name: string;
  energeticValue: number;
  quantity: number;
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

export type ApiBilanResponse = {
  id: number;
  siteId?: number;
  calculationDate?: string;
  totalCo2?: number;
  electricityKwhYear?: number;
  gasKwhYear?: number;
  site?: {
    id?: number;
    name?: string;
    city?: string;
  };
};

const getJson = async <TResponse,>(path: string): Promise<TResponse> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
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

const deleteRequest = async (path: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
};

export const getMaterials = async () => {
  return getJson<ApiMaterialResponse[]>('/materials');
};

export const getBilans = async () => {
  return getJson<ApiBilanResponse[]>('/bilans');
};

export const getBilanById = async (bilanId: number) => {
  return getJson<ApiBilanResponse>(`/bilans/${bilanId}`);
};

export const deleteBilan = async (bilanId: number) => {
  return deleteRequest(`/bilans/${bilanId}`);
};

export const saveMaterials = async (payload: SaveMaterialPayload[]) => {
  return postJson<ApiMaterialResponse[]>('/materials', payload);
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
