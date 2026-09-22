import React from 'react';
import { Project } from '../lib/api.js';
import { Moon, Sun, ShieldCheck, Plus, Menu } from 'lucide-react';

interface TopNavProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (p: Project) => void;
  onOpenCreateProject: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenAdminSettings: () => void;
  apiStatus: 'healthy' | 'unhealthy' | 'checking';
  onToggleMobileSidebar?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  projects,
  selectedProject,
  onSelectProject,
  onOpenCreateProject,
  theme,
  onToggleTheme,
  onOpenAdminSettings,
  apiStatus,
  onToggleMobileSidebar,
}) => {
  return (
    <header
      style={{
        height: '60px',
        backgroundColor: 'var(--color-surface-base)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-4)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Left: Mobile Drawer Button + Project Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {onToggleMobileSidebar && (
          <button
            id="mobile-menu-toggle-btn"
            type="button"
            className="btn btn-ghost btn-icon mobile-menu-btn"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle navigation menu"
            style={{ display: 'none' }}
          >
            <Menu size={20} />
          </button>
        )}

        <div style={{ position: 'relative' }}>
          <select
            id="project-selector"
            className="select"
            style={{
              paddingRight: 'var(--space-6)',
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: '170px',
              maxWidth: '240px',
              backgroundColor: 'var(--color-surface-subtle)',
              fontSize: '0.8125rem',
            }}
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const found = projects.find((p) => p.id === e.target.value);
              if (found) onSelectProject(found);
            }}
          >
            {projects.length === 0 && <option value="">No projects available</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.site_id})
              </option>
            ))}
          </select>
        </div>

        <button
          id="create-project-btn-nav"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenCreateProject}
          title="Create New Project"
        >
          <Plus size={14} />
          <span className="hide-on-mobile">New Project</span>
        </button>
      </div>

      {/* Right Controls: Health, Admin Auth, Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* API Status Badge */}
        <div
          title={
            apiStatus === 'healthy'
              ? 'API and Database connected'
              : apiStatus === 'unhealthy'
              ? 'Cannot connect to API / Database'
              : 'Checking API status...'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: '0.75rem',
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-surface-subtle)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            className="pulse-dot"
            style={{
              backgroundColor:
                apiStatus === 'healthy'
                  ? 'var(--color-accent)'
                  : apiStatus === 'unhealthy'
                  ? 'var(--color-danger)'
                  : 'var(--color-warning)',
              boxShadow:
                apiStatus === 'healthy'
                  ? '0 0 6px var(--color-accent)'
                  : apiStatus === 'unhealthy'
                  ? '0 0 6px var(--color-danger)'
                  : '0 0 6px var(--color-warning)',
            }}
          />
          <span style={{ color: 'var(--color-text-secondary)' }} className="hide-on-mobile">
            {apiStatus === 'healthy' ? 'API Ready' : apiStatus === 'unhealthy' ? 'API Offline' : 'Connecting'}
          </span>
        </div>

        {/* Admin Secret Config Button */}
        <button
          id="admin-auth-config-btn"
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onOpenAdminSettings}
          title="Admin Authentication Settings"
        >
          <ShieldCheck size={16} />
          <span className="hide-on-mobile">Admin</span>
        </button>

        {/* Theme Toggle */}
        <button
          id="theme-toggle-btn"
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
};
