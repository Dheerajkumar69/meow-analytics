import React, { useState, useEffect } from 'react';
import { Sidebar, NavItemKey } from './layout/Sidebar.js';
import { TopNav } from './layout/TopNav.js';
import { OverviewView } from './pages/OverviewView.js';
const TrafficView = React.lazy(() => import('./pages/TrafficView.js').then((m) => ({ default: m.TrafficView })));
const AudienceView = React.lazy(() => import('./pages/AudienceView.js').then((m) => ({ default: m.AudienceView })));
const ContentView = React.lazy(() => import('./pages/ContentView.js').then((m) => ({ default: m.ContentView })));
const RealtimeView = React.lazy(() => import('./pages/RealtimeView.js').then((m) => ({ default: m.RealtimeView })));
const ExploreView = React.lazy(() => import('./pages/ExploreView.js').then((m) => ({ default: m.ExploreView })));
const FunnelsView = React.lazy(() => import('./pages/FunnelsView.js').then((m) => ({ default: m.FunnelsView })));
const RetentionView = React.lazy(() => import('./pages/RetentionView.js').then((m) => ({ default: m.RetentionView })));
const ProjectsView = React.lazy(() => import('./pages/ProjectsView.js').then((m) => ({ default: m.ProjectsView })));
const SettingsView = React.lazy(() => import('./pages/SettingsView.js').then((m) => ({ default: m.SettingsView })));
const EventsView = React.lazy(() => import('./pages/EventsView.js').then((m) => ({ default: m.EventsView })));
const ErrorsView = React.lazy(() => import('./pages/ErrorsView.js').then((m) => ({ default: m.ErrorsView })));
const PerformanceView = React.lazy(() => import('./pages/PerformanceView.js').then((m) => ({ default: m.PerformanceView })));
import { Modal } from './components/Modal.js';
import { Project, api } from './lib/api.js';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('meow_theme') as 'dark' | 'light') || 'dark';
  });

  const [activeTab, setActiveTab] = useState<NavItemKey>('overview');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [apiStatus, setApiStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');

  // New project modal state
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectTimezone, setProjectTimezone] = useState('UTC');
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);

  // Admin settings modal state
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState(api.getSecret());

  // Mobile drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Apply theme class/attribute to documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('meow_theme', theme);
  }, [theme]);

  // Initial load & health check
  useEffect(() => {
    checkHealth();
    loadProjects();
  }, []);

  const checkHealth = async () => {
    try {
      const ready = await api.getReady();
      if (ready.status === 'ready' && ready.database === 'connected') {
        setApiStatus('healthy');
      } else {
        setApiStatus('unhealthy');
      }
    } catch {
      setApiStatus('unhealthy');
    }
  };

  const loadProjects = async () => {
    try {
      const list = await api.getProjects();
      setProjects(list);
      if (list.length > 0) {
        setSelectedProject((prev) => (prev ? list.find((p) => p.id === prev.id) || list[0]! : list[0]!));
      }
    } catch (err) {
      console.warn('Could not load projects on startup (API may require admin secret or be starting):', err);
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setCreatingProject(true);
    setCreateProjectError(null);
    try {
      const newProj = await api.createProject({
        name: projectName.trim(),
        timezone: projectTimezone.trim() || 'UTC',
      });
      setProjectName('');
      setIsCreateProjectOpen(false);
      await loadProjects();
      setSelectedProject(newProj);
      setActiveTab('projects');
    } catch (err: any) {
      setCreateProjectError(err.message || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSaveAdminSecret = (e: React.FormEvent) => {
    e.preventDefault();
    api.setSecret(adminSecretInput.trim());
    setIsAdminModalOpen(false);
    checkHealth();
    loadProjects();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--color-bg)' }}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: '100vh' }}>
        <TopNav
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          onOpenCreateProject={() => setIsCreateProjectOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenAdminSettings={() => setIsAdminModalOpen(true)}
          apiStatus={apiStatus}
          onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        />

        <main style={{ flex: 1, padding: 'var(--space-6)', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
            <React.Suspense fallback={<div className="skeleton skeleton-card" style={{ height: 320, margin: 'var(--space-4) 0' }} />}>
              {activeTab === 'overview' ? (
                <OverviewView project={selectedProject} />
              ) : activeTab === 'realtime' ? (
                <RealtimeView project={selectedProject} />
              ) : activeTab === 'traffic' || activeTab === 'sources' || activeTab === 'visitors' ? (
                <TrafficView project={selectedProject} />
              ) : activeTab === 'audience' || activeTab === 'geography' || activeTab === 'devices' ? (
                <AudienceView project={selectedProject} />
              ) : activeTab === 'content' || activeTab === 'pages' ? (
                <ContentView project={selectedProject} />
              ) : activeTab === 'events' ? (
                <EventsView project={selectedProject} />
              ) : activeTab === 'funnels' ? (
                <FunnelsView project={selectedProject} />
              ) : activeTab === 'retention' ? (
                <RetentionView project={selectedProject} />
              ) : activeTab === 'performance' ? (
                <PerformanceView project={selectedProject} />
              ) : activeTab === 'errors' ? (
                <ErrorsView project={selectedProject} />
              ) : activeTab === 'explore' ? (
                <ExploreView project={selectedProject} />
              ) : activeTab === 'projects' ? (
                <ProjectsView
                  projects={projects}
                  selectedProject={selectedProject}
                  onRefreshProjects={loadProjects}
                  onSelectProject={setSelectedProject}
                  onOpenCreateProject={() => setIsCreateProjectOpen(true)}
                  onNavigateToTab={(tab) => setActiveTab(tab as any)}
                />
              ) : activeTab === 'settings' ? (
                <SettingsView
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                  apiStatus={apiStatus}
                />
              ) : (
                <OverviewView project={selectedProject} />
              )}
            </React.Suspense>
          </div>
        </main>
      </div>

      {/* Modal: Create Project */}
      <Modal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        title="Register New Analytics Project"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsCreateProjectOpen(false)}
            >
              Cancel
            </button>
            <button
              id="submit-create-project-btn"
              type="submit"
              form="create-project-form"
              className="btn btn-primary"
              disabled={creatingProject || !projectName.trim()}
            >
              {creatingProject ? 'Registering...' : 'Register Project'}
            </button>
          </>
        }
      >
        <form
          id="create-project-form"
          onSubmit={handleCreateProject}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          {createProjectError && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-danger-subtle)',
                color: 'var(--color-danger-text)',
                border: '1px solid var(--color-danger-border)',
                fontSize: '0.8125rem',
              }}
            >
              {createProjectError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="new-project-name-input">
              Project Name
            </label>
            <input
              id="new-project-name-input"
              type="text"
              className="input"
              placeholder="e.g. My SaaS or Production App"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="new-project-timezone-input">
              Timezone (IANA)
            </label>
            <input
              id="new-project-timezone-input"
              type="text"
              className="input"
              placeholder="e.g. UTC, America/New_York, Asia/Kolkata"
              value={projectTimezone}
              onChange={(e) => setProjectTimezone(e.target.value)}
              required
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Determines daily midnight cutoffs for aggregate metrics.
            </span>
          </div>
        </form>
      </Modal>

      {/* Modal: Admin Auth Settings */}
      <Modal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        title="Admin Authentication Credentials"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsAdminModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-secret-form"
              className="btn btn-primary"
            >
              Save Credentials
            </button>
          </>
        }
      >
        <form
          id="admin-secret-form"
          onSubmit={handleSaveAdminSecret}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Provide the <code>ADMIN_SECRET</code> matching your API server configuration to manage projects, domain verification, and API tokens.
          </p>
          <div className="form-group">
            <label className="form-label">
              Admin Secret Key
            </label>
            <input
              type="password"
              className="input"
              value={adminSecretInput}
              onChange={(e) => setAdminSecretInput(e.target.value)}
              placeholder="Enter ADMIN_SECRET"
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
