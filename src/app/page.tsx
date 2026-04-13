'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  QueueSimulator,
  createSimulator,
  type Patient,
  type ServicePoint,
  type QueueMetrics,
  type SimulationConfig,
  type MetricsSnapshot,
  type ScenarioName,
  type ServicePointStatus,
  type ServiceType,
  type PatientPriority,
  type PriorityReason,
  type PatientChannel,
} from '../lib/queueEngine';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  loadPatients,
  loadServicePoints,
  loadSimulationConfig,
  loadQueueEvents,
  loadNotifications,
  loadMaxTicketNumber,
  insertPatientServiceHistory,
  rowToPatient,
  rowToServicePoint,
  upsertPatient,
  upsertServicePoint,
  insertQueueEvent,
  insertNotification,
  saveMetricsSnapshot,
  saveSimulationConfig,
} from '../lib/queueSupabaseSync';
import Link from 'next/link';
import PhoneSimulator from '../components/PhoneSimulator';
import AdminDashboard from '../components/AdminDashboard';
import SimulationControls from '../components/SimulationControls';
import type { ManualPatientInput } from '../components/SimulationControls';

interface EventLog {
  id: string;
  message: string;
  type: 'join' | 'serve' | 'complete' | 'alert';
  time: string;
}

interface Notification {
  id: string;
  message: string;
  time: string;
}

interface ChatMessage {
  id: string;
  from: 'patient' | 'admin' | 'ai' | 'system';
  text: string;
  time: string;
  ticketNumber?: string;
}

