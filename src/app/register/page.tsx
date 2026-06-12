'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Patient } from '@/lib/queueEngine';
import PatientRegisterForm from '@/components/PatientRegisterForm';
import QrTicket from '@/components/QrTicket';
import { formatServiceLabel } from '@/lib/aiMessageTemplates';

export default function RegisterPage() {
  const [registered, setRegistered] = useState<Patient | null>(null);

  if (registered) {
    const waitMin = Math.max(1, Math.round(registered.estimatedWait / 60));
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-emerald-100 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold text-gray-900">You are in the queue!</h1>
          <p className="text-sm text-gray-500 mt-1">Mukono Health Centre IV</p>

          <div className="mt-6 bg-gray-50 rounded-xl p-4 space-y-2 text-left text-sm">
            <Row label="Ticket" value={registered.ticketNumber} mono />
            <Row label="Service" value={formatServiceLabel(registered.serviceType)} />
            <Row label="Position" value={`#${registered.queuePosition}`} />
            <Row label="Est. wait" value={`~${waitMin} min`} />
          </div>

          <div className="mt-6 flex justify-center">
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <QrTicket
                ticketNumber={registered.ticketNumber}
                patientName={registered.name}
                size={140}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Show this QR code or ticket number at the service desk. You will receive an SMS when your turn is near.
          </p>

          <button
            onClick={() => setRegistered(null)}
            className="mt-4 text-sm text-emerald-700 font-medium hover:underline"
          >
            Register another patient
          </button>

          <Link href="/" className="block mt-2 text-xs text-gray-400 hover:text-gray-600">
            Back to admin console
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-emerald-500 flex items-center justify-center font-bold text-white text-2xl mx-auto mb-3">
            Q
          </div>
          <h1 className="text-2xl font-bold text-white">Join the Queue</h1>
          <p className="text-slate-400 text-sm mt-1">Mukono Health Centre IV</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <p className="text-sm text-gray-600 mb-4">
            Fill in your details to get a queue ticket. No account required.
          </p>
          <PatientRegisterForm onSuccess={setRegistered} />
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Already have a ticket?{' '}
          <Link href="/" className="text-emerald-400 hover:underline">
            Check status via USSD *285*70#
          </Link>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
