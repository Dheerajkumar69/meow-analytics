import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Shield, Server, Check, Key, ExternalLink, HelpCircle, Moon, Sun, Lock } from 'lucide-react';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '880px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>System Configuration & Settings</h1>
        <p style={{ marginTop: 'var(--space-1)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Manage admin credentials, telemetry endpoints, data security posture, and appearance.
        </p>
      </div>

      {/* Admin Auth Settings */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Key size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>Admin Authentication Secret</h3>
          </div>
          <span className="badge badge-accent">Protected Route Auth</span>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: 'var(--space-4)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            The administrative token matching your API server's <code>ADMIN_SECRET</code>. All project creation, domain management, API token issuance, and retention policy alterations require this bearer secret.
          </p>

          <form onSubmit={handleSaveSecret} style={{ display: 'flex', gap: 'var(--space-3)', maxWidth: '540px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', position: 'relative' }}>
              <input
                type="password"
                className="input"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="Enter ADMIN_SECRET"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">
              {savedSecret ? <Check size={16} /> : null}
              <span>{savedSecret ? 'Credentials Saved' : 'Save Secret'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Server & Connectivity Info */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Server size={18} style={{ color: 'var(--color-info)' }} />
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>Telemetry Backend Telemetry</h3>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Connection Status</span>
              <span className={`badge ${apiStatus === 'healthy' ? 'badge-accent' : 'badge-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span className="pulse-dot" style={{ width: '5px', height: '5px', backgroundColor: apiStatus === 'healthy' ? 'var(--color-accent)' : 'var(--color-danger)' }} />
                {apiStatus === 'healthy' ? 'Online & Healthy' : 'Offline / Unreachable'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Health Check URI</span>
              <code className="code-inline">/api/health</code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Readiness Check URI</span>
              <code className="code-inline">/api/ready</code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Collector Ingest Endpoint</span>
              <code className="code-inline">POST /api/v1/event</code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Appearance</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onToggleTheme}
              >
                {theme === 'dark' ? <Sun size={14} style={{ color: 'var(--color-warning)' }} /> : <Moon size={14} style={{ color: 'var(--color-info)' }} />}
                <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Compliance Assurance */}
      <div className="card" style={{ backgroundColor: 'var(--color-surface-subtle)' }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-accent-subtle)',
              border: '1px solid var(--color-accent-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-accent)',
              flexShrink: 0,
            }}
          >
            <Shield size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 var(--space-1) 0' }}>
              Zero-Cookie Privacy Guarantee
            </h4>
            <p style={{ fontSize: '0.8125rem', margin: 0, color: 'var(--color-text-secondary)' }}>
              Meow Analytics does not store persistent cookies or identifiers on visitor browsers. All visitor metrics are computed via daily salted cryptographic hashes that automatically roll over at midnight in the configured project timezone, ensuring full compliance with GDPR, CCPA, and PECR without requiring annoying cookie consent banners.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
