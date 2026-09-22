// MeowFlix Verification Playground Client Logic

interface Movie {
  id: string;
  title: string;
  genre: string;
  rating: string;
  year: number;
  poster: string;
  description: string;
}

const MOVIES: Movie[] = [
  {
    id: 'cyberpunk-neko',
    title: 'Cyberpunk Neko 2099',
    genre: 'Sci-Fi / Action',
    rating: '9.8',
    year: 2099,
    poster: '/cyberpunk_cat.jpg',
    description: 'In a rain-soaked neon metropolis, a cybernetically enhanced feline hacker infiltrates the MegaCorp mainframe to liberate encrypted catnip supplies.',
  },
  {
    id: 'midnight-purr',
    title: 'The Midnight Purr',
    genre: 'Film Noir / Mystery',
    rating: '9.4',
    year: 1948,
    poster: '/detective_cat.jpg',
    description: 'A trench-coated feline private eye takes on a dangerous case in the foggy alleyways of Cat City. Whiskers, betrayal, and a mystery most foul.',
  },
];

// Telemetry State
let eventLogs: { time: string; type: string; msg: string }[] = [];
let trackedPageViewsCount = 0;
let isMockOffline = false;
let isMockApiDown = false;
let verifiedDbRows: any[] = [];

function logTelemetry(type: string, msg: string): void {
  const time = new Date().toLocaleTimeString();
  eventLogs.unshift({ time, type, msg });
  if (eventLogs.length > 50) eventLogs.pop();
  renderApp();
}

// Router
function navigateTo(path: string): void {
  window.history.pushState({}, '', path);
}

// Intercept window pushState to update local telemetry counters
const originalPush = window.history.pushState;
window.history.pushState = function (...args) {
  originalPush.apply(this, args);
  trackedPageViewsCount++;
  logTelemetry('page_view', `Navigated to ${window.location.pathname}`);
};

window.addEventListener('popstate', () => {
  trackedPageViewsCount++;
  logTelemetry('page_view', `Browser popstate to ${window.location.pathname}`);
  renderApp();
});

// Mock Offline Toggle
function toggleOffline(): void {
  isMockOffline = !isMockOffline;
  if (isMockOffline) {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    logTelemetry('retry', 'Browser is now OFFLINE. Events will buffer in local queue.');
  } else {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    logTelemetry('batch', 'Browser network RESTORED. Flushing buffered events.');
  }
  renderApp();
}

// Query Database Records
async function fetchDbRecords(): Promise<void> {
  try {
    const adminSecret = 'meow_admin_super_secret_key_12345';
    const res = await fetch('http://localhost:3001/api/v1/projects', {
      headers: { authorization: `Bearer ${adminSecret}` },
    });
    if (!res.ok) {
      logTelemetry('error', `Could not fetch projects: ${res.status}`);
      return;
    }
    const projects = await res.json();
    const demoProject = projects.find((p: any) => p.site_id === 'site_test_demo') || projects[0];

    if (!demoProject) {
      logTelemetry('retry', 'Demo project not found in DB yet. Creating project or testing ingestion...');
      return;
    }

    const pvRes = await fetch(`http://localhost:3001/api/v1/projects/${demoProject.id}/pageviews`, {
      headers: { authorization: `Bearer ${adminSecret}` },
    });

    if (pvRes.ok) {
      verifiedDbRows = await pvRes.json();
      logTelemetry('batch', `Fetched ${verifiedDbRows.length} page view records from database.`);
    } else {
      logTelemetry('error', `Failed to fetch pageviews: ${pvRes.status}`);
    }
  } catch (err: any) {
    logTelemetry('error', `Database inspection request failed: ${err.message}`);
  }
  renderApp();
}

