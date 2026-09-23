import React, { useState } from 'react';
import { Project } from '../lib/api.js';
import { Copy, Check, Radio, Terminal, Code2, Server, ExternalLink, RefreshCw } from 'lucide-react';

interface EmptyAnalyticsProps {
  title: string;
  description?: string;
  project: Project | null;
  onRefresh?: () => void;
}

export const EmptyAnalytics: React.FC<EmptyAnalyticsProps> = ({
  title,
  description,
  project,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'html' | 'react' | 'node'>('html');
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  const siteId = project?.site_id || 'site_your_project_id';
  const apiOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://analytics.example.com';

  const htmlSnippet = `<script
  defer
  src="${apiOrigin}/meow.js"
  data-site-id="${siteId}">
</script>`;

  const reactSnippet = `// In your Next.js layout.tsx or App root:
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          defer
          src="${apiOrigin}/meow.js"
          data-site-id="${siteId}"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`;

  const nodeSnippet = `// Using @meow-analytics/sdk (Node.js / Express):
import { MeowAnalytics } from '@meow-analytics/sdk';

const meow = new MeowAnalytics({
  siteId: '${siteId}',
  apiUrl: '${apiOrigin}',
});

// Track pageviews or backend events:
await meow.trackEvent('checkout_completed', {
  amount: 49.99,
  currency: 'USD'
});`;

  const getActiveCode = () => {
    switch (activeTab) {
      case 'html': return htmlSnippet;
      case 'react': return reactSnippet;
      case 'node': return nodeSnippet;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckEvents = async () => {
    if (onRefresh) {
      setChecking(true);
      await onRefresh();
      setTimeout(() => setChecking(false), 800);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '860px', margin: '0 auto', width: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: 'var(--space-2)' }}>{title}</h2>
        {description && <p style={{ maxWidth: '580px', margin: '0 auto', fontSize: '0.9375rem' }}>{description}</p>}
      </div>

      <div
        className="card"
        style={{
          padding: 'var(--space-8) var(--space-6)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-5)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-accent-subtle)',
            border: '1px solid var(--color-accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-accent)',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
          }}
        >
          <Radio size={28} className="pulse-dot" style={{ width: '28px', height: '28px', backgroundColor: 'transparent', boxShadow: 'none' }} />
        </div>

        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>
            Awaiting Ingested Telemetry
          </h3>
          <p style={{ maxWidth: '560px', margin: '0 auto', fontSize: '0.875rem' }}>
            No visitor visits or events have been captured yet for <strong>{project?.name || 'this project'}</strong>. Add the lightweight tracking snippet to your website to begin recording pageviews, referrers, and Web Vitals automatically.
          </p>
        </div>

        {project && (
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              marginTop: 'var(--space-2)',
              textAlign: 'left',
            }}
          >
            {/* Snippet Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: 'var(--space-2)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                {[
                  { id: 'html', label: 'HTML Script', icon: Terminal },
                  { id: 'react', label: 'Next.js / React', icon: Code2 },
                  { id: 'node', label: 'Node.js Backend', icon: Server },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isSelected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`btn btn-sm ${isSelected ? 'btn-secondary' : 'btn-ghost'}`}
                      onClick={() => setActiveTab(tab.id as any)}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      }}
                    >
                      <Icon size={13} style={{ color: isSelected ? 'var(--color-accent)' : 'inherit' }} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopy}
              >
                {copied ? <Check size={14} style={{ color: 'var(--color-accent)' }} /> : <Copy size={14} />}
                <span>{copied ? 'Copied to Clipboard' : 'Copy Snippet'}</span>
              </button>
            </div>

            <pre className="code-block" style={{ margin: 0, maxHeight: '240px' }}>
              <code>{getActiveCode()}</code>
            </pre>

            <div
              style={{
                marginTop: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
              }}
            >
              <div>
                Site ID: <code className="code-inline" style={{ color: 'var(--color-accent-text)' }}>{siteId}</code> | Timezone: <strong style={{ color: 'var(--color-text-primary)' }}>{project.timezone}</strong>
              </div>

              {onRefresh && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleCheckEvents}
                  disabled={checking}
                >
                  <RefreshCw size={12} className={checking ? 'pulse-dot' : ''} />
                  <span>{checking ? 'Checking for events...' : 'Check for events'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
