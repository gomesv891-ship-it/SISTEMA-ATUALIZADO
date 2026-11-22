import { createWorker, OEM, PSM } from 'tesseract.js';
import { round2 } from './floorplanCalculator';

export interface FloorplanTextToken {
  text: string;
  /** Coordenadas normalizadas entre 0 e 1 relativas à largura/altura da planta */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  isVertical?: boolean;
  source: 'pdf_vector' | 'ocr';
}

export type OcrConfidenceLevel = 'high' | 'medium' | 'low';

export interface RecognizedFloorplanRoomDraft {
  tempId: string;
  name: string;
  widthMeters: number | null;
  lengthMeters: number | null;
  areaSqm: number | null;
  perimeterMeters: number | null;
  isAreaOnly: boolean;
  confidence: OcrConfidenceLevel;
  confidenceScore: number;
  selected: boolean;
  notes: string;
  alreadyExists?: boolean;
}

export interface FloorplanOcrAnalysisResult {
  rooms: RecognizedFloorplanRoomDraft[];
  detectedScale: string | null;
  extractionMethod: 'pdf_vector' | 'ocr' | 'hybrid';
  rawTokensCount: number;
  warnings: string[];
}

export interface FloorplanOcrProgress {
  stage: 'preparing' | 'recognizing' | 'parsing';
  progress: number;
  message: string;
}

interface ParsedRoomLabel {
  name: string;
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
  inlinePair: { w: number; l: number } | null;
  inlineArea: number | null;
  inlinePerimeter: number | null;
  matchedKnownTerm: boolean;
}

interface ParsedCotaItem {
  kind: 'pair' | 'single' | 'area' | 'perimeter';
  cx: number;
  cy: number;
  isVertical: boolean;
  confidence: number;
  width?: number;
  length?: number;
  value?: number;
  rawText: string;
  used: boolean;
}

const KNOWN_ROOM_PATTERNS: RegExp[] = [
  /\bQUARTO(?:S)?\b/i,
  /\bDORMIT[OÓ]RIO(?:S)?\b/i,
  /\bDORM\.?\b/i,
  /\bSU[IÍ]TE(?:\s+MASTER)?\b/i,
  /\bSALA(?:\s+DE\s+(?:ESTAR|JANTAR|TV|REUNI[AÃ]O|ESPERA|JOGOS|T[EÉ]CNICA|[IÍ]NTIMA))?\b/i,
  /\bLIVING\b/i,
  /\bESTAR\b/i,
  /\bJANTAR\b/i,
  /\bCOZINHA\b/i,
  /\bCOPA\b/i,
  /\bBANHEIRO(?:S)?\b/i,
  /\bBANHO\b/i,
  /\bBWC\b/i,
  /\bW\.?C\.?\b/i,
  /\bLAVABO\b/i,
  /\bVARANDA(?:\s+GOURMET)?\b/i,
  /\bSACADA\b/i,
  /\bTERRA[CÇ]O\b/i,
  /\b[AÁ]REA\s+(?:DE\s+SERVI[CÇ]O|GOURMET|EXTERNA|PRIVATIVA|DE\s+LAZER)\b/i,
  /\bESPA[CÇ]O\s+GOURMET\b/i,
  /\bLAVANDERIA\b/i,
  /\bCIRCULA[CÇ][AÃ]O\b/i,
  /\bCORREDOR\b/i,
  /\bHALL\b/i,
  /\bGARAGEM\b/i,
  /\bABRIGO\b/i,
  /\bESCRIT[OÓ]RIO\b/i,
  /\bHOME\s*OFFICE\b/i,
  /\bOFFICE\b/i,
  /\bCLOSET\b/i,
  /\bDESPENSA\b/i,
  /\bDEP[OÓ]SITO\b/i,
  /\bROUPARIA\b/i,
  /\bATELI[EÊ]\b/i,
  /\bRECEP[CÇ][AÃ]O\b/i,
  /\bCONSULT[OÓ]RIO\b/i,
  /\bLOJA\b/i,
  /\bESTOQUE\b/i,
  /\bMEZANINO\b/i,
  /\bQUINTAL\b/i,
  /\bJARDIM(?:\s+DE\s+INVERNO)?\b/i,
  /\bCHURRASQUEIRA\b/i,
  /\bBRINQUEDOTECA\b/i,
  /\bACADEMIA\b/i,
  /\bADEGA\b/i,
  /\bEST[UÚ]DIO\b/i,
  /\bSTUDIO\b/i,
  /\bED[IÍ]CULA\b/i,
  /\bAUDIT[OÓ]RIO\b/i,
  /\bALMOXARIFADO\b/i,
  /\bSHOWROOM\b/i,
];

