'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '@/hooks/useQueueRealtime';

interface LiveHeaderProps {
  connectionStatus: ConnectionStatus;
  trainingMode: boolean;
  onTrainingModeChange: (on: boolean) => void;
  simTime?: string;
  isRunning?: boolean;
  activeTab: 'dashboard' | 'phone';
  onTabChange: (tab: 'dashboard' | 'phone') => void;
}

export default function LiveHeader({
  connectionStatus,
  trainingMode,
  onTrainingModeChange,
  simTime,
  isRunning,
  activeTab,
  onTabChange,
}: LiveHeaderProps) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('en-UG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const connColor =
    connectionStatus === 'connected'
      ? 'bg-emerald-500'
      : connectionStatus === 'reconnecting'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-red-500';

  return (
    <header className="bg-slate-900 text-white border-b border-slate-700 px-4 md:px-6 py-3 shadow-lg">
      <div className="flex items-center justify-between max-w-[1920px] mx-auto gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-lg">
            Q
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight">QFlow Live</h1>
              {!trainingMode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Mukono Health Centre IV</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${connColor}`} />
            {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
          </div>

          <div className="font-mono text-sm text-emerald-400 bg-slate-800 px-3 py-1.5 rounded-lg">
            {trainingMode && simTime ? `SIM ${simTime}` : clock}
          </div>

            <Link
              href="/register"
              target="_blank"
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              Register
            </Link>
            <Link
              href="/display"
              target="_blank"
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              Display
            </Link>
          <Link
            href="/history"
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
          >
            History
          </Link>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trainingMode}
              onChange={(e) => onTrainingModeChange(e.target.checked)}
              className="rounded border-slate-600"
            />
            Training
          </label>

          {trainingMode && isRunning !== undefined && (
            <span className={`text-xs ${isRunning ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isRunning ? 'Sim Running' : 'Sim Paused'}
            </span>
          )}

          <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Queue
            </button>
            <button
              onClick={() => onTabChange('phone')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'phone' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Phone
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
