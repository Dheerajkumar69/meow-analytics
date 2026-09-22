import React, { useState } from 'react';
import { Project } from '../lib/api.js';
import { Copy, Check, Radio, Terminal } from 'lucide-react';

interface EmptyAnalyticsProps {
  title: string;
  description?: string;
  project: Project | null;
}

export const EmptyAnalytics: React.FC<EmptyAnalyticsProps> = ({ title, description, project }) => {
  const [copied, setCopied] = useState(false);

  const siteId = project?.site_id || 'site_your_project_id';
  const scriptTag = `<script\n  defer\n  src="https://analytics.example.com/meow.js"\n  data-site-id="${siteId}">\n</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '900px' }}>
      <div>
        <h2>{title}</h2>
        {description && <p style={{ marginTop: 'var(--space-1)' }}>{description}</p>}
      </div>

      <div
        className="card"
        style={{
          padding: 'var(--space-8)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-accent-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-accent)',
          }}
        >
          <Radio size={24} />
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: 'var(--space-2)' }}>
            Analytics will appear here once traffic is collected.
          </h3>
          <p style={{ maxWidth: '540px', margin: '0 auto' }}>
            No traffic has been recorded for this project yet. Integrate the Meow Analytics tracking snippet into your website to begin recording visits, pages, and referrers.
          </p>
        </div>

        {project && (
          <div
            style={{
              width: '100%',
              maxWidth: '640px',
              marginTop: 'var(--space-4)',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                }}
              >
                <Terminal size={14} /> HTML TRACKING SNIPPET
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopy}
              >
                {copied ? <Check size={14} color="var(--color-accent)" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Snippet'}
              </button>
            </div>
            <pre className="code-block" style={{ padding: 'var(--space-3)' }}>
              <code>{scriptTag}</code>
            </pre>
            <div
              style={{
                marginTop: 'var(--space-2)',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
              }}
            >
              Site ID: <strong style={{ color: 'var(--color-text-primary)' }}>{siteId}</strong> | Timezone: <strong style={{ color: 'var(--color-text-primary)' }}>{project.timezone}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
