'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Patient, ServicePoint } from '@/lib/queueEngine';
import { rowToPatientLive } from '@/lib/queueService';
import { rowToServicePoint } from '@/lib/queueSupabaseSync';
import { computeLiveMetrics } from '@/lib/queueMetrics';
import type { PatientRow, ServicePointRow, QueueEventRow, NotificationRow } from '@/lib/database.types';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface LiveEvent {
  id: string;
  message: string;
  type: 'join' | 'serve' | 'complete' | 'alert';
  time: string;
}

export interface LiveNotification {
  id: string;
  message: string;
  time: string;
  ticketNumber?: string;
}

function buildState(
  patientRows: PatientRow[],
  spRows: ServicePointRow[]
): { patients: Patient[]; servicePoints: ServicePoint[] } {
  const patients = patientRows.map(rowToPatientLive);
  const byId = new Map(patients.map((p) => [p.id, p]));
  const servicePoints = spRows.map((r) =>
    rowToServicePoint(r, r.current_patient_id ? byId.get(r.current_patient_id) : undefined)
  );
  return { patients, servicePoints };
}

function formatEventTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString();
}

export function useQueueRealtime() {
  const [patientRows, setPatientRows] = useState<PatientRow[]>([]);
  const [spRows, setSpRows] = useState<ServicePointRow[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline');
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      setConnectionStatus('offline');
      return;
    }

    const [pRes, spRes, eRes, nRes] = await Promise.all([
      supabase.from('patients').select('*').order('created_at', { ascending: true }),
      supabase.from('service_points').select('*'),
      supabase.from('queue_events').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    if (!mountedRef.current) return;

    if (pRes.data) setPatientRows(pRes.data as PatientRow[]);
    if (spRes.data) setSpRows(spRes.data as ServicePointRow[]);
    if (eRes.data) {
      setEvents(
        (eRes.data as QueueEventRow[]).map((e) => ({
          id: e.id,
          message: e.message ?? '',
          type: e.type,
          time: formatEventTime(e.created_at),
        }))
      );
    }
    if (nRes.data) {
      setNotifications(
        (nRes.data as NotificationRow[]).map((n) => ({
          id: n.id,
          message: n.message,
          time: formatEventTime(n.created_at),
          ticketNumber: n.ticket_number ?? undefined,
        }))
      );
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    if (!isSupabaseConfigured()) return;

    const channel = supabase
      .channel('qflow-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients' },
        (payload) => {
          setPatientRows((prev) => {
            const row = payload.new as PatientRow;
            if (payload.eventType === 'DELETE') {
              const old = payload.old as { id?: string };
              return prev.filter((p) => p.id !== old.id);
            }
            const idx = prev.findIndex((p) => p.id === row.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = row;
              return next;
            }
            return [...prev, row];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_points' },
        (payload) => {
          setSpRows((prev) => {
            const row = payload.new as ServicePointRow;
            if (payload.eventType === 'DELETE') {
              const old = payload.old as { id?: string };
              return prev.filter((p) => p.id !== old.id);
            }
            const idx = prev.findIndex((p) => p.id === row.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = row;
              return next;
            }
            return [...prev, row];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'queue_events' },
        (payload) => {
          const e = payload.new as QueueEventRow;
          setEvents((prev) => [
            {
              id: e.id,
              message: e.message ?? '',
              type: e.type,
              time: formatEventTime(e.created_at),
            },
            ...prev,
          ].slice(0, 100));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = payload.new as NotificationRow;
          setNotifications((prev) => [
            {
              id: n.id,
              message: n.message,
              time: formatEventTime(n.created_at),
              ticketNumber: n.ticket_number ?? undefined,
            },
            ...prev,
          ].slice(0, 50));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('reconnecting');
        else if (status === 'CLOSED') setConnectionStatus('offline');
      });

    return () => {
      mountedRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const { patients, servicePoints } = useMemo(
    () => buildState(patientRows, spRows),
    [patientRows, spRows]
  );

  const metrics = useMemo(
    () => computeLiveMetrics(patients),
    [patients]
  );

  return {
    patients,
    servicePoints,
    metrics,
    events,
    notifications,
    connectionStatus,
    isLoading,
    refresh,
  };
}
