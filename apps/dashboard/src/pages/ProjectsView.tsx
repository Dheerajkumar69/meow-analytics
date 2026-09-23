import React, { useState, useEffect } from 'react';
import { Project, ProjectDomain, ApiKey, ApiKeyCreatedResponse, api } from '../lib/api.js';
import { Modal } from '../components/Modal.js';
import { EmptyAnalytics } from '../components/EmptyAnalytics.js';
import {
  Plus,
  Trash2,
  Key,
  Globe,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Clock,
  ShieldAlert,
  Info,
  Download,
  ShieldCheck,
  Database,
  Calendar,
  ArrowLeft,
  Search,
  BarChart3,
  FolderKanban,
} from 'lucide-react';

interface ProjectsViewProps {
  projects: Project[];
  selectedProject: Project | null;
  onRefreshProjects: () => void;
  onSelectProject: (p: Project) => void;
  onOpenCreateProject?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  selectedProject,
  onRefreshProjects,
  onSelectProject,
  onOpenCreateProject,
  onNavigateToTab,
}) => {
  const [viewMode, setViewMode] = useState<'directory' | 'details'>(
    selectedProject ? 'details' : 'directory'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'domains' | 'keys' | 'settings'>('domains');
  const [domains, setDomains] = useState<ProjectDomain[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [domainSubmitting, setDomainSubmitting] = useState(false);

  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [keySubmitting, setKeySubmitting] = useState(false);

  // Single-time visible key banner modal
  const [createdKeyData, setCreatedKeyData] = useState<ApiKeyCreatedResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSiteId, setCopiedSiteId] = useState(false);

  // Project Settings & Governance form state
  const [editName, setEditName] = useState('');
  const [editTimezone, setEditTimezone] = useState('');
  const [editPrivacyMode, setEditPrivacyMode] = useState<'strict' | 'balanced' | 'detailed'>('balanced');
  const [editVisitorRetention, setEditVisitorRetention] = useState<number>(24);
  const [editEventRetention, setEditEventRetention] = useState<number>(90);
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Deletion modal state
  const [isDeleteRangeOpen, setIsDeleteRangeOpen] = useState(false);
  const [deleteFrom, setDeleteFrom] = useState('');
  const [deleteTo, setDeleteTo] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (selectedProject) {
      setEditName(selectedProject.name);
      setEditTimezone(selectedProject.timezone);
      setEditPrivacyMode(selectedProject.privacy_mode || 'balanced');
      setEditVisitorRetention(selectedProject.visitor_retention_hours ?? 24);
      setEditEventRetention(selectedProject.event_retention_days ?? 90);
      loadProjectDetails(selectedProject.id);
    }
  }, [selectedProject]);


  const loadProjectDetails = async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [domainsList, keysList] = await Promise.all([
        api.getDomains(projectId),
        api.getKeys(projectId),
      ]);
      setDomains(domainsList);
      setKeys(keysList);
    } catch (err: any) {
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newDomain.trim()) return;

    setDomainSubmitting(true);
    setError(null);
    try {
      await api.createDomain(selectedProject.id, newDomain.trim());
      setNewDomain('');
      setIsAddDomainOpen(false);
      await loadProjectDetails(selectedProject.id);
    } catch (err: any) {
      setError(err.message || 'Failed to add domain');
    } finally {
      setDomainSubmitting(false);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (!selectedProject) return;
    if (!confirm('Are you sure you want to delete this domain?')) return;

    try {
      await api.deleteDomain(selectedProject.id, domainId);
      await loadProjectDetails(selectedProject.id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete domain');
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newKeyName.trim()) return;

    setKeySubmitting(true);
    setError(null);
    try {
      const res = await api.createKey(selectedProject.id, newKeyName.trim());
      setNewKeyName('');
      setIsCreateKeyOpen(false);
      setCreatedKeyData(res);
      await loadProjectDetails(selectedProject.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create API key');
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!selectedProject) return;
    if (!confirm('Are you sure you want to revoke this API key? Requests using it will fail.')) return;

    try {
      await api.deleteKey(selectedProject.id, keyId);
      await loadProjectDetails(selectedProject.id);
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    setSettingsSubmitting(true);
    setError(null);
    try {
      const updated = await api.updateProject(selectedProject.id, {
        name: editName.trim(),
        timezone: editTimezone.trim(),
        privacy_mode: editPrivacyMode,
        visitor_retention_hours: editVisitorRetention,
        event_retention_days: editEventRetention,
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 2500);
      onRefreshProjects();
      onSelectProject(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update project settings');
    } finally {
      setSettingsSubmitting(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!selectedProject) return;
    setExportLoading(true);
    try {
      const data = await api.exportData(selectedProject.id, { format });
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meow-export-${selectedProject.site_id}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !deleteFrom || !deleteTo) return;
    if (!confirm(`Permanently delete all data between ${deleteFrom} and ${deleteTo}? This cannot be undone.`)) {
      return;
    }
    setDeleteSubmitting(true);
    setError(null);
    try {
      const res = await api.deleteDateRange(
        selectedProject.id,
        new Date(deleteFrom).toISOString(),
        new Date(deleteTo).toISOString()
      );
      alert(res.message || 'Data deleted');
      setIsDeleteRangeOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete data range');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleDeleteVisitors = async () => {
    if (!selectedProject) return;
    if (!confirm(`Permanently delete visitor identity records older than ${editVisitorRetention} hours for this project?`)) {
      return;
    }
    try {
      const res = await api.deleteVisitorData(selectedProject.id, { olderThanHours: editVisitorRetention });
      alert(res.message || 'Visitor data purged');
    } catch (err: any) {
      setError(err.message || 'Failed to purge visitor data');
    }
  };


  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!confirm(`Are you sure you want to delete project "${selectedProject.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteProject(selectedProject.id);
      onRefreshProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    }
  };

  const copyToClipboard = (text: string, setCopiedFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedFn(true);
    setTimeout(() => setCopiedFn(false), 2000);
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.site_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.timezone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (viewMode === 'directory' || !selectedProject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '1200px' }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-subtle)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                }}
              >
                <FolderKanban size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                  Projects & Applications
                </h1>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0 0' }}>
                  Manage connected websites, telemetry domain whitelists, API keys, and privacy retention rules.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRefreshProjects}
              title="Refresh project list"
            >
              Refresh
            </button>
            {onOpenCreateProject && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenCreateProject}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}
              >
                <Plus size={15} />
                <span>Register Project</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Statistics Filter Bar */}
        <div className="card" style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: '240px' }}>
              <Search size={16} color="var(--color-text-muted)" />
              <input
                type="text"
                className="input"
                style={{ border: 'none', background: 'transparent', padding: 'var(--space-1) 0', width: '100%' }}
                placeholder="Search projects by name, site ID, or timezone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSearchQuery('')}
                  style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                >
                  Clear
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              <span>Total: <strong style={{ color: 'var(--color-text-primary)' }}>{projects.length}</strong></span>
              <span>•</span>
              <span>Active: <strong style={{ color: 'var(--color-accent)' }}>{projects.filter((p) => p.status === 'active').length}</strong></span>
            </div>
          </div>
        </div>

        {/* Project Cards Grid */}
        {filteredProjects.length === 0 ? (
          projects.length === 0 ? (
            <EmptyAnalytics
              title="No Projects Configured"
              description="Register your first website or application to start collecting privacy-friendly web analytics."
              project={null}
            />
          ) : (
            <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
              <p style={{ color: 'var(--color-text-secondary)' }}>No projects matching "{searchQuery}"</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => setSearchQuery('')}
              >
                Reset Search
              </button>
            </div>
          )
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 'var(--space-4)' }}>
            {filteredProjects.map((p) => {
              const isSelected = selectedProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  className="card card-hover"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                    backgroundColor: isSelected ? 'var(--color-surface-subtle)' : 'var(--color-surface-base)',
                  }}
                >
                  <div className="card-body" style={{ padding: 'var(--space-5)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
                            {p.name}
                          </h3>
                          {isSelected && (
                            <span className="badge badge-accent" style={{ fontSize: '0.6875rem' }}>Current</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Site ID:</span>
                          <code style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-subtle)', padding: '1px 6px', borderRadius: 'var(--radius-xs)' }}>
                            {p.site_id}
                          </code>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            style={{ padding: '2px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(p.site_id, setCopiedSiteId);
                            }}
                            title="Copy Site ID"
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </div>
                      <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>
                        {p.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-4)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-3)' }}>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)' }}>Timezone:</span>{' '}
                        <span>{p.timezone}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)' }}>Privacy:</span>{' '}
                        <span style={{ textTransform: 'capitalize' }}>{p.privacy_mode || 'balanced'}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)' }}>Retention:</span>{' '}
                        <span>{p.event_retention_days ?? 90} days</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)' }}>Created:</span>{' '}
                        <span>{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 'var(--space-3) var(--space-5)',
                      backgroundColor: 'var(--color-surface-subtle)',
                      borderTop: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => {
                        onSelectProject(p);
                        setViewMode('details');
                      }}
                    >
                      <Key size={13} />
                      <span>Keys & Config</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => {
                        onSelectProject(p);
                        if (onNavigateToTab) {
                          onNavigateToTab('overview');
                        }
                      }}
                    >
                      <BarChart3 size={13} />
                      <span>View Live UI</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '1000px' }}>
      {/* Return to Directory & Switcher Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setViewMode('directory')}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <ArrowLeft size={14} />
          <span>All Projects Directory ({projects.length})</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            Switch Project:
          </label>
          <select
            className="select"
            style={{ padding: 'var(--space-1) var(--space-3)', height: '32px', fontSize: '0.8125rem' }}
            value={selectedProject.id}
            onChange={(e) => {
              const found = projects.find((p) => p.id === e.target.value);
              if (found) onSelectProject(found);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.site_id})
              </option>
            ))}
          </select>
          {onNavigateToTab && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onNavigateToTab('overview')}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}
            >
              <BarChart3 size={14} />
              <span>Open Analytics</span>
            </button>
          )}
        </div>
      </div>

      {/* Project Header Card */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h2>{selectedProject.name}</h2>
              <span className="badge badge-accent">{selectedProject.status}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-2)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <span>Site ID:</span>
                <code style={{ color: 'var(--color-text-primary)' }}>{selectedProject.site_id}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  style={{ padding: '2px' }}
                  onClick={() => copyToClipboard(selectedProject.site_id, setCopiedSiteId)}
                  title="Copy Site ID"
                >
                  {copiedSiteId ? <Check size={14} color="var(--color-accent)" /> : <Copy size={14} />}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <Clock size={14} />
                <span>{selectedProject.timezone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)', padding: '0 var(--space-6)' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: 0,
              borderBottom: activeTab === 'domains' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: activeTab === 'domains' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'domains' ? 600 : 400,
            }}
            onClick={() => setActiveTab('domains')}
          >
            <Globe size={16} />
            <span>Domains ({domains.length})</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: 0,
              borderBottom: activeTab === 'keys' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: activeTab === 'keys' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'keys' ? 600 : 400,
            }}
            onClick={() => setActiveTab('keys')}
          >
            <Key size={16} />
            <span>API Keys ({keys.length})</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: 0,
              borderBottom: activeTab === 'settings' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: activeTab === 'settings' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === 'settings' ? 600 : 400,
            }}
            onClick={() => setActiveTab('settings')}
          >
            <span>Project Settings</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger-text)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.875rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tab 1: Domains */}
      {activeTab === 'domains' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Allowed Domains</h3>
              <p style={{ fontSize: '0.8125rem' }}>
                Only events originating from these configured hostnames will be accepted by the collector.
              </p>
            </div>
            <button
              id="add-domain-btn"
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsAddDomainOpen(true)}
            >
              <Plus size={14} />
              <span>Add Domain</span>
            </button>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {domains.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                <Globe size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }} />
                <p>No domains configured yet. Add your website's domain to enable analytics.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Status</th>
                      <th>Added On</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((dom) => (
                      <tr key={dom.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <Globe size={14} color="var(--color-text-muted)" />
                            <strong>{dom.domain}</strong>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${dom.verified ? 'badge-accent' : 'badge-muted'}`}>
                            {dom.verified ? 'Verified' : 'Active'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                          {new Date(dom.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => handleDeleteDomain(dom.id)}
                            title="Remove Domain"
                          >
                            <Trash2 size={14} color="var(--color-danger)" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: API Keys */}
      {activeTab === 'keys' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>API Keys</h3>
              <p style={{ fontSize: '0.8125rem' }}>
                Secret keys for programmatic ingestion and server-side tracking. Secret keys are never stored in plaintext.
              </p>
            </div>
            <button
              id="generate-key-btn"
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setIsCreateKeyOpen(true)}
            >
              <Plus size={14} />
              <span>Generate API Key</span>
            </button>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {keys.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                <Key size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }} />
                <p>No API keys generated yet.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Key Name</th>
                      <th>Prefix</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => {
                      const isRevoked = !!k.revoked_at;
                      return (
                        <tr key={k.id}>
                          <td>
                            <strong style={{ color: isRevoked ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                              {k.name}
                            </strong>
                          </td>
                          <td>
                            <code style={{ color: 'var(--color-text-secondary)' }}>{k.key_prefix}••••••••</code>
                          </td>
                          <td>
                            <span className={`badge ${isRevoked ? 'badge-danger' : 'badge-accent'}`}>
                              {isRevoked ? 'Revoked' : 'Active'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                            {new Date(k.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {!isRevoked && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleRevokeKey(k.id)}
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Settings & Data Governance */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* General & Privacy Settings */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <ShieldCheck size={18} color="var(--color-accent)" />
                <h3>Privacy Mode & Configuration</h3>
              </div>
            </div>
            <div className="card-body">
              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '640px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Project Name
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Timezone (IANA)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    placeholder="e.g. UTC, Asia/Kolkata, America/New_York"
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', display: 'block' }}>
                    Used for date binning and daily traffic resets.
                  </span>
                </div>

                {/* Privacy Mode Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                    Privacy Mode
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                    <div
                      style={{
                        border: editPrivacyMode === 'strict' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        cursor: 'pointer',
                        backgroundColor: editPrivacyMode === 'strict' ? 'var(--color-accent-subtle)' : 'transparent',
                      }}
                      onClick={() => setEditPrivacyMode('strict')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong>Strict</strong>
                        {editPrivacyMode === 'strict' && <Check size={14} color="var(--color-accent)" />}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                        No persistent cookies. Short retention. Country-only geo. Generalized user-agent.
                      </p>
                    </div>

                    <div
                      style={{
                        border: editPrivacyMode === 'balanced' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        cursor: 'pointer',
                        backgroundColor: editPrivacyMode === 'balanced' ? 'var(--color-accent-subtle)' : 'transparent',
                      }}
                      onClick={() => setEditPrivacyMode('balanced')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong>Balanced (Default)</strong>
                        {editPrivacyMode === 'balanced' && <Check size={14} color="var(--color-accent)" />}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                        First-party anonymous UUID. Country, device, browser, OS. Clean referrers & UTMs.
                      </p>
                    </div>

                    <div
                      style={{
                        border: editPrivacyMode === 'detailed' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        cursor: 'pointer',
                        backgroundColor: editPrivacyMode === 'detailed' ? 'var(--color-accent-subtle)' : 'transparent',
                      }}
                      onClick={() => setEditPrivacyMode('detailed')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong>Detailed</strong>
                        {editPrivacyMode === 'detailed' && <Check size={14} color="var(--color-accent)" />}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                        Full analytics metadata: region geo, sanitized custom properties, Web Vitals.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Retention Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Visitor Identity Retention (Hours)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8760}
                      className="input"
                      value={editVisitorRetention}
                      onChange={(e) => setEditVisitorRetention(parseInt(e.target.value, 10) || 24)}
                      required
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', display: 'block' }}>
                      Default: 24 hours for privacy-sensitive server-derived identity.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Raw Event Retention
                    </label>
                    <select
                      className="input"
                      value={editEventRetention}
                      onChange={(e) => setEditEventRetention(parseInt(e.target.value, 10))}
                    >
                      <option value={7}>7 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={90}>90 Days (Recommended)</option>
                      <option value={180}>180 Days</option>
                      <option value={365}>365 Days (1 Year)</option>
                    </select>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', display: 'block' }}>
                      Historical statistics survive via hourly & daily aggregates.
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={settingsSubmitting}
                  >
                    {settingsSubmitting ? 'Saving...' : 'Save Settings'}
                  </button>
                  {settingsSuccess && (
                    <span style={{ color: 'var(--color-accent)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                      <Check size={16} /> Saved successfully
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Data Export Card */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Download size={18} color="var(--color-info)" />
                <h3>Data Export</h3>
              </div>
            </div>
            <div className="card-body">
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                Download your project's analytics dataset. Raw IP addresses are never exported or stored.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleExport('csv')}
                  disabled={exportLoading}
                >
                  <Download size={14} />
                  <span>Download CSV</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleExport('json')}
                  disabled={exportLoading}
                >
                  <Download size={14} />
                  <span>Download JSON</span>
                </button>
              </div>
            </div>
          </div>

          {/* Data Governance & Deletion Card */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Database size={18} color="var(--color-danger)" />
                <h3 style={{ color: 'var(--color-danger)' }}>Data Deletion & Governance</h3>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <h4 style={{ fontSize: '0.875rem' }}>Delete Specific Date Range</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
                    Permanently wipe events, page views, and sessions within a designated time window.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsDeleteRangeOpen(true)}
                  >
                    <Calendar size={14} />
                    <span>Select Date Range to Delete</span>
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
                  <h4 style={{ fontSize: '0.875rem' }}>Purge Expired Visitor Data</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
                    Instantly purge all visitor identity records older than {editVisitorRetention} hours.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleDeleteVisitors}
                  >
                    Purge Visitor Data Now
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
                  <h4 style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>Permanent Project Hard Delete</h4>
                  <p style={{ fontSize: '0.8125rem', marginTop: 'var(--space-1)', marginBottom: 'var(--space-2)', color: 'var(--color-text-secondary)' }}>
                    Physically deletes this project and cascade-removes all events, visitors, sessions, performance metrics, and API keys.
                  </p>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleDeleteProject}
                  >
                    <Trash2 size={14} />
                    <span>Delete Entire Project</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Modal: Add Domain */}
      <Modal
        isOpen={isAddDomainOpen}
        onClose={() => setIsAddDomainOpen(false)}
        title="Add Domain"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setIsAddDomainOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="add-domain-form"
              className="btn btn-primary"
              disabled={domainSubmitting || !newDomain.trim()}
            >
              {domainSubmitting ? 'Adding...' : 'Add Domain'}
            </button>
          </>
        }
      >
        <form id="add-domain-form" onSubmit={handleAddDomain} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '0.8125rem' }}>
            Enter your website hostname. URLs with <code>https://</code> or paths will be automatically normalized.
          </p>
          <input
            type="text"
            className="input"
            placeholder="e.g. example.com or app.mywebsite.org"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            autoFocus
            required
          />
        </form>
      </Modal>

      {/* Modal: Create API Key */}
      <Modal
        isOpen={isCreateKeyOpen}
        onClose={() => setIsCreateKeyOpen(false)}
        title="Generate API Key"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setIsCreateKeyOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="create-key-form"
              className="btn btn-primary"
              disabled={keySubmitting || !newKeyName.trim()}
            >
              {keySubmitting ? 'Generating...' : 'Generate Key'}
            </button>
          </>
        }
      >
        <form id="create-key-form" onSubmit={handleCreateKey} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '0.8125rem' }}>
            Assign a descriptive name to help you identify this key's purpose later.
          </p>
          <input
            type="text"
            className="input"
            placeholder="e.g. Production Collector Key"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            autoFocus
            required
          />
        </form>
      </Modal>

      {/* Modal: Single-Time Key Display */}
      {createdKeyData && (
        <Modal
          isOpen={true}
          onClose={() => setCreatedKeyData(null)}
          title="API Key Created"
          footer={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreatedKeyData(null)}
            >
              I Have Saved This Key
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-warning-subtle)',
                color: 'var(--color-warning-text)',
                fontSize: '0.8125rem',
              }}
            >
              <ShieldAlert size={18} />
              <span>
                <strong>Save this secret key now.</strong> For security, it will never be displayed again.
              </span>
            </div>

            <div style={{ marginTop: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                SECRET API KEY
              </span>
              <div
                style={{
                  marginTop: 'var(--space-1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <input
                  type="text"
                  readOnly
                  className="input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                  value={createdKeyData.key}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => copyToClipboard(createdKeyData.key, setCopiedKey)}
                  title="Copy Key"
                >
                  {copiedKey ? <Check size={16} color="var(--color-accent)" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Delete Date Range */}
      <Modal
        isOpen={isDeleteRangeOpen}
        onClose={() => setIsDeleteRangeOpen(false)}
        title="Delete Data Range"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setIsDeleteRangeOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="delete-range-form"
              className="btn btn-danger"
              disabled={deleteSubmitting || !deleteFrom || !deleteTo}
            >
              {deleteSubmitting ? 'Deleting...' : 'Delete Range Data'}
            </button>
          </>
        }
      >
        <form id="delete-range-form" onSubmit={handleDeleteRange} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-danger)' }}>
            <strong>Warning:</strong> All events, page views, and sessions occurring between the selected start and end times will be permanently erased.
          </p>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              From Date & Time
            </label>
            <input
              type="datetime-local"
              className="input"
              value={deleteFrom}
              onChange={(e) => setDeleteFrom(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              To Date & Time
            </label>
            <input
              type="datetime-local"
              className="input"
              value={deleteTo}
              onChange={(e) => setDeleteTo(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};