export default function Home() {
  const simulatorRef = useRef<QueueSimulator | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics>({
    totalPatients: 0,
    waitingPatients: 0,
    servingPatients: 0,
    completedPatients: 0,
    noShowPatients: 0,
    avgWaitTime: 0,
    avgServiceTime: 0,
    throughputPerHour: 0,
    longestWait: 0,
    queuesByService: {
      'opd-triage': 0,
      consultation: 0,
      pharmacy: 0,
      laboratory: 0,
      cashier: 0,
    },
  });
  const [metricsHistory, setMetricsHistory] = useState<
    Array<{ time: string; waiting: number; avgWait: number; throughput: number }>
  >([]);
  const [config, setConfig] = useState<SimulationConfig>({
    speed: 1,
    autoGenerate: false,
    patientsPerMinute: 0,
    avgServiceTime: 180,
    priorityRatio: 0.2,
    failureRate: 0.03,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSmsReplying, setIsSmsReplying] = useState(false);
  const [simTime, setSimTime] = useState('00:00:00');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'phone'>('dashboard');
  const [simReady, setSimReady] = useState(false);

  const prevPatientsRef = useRef<Patient[]>([]);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  // Initialize simulator: load from Supabase or start fresh
  useEffect(() => {
    let sim: QueueSimulator;
    const init = async () => {
      if (isSupabaseConfigured()) {
        const [loadedPatients, loadedServicePoints, savedConfig, dbMaxTicket] = await Promise.all([
          loadPatients(),
          loadServicePoints(),
          loadSimulationConfig(),
          loadMaxTicketNumber(),
        ]);
        if (loadedServicePoints.length > 0) {
          const scenario = (savedConfig?.active_scenario ?? 'normal-day') as ScenarioName;
          sim = createSimulator(scenario);
          const patients: Patient[] = loadedPatients.map((r) => rowToPatient(r));
          const patientById = new Map(patients.map((p) => [p.id, p]));
          const servicePoints: ServicePoint[] = loadedServicePoints.map((r) =>
            rowToServicePoint(r, r.current_patient_id ? patientById.get(r.current_patient_id) : undefined)
          );
          const ticketCounter = Math.max(
            dbMaxTicket,
            ...patients.map((p) => {
              const m = p.ticketNumber.match(/QF-(\d+)/);
              return m ? parseInt(m[1], 10) : 0;
            })
          );
          sim.loadPersistedState({
            patients,
            servicePoints,
            simulationTime: savedConfig?.simulation_time_sec ?? 0,
            ticketCounter,
          });
          // Do not auto-start: keep sim paused so the page does not constantly re-render
          const eventsFromDb = await loadQueueEvents(100);
          setEvents(
            eventsFromDb.map((e) => ({
              id: e.id,
              message: e.message ?? '',
              type: e.type,
              time: formatTime(e.sim_time_sec ?? 0),
            }))
          );
          const notifsFromDb = await loadNotifications(50);
          setNotifications(
            notifsFromDb.map((n) => ({
              id: n.id,
              message: n.message,
              time: new Date(n.created_at).toLocaleTimeString(),
            }))
          );
          // Backfill history for already-completed patients if missing
          for (const p of patients) {
            if (p.status === 'completed') {
              await insertPatientServiceHistory(p);
            }
          }
        } else {
          sim = createSimulator('normal-day');
          sim.setTicketCounter(dbMaxTicket);
          const state = sim.getState();
          for (const sp of state.servicePoints) {
            await upsertServicePoint(sp);
          }
        }
      } else {
        sim = createSimulator('normal-day');
      }
      simulatorRef.current = sim;

      sim.onUpdate = (state) => {
        setPatients(state.patients);
        setServicePoints(state.servicePoints);
        setMetrics(state.metrics);
        setConfig(state.config);
        setIsRunning(state.isRunning);
        setSimTime(sim.formatSimulationTime());

        const history = state.metricsHistory.map((snap: MetricsSnapshot) => ({
          time: formatTime(snap.timestamp),
          waiting: snap.metrics.waitingPatients,
          avgWait: Math.round(snap.metrics.avgWaitTime / 60),
          throughput: snap.metrics.throughputPerHour,
        }));
        setMetricsHistory(history);

        generateEvents(state.patients, state.servicePoints, sim.getSimulationTime());

        // Debounced persist to Supabase
        if (isSupabaseConfigured()) {
          if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
          persistTimeoutRef.current = setTimeout(async () => {
            for (const p of state.patients) {
              const sp = state.servicePoints.find((s) => s.currentPatient?.id === p.id);
              await upsertPatient(p, sp?.id);
              if (p.status === 'completed') {
                await insertPatientServiceHistory(p);
              }
            }
            for (const sp of state.servicePoints) {
              await upsertServicePoint(sp);
            }
            if (state.metricsHistory.length > 0) {
              const last = state.metricsHistory[state.metricsHistory.length - 1];
              await saveMetricsSnapshot(last.timestamp, last.metrics);
            }
            await saveSimulationConfig({
              speed: state.config.speed,
              auto_generate: state.config.autoGenerate,
              patients_per_minute: state.config.patientsPerMinute,
              avg_service_time: state.config.avgServiceTime,
              priority_ratio: state.config.priorityRatio,
              failure_rate: state.config.failureRate,
              active_scenario: state.activeScenario,
              simulation_time_sec: state.simulationTime,
              is_running: state.isRunning,
            });
            persistTimeoutRef.current = null;
          }, 800);
        }
      };
      const state = sim.getState();
      setPatients(state.patients);
      setServicePoints(state.servicePoints);
      setMetrics(state.metrics);
      setConfig(state.config);
      setIsRunning(state.isRunning);
      setSimTime(sim.formatSimulationTime());
      setMetricsHistory(
        state.metricsHistory.map((snap: MetricsSnapshot) => ({
          time: formatTime(snap.timestamp),
          waiting: snap.metrics.waitingPatients,
          avgWait: Math.round(snap.metrics.avgWaitTime / 60),
          throughput: snap.metrics.throughputPerHour,
        }))
      );
      prevPatientsRef.current = state.patients;
      setSimReady(true);
    };
    init();
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      simulatorRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fresh = notifications.filter((n) => !seenNotificationIdsRef.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seenNotificationIdsRef.current.add(n.id));
    setChatMessages((prev) => [
      ...prev,
      ...fresh.map((n) => ({
        id: `chat-system-${n.id}`,
        from: 'system' as const,
        text: n.message,
        time: n.time,
      })),
    ]);
  }, [notifications]);

  const generateEvents = useCallback(
    async (
      currentPatients: Patient[],
      servicePoints?: ServicePoint[],
      simTimeSec?: number
    ) => {
      const prev = prevPatientsRef.current;
      const newEvents: EventLog[] = [];
      type PersistAction =
        | { kind: 'join'; p: Patient; eventMsg: string; notifMsg: string; notifId: string }
        | { kind: 'serve'; p: Patient; eventMsg: string; notifMsg: string; spId: string | null; notifId: string }
        | { kind: 'complete'; p: Patient; eventMsg: string; notifMsg: string; spId: string | null; notifId: string }
        | { kind: 'alert'; p: Patient; eventMsg: string };
      const toPersist: PersistAction[] = [];
      const simT = simTimeSec ?? 0;
      const tStr = formatTime(simT);
      const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      for (const p of currentPatients) {
        const old = prev.find((op) => op.id === p.id);
        if (!old) {
          const eventMsg = `Patient ${p.ticketNumber} joined ${formatServiceType(p.serviceType)} queue via ${p.channel}`;
          const joinMsg = `QFlow: You are #${p.queuePosition} in line for ${formatServiceType(p.serviceType)}. Est. wait: ${Math.max(1, Math.round(p.estimatedWait / 60))} min.`;
          const notifId = `notif-${p.id}-join-${uniq()}`;
          newEvents.push({ id: `evt-${p.id}-join-${uniq()}`, message: eventMsg, type: 'join', time: tStr });
          setNotifications((n) => [
            { id: notifId, message: joinMsg, time: new Date().toLocaleTimeString() },
            ...n,
          ]);
          toPersist.push({ kind: 'join', p, eventMsg, notifMsg: joinMsg, notifId });
        } else if (old.status === 'waiting' && p.status === 'serving') {
          const eventMsg = `Patient ${p.ticketNumber} called to ${formatServiceType(p.serviceType)} service point`;
          const serveMsg = `QFlow: Your turn is next! Please proceed to the ${formatServiceType(p.serviceType)} service point.`;
          const notifId = `notif-${p.id}-serve-${uniq()}`;
          newEvents.push({ id: `evt-${p.id}-serve-${uniq()}`, message: eventMsg, type: 'serve', time: tStr });
          setNotifications((n) => [
            { id: notifId, message: serveMsg, time: new Date().toLocaleTimeString() },
            ...n,
          ]);
          const sp = servicePoints?.find((s) => s.currentPatient?.id === p.id);
          toPersist.push({ kind: 'serve', p, eventMsg, notifMsg: serveMsg, spId: sp?.id ?? null, notifId });
        } else if (old.status === 'serving' && p.status === 'completed') {
          const eventMsg = `Patient ${p.ticketNumber} completed service at ${formatServiceType(p.serviceType)}`;
          const doneMsg = `QFlow: Thank you for visiting Mukono Health Centre IV. Have a healthy day!`;
          const notifId = `notif-${p.id}-complete-${uniq()}`;
          newEvents.push({ id: `evt-${p.id}-complete-${uniq()}`, message: eventMsg, type: 'complete', time: tStr });
          setNotifications((n) => [
            { id: notifId, message: doneMsg, time: new Date().toLocaleTimeString() },
            ...n,
          ]);
          const sp = servicePoints?.find((s) => s.currentPatient?.id === p.id);
          toPersist.push({ kind: 'complete', p, eventMsg, notifMsg: doneMsg, spId: sp?.id ?? null, notifId });
        } else if (old.status !== 'no-show' && p.status === 'no-show') {
          const eventMsg = `Patient ${p.ticketNumber} marked as no-show`;
          newEvents.push({ id: `evt-${p.id}-noshow-${uniq()}`, message: eventMsg, type: 'alert', time: tStr });
          toPersist.push({ kind: 'alert', p, eventMsg });
        }
      }

      prevPatientsRef.current = currentPatients;
      if (newEvents.length > 0) {
        setEvents((e) => [...newEvents, ...e].slice(0, 100));
      }

      const getAiMessage = async (
        type: 'join' | 'turn_next' | 'completed',
        p: Patient,
        fallback: string
      ): Promise<string> => {
        try {
          const res = await fetch('/api/ai/user-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              ticketNumber: p.ticketNumber,
              serviceType: p.serviceType,
              queuePosition: p.queuePosition,
              estimatedWaitMin: Math.max(1, Math.round(p.estimatedWait / 60)),
            }),
          });
          if (!res.ok) return fallback;
          const data = (await res.json()) as { message?: string };
          const msg = data?.message?.trim();
          return msg || fallback;
        } catch {
          return fallback;
        }
      };

      for (const a of toPersist) {
        if (a.kind === 'join') {
          await upsertPatient(a.p, null);
          await insertQueueEvent('join', a.p.id, a.eventMsg, null, simT);
          const msg = await getAiMessage('join', a.p, a.notifMsg);
          setNotifications((n) => n.map((x) => (x.id === a.notifId ? { ...x, message: msg } : x)));
          await insertNotification('joined', msg, a.p.id, a.p.ticketNumber);
        } else if (a.kind === 'serve') {
          await insertQueueEvent('serve', a.p.id, a.eventMsg, a.spId, simT);
          const msg = await getAiMessage('turn_next', a.p, a.notifMsg);
          setNotifications((n) => n.map((x) => (x.id === a.notifId ? { ...x, message: msg } : x)));
          await insertNotification('turn_next', msg, a.p.id, a.p.ticketNumber);
        } else if (a.kind === 'complete') {
          await insertQueueEvent('complete', a.p.id, a.eventMsg, a.spId, simT);
          const msg = await getAiMessage('completed', a.p, a.notifMsg);
          setNotifications((n) => n.map((x) => (x.id === a.notifId ? { ...x, message: msg } : x)));
          await insertNotification('completed', msg, a.p.id, a.p.ticketNumber);
          await insertPatientServiceHistory(a.p);
        } else {
          await insertQueueEvent('alert', a.p.id, a.eventMsg, null, simT);
        }
      }
    },
    []
  );

  // Handlers
  const handleToggleRun = useCallback(() => {
    const sim = simulatorRef.current;
    if (!sim) return;
    if (isRunning) {
      sim.pause();
    } else {
      sim.start();
    }
  }, [isRunning]);

  const handleReset = useCallback(() => {
    const sim = simulatorRef.current;
    if (!sim) return;
    sim.reset();
    setEvents([]);
    setNotifications([]);
    prevPatientsRef.current = [];
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    sim.setSpeed(speed);
  }, []);

  const handleConfigChange = useCallback((partial: Partial<SimulationConfig>) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    sim.setConfig(partial);
  }, []);

  const handleAddPatient = useCallback((input?: ManualPatientInput) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    if (!input) {
      sim.addPatient();
      return;
    }
    sim.addPatient({
      name: input.name,
      phone: input.contact,
      visitReason: input.visitReason,
      serviceType: input.serviceType,
      priority: input.priority as PatientPriority,
      priorityReason: input.priorityReason as PriorityReason | undefined,
      channel: input.channel as PatientChannel,
    });
  }, []);

  const handleLoadScenario = useCallback((scenario: string) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    const scenarioMap: Record<string, ScenarioName> = {
      normal: 'normal-day',
      'monday-rush': 'monday-rush',
      vaccination: 'vaccination-day',
      'staff-shortage': 'staff-shortage',
      'network-outage': 'normal-day',
    };
    const scenarioName = scenarioMap[scenario] || 'normal-day';
    sim.reset(scenarioName);
    setEvents([]);
    setNotifications([]);
    prevPatientsRef.current = [];
    sim.start();
  }, []);

  const handleCallNext = useCallback((servicePointId: string) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    sim.serveNext(servicePointId);
  }, []);

  const handleToggleServicePoint = useCallback((servicePointId: string) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    const sp = servicePoints.find((s) => s.id === servicePointId);
    if (!sp) return;
    const newStatus: ServicePointStatus =
      sp.status === 'active' ? 'break' : 'active';
    sim.setServicePointStatus(servicePointId, newStatus);
  }, [servicePoints]);

  const handleMarkNoShow = useCallback((patientId: string) => {
    const sim = simulatorRef.current;
    if (!sim) return;
    sim.markNoShow(patientId);
  }, []);

  const handleCompleteService = useCallback(
    (patientId: string) => {
      const sim = simulatorRef.current;
      if (!sim) return;
      const sp = servicePoints.find((s) => s.currentPatient?.id === patientId);
      if (!sp) return;
      sim.completeService(sp.id);
    },
    [servicePoints]
  );

  // Phone simulator handlers
  const handleJoinQueue = useCallback(
    (
      serviceType: string,
      priority: string,
      channel: string,
      patientName: string,
      contact: string,
      visitReason: string
    ): Patient | null => {
      const sim = simulatorRef.current;
      if (!sim) return null;

      const serviceMap: Record<string, string> = {
        'opd-triage': 'opd-triage',
        'doctor-consultation': 'consultation',
        pharmacy: 'pharmacy',
        laboratory: 'laboratory',
        cashier: 'cashier',
      };
      const mappedService = serviceMap[serviceType] || 'opd-triage';

      const priorityMap: Record<string, { priority: string; reason?: string }> = {
        normal: { priority: 'normal' },
        elderly: { priority: 'high', reason: 'elderly' },
        pregnant: { priority: 'high', reason: 'pregnant' },
        disability: { priority: 'high', reason: 'pwd' },
        child: { priority: 'urgent', reason: 'child' },
      };
      const prio = priorityMap[priority] || { priority: 'normal' };

      const channelNorm = (channel || 'app').toLowerCase();
      const channelDb: PatientChannel =
        channelNorm === 'ussd' ? 'ussd' : channelNorm === 'sms' ? 'sms' : channelNorm === 'walk-in' ? 'walk-in' : 'app';
      const patient = sim.addPatient({
        serviceType: mappedService as ServiceType,
        priority: prio.priority as PatientPriority,
        priorityReason: prio.reason as PriorityReason,
        channel: channelDb,
        name: patientName.trim(),
        phone: contact.trim(),
        visitReason: visitReason.trim(),
      });
      return patient;
    },
    []
  );

  const handleCheckPosition = useCallback(
    (ticketNumber: string): { position: number; estimatedWait: number } | null => {
      const sim = simulatorRef.current;
      if (!sim) return null;
      const patient = sim.getPatientByTicket(ticketNumber.toUpperCase());
      if (!patient || patient.status !== 'waiting') return null;
      return {
        position: patient.queuePosition,
        estimatedWait: patient.estimatedWait,
      };
    },
    []
  );

  const handleCancelBooking = useCallback((ticketNumber: string): boolean => {
    const sim = simulatorRef.current;
    if (!sim) return false;
    const patient = sim.getPatientByTicket(ticketNumber.toUpperCase());
    if (!patient) return false;
    const result = sim.markNoShow(patient.id);
    return result !== null;
  }, []);

  const handlePatientSmsSend = useCallback(
    async (text: string, ticketNumber?: string) => {
      const msg = text.trim();
      if (!msg) return;
      const now = new Date().toLocaleTimeString();
      setChatMessages((prev) => [
        ...prev,
        {
          id: `chat-patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: 'patient',
          text: msg,
          time: now,
          ticketNumber,
        },
      ]);

      setIsSmsReplying(true);
      try {
        const history = chatMessages.slice(-10).map((m) => ({
          role: m.from === 'patient' ? 'user' : 'assistant',
          text: m.text,
        }));
        const res = await fetch('/api/ai/sms-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            history,
            queueStats: { totalWaiting: metrics.waitingPatients },
          }),
        });
        let reply = 'Thanks. We received your message.';
        if (res.ok) {
          const data = (await res.json()) as { reply?: string };
          if (data.reply?.trim()) reply = data.reply.trim();
        }
        setChatMessages((prev) => [
          ...prev,
          {
            id: `chat-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            from: 'ai',
            text: reply,
            time: new Date().toLocaleTimeString(),
            ticketNumber,
          },
        ]);
      } catch {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `chat-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            from: 'ai',
            text: 'Network issue. Please try again shortly.',
            time: new Date().toLocaleTimeString(),
            ticketNumber,
          },
        ]);
      } finally {
        setIsSmsReplying(false);
      }
    },
    [chatMessages, metrics.waitingPatients]
  );

  const handleAdminChatSend = useCallback((text: string, ticketNumber?: string) => {
    const msg = text.trim();
    if (!msg) return;
    setChatMessages((prev) => [
      ...prev,
      {
        id: `chat-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: 'admin',
        text: msg,
        time: new Date().toLocaleTimeString(),
        ticketNumber,
      },
    ]);
  }, []);

  if (!simReady) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white text-lg mx-auto mb-3 animate-pulse">
            Q
          </div>
          <p className="text-gray-600 font-medium">Loading QFlow...</p>
          <p className="text-sm text-gray-400 mt-1">Connecting to queue state</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-[1920px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white text-lg">
              Q
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                QFlow Simulator Mukono
              </h1>
              <p className="text-xs text-gray-500">
                Smart Virtual Queue Management System &mdash; Mukono Health Centre IV
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/history"
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              History
            </Link>
            <div className="text-sm text-gray-500 font-mono bg-gray-100 px-3 py-1.5 rounded">
              SIM TIME: <span className="text-emerald-600 font-bold">{simTime}</span>
            </div>

            {/* Tab switcher for mobile */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('phone')}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  activeTab === 'phone'
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Phone Sim
              </button>
            </div>

            <div
              className={`flex items-center gap-2 text-sm ${
                isRunning ? 'text-emerald-600' : 'text-amber-500'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {isRunning ? 'Running' : 'Paused'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex max-w-[1920px] mx-auto">
        {/* Simulation Controls Sidebar */}
        <aside className="w-80 min-w-[320px] border-r border-gray-200 h-[calc(100vh-60px)] overflow-y-auto bg-gray-50 hidden lg:block">
          <SimulationControls
            isRunning={isRunning}
            speed={config.speed}
            config={config}
            onToggleRun={handleToggleRun}
            onReset={handleReset}
            onSpeedChange={handleSpeedChange}
            onConfigChange={handleConfigChange}
            onAddPatient={handleAddPatient}
            onLoadScenario={handleLoadScenario}
          />
        </aside>

        {/* Main Panel */}
        <main className="flex-1 h-[calc(100vh-60px)] overflow-y-auto">
          {/* Mobile controls */}
          <div className="lg:hidden p-4 border-b border-gray-200">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleToggleRun}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  isRunning
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {isRunning ? 'Pause' : 'Start'}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700"
              >
                Reset
              </button>
              <button
                onClick={() => handleAddPatient()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white"
              >
                + Patient
              </button>
              <select
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                value={config.speed}
                className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 border border-gray-300"
              >
                <option value={1}>1x Speed</option>
                <option value={2}>2x Speed</option>
                <option value={5}>5x Speed</option>
                <option value={10}>10x Speed</option>
              </select>
            </div>
          </div>

          {activeTab === 'dashboard' ? (
            <AdminDashboard
              patients={patients}
              servicePoints={servicePoints}
              metrics={metrics}
              metricsHistory={metricsHistory}
              events={events}
              onCallNext={handleCallNext}
              onToggleServicePoint={handleToggleServicePoint}
              onMarkNoShow={handleMarkNoShow}
              onCompleteService={handleCompleteService}
              chatMessages={chatMessages}
              onAdminChatSend={handleAdminChatSend}
            />
          ) : (
            <div className="flex items-center justify-center p-8 min-h-[calc(100vh-120px)] bg-gray-50">
              <PhoneSimulator
                onJoinQueue={handleJoinQueue}
                onCheckPosition={handleCheckPosition}
                onCancelBooking={handleCancelBooking}
                notifications={notifications}
                queueStats={{ totalWaiting: metrics.waitingPatients }}
                smsMessages={chatMessages}
                isSmsReplying={isSmsReplying}
                onSendSms={handlePatientSmsSend}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function formatServiceType(type: string): string {
  const map: Record<string, string> = {
    'opd-triage': 'OPD Triage',
    consultation: 'Doctor Consultation',
    pharmacy: 'Pharmacy',
    laboratory: 'Laboratory',
    cashier: 'Cashier',
  };
  return map[type] || type;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
