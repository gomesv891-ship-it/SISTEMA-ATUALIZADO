import React from 'react';
import { DecorativeMotifId } from '../utils/themeService';

interface HeaderDecorationProps {
  motif: DecorativeMotifId;
  accentColor?: string;
}

/**
 * Decorações vetoriais discretas para o Cabeçalho Superior do CRM.
 * Nunca interferem em cliques, leitura ou no logotipo oficial.
 */
export const CrmHeaderDecoration: React.FC<HeaderDecorationProps> = ({
  motif,
  accentColor = '#d4af37',
}) => {
  if (!motif || motif === 'nenhum' || motif === 'padrao') return null;

  switch (motif) {
    case 'natal':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          {/* Cordão discreto de luzes natalinas no topo */}
          <svg className="w-full h-7 opacity-85" viewBox="0 0 1200 28" preserveAspectRatio="none" fill="none">
            <path
              d="M0 4 Q 150 18 300 4 T 600 4 T 900 4 T 1200 4"
              stroke="#d4af37"
              strokeWidth="1.2"
              strokeOpacity="0.55"
            />
            {[60, 150, 240, 360, 450, 540, 660, 750, 840, 960, 1050, 1140].map((cx, i) => {
              const colors = ['#f5d061', '#ef4444', '#22c55e', '#ffffff'];
              const cy = i % 3 === 1 ? 11 : 7;
              return (
                <g key={cx}>
                  <circle cx={cx} cy={cy} r="3.2" fill={colors[i % colors.length]} opacity="0.9" />
                  <circle cx={cx} cy={cy} r="6" fill={colors[i % colors.length]} opacity="0.2" />
                </g>
              );
            })}
          </svg>
          {/* Pinheiro e estrela sutis na lateral direita inferior */}
          <svg className="absolute right-6 bottom-2 w-24 h-12 opacity-25" viewBox="0 0 100 50" fill="none">
            <polygon points="80,6 70,22 90,22" fill="#22c55e" />
            <polygon points="80,15 66,34 94,34" fill="#16a34a" />
            <polygon points="80,25 63,46 97,46" fill="#15803d" />
            <path d="M40 10 L42 15 L47 15 L43 18 L44 23 L40 20 L36 23 L37 18 L33 15 L38 15 Z" fill="#f5d061" />
          </svg>
        </div>
      );

    case 'novembro_black':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, transparent, #d4af37, #f5d061, #d4af37, transparent)' }}
          />
          <svg className="absolute right-8 bottom-1 w-48 h-16 opacity-25" viewBox="0 0 200 60" fill="none">
            <polygon points="140,0 200,0 170,60 110,60" stroke="#d4af37" strokeWidth="1" fill="#d4af37" fillOpacity="0.08" />
            <polygon points="105,10 135,10 120,60 90,60" stroke="#f5d061" strokeWidth="0.8" fill="none" />
          </svg>
        </div>
      );

    case 'ano_novo':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <svg className="w-full h-full opacity-35" viewBox="0 0 1200 140" preserveAspectRatio="none" fill="none">
            {/* Fogos de artifício discretos */}
            {[
              { cx: 920, cy: 42, r: 22, c: '#f5d061' },
              { cx: 1080, cy: 62, r: 16, c: '#e2e8f0' },
              { cx: 760, cy: 28, r: 12, c: '#fde68a' },
            ].map((fw, idx) => (
              <g key={idx}>
                {Array.from({ length: 10 }).map((_, k) => {
                  const angle = (k * Math.PI * 2) / 10;
                  const x2 = fw.cx + Math.cos(angle) * fw.r;
                  const y2 = fw.cy + Math.sin(angle) * fw.r;
                  return (
                    <line
                      key={k}
                      x1={fw.cx}
                      y1={fw.cy}
                      x2={x2}
                      y2={y2}
                      stroke={fw.c}
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                  );
                })}
                <circle cx={fw.cx} cy={fw.cy} r="2" fill={fw.c} />
              </g>
            ))}
          </svg>
        </div>
      );

    case 'carnaval':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <svg className="w-full h-full opacity-45" viewBox="0 0 1200 140" preserveAspectRatio="none" fill="none">
            <path d="M720 0 C760 40, 820 10, 860 55" stroke="#facc15" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.6" />
            <path d="M900 10 C940 50, 990 15, 1040 60" stroke="#f472b6" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.6" />
            <circle cx="780" cy="24" r="3" fill="#facc15" />
            <circle cx="840" cy="40" r="2.5" fill="#ec4899" />
            <rect x="955" y="18" width="6" height="4" rx="1" fill="#a855f7" transform="rotate(20 955 18)" />
            <rect x="1060" y="34" width="6" height="4" rx="1" fill="#facc15" transform="rotate(-25 1060 34)" />
          </svg>
        </div>
      );

    case 'pascoa':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <svg className="w-full h-full opacity-35" viewBox="0 0 1200 140" preserveAspectRatio="none" fill="none">
            <ellipse cx="1040" cy="45" rx="10" ry="13" stroke="#f9a8d4" strokeWidth="1.4" />
            <path d="M1031 44 Q1040 48 1049 44" stroke="#fef08a" strokeWidth="1.2" />
            <ellipse cx="1075" cy="55" rx="8" ry="11" stroke="#bbf7d0" strokeWidth="1.3" />
            <circle cx="995" cy="30" r="2.5" fill="#fef08a" />
            <circle cx="1115" cy="36" r="2" fill="#e9d5ff" />
          </svg>
        </div>
      );

    case 'dia_das_maes':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <svg className="w-full h-full opacity-35" viewBox="0 0 1200 140" preserveAspectRatio="none" fill="none">
            <g transform="translate(1040, 42)">
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <ellipse
                  key={deg}
                  cx="0"
                  cy="-10"
                  rx="4.5"
                  ry="8"
                  fill="#fda4af"
                  transform={`rotate(${deg})`}
                />
              ))}
              <circle cx="0" cy="0" r="3.5" fill="#fde68a" />
            </g>
            <path d="M980 68 Q1010 52 1030 62" stroke="#d4af37" strokeWidth="1.2" />
          </svg>
        </div>
      );

    case 'dia_dos_pais':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, transparent, #cbd5e1, #94a3b8, transparent)' }}
          />
          <svg className="absolute right-8 bottom-2 w-36 h-12 opacity-20" viewBox="0 0 150 50" fill="none">
            <line x1="20" y1="45" x2="65" y2="5" stroke="#cbd5e1" strokeWidth="1" />
            <line x1="40" y1="45" x2="85" y2="5" stroke="#94a3b8" strokeWidth="1" />
            <line x1="60" y1="45" x2="105" y2="5" stroke="#cbd5e1" strokeWidth="1" />
          </svg>
        </div>
      );

    case 'halloween':
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <svg className="w-full h-full opacity-35" viewBox="0 0 1200 140" preserveAspectRatio="none" fill="none">
            <path d="M1070 25 A14 14 0 1 0 1084 44 A11 11 0 1 1 1070 25 Z" fill="#fdba74" />
            <path d="M990 42 Q996 36 1002 42 Q1008 36 1014 42 Q1006 46 1002 49 Q998 46 990 42 Z" fill="#e9d5ff" />
            <circle cx="1040" cy="24" r="1.8" fill="#fb923c" />
          </svg>
        </div>
      );

    default:
      return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
          />
        </div>
      );
  }
};

interface BudgetDecorationProps {
  motif: DecorativeMotifId;
  accentColor: string;
  secondaryColor?: string;
}

/**
 * Decorações sutis e profissionais para o Cabeçalho do Orçamento (EspelhoOrcamento).
 * Posicionadas nos cantos / faixa sem sobrepor logo, texto ou valores.
 */
