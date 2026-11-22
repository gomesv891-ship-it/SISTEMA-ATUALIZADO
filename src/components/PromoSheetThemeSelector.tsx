import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Palette, RotateCcw } from 'lucide-react';
import {
  PROMO_SHEET_THEMES,
  PromoSheetThemeId,
  normalizePromoSheetThemeId,
} from '../utils/promocoesService';

interface PromoSheetThemeSelectorProps {
  value?: PromoSheetThemeId;
  onChange: (themeId: PromoSheetThemeId) => void;
}

export const PromoSheetThemeSelector: React.FC<PromoSheetThemeSelectorProps> = ({
  value,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeThemeId = normalizePromoSheetThemeId(value);
  const activeMeta =
    PROMO_SHEET_THEMES.find((t) => t.id === activeThemeId) || PROMO_SHEET_THEMES[0];
  const hasNonDefault = activeThemeId !== 'padrao';

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePick = (themeId: PromoSheetThemeId) => {
    onChange(themeId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer outline-none focus:border-[#0052cc]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title="Selecionar tema visual da Folha de Divulgação desta campanha"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Palette className="w-4 h-4 text-[#0052cc] flex-shrink-0" />
          <span className="inline-flex items-center -space-x-1 flex-shrink-0">
            {activeMeta.swatches.slice(0, 3).map((color, idx) => (
              <span
                key={idx}
                className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
          <span className="font-bold text-[#0B2046] truncate">{activeMeta.name}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden"
          role="listbox"
          aria-label="Selecionar Tema da Folha"
        >
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wide">
                Tema desta Folha
              </p>
              <p className="text-[10.5px] text-slate-500">
                Aplica somente a esta campanha
              </p>
            </div>
            {hasNonDefault && (
              <button
                type="button"
                onClick={() => handlePick('padrao')}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#0052cc] hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer flex-shrink-0"
                title="Restaurar tema Premium padrão"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Padrão</span>
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {PROMO_SHEET_THEMES.map((themeMeta) => {
              const isSelected = activeThemeId === themeMeta.id;
              return (
                <button
                  key={themeMeta.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handlePick(themeMeta.id)}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/90 text-[#003865] border border-blue-200'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex items-center -space-x-1 flex-shrink-0">
                      {themeMeta.swatches.map((swatch, sIdx) => (
                        <span
                          key={sIdx}
                          className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                    <span className="text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                      {themeMeta.name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-[#0052cc] text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
