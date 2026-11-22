import React, { useEffect, useMemo, useState } from 'react';
import {
  Palette,
  Eye,
  Check,
  RotateCcw,
  Calendar,
  X,
  Clock,
  Search,
} from 'lucide-react';
import {
  ALL_THEME_IDS,
  CustomThemeConfig,
  FenixThemeId,
  FenixThemeState,
  activateTheme,
  deactivateTheme,
  getEffectiveActiveThemeId,
  getPreviewThemeId,
  getScheduleStatus,
  getThemeDefinition,
  getThemeState,
  saveThemeState,
  setPreviewTheme,
  THEME_UPDATED_EVENT,
} from '../utils/themeService';

interface TemasDecoracoesSectionProps {
  onShowToast?: (msg: string) => void;
}

export const TemasDecoracoesSection: React.FC<TemasDecoracoesSectionProps> = ({
  onShowToast,
}) => {
  const [themeState, setThemeState] = useState<FenixThemeState>(() => getThemeState());
  const [previewId, setPreviewIdState] = useState<FenixThemeId | null>(() =>
    getPreviewThemeId()
  );
  const [customDraft, setCustomDraft] = useState<CustomThemeConfig>(
    () => getThemeState().customTheme
  );

  useEffect(() => {
    const sync = () => {
      const latest = getThemeState();
      setThemeState(latest);
      setCustomDraft(latest.customTheme);
      setPreviewIdState(getPreviewThemeId());
    };
    window.addEventListener(THEME_UPDATED_EVENT, sync);
    window.addEventListener('fenix_offline_hydrated', sync);
    window.addEventListener('fenix_auth_updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(THEME_UPDATED_EVENT, sync);
      window.removeEventListener('fenix_offline_hydrated', sync);
      window.removeEventListener('fenix_auth_updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const effectiveId = useMemo(
    () => getEffectiveActiveThemeId(themeState),
    [themeState, previewId]
  );
  const scheduleStatus = useMemo(() => getScheduleStatus(themeState), [themeState]);
  const effectiveDef = useMemo(
    () => getThemeDefinition(effectiveId, customDraft),
    [effectiveId, customDraft]
  );

  const notify = (msg: string) => {
    if (onShowToast) onShowToast(msg);
  };

  const handleActivate = (id: FenixThemeId) => {
    if (id === 'personalizado') {
      saveThemeState({ customTheme: customDraft });
    }
    const updated = activateTheme(id);
    setThemeState(updated);
    setPreviewIdState(null);
    const def = getThemeDefinition(id, customDraft);
    notify(`Tema "${def.name}" ativado em todo o CRM!`);
  };

  const handlePreview = (id: FenixThemeId) => {
    if (previewId === id) {
      setPreviewTheme(null);
      setPreviewIdState(null);
      notify('Pré-visualização encerrada.');
      return;
    }
    setPreviewTheme(id, id === 'personalizado' ? customDraft : undefined);
    setPreviewIdState(id);
    const def = getThemeDefinition(id, customDraft);
    notify(`Pré-visualizando "${def.name}". Clique em "Ativar tema" para aplicar.`);
  };

  const handleDeactivate = () => {
    const updated = deactivateTheme();
    setThemeState(updated);
    setPreviewIdState(null);
    notify('Tema personalizado desativado. Identidade PREMIUM restaurada.');
  };

  const handleUpdateOption = (patch: Partial<FenixThemeState>) => {
    const updated = saveThemeState(patch);
    setThemeState(updated);
  };

  const handleSaveCustomColors = (andActivate = false) => {
    const updated = saveThemeState({ customTheme: { ...customDraft, motif: 'nenhum' } });
    setThemeState(updated);
    if (andActivate) {
      handleActivate('personalizado');
    } else {
      setPreviewTheme('personalizado', { ...customDraft, motif: 'nenhum' });
      setPreviewIdState('personalizado');
      notify('Cores personalizadas aplicadas na pré-visualização.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ======================================================== */}
      {/* CABEÇALHO E STATUS DO TEMA ATUAL DO CRM                   */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-[#1D4ED8] flex items-center justify-center flex-shrink-0">
              <Palette className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Temas e Personalização
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 max-w-2xl">
                Personalize a identidade visual global do CRM — menu lateral, cabeçalho, fundo das páginas, cards, botões, campos de pesquisa, tabelas, bordas e destaques — mantendo a logo da Fênix World e os modelos de orçamento independentes dentro de Orçamentos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {previewId && (
              <button
                type="button"
                onClick={() => {
                  setPreviewTheme(null);
                  setPreviewIdState(null);
                }}
                className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                <span>Sair da Pré-visualização</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={themeState.activeThemeId === 'padrao' && !themeState.autoScheduleEnabled && !previewId}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Restaurar Tema PREMIUM</span>
            </button>
          </div>
        </div>

        {/* Barra de Estado Atual */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center -space-x-1 flex-shrink-0">
              {effectiveDef.paletteSwatches.map((hex, i) => (
                <span
                  key={i}
                  className="w-5 h-5 rounded-full border-2 border-white shadow-2xs"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>
                  {previewId ? 'Pré-visualizando:' : 'Tema ativo no CRM:'}{' '}
                  <strong>{effectiveDef.name}</strong>
                </span>
                {previewId && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    Prévia temporária
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {scheduleStatus.statusLabel} • Aplicado em todas as telas do CRM com logo original protegida e orçamentos independentes
              </p>
            </div>
          </div>
        </div>

        {/* Agendamento Automático por Período */}
        <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Calendar className="w-4 h-4 text-[#1D4ED8]" />
              <span>Agendamento Automático por Período</span>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={themeState.autoScheduleEnabled}
                onChange={(e) => {
                  handleUpdateOption({ autoScheduleEnabled: e.target.checked });
                  notify(
                    e.target.checked
                      ? 'Ativação automática por período habilitada.'
                      : 'Agendamento automático desativado.'
                  );
                }}
                className="w-4 h-4 rounded text-[#1D4ED8] cursor-pointer"
              />
              <span>Ativar automaticamente</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Tema programado
              </label>
              <select
                value={themeState.scheduledThemeId}
                onChange={(e) =>
                  handleUpdateOption({ scheduledThemeId: e.target.value as FenixThemeId })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1D4ED8] cursor-pointer"
              >
                {ALL_THEME_IDS.filter((id) => id !== 'padrao').map((id) => (
                  <option key={id} value={id}>
                    {getThemeDefinition(id, customDraft).name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Data de início
              </label>
              <input
                type="date"
                value={themeState.startDate}
                onChange={(e) => handleUpdateOption({ startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 tabular-nums focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Data de término
              </label>
              <input
                type="date"
                value={themeState.endDate}
                onChange={(e) => handleUpdateOption({ endDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 tabular-nums focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center gap-2 text-[11px] text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>{scheduleStatus.statusLabel}</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* GRADE DOS 10 TEMAS DO CRM                                */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ALL_THEME_IDS.map((themeId) => {
          const def = getThemeDefinition(themeId, customDraft);
          const isSavedActive = themeState.activeThemeId === themeId && !scheduleStatus.isWithinWindow;
          const isEffectiveActive = effectiveId === themeId && !previewId;
          const isPreviewingThis = previewId === themeId;
          const isActiveCard = isEffectiveActive || isSavedActive;

          return (
            <div
              key={themeId}
              className={`no-theme-override bg-white rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-all ${
                isPreviewingThis
                  ? 'border-amber-400 ring-2 ring-amber-400/25 shadow-sm'
                  : isActiveCard
                    ? 'border-slate-900 ring-1 ring-slate-900/15 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="space-y-3">
                {/* Miniatura Estrutural do CRM (Sidebar, Header, Fundo, Card, Pesquisa, Tabela, Botões) */}
                <div
                  className="rounded-xl border overflow-hidden h-36 flex"
                  style={{
                    borderColor: def.crm.cardBorder,
                    backgroundColor: def.crm.pageBg,
                  }}
                >
                  {/* Mini Menu Lateral */}
                  <div
                    className="w-16 p-2 flex flex-col justify-between flex-shrink-0 border-r"
                    style={{
                      backgroundColor: def.crm.sidebarBg,
                      borderRightColor: def.crm.sidebarBorder,
                    }}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 pb-1.5 border-b" style={{ borderBottomColor: def.crm.sidebarBorder }}>
                        <span
                          className="w-2.5 h-2.5 rounded-xs flex-shrink-0"
                          style={{ backgroundColor: def.crm.sidebarActiveAccent }}
                        />
                        <span
                          className="h-1.5 w-8 rounded-xs"
                          style={{ backgroundColor: def.crm.sidebarText, opacity: 0.85 }}
                        />
                      </div>
                      <div
                        className="h-3.5 w-full rounded-md px-1 flex items-center"
                        style={{
                          backgroundColor: def.crm.sidebarActiveBg,
                          boxShadow: `inset 0 0 0 1px ${def.crm.sidebarActiveAccent}55`,
                        }}
                      >
                        <span
                          className="h-1 w-7 rounded-xs"
                          style={{ backgroundColor: def.crm.sidebarActiveText }}
                        />
                      </div>
                      <div
                        className="h-2.5 w-11 rounded-md"
                        style={{ backgroundColor: def.crm.sidebarHoverBg }}
                      />
                      <div
                        className="h-2 w-9 rounded-xs"
                        style={{ backgroundColor: def.crm.sidebarMuted, opacity: 0.45 }}
                      />
                    </div>
                    <div
                      className="h-1.5 w-full rounded-xs"
                      style={{ backgroundColor: def.crm.sidebarMuted, opacity: 0.35 }}
                    />
                  </div>

                  {/* Mini Cabeçalho + Área de Trabalho do CRM */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Mini Cabeçalho Principal */}
                    <div
                      className="h-8 px-2.5 flex items-center justify-between gap-2 flex-shrink-0"
                      style={{
                        background: `linear-gradient(90deg, ${def.crm.headerOverlayFrom}, ${def.crm.headerOverlayVia}, ${def.crm.headerOverlayTo})`,
                        borderBottom: `2px solid ${def.crm.headerAccent}`,
                      }}
                    >
                      <span className="h-1.5 w-12 rounded-xs bg-white/90" />
                      <div
                        className="h-4 w-20 rounded-md border px-1.5 flex items-center gap-1"
                        style={{
                          backgroundColor: def.crm.headerSearchBg,
                          borderColor: def.crm.headerSearchBorder,
                        }}
                      >
                        <Search className="w-2 h-2 text-white/70" />
                        <span className="h-1 w-8 rounded-xs bg-white/40" />
                      </div>
                    </div>

                    {/* Mini Cards, Campo de Pesquisa, Tabela & Botões */}
                    <div className="flex-1 p-2 flex flex-col gap-1.5 min-h-0">
                      {/* Card principal */}
                      <div
                        className="flex-1 rounded-lg border p-2 flex flex-col justify-between shadow-2xs"
                        style={{
                          backgroundColor: def.crm.cardBg,
                          borderColor: def.crm.cardBorder,
                        }}
                      >
                        {/* Topo do card: campo de pesquisa + chip de destaque + botão */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div
                            className="h-4 flex-1 rounded-md border px-1.5 flex items-center gap-1"
                            style={{
                              backgroundColor: def.crm.inputBg,
                              borderColor: def.crm.inputBorder,
                            }}
                          >
                            <span
                              className="h-1 w-10 rounded-xs"
                              style={{ backgroundColor: def.crm.highlightText, opacity: 0.35 }}
                            />
                          </div>
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[8px] font-bold whitespace-nowrap"
                            style={{
                              backgroundColor: def.crm.indicatorBg,
                              color: def.crm.indicatorText,
                            }}
                          >
                            Destaque
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-md text-[8px] font-bold text-white whitespace-nowrap"
                            style={{ backgroundColor: def.crm.primary }}
                          >
                            Ação
                          </span>
                        </div>

                        {/* Mini Tabela */}
                        <div
                          className="rounded-md border overflow-hidden"
                          style={{ borderColor: def.crm.tableBorder }}
                        >
                          <div
                            className="h-3.5 px-2 flex items-center justify-between text-[7.5px] font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: def.crm.tableHeaderBg,
                              color: def.crm.tableHeaderText,
                              borderBottom: `1px solid ${def.crm.dividerColor}`,
                            }}
                          >
                            <span>Cliente</span>
                            <span>Status</span>
                          </div>
                          <div
                            className="h-3.5 px-2 flex items-center justify-between"
                            style={{ backgroundColor: def.crm.cardBg }}
                          >
                            <span
                              className="h-1.5 w-14 rounded-xs"
                              style={{ backgroundColor: def.crm.highlightText, opacity: 0.7 }}
                            />
                            <span
                              className="h-1.5 w-6 rounded-xs"
                              style={{ backgroundColor: def.crm.secondary, opacity: 0.55 }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Título + Status + Descrição */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {def.name}
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                      {isPreviewingThis
                        ? 'Em pré-visualização'
                        : isActiveCard
                          ? 'Ativo'
                          : def.shortTag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed min-h-[32px]">
                    {def.description}
                  </p>
                </div>

                {/* Paleta de Cores */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Paleta do tema:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {def.paletteSwatches.map((hex, i) => (
                      <span
                        key={i}
                        title={hex}
                        className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Ações: Pré-visualizar & Ativar tema */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handlePreview(themeId)}
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    isPreviewingThis
                      ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isPreviewingThis ? 'Fechar Prévia' : 'Pré-visualizar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleActivate(themeId)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap text-white shadow-2xs"
                  style={{
                    backgroundColor: isActiveCard ? '#16a34a' : def.crm.primary,
                  }}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isActiveCard ? 'Tema Ativo' : 'Ativar tema'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* EDITOR DO TEMA PERSONALIZADO (EXCLUSIVO DO CRM)          */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Editor do Tema Personalizado
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina manualmente as cores do CRM mantendo legibilidade, harmonia e estrutura originais.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveCustomColors(false)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Pré-visualizar Personalizado</span>
            </button>
            <button
              type="button"
              onClick={() => handleSaveCustomColors(true)}
              className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1e40af] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salvar e Ativar Personalizado</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {(
            [
              { key: 'primary', label: 'Cor principal' },
              { key: 'secondary', label: 'Cor secundária' },
              { key: 'accent', label: 'Cor de destaque' },
              { key: 'headerBg', label: 'Cor dos cabeçalhos' },
              { key: 'buttonBg', label: 'Cor dos botões' },
            ] as { key: keyof Omit<CustomThemeConfig, 'motif'>; label: string }[]
          ).map((field) => (
            <div
              key={field.key}
              className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-xs font-bold text-slate-800">{field.label}</div>
                <div className="text-[11px] font-mono text-slate-500 uppercase mt-0.5">
                  {customDraft[field.key]}
                </div>
              </div>
              <input
                type="color"
                value={customDraft[field.key]}
                onChange={(e) =>
                  setCustomDraft((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer bg-white p-0.5 flex-shrink-0"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