export const BudgetHeaderMotif: React.FC<BudgetDecorationProps> = ({
  motif,
  accentColor,
  secondaryColor,
}) => {
  if (!motif || motif === 'nenhum' || motif === 'padrao') return null;

  switch (motif) {
    case 'natal':
      return (
        <div className="pointer-events-none select-none flex items-center gap-1.5 mr-2" aria-hidden="true">
          {/* Pinheiro estilizado + Presente + Estrela */}
          <svg className="w-11 h-8 flex-shrink-0" viewBox="0 0 48 36" fill="none">
            {/* Estrela dourada */}
            <path d="M14 2 L15.4 5.2 L18.8 5.4 L16.2 7.6 L17 11 L14 9.2 L11 11 L11.8 7.6 L9.2 5.4 L12.6 5.2 Z" fill="#d4af37" />
            {/* Pinheiro */}
            <polygon points="14,9 6,21 22,21" fill="#14532d" />
            <polygon points="14,15 4,29 24,29" fill="#166534" />
            <rect x="12.2" y="29" width="3.6" height="4" rx="0.5" fill="#7f1d1d" />
            <circle cx="12" cy="18" r="1.2" fill="#f5d061" />
            <circle cx="17" cy="24" r="1.2" fill="#dc2626" />
            {/* Caixa de presente */}
            <rect x="29" y="19" width="13" height="12" rx="1.5" fill="#991b1b" />
            <rect x="34.5" y="19" width="2" height="12" fill="#d4af37" />
            <rect x="29" y="23.5" width="13" height="2" fill="#d4af37" />
            <path d="M35.5 19 C33 15, 30 17, 34 19 M35.5 19 C38 15, 41 17, 37 19" stroke="#d4af37" strokeWidth="1.4" fill="none" />
          </svg>
        </div>
      );

    case 'novembro_black':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <div
            className="px-2.5 py-1 rounded border text-[9.5px] font-black tracking-widest uppercase whitespace-nowrap"
            style={{
              backgroundColor: '#09090b',
              borderColor: '#d4af37',
              color: '#f5d061',
            }}
          >
            NOVEMBRO BLACK
          </div>
        </div>
      );

    case 'ano_novo':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-10 h-8 flex-shrink-0" viewBox="0 0 44 36" fill="none">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="18"
                y1="16"
                x2={18 + Math.cos((deg * Math.PI) / 180) * 11}
                y2={16 + Math.sin((deg * Math.PI) / 180) * 11}
                stroke="#d4af37"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                strokeLinecap="round"
              />
            ))}
            <circle cx="18" cy="16" r="2.2" fill="#091e42" />
            <path d="M35 8 L36.3 11.2 L39.5 11.4 L37 13.5 L37.8 16.8 L35 15 L32.2 16.8 L33 13.5 L30.5 11.4 L33.7 11.2 Z" fill="#d4af37" />
          </svg>
        </div>
      );

    case 'carnaval':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-11 h-8 flex-shrink-0" viewBox="0 0 48 34" fill="none">
            {/* Máscara carnavalesca elegante */}
            <path
              d="M6 16 C10 10, 19 10, 24 14 C29 10, 38 10, 42 16 C40 23, 32 25, 27 21 C25 19, 23 19, 21 21 C16 25, 8 23, 6 16 Z"
              fill="#5b21b6"
              stroke="#eab308"
              strokeWidth="1.4"
            />
            <ellipse cx="16" cy="17" rx="3.2" ry="2" fill="#ffffff" />
            <ellipse cx="32" cy="17" rx="3.2" ry="2" fill="#ffffff" />
            <circle cx="9" cy="7" r="1.5" fill="#be185d" />
            <circle cx="38" cy="7" r="1.5" fill="#eab308" />
          </svg>
        </div>
      );

    case 'pascoa':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-10 h-8 flex-shrink-0" viewBox="0 0 42 34" fill="none">
            <ellipse cx="16" cy="19" rx="7.5" ry="10" fill="#f3e8ff" stroke="#9333ea" strokeWidth="1.4" />
            <path d="M9.5 19 Q16 22 22.5 19" stroke="#f472b6" strokeWidth="1.5" />
            <path d="M10.5 14 Q16 16.5 21.5 14" stroke="#86efac" strokeWidth="1.5" />
            <ellipse cx="30" cy="21" rx="6" ry="8" fill="#fef9c3" stroke="#ec4899" strokeWidth="1.3" />
          </svg>
        </div>
      );

    case 'dia_das_maes':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-10 h-8 flex-shrink-0" viewBox="0 0 42 34" fill="none">
            <g transform="translate(21, 16)">
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <ellipse
                  key={deg}
                  cx="0"
                  cy="-7"
                  rx="3.2"
                  ry="6"
                  fill="#fb7185"
                  fillOpacity="0.85"
                  transform={`rotate(${deg})`}
                />
              ))}
              <circle cx="0" cy="0" r="2.8" fill="#d4af37" />
            </g>
          </svg>
        </div>
      );

    case 'dia_dos_pais':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-9 h-8 flex-shrink-0" viewBox="0 0 38 34" fill="none">
            <polygon points="19,4 32,17 19,30 6,17" stroke="#334155" strokeWidth="1.5" fill="#e2e8f0" />
            <polygon points="19,9 27,17 19,25 11,17" fill="#0f294a" />
          </svg>
        </div>
      );

    case 'halloween':
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-10 h-8 flex-shrink-0" viewBox="0 0 42 34" fill="none">
            <path d="M16 7 A10 10 0 1 0 26 21 A7.5 7.5 0 1 1 16 7 Z" fill="#ea580c" />
            <path d="M24 14 Q28 10 31 14 Q34 10 38 14 Q33 17 31 19 Q29 17 24 14 Z" fill="#581c87" />
          </svg>
        </div>
      );

    default:
      return (
        <div className="pointer-events-none select-none flex items-center mr-2" aria-hidden="true">
          <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="10" stroke={accentColor} strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="16" cy="16" r="4" fill={secondaryColor || accentColor} />
          </svg>
        </div>
      );
  }
};

/**
 * Detalhe sutil no rodapé do orçamento (entre as colunas ou ao lado do traço caligráfico).
 */
export const BudgetFooterMotif: React.FC<BudgetDecorationProps> = ({
  motif,
  accentColor,
}) => {
  if (!motif || motif === 'nenhum' || motif === 'padrao') {
    return (
      <svg
        className="w-44 h-2.5 mt-1 opacity-85"
        style={{ color: accentColor }}
        viewBox="0 0 180 12"
        fill="none"
      >
        <path
          d="M4 8 C 50 2, 130 2, 176 7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <div className="flex flex-col items-center w-full mt-1">
      <div className="flex items-center gap-2 justify-center">
        <span className="w-10 h-[1.5px] rounded-full" style={{ backgroundColor: accentColor, opacity: 0.7 }} />
        {motif === 'natal' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 1 L9.4 5 L13.5 5.2 L10.2 7.8 L11.3 12 L8 9.6 L4.7 12 L5.8 7.8 L2.5 5.2 L6.6 5 Z" fill="#d4af37" />
          </svg>
        )}
        {motif === 'novembro_black' && (
          <span
            className="text-[8.5px] font-black tracking-[0.2em] uppercase"
            style={{ color: accentColor }}
          >
            NOVEMBRO BLACK
          </span>
        )}
        {motif === 'ano_novo' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 1 L9.5 6.5 L15 8 L9.5 9.5 L8 15 L6.5 9.5 L1 8 L6.5 6.5 Z" fill="#d4af37" />
          </svg>
        )}
        {motif === 'carnaval' && (
          <svg className="w-5 h-3" viewBox="0 0 24 12" fill="none">
            <circle cx="4" cy="6" r="2" fill="#be185d" />
            <circle cx="12" cy="4" r="2" fill="#eab308" />
            <circle cx="20" cy="7" r="2" fill="#5b21b6" />
          </svg>
        )}
        {motif === 'pascoa' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <ellipse cx="8" cy="8" rx="4.5" ry="6" stroke={accentColor} strokeWidth="1.4" />
          </svg>
        )}
        {motif === 'dia_das_maes' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 13 C8 13 2 9.2 2 5.4 C2 3.5 3.6 2 5.3 2 C6.5 2 7.4 2.7 8 3.6 C8.6 2.7 9.5 2 10.7 2 C12.4 2 14 3.5 14 5.4 C14 9.2 8 13 8 13 Z" fill={accentColor} />
          </svg>
        )}
        {motif === 'dia_dos_pais' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <polygon points="8,2 14,8 8,14 2,8" fill={accentColor} />
          </svg>
        )}
        {motif === 'halloween' && (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="9" r="5" fill="#ea580c" />
            <rect x="7.2" y="2.5" width="1.6" height="2.5" fill="#581c87" />
          </svg>
        )}
        <span className="w-10 h-[1.5px] rounded-full" style={{ backgroundColor: accentColor, opacity: 0.7 }} />
      </div>
    </div>
  );
};

/* ==========================================================================
   DECORAÇÕES OFICIAIS PARA VERSÕES "DECORADO" DO ESPELHO DO ORÇAMENTO
   Reproduz o padrão de sofisticação, profundidade 3D, faixas curvas metálicas
   e iluminação da referência visual oficial, preservando integralmente o
   layout, dimensões, espaçamentos, tabela, textos e logo oficial Fênix World.
   Regras técnicas:
   - Zero <filter> SVG / blur CSS (fidelidade total em PDF, PNG, JPG e Print).
   - IDs únicos via `uid` (React useId) para todos os gradientes.
   - Nunca renderiza no tema PREMIUM ('padrao').
   ========================================================================== */

export type DecoratedEspelhoThemeId =
  | 'natal'
  | 'novembro_black'
  | 'ano_novo'
  | 'carnaval'
  | 'pascoa'
  | 'dia_das_maes'
  | 'dia_dos_pais'
  | 'halloween';

const isDecoratedThemeId = (id: string): id is DecoratedEspelhoThemeId =>
  id === 'natal' ||
  id === 'novembro_black' ||
  id === 'ano_novo' ||
  id === 'carnaval' ||
  id === 'pascoa' ||
  id === 'dia_das_maes' ||
  id === 'dia_dos_pais' ||
  id === 'halloween';

interface RibbonPalette {
  ribbonMain: [string, string, string, string];
  ribbonHighlight: string;
  flareCore: string;
  flareMid: string;
  rimHighlight: string;
  footerBrush: [string, string, string];
}

