import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  Ruler,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useFenixTheme } from '../../utils/themeService';
import {
  formatQuickInputNumber,
  parsePtBrDimension,
  round2,
} from '../../utils/floorplanCalculator';
import {
  FloorplanOcrAnalysisResult,
  OcrConfidenceLevel,
  RecognizedFloorplanRoomDraft,
} from '../../utils/floorplanOcrEngine';

interface FloorplanOcrReviewModalProps {
  isOpen: boolean;
  result: FloorplanOcrAnalysisResult | null;
  onClose: () => void;
  onConfirm: (confirmedRooms: RecognizedFloorplanRoomDraft[]) => void;
}

interface ReviewRowDraft {
  width: string;
  length: string;
  area: string;
  perimeter: string;
}

function buildRowDraft(item: RecognizedFloorplanRoomDraft): ReviewRowDraft {
  return {
    width: item.widthMeters !== null ? formatQuickInputNumber(item.widthMeters) : '',
    length: item.lengthMeters !== null ? formatQuickInputNumber(item.lengthMeters) : '',
    area: item.areaSqm !== null ? formatQuickInputNumber(item.areaSqm) : '',
    perimeter:
      item.perimeterMeters !== null ? formatQuickInputNumber(item.perimeterMeters) : '',
  };
}

function getConfidenceBadge(level: OcrConfidenceLevel): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  switch (level) {
    case 'high':
      return {
        label: 'Alta confiança',
        bg: '#dcfce7',
        text: '#166534',
        border: '#86efac',
      };
    case 'medium':
      return {
        label: 'Média (conferir)',
        bg: '#fef3c7',
        text: '#92400e',
        border: '#fcd34d',
      };
    case 'low':
    default:
      return {
        label: 'Incerto / Incompleto',
        bg: '#fee2e2',
        text: '#991b1b',
        border: '#fca5a5',
      };
  }
}

