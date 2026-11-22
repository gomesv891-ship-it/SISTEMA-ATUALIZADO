import { round2 } from './floorplanCalculator';

export type FloorplanRoomShape = 'rectangular' | 'irregular';

export type IrregularTurnDirection =
  | 'pending'
  | 'right_90'
  | 'left_90'
  | 'right_angle'
  | 'left_angle';

export type IrregularGeometryMethod = 'angles' | 'diagonals' | 'floorplan_trace';

export interface TracedNormalizedPoint {
  id: string;
  /** Coordenada X normalizada (0..1) relativa à largura original da imagem */
  x: number;
  /** Coordenada Y normalizada (0..1) relativa à altura original da imagem */
  y: number;
}

export interface FloorplanTraceGeometryData {
  points: TracedNormalizedPoint[];
  imageWidth: number;
  imageHeight: number;
  isClosed: boolean;
  /** Índice 0-based da parede do contorno usada como referência de escala */
  referenceEdgeIndex: number;
  /** Medida real informada pelo usuário em metros para a parede de referência */
  referenceLengthMeters: number | null;
}

export interface IrregularWallSegment {
  id: string;
  lengthMeters: number | null;
  turn: IrregularTurnDirection;
  /** Usado quando turn === 'right_angle' ou 'left_angle' (desvio em graus entre 1 e 179) */
  angleDegrees?: number | null;
}

export interface IrregularDiagonalSpec {
  id: string;
  /** Índice 1-based do vértice inicial (sempre 1 na triangulação em leque) */
  fromVertex: number;
  /** Índice 1-based do vértice destino (3, 4, ..., N-1) */
  toVertex: number;
  lengthMeters: number | null;
  /** Opcional: inverte o sentido do vértice destino para concavidades */
  reflex?: boolean;
}

export interface IrregularRoomGeometryData {
  method: IrregularGeometryMethod;
  segments: IrregularWallSegment[];
  diagonals: IrregularDiagonalSpec[];
  floorplanTrace?: FloorplanTraceGeometryData;
}

export interface SolvedPoint {
  x: number;
  y: number;
}

export interface SolvedWallEdge {
  index: number; // 1-based
  id: string;
  start: SolvedPoint;
  end: SolvedPoint;
  lengthMeters: number;
}

export interface SolvedDiagonalLine {
  fromVertex: number;
  toVertex: number;
  start: SolvedPoint;
  end: SolvedPoint;
  lengthMeters: number;
}

export interface SolvedPolygonResult {
  isComplete: boolean;
  statusLabel: 'Medidas completas' | 'Medidas pendentes';
  /** Área real calculada pelo polígono fechado (null quando incompleto/inválido) */
  areaSqm: number | null;
  /** Perímetro total (soma real de todos os trechos preenchidos quando válido, ou soma parcial) */
  perimeterMeters: number;
  /** Soma bruta dos trechos preenchidos para referência */
  enteredWallsSumMeters: number;
  isClosed: boolean;
  closureGapMeters: number | null;
  hasSelfIntersection: boolean;
  vertices: SolvedPoint[];
  edges: SolvedWallEdge[];
  diagonals: SolvedDiagonalLine[];
  missingReasons: string[];
  /** Verdadeiro quando todos os trechos têm comprimento, mas N >= 4 ainda sem ângulos nem diagonais */
  needsGeometryDisambiguation: boolean;
}