const RIBBON_PALETTES: Record<DecoratedEspelhoThemeId, RibbonPalette> = {
  natal: {
    ribbonMain: ['#926c0c', '#f5d061', '#fef3c7', '#b8860b'],
    ribbonHighlight: '#fffbeb',
    flareCore: '#ffffff',
    flareMid: '#fde68a',
    rimHighlight: '#f5d061',
    footerBrush: ['#b8860b', '#f5d061', '#b8860b'],
  },
  novembro_black: {
    ribbonMain: ['#7a5908', '#d4af37', '#fef3c7', '#8a6610'],
    ribbonHighlight: '#fef9c3',
    flareCore: '#ffffff',
    flareMid: '#f5d061',
    rimHighlight: '#f5d061',
    footerBrush: ['#8a6610', '#f5d061', '#8a6610'],
  },
  ano_novo: {
    ribbonMain: ['#94a3b8', '#f5d061', '#fef9c3', '#cbd5e1'],
    ribbonHighlight: '#ffffff',
    flareCore: '#ffffff',
    flareMid: '#fde68a',
    rimHighlight: '#fde68a',
    footerBrush: ['#b89128', '#f5d061', '#b89128'],
  },
  carnaval: {
    ribbonMain: ['#be185d', '#facc15', '#fef08a', '#db2777'],
    ribbonHighlight: '#fef9c3',
    flareCore: '#ffffff',
    flareMid: '#fde047',
    rimHighlight: '#fde047',
    footerBrush: ['#be185d', '#eab308', '#6d28d9'],
  },
  pascoa: {
    ribbonMain: ['#c084fc', '#f9a8d4', '#fef9c3', '#a855f7'],
    ribbonHighlight: '#ffffff',
    flareCore: '#ffffff',
    flareMid: '#fbcfe8',
    rimHighlight: '#fef08a',
    footerBrush: ['#a855f7', '#f472b6', '#4ade80'],
  },
  dia_das_maes: {
    ribbonMain: ['#be185d', '#fda4af', '#fef3c7', '#d4af37'],
    ribbonHighlight: '#fff1f2',
    flareCore: '#ffffff',
    flareMid: '#fecdd3',
    rimHighlight: '#fde68a',
    footerBrush: ['#be185d', '#d4af37', '#be185d'],
  },
  dia_dos_pais: {
    ribbonMain: ['#475569', '#cbd5e1', '#f8fafc', '#64748b'],
    ribbonHighlight: '#ffffff',
    flareCore: '#ffffff',
    flareMid: '#cbd5e1',
    rimHighlight: '#e2e8f0',
    footerBrush: ['#334155', '#94a3b8', '#334155'],
  },
  halloween: {
    ribbonMain: ['#9a3412', '#fb923c', '#fed7aa', '#7e22ce'],
    ribbonHighlight: '#ffedd5',
    flareCore: '#ffffff',
    flareMid: '#fb923c',
    rimHighlight: '#fb923c',
    footerBrush: ['#7e22ce', '#ea580c', '#7e22ce'],
  },
};

const Star5: React.FC<{ cx: number; cy: number; r: number; fill: string; stroke?: string; opacity?: number }> = ({
  cx,
  cy,
  r,
  fill,
  stroke,
  opacity = 1,
}) => {
  const ir = r * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : ir;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + Math.cos(angle) * rad).toFixed(2)},${(cy + Math.sin(angle) * rad).toFixed(2)}`);
  }
  return (
    <polygon
      points={pts.join(' ')}
      fill={fill}
      fillOpacity={opacity}
      stroke={stroke}
      strokeWidth={stroke ? 0.7 : undefined}
    />
  );
};

const Sparkle4: React.FC<{ cx: number; cy: number; r: number; fill: string; opacity?: number }> = ({
  cx,
  cy,
  r,
  fill,
  opacity = 1,
}) => {
  const ir = r * 0.22;
  const d = `M ${cx} ${cy - r} Q ${cx + ir} ${cy - ir} ${cx + r} ${cy} Q ${cx + ir} ${cy + ir} ${cx} ${cy + r} Q ${cx - ir} ${cy + ir} ${cx - r} ${cy} Q ${cx - ir} ${cy - ir} ${cx} ${cy - r} Z`;
  return <path d={d} fill={fill} fillOpacity={opacity} />;
};

const GlowOrb: React.FC<{
  cx: number;
  cy: number;
  r: number;
  core: string;
  haloId: string;
}> = ({ cx, cy, r, core, haloId }) => (
  <g>
    <circle cx={cx} cy={cy} r={r * 3.1} fill={`url(#${haloId})`} />
    <circle cx={cx} cy={cy} r={r} fill={core} />
    <circle cx={cx} cy={cy} r={r * 0.48} fill="#ffffff" />
  </g>
);

const LayeredRose: React.FC<{
  cx: number;
  cy: number;
  scale?: number;
  outerColor: string;
  midColor: string;
  innerColor: string;
  centerColor: string;
  opacity?: number;
}> = ({
  cx,
  cy,
  scale = 1,
  outerColor,
  midColor,
  innerColor,
  centerColor,
  opacity = 0.98,
}) => (
  <g transform={`translate(${cx}, ${cy}) scale(${scale})`} opacity={opacity}>
    {[0, 60, 120, 180, 240, 300].map((deg) => (
      <ellipse
        key={`p1-${deg}`}
        cx="0"
        cy="-9"
        rx="5.4"
        ry="8.4"
        fill={outerColor}
        transform={`rotate(${deg})`}
      />
    ))}
    {[30, 90, 150, 210, 270, 330].map((deg) => (
      <ellipse
        key={`p2-${deg}`}
        cx="0"
        cy="-6.4"
        rx="4"
        ry="6.2"
        fill={midColor}
        transform={`rotate(${deg})`}
      />
    ))}
    {[0, 72, 144, 216, 288].map((deg) => (
      <ellipse
        key={`p3-${deg}`}
        cx="0"
        cy="-3.6"
        rx="2.6"
        ry="4.1"
        fill={innerColor}
        transform={`rotate(${deg})`}
      />
    ))}
    <circle cx="0" cy="0" r="2.8" fill={centerColor} />
    <circle cx="-0.8" cy="-0.8" r="0.9" fill="#ffffff" fillOpacity="0.75" />
  </g>
);

const PineSpray: React.FC<{ x: number; y: number; angle?: number; scale?: number }> = ({
  x,
  y,
  angle = 0,
  scale = 1,
}) => (
  <g transform={`translate(${x}, ${y}) rotate(${angle}) scale(${scale})`}>
    <path d="M 0 0 Q 22 4 46 2" stroke="#14532d" strokeWidth="2.2" strokeLinecap="round" />
    {[6, 12, 18, 24, 30, 36, 42].map((nx, idx) => (
      <g key={nx}>
        <line
          x1={nx}
          y1="2"
          x2={nx - 5}
          y2={-8 - (idx % 2) * 3}
          stroke={idx % 2 === 0 ? '#166534' : '#22c55e'}
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <line
          x1={nx}
          y1="2"
          x2={nx - 4}
          y2={10 + (idx % 2) * 3}
          stroke={idx % 2 === 0 ? '#15803d' : '#166534'}
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </g>
    ))}
  </g>
);

/**
 * Onda curva do Cabeçalho Natal Decorado reproduzindo fielmente a imagem de referência:
 * base creme à esquerda, fita dourada dupla com clarão âmbar no ponto de inflexão,
 * painel vermelho veludo com reflexo sutil e filete metálico dourado na base.
 */
