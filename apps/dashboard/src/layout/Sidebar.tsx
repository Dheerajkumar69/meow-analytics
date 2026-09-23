import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  Users,
  Compass,
  Zap,
  Gauge,
  AlertTriangle,
  FolderKanban,
  Settings,
  X,
  LucideIcon,
  Radio,
  GitMerge,
  Repeat,
  Shield,
  Sparkles,
} from 'lucide-react';

export type NavItemKey =
  | 'overview'
  | 'realtime'
  | 'traffic'
  | 'audience'
  | 'content'
  | 'events'
  | 'funnels'
  | 'retention'
  | 'performance'
  | 'errors'
  | 'explore'
  | 'pages'
  | 'visitors'
  | 'sources'
  | 'geography'
  | 'devices'
  | 'projects'
  | 'settings';

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const navSections: {
  title?: string;
  items: { key: NavItemKey; label: string; icon: LucideIcon; badge?: string; badgeVariant?: 'live' | 'accent' | 'neutral' }[];
}[] = [
  {
    title: 'Analytics',
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'realtime', label: 'Realtime', icon: Radio, badge: 'LIVE', badgeVariant: 'live' },
      { key: 'traffic', label: 'Traffic & Sources', icon: TrendingUp },
      { key: 'audience', label: 'Audience & Geo', icon: Users },
      { key: 'content', label: 'Content & Pages', icon: FileText },
      { key: 'events', label: 'Custom Events', icon: Zap },
    ],
  },
  {
    title: 'Behavior & Funnels',
    items: [
      { key: 'funnels', label: 'Funnels', icon: GitMerge },
      { key: 'retention', label: 'Cohort Retention', icon: Repeat },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      { key: 'performance', label: 'Web Vitals', icon: Gauge },
      { key: 'errors', label: 'Error Tracking', icon: AlertTriangle },
      { key: 'explore', label: 'Query Explorer', icon: Compass },
    ],
  },
  {
    title: 'Management',
    items: [
      { key: 'projects', label: 'Projects & Keys', icon: FolderKanban },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
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
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(9, 13, 22, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 90,
          }}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: '256px',
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
        {/* Brand Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)',
            minHeight: '64px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-accent-subtle)',
                border: '1px solid var(--color-accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
                boxShadow: '0 0 12px rgba(16, 185, 129, 0.15)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7 0 8 1.48 3.58-.02 7.2-2.12 9.07C16.2 21.94 13.9 22 12 22s-4.2-.06-6.3-1.93C3.6 18.2 2.1 14.58 3.58 11c.42-1-1.4-7.42 0-8 1.39-.58 4.64.26 6.42 2.26.65-.17 1.33-.26 2-.26z" />
                <circle cx="9" cy="13" r="1.2" />
                <circle cx="15" cy="13" r="1.2" />
                <path d="M10 16c.5.5 1.5 1 2 1s1.5-.5 2-1" />
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.025em', color: 'var(--color-text-primary)' }}>
                  Meow
                </span>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '1px 5px', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)', border: '1px solid var(--color-accent-border)' }}>
                  PRO
                </span>
              </div>
              <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--color-text-muted)', lineHeight: 1.2 }}>
                Telemetry Instrument
              </span>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            type="button"
            className="btn btn-ghost btn-icon mobile-close-btn"
            onClick={onCloseMobile}
            aria-label="Close navigation sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Sections */}
        <nav
          style={{
            flex: 1,
            padding: 'var(--space-3) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            overflowY: 'auto',
          }}
          aria-label="Sidebar Navigation"
        >
          {navSections.map((sec, secIdx) => (
            <div key={secIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {sec.title && (
                <span
                  style={{
                    padding: 'var(--space-1) var(--space-2-5)',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {sec.title}
                </span>
              )}
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeTab === item.key ||
                  (item.key === 'traffic' && (activeTab === 'sources' || activeTab === 'visitors')) ||
                  (item.key === 'audience' && (activeTab === 'geography' || activeTab === 'devices')) ||
                  (item.key === 'content' && activeTab === 'pages');

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleItemClick(item.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: '0.4375rem var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isActive ? 'var(--color-surface-hover)' : 'transparent',
                      color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '0.8125rem',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--color-border-hover)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all var(--transition-fast)',
                      position: 'relative',
                    }}
                  >
                    <Icon
                      size={16}
                      style={{
                        color: isActive ? 'var(--color-accent)' : 'inherit',
                        flexShrink: 0,
                        transition: 'color var(--transition-fast)',
                      }}
                    />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>

                    {item.badge && (
                      <span
                        className={item.badgeVariant === 'live' ? 'badge badge-accent' : 'badge badge-neutral'}
                        style={{
                          fontSize: '0.625rem',
                          padding: '1px 6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {item.badgeVariant === 'live' && <span className="pulse-dot" style={{ width: '5px', height: '5px' }} />}
                        {item.badge}
                      </span>
                    )}

                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '-2px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '3px',
                          height: '16px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--color-accent)',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer Info & Privacy Indicator */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            backgroundColor: 'var(--color-surface-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Shield size={13} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontWeight: 600 }}>Cookie-Free</span>
            </span>
            <span className="badge badge-accent" style={{ fontSize: '0.625rem', textTransform: 'none' }}>
              v1.0.0
            </span>
          </div>
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
            100% GDPR / CCPA Compliant
          </span>
        </div>
      </aside>
    </>
  );
};