export function createDefaultIrregularSegments(count = 4): IrregularWallSegment[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `seg_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    lengthMeters: null,
    turn: 'pending' as IrregularTurnDirection,
    angleDegrees: null,
  }));
}

export function syncDiagonalsForSegmentCount(
  segmentCount: number,
  existing: IrregularDiagonalSpec[] = []
): IrregularDiagonalSpec[] {
  if (segmentCount < 4) return [];
  const neededCount = segmentCount - 3;
  const result: IrregularDiagonalSpec[] = [];
  for (let i = 0; i < neededCount; i++) {
    const toVertex = i + 3;
    const prev = existing.find((d) => d.fromVertex === 1 && d.toVertex === toVertex);
    result.push({
      id: prev?.id || `diag_1_${toVertex}`,
      fromVertex: 1,
      toVertex,
      lengthMeters: prev?.lengthMeters ?? null,
      reflex: Boolean(prev?.reflex),
    });
  }
  return result;
}

function orient2d(a: SolvedPoint, b: SolvedPoint, c: SolvedPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: SolvedPoint, b: SolvedPoint, c: SolvedPoint): boolean {
  const eps = 1e-6;
  return (
    Math.min(a.x, c.x) - eps <= b.x &&
    b.x <= Math.max(a.x, c.x) + eps &&
    Math.min(a.y, c.y) - eps <= b.y &&
    b.y <= Math.max(a.y, c.y) + eps
  );
}

function segmentsProperlyIntersect(
  p1: SolvedPoint,
  q1: SolvedPoint,
  p2: SolvedPoint,
  q2: SolvedPoint
): boolean {
  const eps = 1e-6;
  const o1 = orient2d(p1, q1, p2);
  const o2 = orient2d(p1, q1, q2);
  const o3 = orient2d(p2, q2, p1);
  const o4 = orient2d(p2, q2, q1);

  if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) &&
      (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) {
    return true;
  }

  if (Math.abs(o1) <= eps && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) <= eps && onSegment(p1, q2, q1)) return true;
  if (Math.abs(o3) <= eps && onSegment(p2, p1, q2)) return true;
  if (Math.abs(o4) <= eps && onSegment(p2, q1, q2)) return true;
  return false;
}

function detectPolygonSelfIntersection(edges: SolvedWallEdge[], isClosed: boolean): boolean {
  const n = edges.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Pula aresta adjacente entre última e primeira apenas se o polígono estiver fechado no mesmo vértice
      if (isClosed && i === 0 && j === n - 1) continue;
      if (segmentsProperlyIntersect(edges[i].start, edges[i].end, edges[j].start, edges[j].end)) {
        return true;
      }
    }
  }
  return false;
}

export function computeShoelaceArea(vertices: SolvedPoint[]): number {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return round2(Math.abs(sum) / 2);
}

/**
 * Resolve um triângulo dado V1=(0,0), V2=(L1,0) por SSS (Lei dos Cossenos).
 */
function solveSssTriangle(
  seg1: IrregularWallSegment,
  seg2: IrregularWallSegment,
  seg3: IrregularWallSegment
): SolvedPolygonResult {
  const a = seg1.lengthMeters!;
  const b = seg2.lengthMeters!;
  const c = seg3.lengthMeters!;
  const perimeter = round2(a + b + c);

  // Validação da desigualdade triangular
  const eps = 1e-4;
  if (a + b <= c + eps || a + c <= b + eps || b + c <= a + eps) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: perimeter,
      enteredWallsSumMeters: perimeter,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: [
        { x: 0, y: 0 },
        { x: a, y: 0 },
      ],
      edges: [
        { index: 1, id: seg1.id, start: { x: 0, y: 0 }, end: { x: a, y: 0 }, lengthMeters: a },
      ],
      diagonals: [],
      missingReasons: [
        'As medidas informadas não formam um triângulo válido: cada lado deve ser menor que a soma dos outros dois.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  // V1=(0,0), V2=(a,0), V3 calculado por distâncias c (de V1) e b (de V2)
  const cosAngleAtV1 = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
  const sinAngleAtV1 = Math.sqrt(Math.max(0, 1 - cosAngleAtV1 * cosAngleAtV1));

  const v1: SolvedPoint = { x: 0, y: 0 };
  const v2: SolvedPoint = { x: a, y: 0 };
  const v3: SolvedPoint = {
    x: c * cosAngleAtV1,
    y: c * sinAngleAtV1,
  };

  const vertices = [v1, v2, v3];
  const edges: SolvedWallEdge[] = [
    { index: 1, id: seg1.id, start: v1, end: v2, lengthMeters: a },
    { index: 2, id: seg2.id, start: v2, end: v3, lengthMeters: b },
    { index: 3, id: seg3.id, start: v3, end: v1, lengthMeters: c },
  ];

  const areaSqm = computeShoelaceArea(vertices);

  return {
    isComplete: areaSqm > 0,
    statusLabel: areaSqm > 0 ? 'Medidas completas' : 'Medidas pendentes',
    areaSqm: areaSqm > 0 ? areaSqm : null,
    perimeterMeters: perimeter,
    enteredWallsSumMeters: perimeter,
    isClosed: true,
    closureGapMeters: 0,
    hasSelfIntersection: false,
    vertices,
    edges,
    diagonals: [],
    missingReasons: areaSqm > 0 ? [] : ['Área resultante nula; confira os comprimentos.'],
    needsGeometryDisambiguation: false,
  };
}

export function solveFloorplanTraceGeometry(
  trace?: FloorplanTraceGeometryData | null
): SolvedPolygonResult {
  if (!trace || !Array.isArray(trace.points) || trace.points.length === 0) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: [],
      edges: [],
      diagonals: [],
      missingReasons: [
        'Clique nos cantos do ambiente diretamente sobre a planta para traçar o contorno.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const { points, isClosed } = trace;
  const imgW = trace.imageWidth > 0 ? trace.imageWidth : 1000;
  const imgH = trace.imageHeight > 0 ? trace.imageHeight : 1000;

  if (points.length < 3 || !isClosed) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: [],
      edges: [],
      diagonals: [],
      missingReasons: [
        points.length < 3
          ? `Marque pelo menos 3 cantos na planta (atual: ${points.length}).`
          : 'Finalize e feche o contorno clicando no ponto inicial (V1) ou em "Finalizar Contorno".',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const pixelVerts = points.map((pt) => ({
    x: pt.x * imgW,
    y: pt.y * imgH,
  }));

  const pixelEdgeLengths: number[] = [];
  for (let i = 0; i < pixelVerts.length; i++) {
    const a = pixelVerts[i];
    const b = pixelVerts[(i + 1) % pixelVerts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    pixelEdgeLengths.push(len);
    if (len < 2) {
      return {
        isComplete: false,
        statusLabel: 'Medidas pendentes',
        areaSqm: null,
        perimeterMeters: 0,
        enteredWallsSumMeters: 0,
        isClosed: true,
        closureGapMeters: 0,
        hasSelfIntersection: false,
        vertices: pixelVerts,
        edges: [],
        diagonals: [],
        missingReasons: [
          `O trecho ${i + 1} (V${i + 1}–V${i + 1 === pixelVerts.length ? 1 : i + 2}) possui pontos praticamente sobrepostos. Afaste ou remova o ponto duplicado.`,
        ],
        needsGeometryDisambiguation: false,
      };
    }
  }

  const pixelEdges: SolvedWallEdge[] = pixelVerts.map((v, i) => {
    const next = pixelVerts[(i + 1) % pixelVerts.length];
    return {
      index: i + 1,
      id: `trace_edge_${i + 1}`,
      start: v,
      end: next,
      lengthMeters: pixelEdgeLengths[i],
    };
  });

  const hasSelfIntersection = detectPolygonSelfIntersection(pixelEdges, true);
  if (hasSelfIntersection) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: true,
      closureGapMeters: 0,
      hasSelfIntersection: true,
      vertices: pixelVerts,
      edges: pixelEdges.map((e) => ({ ...e, lengthMeters: 0 })),
      diagonals: [],
      missingReasons: [
        'As linhas do contorno se cruzam na planta. Mova os pontos ou refaça o contorno sem cruzamentos.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const refIdx =
    trace.referenceEdgeIndex >= 0 && trace.referenceEdgeIndex < pixelEdgeLengths.length
      ? trace.referenceEdgeIndex
      : 0;
  const refPxLength = pixelEdgeLengths[refIdx];
  const refRealLength = trace.referenceLengthMeters;

  if (
    typeof refRealLength !== 'number' ||
    !Number.isFinite(refRealLength) ||
    refRealLength <= 0
  ) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: true,
      closureGapMeters: 0,
      hasSelfIntersection: false,
      vertices: [],
      edges: [],
      diagonals: [],
      missingReasons: [
        `Selecione uma parede de referência (ex.: Parede ${refIdx + 1}) e informe sua medida real em metros para calibrar a escala.`,
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const metersPerPixel = refRealLength / refPxLength;
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: true,
      closureGapMeters: 0,
      hasSelfIntersection: false,
      vertices: [],
      edges: [],
      diagonals: [],
      missingReasons: [
        'Não foi possível calibrar a escala com a parede selecionada. Escolha outra parede ou informe as medidas manualmente.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const origin = pixelVerts[0];
  const meterVertices: SolvedPoint[] = pixelVerts.map((v) => ({
    x: (v.x - origin.x) * metersPerPixel,
    y: (v.y - origin.y) * metersPerPixel,
  }));

  const meterEdges: SolvedWallEdge[] = meterVertices.map((start, i) => {
    const end = meterVertices[(i + 1) % meterVertices.length];
    const len = i === refIdx ? round2(refRealLength) : round2(pixelEdgeLengths[i] * metersPerPixel);
    return {
      index: i + 1,
      id: `trace_edge_${i + 1}`,
      start,
      end,
      lengthMeters: len,
    };
  });

  if (meterEdges.some((e) => e.lengthMeters <= 0)) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: true,
      closureGapMeters: 0,
      hasSelfIntersection: false,
      vertices: meterVertices,
      edges: meterEdges,
      diagonals: [],
      missingReasons: [
        'A escala informada gerou trecho com medida nula. Confira a medida de referência ou ajuste os pontos.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const perimeterMeters = round2(meterEdges.reduce((acc, e) => acc + e.lengthMeters, 0));
  const areaSqm = computeShoelaceArea(meterVertices);

  if (areaSqm <= 0 || !Number.isFinite(areaSqm)) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters,
      enteredWallsSumMeters: perimeterMeters,
      isClosed: true,
      closureGapMeters: 0,
      hasSelfIntersection: false,
      vertices: meterVertices,
      edges: meterEdges,
      diagonals: [],
      missingReasons: [
        'Os pontos marcados formam uma área nula (colineares). Ajuste os cantos na planta ou use a edição manual.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  return {
    isComplete: true,
    statusLabel: 'Medidas completas',
    areaSqm,
    perimeterMeters,
    enteredWallsSumMeters: perimeterMeters,
    isClosed: true,
    closureGapMeters: 0,
    hasSelfIntersection: false,
    vertices: meterVertices,
    edges: meterEdges,
    diagonals: [],
    missingReasons: [],
    needsGeometryDisambiguation: false,
  };
}

export function convertFloorplanTraceToManualSegments(
  trace: FloorplanTraceGeometryData
): IrregularWallSegment[] {
  const solved = solveFloorplanTraceGeometry(trace);
  if (!solved.isComplete || solved.edges.length < 3) return [];

  return solved.edges.map((edge, idx) => {
    if (idx === 0) {
      return {
        id: `seg_trace_${Date.now()}_${idx}`,
        lengthMeters: edge.lengthMeters,
        turn: 'pending',
        angleDegrees: null,
      };
    }

    const prev = solved.edges[idx - 1];
    const prevAngle = Math.atan2(prev.end.y - prev.start.y, prev.end.x - prev.start.x);
    const curAngle = Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x);
    let deltaDeg = ((curAngle - prevAngle) * 180) / Math.PI;
    while (deltaDeg > 180) deltaDeg -= 360;
    while (deltaDeg <= -180) deltaDeg += 360;

    let turn: IrregularTurnDirection = 'right_90';
    let angleDegrees: number | null = null;

    if (Math.abs(deltaDeg - 90) <= 2) {
      turn = 'right_90';
    } else if (Math.abs(deltaDeg + 90) <= 2) {
      turn = 'left_90';
    } else if (deltaDeg > 0 && deltaDeg < 180) {
      turn = 'right_angle';
      angleDegrees = round2(Math.max(1, Math.min(179, deltaDeg)));
    } else if (deltaDeg < 0 && deltaDeg > -180) {
      turn = 'left_angle';
      angleDegrees = round2(Math.max(1, Math.min(179, Math.abs(deltaDeg))));
    } else {
      turn = 'right_angle';
      angleDegrees = 1;
    }

    return {
      id: `seg_trace_${Date.now()}_${idx}`,
      lengthMeters: edge.lengthMeters,
      turn,
      angleDegrees,
    };
  });
}

/**
 * Resolve o contorno e área real de um ambiente irregular sem nunca inventar ângulos,
 * diagonais ou medidas ausentes.
 */
export function solveIrregularRoomGeometry(
  data: IrregularRoomGeometryData
): SolvedPolygonResult {
  if (data.method === 'floorplan_trace') {
    return solveFloorplanTraceGeometry(data.floorplanTrace);
  }

  const segments = Array.isArray(data.segments) ? data.segments : [];
  const enteredWallsSum = round2(
    segments.reduce(
      (acc, s) =>
        acc + (typeof s.lengthMeters === 'number' && s.lengthMeters > 0 ? s.lengthMeters : 0),
      0
    )
  );

  if (segments.length < 3) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: [],
      edges: [],
      diagonals: [],
      missingReasons: ['Adicione pelo menos 3 trechos de parede para formar um ambiente fechado.'],
      needsGeometryDisambiguation: false,
    };
  }

  const missingLengthIndices: number[] = [];
  segments.forEach((s, idx) => {
    if (typeof s.lengthMeters !== 'number' || !Number.isFinite(s.lengthMeters) || s.lengthMeters <= 0) {
      missingLengthIndices.push(idx + 1);
    }
  });

  if (missingLengthIndices.length > 0) {
    // Ainda desenha os trechos iniciais já preenchidos se estiver no modo ângulos
    const partialEdges: SolvedWallEdge[] = [];
    const partialVertices: SolvedPoint[] = [{ x: 0, y: 0 }];
    if (typeof segments[0]?.lengthMeters === 'number' && segments[0].lengthMeters > 0) {
      let curX = segments[0].lengthMeters;
      let curY = 0;
      let heading = 0;
      partialVertices.push({ x: curX, y: curY });
      partialEdges.push({
        index: 1,
        id: segments[0].id,
        start: { x: 0, y: 0 },
        end: { x: curX, y: curY },
        lengthMeters: segments[0].lengthMeters,
      });

      if (data.method === 'angles') {
        for (let i = 1; i < segments.length; i++) {
          const seg = segments[i];
          if (typeof seg.lengthMeters !== 'number' || seg.lengthMeters <= 0) break;
          const deltaRad = getTurnDeltaRadians(seg);
          if (deltaRad === null) break;
          heading += deltaRad;
          const start = { x: curX, y: curY };
          curX += seg.lengthMeters * Math.cos(heading);
          curY += seg.lengthMeters * Math.sin(heading);
          const end = { x: curX, y: curY };
          partialVertices.push(end);
          partialEdges.push({
            index: i + 1,
            id: seg.id,
            start,
            end,
            lengthMeters: seg.lengthMeters,
          });
        }
      }
    }

    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: partialVertices,
      edges: partialEdges,
      diagonals: [],
      missingReasons: [
        `Informe o comprimento (em metros) ${
          missingLengthIndices.length === 1 ? 'do trecho' : 'dos trechos'
        } ${missingLengthIndices.join(', ')}.`,
      ],
      needsGeometryDisambiguation: false,
    };
  }

  // Todos os N trechos têm comprimentos válidos (> 0)
  // Caso especial: 3 trechos sem ângulos definidos -> triângulo determinado por LLL (SSS)
  if (
    segments.length === 3 &&
    data.method === 'angles' &&
    segments.slice(1).every((s) => s.turn === 'pending')
  ) {
    return solveSssTriangle(segments[0], segments[1], segments[2]);
  }

  if (data.method === 'diagonals' && segments.length >= 4) {
    return solveByDiagonals(segments, data.diagonals || [], enteredWallsSum);
  }

  // Modo Ângulos / Curvas (N >= 3)
  return solveByTurnsAndAngles(segments, enteredWallsSum);
}

function getTurnDeltaRadians(seg: IrregularWallSegment): number | null {
  switch (seg.turn) {
    case 'right_90':
      return Math.PI / 2;
    case 'left_90':
      return -Math.PI / 2;
    case 'right_angle': {
      const deg = seg.angleDegrees;
      if (typeof deg !== 'number' || !Number.isFinite(deg) || deg <= 0 || deg >= 180) return null;
      return (deg * Math.PI) / 180;
    }
    case 'left_angle': {
      const deg = seg.angleDegrees;
      if (typeof deg !== 'number' || !Number.isFinite(deg) || deg <= 0 || deg >= 180) return null;
      return -(deg * Math.PI) / 180;
    }
    case 'pending':
    default:
      return null;
  }
}

function solveByTurnsAndAngles(
  segments: IrregularWallSegment[],
  enteredWallsSum: number
): SolvedPolygonResult {
  const missingTurnIndices: number[] = [];
  const vertices: SolvedPoint[] = [{ x: 0, y: 0 }];
  const edges: SolvedWallEdge[] = [];

  // Trecho 1 é a linha de base horizontal (ângulo 0)
  let curX = segments[0].lengthMeters!;
  let curY = 0;
  let heading = 0;
  vertices.push({ x: curX, y: curY });
  edges.push({
    index: 1,
    id: segments[0].id,
    start: { x: 0, y: 0 },
    end: { x: curX, y: curY },
    lengthMeters: segments[0].lengthMeters!,
  });

  let blockedByPendingTurn = false;
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const deltaRad = getTurnDeltaRadians(seg);
    if (deltaRad === null) {
      missingTurnIndices.push(i + 1);
      blockedByPendingTurn = true;
      continue;
    }

    if (!blockedByPendingTurn) {
      heading += deltaRad;
      const start = { x: curX, y: curY };
      curX += seg.lengthMeters! * Math.cos(heading);
      curY += seg.lengthMeters! * Math.sin(heading);
      const end = { x: curX, y: curY };
      vertices.push(end);
      edges.push({
        index: i + 1,
        id: seg.id,
        start,
        end,
        lengthMeters: seg.lengthMeters!,
      });
    }
  }

  if (missingTurnIndices.length > 0) {
    const allTurnsPending = missingTurnIndices.length === segments.length - 1;
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices,
      edges,
      diagonals: [],
      missingReasons: [
        allTurnsPending
          ? `Apenas os comprimentos das paredes não definem o formato de ${segments.length} lados. Informe a direção/ângulo nos trechos ${missingTurnIndices.join(', ')} ou utilize Diagonais de Referência.`
          : `Informe a curva ou ângulo ${
              missingTurnIndices.length === 1 ? 'do trecho' : 'dos trechos'
            } ${missingTurnIndices.join(', ')} para completar o contorno.`,
      ],
      needsGeometryDisambiguation: segments.length >= 4 && allTurnsPending,
    };
  }

  // Todos os trechos e curvas foram informados; valida fechamento no ponto inicial (0,0)
  const endPoint = vertices[vertices.length - 1];
  const rawGap = Math.hypot(endPoint.x, endPoint.y);
  const gapMeters = round2(rawGap);
  const closureTolerance = Math.min(0.08, Math.max(0.05, enteredWallsSum * 0.005));
  const isClosed = rawGap <= closureTolerance;

  // Para polígono fechado, o último ponto coincide (ou fecha com tolerância mínima) com V1=(0,0)
  const closedVertices = isClosed ? vertices.slice(0, -1) : vertices;
  const normalizedEdges = isClosed
    ? edges.map((e, idx) =>
        idx === edges.length - 1 ? { ...e, end: { x: 0, y: 0 } } : e
      )
    : edges;

  const hasSelfIntersection = detectPolygonSelfIntersection(normalizedEdges, isClosed);

  if (!isClosed) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: false,
      closureGapMeters: gapMeters,
      hasSelfIntersection,
      vertices: closedVertices,
      edges: normalizedEdges,
      diagonals: [],
      missingReasons: [
        `O contorno não fecha no ponto inicial (diferença de ${gapMeters
          .toFixed(2)
          .replace('.', ',')} m). Ajuste o comprimento ou o ângulo das paredes.`,
      ],
      needsGeometryDisambiguation: false,
    };
  }

  if (hasSelfIntersection) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: true,
      closureGapMeters: gapMeters,
      hasSelfIntersection: true,
      vertices: closedVertices,
      edges: normalizedEdges,
      diagonals: [],
      missingReasons: [
        'As paredes informadas se cruzam no contorno. Revise a sequência dos trechos ou a direção das curvas.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const areaSqm = computeShoelaceArea(closedVertices);
  if (areaSqm <= 0) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: true,
      closureGapMeters: gapMeters,
      hasSelfIntersection: false,
      vertices: closedVertices,
      edges: normalizedEdges,
      diagonals: [],
      missingReasons: ['O contorno resultou em área nula; verifique os ângulos e medidas.'],
      needsGeometryDisambiguation: false,
    };
  }

  return {
    isComplete: true,
    statusLabel: 'Medidas completas',
    areaSqm,
    perimeterMeters: enteredWallsSum,
    enteredWallsSumMeters: enteredWallsSum,
    isClosed: true,
    closureGapMeters: gapMeters,
    hasSelfIntersection: false,
    vertices: closedVertices,
    edges: normalizedEdges,
    diagonals: [],
    missingReasons: [],
    needsGeometryDisambiguation: false,
  };
}

function solveByDiagonals(
  segments: IrregularWallSegment[],
  rawDiagonals: IrregularDiagonalSpec[],
  enteredWallsSum: number
): SolvedPolygonResult {
  const n = segments.length;
  const diagonals = syncDiagonalsForSegmentCount(n, rawDiagonals);

  const missingDiagLabels: string[] = [];
  for (const d of diagonals) {
    if (typeof d.lengthMeters !== 'number' || !Number.isFinite(d.lengthMeters) || d.lengthMeters <= 0) {
      missingDiagLabels.push(`V${d.fromVertex}–V${d.toVertex}`);
    }
  }

  const v1: SolvedPoint = { x: 0, y: 0 };
  const v2: SolvedPoint = { x: segments[0].lengthMeters!, y: 0 };

  if (missingDiagLabels.length > 0) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: [v1, v2],
      edges: [
        {
          index: 1,
          id: segments[0].id,
          start: v1,
          end: v2,
          lengthMeters: segments[0].lengthMeters!,
        },
      ],
      diagonals: [],
      missingReasons: [
        `Informe ${
          missingDiagLabels.length === 1 ? 'a diagonal de referência' : 'as diagonais de referência'
        } (${missingDiagLabels.join(', ')}) para determinar a geometria real do polígono.`,
      ],
      needsGeometryDisambiguation: true,
    };
  }

  const vertices: SolvedPoint[] = [v1, v2];
  const edges: SolvedWallEdge[] = [
    {
      index: 1,
      id: segments[0].id,
      start: v1,
      end: v2,
      lengthMeters: segments[0].lengthMeters!,
    },
  ];
  const solvedDiagonals: SolvedDiagonalLine[] = [];

  let prevPolarAngle = 0; // ângulo do raio V1 -> V_k
  let prevRayLen = segments[0].lengthMeters!;
  const eps = 1e-4;

  // Constrói triângulos (V1, V_k, V_{k+1}) para k = 2 .. N-1
  for (let k = 2; k <= n - 1; k++) {
    const sideLen = segments[k - 1].lengthMeters!; // aresta V_k -> V_{k+1}
    const isLastTriangle = k === n - 1;
    const diagSpec = !isLastTriangle ? diagonals[k - 2] : undefined;
    const nextRayLen = isLastTriangle
      ? segments[n - 1].lengthMeters!
      : diagSpec!.lengthMeters!;

    if (
      prevRayLen + sideLen <= nextRayLen + eps ||
      prevRayLen + nextRayLen <= sideLen + eps ||
      sideLen + nextRayLen <= prevRayLen + eps
    ) {
      const refLabel = isLastTriangle
        ? `último trecho (${nextRayLen.toFixed(2).replace('.', ',')} m)`
        : `diagonal V1–V${k + 1} (${nextRayLen.toFixed(2).replace('.', ',')} m)`;
      return {
        isComplete: false,
        statusLabel: 'Medidas pendentes',
        areaSqm: null,
        perimeterMeters: enteredWallsSum,
        enteredWallsSumMeters: enteredWallsSum,
        isClosed: false,
        closureGapMeters: null,
        hasSelfIntersection: false,
        vertices,
        edges,
        diagonals: solvedDiagonals,
        missingReasons: [
          `Medidas incompatíveis no triângulo V1–V${k}–V${k + 1} envolvendo ${refLabel}: cada lado deve ser menor que a soma dos outros dois.`,
        ],
        needsGeometryDisambiguation: false,
      };
    }

    const cosPhi = Math.max(
      -1,
      Math.min(
        1,
        (prevRayLen * prevRayLen + nextRayLen * nextRayLen - sideLen * sideLen) /
          (2 * prevRayLen * nextRayLen)
      )
    );
    const phi = Math.acos(cosPhi);
    const sign = diagSpec?.reflex ? -1 : 1;
    const nextPolarAngle = prevPolarAngle + sign * phi;

    const nextVertex: SolvedPoint = {
      x: nextRayLen * Math.cos(nextPolarAngle),
      y: nextRayLen * Math.sin(nextPolarAngle),
    };

    const prevVertex = vertices[vertices.length - 1];
    vertices.push(nextVertex);
    edges.push({
      index: k,
      id: segments[k - 1].id,
      start: prevVertex,
      end: nextVertex,
      lengthMeters: sideLen,
    });

    if (!isLastTriangle && diagSpec) {
      solvedDiagonals.push({
        fromVertex: 1,
        toVertex: k + 1,
        start: v1,
        end: nextVertex,
        lengthMeters: nextRayLen,
      });
    }

    prevPolarAngle = nextPolarAngle;
    prevRayLen = nextRayLen;
  }

  // Fecha aresta N: V_N -> V1
  edges.push({
    index: n,
    id: segments[n - 1].id,
    start: vertices[vertices.length - 1],
    end: v1,
    lengthMeters: segments[n - 1].lengthMeters!,
  });

  const hasSelfIntersection = detectPolygonSelfIntersection(edges, true);
  if (hasSelfIntersection) {
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: enteredWallsSum,
      enteredWallsSumMeters: enteredWallsSum,
      isClosed: true,
      closureGapMeters: 0,
      hasSelfIntersection: true,
      vertices,
      edges,
      diagonals: solvedDiagonals,
      missingReasons: [
        'As diagonais e paredes informadas geraram cruzamento de lados. Revise os valores ou a direção do vértice.',
      ],
      needsGeometryDisambiguation: false,
    };
  }

  const areaSqm = computeShoelaceArea(vertices);

  return {
    isComplete: areaSqm > 0,
    statusLabel: areaSqm > 0 ? 'Medidas completas' : 'Medidas pendentes',
    areaSqm: areaSqm > 0 ? areaSqm : null,
    perimeterMeters: enteredWallsSum,
    enteredWallsSumMeters: enteredWallsSum,
    isClosed: true,
    closureGapMeters: 0,
    hasSelfIntersection: false,
    vertices,
    edges,
    diagonals: solvedDiagonals,
    missingReasons: areaSqm > 0 ? [] : ['Área resultante nula; verifique as medidas.'],
    needsGeometryDisambiguation: false,
  };
}

export function buildRectangularPolygonPreview(
  widthMeters: number | null,
  lengthMeters: number | null
): SolvedPolygonResult {
  const w = typeof widthMeters === 'number' && widthMeters > 0 ? widthMeters : null;
  const l = typeof lengthMeters === 'number' && lengthMeters > 0 ? lengthMeters : null;

  if (w === null || l === null) {
    const missing: string[] = [];
    if (w === null) missing.push('Informe a largura do ambiente.');
    if (l === null) missing.push('Informe o comprimento do ambiente.');
    return {
      isComplete: false,
      statusLabel: 'Medidas pendentes',
      areaSqm: null,
      perimeterMeters: 0,
      enteredWallsSumMeters: 0,
      isClosed: false,
      closureGapMeters: null,
      hasSelfIntersection: false,
      vertices: [],
      edges: [],
      diagonals: [],
      missingReasons: missing,
      needsGeometryDisambiguation: false,
    };
  }

  const v1 = { x: 0, y: 0 };
  const v2 = { x: w, y: 0 };
  const v3 = { x: w, y: l };
  const v4 = { x: 0, y: l };

  return {
    isComplete: true,
    statusLabel: 'Medidas completas',
    areaSqm: round2(w * l),
    perimeterMeters: round2(2 * (w + l)),
    enteredWallsSumMeters: round2(2 * (w + l)),
    isClosed: true,
    closureGapMeters: 0,
    hasSelfIntersection: false,
    vertices: [v1, v2, v3, v4],
    edges: [
      { index: 1, id: 'rect_1', start: v1, end: v2, lengthMeters: w },
      { index: 2, id: 'rect_2', start: v2, end: v3, lengthMeters: l },
      { index: 3, id: 'rect_3', start: v3, end: v4, lengthMeters: w },
      { index: 4, id: 'rect_4', start: v4, end: v1, lengthMeters: l },
    ],
    diagonals: [],
    missingReasons: [],
    needsGeometryDisambiguation: false,
  };
}
