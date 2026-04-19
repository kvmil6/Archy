import React, { useState, useEffect } from 'react';
import { Key, Link2, Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const APIConfig: React.FC<{ className?: string }> = ({ className }) => {
  const [apiKey, setApiKey] = useState('');
  const [backendUrl, setBackendUrl] = useState(
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; loading: boolean }>({
    configured: false,
    loading: true
  });

  // Check current API key status on mount
  useEffect(() => {
    checkKeyStatus();
  }, []);

  const checkKeyStatus = async () => {
    try {
      const response = await fetch(`${backendUrl}/config/api-key`);
      if (response.ok) {
        const data = await response.json();
        setKeyStatus({ configured: data.configured, loading: false });
      }
    } catch {
      setKeyStatus({ configured: false, loading: false });
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    
    setSaving(true);
    setError(null);
    
    try {
      const response = await fetch(`${backendUrl}/config/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouter_api_key: apiKey.trim() })
      });
      
      if (response.ok) {
        setSaved(true);
        setKeyStatus({ configured: true, loading: false });
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to save API key');
      }
    } catch (err) {
      setError('Cannot connect to backend. Make sure it\'s running on port 8000.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-2xl p-6 ${className ?? ''}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <h3 className="text-sm font-semibold text-white/70 mb-5 flex items-center gap-2">
        <span className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: 'rgba(147,51,234,0.15)' }}>
          <Key size={10} className="text-brand-400" />
        </span>
        API Configuration
      </h3>

      <div className="space-y-4">
        {/* API Key Status */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-white/30 uppercase tracking-widest">
            Current Status
          </span>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${
            keyStatus.loading 
              ? 'bg-white/10 text-white/50'
              : keyStatus.configured
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {keyStatus.loading ? (
              <><RefreshCw className="w-3 h-3 animate-spin" /> Checking...</>
            ) : keyStatus.configured ? (
              <><CheckCircle2 className="w-3 h-3" /> API Key Set</>
            ) : (
              <><AlertCircle className="w-3 h-3" /> Not Configured</>
            )}
          </div>
        </div>

        {/* OpenRouter API Key */}
        <div>
          <label className="block text-[11px] font-medium text-white/30 uppercase tracking-widest mb-2">
            OpenRouter API Key
          </label>
          <input
            id="openrouter-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-v1-..."
            className="field font-mono text-xs"
          />
          <p className="text-[10px] text-white/20 mt-1.5">
            Get yours at{' '}
            <a
              href="https://openrouter.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
            >
              openrouter.ai
            </a>
          </p>
          {error && (
            <p className="text-[10px] text-red-400 mt-1.5">{error}</p>
          )}
        </div>

        {/* Backend URL */}
        <div>
          <label className="block text-[11px] font-medium text-white/30 uppercase tracking-widest mb-2">
            Backend URL
          </label>
          <div className="relative">
            <Link2 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              id="backend-url"
              type="url"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className="field pl-8 text-xs"
            />
          </div>
        </div>

        {/* Save button */}
        <button
          id="save-config-btn"
          onClick={handleSave}
          disabled={saving || !apiKey.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={saved ? {
            background: 'rgba(34,197,94,0.15)',
            border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ade80',
          } : saving ? {
            background: 'rgba(147,51,234,0.5)',
            border: '1px solid rgba(147,51,234,0.4)',
            color: 'white',
          } : {
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            border: '1px solid rgba(147,51,234,0.4)',
            color: 'white',
            boxShadow: '0 4px 15px rgba(147,51,234,0.25)',
          }}
        >
          {saved ? (
            <>
              <CheckCircle2 size={14} />
              Saved! Restart backend to apply.
            </>
          ) : saving ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={14} />
              Save to Backend
            </>
          )}
        </button>
        
        {saved && (
          <p className="text-[10px] text-emerald-400 text-center">
            API key saved to backend/.env. Please restart the backend server for changes to take effect.
          </p>
        )}
      </div>
    </div>
  );
};