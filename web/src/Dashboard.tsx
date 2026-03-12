import { useQuery, useMutation, useAction } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';

type Tab = 'settings' | 'channels' | 'activity' | 'devices';

export function Dashboard() {
  const { signOut } = useAuthActions();
  const family = useQuery(api.families.getMyFamily);
  const settings = useQuery(api.settings.getForFamily);
  const channelRules = useQuery(api.channelRules.listForFamily);
  const watchSessions = useQuery(api.watchSessions.getForFamily);

  const createFamily = useMutation(api.families.create);
  const updateSettings = useMutation(api.settings.update);
  const addRule = useMutation(api.channelRules.addRule);
  const removeRule = useMutation(api.channelRules.removeRule);
  const resolveChannel = useAction(api.resolveChannel.resolveFromVideoUrl);

  const [tab, setTab] = useState<Tab>('settings');
  const [familyName, setFamilyName] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [addStatus, setAddStatus] = useState<'allowed' | 'blocked'>('allowed');
  const [resolving, setResolving] = useState(false);
  const [copied, setCopied] = useState(false);

  // No family yet — show create form
  if (family === undefined) return <div className="loading">Loading...</div>;

  if (family === null) {
    return (
      <div className="setup-page">
        <div className="setup-card">
          <div className="login-icon">
            <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
              <path d="M12 3L5 6.5V10.5C5 14.64 8.01 18.47 12 19.5C15.99 18.47 19 14.64 19 10.5V6.5L12 3Z"
                fill="#B5A67A" opacity="0.3" stroke="#B5A67A" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M9 11L11 13L15.5 8.5" stroke="#B5A67A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>Create Your Family</h1>
          <p className="login-subtitle">Name your family to get started</p>
          <form onSubmit={async e => {
            e.preventDefault();
            if (!familyName.trim()) return;
            await createFamily({ name: familyName.trim() });
          }}>
            <input
              placeholder="Family name"
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">Create Family</button>
          </form>
        </div>
      </div>
    );
  }

  const allowed = (channelRules || []).filter(r => r.status === 'allowed');
  const blocked = (channelRules || []).filter(r => r.status === 'blocked');

  function isVideoUrl(s: string): boolean {
    return /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(s);
  }

  async function handleAddChannel() {
    const value = channelInput.trim();
    if (!value) return;

    if (isVideoUrl(value)) {
      setResolving(true);
      try {
        const ch = await resolveChannel({ videoUrl: value });
        await addRule({
          channelName: ch.name,
          channelHandle: ch.handle || undefined,
          channelUrl: ch.url || undefined,
          status: addStatus,
        });
        setChannelInput('');
      } catch { /* ignore */ }
      setResolving(false);
    } else {
      await addRule({
        channelName: value,
        channelHandle: value.startsWith('@') ? value : undefined,
        status: addStatus,
      });
      setChannelInput('');
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(family!.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dash-header">
        <div className="header-left">
          <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
            <path d="M12 3L5 6.5V10.5C5 14.64 8.01 18.47 12 19.5C15.99 18.47 19 14.64 19 10.5V6.5L12 3Z"
              fill="#B5A67A" opacity="0.3" stroke="#B5A67A" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M9 11L11 13L15.5 8.5" stroke="#B5A67A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="header-title">{family.name}</span>
        </div>
        <button className="btn-ghost" onClick={() => signOut()}>Sign Out</button>
      </header>

      {/* Join Code Banner */}
      <div className="join-banner" onClick={copyCode}>
        <span className="join-label">Join Code</span>
        <span className="join-code">{family.joinCode}</span>
        <span className="join-hint">{copied ? 'Copied!' : 'Tap to copy'}</span>
      </div>

      {/* Tabs */}
      <nav className="tabs">
        {(['settings', 'channels', 'activity', 'devices'] as Tab[]).map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {/* Settings Tab */}
      {tab === 'settings' && settings && (
        <div className="tab-content">
          <div className="card">
            <label className="setting-row">
              <div>
                <div className="setting-name">Daily Limit</div>
                <div className="setting-desc">{settings.dailyLimitMinutes} minutes</div>
              </div>
              <input
                type="range"
                min="15" max="180" step="15"
                value={settings.dailyLimitMinutes}
                onChange={e => updateSettings({ dailyLimitMinutes: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="card">
            <label className="setting-row">
              <div>
                <div className="setting-name">Block Shorts</div>
                <div className="setting-desc">Hide YouTube Shorts</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.blockShorts}
                onChange={e => updateSettings({ blockShorts: e.target.checked })}
              />
            </label>
          </div>

          <div className="card">
            <label className="setting-row">
              <div>
                <div className="setting-name">Extension Enabled</div>
                <div className="setting-desc">Turn blocking on/off</div>
              </div>
              <input
                type="checkbox"
                className="toggle"
                checked={settings.extensionEnabled}
                onChange={e => updateSettings({ extensionEnabled: e.target.checked })}
              />
            </label>
          </div>

          <div className="card">
            <div className="setting-name" style={{ marginBottom: 8 }}>Filter Mode</div>
            <div className="mode-toggle">
              <button
                className={`mode-btn ${settings.filterMode === 'whitelist' ? 'active' : ''}`}
                onClick={() => updateSettings({ filterMode: 'whitelist' })}
              >
                Allow Only
              </button>
              <button
                className={`mode-btn ${settings.filterMode === 'blocklist' ? 'active' : ''}`}
                onClick={() => updateSettings({ filterMode: 'blocklist' })}
              >
                Block Specific
              </button>
            </div>
            <p className="hint">
              {settings.filterMode === 'whitelist'
                ? 'Only approved channels can be watched'
                : 'Everything allowed except blocked channels'}
            </p>
          </div>
        </div>
      )}

      {/* Channels Tab */}
      {tab === 'channels' && (
        <div className="tab-content">
          <div className="card">
            <div className="add-channel-row">
              <input
                placeholder="Name, @handle, or video URL"
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddChannel()}
              />
              <select value={addStatus} onChange={e => setAddStatus(e.target.value as any)}>
                <option value="allowed">Allow</option>
                <option value="blocked">Block</option>
              </select>
              <button className="btn-primary btn-sm" onClick={handleAddChannel} disabled={resolving}>
                {resolving ? '...' : 'Add'}
              </button>
            </div>
          </div>

          {allowed.length > 0 && (
            <div className="card">
              <div className="section-header">
                <span>Allowed Channels</span>
                <span className="badge">{allowed.length}</span>
              </div>
              <ul className="channel-list">
                {allowed.map(r => (
                  <li key={r._id} className="channel-item">
                    <span className="dot allowed"></span>
                    <span className="channel-name">{r.channelName}</span>
                    {r.channelHandle && <span className="channel-handle">{r.channelHandle}</span>}
                    <button className="remove-btn" onClick={() => removeRule({ channelName: r.channelName })}>
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {blocked.length > 0 && (
            <div className="card">
              <div className="section-header">
                <span>Blocked Channels</span>
                <span className="badge">{blocked.length}</span>
              </div>
              <ul className="channel-list">
                {blocked.map(r => (
                  <li key={r._id} className="channel-item">
                    <span className="dot blocked"></span>
                    <span className="channel-name">{r.channelName}</span>
                    {r.channelHandle && <span className="channel-handle">{r.channelHandle}</span>}
                    <button className="remove-btn" onClick={() => removeRule({ channelName: r.channelName })}>
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {allowed.length === 0 && blocked.length === 0 && (
            <p className="empty-state">No channel rules yet. Add channels above.</p>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <div className="tab-content">
          <div className="card">
            <div className="section-header">
              <span>Today's Watch Time</span>
            </div>
            {(!watchSessions || watchSessions.length === 0) ? (
              <p className="empty-state">No activity today</p>
            ) : (
              <ul className="activity-list">
                {watchSessions.map((s, i) => (
                  <li key={i} className="activity-item">
                    <span className="device-name">{s.deviceName}</span>
                    <span className="watch-time">{Math.round(s.secondsUsed / 60)} min</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Devices Tab */}
      {tab === 'devices' && (
        <div className="tab-content">
          <div className="card">
            <div className="section-header">
              <span>Connected Devices</span>
              <span className="badge">{family.devices?.length || 0}</span>
            </div>
            {(!family.devices || family.devices.length === 0) ? (
              <p className="empty-state">No devices connected. Enter the join code in the extension to connect.</p>
            ) : (
              <ul className="device-list">
                {family.devices.map(d => (
                  <li key={d._id} className="device-item">
                    <span className="device-name">{d.deviceName}</span>
                    <span className="device-seen">
                      {d.lastSeen ? `${Math.round((Date.now() - d.lastSeen) / 60000)}m ago` : 'Never'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