export const NatalDecoradoHeaderWaveSvg: React.FC<{ uid: string }> = ({ uid }) => (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none block"
    preserveAspectRatio="none"
    viewBox="0 0 1040 120"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id={`nd-hdr-cream-${uid}`} x1="0" y1="0" x2="720" y2="115" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#fdf9f5" />
        <stop offset="100%" stopColor="#faf0e6" />
      </linearGradient>
      <linearGradient id={`nd-hdr-red-${uid}`} x1="360" y1="116" x2="1040" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c4080e" />
        <stop offset="35%" stopColor="#9c0206" />
        <stop offset="72%" stopColor="#7d0105" />
        <stop offset="100%" stopColor="#650103" />
      </linearGradient>
      <linearGradient id={`nd-hdr-gold1-${uid}`} x1="0" y1="112" x2="675" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#d99b26" />
        <stop offset="32%" stopColor="#f5d061" />
        <stop offset="58%" stopColor="#fef08a" />
        <stop offset="78%" stopColor="#f5c443" />
        <stop offset="100%" stopColor="#b87714" />
      </linearGradient>
      <linearGradient id={`nd-hdr-gold2-${uid}`} x1="0" y1="108" x2="695" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f5d061" stopOpacity="0.35" />
        <stop offset="45%" stopColor="#fde68a" stopOpacity="0.72" />
        <stop offset="100%" stopColor="#d4af37" stopOpacity="0.4" />
      </linearGradient>
      <radialGradient id={`nd-hdr-flare-${uid}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
        <stop offset="28%" stopColor="#fef08a" stopOpacity="0.88" />
        <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`nd-hdr-bar-${uid}`} x1="0" y1="116" x2="1040" y2="116" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c47e18" />
        <stop offset="25%" stopColor="#f5d061" />
        <stop offset="48%" stopColor="#fef08a" />
        <stop offset="72%" stopColor="#d4af37" />
        <stop offset="100%" stopColor="#925c0b" />
      </linearGradient>
    </defs>

    {/* Base Creme Clara */}
    <rect x="0" y="0" width="1040" height="120" fill={`url(#nd-hdr-cream-${uid})`} />

    {/* Onda Dourada Suave Intermediária */}
    <path
      d="M 0 105 C 210 113, 405 99, 535 48 C 596 24, 636 8, 678 0 L 1040 0 L 1040 120 L 0 120 Z"
      fill={`url(#nd-hdr-gold2-${uid})`}
    />

    {/* Painel Curvo Vermelho Veludo Principal */}
    <path
      d="M 190 117 C 395 110, 520 68, 646 0 L 1040 0 L 1040 117 L 190 117 Z"
      fill={`url(#nd-hdr-red-${uid})`}
    />

    {/* Reflexo Sutil de Seda Vermelha Superior */}
    <path
      d="M 545 0 C 632 34, 738 46, 895 14 L 1040 0 L 1040 34 C 915 56, 752 60, 628 24 C 588 12, 560 4, 545 0 Z"
      fill="#ef4444"
      fillOpacity="0.12"
    />

    {/* Fita Metálica Dourada Principal da Referência */}
    <path
      d="M 0 107 C 215 114, 405 101, 524 50 C 584 25, 624 8, 656 0 L 668 0 C 634 11, 592 31, 531 57 C 412 108, 215 119, 0 114 Z"
      fill={`url(#nd-hdr-gold1-${uid})`}
    />
    <path
      d="M 0 107 C 215 114, 405 101, 524 50 C 584 25, 624 8, 656 0"
      stroke="#fef9c3"
      strokeWidth="1.2"
      strokeOpacity="0.9"
    />

    {/* Clarão Luminoso Dourado-Âmbar na Curva */}
    <circle cx="448" cy="86" r="32" fill={`url(#nd-hdr-flare-${uid})`} />

    {/* Filete Metálico Dourado Inferior do Cabeçalho */}
    <rect x="0" y="115.5" width="1040" height="4.5" fill={`url(#nd-hdr-bar-${uid})`} />
  </svg>
);

/**
 * 1. Cabeçalho Curvo PREMIUM Decorado — Composição idêntica em sofisticação à referência oficial.
 * Faixa curva metálica luminosa + ponto de luz + vinheta temática no canto direito (x: 870..1040),
 * mantendo 100% livre a Logo Fênix World, Dados da Empresa e ORÇAMENTO + Data.
 */
export const EspelhoHeaderDecorations: React.FC<{ themeId: string; uid: string }> = ({
  themeId,
  uid,
}) => {
  if (!isDecoratedThemeId(themeId) || themeId === 'natal') return null;
  const rp = RIBBON_PALETTES[themeId];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-[2] block"
      preserveAspectRatio="none"
      viewBox="0 0 1040 120"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`hdr-rib-${uid}`} x1="0" y1="115" x2="720" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={rp.ribbonMain[0]} />
          <stop offset="32%" stopColor={rp.ribbonMain[1]} />
          <stop offset="56%" stopColor={rp.ribbonMain[2]} />
          <stop offset="82%" stopColor={rp.ribbonMain[1]} />
          <stop offset="100%" stopColor={rp.ribbonMain[3]} />
        </linearGradient>

        <radialGradient id={`hdr-flare-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={rp.flareCore} stopOpacity="0.95" />
          <stop offset="30%" stopColor={rp.flareMid} stopOpacity="0.65" />
          <stop offset="100%" stopColor={rp.flareMid} stopOpacity="0" />
        </radialGradient>

        <radialGradient id={`hdr-orb-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="40%" stopColor={rp.flareMid} stopOpacity="0.55" />
          <stop offset="100%" stopColor={rp.flareMid} stopOpacity="0" />
        </radialGradient>

        {/* Gradientes 3D temáticos reutilizáveis */}
        <linearGradient id={`gold3d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="38%" stopColor="#f5d061" />
          <stop offset="72%" stopColor="#b8860b" />
          <stop offset="100%" stopColor="#7a5908" />
        </linearGradient>
        <linearGradient id={`crimson3d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#6b0f14" />
        </linearGradient>
        <radialGradient id={`bauble3d-${uid}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="38%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#52090d" />
        </radialGradient>
        <linearGradient id={`silver3d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <radialGradient id={`pumpkin3d-${uid}`} cx="40%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="35%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
      </defs>

      {/* Fita Metálica Curva Assinatura da Referência Visual */}
      <path
        d="M 0 111 C 280 116, 470 76, 666 0 L 686 0 C 488 80, 294 120, 0 116 Z"
        fill={`url(#hdr-rib-${uid})`}
      />
      <path
        d="M 0 111 C 280 116, 470 76, 666 0"
        stroke={rp.ribbonHighlight}
        strokeWidth="1.2"
        strokeOpacity="0.85"
      />
      {/* Filete metálico inferior integrado à barra do cabeçalho */}
      <rect x="0" y="116" width="1040" height="4" fill={`url(#hdr-rib-${uid})`} opacity="0.9" />

      {/* Clarão luminoso elegante no ponto de inflexão da curva */}
      <circle cx="436" cy="91" r="24" fill={`url(#hdr-flare-${uid})`} />
      <Sparkle4 cx={436} cy={91} r={7.5} fill="#ffffff" opacity={0.95} />

      {/* ================================================================= */}
      {/* VINHETA TEMÁTICA EXCLUSIVA DE CADA TEMA (CANTO DIREITO + TOPO)    */}
      {/* ================================================================= */}


      {themeId === 'novembro_black' && (
        <g>
          {/* Facetas metálicas douradas 3D e raios luxuosos no canto direito */}
          <polygon
            points="895,0 1040,0 1040,116 838,116"
            fill="#d4af37"
            fillOpacity="0.06"
          />
          <polygon
            points="926,8 1024,18 998,94 892,76"
            fill="#111113"
            fillOpacity="0.65"
            stroke={`url(#gold3d-${uid})`}
            strokeWidth="1.2"
          />
          <polygon
            points="948,22 1012,28 992,82 918,68"
            fill={`url(#gold3d-${uid})`}
            fillOpacity="0.16"
            stroke="#fef3c7"
            strokeWidth="0.9"
          />
          {/* Linhas paralelas de acabamento escovado */}
          <line x1="872" y1="114" x2="964" y2="0" stroke="#d4af37" strokeWidth="1.1" strokeOpacity="0.65" />
          <line x1="886" y1="114" x2="978" y2="0" stroke="#fef3c7" strokeWidth="0.8" strokeOpacity="0.5" />
          <line x1="900" y1="114" x2="992" y2="0" stroke="#d4af37" strokeWidth="1.1" strokeOpacity="0.45" />
          {/* Diamantes/prismas brilhantes */}
          <polygon points="962,24 980,46 962,68 944,46" fill={`url(#gold3d-${uid})`} stroke="#fef9c3" strokeWidth="1" />
          <polygon points="962,32 973,46 962,60 951,46" fill="#09090b" stroke="#f5d061" strokeWidth="0.8" />
          <Sparkle4 cx={962} cy={46} r={6} fill="#fef9c3" />
          <GlowOrb cx={918} cy={22} r={2.2} core="#fef08a" haloId={`hdr-orb-${uid}`} />
          <GlowOrb cx={1006} cy={82} r={2.5} core="#f5d061" haloId={`hdr-orb-${uid}`} />
          <Sparkle4 cx={892} cy={18} r={4.5} fill="#f5d061" opacity={0.85} />
        </g>
      )}

      {themeId === 'ano_novo' && (
        <g>
          {/* Fogos de artifício radiais luminosos em ouro e prata no canto direito */}
          {[
            { cx: 954, cy: 46, r: 34, c: '#f5d061', rays: 16 },
            { cx: 904, cy: 74, r: 20, c: '#e2e8f0', rays: 12 },
            { cx: 1004, cy: 22, r: 16, c: '#fef08a', rays: 10 },
          ].map((fw, idx) => (
            <g key={idx}>
              <circle cx={fw.cx} cy={fw.cy} r={fw.r * 0.85} fill={`url(#hdr-orb-${uid})`} fillOpacity="0.35" />
              {Array.from({ length: fw.rays }).map((_, k) => {
                const a = (k * Math.PI * 2) / fw.rays;
                const x1 = fw.cx + Math.cos(a) * 4;
                const y1 = fw.cy + Math.sin(a) * 4;
                const x2 = fw.cx + Math.cos(a) * fw.r;
                const y2 = fw.cy + Math.sin(a) * fw.r;
                return (
                  <g key={k}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={fw.c}
                      strokeWidth="1.3"
                      strokeDasharray="3 2"
                      strokeLinecap="round"
                    />
                    <circle cx={x2} cy={y2} r="1.4" fill="#ffffff" />
                  </g>
                );
              })}
              <circle cx={fw.cx} cy={fw.cy} r="3.2" fill="#ffffff" />
            </g>
          ))}
          <Sparkle4 cx={894} cy={22} r={6} fill="#f5d061" />
          <Sparkle4 cx={994} cy={84} r={7} fill="#fef08a" />
          <GlowOrb cx={928} cy={18} r={2} core="#fef08a" haloId={`hdr-orb-${uid}`} />
          <GlowOrb cx={962} cy={92} r={2} core="#ffffff" haloId={`hdr-orb-${uid}`} />
        </g>
      )}

      {themeId === 'carnaval' && (
        <g>
          {/* Serpentinas douradas e magenta */}
          <path
            d="M 888 12 C 912 30, 932 8, 960 28 C 984 44, 1010 16, 1036 38"
            stroke="#facc15"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M 888 94 C 914 76, 936 98, 968 78 C 994 62, 1014 82, 1036 66"
            stroke="#f472b6"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Plumas festivas e Máscara Veneziana 3D */}
          <g transform="translate(918, 22)">
            {/* Plumas */}
            <path d="M 46 20 C 56 2, 74 -4, 86 6 C 72 14, 58 22, 48 26 Z" fill="#facc15" fillOpacity="0.88" />
            <path d="M 44 18 C 48 -2, 64 -10, 74 -2 C 64 10, 54 18, 46 22 Z" fill="#ec4899" fillOpacity="0.88" />
            <path d="M 42 18 C 36 -2, 20 -6, 12 4 C 24 12, 34 18, 40 22 Z" fill="#a855f7" fillOpacity="0.85" />
            {/* Máscara */}
            <path
              d="M 6 32 C 14 16, 34 16, 44 25 C 54 16, 74 16, 82 32 C 77 48, 60 52, 49 43 C 46 40, 42 40, 39 43 C 28 52, 11 48, 6 32 Z"
              fill="#5b21b6"
              stroke={`url(#gold3d-${uid})`}
              strokeWidth="2"
            />
            <ellipse cx="26" cy="34" rx="8" ry="4.5" fill="#ffffff" />
            <ellipse cx="62" cy="34" rx="8" ry="4.5" fill="#ffffff" />
            <Sparkle4 cx={44} cy={27} r={5} fill="#fde047" />
          </g>
          {/* Confetes brilhantes */}
          <rect x="892" y="42" width="8" height="5" rx="1.2" fill="#fde047" transform="rotate(25 892 42)" />
          <rect x="912" y="84" width="8" height="5" rx="1.2" fill="#38bdf8" transform="rotate(-20 912 84)" />
          <rect x="1008" y="88" width="8" height="5" rx="1.2" fill="#f472b6" transform="rotate(18 1008 88)" />
          <GlowOrb cx={882} cy={18} r={2} core="#fde047" haloId={`hdr-orb-${uid}`} />
        </g>
      )}

      {themeId === 'pascoa' && (
        <g>
          {/* Folhagem e ramos suaves */}
          <path d="M 884 98 Q 950 76 1026 92" stroke="#86efac" strokeWidth="1.8" strokeOpacity="0.85" />
          {/* Coelhinho delicado */}
          <g transform="translate(894, 24)">
            <ellipse cx="18" cy="18" rx="4.6" ry="14" fill="#ffffff" stroke="#d8b4fe" strokeWidth="1.3" transform="rotate(-10 18 18)" />
            <ellipse cx="29" cy="18" rx="4.6" ry="14" fill="#ffffff" stroke="#d8b4fe" strokeWidth="1.3" transform="rotate(10 29 18)" />
            <ellipse cx="18" cy="19" rx="2" ry="8" fill="#fbcfe8" transform="rotate(-10 18 19)" />
            <ellipse cx="29" cy="19" rx="2" ry="8" fill="#fbcfe8" transform="rotate(10 29 19)" />
            <circle cx="23.5" cy="34" r="10.5" fill="#ffffff" stroke="#d8b4fe" strokeWidth="1.3" />
            <ellipse cx="23.5" cy="52" rx="12.5" ry="14.5" fill="#ffffff" stroke="#d8b4fe" strokeWidth="1.3" />
            <circle cx="35.5" cy="57" r="4.2" fill="#f3e8ff" />
            <circle cx="20" cy="32.5" r="1.3" fill="#581c87" />
            <circle cx="27" cy="32.5" r="1.3" fill="#581c87" />
            <circle cx="23.5" cy="36" r="1.6" fill="#f472b6" />
          </g>
          {/* Ovos de Páscoa decorados em camadas */}
          <g transform="translate(946, 30)">
            <ellipse cx="18" cy="24" rx="14.5" ry="20" fill="#fef9c3" stroke="#ec4899" strokeWidth="1.5" />
            <path d="M 5 22 Q 18 28 31 22" stroke="#9333ea" strokeWidth="2.2" />
            <path d="M 6 15 Q 18 20 30 15" stroke="#4ade80" strokeWidth="1.8" />
            <path d="M 6 30 Q 18 35 30 30" stroke="#f472b6" strokeWidth="1.8" />
            <circle cx="18" cy="10" r="2" fill="#ec4899" />
            <circle cx="18" cy="38" r="2" fill="#9333ea" />
          </g>
          <g transform="translate(982, 46)">
            <ellipse cx="14" cy="19" rx="11.5" ry="16" fill="#dcfce7" stroke="#9333ea" strokeWidth="1.4" />
            <path d="M 4 19 Q 14 24 24 19" stroke="#f472b6" strokeWidth="2" />
            <path d="M 5 12 Q 14 16 23 12" stroke="#fef08a" strokeWidth="1.6" />
          </g>
          <GlowOrb cx={928} cy={16} r={2.2} core="#fef08a" haloId={`hdr-orb-${uid}`} />
          <Sparkle4 cx={1012} cy={24} r={5} fill="#fbcfe8" />
        </g>
      )}

      {themeId === 'dia_das_maes' && (
        <g>
          {/* Guirlanda floral rosé-dourada exuberante no canto direito */}
          <path
            d="M 886 14 C 920 42, 956 60, 1024 88"
            stroke="#fde68a"
            strokeWidth="1.8"
            strokeOpacity="0.85"
          />
          <path
            d="M 926 6 C 958 26, 988 38, 1034 44"
            stroke="#fecdd3"
            strokeWidth="1.5"
            strokeOpacity="0.75"
          />
          {/* Folhas douradas e rosé */}
          <ellipse cx="908" cy="30" rx="8" ry="3.2" fill="#fde68a" fillOpacity="0.75" transform="rotate(28 908 30)" />
          <ellipse cx="944" cy="68" rx="8" ry="3.2" fill="#fecdd3" fillOpacity="0.78" transform="rotate(-24 944 68)" />
          <ellipse cx="998" cy="78" rx="9" ry="3.4" fill="#fde68a" fillOpacity="0.78" transform="rotate(15 998 78)" />

          {/* Rosas em camadas 3D */}
          <LayeredRose
            cx={966}
            cy={38}
            scale={1.45}
            outerColor="#fda4af"
            midColor="#fecdd3"
            innerColor="#fff1f2"
            centerColor="#d4af37"
          />
          <LayeredRose
            cx={924}
            cy={52}
            scale={1.08}
            outerColor="#fb7185"
            midColor="#fda4af"
            innerColor="#ffe4e6"
            centerColor="#fde68a"
          />
          <LayeredRose
            cx={1006}
            cy={66}
            scale={1.15}
            outerColor="#fecdd3"
            midColor="#fff1f2"
            innerColor="#ffffff"
            centerColor="#d4af37"
          />
          <GlowOrb cx={902} cy={18} r={2} core="#fde68a" haloId={`hdr-orb-${uid}`} />
          <GlowOrb cx={952} cy={88} r={2} core="#fff1f2" haloId={`hdr-orb-${uid}`} />
        </g>
      )}

      {themeId === 'dia_dos_pais' && (
        <g>
          {/* Painel arquitetônico em grafite e prata escovada */}
          <polygon points="888,0 1040,0 1040,116 842,116" fill="#0f294a" fillOpacity="0.22" />
          <g opacity="0.72">
            <line x1="874" y1="116" x2="964" y2="0" stroke="#cbd5e1" strokeWidth="1.2" />
            <line x1="888" y1="116" x2="978" y2="0" stroke="#94a3b8" strokeWidth="1.2" />
            <line x1="902" y1="116" x2="992" y2="0" stroke="#e2e8f0" strokeWidth="1" />
            <line x1="916" y1="116" x2="1006" y2="0" stroke="#94a3b8" strokeWidth="1.2" />
          </g>
          {/* Brasão geométrico em prata e grafite */}
          <g transform="translate(928, 22)">
            <polygon points="34,0 68,34 34,68 0,34" fill="#0f172a" stroke={`url(#silver3d-${uid})`} strokeWidth="2" />
            <polygon points="34,10 58,34 34,58 10,34" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1.2" />
            <polygon points="34,20 48,34 34,48 20,34" fill={`url(#silver3d-${uid})`} />
            <circle cx="34" cy="34" r="3.5" fill="#0f294a" />
          </g>
          <Sparkle4 cx={916} cy={24} r={5} fill="#e2e8f0" opacity={0.85} />
          <GlowOrb cx={1006} cy={84} r={2.2} core="#e2e8f0" haloId={`hdr-orb-${uid}`} />
        </g>
      )}

      {themeId === 'halloween' && (
        <g>
          {/* Teia elegante no canto superior direito */}
          <g opacity="0.42">
            <line x1="1040" y1="0" x2="954" y2="18" stroke="#fed7aa" strokeWidth="0.9" />
            <line x1="1040" y1="0" x2="968" y2="44" stroke="#fed7aa" strokeWidth="0.9" />
            <line x1="1040" y1="0" x2="998" y2="62" stroke="#fed7aa" strokeWidth="0.9" />
            <path d="M 970 14 Q 982 28 996 36 Q 1012 45 1022 54" stroke="#fed7aa" strokeWidth="0.8" />
            <path d="M 998 8 Q 1006 18 1016 24 Q 1025 30 1031 37" stroke="#fed7aa" strokeWidth="0.8" />
          </g>
          {/* Lua crescente dourado-âmbar */}
          <path d="M 918 16 A 16 16 0 1 0 936 38 A 12 12 0 1 1 918 16 Z" fill="#fed7aa" />
          {/* Morcegos estilizados */}
          <path
            d="M 886 38 Q 894 28 902 38 Q 906 33 910 38 Q 918 28 926 38 Q 915 41 910 47 Q 906 43 902 47 Q 897 41 886 38 Z"
            fill="#110a1c"
            stroke="#c084fc"
            strokeWidth="1"
          />
          <path
            d="M 944 22 Q 950 15 955 22 Q 958 18 961 22 Q 966 15 972 22 Q 964 24 961 28 Q 958 25 955 28 Q 952 24 944 22 Z"
            fill="#110a1c"
            stroke="#fb923c"
            strokeWidth="0.9"
          />
          {/* Abóbora 3D iluminada */}
          <g transform="translate(946, 46)">
            <circle cx="24" cy="24" r="28" fill={`url(#hdr-flare-${uid})`} fillOpacity="0.45" />
            <path d="M 22 4 Q 25 -2 29 2 L 26 9 L 21 9 Z" fill="#581c87" />
            <ellipse cx="24" cy="25" rx="20" ry="15" fill={`url(#pumpkin3d-${uid})`} stroke="#fed7aa" strokeWidth="1" />
            <ellipse cx="24" cy="25" rx="12" ry="15" fill="#f97316" fillOpacity="0.65" />
            <ellipse cx="24" cy="25" rx="5.5" ry="14.5" fill="#fb923c" fillOpacity="0.65" />
            <polygon points="15,21 20,21 17.5,16.5" fill="#fef08a" />
            <polygon points="28,21 33,21 30.5,16.5" fill="#fef08a" />
            <polygon points="22.5,25 25.5,25 24,22" fill="#fef08a" />
            <path d="M 15 30 Q 24 36 33 30 L 30 33 Q 24 37 18 33 Z" fill="#fef08a" />
          </g>
          <Star5 cx={894} cy={76} r={4.5} fill="#fb923c" />
          <Star5 cx={1008} cy={88} r={4} fill="#c084fc" />
        </g>
      )}
    </svg>
  );
};

/**
 * 2. Acabamento sutil metálico nas barras de cabeçalho das seções (fiel à referência: limpo, sem poluição visual).
 */
export const EspelhoSectionHeaderAccent: React.FC<{ themeId: string }> = ({ themeId }) => {
  if (!isDecoratedThemeId(themeId)) return null;
  const rp = RIBBON_PALETTES[themeId];

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Brilho fino superior elegante */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${rp.rimHighlight} 45%, transparent 100%)`,
          opacity: 0.7,
        }}
      />
      {/* Filete inferior delicado combinando com o tema */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1.5px]"
        style={{
          background: `linear-gradient(90deg, ${rp.ribbonMain[0]} 0%, ${rp.ribbonMain[1]} 50%, ${rp.ribbonMain[0]} 100%)`,
          opacity: 0.8,
        }}
      />
    </div>
  );
};

/**
 * 3. Acabamento luminoso metálico na transição da onda do quadro TOTAL (fiel à referência).
 */
export const EspelhoTotalBoxDecorations: React.FC<{ themeId: string; uid?: string }> = ({
  themeId,
  uid = 'tot',
}) => {
  if (!isDecoratedThemeId(themeId)) return null;
  const rp = RIBBON_PALETTES[themeId];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-[2] block"
      preserveAspectRatio="none"
      viewBox="0 0 400 60"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`tot-rib-${uid}`} x1="140" y1="60" x2="240" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={rp.ribbonMain[0]} />
          <stop offset="50%" stopColor={rp.ribbonMain[2]} />
          <stop offset="100%" stopColor={rp.ribbonMain[1]} />
        </linearGradient>
        <radialGradient id={`tot-flare-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={rp.flareCore} stopOpacity="0.95" />
          <stop offset="35%" stopColor={rp.flareMid} stopOpacity="0.65" />
          <stop offset="100%" stopColor={rp.flareMid} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Fita metálica dupla na onda diagonal do TOTAL */}
      <path
        d="M 139 60 C 173 44, 196 10, 232 0 L 241 0 C 204 12, 180 46, 148 60 Z"
        fill={`url(#tot-rib-${uid})`}
      />
      {themeId === 'natal' ? (
        <circle cx="192" cy="36" r="24" fill={`url(#tot-flare-${uid})`} />
      ) : (
        <>
          <circle cx="188" cy="32" r="14" fill={`url(#tot-flare-${uid})`} />
          <Sparkle4 cx={188} cy={32} r={5} fill="#ffffff" />
        </>
      )}

      {/* Filete interno luminoso sutil */}
      <rect
        x="1"
        y="1"
        width="398"
        height="58"
        rx="13"
        stroke={rp.rimHighlight}
        strokeWidth="1"
        strokeOpacity="0.55"
      />
    </svg>
  );
};

