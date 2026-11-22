import React from 'react';
import { Compass } from 'lucide-react';
import { useFenixTheme } from '../../utils/themeService';
import { formatPtBrNumber } from '../../utils/floorplanCalculator';
import { SolvedPolygonResult } from '../../utils/irregularRoomGeometry';

interface IrregularRoomPreviewSvgProps {
  solved: SolvedPolygonResult;
  showVertexLabels?: boolean;
  emptyHint?: string;
}

const VIEWBOX_SIZE = 380;
const INNER_PADDING = 54;

export const IrregularRoomPreviewSvg: React.FC<IrregularRoomPreviewSvgProps> = ({
  solved,
  showVertexLabels = false,
  emptyHint = 'Preencha os trechos das paredes para visualizar o contorno do ambiente em escala real.',
}) => {
  const { theme } = useFenixTheme('crm');
  const crm = theme.crm;

  const { vertices, edges, diagonals, isClosed, closureGapMeters, hasSelfIntersection } = solved;

  if (edges.length === 0) {
    return (
      <div
        className="w-full h-64 sm:h-72 rounded-2xl border border-dashed flex flex-col items-center justify-center p-6 text-center gap-2.5"
        style={{
          backgroundColor: crm.panelSubtleBg,
          borderColor: crm.cardTintBorder,
        }}
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: crm.indicatorBg,
            color: crm.indicatorText,
          }}
        >
          <Compass className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-600 max-w-xs leading-relaxed">
          {emptyHint}
        </p>
      </div>
    );
  }

  // Calcula bounding box uniforme preservando exatamente 1:1 de proporção (sem deformações)
  const allPts = [
    ...vertices,
    ...edges.flatMap((e) => [e.start, e.end]),
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of allPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const spanX = Math.max(0.5, maxX - minX);
  const spanY = Math.max(0.5, maxY - minY);
  const drawable = VIEWBOX_SIZE - INNER_PADDING * 2;
  const scale = drawable / Math.max(spanX, spanY);

  const offsetX = (VIEWBOX_SIZE - spanX * scale) / 2 - minX * scale;
  const offsetY = (VIEWBOX_SIZE - spanY * scale) / 2 - minY * scale;

  const toSvg = (p: { x: number; y: number }) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  });

  const svgVertices = vertices.map(toSvg);

  // Centro geométrico para orientar rótulos para o lado externo das paredes
  const centroid =
    svgVertices.length > 0
      ? {
          x: svgVertices.reduce((acc, v) => acc + v.x, 0) / svgVertices.length,
          y: svgVertices.reduce((acc, v) => acc + v.y, 0) / svgVertices.length,
        }
      : { x: VIEWBOX_SIZE / 2, y: VIEWBOX_SIZE / 2 };

  const polygonPointsAttr =
    isClosed && !hasSelfIntersection && svgVertices.length >= 3
      ? svgVertices.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : '';

  const lastEdgeEnd = edges.length > 0 ? toSvg(edges[edges.length - 1].end) : null;
  const firstVertexSvg = svgVertices[0] || null;
  const showOpenGapLine =
    !isClosed &&
    edges.length >= 2 &&
    lastEdgeEnd &&
    firstVertexSvg &&
    Math.hypot(lastEdgeEnd.x - firstVertexSvg.x, lastEdgeEnd.y - firstVertexSvg.y) > 4;

  return (
    <div
      className="w-full h-64 sm:h-72 rounded-2xl border overflow-hidden relative flex items-center justify-center"
      style={{
        backgroundColor: crm.panelSubtleBg,
        borderColor: crm.cardBorder,
        backgroundImage: 'radial-gradient(rgba(148,163,184,0.22) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full select-none"
        role="img"
        aria-label="Pré-visualização proporcional do formato do ambiente"
      >
        {/* Preenchimento interno quando polígono fechado e válido */}
        {polygonPointsAttr && (
          <polygon
            points={polygonPointsAttr}
            fill={crm.primary}
            fillOpacity={0.12}
            stroke="none"
          />
        )}

        {/* Área central informativa se completo */}
        {solved.isComplete && solved.areaSqm !== null && (
          <g pointerEvents="none">
            <text
              x={centroid.x}
              y={centroid.y - 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fontWeight="800"
              fill={crm.primary}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatPtBrNumber(solved.areaSqm)} m²
            </text>
            <text
              x={centroid.x}
              y={centroid.y + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="600"
              fill="#64748b"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatPtBrNumber(solved.perimeterMeters)} ml
            </text>
          </g>
        )}

        {/* Diagonais de referência (tracejadas) */}
        {diagonals.map((diag, i) => {
          const p1 = toSvg(diag.start);
          const p2 = toSvg(diag.end);
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <g key={`diag-${i}`}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#64748b"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <rect
                x={mx - 26}
                y={my - 9}
                width={52}
                height={18}
                rx={5}
                fill="#ffffff"
                fillOpacity={0.92}
                stroke="#cbd5e1"
                strokeWidth={1}
              />
              <text
                x={mx}
                y={my + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9.5"
                fontWeight="700"
                fill="#475569"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                D{i + 1}: {formatPtBrNumber(diag.lengthMeters)}m
              </text>
            </g>
          );
        })}

        {/* Linha tracejada indicando abertura quando contorno não fechou */}
        {showOpenGapLine && lastEdgeEnd && firstVertexSvg && (
          <g>
            <line
              x1={lastEdgeEnd.x}
              y1={lastEdgeEnd.y}
              x2={firstVertexSvg.x}
              y2={firstVertexSvg.y}
              stroke="#d97706"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            {closureGapMeters !== null && closureGapMeters > 0 && (
              <g>
                <rect
                  x={(lastEdgeEnd.x + firstVertexSvg.x) / 2 - 34}
                  y={(lastEdgeEnd.y + firstVertexSvg.y) / 2 - 9}
                  width={68}
                  height={18}
                  rx={5}
                  fill="#fef3c7"
                  stroke="#f59e0b"
                  strokeWidth={1}
                />
                <text
                  x={(lastEdgeEnd.x + firstVertexSvg.x) / 2}
                  y={(lastEdgeEnd.y + firstVertexSvg.y) / 2 + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9.5"
                  fontWeight="700"
                  fill="#92400e"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  Gap {formatPtBrNumber(closureGapMeters)}m
                </text>
              </g>
            )}
          </g>
        )}

        {/* Segmentos de parede numerados e cotados */}
        {edges.map((edge) => {
          const a = toSvg(edge.start);
          const b = toSvg(edge.end);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.max(1, Math.hypot(dx, dy));

          // Normal unitária perpendicular à parede; escolhe direção oposta ao centróide
          let nx = -dy / len;
          let ny = dx / len;
          const toCenterX = centroid.x - mx;
          const toCenterY = centroid.y - my;
          if (nx * toCenterX + ny * toCenterY > 0) {
            nx = -nx;
            ny = -ny;
          }

          const labelX = Math.max(36, Math.min(VIEWBOX_SIZE - 36, mx + nx * 20));
          const labelY = Math.max(14, Math.min(VIEWBOX_SIZE - 14, my + ny * 20));
          const labelText = `#${edge.index} · ${formatPtBrNumber(edge.lengthMeters)}m`;
          const boxW = Math.max(58, labelText.length * 5.8 + 10);

          return (
            <g key={`${edge.id}-${edge.index}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={hasSelfIntersection ? '#dc2626' : crm.primary}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x={labelX - boxW / 2}
                y={labelY - 9}
                width={boxW}
                height={18}
                rx={5}
                fill={crm.cardBg}
                stroke={crm.cardBorder}
                strokeWidth={1}
              />
              <text
                x={labelX}
                y={labelY + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="700"
                fill={crm.highlightText}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {labelText}
              </text>
            </g>
          );
        })}

        {/* Vértices */}
        {svgVertices.map((pt, idx) => (
          <g key={`v-${idx}`}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={showVertexLabels ? 7.5 : 4.2}
              fill={idx === 0 ? crm.primary : crm.cardBg}
              stroke={crm.primary}
              strokeWidth={2}
            />
            {showVertexLabels && (
              <text
                x={pt.x}
                y={pt.y + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="8"
                fontWeight="800"
                fill={idx === 0 ? '#ffffff' : crm.primary}
              >
                V{idx + 1}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};
