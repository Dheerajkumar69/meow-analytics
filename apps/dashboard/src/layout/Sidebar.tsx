import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  Users,
  Compass,
  Globe,
  Laptop,
  Zap,
  Gauge,
  AlertTriangle,
  FolderKanban,
  Settings,
  X,
  LucideIcon,
} from 'lucide-react';

export type NavItemKey =
  | 'overview'
  | 'traffic'
  | 'pages'
  | 'visitors'
  | 'sources'
  | 'geography'
  | 'devices'
  | 'events'
  | 'performance'
  | 'errors'
  | 'projects'
  | 'settings';

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const navItems: { key: NavItemKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'traffic', label: 'Traffic', icon: TrendingUp },
  { key: 'pages', label: 'Pages', icon: FileText },
  { key: 'visitors', label: 'Visitors', icon: Users },
  { key: 'sources', label: 'Sources', icon: Compass },
  { key: 'geography', label: 'Geography', icon: Globe },
  { key: 'devices', label: 'Devices', icon: Laptop },
  { key: 'events', label: 'Events', icon: Zap },
  { key: 'performance', label: 'Performance', icon: Gauge },
  { key: 'errors', label: 'Errors', icon: AlertTriangle },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const handleItemClick = (key: NavItemKey) => {
    onSelectTab(key);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 90,
          }}
        />
      )}

      <aside
        id="app-sidebar"
        className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: '240px',
          backgroundColor: 'var(--color-surface-base)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 95,
          transition: 'transform var(--transition-normal)',
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-accent-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7 0 8 1.48 3.58-.02 7.2-2.12 9.07C16.2 21.94 13.9 22 12 22s-4.2-.06-6.3-1.93C3.6 18.2 2.1 14.58 3.58 11c.42-1-1.4-7.42 0-8 1.39-.58 4.64.26 6.42 2.26.65-.17 1.33-.26 2-.26z" />
                <circle cx="9" cy="13" r="1" />
                <circle cx="15" cy="13" r="1" />
                <path d="M10 16c.5.5 1.5 1 2 1s1.5-.5 2-1" />
              </svg>
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em' }}>Meow Analytics</span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>Phase 5 Dashboard</span>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            type="button"
            className="btn btn-ghost btn-icon mobile-close-btn"
            onClick={onCloseMobile}
            style={{ display: 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: 'var(--space-3) var(--space-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            overflowY: 'auto',
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleItemClick(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive ? 'var(--color-surface-hover)' : 'transparent',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {isActive && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-accent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>v0.5.0</span>
          <span className="badge badge-accent">Phase 5</span>
        </div>
      </aside>
    </>
  );
};
