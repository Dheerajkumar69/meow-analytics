import React from 'react';
import { Project } from '../lib/api.js';
import { Moon, Sun, ShieldCheck, Plus, Menu, Database, Globe } from 'lucide-react';

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
        height: '64px',
        backgroundColor: 'var(--color-surface-base)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-6)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Left: Mobile Drawer Trigger + Project Selector + New Project */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {onToggleMobileSidebar && (
          <button
            id="mobile-menu-toggle-btn"
            type="button"
            className="btn btn-ghost btn-icon mobile-menu-btn"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Project Selector Wrapper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Globe
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--color-text-muted)',
                pointerEvents: 'none',
              }}
            />
            <select
              id="project-selector"
              className="select"
              style={{
                paddingLeft: '32px',
                paddingRight: 'var(--space-6)',
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: '200px',
                maxWidth: '280px',
                backgroundColor: 'var(--color-surface-subtle)',
                fontSize: '0.8125rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) onSelectProject(found);
              }}
              aria-label="Select active project"
            >
              {projects.length === 0 && <option value="">No projects registered</option>}
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
            title="Create New Analytics Project"
          >
            <Plus size={14} style={{ color: 'var(--color-accent)' }} />
            <span className="hide-on-mobile">New Project</span>
          </button>
        </div>
      </div>

      {/* Right Controls: Health Status, Admin Security, Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2-5)' }}>
        {/* API Telemetry Status Badge */}
        <div
          title={
            apiStatus === 'healthy'
              ? 'Telemetry API & Database Connected'
              : apiStatus === 'unhealthy'
              ? 'Cannot reach API server'
              : 'Verifying API status...'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: '0.75rem',
            fontWeight: 600,
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
            {apiStatus === 'healthy' ? 'API Online' : apiStatus === 'unhealthy' ? 'API Offline' : 'Connecting'}
          </span>
        </div>

        {/* Admin Secret Configuration Button */}
        <button
          id="admin-auth-config-btn"
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onOpenAdminSettings}
          title="Admin Authentication Credentials"
        >
          <ShieldCheck size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <span className="hide-on-mobile">Admin</span>
        </button>

        {/* Theme Mode Toggle */}
        <button
          id="theme-toggle-btn"
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun size={17} style={{ color: 'var(--color-warning)' }} />
          ) : (
            <Moon size={17} style={{ color: 'var(--color-info)' }} />
          )}
        </button>
      </div>
    </header>
  );
};