export const FloorplanOcrReviewModal: React.FC<FloorplanOcrReviewModalProps> = ({
  isOpen,
  result,
  onClose,
  onConfirm,
}) => {
  const { theme } = useFenixTheme('crm');
  const crm = theme.crm;

  const [items, setItems] = useState<RecognizedFloorplanRoomDraft[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewRowDraft>>({});

  useEffect(() => {
    if (!isOpen || !result) return;
    setItems(result.rooms.map((r) => ({ ...r })));
    const nextDrafts: Record<string, ReviewRowDraft> = {};
    for (const r of result.rooms) {
      nextDrafts[r.tempId] = buildRowDraft(r);
    }
    setDrafts(nextDrafts);
  }, [isOpen, result]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !result) return null;

  const selectedCount = items.filter((i) => i.selected).length;

  const handleToggleItem = (tempId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleSelectAll = (val: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, selected: val })));
  };

  const handleRemoveItem = (tempId: string) => {
    setItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleNameChange = (tempId: string, name: string) => {
    setItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, name } : item))
    );
  };

  const handleDimensionChange = (
    tempId: string,
    field: 'width' | 'length' | 'area' | 'perimeter',
    rawValue: string
  ) => {
    const currentItem = items.find((i) => i.tempId === tempId);
    if (!currentItem) return;

    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? null : parsePtBrDimension(rawValue);

    if (field === 'width' || field === 'length') {
      const nextW = field === 'width' ? parsed : currentItem.widthMeters;
      const nextL = field === 'length' ? parsed : currentItem.lengthMeters;
      const bothSides =
        nextW !== null && nextW > 0 && nextL !== null && nextL > 0;
      const nextArea = bothSides ? round2(nextW * nextL) : null;
      const nextPerim = bothSides ? round2(2 * (nextW + nextL)) : null;

      setDrafts((dPrev) => ({
        ...dPrev,
        [tempId]: {
          ...(dPrev[tempId] || buildRowDraft(currentItem)),
          [field]: rawValue,
          area: nextArea !== null ? formatQuickInputNumber(nextArea) : '',
          perimeter: nextPerim !== null ? formatQuickInputNumber(nextPerim) : '',
        },
      }));

      setItems((prev) =>
        prev.map((item) =>
          item.tempId === tempId
            ? {
                ...item,
                widthMeters: nextW,
                lengthMeters: nextL,
                areaSqm: nextArea,
                perimeterMeters: nextPerim,
                isAreaOnly: false,
                confidence:
                  bothSides && item.confidence === 'low' ? 'medium' : item.confidence,
              }
            : item
        )
      );
      return;
    }

    setDrafts((dPrev) => ({
      ...dPrev,
      [tempId]: {
        ...(dPrev[tempId] || buildRowDraft(currentItem)),
        [field]: rawValue,
      },
    }));

    setItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        if (field === 'area') {
          return {
            ...item,
            areaSqm: parsed,
            isAreaOnly: true,
          };
        }
        return {
          ...item,
          perimeterMeters: parsed,
        };
      })
    );
  };

  const handleConfirmClick = () => {
    const confirmed = items.filter((item) => item.selected && item.name.trim().length > 0);
    onConfirm(confirmed);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center">
      <div
        className="w-full max-w-6xl max-h-[92vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: crm.cardBg,
          borderColor: crm.cardBorder,
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-start justify-between gap-3 shrink-0"
          style={{
            backgroundColor: crm.cardTintBg,
            borderColor: crm.dividerColor,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: crm.indicatorBg,
                color: crm.indicatorText,
              }}
            >
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3
                className="text-base sm:text-lg font-extrabold tracking-tight"
                style={{ color: crm.highlightText }}
              >
                Conferência dos Ambientes e Dimensões Reconhecidas
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Confira cada item extraído por OCR/PDF antes de cadastrar. Você pode editar medidas, desmarcar ambientes incorretos ou preencher campos em branco.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] font-semibold text-slate-600">
                <span>
                  Método:{' '}
                  <strong style={{ color: crm.primary }}>
                    {result.extractionMethod === 'pdf_vector'
                      ? 'Leitura Vetorial PDF'
                      : result.extractionMethod === 'hybrid'
                        ? 'PDF Vetorial + OCR Local'
                        : 'OCR Local da Imagem'}
                  </strong>
                </span>
                {result.detectedScale && (
                  <span>
                    Escala detectada na prancha:{' '}
                    <strong style={{ color: crm.highlightText }}>{result.detectedScale}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
            style={{
              backgroundColor: crm.cardBg,
              borderColor: crm.cardBorder,
            }}
            title="Fechar conferência (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avisos de precisão / limitações */}
        {result.warnings.length > 0 && (
          <div className="px-5 pt-3 shrink-0 space-y-2">
            {result.warnings.map((w, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Controles de seleção em massa */}
        <div
          className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2 shrink-0"
          style={{ borderColor: crm.dividerColor }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
                color: crm.highlightText,
              }}
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer text-slate-600"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
              }}
            >
              Desmarcar todos
            </button>
          </div>

          <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" style={{ color: crm.primary }} />
            <span>
              Ambientes existentes em "Ambientes do Projeto" não serão apagados nem substituídos.
            </span>
          </div>
        </div>

        {/* Lista / Tabela de Conferência */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed p-10 text-center space-y-2"
              style={{
                backgroundColor: crm.panelSubtleBg,
                borderColor: crm.cardTintBorder,
              }}
            >
              <ShieldAlert className="w-9 h-9 mx-auto text-amber-500" />
              <p className="text-sm font-bold" style={{ color: crm.highlightText }}>
                Nenhum ambiente com textos legíveis foi identificado automaticamente.
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Plantas com baixa resolução, letras cursivas ou sem cotas escritas podem exigir cadastro manual. Feche esta janela e utilize "Adicionar Ambiente" normalmente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const draft = drafts[item.tempId] || buildRowDraft(item);
                const badge = getConfidenceBadge(item.confidence);

                return (
                  <div
                    key={item.tempId}
                    className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-opacity ${
                      item.selected ? '' : 'opacity-65'
                    }`}
                    style={{
                      backgroundColor: item.selected ? crm.panelSubtleBg : crm.cardBg,
                      borderColor: item.selected ? crm.cardTintBorder : crm.cardBorder,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
                        <button
                          type="button"
                          onClick={() => handleToggleItem(item.tempId)}
                          className="w-5 h-5 rounded-md border inline-flex items-center justify-center shrink-0 cursor-pointer"
                          style={{
                            backgroundColor: item.selected ? crm.primary : crm.inputBg,
                            borderColor: item.selected ? crm.primary : crm.inputBorder,
                            color: '#ffffff',
                          }}
                          aria-label={`Selecionar ${item.name}`}
                        >
                          {item.selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleNameChange(item.tempId, e.target.value)}
                          placeholder="Nome do ambiente"
                          className="flex-1 h-9 rounded-xl border px-3 text-xs sm:text-sm font-bold outline-none"
                          style={{
                            backgroundColor: crm.inputBg,
                            borderColor: crm.inputBorder,
                            color: crm.highlightText,
                          }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {item.alreadyExists && (
                          <span className="px-2 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-bold">
                            Já existe na lista
                          </span>
                        )}

                        <span
                          className="px-2.5 py-0.5 rounded-md border text-[11px] font-bold tabular-nums"
                          style={{
                            backgroundColor: badge.bg,
                            color: badge.text,
                            borderColor: badge.border,
                          }}
                        >
                          {badge.label}
                          {item.confidenceScore > 0 ? ` (${item.confidenceScore}%)` : ''}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.tempId)}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Descartar item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Largura (m)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.width}
                          onChange={(e) =>
                            handleDimensionChange(item.tempId, 'width', e.target.value)
                          }
                          placeholder="Em branco"
                          className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-semibold text-center outline-none tabular-nums"
                          style={{
                            backgroundColor: crm.inputBg,
                            borderColor: crm.inputBorder,
                            color: crm.highlightText,
                          }}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Comprimento (m)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.length}
                          onChange={(e) =>
                            handleDimensionChange(item.tempId, 'length', e.target.value)
                          }
                          placeholder="Em branco"
                          className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-semibold text-center outline-none tabular-nums"
                          style={{
                            backgroundColor: crm.inputBg,
                            borderColor: crm.inputBorder,
                            color: crm.highlightText,
                          }}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Área (m²)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.area}
                          onChange={(e) =>
                            handleDimensionChange(item.tempId, 'area', e.target.value)
                          }
                          placeholder="Em branco"
                          className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-extrabold text-center outline-none tabular-nums"
                          style={{
                            backgroundColor: crm.inputBg,
                            borderColor: crm.inputBorder,
                            color: crm.primary,
                          }}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Perímetro (ml)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.perimeter}
                          onChange={(e) =>
                            handleDimensionChange(item.tempId, 'perimeter', e.target.value)
                          }
                          placeholder="Em branco"
                          className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-extrabold text-center outline-none tabular-nums"
                          style={{
                            backgroundColor: crm.inputBg,
                            borderColor: crm.inputBorder,
                            color: crm.highlightText,
                          }}
                        />
                      </div>
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-slate-500">{item.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 border-t flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.dividerColor,
          }}
        >
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            {selectedCount}{' '}
            {selectedCount === 1
              ? 'ambiente selecionado para cadastrar'
              : 'ambientes selecionados para cadastrar'}
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border text-xs font-bold cursor-pointer"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
                color: crm.highlightText,
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={selectedCount === 0}
              className="h-10 px-5 rounded-xl text-xs font-extrabold text-white flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-45"
              style={{ backgroundColor: crm.primary }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Cadastro ({selectedCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
