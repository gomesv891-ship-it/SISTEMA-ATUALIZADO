import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check, ChevronDown, RotateCcw, Sparkles } from 'lucide-react';
import {
  ALL_THEME_IDS,
  BudgetThemeVariant,
  CustomThemeConfig,
  FenixThemeId,
  getThemeDefinition,
  supportsDecoratedVariant,
} from '../utils/themeService';

interface EspelhoThemeSelectorProps {
  selectedThemeId: FenixThemeId | null;
  effectiveThemeId: FenixThemeId;
  selectedVariant?: BudgetThemeVariant | null;
  effectiveVariant?: BudgetThemeVariant;
  customTheme?: CustomThemeConfig;
  onSelectTheme: (
    themeId: FenixThemeId | null,
    variant?: BudgetThemeVariant | null
  ) => void;
  compact?: boolean;
}

export const EspelhoThemeSelector: React.FC<EspelhoThemeSelectorProps> = ({
  selectedThemeId,
  effectiveThemeId,
  selectedVariant = null,
  effectiveVariant,
  customTheme,
  onSelectTheme,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeDef = getThemeDefinition(effectiveThemeId, customTheme);
  const activeSupportsVariants = supportsDecoratedVariant(effectiveThemeId);
  const resolvedEffectiveVariant: BudgetThemeVariant =
    activeSupportsVariants && effectiveVariant === 'decorado' ? 'decorado' : 'classico';
  const hasOverride = selectedThemeId !== null || selectedVariant !== null;

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

  const handlePick = (
    themeId: FenixThemeId,
    variant: BudgetThemeVariant = 'classico'
  ) => {
    const safeVariant: BudgetThemeVariant = supportsDecoratedVariant(themeId)
      ? variant
      : 'classico';
    onSelectTheme(themeId, safeVariant);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block no-print">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${
          compact ? 'h-9 px-3 text-xs sm:text-sm' : 'h-9 px-3.5 text-xs sm:text-sm'
        } rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer`}
        title="Alternar tema e versão visual apenas para este orçamento (não altera o tema global do sistema)"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Palette className="w-4 h-4 text-[#0052cc] flex-shrink-0" />
        <span>Tema:</span>
        <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
          <span className="inline-flex items-center -space-x-1">
            {activeDef.paletteSwatches.slice(0, 3).map((color, idx) => (
              <span
                key={idx}
                className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
          <span className="max-w-[140px] truncate">{activeDef.name}</span>
          {activeSupportsVariants && (
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
              · {resolvedEffectiveVariant === 'decorado' ? 'Decorado' : 'Clássico'}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-[336px] sm:w-[376px] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          role="listbox"
          aria-label="Selecionar tema visual e versão para o espelho do orçamento"
        >
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                Tema deste Orçamento
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Escolha o tema visual somente para este espelho
              </p>
            </div>
            {hasOverride && (
              <button
                type="button"
                onClick={() => {
                  onSelectTheme(null, null);
                  setIsOpen(false);
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#0052cc] hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer flex-shrink-0"
                title="Voltar ao tema padrão do seu login"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Padrão</span>
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
            {ALL_THEME_IDS.map((id) => {
              const def = getThemeDefinition(id, customTheme);
              const isSelected = effectiveThemeId === id;
              const hasVariants = supportsDecoratedVariant(id);

              if (!hasVariants) {
                // Premium ('padrao') e Personalizado permanecem com opção única
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handlePick(id, 'classico')}
                    className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 text-[#003865] border border-blue-200'
                        : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex items-center -space-x-1 flex-shrink-0">
                        {def.paletteSwatches.slice(0, 4).map((swatch, sIdx) => (
                          <span
                            key={sIdx}
                            className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                          {def.name}
                        </span>
                        <span className="block text-[10.5px] text-slate-500 truncate">
                          {id === 'padrao' ? 'Versão Oficial Única' : def.shortTag}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[#0052cc] text-white flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              }

              const isClassicActive = isSelected && resolvedEffectiveVariant === 'classico';
              const isDecoratedActive = isSelected && resolvedEffectiveVariant === 'decorado';

              return (
                <div
                  key={id}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 transition-colors border ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-200'
                      : 'hover:bg-slate-50 border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handlePick(id, isSelected ? resolvedEffectiveVariant : 'classico')
                    }
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center -space-x-1 flex-shrink-0">
                      {def.paletteSwatches.slice(0, 4).map((swatch, sIdx) => (
                        <span
                          key={sIdx}
                          className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-xs sm:text-[13px] font-bold text-slate-900 truncate">
                        {def.name}
                      </span>
                      <span className="block text-[10.5px] text-slate-500 truncate">
                        {def.shortTag}
                      </span>
                    </div>
                  </button>

                  {/* Opções Clássico e Decorado */}
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePick(id, 'classico')}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        isClassicActive
                          ? 'bg-[#0052cc] text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                      title={`Aplicar ${def.name} Clássico`}
                    >
                      Clássico
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePick(id, 'decorado')}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                        isDecoratedActive
                          ? 'bg-[#0052cc] text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                      title={`Aplicar ${def.name} Decorado`}
                    >
                      <Sparkles className="w-2.5 h-2.5 flex-shrink-0" />
                      <span>Decorado</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
