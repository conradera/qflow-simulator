'use client';

import Link from 'next/link';
import type { QueueMetrics } from '@/lib/queueEngine';
import RegisterQrPoster from '@/components/RegisterQrPoster';

interface QueueSidebarProps {
  metrics: QueueMetrics;
  trainingMode: boolean;
  onAddPatient: () => void;
  children?: React.ReactNode;
}

export default function QueueSidebar({
  metrics,
  trainingMode,
  onAddPatient,
  children,
}: QueueSidebarProps) {
  return (
    <div className="w-full bg-slate-50 text-gray-800 p-4 flex flex-col gap-4 overflow-y-auto h-full text-sm border-r border-gray-200">
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Live Queue Stats
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Waiting" value={metrics.waitingPatients} color="text-amber-600" />
          <Stat label="Serving" value={metrics.servingPatients} color="text-emerald-600" />
          <Stat label="Completed" value={metrics.completedPatients} color="text-blue-600" />
          <Stat label="Total" value={metrics.totalPatients} color="text-gray-900" />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm space-y-2">
        <button
          onClick={onAddPatient}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          + Add Walk-in Patient
        </button>
        <Link
          href="/register"
          target="_blank"
          className="block w-full py-2 rounded-lg text-center text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Patient Self-Registration
        </Link>
        <Link
          href="/display"
          target="_blank"
          className="block w-full py-2 rounded-lg text-center text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors"
        >
          Open Waiting Area Display
        </Link>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col items-center">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Patient Registration QR
        </p>
        <RegisterQrPoster size={140} />
        <p className="text-[10px] text-gray-400 text-center mt-2">
          Print or display so patients can scan and join the queue on their phone.
        </p>
      </div>

      {trainingMode && children && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
            Training Mode
          </p>
          {children}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-[10px] text-gray-500 uppercase">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
