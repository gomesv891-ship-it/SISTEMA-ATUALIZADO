import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Database,
  CloudOff,
  Cloud,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Users,
  UploadCloud,
  ShieldCheck,
  Loader2,
  Clock,
} from 'lucide-react';
import {
  isEmergencyOfflineMode,
  setEmergencyOfflineMode,
  subscribeEmergencyOfflineMode,
  getPendingSyncRecords,
  subscribePendingSync,
  getOfflineStoreStats,
  exportOfflineBackupPayload,
  restoreOfficialSeedClientsSafe,
  PendingOfflineRecord,
} from '../utils/indexedDbOfflineStore';
import {
  testSupabaseConnection,
  syncPendingOfflineRecordsToSupabase,
  pullAndMergeFromSupabaseSafe,
} from '../utils/supabaseClient';

interface OfflineSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
}

const COLLECTION_LABELS: Record<string, string> = {
  fenix_clients_db: 'Clientes',
  fenix_orcamentos_history: 'Orçamentos',
  fenix_saved_orcamentos: 'Orçamentos Salvos',
  fenix_followup_cards_v2: 'Follow-up de Orçamentos',
  fenix_prospeccao_clients_db: 'Prospecção',
  fenix_tarefas_db: 'Tarefas',
  fenix_product_items_data: 'Produtos',
  fenix_product_categories_data: 'Categorias de Produtos',
  fenix_product_groups_data: 'Grupos de Produtos',
  fenix_promocoes_ativas_db: 'Promoções Ativas',
  fenix_anotacoes_db: 'Anotações',
  fenix_metas_registros_v2: 'Metas / Vendas',
  fenix_metas_consultoras_v2: 'Metas por Consultora',
  fenix_metas_produtos_v2: 'Metas por Produto',
  fenix_pendencias_v1: 'Pendências',
  fenix_estoque_movimentacoes: 'Estoque',
  fenix_insumos_loja_db: 'Insumos da Loja',
  fenix_custos_variaveis_db: 'Custos Variáveis',
  fenix_rendimentos_db: 'Rendimentos',
  fenix_usuarios_v2: 'Usuários e Permissões',
};