const NON_ROOM_BLACKLIST: RegExp[] = [
  /^(?:PLANTA\s+BAIXA|PLANTA(?:\s+DE\s+.*|\s+HUMANIZADA)?|PROJETO(?:\s+.*)?|ESCALA|ESC\.?|COTAS?|LEGENDA|OBSERVA[CÇ][OÕ]ES|OBS\.?|NORTE|DATA|FOLHA|PRANCHA|CLIENTE|ARQUITETO|ENGENHEIRO|CREA|CAU|DETALHE(?:\s+.*)?|CORTE(?:\s+[A-Z0-9]+)?|FACHADA(?:\s+.*)?|COBERTURA|PAVIMENTO(?:\s+.*)?|T[EÉ]RREO|SUBSOLO|N[IÍ]VEL|PROJE[CÇ][AÃ]O(?:\s+.*)?|RUA|AVENIDA|AV\.?|BAIRRO|CIDADE|PORTA|JANELA|PAREDE|PILAR|VIGA|LAJE|BEIRAL|TELHADO|MURO|CAL[CÇ]ADA|RECUO|AFASTAMENTO|P[EÉ]\s+DIREITO|ALTURA|METROS|TOTAL|[AÁ]REA\s+TOTAL|[AÁ]REA\s+CONSTRU[IÍ]DA|[AÁ]REA\s+DO\s+TERRENO|LOTE|QUADRA|REVIS[AÃ]O|SOBE|DESCE|ACESSO|ENTRADA|SA[IÍ]DA)$/i,
  /^(?:P\d+|J\d+|B\d+|C\d+|V\d+|PEIT\.?|N\.?[AP]\.?)$/i,
];

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeRoomComparisonKey(rawName: string): string {
  return stripDiacritics(rawName)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeRoomDisplayName(rawName: string): string {
  const cleaned = rawName
    .replace(/[|[\]{}()]+/g, ' ')
    .replace(/^(?:\d{1,2}\s*[.\-–)]\s*|[-–•*]+\s*)/, '')
    .replace(/[-–•*]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const upper = cleaned.toUpperCase();
  if (upper === 'BWC' || upper === 'WC' || upper === 'W.C.' || upper === 'W.C') {
    return 'Banheiro (BWC)';
  }
  if (upper === 'A.S.' || upper === 'AS') {
    return 'Área de Serviço';
  }

  const lowercaseParticles = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);
  return cleaned
    .split(' ')
    .map((word, idx) => {
      if (/^(?:bwc|wc|tv)$/i.test(word)) return word.toUpperCase();
      if (/^\d+$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (idx > 0 && lowercaseParticles.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function parseLocaleNumeric(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Normaliza uma dimensão linear em metros (aceita metros e centímetros).
 * Retorna null se estiver fora da faixa realista para cômodos (0.55 m a 40 m).
 */
export function normalizeLinearToMeters(
  rawNumberStr: string,
  unitHint?: string
): number | null {
  const val = parseLocaleNumeric(rawNumberStr);
  if (val === null) return null;

  const unit = (unitHint || '').toLowerCase().trim();
  const hasDecimalSeparator = /[.,]/.test(rawNumberStr);

  let meters: number;
  if (unit === 'cm') {
    meters = val / 100;
  } else if (unit === 'm' || unit === 'mt' || unit === 'mts') {
    // Mesmo com 'm', se for inteiro grande (ex: 350), não assumimos 350 metros de cômodo
    if (!hasDecimalSeparator && val >= 55) {
      meters = val / 100;
    } else {
      meters = val;
    }
  } else if (!hasDecimalSeparator && val >= 55 && val <= 4000) {
    // Cotas CAD clássicas em centímetros sem unidade (ex: 300, 350, 420)
    meters = val / 100;
  } else {
    meters = val;
  }

  meters = round2(meters);
  if (meters < 0.55 || meters > 40) return null;
  return meters;
}

function isLikelyDoorOrWindowSpec(text: string, w: number, l: number): boolean {
  if (/\b(?:P\d+|J\d+|PORTA|JANELA|PEIT(?:ORIL)?|H\s*=)\b/i.test(text)) {
    return true;
  }
  if (matchesKnownRoomTerm(text)) {
    return false;
  }
  // Medidas típicas de porta sem rótulo de ambiente (0,60..0,92 × 2,10)
  const minSide = Math.min(w, l);
  const maxSide = Math.max(w, l);
  if (minSide >= 0.58 && minSide <= 0.92 && Math.abs(maxSide - 2.1) <= 0.02) {
    return true;
  }
  return false;
}

export function extractScaleFromText(text: string): string | null {
  const match = text.match(/(?:ESCALA|ESC\.?)\s*[:=]?\s*(1\s*[:/]\s*\d{2,4})/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, '').replace('/', ':');
}

export function extractDimensionPairFromText(text: string): {
  w: number;
  l: number;
  cleanedRemainder: string;
} | null {
  const cleanText = text.replace(/(?:ESCALA|ESC\.?)\s*[:=]?\s*1\s*[:/]\s*\d{2,4}/gi, ' ');
  const pairRegex =
    /(\d+(?:[.,]\d{1,2})?)\s*(cm|mts|mt|m)?\s*[x×*]\s*(\d+(?:[.,]\d{1,2})?)\s*(cm|mts|mt|m)?/i;
  const match = cleanText.match(pairRegex);
  if (!match) return null;

  const unitA = match[2] || match[4] || '';
  const unitB = match[4] || match[2] || '';
  const w = normalizeLinearToMeters(match[1], unitA);
  const l = normalizeLinearToMeters(match[3], unitB);
  if (w === null || l === null) return null;

  if (isLikelyDoorOrWindowSpec(cleanText, w, l)) return null;

  const cleanedRemainder = cleanText.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { w, l, cleanedRemainder };
}

export function extractAreaFromText(text: string): {
  area: number;
  cleanedRemainder: string;
} | null {
  const regex = /(?:[AÁ](?:REA)?\s*[:=]?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:m²|m2|M²|M2)/i;
  const match = text.match(regex);
  if (!match) return null;
  const val = parseLocaleNumeric(match[1]);
  if (val === null || val < 0.5 || val > 2000) return null;
  const cleanedRemainder = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { area: round2(val), cleanedRemainder };
}

export function extractPerimeterFromText(text: string): {
  perimeter: number;
  cleanedRemainder: string;
} | null {
  const regex = /(?:PER[IÍ]METRO|P)\s*[:=]\s*(\d+(?:[.,]\d{1,2})?)\s*(cm|ml|m)?/i;
  const match = text.match(regex);
  if (!match) return null;
  const unit = (match[2] || 'm').toLowerCase();
  const raw = parseLocaleNumeric(match[1]);
  if (raw === null) return null;
  const perimeter = round2(unit === 'cm' ? raw / 100 : raw);
  if (perimeter < 2 || perimeter > 500) return null;
  const cleanedRemainder = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { perimeter, cleanedRemainder };
}

function isBlacklistedNonRoomText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return true;
  if (/^[\d.,/:\-+x×*%()m²\s]+$/i.test(trimmed)) return true;
  const noDia = stripDiacritics(trimmed);
  for (const rx of NON_ROOM_BLACKLIST) {
    if (rx.test(trimmed) || rx.test(noDia)) return true;
  }
  return false;
}

function matchesKnownRoomTerm(text: string): boolean {
  const normalized = text.trim();
  const noDia = stripDiacritics(normalized);
  return KNOWN_ROOM_PATTERNS.some((rx) => rx.test(normalized) || rx.test(noDia));
}

function isPlausibleGenericRoomLabel(text: string): boolean {
  const clean = text.replace(/[:\-–]+$/g, '').trim();
  if (clean.length < 3 || clean.length > 36) return false;
  if (isBlacklistedNonRoomText(clean)) return false;
  const lettersCount = (clean.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (lettersCount < 3) return false;
  const words = clean.split(/\s+/);
  if (words.length > 5) return false;
  // Evita frases longas de observação/nota técnica
  if (/[,;!?]/.test(clean)) return false;
  return true;
}

function extractStandaloneCota(text: string): number | null {
  const trimmed = text
    .replace(/^(?:L|C|W|H|DIM\.?)\s*[:=]\s*/i, '')
    .trim();
  if (!trimmed) return null;
  // Rejeita escalas, datas, porcentagens, cotas de nível (+0,15) ou dimensões com 'x'
  if (/[:/%×*]/.test(trimmed) || /^[+-]/.test(trimmed)) return null;
  const m = trimmed.match(/^(\d+(?:[.,]\d{1,2})?)\s*(cm|mts|mt|m)?$/i);
  if (!m) return null;
  return normalizeLinearToMeters(m[1], m[2]);
}

function groupHorizontalTokens(tokens: FloorplanTextToken[]): FloorplanTextToken[] {
  if (tokens.length === 0) return [];
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
  const grouped: FloorplanTextToken[] = [];

  for (const tok of sorted) {
    const cleanText = tok.text.replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    const tokCy = tok.y + tok.height / 2;
    const prev = grouped[grouped.length - 1];
    if (prev && !prev.isVertical && !tok.isVertical) {
      const prevCy = prev.y + prev.height / 2;
      const lineTol = Math.max(0.012, Math.max(prev.height, tok.height) * 0.75);
      const maxWordGap = Math.max(0.016, Math.min(0.032, Math.max(prev.height, tok.height) * 1.25));
      const xGap = tok.x - (prev.x + prev.width);
      if (Math.abs(tokCy - prevCy) <= lineTol && xGap >= -0.02 && xGap <= maxWordGap) {
        const minX = Math.min(prev.x, tok.x);
        const minY = Math.min(prev.y, tok.y);
        const maxX = Math.max(prev.x + prev.width, tok.x + tok.width);
        const maxY = Math.max(prev.y + prev.height, tok.y + tok.height);
        prev.text = `${prev.text} ${cleanText}`.replace(/\s+/g, ' ').trim();
        prev.x = minX;
        prev.y = minY;
        prev.width = maxX - minX;
        prev.height = maxY - minY;
        prev.confidence = Math.min(prev.confidence, tok.confidence);
        continue;
      }
    }

    grouped.push({
      ...tok,
      text: cleanText,
    });
  }

  return grouped;
}

/**
 * Motor espacial puro: analisa tokens de texto com coordenadas normalizadas (0..1)
 * e relaciona ambientes às suas respectivas dimensões e áreas com rigor geométrico.
 */
export function analyzeFloorplanTokens(
  rawTokens: FloorplanTextToken[],
  existingRoomNames: string[] = []
): FloorplanOcrAnalysisResult {
  const warnings: string[] = [];
  const tokens = groupHorizontalTokens(rawTokens);

  let detectedScale: string | null = null;
  for (const tok of tokens) {
    const sc = extractScaleFromText(tok.text);
    if (sc) {
      detectedScale = sc;
      break;
    }
  }

  const roomLabels: ParsedRoomLabel[] = [];
  const cotas: ParsedCotaItem[] = [];

  for (const tok of tokens) {
    let working = tok.text.trim();
    if (!working) continue;

    // Extrai metadados explícitos da linha (escala, área, perímetro, par L × C)
    if (extractScaleFromText(working)) {
      working = working.replace(/(?:ESCALA|ESC\.?)\s*[:=]?\s*1\s*[:/]\s*\d{2,4}/gi, '').trim();
      if (!working) continue;
    }

    const cx = tok.x + tok.width / 2;
    const cy = tok.y + tok.height / 2;

    const areaRes = extractAreaFromText(working);
    if (areaRes) working = areaRes.cleanedRemainder;

    const perimRes = extractPerimeterFromText(working);
    if (perimRes) working = perimRes.cleanedRemainder;

    const pairRes = extractDimensionPairFromText(working);
    if (pairRes) working = pairRes.cleanedRemainder;

    // Se sobrou um rótulo válido de ambiente junto com par/área, ou isolado
    const labelText = working.replace(/[.,;:\-–]+$/g, '').trim();
    const isKnown = labelText ? matchesKnownRoomTerm(labelText) : false;
    const isGeneric = labelText ? isPlausibleGenericRoomLabel(labelText) : false;

    const hasInlineMeasure = Boolean(pairRes || areaRes || perimRes);

    const isUpperOrTitleLabel =
      /^[A-ZÀ-Ú0-9\s/.\-]+$/.test(labelText) ||
      /^[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9\s/.\-]+$/.test(labelText);

    if (labelText && (isKnown || (isGeneric && (hasInlineMeasure || isUpperOrTitleLabel)))) {
      // Evita tratar linhas como "3,50" disfarçadas
      if (!isBlacklistedNonRoomText(labelText)) {
        roomLabels.push({
          name: normalizeRoomDisplayName(labelText),
          cx,
          cy,
          x0: tok.x,
          y0: tok.y,
          x1: tok.x + tok.width,
          y1: tok.y + tok.height,
          confidence: tok.confidence,
          inlinePair: pairRes ? { w: pairRes.w, l: pairRes.l } : null,
          inlineArea: areaRes ? areaRes.area : null,
          inlinePerimeter: perimRes ? perimRes.perimeter : null,
          matchedKnownTerm: isKnown,
        });
        continue;
      }
    }

    // Caso contrário, registra como cota/área/perímetro independente para associação espacial
    if (pairRes) {
      cotas.push({
        kind: 'pair',
        cx,
        cy,
        isVertical: Boolean(tok.isVertical),
        confidence: tok.confidence,
        width: pairRes.w,
        length: pairRes.l,
        rawText: tok.text,
        used: false,
      });
    }
    if (areaRes) {
      cotas.push({
        kind: 'area',
        cx,
        cy,
        isVertical: Boolean(tok.isVertical),
        confidence: tok.confidence,
        value: areaRes.area,
        rawText: tok.text,
        used: false,
      });
    }
    if (perimRes) {
      cotas.push({
        kind: 'perimeter',
        cx,
        cy,
        isVertical: Boolean(tok.isVertical),
        confidence: tok.confidence,
        value: perimRes.perimeter,
        rawText: tok.text,
        used: false,
      });
    }

    if (!pairRes && !areaRes && !perimRes) {
      const singleVal = extractStandaloneCota(working);
      if (singleVal !== null) {
        cotas.push({
          kind: 'single',
          cx,
          cy,
          isVertical: Boolean(tok.isVertical) || tok.height > tok.width * 1.35,
          confidence: tok.confidence,
          value: singleVal,
          rawText: tok.text,
          used: false,
        });
      }
    }
  }

  // Limites do cluster de cômodos para proteger contra cotas externas do imóvel
  let minRoomX = 1;
  let maxRoomX = 0;
  let minRoomY = 1;
  let maxRoomY = 0;
  for (const r of roomLabels) {
    minRoomX = Math.min(minRoomX, r.x0);
    maxRoomX = Math.max(maxRoomX, r.x1);
    minRoomY = Math.min(minRoomY, r.y0);
    maxRoomY = Math.max(maxRoomY, r.y1);
  }

  const isExternalPerimeterCota = (c: ParsedCotaItem): boolean => {
    if (roomLabels.length < 2) return false;
    const margin = 0.055;
    return (
      c.cx < minRoomX - margin ||
      c.cx > maxRoomX + margin ||
      c.cy < minRoomY - margin ||
      c.cy > maxRoomY + margin
    );
  };

  const distanceToRoom = (c: ParsedCotaItem, r: ParsedRoomLabel): number => {
    const dx = c.cx - r.cx;
    const dy = c.cy - r.cy;
    return Math.hypot(dx, dy);
  };

  const isStrictlyClosestToRoom = (c: ParsedCotaItem, rIdx: number, maxRadius: number): boolean => {
    const target = roomLabels[rIdx];
    const dTarget = distanceToRoom(c, target);
    if (dTarget > maxRadius) return false;
    for (let j = 0; j < roomLabels.length; j++) {
      if (j === rIdx) continue;
      const dOther = distanceToRoom(c, roomLabels[j]);
      if (dOther <= dTarget * 1.28) {
        // Ambíguo entre dois cômodos próximos (parede compartilhada) -> não arriscar
        return false;
      }
    }
    return true;
  };

  const existingSet = new Set(
    existingRoomNames.map((n) => n.trim().toLowerCase().replace(/\s+/g, ' '))
  );

  const recognizedDrafts: RecognizedFloorplanRoomDraft[] = [];

  for (let i = 0; i < roomLabels.length; i++) {
    const room = roomLabels[i];

    let widthMeters: number | null = room.inlinePair ? room.inlinePair.w : null;
    let lengthMeters: number | null = room.inlinePair ? room.inlinePair.l : null;
    let explicitArea: number | null = room.inlineArea;
    let explicitPerimeter: number | null = room.inlinePerimeter;
    let measureConfidence = room.confidence;
    let notes = '';

    // 1. Procura par L × C logo abaixo ou imediatamente próximo ao nome do ambiente
    if (widthMeters === null && lengthMeters === null) {
      let bestPairIdx = -1;
      let bestPairDist = Infinity;

      for (let cIdx = 0; cIdx < cotas.length; cIdx++) {
        const c = cotas[cIdx];
        if (c.used || c.kind !== 'pair') continue;
        if (!isStrictlyClosestToRoom(c, i, 0.16)) continue;
        const dist = distanceToRoom(c, room);
        if (dist < bestPairDist) {
          bestPairDist = dist;
          bestPairIdx = cIdx;
        }
      }

      if (bestPairIdx !== -1) {
        const matched = cotas[bestPairIdx];
        matched.used = true;
        widthMeters = matched.width ?? null;
        lengthMeters = matched.length ?? null;
        measureConfidence = Math.min(measureConfidence, matched.confidence);
      }
    }

    // 2. Procura área explícita (m²) próxima quando não veio inline
    if (explicitArea === null) {
      let bestAreaIdx = -1;
      let bestAreaDist = Infinity;
      for (let cIdx = 0; cIdx < cotas.length; cIdx++) {
        const c = cotas[cIdx];
        if (c.used || c.kind !== 'area') continue;
        if (!isStrictlyClosestToRoom(c, i, 0.14)) continue;
        const dist = distanceToRoom(c, room);
        if (dist < bestAreaDist) {
          bestAreaDist = dist;
          bestAreaIdx = cIdx;
        }
      }
      if (bestAreaIdx !== -1) {
        const matched = cotas[bestAreaIdx];
        matched.used = true;
        explicitArea = matched.value ?? null;
        measureConfidence = Math.min(measureConfidence, matched.confidence);
      }
    }

    // 3. Se ainda não tem L × C, tenta associar duas cotas individuais não ambíguas dentro do cômodo
    if (widthMeters === null && lengthMeters === null) {
      const candidateSingles: { cIdx: number; dist: number; item: ParsedCotaItem }[] = [];
      for (let cIdx = 0; cIdx < cotas.length; cIdx++) {
        const c = cotas[cIdx];
        if (c.used || c.kind !== 'single') continue;
        if (isExternalPerimeterCota(c)) continue;
        if (!isStrictlyClosestToRoom(c, i, 0.14)) continue;
        candidateSingles.push({ cIdx, dist: distanceToRoom(c, room), item: c });
      }

      candidateSingles.sort((a, b) => a.dist - b.dist);

      if (candidateSingles.length >= 2) {
        const horiz = candidateSingles.find((c) => !c.item.isVertical);
        const vert = candidateSingles.find((c) => c.item.isVertical && c !== horiz);
        const first = horiz || candidateSingles[0];
        const second = vert || candidateSingles.find((c) => c !== first);

        if (first && second && first.item.value && second.item.value) {
          cotas[first.cIdx].used = true;
          cotas[second.cIdx].used = true;
          widthMeters = first.item.value;
          lengthMeters = second.item.value;
          measureConfidence = Math.min(
            measureConfidence,
            first.item.confidence,
            second.item.confidence
          );
          notes = 'Medidas associadas por proximidade das cotas internas.';
        }
      } else if (candidateSingles.length === 1 && candidateSingles[0].item.value) {
        // Regra 4: Apenas uma medida encontrada -> deixa o outro campo em branco e não inventa cálculo
        cotas[candidateSingles[0].cIdx].used = true;
        if (candidateSingles[0].item.isVertical) {
          lengthMeters = candidateSingles[0].item.value;
        } else {
          widthMeters = candidateSingles[0].item.value;
        }
        notes = 'Apenas uma dimensão identificada; informe a medida complementar.';
      }
    }

    // Consistência entre L × C e Área explícita (quando ambos existem)
    let areaSqm: number | null = null;
    let perimeterMeters: number | null = explicitPerimeter;
    let isAreaOnly = false;
    let confidence: OcrConfidenceLevel = 'low';

    if (widthMeters !== null && lengthMeters !== null) {
      const calcArea = round2(widthMeters * lengthMeters);
      const calcPerim = round2(2 * (widthMeters + lengthMeters));

      if (explicitArea !== null) {
        const diff = Math.abs(calcArea - explicitArea);
        if (diff <= Math.max(0.4, explicitArea * 0.08)) {
          areaSqm = calcArea;
          perimeterMeters = explicitPerimeter ?? calcPerim;
          confidence = measureConfidence >= 70 ? 'high' : 'medium';
        } else {
          // Conflito (ex: cômodo irregular onde L × C não bate com a área escrita na planta)
          areaSqm = explicitArea;
          perimeterMeters = explicitPerimeter;
          isAreaOnly = true;
          confidence = 'medium';
          notes = `Área escrita (${explicitArea.toFixed(2)} m²) difere de L × C (${calcArea.toFixed(2)} m²). Área preservada.`;
        }
      } else {
        areaSqm = calcArea;
        perimeterMeters = explicitPerimeter ?? calcPerim;
        confidence =
          room.inlinePair || notes === ''
            ? measureConfidence >= 72
              ? 'high'
              : 'medium'
            : 'medium';
      }
    } else if (explicitArea !== null) {
      // Regra 4: Só tem área explícita -> usa área como referência sem inventar L e C
      areaSqm = explicitArea;
      perimeterMeters = explicitPerimeter;
      isAreaOnly = true;
      confidence = measureConfidence >= 70 ? 'medium' : 'low';
      notes = 'Apenas área identificada diretamente na planta (largura e comprimento não informados).';
    } else {
      // Sem par completo nem área -> deixa campos em branco para preenchimento manual
      confidence = 'low';
      if (!notes) {
        notes = 'Dimensões não identificadas com segurança; preencha manualmente.';
      }
    }

    // Filtra possíveis falsos positivos genéricos que não têm nenhuma medida nem termo conhecido
    if (!room.matchedKnownTerm && widthMeters === null && lengthMeters === null && areaSqm === null) {
      continue;
    }

    const normalizedKey = room.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const alreadyExists = existingSet.has(normalizedKey);

    recognizedDrafts.push({
      tempId: `ocr_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name: room.name,
      widthMeters,
      lengthMeters,
      areaSqm,
      perimeterMeters,
      isAreaOnly,
      confidence,
      confidenceScore: Math.round(measureConfidence),
      selected:
        !alreadyExists &&
        confidence !== 'low' &&
        (areaSqm !== null || (widthMeters !== null && lengthMeters !== null)),
      notes: alreadyExists
        ? `Ambiente já cadastrado na lista. ${notes}`.trim()
        : notes,
      alreadyExists,
    });
  }

  if (recognizedDrafts.length === 0) {
    warnings.push(
      'Não foi possível extrair ambientes com nitidez suficiente desta planta. Você pode cadastrar os ambientes manualmente.'
    );
  } else {
    const lowCount = recognizedDrafts.filter((r) => r.confidence === 'low').length;
    if (lowCount > 0) {
      warnings.push(
        `${lowCount} ${
          lowCount === 1 ? 'ambiente ficou' : 'ambientes ficaram'
        } com medidas incompletas ou incertas e precisam de conferência manual.`
      );
    }
  }

  const hasPdf = rawTokens.some((t) => t.source === 'pdf_vector');
  const hasOcr = rawTokens.some((t) => t.source === 'ocr');

  return {
    rooms: recognizedDrafts,
    detectedScale,
    extractionMethod: hasPdf && hasOcr ? 'hybrid' : hasPdf ? 'pdf_vector' : 'ocr',
    rawTokensCount: rawTokens.length,
    warnings,
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem para leitura OCR.'));
    img.src = src;
  });
}

/**
 * Pré-processamento local em Canvas para realçar textos e cotas de plantas baixas
 * (escala proporcional para ~2200px, escala de cinza, normalização de contraste).
 */
async function buildPreprocessedCanvas(dataUrl: string): Promise<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}> {
  const img = await loadImageElement(dataUrl);
  const srcW = img.naturalWidth || img.width || 1200;
  const srcH = img.naturalHeight || img.height || 800;

  const maxSide = Math.max(srcW, srcH);
  // Amplia plantas pequenas (ex.: prints do WhatsApp) para melhorar leitura OCR de algarismos
  let scale = 1;
  if (maxSide < 1800) {
    scale = Math.min(2.2, 2000 / Math.max(1, maxSide));
  } else if (maxSide > 2800) {
    scale = 2600 / maxSide;
  }

  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Contexto Canvas indisponível para processamento da planta.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Calcula luminância média para detectar plantas em fundo escuro (blueprint invertido)
  let lumSum = 0;
  const sampleStep = 4 * 4;
  let sampleCount = 0;
  for (let i = 0; i < data.length; i += sampleStep) {
    lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sampleCount += 1;
  }
  const meanLum = sampleCount > 0 ? lumSum / sampleCount : 255;
  const invertDarkBg = meanLum < 110;

  for (let i = 0; i < data.length; i += 4) {
    let lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (invertDarkBg) lum = 255 - lum;
    // Aumenta contraste em torno dos tons de texto mantendo traços limpos
    let stretched = ((lum - 35) * 255) / (235 - 35);
    if (stretched < 0) stretched = 0;
    if (stretched > 255) stretched = 255;
    if (stretched > 218) stretched = 255;
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return { canvas, width: targetW, height: targetH };
}

function extractLinesFromTesseractData(
  page: any,
  imgW: number,
  imgH: number
): FloorplanTextToken[] {
  const tokens: FloorplanTextToken[] = [];
  if (!page || !Array.isArray(page.blocks)) return tokens;

  for (const block of page.blocks) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    for (const para of paragraphs) {
      const lines = Array.isArray(para?.lines) ? para.lines : [];
      for (const line of lines) {
        const text = String(line?.text || '').replace(/\s+/g, ' ').trim();
        const bbox = line?.bbox;
        if (!text || !bbox) continue;
        const w = Math.max(1, bbox.x1 - bbox.x0);
        const h = Math.max(1, bbox.y1 - bbox.y0);
        tokens.push({
          text,
          x: bbox.x0 / imgW,
          y: bbox.y0 / imgH,
          width: w / imgW,
          height: h / imgH,
          confidence: Number(line?.confidence) || 0,
          isVertical: h > w * 1.4,
          source: 'ocr',
        });
      }
    }
  }

  return tokens;
}

export interface RoomNamesOcrResult {
  roomNames: string[];
  alreadyExistingCount: number;
  extractionMethod: 'pdf_vector' | 'ocr' | 'hybrid';
  rawTokensCount: number;
}

function mergeStackedRoomNameTokens(tokens: FloorplanTextToken[]): FloorplanTextToken[] {
  if (tokens.length <= 1) return tokens;
  const result = tokens.map((t) => ({ ...t }));
  const consumed = new Set<number>();

  for (let i = 0; i < result.length; i++) {
    if (consumed.has(i)) continue;
    const top = result[i];
    if (top.isVertical) continue;
    const upperTop = top.text.trim().toUpperCase();
    const endsWithConnector = /(?:\b(?:DE|DA|DO|DAS|DOS|E)|\/|-)$/i.test(upperTop);
    const isCompoundPrefix = /^(?:[AÁ]REA|ESPA[CÇ]O|HOME|SALA|VARANDA|BANHEIRO|SU[IÍ]TE|HALL)$/i.test(
      upperTop
    );
    if (!endsWithConnector && !isCompoundPrefix) continue;

    const topCx = top.x + top.width / 2;
    const topBottom = top.y + top.height;

    let bestIdx = -1;
    let bestDy = Infinity;

    for (let j = 0; j < result.length; j++) {
      if (i === j || consumed.has(j)) continue;
      const bottom = result[j];
      if (bottom.isVertical) continue;
      const dy = bottom.y - topBottom;
      if (dy < -0.005 || dy > Math.max(0.032, top.height * 2.2)) continue;
      const bottomCx = bottom.x + bottom.width / 2;
      if (Math.abs(bottomCx - topCx) > Math.max(0.08, Math.max(top.width, bottom.width) * 0.9)) {
        continue;
      }
      // Evita fundir com cotas/números puros
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(bottom.text)) continue;
      if (/^\d+(?:[.,]\d+)?\s*(?:m²|m2|m|cm|ml)?$/i.test(bottom.text.trim())) continue;

      if (dy < bestDy) {
        bestDy = dy;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      const bottom = result[bestIdx];
      top.text = `${top.text} ${bottom.text}`.replace(/\s+/g, ' ').trim();
      const minX = Math.min(top.x, bottom.x);
      const minY = Math.min(top.y, bottom.y);
      const maxX = Math.max(top.x + top.width, bottom.x + bottom.width);
      const maxY = Math.max(top.y + top.height, bottom.y + bottom.height);
      top.x = minX;
      top.y = minY;
      top.width = maxX - minX;
      top.height = maxY - minY;
      top.confidence = Math.min(top.confidence, bottom.confidence);
      consumed.add(bestIdx);
    }
  }

  return result.filter((_, idx) => !consumed.has(idx));
}

function stripEmbeddedMeasurementsForRoomName(rawText: string): string {
  let working = rawText.trim();
  if (!working) return '';

  // Remove indicações de escala
  working = working.replace(/(?:ESCALA|ESC\.?)\s*[:=]?\s*1\s*[:/]\s*\d{2,4}/gi, ' ');
  // Remove pares de dimensões (ex: 3,20 x 4,00 ou 3.20x4.00m)
  working = working.replace(
    /\d+(?:[.,]\d{1,2})?\s*(?:cm|mts|mt|m)?\s*[x×*]\s*\d+(?:[.,]\d{1,2})?\s*(?:cm|mts|mt|m)?/gi,
    ' '
  );
  // Remove valores de área explícitos (ex: 12,50 m² ou A=12,50m2)
  working = working.replace(
    /(?:[AÁ](?:REA)?\s*[:=]?\s*)?\d+(?:[.,]\d{1,2})?\s*(?:m²|m2|M²|M2)/gi,
    ' '
  );
  // Remove perímetro explícito (ex: P=14,00m)
  working = working.replace(/(?:PER[IÍ]METRO|P)\s*[:=]\s*\d+(?:[.,]\d{1,2})?\s*(?:cm|ml|m)?/gi, ' ');
  // Remove medidas decimais ou com unidade (preserva inteiros de identificação como "Quarto 1", "Suíte 02")
  working = working.replace(/\b\d+[.,]\d{1,2}\s*(?:cm|mts|mt|ml|m)?\b/gi, ' ');
  working = working.replace(/\b\d+\s*(?:cm|mts|mt|ml|m)\b/gi, ' ');
  working = working.replace(/\s+/g, ' ').trim();
  return working;
}

/**
 * Extrai EXCLUSIVAMENTE os nomes dos ambientes identificados nos tokens da planta.
 * Não identifica dimensões, cotas, largura ou comprimento e não calcula área nem perímetro.
 */
export function extractRoomNamesFromTokens(
  rawTokens: FloorplanTextToken[],
  existingRoomNames: string[] = []
): RoomNamesOcrResult {
  const horizontal = groupHorizontalTokens(rawTokens);
  const tokens = mergeStackedRoomNameTokens(horizontal);

  const existingKeys = new Set(
    existingRoomNames
      .map((n) => normalizeRoomComparisonKey(n))
      .filter(Boolean)
  );
  const seenInScan = new Set<string>();

  const roomNames: string[] = [];
  let alreadyExistingCount = 0;

  for (const tok of tokens) {
    const cleaned = stripEmbeddedMeasurementsForRoomName(tok.text);
    const labelText = cleaned.replace(/[.,;:\-–]+$/g, '').trim();
    if (!labelText) continue;
    if (isBlacklistedNonRoomText(labelText)) continue;

    const isKnown = matchesKnownRoomTerm(labelText);
    const isGeneric = isPlausibleGenericRoomLabel(labelText);
    const hasVowel = /[aeiouáàâãéêíóôõú]/i.test(labelText);
    const isCleanFormat =
      /^(?:[A-ZÀ-Ú]{3,}|[A-ZÀ-Ú][a-zà-ÿ]{2,})(?:\s+(?:de|da|do|das|dos|e|\/|[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9/.\-]*|\d{1,2}))*$/.test(
        labelText
      );
    const hasSufficientConfidence =
      tok.source === 'pdf_vector' ||
      (isKnown ? tok.confidence >= 20 : tok.confidence >= 70);

    if (!hasSufficientConfidence) continue;
    if (!isKnown && !(isGeneric && hasVowel && isCleanFormat && labelText.length >= 4)) {
      continue;
    }

    const displayName = normalizeRoomDisplayName(labelText);
    if (!displayName || isBlacklistedNonRoomText(displayName)) continue;

    const key = normalizeRoomComparisonKey(displayName);
    if (!key || seenInScan.has(key)) continue;
    seenInScan.add(key);

    if (existingKeys.has(key)) {
      alreadyExistingCount += 1;
      continue;
    }

    roomNames.push(displayName);
  }

  const hasPdf = rawTokens.some((t) => t.source === 'pdf_vector');
  const hasOcr = rawTokens.some((t) => t.source === 'ocr');

  return {
    roomNames,
    alreadyExistingCount,
    extractionMethod: hasPdf && hasOcr ? 'hybrid' : hasPdf ? 'pdf_vector' : 'ocr',
    rawTokensCount: rawTokens.length,
  };
}

/**
 * Executa OCR local (e leitura vetorial de PDF quando disponível) para identificar
 * EXCLUSIVAMENTE os nomes dos ambientes da planta importada.
 */
export async function runLocalFloorplanRoomNamesRecognition(params: {
  previewDataUrl: string;
  vectorTextTokens?: FloorplanTextToken[];
  existingRoomNames?: string[];
  onProgress?: (info: FloorplanOcrProgress) => void;
}): Promise<RoomNamesOcrResult> {
  const { previewDataUrl, vectorTextTokens = [], existingRoomNames = [], onProgress } = params;

  onProgress?.({
    stage: 'preparing',
    progress: 10,
    message: 'Preparando imagem da planta para identificar ambientes...',
  });

  if (vectorTextTokens.length >= 4) {
    onProgress?.({
      stage: 'parsing',
      progress: 80,
      message: 'Identificando nomes dos ambientes no PDF...',
    });
    const vectorResult = extractRoomNamesFromTokens(vectorTextTokens, existingRoomNames);
    if (vectorResult.roomNames.length > 0 || vectorResult.alreadyExistingCount > 0) {
      onProgress?.({
        stage: 'parsing',
        progress: 100,
        message: 'Ambientes identificados!',
      });
      return vectorResult;
    }
  }

  if (!previewDataUrl) {
    throw new Error('Nenhuma imagem da planta disponível para identificar ambientes.');
  }

  const { canvas, width, height } = await buildPreprocessedCanvas(previewDataUrl);

  onProgress?.({
    stage: 'recognizing',
    progress: 25,
    message: 'Inicializando motor OCR local...',
  });

  const worker = await createWorker('por', OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract',
    langPath: '/tesseract',
    workerBlobURL: false,
    gzip: true,
    logger: (msg) => {
      if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
        const pct = Math.round(35 + msg.progress * 50);
        onProgress?.({
          stage: 'recognizing',
          progress: pct,
          message: `Identificando nomes dos ambientes (${Math.round(msg.progress * 100)}%)...`,
        });
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });

    const sparseRes = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const sparseTokens = extractLinesFromTesseractData(sparseRes.data, width, height);
    let combinedTokens =
      vectorTextTokens.length > 0 ? [...vectorTextTokens, ...sparseTokens] : sparseTokens;
    let result = extractRoomNamesFromTokens(combinedTokens, existingRoomNames);

    // Fallback com segmentação automática caso SPARSE_TEXT não encontre nomes de ambientes
    if (result.roomNames.length === 0 && result.alreadyExistingCount === 0) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
      });
      const autoRes = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const autoTokens = extractLinesFromTesseractData(autoRes.data, width, height);
      if (autoTokens.length > 0) {
        combinedTokens =
          vectorTextTokens.length > 0
            ? [...vectorTextTokens, ...sparseTokens, ...autoTokens]
            : [...sparseTokens, ...autoTokens];
        result = extractRoomNamesFromTokens(combinedTokens, existingRoomNames);
      }
    }

    onProgress?.({
      stage: 'parsing',
      progress: 100,
      message: 'Identificação concluída!',
    });

    return result;
  } finally {
    await worker.terminate();
  }
}

/**
 * Executa reconhecimento local (PDF vetorial + Tesseract OCR offline em /tesseract)
 * sobre a planta carregada no visualizador.
 */
export async function runLocalFloorplanRecognition(params: {
  previewDataUrl: string;
  vectorTextTokens?: FloorplanTextToken[];
  existingRoomNames?: string[];
  onProgress?: (info: FloorplanOcrProgress) => void;
}): Promise<FloorplanOcrAnalysisResult> {
  const { previewDataUrl, vectorTextTokens = [], existingRoomNames = [], onProgress } = params;

  onProgress?.({
    stage: 'preparing',
    progress: 10,
    message: 'Preparando imagem e textos da planta...',
  });

  // Se o PDF já trouxe texto vetorial completo, usa diretamente com máxima precisão
  if (vectorTextTokens.length >= 6) {
    onProgress?.({
      stage: 'parsing',
      progress: 80,
      message: 'Relacionando ambientes e cotas do PDF...',
    });
    const vectorResult = analyzeFloorplanTokens(vectorTextTokens, existingRoomNames);
    if (vectorResult.rooms.length > 0) {
      onProgress?.({
        stage: 'parsing',
        progress: 100,
        message: 'Leitura concluída!',
      });
      return vectorResult;
    }
  }

  if (!previewDataUrl) {
    throw new Error('Nenhuma imagem da planta disponível para reconhecimento.');
  }

  const { canvas, width, height } = await buildPreprocessedCanvas(previewDataUrl);

  onProgress?.({
    stage: 'recognizing',
    progress: 25,
    message: 'Inicializando motor OCR local...',
  });

  const worker = await createWorker('por', OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract',
    langPath: '/tesseract',
    workerBlobURL: false,
    gzip: true,
    logger: (msg) => {
      if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
        const pct = Math.round(35 + msg.progress * 50);
        onProgress?.({
          stage: 'recognizing',
          progress: pct,
          message: `Reconhecendo textos e cotas (${Math.round(msg.progress * 100)}%)...`,
        });
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });

    const sparseRes = await worker.recognize(canvas, {}, { text: true, blocks: true });
    let ocrTokens = extractLinesFromTesseractData(sparseRes.data, width, height);

    // Fallback com segmentação automática caso SPARSE_TEXT retorne poucos blocos
    if (ocrTokens.length < 4) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
      });
      const autoRes = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const autoTokens = extractLinesFromTesseractData(autoRes.data, width, height);
      if (autoTokens.length > ocrTokens.length) {
        ocrTokens = autoTokens;
      }
    }

    onProgress?.({
      stage: 'parsing',
      progress: 92,
      message: 'Relacionando medidas e conferindo consistência...',
    });

    const combinedTokens =
      vectorTextTokens.length > 0 ? [...vectorTextTokens, ...ocrTokens] : ocrTokens;

    const analysis = analyzeFloorplanTokens(combinedTokens, existingRoomNames);

    onProgress?.({
      stage: 'parsing',
      progress: 100,
      message: 'Leitura concluída!',
    });

    return analysis;
  } finally {
    await worker.terminate();
  }
}
