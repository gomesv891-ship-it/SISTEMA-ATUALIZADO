import type {
  FloorplanRoomShape,
  IrregularRoomGeometryData,
} from './irregularRoomGeometry';

export interface FloorplanRoom {
  id: string;
  name: string;
  widthMeters: number | null;
  lengthMeters: number | null;
  /** Quando preenchido manualmente (ou em ambientes irregulares), prevalece sobre L x C */
  manualAreaSqm: number | null;
  /** Quando preenchido manualmente (ou em ambientes irregulares), prevalece sobre 2*(L+C) */
  manualPerimeterMeters: number | null;
  selected: boolean;
  /** Tipo geométrico do ambiente (retrocompatível: ausente significa 'rectangular') */
  shapeType?: FloorplanRoomShape;
  /** Trechos de parede e referências geométricas quando shapeType === 'irregular' */
  irregularData?: IrregularRoomGeometryData;
}

export interface FloorplanMaterialSelections {
  piso: boolean;
  rodape: boolean;
}

export interface FloorplanComputedRoom {
  room: FloorplanRoom;
  areaSqm: number;
  perimeterMeters: number;
  isManualArea: boolean;
  isManualPerimeter: boolean;
  hasValidArea: boolean;
  hasValidPerimeter: boolean;
}

export interface FloorplanCalculationSummary {
  selectedRoomsCount: number;
  totalRoomsCount: number;
  totalSelectedAreaSqm: number;
  totalSelectedPerimeterMeters: number;
  pisoLossPercent: number;
  rodapeLossPercent: number;
  pisoSqmWithLoss: number;
  rodapeMlWithLoss: number;
  duplicateRoomNames: string[];
  roomsWithoutDimensionsCount: number;
}

export interface QuickBudgetTransferDraft {
  source: 'calculadora_plantas';
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  clientType?: string;
  pisoSqm: string;
  rodapeMl: string;
  ripadoSqm: string;
  tetoSqm: string;
  mantaSqm: string;
  selectedRoomsCount: number;
  totalAreaSqm: number;
  totalPerimeterMeters: number;
  pisoLossPercent: number;
  rodapeLossPercent: number;
  timestamp: number;
}

export const FLOORPLAN_QUICK_DRAFT_KEY = 'fenix_orcamento_rapido_draft';

export const DEFAULT_FLOORPLAN_MATERIALS: FloorplanMaterialSelections = {
  piso: true,
  rodape: true,
};

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function sanitizeLossPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1000, round2(value));
}

/**
 * Converte string numérica pt-BR ("12,50" / "1.234,56" / "12.50") para número válido ou null.
 */
export function parsePtBrDimension(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? round2(raw) : null;
  }
  const trimmed = String(raw).trim().replace(/\s+/g, '');
  if (!trimmed) return null;

  let normalized = trimmed;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return round2(num);
}

/**
 * Formata número para exibição pt-BR com 2 casas decimais.
 */
export function formatPtBrNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0,00';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formata porcentagem evitando zeros à direita desnecessários (ex.: 10 -> "10", 7.5 -> "7,5").
 */
