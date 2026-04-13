"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPatientServiceHistory } from "../../lib/queueSupabaseSync";
import type { PatientServiceHistoryRow } from "../../lib/database.types";

function formatDuration(sec: number | null): string {
  if (sec == null) return "-";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function formatService(type: string): string {
  const map: Record<string, string> = {
    "opd-triage": "OPD Triage",
    consultation: "Consultation",
    pharmacy: "Pharmacy",
    laboratory: "Laboratory",
    cashier: "Cashier",
  };
  return map[type] ?? type;
}

export default function HistoryPage() {
  const [rows, setRows] = useState<PatientServiceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await loadPatientServiceHistory(1000);
      if (!alive) return;
      setRows(data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Live Queue History</h1>
            <p className="text-sm text-gray-500">Completed patients and worked time</p>
          </div>
          <Link
            href="/"
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Back to Simulator
          </Link>
        </div>

        <div className="bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 text-gray-500 font-medium">Ticket #</th>
                  <th className="px-4 py-2 text-gray-500 font-medium">Patient Name</th>
                  <th className="px-4 py-2 text-gray-500 font-medium">Service</th>
                  <th className="px-4 py-2 text-gray-500 font-medium">Channel</th>
                  <th className="px-4 py-2 text-gray-500 font-medium">Worked Time</th>
                  <th className="px-4 py-2 text-gray-500 font-medium">Completed At</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No history yet
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Loading history...
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-gray-900">{r.ticket_number}</td>
                    <td className="px-4 py-2 text-gray-700">{r.patient_name || ""}</td>
                    <td className="px-4 py-2 text-gray-700">{formatService(r.service_type)}</td>
                    <td className="px-4 py-2 text-gray-700 capitalize">{r.channel}</td>
                    <td className="px-4 py-2 text-gray-700">{formatDuration(r.worked_duration_sec)}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

