'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueueRealtime } from '@/hooks/useQueueRealtime';
import RegisterQrPoster from '@/components/RegisterQrPoster';
import {
  CARE_STATUS_DOT,
  CARE_STATUS_LABELS,
  getPatientCareStatus,
} from '@/lib/patientStatus';

function displayName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '';
}

const SERVICE_LABELS: Record<string, string> = {
  'opd-triage': 'OPD Triage',
  consultation: 'Doctor Consultation',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  cashier: 'Cashier',
};

export default function DisplayPage() {
  const { patients, servicePoints, connectionStatus, isLoading } = useQueueRealtime();
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

  const nowServing = servicePoints
    .filter((sp) => sp.currentPatient && sp.status === 'active')
    .map((sp) => {
      const patient = sp.currentPatient!;
      return {
        desk: sp.name,
        ticket: patient.ticketNumber,
        patientNo: patient.queuePosition > 0 ? patient.queuePosition : patient.ticketNumber,
        name: displayName(patient.name),
        service: SERVICE_LABELS[sp.type] ?? sp.type,
        care: getPatientCareStatus(patient),
      };
    });

  const upNext = patients
    .filter((p) => p.status === 'waiting')
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, normal: 2 };
      const pa = order[a.priority];
      const pb = order[b.priority];
      if (pa !== pb) return pa - pb;
      return a.queuePosition - b.queuePosition;
    })
    .slice(0, 8);

  const waitingCount = patients.filter((p) => p.status === 'waiting').length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        Loading live queue...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-8 py-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">QFlow Waiting Area</h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold uppercase">
              <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`} />
              Live
            </span>
          </div>
          <p className="text-slate-400 mt-1">Mukono Health Centre IV</p>
        </div>
        <p className="text-4xl font-mono font-bold text-emerald-400">{clock}</p>
      </header>

      <main className="p-8 space-y-8 max-w-7xl mx-auto">
        <section>
          <h2 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Now Serving</h2>
          {nowServing.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-500 text-xl">
              No patients currently being served
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nowServing.map((item) => (
                <div
                  key={item.desk}
                  className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/80 to-slate-900 p-6 animate-fadeIn"
                >
                  <p className="text-sm text-emerald-400/80">{item.service}</p>
                  <p className="text-xs uppercase tracking-widest text-slate-500 mt-3">Patient No.</p>
                  <p className="text-5xl font-mono font-bold text-white mt-1">{item.patientNo}</p>
                  <p className="text-lg font-mono text-emerald-300/90 mt-1">{item.ticket}</p>
                  {item.name && (
                    <p className="text-xl font-semibold text-white mt-3 truncate" title={item.name}>
                      {item.name}
                    </p>
                  )}
                  <p className="text-slate-400 mt-2">{item.desk}</p>
                  <span className={`inline-flex items-center gap-1.5 mt-3 px-2 py-1 rounded text-xs font-medium ${CARE_STATUS_DOT[item.care]} text-white`}>
                    {CARE_STATUS_LABELS[item.care]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex items-center gap-6 text-lg">
          <span className="text-slate-400">Patients waiting:</span>
          <span className="text-3xl font-bold text-amber-400">{waitingCount}</span>
        </div>

        <section>
          <h2 className="text-sm uppercase tracking-widest text-slate-400 mb-4">Up Next</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {upNext.length === 0 ? (
              <p className="col-span-full text-slate-500">Queue is empty</p>
            ) : (
              upNext.map((p) => {
                const care = getPatientCareStatus(p);
                const name = displayName(p.name);
                return (
                  <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center transition-all duration-300">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Patient No.</p>
                    <p className="text-3xl font-mono font-bold text-amber-300 mt-1">{p.queuePosition}</p>
                    <p className="text-sm font-mono text-slate-400 mt-1">{p.ticketNumber}</p>
                    {name && (
                      <p className="text-sm font-medium text-white mt-2 truncate px-1" title={name}>
                        {name}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">{SERVICE_LABELS[p.serviceType]}</p>
                    <span className={`inline-block w-2 h-2 rounded-full mt-2 ${CARE_STATUS_DOT[care]}`} />
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col md:flex-row items-center gap-6">
          <RegisterQrPoster size={180} showUrl={false} />
          <div>
            <h2 className="text-lg font-semibold text-white">Join the queue on your phone</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-md">
              Scan this QR code to open the registration form. Enter your details and receive a ticket instantly.
            </p>
            <Link
              href="/register"
              className="inline-block mt-3 text-sm text-emerald-400 hover:underline"
            >
              Open registration page
            </Link>
          </div>
        </section>

        <section className="flex flex-wrap gap-6 pt-4 border-t border-slate-800">
          {(['normal', 'attention', 'emergency'] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${CARE_STATUS_DOT[s]}`} />
              <span className="text-sm text-slate-300">{CARE_STATUS_LABELS[s]}</span>
            </div>
          ))}
        </section>
      </main>

      <footer className="fixed bottom-4 right-4">
        <Link href="/" className="text-xs text-slate-600 hover:text-slate-400">Admin Console</Link>
      </footer>
    </div>
  );
}
