import React, { useState, useEffect } from 'react';
import {
  Users,
  Calculator,
  FileText,
  PhoneCall,
  Target,
  Package,
  CheckSquare,
  NotebookPen,
  Settings,
  Tag,
  X,
  LogOut,
  Database,
  CloudOff,
} from 'lucide-react';
import { FenixLogo } from './FenixLogo';
import { isEderPerez } from '../utils/auth';
import { OfflineSyncModal } from './OfflineSyncModal';
import {
  isEmergencyOfflineMode,
  subscribeEmergencyOfflineMode,
  getPendingSyncCount,
  subscribePendingSync,
  SHOW_OFFLINE_SYNC_INDICATORS,
} from '../utils/indexedDbOfflineStore';
import { useFenixTheme } from '../utils/themeService';
import { preloadTabModule } from '../utils/modulePreloader';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
  currentUserName?: string;
  allowedTabs?: string[];
}

interface MenuSection {
  title: string;
  items: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

// Abas removidas definitivamente do menu de todos os logins e perfis:
// Estoque, Pós Vendas, Boletos, Pendências, Notas e Vendas
const REMOVED_MENU_TAB_IDS = new Set([
  'estoque',
  'controledeestoque',
  'posvendas',
  'pos-vendas',
  'pós-vendas',
  'pósvendas',
  'boletos',
  'pendencias',
  'pendências',
  'notas',
  'vendas',
  'venda',
  'negociacoes',
  'negociações',
]);

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'COMERCIAL',
    items: [
      { id: 'Clientes', label: 'Clientes', icon: Users },
      { id: 'Calculadora', label: 'Calculadora', icon: Calculator },
      { id: 'Orçamentos', label: 'Orçamentos', icon: FileText },
      { id: 'Follow-up', label: 'Follow-up', icon: PhoneCall },
      { id: 'Promoções Ativas', label: 'Promoções Ativas', icon: Tag },
      { id: 'Metas', label: 'Metas', icon: Target },
    ],
  },
  {
    title: 'OPERAÇÃO',
    items: [
      { id: 'Produtos', label: 'Produtos', icon: Package },
      { id: 'Tarefas', label: 'Tarefas', icon: CheckSquare },
      { id: 'Anotações', label: 'Anotações', icon: NotebookPen },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { id: 'Configurações', label: 'Configurações', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab = 'Clientes',
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  onLogout,
  currentUserName = '',
  allowedTabs,
}) => {
  const isDirector = isEderPerez(currentUserName);
  const { theme, isThemed } = useFenixTheme('crm');
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState(() => isEmergencyOfflineMode());
  const [pendingCount, setPendingCount] = useState(() => getPendingSyncCount());

  useEffect(() => {
    const unsubPending = subscribePendingSync(() => setPendingCount(getPendingSyncCount()));
    const unsubMode = subscribeEmergencyOfflineMode((enabled) => setEmergencyMode(enabled));
    return () => {
      unsubPending();
      unsubMode();
    };
  }, []);

  // Filter menu items by user permissions (com bloqueio definitivo das 6 abas removidas para todos os logins)
  const filteredSections = MENU_SECTIONS.map((section) => {
    const visibleItems = section.items.filter((item) => {
      const normItemId = item.id
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_\s]/g, '');

      // Garantir que as 6 abas removidas nunca apareçam em nenhum perfil ou login
      if (REMOVED_MENU_TAB_IDS.has(normItemId)) {
        return false;
      }

      if (isDirector) return true;

      if (!allowedTabs || allowedTabs.length === 0) return false;

      return allowedTabs.some((tab) => {
        const normTab = tab
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[-_\s]/g, '');
        return normTab === normItemId;
      });
    });

    return {
      ...section,
      items: visibleItems,
    };
  }).filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Dark Sophisticated Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-60 xl:w-64 bg-[#091122] text-slate-300 flex flex-col justify-between transition-transform duration-250 ease-out border-r border-slate-800/80 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
        style={
          isThemed
            ? {
                backgroundColor: theme.crm.sidebarBg,
                borderRightColor: theme.crm.sidebarBorder,
                color: theme.crm.sidebarText,
              }
            : undefined
        }
      >
        {/* Top: Logo FÊNIX WORLD (100% original, nunca recolorida ou filtrada) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="h-16 px-4 flex items-center justify-between border-b border-white/5 flex-shrink-0"
            style={
              isThemed
                ? {
                    borderBottomColor: theme.crm.sidebarBorder,
                    boxShadow: `inset 0 -2px 0 ${theme.crm.accent}40`,
                  }
                : undefined
            }
          >
            <div className="no-theme-override inline-flex items-center">
              <FenixLogo size="sm" showText={true} />
            </div>
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg lg:hidden hover:bg-white/10"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu List grouped into structured blocks */}
          <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-3 custom-scrollbar">
            {filteredSections.map((section) => (
              <div key={section.title} className="space-y-0.5">
                {/* Block Section Title */}
                <p
                  className="text-[10px] font-bold tracking-wider text-slate-400/70 uppercase px-3 pt-1 pb-1 select-none"
                  style={isThemed ? { color: theme.crm.sidebarMuted } : undefined}
                >
                  {section.title}
                </p>

                {/* Section Items with py-1.5 */}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.id === currentTab ||
                    (item.id === 'Tarefas' && (currentTab === 'Agenda' || currentTab === 'Tarefas')) ||
                    (item.id === 'Pós Vendas' && (currentTab === 'Obras' || currentTab === 'Pós-Vendas' || currentTab === 'PosVendas' || currentTab === 'Pos Vendas' || currentTab === 'Pós Vendas')) ||
                    (item.id === 'Estoque' && (currentTab === 'Materiais' || currentTab === 'Controle de Estoque' || currentTab === 'Estoque')) ||
                    (item.id === 'Metas' && (currentTab === 'Meta' || currentTab === 'Metas')) ||
                    (item.id === 'Pendências' && (currentTab === 'Pendencias' || currentTab === 'Pendências')) ||
                    (item.id === 'Follow-up' && (currentTab === 'FollowUp' || currentTab === 'Follow-up')) ||
                    (item.id === 'Promoções Ativas' && (currentTab === 'Promocoes Ativas' || currentTab === 'Promoções Ativas')) ||
                    (item.id === 'Anotações' && (currentTab === 'Anotacoes' || currentTab === 'Anotações'));

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => preloadTabModule(item.id)}
                      onFocus={() => preloadTabModule(item.id)}
                      onTouchStart={() => preloadTabModule(item.id)}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-1.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer select-none ${
                        isActive
                          ? 'bg-[#0052cc] text-white font-semibold shadow-sm shadow-blue-600/30'
                          : isThemed
                            ? 'hover:bg-[var(--fenix-sidebar-hover)]'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                      style={
                        isThemed
                          ? isActive
                            ? {
                                backgroundColor: theme.crm.sidebarActiveBg,
                                color: theme.crm.sidebarActiveText,
                                boxShadow: `inset 0 0 0 1px ${theme.crm.sidebarActiveAccent}55`,
                              }
                            : {
                                color: theme.crm.sidebarText,
                              }
                          : undefined
                      }
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive ? 'text-white stroke-[2.2]' : 'text-slate-400 stroke-[1.8]'
                        }`}
                        style={
                          isThemed
                            ? {
                                color: isActive
                                  ? theme.crm.sidebarActiveText
                                  : theme.crm.sidebarMuted,
                              }
                            : undefined
                        }
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Tagline, Modo Offline & Sair */}
        <div
          className="p-3 border-t border-white/5 bg-[#070e1c]/90 flex-shrink-0 space-y-1.5"
          style={
            isThemed
              ? {
                  backgroundColor: theme.crm.sidebarFooterBg,
                  borderTopColor: theme.crm.sidebarBorder,
                }
              : undefined
          }
        >
          {SHOW_OFFLINE_SYNC_INDICATORS && (
            <button
              type="button"
              onClick={() => {
                setIsOfflineModalOpen(true);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                emergencyMode
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-200 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/20'
              }`}
              title="Gerenciar IndexedDB local e sincronização manual com Supabase"
            >
              <span className="flex items-center gap-2 min-w-0">
                {emergencyMode ? (
                  <CloudOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                ) : (
                  <Database className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                )}
                <span className="truncate">
                  {emergencyMode ? 'Offline (IndexedDB)' : 'Sync Manual / Online'}
                </span>
              </span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 text-[10px] font-bold flex-shrink-0">
                  {pendingCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do sistema</span>
          </button>
          <p
            className="text-[10px] text-slate-400 text-center mt-1 font-normal tracking-tight"
            style={isThemed ? { color: theme.crm.sidebarMuted } : undefined}
          >
            Trabalhando juntos por grandes conquistas
          </p>
        </div>
      </aside>

      <OfflineSyncModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
        currentUserName={currentUserName || 'Vanessa Gomes'}
      />
    </>
  );
};
