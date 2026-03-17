import { environment } from '../environment/environment';

const API_BASE_URL = environment.apiUrl;

export type SaveCalculationPayload = {
  siteName: string;
  city: string;
  employees: number;
  parkingSpaces: number;
  computers: number;
  energyMwh: number;
  gasMwh: number;
  totalCo2: number;
  materials: SaveCalculationMaterialPayload[];
};

export type SaveCalculationMaterialPayload = {
  materialId?: number;
  name: string;
  quantity: number;
  factor: number;
  emission: number;
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

type SiteResponse = {
  id: number;
};

type BilanResponse = {
  id: number;
  siteId: number;
  calculationDate: string;
};

type AuthResponse = {
  token: string;
  userId: number;
  mail: string;
  societyId: number;
  societyName: string;
};

export type AuthSession = AuthResponse;

export type ApiBilanResponse = {
  id: number;
  siteId?: number;
  calculationDate?: string;
  totalCo2?: number;
  electricityKwhYear?: number;
  gasKwhYear?: number;
  materials?: {
    id?: number;
    materialId?: number;
    name?: string;
    quantity?: number;
    factor?: number;
    emission?: number;
  }[];
  site?: {
    id?: number;
    name?: string;
    city?: string;
    numberEmployee?: number;
    parkingPlaces?: number;
    numberPc?: number;
    societyId?: number;
  };
};

export type ApiSiteComparisonResponse = {
  id: number;
  name: string;
  city: string;
  numberEmployee: number;
  parkingPlaces: number;
  numberPc: number;
  createdAt: string;
  societyId: number;
  latestBilanId?: number;
  latestCalculationDate?: string;
  latestTotalCo2?: number;
  latestElectricityKwhYear?: number;
  latestGasKwhYear?: number;
};

let authSession: AuthSession | null = null;

const buildHeaders = (includeJsonContentType = false): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (authSession?.token) {
    headers.Authorization = `Bearer ${authSession.token}`;
  }

  return headers;
};

const resolveErrorMessage = (rawText: string, status: number): string => {
  if (!rawText) {
    return `HTTP ${status}`;
  }

  try {
    const parsed = JSON.parse(rawText) as { message?: string };
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    return rawText;
  }

  return rawText;
};

const getJson = async <TResponse,>(path: string): Promise<TResponse> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildHeaders(false),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(resolveErrorMessage(text, response.status));
  }

  return (await response.json()) as TResponse;
};

const postJson = async <TResponse,>(path: string, body: unknown): Promise<TResponse> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(resolveErrorMessage(text, response.status));
  }

  return (await response.json()) as TResponse;
};

const deleteRequest = async (path: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(false),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(resolveErrorMessage(text, response.status));
  }
};

export const getAuthSession = (): AuthSession | null => authSession;

export const loginUser = async (mail: string, password: string): Promise<AuthSession> => {
  const session = await postJson<AuthResponse>('/auth/login', { mail, password });
  authSession = session;
  return session;
};

export const registerUser = async (
  mail: string,
  password: string,
  societyName: string,
): Promise<AuthSession> => {
  const session = await postJson<AuthResponse>('/auth/register', { mail, password, societyName });
  authSession = session;
  return session;
};

export const logoutUser = (): void => {
  authSession = null;
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

export const getSiteComparisons = async () => {
  return getJson<ApiSiteComparisonResponse[]>('/sites/comparison');
};

export const deleteBilan = async (bilanId: number) => {
  return deleteRequest(`/bilans/${bilanId}`);
};

export const saveMaterials = async (payload: SaveMaterialPayload[]) => {
  return postJson<ApiMaterialResponse[]>('/materials', payload);
};

export const saveCalculation = async (
  payload: SaveCalculationPayload,
  societyId?: number,
) => {
  const resolvedSocietyId = societyId ?? authSession?.societyId;

  if (!resolvedSocietyId) {
    throw new Error('Vous devez etre connecte pour sauvegarder un calcul.');
  }

  const site = await postJson<SiteResponse>('/sites', {
    name: payload.siteName,
    city: payload.city,
    numberEmployee: Math.round(payload.employees),
    parkingPlaces: Math.round(payload.parkingSpaces),
    numberPc: Math.round(payload.computers),
    societyId: resolvedSocietyId,
  });

  const bilan = await postJson<BilanResponse>(`/sites/${site.id}/bilans`, {
    electricityKwhYear: payload.energyMwh * 1000,
    gasKwhYear: payload.gasMwh * 1000,
    totalCo2: payload.totalCo2,
    calculationDate: new Date().toISOString().slice(0, 10),
    materials: payload.materials.map((material) => ({
      materialId: material.materialId,
      name: material.name.trim(),
      quantity: Number(material.quantity.toFixed(2)),
      factor: Number(material.factor.toFixed(2)),
      emission: Number(material.emission.toFixed(1)),
    })),
  });

  return {
    siteId: site.id,
    bilanId: bilan.id,
    calculationDate: bilan.calculationDate,
  };
};