/**
 * 4. Traço caligráfico refinado abaixo de "Obrigado pela confiança!" (exatamente w-44 h-3 mt-1).
 */
export const EspelhoFooterUnderlineOrnament: React.FC<{
  themeId: string;
  strokeColor: string;
  uid?: string;
}> = ({ themeId, strokeColor, uid = 'ftr' }) => {
  if (!isDecoratedThemeId(themeId)) {
    return (
      <svg className="w-44 h-3 mt-1" viewBox="0 0 180 12" fill="none" aria-hidden="true">
        <path
          d="M 6 9 C 52 2, 128 2, 174 8"
          stroke={strokeColor}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const rp = RIBBON_PALETTES[themeId];
  return (
    <svg className="w-44 h-3 mt-1" viewBox="0 0 180 12" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`ftr-brush-${uid}`} x1="0" y1="6" x2="180" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={rp.footerBrush[0]} />
          <stop offset="50%" stopColor={rp.footerBrush[1]} />
          <stop offset="100%" stopColor={rp.footerBrush[2]} />
        </linearGradient>
      </defs>
      <path
        d="M 6 9 C 54 2.5, 126 2.5, 174 8.5"
        stroke={`url(#ftr-brush-${uid})`}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
};

/**
 * 5. Faixa Gráfica Inferior PREMIUM Decorada (h-[64px], viewBox="0 0 1040 68").
 * Fita metálica contínua, guirlanda luminosa central com halos suaves e composições
 * 3D exclusivas de cada tema nos flancos esquerdo e direito.
 */
export const EspelhoBottomWaveDecorations: React.FC<{ themeId: string; uid: string }> = ({
  themeId,
  uid,
}) => {
  if (!isDecoratedThemeId(themeId) || themeId === 'natal') return null;
  const rp = RIBBON_PALETTES[themeId];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none block"
      preserveAspectRatio="none"
      viewBox="0 0 1040 68"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`wdec-rib-${uid}`} x1="0" y1="30" x2="1040" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={rp.ribbonMain[0]} />
          <stop offset="28%" stopColor={rp.ribbonMain[1]} />
          <stop offset="52%" stopColor={rp.ribbonMain[2]} />
          <stop offset="78%" stopColor={rp.ribbonMain[1]} />
          <stop offset="100%" stopColor={rp.ribbonMain[3]} />
        </linearGradient>
        <radialGradient id={`wdec-orb-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="38%" stopColor={rp.flareMid} stopOpacity="0.62" />
          <stop offset="100%" stopColor={rp.flareMid} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`wgold3d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="40%" stopColor="#f5d061" />
          <stop offset="75%" stopColor="#b8860b" />
          <stop offset="100%" stopColor="#7a5908" />
        </linearGradient>
        <linearGradient id={`wred3d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#6b0f14" />
        </linearGradient>
        <radialGradient id={`wbaub3d-${uid}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="42%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#52090d" />
        </radialGradient>
        <linearGradient id={`wsilver3d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <radialGradient id={`wpump3d-${uid}`} cx="40%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="38%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
      </defs>

      {/* Fita Metálica Curva Superior Contínua sobre as Ondas */}
      <path
        d="M 0 21 C 210 53, 520 55, 1040 8 L 1040 15 C 520 62, 210 60, 0 27 Z"
        fill={`url(#wdec-rib-${uid})`}
      />
      <path
        d="M 0 21 C 210 53, 520 55, 1040 8"
        stroke={rp.ribbonHighlight}
        strokeWidth="1"
        strokeOpacity="0.85"
      />

      {/* Duplo cordão luminoso fluido pelo centro */}
      <path
        d="M 190 48 Q 370 64 560 46 T 910 38"
        stroke={rp.rimHighlight}
        strokeWidth="1"
        strokeOpacity="0.65"
      />
      <path
        d="M 215 56 Q 400 42 595 58 T 895 48"
        stroke={rp.ribbonHighlight}
        strokeWidth="0.9"
        strokeOpacity="0.48"
      />


      {themeId === 'novembro_black' && (
        <g>
          {/* Facetas geométricas 3D ônix e ouro à esquerda */}
          <polygon points="14,68 88,68 124,34 42,34" fill="#09090b" stroke={`url(#wgold3d-${uid})`} strokeWidth="1.2" />
          <polygon points="56,68 134,68 164,40 88,40" fill={`url(#wgold3d-${uid})`} fillOpacity="0.22" stroke="#fef3c7" strokeWidth="1" />
          <polygon points="108,42 126,54 108,66 90,54" fill={`url(#wgold3d-${uid})`} stroke="#fef9c3" strokeWidth="0.9" />
          {/* Pontos de luz dourados no centro */}
          {[220, 330, 445, 560, 675, 790].map((cx, idx) => (
            <GlowOrb
              key={cx}
              cx={cx}
              cy={idx % 2 === 0 ? 54 : 47}
              r={2.4}
              core="#fef08a"
              haloId={`wdec-orb-${uid}`}
            />
          ))}
          {/* Facetas e diamante à direita */}
          <polygon points="884,68 960,68 996,24 920,24" fill="#09090b" stroke={`url(#wgold3d-${uid})`} strokeWidth="1.2" />
          <polygon points="944,68 1022,68 1038,32 978,32" fill={`url(#wgold3d-${uid})`} fillOpacity="0.22" stroke="#fef3c7" strokeWidth="1" />
          <polygon points="962,28 978,44 962,60 946,44" fill={`url(#wgold3d-${uid})`} stroke="#fef9c3" strokeWidth="1" />
          <Sparkle4 cx={962} cy={44} r={5.5} fill="#ffffff" />
        </g>
      )}

      {themeId === 'ano_novo' && (
        <g>
          {/* Fogos de artifício elegantes à esquerda */}
          {[
            { cx: 56, cy: 40, r: 22, c: '#f5d061', rays: 14 },
            { cx: 126, cy: 48, r: 15, c: '#e2e8f0', rays: 10 },
            { cx: 904, cy: 40, r: 17, c: '#e2e8f0', rays: 12 },
            { cx: 974, cy: 32, r: 24, c: '#f5d061', rays: 14 },
          ].map((fw, idx) => (
            <g key={idx}>
              <circle cx={fw.cx} cy={fw.cy} r={fw.r * 0.8} fill={`url(#wdec-orb-${uid})`} fillOpacity="0.3" />
              {Array.from({ length: fw.rays }).map((_, k) => {
                const a = (k * Math.PI * 2) / fw.rays;
                const x2 = fw.cx + Math.cos(a) * fw.r;
                const y2 = fw.cy + Math.sin(a) * fw.r;
                return (
                  <g key={k}>
                    <line
                      x1={fw.cx + Math.cos(a) * 3}
                      y1={fw.cy + Math.sin(a) * 3}
                      x2={x2}
                      y2={y2}
                      stroke={fw.c}
                      strokeWidth="1.2"
                      strokeDasharray="2.4 2"
                      strokeLinecap="round"
                    />
                    <circle cx={x2} cy={y2} r="1.2" fill="#ffffff" />
                  </g>
                );
              })}
              <circle cx={fw.cx} cy={fw.cy} r="2.6" fill="#ffffff" />
            </g>
          ))}
          {/* Trilha luminosa de estrelas e brilhos pelo centro */}
          {[225, 325, 425, 525, 625, 725, 825].map((cx, i) => (
            <g key={cx}>
              <GlowOrb
                cx={cx}
                cy={i % 2 === 0 ? 54 : 46}
                r={i % 2 === 0 ? 2.4 : 1.9}
                core="#fef08a"
                haloId={`wdec-orb-${uid}`}
              />
              {i % 2 === 0 && <Sparkle4 cx={cx + 38} cy={44} r={4.5} fill="#f5d061" opacity={0.85} />}
            </g>
          ))}
        </g>
      )}

      {themeId === 'carnaval' && (
        <g>
          {/* Máscara festiva + plumas à esquerda */}
          <g transform="translate(26, 22)">
            <path d="M 38 14 C 50 0, 68 -2, 76 6 C 62 12, 50 18, 42 22 Z" fill="#facc15" fillOpacity="0.88" />
            <path d="M 34 14 C 24 0, 8 -2, 0 6 C 14 12, 24 18, 32 22 Z" fill="#ec4899" fillOpacity="0.88" />
            <path
              d="M 6 22 C 12 10, 26 10, 34 17 C 42 10, 56 10, 62 22 C 58 34, 46 37, 38 30 C 35 28, 33 28, 30 30 C 22 37, 10 34, 6 22 Z"
              fill="#5b21b6"
              stroke={`url(#wgold3d-${uid})`}
              strokeWidth="1.6"
            />
            <ellipse cx="21" cy="23" rx="5.5" ry="3.2" fill="#ffffff" />
            <ellipse cx="47" cy="23" rx="5.5" ry="3.2" fill="#ffffff" />
            <Sparkle4 cx={34} cy={18} r={3.6} fill="#fde047" />
          </g>
          {/* Confetes & luzes ao longo do centro */}
          {[210, 315, 420, 525, 630, 735, 835].map((cx, i) => (
            <g key={cx}>
              <GlowOrb
                cx={cx}
                cy={i % 2 === 0 ? 54 : 46}
                r={2.2}
                core={i % 2 === 0 ? '#fde047' : '#f472b6'}
                haloId={`wdec-orb-${uid}`}
              />
              <rect
                x={cx + 28}
                y={i % 2 === 0 ? 44 : 52}
                width="8"
                height="4.8"
                rx="1.2"
                fill={i % 3 === 0 ? '#fde047' : i % 3 === 1 ? '#f472b6' : '#38bdf8'}
                transform={`rotate(${i % 2 === 0 ? 22 : -20} ${cx + 28} ${i % 2 === 0 ? 44 : 52})`}
              />
            </g>
          ))}
          {/* Máscara direita */}
          <g transform="translate(928, 16)">
            <path d="M 38 14 C 50 0, 68 -2, 76 6 C 62 12, 50 18, 42 22 Z" fill="#facc15" fillOpacity="0.88" />
            <path d="M 34 14 C 24 0, 8 -2, 0 6 C 14 12, 24 18, 32 22 Z" fill="#a855f7" fillOpacity="0.88" />
            <path
              d="M 6 22 C 12 10, 26 10, 34 17 C 42 10, 56 10, 62 22 C 58 34, 46 37, 38 30 C 35 28, 33 28, 30 30 C 22 37, 10 34, 6 22 Z"
              fill="#be185d"
              stroke={`url(#wgold3d-${uid})`}
              strokeWidth="1.6"
            />
            <ellipse cx="21" cy="23" rx="5.5" ry="3.2" fill="#ffffff" />
            <ellipse cx="47" cy="23" rx="5.5" ry="3.2" fill="#ffffff" />
          </g>
        </g>
      )}

      {themeId === 'pascoa' && (
        <g>
          {/* Coelhinho + Ovos decorativos à esquerda */}
          <g transform="translate(26, 12)">
            <ellipse cx="14" cy="14" rx="3.8" ry="11.5" fill="#ffffff" stroke="#c084fc" strokeWidth="1.2" transform="rotate(-10 14 14)" />
            <ellipse cx="23" cy="14" rx="3.8" ry="11.5" fill="#ffffff" stroke="#c084fc" strokeWidth="1.2" transform="rotate(10 23 14)" />
            <ellipse cx="14" cy="15" rx="1.6" ry="6.5" fill="#fbcfe8" transform="rotate(-10 14 15)" />
            <ellipse cx="23" cy="15" rx="1.6" ry="6.5" fill="#fbcfe8" transform="rotate(10 23 15)" />
            <circle cx="18.5" cy="27" r="8.5" fill="#ffffff" stroke="#c084fc" strokeWidth="1.2" />
            <ellipse cx="18.5" cy="41" rx="10" ry="11.5" fill="#ffffff" stroke="#c084fc" strokeWidth="1.2" />
            <circle cx="15.8" cy="26" r="1.1" fill="#581c87" />
            <circle cx="21.2" cy="26" r="1.1" fill="#581c87" />
            <circle cx="18.5" cy="28.8" r="1.4" fill="#f472b6" />
          </g>
          <g transform="translate(68, 26)">
            <ellipse cx="13" cy="18" rx="11" ry="15" fill="#fef9c3" stroke="#ec4899" strokeWidth="1.4" />
            <path d="M 3 18 Q 13 23 23 18" stroke="#9333ea" strokeWidth="1.8" />
            <path d="M 5 11 Q 13 15 21 11" stroke="#4ade80" strokeWidth="1.6" />
          </g>
          <g transform="translate(102, 34)">
            <ellipse cx="10" cy="14" rx="8.5" ry="11.5" fill="#dcfce7" stroke="#9333ea" strokeWidth="1.3" />
            <path d="M 2 14 Q 10 18 18 14" stroke="#f472b6" strokeWidth="1.6" />
          </g>

          {/* Luzes pastel centrais */}
          {[225, 330, 440, 550, 660, 770].map((cx, i) => (
            <GlowOrb
              key={cx}
              cx={cx}
              cy={i % 2 === 0 ? 54 : 47}
              r={2.2}
              core={i % 2 === 0 ? '#fef08a' : '#fbcfe8'}
              haloId={`wdec-orb-${uid}`}
            />
          ))}

          {/* Ovos decorativos à direita */}
          <g transform="translate(916, 22)">
            <ellipse cx="11" cy="15" rx="9" ry="12.5" fill="#fce7f3" stroke="#7e22ce" strokeWidth="1.3" />
            <path d="M 3 15 Q 11 19 19 15" stroke="#fef08a" strokeWidth="1.6" />
          </g>
          <g transform="translate(946, 12)">
            <ellipse cx="14" cy="19" rx="11.5" ry="16" fill="#f3e8ff" stroke="#f472b6" strokeWidth="1.4" />
            <path d="M 3 19 Q 14 24 25 19" stroke="#86efac" strokeWidth="1.8" />
            <path d="M 5 12 Q 14 16 23 12" stroke="#fef08a" strokeWidth="1.6" />
          </g>
          <LayeredRose cx={994} cy={44} scale={0.95} outerColor="#fbcfe8" midColor="#fff1f2" innerColor="#ffffff" centerColor="#fef08a" />
        </g>
      )}

      {themeId === 'dia_das_maes' && (
        <g>
          {/* Buquê rosé-dourado esquerdo */}
          <path d="M 16 44 Q 95 62 178 46" stroke="#fde68a" strokeWidth="1.6" />
          <ellipse cx="78" cy="40" rx="7" ry="2.8" fill="#fde68a" fillOpacity="0.8" transform="rotate(-22 78 40)" />
          <ellipse cx="132" cy="54" rx="6.5" ry="2.6" fill="#fecdd3" fillOpacity="0.82" transform="rotate(18 132 54)" />
          <LayeredRose cx={48} cy={42} scale={1.38} outerColor="#fda4af" midColor="#fecdd3" innerColor="#fff1f2" centerColor="#d4af37" />
          <LayeredRose cx={102} cy={48} scale={1.08} outerColor="#fb7185" midColor="#fda4af" innerColor="#ffe4e6" centerColor="#fde68a" />
          <LayeredRose cx={148} cy={49} scale={0.88} outerColor="#fecdd3" midColor="#fff1f2" innerColor="#ffffff" centerColor="#d4af37" />

          {/* Pérolas luminosas no centro */}
          {[235, 345, 455, 565, 675, 785].map((cx, i) => (
            <GlowOrb
              key={cx}
              cx={cx}
              cy={i % 2 === 0 ? 54 : 46}
              r={2.2}
              core={i % 2 === 0 ? '#fde68a' : '#ffe4e6'}
              haloId={`wdec-orb-${uid}`}
            />
          ))}

          {/* Buquê rosé-dourado direito */}
          <path d="M 862 34 Q 946 18 1024 38" stroke="#fde68a" strokeWidth="1.6" />
          <LayeredRose cx={896} cy={34} scale={0.92} outerColor="#fecdd3" midColor="#fff1f2" innerColor="#ffffff" centerColor="#d4af37" />
          <LayeredRose cx={944} cy={32} scale={1.15} outerColor="#fb7185" midColor="#fda4af" innerColor="#ffe4e6" centerColor="#fde68a" />
          <LayeredRose cx={994} cy={36} scale={1.38} outerColor="#fda4af" midColor="#fecdd3" innerColor="#fff1f2" centerColor="#d4af37" />
        </g>
      )}

      {themeId === 'dia_dos_pais' && (
        <g>
          {/* Pinstripes e brasão prata/grafite à esquerda */}
          <g opacity="0.72">
            <line x1="20" y1="68" x2="64" y2="24" stroke="#cbd5e1" strokeWidth="1.3" />
            <line x1="34" y1="68" x2="78" y2="24" stroke="#94a3b8" strokeWidth="1.3" />
            <line x1="48" y1="68" x2="92" y2="24" stroke="#e2e8f0" strokeWidth="1.1" />
          </g>
          <g transform="translate(104, 28)">
            <polygon points="18,0 36,18 18,36 0,18" fill="#0f172a" stroke={`url(#wsilver3d-${uid})`} strokeWidth="1.6" />
            <polygon points="18,6 30,18 18,30 6,18" fill="#334155" stroke="#cbd5e1" strokeWidth="1" />
            <polygon points="18,12 24,18 18,24 12,18" fill={`url(#wsilver3d-${uid})`} />
          </g>

          {/* Pontos metálicos sutis pelo centro */}
          {[245, 365, 485, 605, 725, 845].map((cx, i) => (
            <GlowOrb
              key={cx}
              cx={cx}
              cy={i % 2 === 0 ? 54 : 46}
              r={2}
              core="#e2e8f0"
              haloId={`wdec-orb-${uid}`}
            />
          ))}

          {/* Brasão e pinstripes à direita */}
          <g transform="translate(902, 18)">
            <polygon points="18,0 36,18 18,36 0,18" fill="#0f172a" stroke={`url(#wsilver3d-${uid})`} strokeWidth="1.6" />
            <polygon points="18,6 30,18 18,30 6,18" fill="#334155" stroke="#cbd5e1" strokeWidth="1" />
            <polygon points="18,12 24,18 18,24 12,18" fill={`url(#wsilver3d-${uid})`} />
          </g>
          <g opacity="0.72">
            <line x1="952" y1="68" x2="996" y2="20" stroke="#cbd5e1" strokeWidth="1.3" />
            <line x1="966" y1="68" x2="1010" y2="20" stroke="#94a3b8" strokeWidth="1.3" />
            <line x1="980" y1="68" x2="1024" y2="20" stroke="#e2e8f0" strokeWidth="1.1" />
          </g>
        </g>
      )}

      {themeId === 'halloween' && (
        <g>
          {/* Abóboras iluminadas + morcego à esquerda */}
          <g transform="translate(26, 22)">
            <path d="M 16 4 Q 18 -1 22 2 L 20 8 L 15 8 Z" fill="#581c87" />
            <ellipse cx="18" cy="23" rx="16" ry="13" fill={`url(#wpump3d-${uid})`} stroke="#fed7aa" strokeWidth="1" />
            <ellipse cx="18" cy="23" rx="9.5" ry="13" fill="#f97316" fillOpacity="0.6" />
            <polygon points="11,20 15,20 13,16.5" fill="#fef08a" />
            <polygon points="21,20 25,20 23,16.5" fill="#fef08a" />
            <path d="M 11.5 27 Q 18 32 24.5 27" stroke="#fef08a" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g transform="translate(70, 32)">
            <rect x="10" y="0" width="3" height="5" rx="0.8" fill="#581c87" />
            <ellipse cx="11.5" cy="15" rx="10.5" ry="8.5" fill={`url(#wpump3d-${uid})`} stroke="#fed7aa" strokeWidth="0.9" />
          </g>
          <path
            d="M 108 32 Q 116 23 122 32 Q 125 27 128 32 Q 134 23 142 32 Q 132 34 128 40 Q 125 36 122 40 Q 118 34 108 32 Z"
            fill="#110a1c"
            stroke="#c084fc"
            strokeWidth="1"
          />

          {/* Orbes âmbar e roxo pela guirlanda central */}
          {[225, 325, 425, 525, 625, 725, 825].map((cx, i) => (
            <g key={cx}>
              <GlowOrb
                cx={cx}
                cy={i % 2 === 0 ? 54 : 46}
                r={2.4}
                core={i % 2 === 0 ? '#fb923c' : '#e9d5ff'}
                haloId={`wdec-orb-${uid}`}
              />
              {i % 2 === 1 && <Star5 cx={cx + 38} cy={43} r={3.5} fill="#fb923c" opacity={0.85} />}
            </g>
          ))}

          {/* Lua + morcego + abóbora à direita */}
          <path d="M 918 14 A 11 11 0 1 0 930 28 A 8 8 0 1 1 918 14 Z" fill="#fed7aa" />
          <g transform="translate(948, 20)">
            <path d="M 16 4 Q 18 -1 22 2 L 20 8 L 15 8 Z" fill="#581c87" />
            <ellipse cx="18" cy="23" rx="16" ry="13" fill={`url(#wpump3d-${uid})`} stroke="#fed7aa" strokeWidth="1" />
            <ellipse cx="18" cy="23" rx="9.5" ry="13" fill="#f97316" fillOpacity="0.6" />
            <polygon points="11,20 15,20 13,16.5" fill="#fef08a" />
            <polygon points="21,20 25,20 23,16.5" fill="#fef08a" />
            <path d="M 11.5 27 Q 18 32 24.5 27" stroke="#fef08a" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <Star5 cx={1006} cy={44} r={4} fill="#c084fc" />
        </g>
      )}
    </svg>
  );
};

/**
 * 6. Moldura superior sutil integrada às bordas do documento (0px de intrusão no layout).
 */
export const EspelhoFrameCornerDecorations: React.FC<{
  themeId: string;
  accentColor: string;
}> = ({ themeId, accentColor }) => {
  if (!isDecoratedThemeId(themeId) || themeId === 'natal') return null;
  const rp = RIBBON_PALETTES[themeId];

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none z-[15] overflow-hidden rounded-2xl"
      aria-hidden="true"
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2.5px]"
        style={{
          background: `linear-gradient(90deg, ${rp.ribbonMain[0]} 0%, ${rp.ribbonMain[2]} 50%, ${rp.ribbonMain[0]} 100%)`,
          opacity: 0.9,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${rp.ribbonMain[0]} 0%, ${rp.ribbonMain[1]} 50%, ${rp.ribbonMain[0]} 100%)`,
          opacity: 0.75,
        }}
      />
      <svg className="absolute top-1.5 left-1.5 w-4 h-4 opacity-60" viewBox="0 0 16 16" fill="none">
        <path d="M 1 11 L 1 2 C 1 1.4 1.4 1 2 1 L 11 1" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
};