const OP_LABELS: Record<string, { label: string; cls: string }> = {
  upsert: {
    label: 'Criado / Editado',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  delete: {
    label: 'Excluído',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  collection: {
    label: 'Coleção Atualizada',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
};

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({
  isOpen,
  onClose,
  currentUserName = 'Vanessa Gomes',
}) => {
  const [emergencyMode, setEmergencyMode] = useState<boolean>(() => isEmergencyOfflineMode());
  const [pendingRecords, setPendingRecords] = useState<PendingOfflineRecord[]>(() =>
    getPendingSyncRecords()
  );
  const [stats, setStats] = useState(() => getOfflineStoreStats());

  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const refreshLocalState = () => {
    setEmergencyMode(isEmergencyOfflineMode());
    setPendingRecords(getPendingSyncRecords());
    setStats(getOfflineStoreStats());
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshLocalState();
    const unsubPending = subscribePendingSync(refreshLocalState);
    const unsubMode = subscribeEmergencyOfflineMode(refreshLocalState);
    return () => {
      unsubPending();
      unsubMode();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleEmergencyMode = () => {
    const next = !emergencyMode;
    setEmergencyOfflineMode(next);
    setEmergencyMode(next);
    setFeedback({
      type: 'info',
      message: next
        ? 'Modo Offline Emergencial (IndexedDB) ativado. Nenhuma sincronização automática será feita com o Supabase.'
        : 'Modo Online reativado. Caso note instabilidade no Supabase, reative o Modo Offline Emergencial imediatamente.',
    });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await testSupabaseConnection();
      if (res.success) {
        setFeedback({
          type: 'success',
          message:
            res.message ||
            'Conexão com o Supabase respondendo normalmente! Você já pode executar a sincronização manual segura se desejar.',
        });
      } else {
        setFeedback({
          type: 'error',
          message:
            res.error ||
            'Supabase continua instável ou sem resposta. Mantenha o Modo Offline Emergencial ativo.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Falha ao testar conexão com o Supabase.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSafeSyncPending = async () => {
    if (pendingRecords.length === 0) {
      setFeedback({
        type: 'info',
        message: 'Não há registros pendentes de sincronização no momento.',
      });
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const result = await syncPendingOfflineRecordsToSupabase(currentUserName);
      refreshLocalState();
      if (result.success) {
        setFeedback({
          type: 'success',
          message: `Sincronização segura concluída! ${result.syncedCount} registro(s) mesclado(s) com o Supabase sem duplicar ou sobrescrever.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message:
            result.error ||
            `Não foi possível concluir a sincronização (${result.remainingCount} pendente(s) preservado(s) no IndexedDB).`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.message ||
          'Erro durante a sincronização manual. Todos os registros locais permanecem intactos.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullAndMerge = async () => {
    setIsPulling(true);
    setFeedback(null);
    try {
      const res = await pullAndMergeFromSupabaseSafe();
      refreshLocalState();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Mesclagem concluída com segurança! ${res.updatedCollections} coleção(ões) atualizada(s) preservando todos os dados pendentes offline.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message:
            res.error ||
            'Supabase indisponível para consulta. Seus dados locais no IndexedDB não foram modificados.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao consultar dados no Supabase.',
      });
    } finally {
      setIsPulling(false);
    }
  };

  const handleRestoreBaseClients = () => {
    const total = restoreOfficialSeedClientsSafe();
    refreshLocalState();
    setFeedback({
      type: 'success',
      message: `Clientes originais verificados e restaurados com segurança (${total} clientes disponíveis no armazenamento local, sem sobrescrever edições).`,
    });
  };

  const handleExportBackup = () => {
    try {
      const payload = exportOfflineBackupPayload();
      const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `fenix-crm-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'success',
        message: 'Backup JSON completo exportado com sucesso!',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Não foi possível gerar o arquivo de backup JSON.',
      });
    }
  };

  const busy = isTesting || isSyncing || isPulling;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                emergencyMode
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                Armazenamento Local (IndexedDB) & Sincronização
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Operação emergencial local com preservação total e sincronização manual segura
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status Banner + Toggle */}
          <div
            className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              emergencyMode
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-emerald-50/70 border-emerald-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {emergencyMode ? (
                <CloudOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Cloud className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900">
                    {emergencyMode
                      ? 'Modo Offline Emergencial ATIVO'
                      : 'Modo Online Híbrido (IndexedDB + Supabase)'}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                      stats.idbAvailable
                        ? 'bg-white/80 text-slate-700 border-slate-200'
                        : 'bg-rose-100 text-rose-700 border-rose-200'
                    }`}
                  >
                    {stats.idbAvailable ? 'IndexedDB Ativo' : 'Fallback Memória/Storage'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {emergencyMode
                    ? 'Todas as alterações estão sendo gravadas localmente no navegador (IndexedDB) sem depender nem tentar sincronizar automaticamente com o Supabase.'
                    : 'Modo online ativo. Só mantenha desativado o Modo Offline se o teste de conexão confirmar que o Supabase estabilizou.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleEmergencyMode}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors flex-shrink-0 cursor-pointer ${
                emergencyMode
                  ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  : 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
              }`}
            >
              {emergencyMode ? 'Desativar Modo Offline' : 'Ativar Modo Offline'}
            </button>
          </div>

          {/* Feedback message */}
          {feedback && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs sm:text-sm flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Local IndexedDB Stats Grid */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Dados Preservados Localmente (IndexedDB)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { label: 'Clientes', value: stats.counts.clientes },
                { label: 'Orçamentos', value: stats.counts.orcamentos },
                { label: 'Follow-up', value: stats.counts.followup },
                { label: 'Prospecção', value: stats.counts.prospeccao },
                { label: 'Tarefas', value: stats.counts.tarefas },
                { label: 'Produtos', value: stats.counts.produtos },
                { label: 'Anotações', value: stats.counts.anotacoes },
                { label: 'Promoções', value: stats.counts.promocoes },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2.5"
                >
                  <p className="text-[11px] text-slate-500 font-medium">{item.label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ações Manuais Seguras
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleTestConnection}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4 text-blue-600" />
                )}
                <span>Testar Conexão Supabase</span>
              </button>

              <button
                type="button"
                disabled={busy || pendingRecords.length === 0}
                onClick={handleSafeSyncPending}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0052cc] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                <span>
                  Sincronizar Pendentes Agora ({pendingRecords.length})
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handlePullAndMerge}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isPulling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                )}
                <span>Baixar & Mesclar do Supabase</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleRestoreBaseClients}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Restaurar Clientes Base</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>
                  A sincronização manual testa a conexão antes de enviar e nunca sobrescreve ou duplica registros existentes.
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportBackup}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex-shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Backup JSON</span>
              </button>
            </div>
          </div>

          {/* Pending Records List */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Registros Pendentes de Sincronização ({pendingRecords.length})
              </p>
            </div>

            {pendingRecords.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                Nenhum registro pendente de envio ao Supabase no momento.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {pendingRecords.map((rec) => {
                  const colLabel = COLLECTION_LABELS[rec.collectionKey] || rec.collectionKey;
                  const opMeta = OP_LABELS[rec.op] || OP_LABELS.upsert;
                  const dateLabel = new Date(rec.timestamp).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={rec.queueKey}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-900 truncate max-w-[260px]">
                            {rec.summaryLabel || rec.itemId}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {colLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {dateLabel}
                          </span>
                          <span>•</span>
                          <span>{rec.user}</span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex-shrink-0 ${opMeta.cls}`}
                      >
                        {opMeta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
