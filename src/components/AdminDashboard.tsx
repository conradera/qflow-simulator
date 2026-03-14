'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import type { Patient, ServicePoint, QueueMetrics } from '../lib/queueEngine';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminDashboardProps {
  patients: Patient[];
  servicePoints: ServicePoint[];
  metrics: QueueMetrics;
  metricsHistory: Array<{
    time: string;
    waiting: number;
    avgWait: number;
    throughput: number;
  }>;
  events: Array<{
    id: string;
    message: string;
    type: 'join' | 'serve' | 'complete' | 'alert';
    time: string;
  }>;
  onCallNext: (servicePointId: string) => void;
  onToggleServicePoint: (servicePointId: string) => void;
  onMarkNoShow: (patientId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatServiceLabel(
  type:
    | 'opd-triage'
    | 'consultation'
    | 'pharmacy'
    | 'laboratory'
    | 'cashier'
): string {
  const labels: Record<string, string> = {
    'opd-triage': 'OPD Triage',
    consultation: 'Consultation',
    pharmacy: 'Pharmacy',
    laboratory: 'Laboratory',
    cashier: 'Cashier',
  };
  return labels[type] ?? type;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminDashboard({
  patients,
  servicePoints,
  metrics,
  metricsHistory,
  events,
  onCallNext,
  onToggleServicePoint,
  onMarkNoShow,
}: AdminDashboardProps) {
  // ---- derived data -------------------------------------------------------

  const activePatients = useMemo(
    () =>
      patients.filter(
        (p) => p.status === 'waiting' || p.status === 'serving'
      ),
    [patients]
  );

  // Wait-time distribution buckets
  const waitDistribution = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0]; // <5, 5-15, 15-30, 30-60, 60+
    patients
      .filter((p) => p.status === 'waiting' || p.status === 'serving')
      .forEach((p) => {
        const waitMin = p.estimatedWait / 60;
        if (waitMin < 5) buckets[0]++;
        else if (waitMin < 15) buckets[1]++;
        else if (waitMin < 30) buckets[2]++;
        else if (waitMin < 60) buckets[3]++;
        else buckets[4]++;
      });
    return buckets;
  }, [patients]);

  // Patients by service type
  const patientsByService = useMemo(() => {
    const serviceTypes = [
      'opd-triage',
      'consultation',
      'pharmacy',
      'laboratory',
      'cashier',
    ] as const;
    return serviceTypes.map(
      (st) =>
        patients.filter(
          (p) =>
            p.serviceType === st &&
            (p.status === 'waiting' || p.status === 'serving')
        ).length
    );
  }, [patients]);

  // Chart grid color for light theme
  const gridColor = 'rgba(226,232,240,0.8)';

  // ---- charts config ------------------------------------------------------

  const queueLengthData = {
    labels: metricsHistory.map((m) => m.time),
    datasets: [
      {
        label: 'Waiting',
        data: metricsHistory.map((m) => m.waiting),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const queueLengthOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: true, text: 'Queue Length Over Time', color: '#111827' } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: '#6b7280' } },
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: '#6b7280' } },
    },
  };

  const waitDistData = {
    labels: ['<5 min', '5-15 min', '15-30 min', '30-60 min', '60+ min'],
    datasets: [
      {
        label: 'Patients',
        data: waitDistribution,
        backgroundColor: [
          '#22c55e',
          '#3b82f6',
          '#f59e0b',
          '#f97316',
          '#ef4444',
        ],
        borderRadius: 4,
      },
    ],
  };

  const waitDistOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: true, text: 'Wait Time Distribution', color: '#111827' } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: '#6b7280' } },
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: '#6b7280' } },
    },
  };

  const serviceTypeData = {
    labels: ['OPD Triage', 'Consultation', 'Pharmacy', 'Laboratory', 'Cashier'],
    datasets: [
      {
        data: patientsByService,
        backgroundColor: [
          '#3b82f6',
          '#8b5cf6',
          '#22c55e',
          '#f59e0b',
          '#ec4899',
        ],
        borderWidth: 0,
      },
    ],
  };

  const serviceTypeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: '#374151' } },
      title: { display: true, text: 'Patients by Service Type', color: '#111827' },
    },
  };

  const throughputData = {
    labels: metricsHistory.map((m) => m.time),
    datasets: [
      {
        label: 'Throughput / hr',
        data: metricsHistory.map((m) => m.throughput),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const throughputOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: true, text: 'Throughput per Hour', color: '#111827' } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: '#6b7280' } },
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: '#6b7280' } },
    },
  };

  // ---- event log dot colors -----------------------------------------------

  const eventDotColor: Record<string, string> = {
    join: 'bg-blue-500',
    serve: 'bg-amber-500',
    complete: 'bg-green-500',
    alert: 'bg-red-500',
  };

  // ---- find matching service point for a patient --------------------------

  function findAvailableServicePoint(patient: Patient): ServicePoint | undefined {
    return servicePoints.find(
      (sp) =>
        sp.type === patient.serviceType &&
        sp.status === 'active' &&
        !sp.currentPatient
    );
  }

  // ---- render -------------------------------------------------------------

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 space-y-6">
      {/* ================================================================= */}
      {/* 1. TOP STATS BAR                                                  */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Patients */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total Patients</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.totalPatients}</p>
            </div>
          </div>
        </div>

        {/* Currently Waiting */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Currently Waiting</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.waitingPatients}</p>
            </div>
          </div>
        </div>

        {/* Avg Wait Time */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4 border-l-4 border-l-green-500">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Avg Wait Time</p>
              <p className="text-2xl font-bold text-gray-900">{formatWait(metrics.avgWaitTime)}</p>
            </div>
          </div>
        </div>

        {/* Patients Served */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Patients Served</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.completedPatients}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. QUEUE FLOW PIPELINE                                            */}
      {/* ================================================================= */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
        <h2 className="text-gray-900 font-semibold text-sm mb-4">Queue Flow Pipeline</h2>
        <div className="flex items-center justify-between overflow-x-auto gap-2">
          {/* Stage 1: Patient Arrives */}
          <div className="flex flex-col items-center min-w-[100px]">
            <div className="bg-blue-100 text-blue-800 rounded-lg px-4 py-3 text-center">
              <p className="text-xs font-medium">Patient Arrives</p>
              <p className="text-xl font-bold">{metrics.totalPatients}</p>
            </div>
          </div>
          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>

          {/* Stage 2: Check-in */}
          <div className="flex flex-col items-center min-w-[100px]">
            <div className="bg-purple-100 text-purple-800 rounded-lg px-4 py-3 text-center">
              <p className="text-xs font-medium">Check-in</p>
              <p className="text-xl font-bold">{metrics.waitingPatients + metrics.servingPatients}</p>
            </div>
          </div>
          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>

          {/* Stage 3: Queue */}
          <div className="flex flex-col items-center min-w-[100px]">
            <div className="bg-amber-100 text-amber-800 rounded-lg px-4 py-3 text-center">
              <p className="text-xs font-medium">Queue</p>
              <p className="text-xl font-bold">{metrics.waitingPatients}</p>
            </div>
          </div>
          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>

          {/* Stage 4: Service Point */}
          <div className="flex flex-col items-center min-w-[100px]">
            <div className="bg-green-100 text-green-800 rounded-lg px-4 py-3 text-center">
              <p className="text-xs font-medium">Service Point</p>
              <p className="text-xl font-bold">{metrics.servingPatients}</p>
            </div>
          </div>
          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>

          {/* Stage 5: Complete */}
          <div className="flex flex-col items-center min-w-[100px]">
            <div className="bg-emerald-100 text-emerald-800 rounded-lg px-4 py-3 text-center">
              <p className="text-xs font-medium">Complete</p>
              <p className="text-xl font-bold">{metrics.completedPatients}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. LIVE QUEUE TABLE                                               */}
      {/* ================================================================= */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-gray-900 font-semibold text-sm">Live Queue ({activePatients.length} patients)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 text-gray-500 font-medium">Ticket #</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Name</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Service</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Priority</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Wait Time</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Status</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Channel</th>
                <th className="px-4 py-2 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activePatients.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No patients in queue
                  </td>
                </tr>
              )}
              {activePatients.map((patient) => {
                const priorityStyles: Record<string, string> = {
                  urgent: 'bg-red-500 text-white',
                  high: 'bg-orange-500 text-white',
                  normal: 'bg-blue-500 text-white',
                };
                const statusStyles: Record<string, string> = {
                  waiting: 'text-amber-700 bg-amber-50',
                  serving: 'text-green-700 bg-green-50',
                };
                const availableSp = findAvailableServicePoint(patient);

                return (
                  <tr
                    key={patient.id}
                    className="border-t border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-2 text-gray-900 font-mono font-medium">
                      {patient.ticketNumber}
                    </td>
                    <td className="px-4 py-2 text-gray-900">{patient.name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatServiceLabel(patient.serviceType)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${priorityStyles[patient.priority]}`}
                      >
                        {patient.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatWait(patient.estimatedWait)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyles[patient.status] ?? 'text-gray-600 bg-gray-100'}`}
                      >
                        {patient.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 capitalize">
                      {patient.channel}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        {patient.status === 'waiting' && availableSp && (
                          <button
                            onClick={() => onCallNext(availableSp.id)}
                            className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          >
                            Call Next
                          </button>
                        )}
                        {patient.status === 'waiting' && (
                          <button
                            onClick={() => onMarkNoShow(patient.id)}
                            className="px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            No Show
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. SERVICE POINTS PANEL                                           */}
      {/* ================================================================= */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
        <h2 className="text-gray-900 font-semibold text-sm mb-4">Service Points</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {servicePoints.map((sp) => {
            const statusBadge: Record<string, string> = {
              active: 'bg-green-100 text-green-800',
              inactive: 'bg-gray-100 text-gray-600',
              break: 'bg-amber-100 text-amber-800',
            };
            return (
              <div
                key={sp.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-gray-900 font-medium text-sm">{sp.name}</h3>
                    <p className="text-gray-500 text-xs">{sp.staffName}</p>
                  </div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge[sp.status]}`}
                  >
                    {sp.status}
                  </span>
                </div>

                {sp.currentPatient ? (
                  <div className="mt-2 bg-blue-50 border border-blue-100 rounded p-2">
                    <p className="text-xs text-gray-500">Current Patient</p>
                    <p className="text-sm text-gray-900 font-medium">
                      {sp.currentPatient.name}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      {sp.currentPatient.ticketNumber}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 bg-gray-50 rounded p-2">
                    <p className="text-xs text-gray-400 italic">No patient</p>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Served: <span className="font-medium text-gray-900">{sp.patientsServed}</span>
                  </p>
                  <button
                    onClick={() => onToggleServicePoint(sp.id)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      sp.status === 'active'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {sp.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 5. REAL-TIME CHARTS                                               */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Queue Length Over Time */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
          <div className="h-64">
            <Line data={queueLengthData} options={queueLengthOptions} />
          </div>
        </div>

        {/* Wait Time Distribution */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
          <div className="h-64">
            <Bar data={waitDistData} options={waitDistOptions} />
          </div>
        </div>

        {/* Patients by Service Type */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
          <div className="h-64">
            <Doughnut data={serviceTypeData} options={serviceTypeOptions} />
          </div>
        </div>

        {/* Throughput per Hour */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
          <div className="h-64">
            <Line data={throughputData} options={throughputOptions} />
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 6. EVENT LOG                                                      */}
      {/* ================================================================= */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
        <h2 className="text-gray-900 font-semibold text-sm mb-3">Event Log</h2>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {events.length === 0 && (
            <p className="text-gray-400 text-sm italic">No events yet</p>
          )}
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 text-sm hover:bg-gray-50 rounded px-2 py-1 transition-colors"
            >
              <span
                className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${eventDotColor[event.type] ?? 'bg-gray-400'}`}
              />
              <span className="text-gray-600 flex-1">{event.message}</span>
              <span className="text-gray-400 text-xs flex-shrink-0 whitespace-nowrap">
                {event.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
