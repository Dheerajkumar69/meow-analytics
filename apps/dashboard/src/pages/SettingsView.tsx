import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Shield, Server, Check } from 'lucide-react';

interface SettingsViewProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  apiStatus: 'healthy' | 'unhealthy' | 'checking';
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme,
  onToggleTheme,
  apiStatus,
}) => {
  const [adminSecret, setAdminSecret] = useState(api.getSecret());
  const [savedSecret, setSavedSecret] = useState(false);

  const handleSaveSecret = (e: React.FormEvent) => {
    e.preventDefault();
    api.setSecret(adminSecret.trim());
    setSavedSecret(true);
    setTimeout(() => setSavedSecret(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '800px' }}>
      <div>
        <h2>System Settings</h2>
        <p style={{ marginTop: 'var(--space-1)' }}>
          Configure dashboard preferences, API endpoints, and authentication credentials.
        </p>
      </div>

      {/* Admin Auth Settings */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Shield size={18} color="var(--color-accent)" />
            <h3>Admin Authentication Secret</h3>
          </div>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: 'var(--space-4)', fontSize: '0.8125rem' }}>
            The admin secret configured in your server's <code>.env</code> file (<code>ADMIN_SECRET</code>).
            All project creation and domain modifications require this credential.
          </p>

          <form onSubmit={handleSaveSecret} style={{ display: 'flex', gap: 'var(--space-3)', maxWidth: '520px' }}>
            <input
              type="password"
              className="input"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="Enter ADMIN_SECRET"
              required
            />
            <button type="submit" className="btn btn-primary">
              {savedSecret ? <Check size={16} /> : null}
              {savedSecret ? 'Saved' : 'Update Secret'}
            </button>
          </form>
        </div>
      </div>

      {/* Server & Environment Info */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Server size={18} color="var(--color-info)" />
            <h3>API Connection</h3>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Status:</span>
              <span className={`badge ${apiStatus === 'healthy' ? 'badge-accent' : 'badge-danger'}`}>
                {apiStatus === 'healthy' ? 'Operational' : 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Health Endpoint:</span>
              <code>/api/health</code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Readiness Endpoint:</span>
              <code>/api/ready</code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Active Theme:</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onToggleTheme}
              >
                Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