export function formatPercentDisplay(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  const rounded = round2(value);
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Formata número para preenchimento de inputs e transferência para o Orçamento Rápido (ex: "48,50").
 */
export function formatQuickInputNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/**
 * Calcula métricas individuais de um ambiente.
 * - Se largura e comprimento forem informados, calcula Área = L × C e Perímetro = 2 × (L + C).
 * - Se manualAreaSqm / manualPerimeterMeters forem informados (ambientes irregulares), prevalecem.
 */
export function computeRoomMetrics(room: FloorplanRoom): FloorplanComputedRoom {
  const w =
    typeof room.widthMeters === 'number' && Number.isFinite(room.widthMeters) && room.widthMeters >= 0
      ? room.widthMeters
      : null;
  const l =
    typeof room.lengthMeters === 'number' && Number.isFinite(room.lengthMeters) && room.lengthMeters >= 0
      ? room.lengthMeters
      : null;
  const manualArea =
    typeof room.manualAreaSqm === 'number' && Number.isFinite(room.manualAreaSqm) && room.manualAreaSqm >= 0
      ? room.manualAreaSqm
      : null;
  const manualPerimeter =
    typeof room.manualPerimeterMeters === 'number' &&
    Number.isFinite(room.manualPerimeterMeters) &&
    room.manualPerimeterMeters >= 0
      ? room.manualPerimeterMeters
      : null;

  const computedAreaFromSides = w !== null && l !== null && w > 0 && l > 0 ? round2(w * l) : null;
  const areaSqm = round2(manualArea ?? computedAreaFromSides ?? 0);

  const computedPerimeterFromSides =
    w !== null && l !== null && w > 0 && l > 0 ? round2(2 * (w + l)) : null;
  const perimeterMeters = round2(manualPerimeter ?? computedPerimeterFromSides ?? 0);

  return {
    room,
    areaSqm,
    perimeterMeters,
    isManualArea: manualArea !== null,
    isManualPerimeter: manualPerimeter !== null,
    hasValidArea: areaSqm > 0,
    hasValidPerimeter: perimeterMeters > 0,
  };
}

/**
 * Identifica nomes de ambientes repetidos entre os cômodos selecionados.
 */
export function detectDuplicateRoomNames(rooms: FloorplanRoom[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const room of rooms) {
    if (!room.selected) continue;
    const label = (room.name || '').trim();
    if (!label) continue;
    const key = label.toLowerCase().replace(/\s+/g, ' ');
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(key, { label, count: 1 });
    }
  }
  const duplicates: string[] = [];
  for (const entry of counts.values()) {
    if (entry.count > 1) {
      duplicates.push(entry.label);
    }
  }
  return duplicates;
}

/**
 * Motor matemático manual da Calculadora de Plantas:
 * - Soma apenas os ambientes selecionados (sem duplicar IDs).
 * - Piso Vinílico: Área total × (1 + pisoLossPercent / 100).
 * - Rodapés: Perímetro total × (1 + rodapeLossPercent / 100).
 * - Margens de perda 100% independentes entre si.
 */
export function calculateFloorplanTotals(params: {
  rooms: FloorplanRoom[];
  pisoLossPercent: number;
  rodapeLossPercent: number;
  materials: FloorplanMaterialSelections;
}): FloorplanCalculationSummary {
  const safePisoLoss = sanitizeLossPercent(params.pisoLossPercent);
  const safeRodapeLoss = sanitizeLossPercent(params.rodapeLossPercent);

  const seenIds = new Set<string>();
  const uniqueRooms: FloorplanRoom[] = [];
  for (const r of params.rooms) {
    if (!r || !r.id || seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    uniqueRooms.push(r);
  }

  let selectedRoomsCount = 0;
  let totalSelectedAreaSqm = 0;
  let totalSelectedPerimeterMeters = 0;
  let roomsWithoutDimensionsCount = 0;

  for (const room of uniqueRooms) {
    if (!room.selected) continue;
    selectedRoomsCount += 1;
    const metrics = computeRoomMetrics(room);
    if (!metrics.hasValidArea && !metrics.hasValidPerimeter) {
      roomsWithoutDimensionsCount += 1;
    }
    totalSelectedAreaSqm += metrics.areaSqm;
    totalSelectedPerimeterMeters += metrics.perimeterMeters;
  }

  totalSelectedAreaSqm = round2(totalSelectedAreaSqm);
  totalSelectedPerimeterMeters = round2(totalSelectedPerimeterMeters);

  const pisoLossFactor = 1 + safePisoLoss / 100;
  const rodapeLossFactor = 1 + safeRodapeLoss / 100;

  const pisoSqmWithLoss = params.materials.piso
    ? round2(totalSelectedAreaSqm * pisoLossFactor)
    : 0;

  const rodapeMlWithLoss = params.materials.rodape
    ? round2(totalSelectedPerimeterMeters * rodapeLossFactor)
    : 0;

  return {
    selectedRoomsCount,
    totalRoomsCount: uniqueRooms.length,
    totalSelectedAreaSqm,
    totalSelectedPerimeterMeters,
    pisoLossPercent: safePisoLoss,
    rodapeLossPercent: safeRodapeLoss,
    pisoSqmWithLoss,
    rodapeMlWithLoss,
    duplicateRoomNames: detectDuplicateRoomNames(uniqueRooms),
    roomsWithoutDimensionsCount,
  };
}

export function createEmptyFloorplanRoom(index: number): FloorplanRoom {
  return {
    id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `Ambiente ${index}`,
    widthMeters: null,
    lengthMeters: null,
    manualAreaSqm: null,
    manualPerimeterMeters: null,
    selected: true,
  };
}