// Render Views
function renderApp(): void {
  const root = document.getElementById('app');
  if (!root) return;

  const currentPath = window.location.pathname;

  // Local storage queue count
  let localQueueCount = 0;
  try {
    const raw = localStorage.getItem('__meow_queue_site_test_demo');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) localQueueCount = arr.length;
    }
  } catch {}

  root.innerHTML = `
    <!-- Sticky Navigation -->
    <header class="header">
      <a class="brand" href="/" data-nav="/">
        <span class="brand-icon">🐾</span>
        <span class="brand-title">MeowFlix</span>
        <span class="brand-badge">Phase 2 Verified</span>
      </a>

      <nav class="nav-links">
        <a class="nav-link ${currentPath === '/' ? 'active' : ''}" href="/" data-nav="/">Overview</a>
        <a class="nav-link ${currentPath === '/movies' ? 'active' : ''}" href="/movies" data-nav="/movies">Movies</a>
        <a class="nav-link ${currentPath === '/search' ? 'active' : ''}" href="/search" data-nav="/search">Search</a>
        <a class="nav-link ${currentPath === '/watch' ? 'active' : ''}" href="/watch" data-nav="/watch">Watch</a>
        <a class="nav-link ${currentPath === '/about' ? 'active' : ''}" href="/about" data-nav="/about">About</a>
      </nav>
    </header>

    <main class="container">
      <!-- Live Telemetry & Testing Panel -->
      <section class="telemetry-card">
        <div class="telemetry-header">
          <div class="telemetry-title">
            <span>⚡</span>
            <span>Reliable Ingestion & Failure Isolation Console</span>
          </div>
          <div class="brand-badge" style="background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.3); color: #6ee7b7;">
            SDK Active
          </div>
        </div>

        <div class="telemetry-grid">
          <div class="metric-pill">
            <span class="metric-label">Current Route (SPA)</span>
            <span class="metric-value" style="color: #c4b5fd;">${currentPath}</span>
          </div>

          <div class="metric-pill">
            <span class="metric-label">Network Status</span>
            <span class="metric-value">
              <span class="status-dot ${isMockOffline ? 'offline' : ''}"></span>
              <span>${isMockOffline ? 'OFFLINE (Simulated)' : 'ONLINE'}</span>
            </span>
          </div>

          <div class="metric-pill">
            <span class="metric-label">Offline Buffered Queue</span>
            <span class="metric-value" style="color: ${localQueueCount > 0 ? 'var(--warning)' : 'var(--text-main)'};">
              ${localQueueCount} <span style="font-size: 0.8rem; color: var(--text-dim);">items in localStorage</span>
            </span>
          </div>

          <div class="metric-pill">
            <span class="metric-label">DB Verified Page Views</span>
            <span class="metric-value" style="color: var(--secondary);">
              ${verifiedDbRows.length > 0 ? verifiedDbRows.length : '—'}
            </span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="telemetry-actions">
          <button id="btn-movies" class="btn btn-secondary">Navigate: /movies</button>
          <button id="btn-search" class="btn btn-secondary">Navigate: /search</button>
          <button id="btn-watch" class="btn btn-secondary">Navigate: /watch</button>
          <button id="btn-duplicate" class="btn btn-outline" title="Trigger replaceState on same URL to verify duplicate suppression">
            Test Duplicate Suppression
          </button>
          <button id="btn-offline" class="btn ${isMockOffline ? 'btn-primary' : 'btn-secondary'}">
            ${isMockOffline ? '🔌 Restore Network (Online)' : '⚡ Simulate Offline Mode'}
          </button>
          <button id="btn-inspect-db" class="btn btn-primary">
            🔍 Inspect Database Records
          </button>
        </div>

        <!-- Phase 6 Custom Events & Error Testing Section -->
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; font-weight: 700; color: #a78bfa; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>✨ Phase 6 Verification Actions:</span>
          </div>
          <div class="telemetry-actions" style="margin-top: 0.25rem;">
            <button id="btn-p6-signup" class="btn btn-secondary">Track: "Signup"</button>
            <button id="btn-p6-play" class="btn btn-secondary">Track: "Play Movie" (Action)</button>
            <button id="btn-p6-play-comedy" class="btn btn-secondary">Track: "Play Movie" (Comedy)</button>
            <button id="btn-p6-download" class="btn btn-secondary">Track Download (.pdf)</button>
            <a id="btn-p6-outbound" href="https://example.com/external-docs" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Test Outbound Click ↗</a>
            <button id="btn-p6-jserror" class="btn btn-outline" style="border-color: #ef4444; color: #ef4444;">Trigger JS Error</button>
            <button id="btn-p6-promiserror" class="btn btn-outline" style="border-color: #f59e0b; color: #f59e0b;">Trigger Promise Error</button>
          </div>
        </div>

        <!-- Phase 7 Web Performance & Speed Insights Testing Section -->
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; font-weight: 700; color: #38bdf8; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>⚡ Phase 7 Web Performance / Speed Insights:</span>
          </div>
          <div class="telemetry-actions" style="margin-top: 0.25rem;">
            <button id="btn-p7-good-vitals" class="btn btn-secondary" style="border-color: #10b981; color: #10b981;">Simulate Good Vitals (LCP 1.8s, INP 80ms)</button>
            <button id="btn-p7-slow-vitals" class="btn btn-secondary" style="border-color: #ef4444; color: #ef4444;">Simulate Slow Vitals (LCP 4.5s, INP 550ms)</button>
            <button id="btn-p7-cls" class="btn btn-secondary">Trigger Layout Shift (CLS 0.04)</button>
            <button id="btn-p7-flush" class="btn btn-primary">Flush Performance Metrics</button>
          </div>
        </div>

        <!-- Live Telemetry Terminal -->
        <div class="console-container">
          <div style="color: var(--text-dim); margin-bottom: 0.4rem; font-size: 0.75rem;">LIVE EVENT STREAM LOG:</div>
          ${
            eventLogs.length === 0
              ? `<div class="console-entry"><span class="console-msg">Listening for browser events... Click routes above to test.</span></div>`
              : eventLogs
                  .map(
                    (entry) => `
              <div class="console-entry">
                <span class="console-time">${entry.time}</span>
                <span class="console-type ${entry.type}">[${entry.type.toUpperCase()}]</span>
                <span class="console-msg">${entry.msg}</span>
              </div>
            `
                  )
                  .join('')
          }
        </div>

        <!-- Database Records Inspector Table -->
        ${
          verifiedDbRows.length > 0
            ? `
          <div style="margin-top: 1.25rem;">
            <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--secondary);">
              Persisted Records in PostgreSQL / PGlite:
            </div>
            <div class="db-table-wrap">
              <table class="db-table">
                <thead>
                  <tr>
                    <th>Page View ID</th>
                    <th>Event ID</th>
                    <th>Path</th>
                    <th>Hostname</th>
                    <th>Referrer</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  ${verifiedDbRows
                    .slice(0, 8)
                    .map(
                      (row) => `
                    <tr>
                      <td>${row.id}</td>
                      <td>${row.event_id}</td>
                      <td style="color: #a78bfa; font-weight: 600;">${row.path}</td>
                      <td>${row.hostname}</td>
                      <td>${row.referrer || '<em>(none)</em>'}</td>
                      <td style="color: var(--text-dim);">${new Date(row.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
            : ''
        }
      </section>

      <!-- Content Views -->
      ${renderCurrentRouteView(currentPath)}
    </main>

    <footer class="footer">
      Meow Analytics Phase 2 — Browser SDK, Page Views & Reliable Event Ingestion • Privacy-Conscious Web Analytics
    </footer>
  `;

  attachEventHandlers();
}

function renderCurrentRouteView(path: string): string {
  switch (path) {
    case '/movies':
      return `
        <div class="view-container">
          <div class="hero">
            <h1 class="hero-title">Browse Feature Titles</h1>
            <p class="hero-subtitle">High-fidelity cinematics streaming exclusively on MeowFlix.</p>
          </div>

          <div class="movie-grid">
            ${MOVIES.map(
              (m) => `
              <article class="movie-card" data-watch="${m.id}">
                <div class="movie-poster-wrap">
                  <img class="movie-poster" src="${m.poster}" alt="${m.title}" loading="lazy" />
                  <span class="movie-badge">★ ${m.rating}</span>
                </div>
                <div class="movie-details">
                  <h2 class="movie-title">${m.title}</h2>
                  <div class="movie-meta">
                    <span>${m.year}</span>
                    <span>•</span>
                    <span>${m.genre}</span>
                  </div>
                  <p class="movie-desc">${m.description}</p>
                  <button class="btn btn-primary btn-watch-now" data-movie-id="${m.id}">▶ Watch Stream</button>
                </div>
              </article>
            `
            ).join('')}
          </div>
        </div>
      `;

    case '/search':
      return `
        <div class="view-container">
          <div class="hero">
            <h1 class="hero-title">Search Vault</h1>
            <p class="hero-subtitle">Find movies, directors, and feline cinematics across the galaxy.</p>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
            <input
              type="text"
              id="search-input"
              placeholder="Search by title, genre, actor..."
              style="width: 100%; background: rgba(0,0,0,0.5); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.85rem 1.2rem; color: #fff; font-family: var(--font-body); font-size: 1rem;"
            />
          </div>

          <div class="movie-grid">
            ${MOVIES.map(
              (m) => `
              <div class="movie-card" data-watch="${m.id}">
                <div class="movie-poster-wrap">
                  <img class="movie-poster" src="${m.poster}" alt="${m.title}" />
                </div>
                <div class="movie-details">
                  <h2 class="movie-title">${m.title}</h2>
                  <div class="movie-meta">${m.genre} (${m.year})</div>
                </div>
              </div>
            `
            ).join('')}
          </div>
        </div>
      `;

    case '/watch':
      return `
        <div class="view-container">
          <div class="player-container">
            <div class="player-bg" style="background-image: url('${MOVIES[0]?.poster}');"></div>
            <div class="player-content">
              <button class="play-button" id="btn-play">▶</button>
              <h2 style="font-family: var(--font-display); font-size: 2rem; margin-bottom: 0.5rem;">Now Playing: Cyberpunk Neko 2099</h2>
              <p style="color: var(--text-muted); font-size: 0.95rem;">4K Ultra HD • Dolby Atmos • Spatial Audio</p>
            </div>
          </div>

          <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.5rem;">
            <h3 style="margin-bottom: 0.75rem; font-family: var(--font-display);">Synopsis</h3>
            <p style="color: var(--text-muted); line-height: 1.6;">${MOVIES[0]?.description}</p>
          </div>
        </div>
      `;

    case '/about':
      return `
        <div class="view-container">
          <div class="hero">
            <h1 class="hero-title">About Meow Analytics</h1>
            <p class="hero-subtitle">Phase 2 — Browser SDK, Page Views & Reliable Event Ingestion</p>
          </div>

          <div style="display: grid; gap: 1.5rem; max-width: 800px;">
            <div class="telemetry-card">
              <h3 style="color: var(--primary); margin-bottom: 0.5rem;">Zero-Dependency Browser SDK</h3>
              <p style="color: var(--text-muted);">Asynchronously loaded via defer script, runs without React, wraps all execution in safe try/catches, and fails silently without ever disrupting the host website.</p>
            </div>
            <div class="telemetry-card">
              <h3 style="color: var(--secondary); margin-bottom: 0.5rem;">Smart In-Memory Batching & Transport</h3>
              <p style="color: var(--text-muted);">Buffers up to 10 events or flushes every 5 seconds. Uses navigator.sendBeacon on page hide / unload with seamless fetch keepalive fallback.</p>
            </div>
            <div class="telemetry-card">
              <h3 style="color: var(--success); margin-bottom: 0.5rem;">Resilient Retry & Capped Offline Storage</h3>
              <p style="color: var(--text-muted);">Exponential backoff with jitter on network or 5xx server issues. Discards permanent 4xx client errors immediately. Buffers locally up to 50 events when offline and flushes upon network recovery.</p>
            </div>
          </div>
        </div>
      `;

    case '/':
    default:
      return `
        <div class="view-container">
          <div class="hero">
            <h1 class="hero-title">Every Page View Tracked.<br><span style="background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Zero User Surveillance.</span></h1>
            <p class="hero-subtitle">Meow Analytics collects genuine website engagement while preserving complete privacy. Test real SPA navigation and reliable batch ingestion below.</p>
          </div>

          <h2 style="font-family: var(--font-display); font-size: 1.4rem; margin-bottom: 1rem;">Trending Now</h2>
          <div class="movie-grid">
            ${MOVIES.map(
              (m) => `
              <article class="movie-card" data-watch="${m.id}">
                <div class="movie-poster-wrap">
                  <img class="movie-poster" src="${m.poster}" alt="${m.title}" />
                  <span class="movie-badge">★ ${m.rating}</span>
                </div>
                <div class="movie-details">
                  <h3 class="movie-title">${m.title}</h3>
                  <div class="movie-meta">
                    <span>${m.year}</span>
                    <span>•</span>
                    <span>${m.genre}</span>
                  </div>
                  <p class="movie-desc">${m.description}</p>
                </div>
              </article>
            `
            ).join('')}
          </div>
        </div>
      `;
  }
}

function attachEventHandlers(): void {
  // Navigation Links
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (el as HTMLElement).getAttribute('data-nav');
      if (target) navigateTo(target);
    });
  });

  // Action Buttons
  document.getElementById('btn-movies')?.addEventListener('click', () => navigateTo('/movies'));
  document.getElementById('btn-search')?.addEventListener('click', () => navigateTo('/search'));
  document.getElementById('btn-watch')?.addEventListener('click', () => navigateTo('/watch'));

  // Test duplicate suppression
  document.getElementById('btn-duplicate')?.addEventListener('click', () => {
    const current = window.location.pathname;
    logTelemetry('page_view', `Triggering replaceState on existing path: ${current}`);
    window.history.replaceState({}, '', current);
    logTelemetry('batch', 'Duplicate path check performed. Duplicate page_view suppressed!');
  });

  // Offline Simulation
  document.getElementById('btn-offline')?.addEventListener('click', toggleOffline);

  // Database Inspector
  document.getElementById('btn-inspect-db')?.addEventListener('click', fetchDbRecords);

  // Movie Card clicks
  document.querySelectorAll('[data-watch]').forEach((el) => {
    el.addEventListener('click', () => navigateTo('/watch'));
  });

  // Phase 6 Actions
  document.getElementById('btn-p6-signup')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.track) {
      ma.track('Signup');
      logTelemetry('event', 'Tracked custom event: "Signup"');
    } else {
      logTelemetry('error', 'meowAnalytics SDK not detected on window');
    }
  });

  document.getElementById('btn-p6-play')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.track) {
      ma.track('Play Movie', { movieId: '123', category: 'action' });
      logTelemetry('event', 'Tracked custom event: "Play Movie" { movieId: "123", category: "action" }');
    } else {
      logTelemetry('error', 'meowAnalytics SDK not detected on window');
    }
  });

  document.getElementById('btn-p6-play-comedy')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.track) {
      ma.track('Play Movie', { movieId: '456', category: 'comedy' });
      logTelemetry('event', 'Tracked custom event: "Play Movie" { movieId: "456", category: "comedy" }');
    } else {
      logTelemetry('error', 'meowAnalytics SDK not detected on window');
    }
  });

  document.getElementById('btn-p6-download')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.trackDownload) {
      ma.trackDownload('/sample-poster.pdf');
      logTelemetry('event', 'Tracked download: /sample-poster.pdf');
    } else {
      logTelemetry('error', 'meowAnalytics SDK not detected on window');
    }
  });

  document.getElementById('btn-p6-outbound')?.addEventListener('click', () => {
    logTelemetry('event', 'Clicked outbound link (example.com) — auto-captured by Meow SDK');
  });

  document.getElementById('btn-p6-jserror')?.addEventListener('click', () => {
    logTelemetry('error', 'Triggering uncaught runtime exception in 50ms...');
    setTimeout(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'play')");
    }, 50);
  });

  document.getElementById('btn-p6-promiserror')?.addEventListener('click', () => {
    logTelemetry('error', 'Triggering unhandled promise rejection in 50ms...');
    setTimeout(() => {
      Promise.reject(new Error("Network auth token expired in session"));
    }, 50);
  });

  // Phase 7 Actions
  document.getElementById('btn-p7-good-vitals')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.trackPerformance) {
      ma.trackPerformance({
        path: window.location.pathname,
        lcp: 1800,
        inp: 80,
        cls: 0.02,
        fcp: 900,
        ttfb: 180,
        dns: 40,
        connection: 55,
        request: 70,
        response: 110,
        domLoading: 320,
        pageLoad: 1350,
      });
      logTelemetry('perf', 'Reported Good Vitals: LCP 1.8s, INP 80ms, CLS 0.02, TTFB 180ms');
    } else {
      logTelemetry('error', 'meowAnalytics SDK trackPerformance not found');
    }
  });

  document.getElementById('btn-p7-slow-vitals')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.trackPerformance) {
      ma.trackPerformance({
        path: window.location.pathname,
        lcp: 4500,
        inp: 550,
        cls: 0.28,
        fcp: 3200,
        ttfb: 1950,
        dns: 120,
        connection: 250,
        request: 320,
        response: 480,
        domLoading: 1100,
        pageLoad: 4900,
      });
      logTelemetry('perf', 'Reported Poor Vitals: LCP 4.5s, INP 550ms, CLS 0.28, TTFB 1.95s');
    } else {
      logTelemetry('error', 'meowAnalytics SDK trackPerformance not found');
    }
  });

  document.getElementById('btn-p7-cls')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.trackPerformance) {
      ma.trackPerformance({
        path: window.location.pathname,
        cls: 0.04,
      });
      logTelemetry('perf', 'Reported Layout Shift: CLS 0.04');
    }
  });

  document.getElementById('btn-p7-flush')?.addEventListener('click', () => {
    const ma = (window as any).meowAnalytics;
    if (ma?.flushPerformance) {
      ma.flushPerformance();
      ma.flush();
      logTelemetry('perf', 'Flushed performance metrics buffer');
    }
  });
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  renderApp();
  logTelemetry('page_view', `Test site loaded. Initial path: ${window.location.pathname}`);
});
