'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Patient, ServicePointStatus, ServiceType, PatientPriority, PriorityReason, PatientChannel } from '../lib/queueEngine';
import PhoneSimulator from '../components/PhoneSimulator';
import AdminDashboard from '../components/AdminDashboard';
import SimulationControls from '../components/SimulationControls';
import LiveHeader from '../components/layout/LiveHeader';
import QueueSidebar from '../components/layout/QueueSidebar';
import { useQueueRealtime } from '../hooks/useQueueRealtime';
import { useTrainingSimulator } from '../hooks/useTrainingSimulator';
import type { ManualPatientInput } from '../components/SimulationControls';
import { validateSmsMessage, normalizeUgandaPhone, DEFAULT_SIMULATOR_PHONE } from '../lib/validation';
import UgandaPhoneInput from '../components/UgandaPhoneInput';

interface ChatMessage {
  id: string;
  from: 'patient' | 'admin' | 'ai' | 'system';
  text: string;
  time: string;
  ticketNumber?: string;
}

export default function Home() {
  const [trainingMode, setTrainingMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'phone'>('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSmsReplying, setIsSmsReplying] = useState(false);
  const [recentPatientIds, setRecentPatientIds] = useState<Set<string>>(new Set());
  const chatMessagesRef = useRef<ChatMessage[]>([]);

  const live = useQueueRealtime();
  const training = useTrainingSimulator(trainingMode);

  const patients = trainingMode ? training.patients : live.patients;
  const servicePoints = trainingMode ? training.servicePoints : live.servicePoints;
  const metrics = trainingMode ? training.metrics : live.metrics;
  const events = trainingMode ? [] : live.events;
  const liveNotifications = live.notifications;
  const notifications = useMemo(
    () => (trainingMode ? [] : liveNotifications),
    [trainingMode, liveNotifications]
  );
  const connectionStatus = trainingMode ? 'connected' as const : live.connectionStatus;
  const isLoading = !trainingMode && live.isLoading;

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const resolvePatientForSms = useCallback(
    (text: string, ticketHint?: string): Patient | undefined => {
      const ticketMatch =
        ticketHint?.toUpperCase() ?? text.match(/QF-\d+/i)?.[0]?.toUpperCase();
      if (ticketMatch) {
        return patients.find((p) => p.ticketNumber.toUpperCase() === ticketMatch);
      }
      const phone = normalizeUgandaPhone(DEFAULT_SIMULATOR_PHONE);
      return patients.find(
        (p) =>
          normalizeUgandaPhone(p.telephone ?? p.phone) === phone &&
          (p.status === 'waiting' || p.status === 'serving')
      );
    },
    [patients]
  );

  useEffect(() => {
    if (trainingMode || notifications.length === 0) return;
    setChatMessages((prev) => {
      const existing = new Set(prev.map((m) => m.id));
      const fresh = notifications
        .filter((n) => !existing.has(`chat-${n.id}`))
        .map((n) => ({
          id: `chat-${n.id}`,
          from: 'system' as const,
          text: n.message,
          time: n.time,
          ticketNumber: n.ticketNumber,
        }));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, [notifications, trainingMode]);

  useEffect(() => {
    if (trainingMode) return;
    const active = live.patients.filter((p) => p.status === 'waiting' || p.status === 'serving');
    setRecentPatientIds(new Set(active.map((p) => p.id)));
    const t = setTimeout(() => setRecentPatientIds(new Set()), 2000);
    return () => clearTimeout(t);
  }, [live.patients, trainingMode]);

  const apiPost = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Request failed');
    }
    return res.json();
  };

  const handleJoinQueue = useCallback(
    async (
      serviceType: string,
      priority: string,
      channel: string,
      patientName: string,
      contact: string,
      visitReason: string
    ): Promise<Patient | null> => {
      if (trainingMode) {
        const sim = training.getSim();
        if (!sim) return null;
        const serviceMap: Record<string, string> = {
          'opd-triage': 'opd-triage',
          'doctor-consultation': 'consultation',
          pharmacy: 'pharmacy',
          laboratory: 'laboratory',
          cashier: 'cashier',
        };
        const priorityMap: Record<string, { priority: string; reason?: string }> = {
          normal: { priority: 'normal' },
          elderly: { priority: 'high', reason: 'elderly' },
          pregnant: { priority: 'high', reason: 'pregnant' },
          disability: { priority: 'high', reason: 'pwd' },
          child: { priority: 'urgent', reason: 'child' },
          emergency: { priority: 'urgent', reason: 'emergency' },
        };
        const prio = priorityMap[priority] || { priority: 'normal' };
        const telephone = normalizeUgandaPhone(contact.trim());
        return sim.addPatient({
          serviceType: (serviceMap[serviceType] || 'opd-triage') as ServiceType,
          priority: prio.priority as PatientPriority,
          priorityReason: prio.reason as PriorityReason,
          channel: (channel?.toLowerCase() === 'ussd' ? 'ussd' : 'app') as PatientChannel,
          name: patientName.trim(),
          phone: telephone,
          telephone,
          visitReason: visitReason.trim(),
        });
      }

      try {
        const data = await apiPost('/api/queue/join', {
          name: patientName,
          telephone: normalizeUgandaPhone(contact),
          visitReason,
          serviceType,
          priority,
          priorityReason: priority !== 'normal' ? priority : undefined,
          channel: channel || 'ussd',
        });
        return (data as { patient: Patient }).patient;
      } catch {
        return null;
      }
    },
    [trainingMode, training]
  );

  const handleCheckPosition = useCallback(
    (ticketNumber: string) => {
      const patient = patients.find(
        (p) => p.ticketNumber.toUpperCase() === ticketNumber.toUpperCase()
      );
      if (!patient || patient.status !== 'waiting') return null;
      return { position: patient.queuePosition, estimatedWait: Math.max(1, Math.round(patient.estimatedWait / 60)) };
    },
    [patients]
  );

  const handleCancelBooking = useCallback(
    async (ticketNumber: string) => {
      const patient = patients.find(
        (p) => p.ticketNumber.toUpperCase() === ticketNumber.toUpperCase()
      );
      if (!patient) return false;
      if (trainingMode) {
        return training.getSim()?.markNoShow(patient.id) !== null;
      }
      try {
        await apiPost('/api/queue/no-show', { patientId: patient.id });
        return true;
      } catch {
        return false;
      }
    },
    [patients, trainingMode, training]
  );

  const handleCallNext = useCallback(
    async (servicePointId: string) => {
      if (trainingMode) {
        training.getSim()?.serveNext(servicePointId);
        return;
      }
      await apiPost('/api/queue/serve', { servicePointId });
    },
    [trainingMode, training]
  );

  const handleCompleteService = useCallback(
    async (patientId: string) => {
      if (trainingMode) {
        training.getSim()?.completePatient(patientId);
        return;
      }
      try {
        await apiPost('/api/queue/complete', { patientId });
      } catch (e) {
        console.error('[QFlow] Complete failed:', e);
      }
    },
    [trainingMode, training]
  );

  const handleMarkNoShow = useCallback(
    async (patientId: string) => {
      if (trainingMode) {
        training.getSim()?.markNoShow(patientId);
        return;
      }
      await apiPost('/api/queue/no-show', { patientId });
    },
    [trainingMode, training]
  );

  const handleToggleServicePoint = useCallback(
    async (servicePointId: string) => {
      if (trainingMode) {
        const sp = servicePoints.find((s) => s.id === servicePointId);
        if (!sp) return;
        const newStatus: ServicePointStatus = sp.status === 'active' ? 'break' : 'active';
        training.getSim()?.setServicePointStatus(servicePointId, newStatus);
        return;
      }
      await fetch('/api/queue/service-point', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicePointId }),
      });
    },
    [trainingMode, training, servicePoints]
  );

  const handleAddPatientLive = useCallback(
    async (input: ManualPatientInput) => {
      await apiPost('/api/queue/join', {
        name: input.name,
        telephone: input.telephone,
        visitReason: input.visitReason,
        serviceType: input.serviceType,
        priority: input.priority,
        priorityReason: input.priorityReason,
        channel: input.channel,
      });
      setShowAddModal(false);
    },
    []
  );

  const handlePatientSmsSend = useCallback(
    async (text: string, ticketNumber?: string) => {
      if (validateSmsMessage(text)) return;

      const patient = resolvePatientForSms(text, ticketNumber);
      const ticket = patient?.ticketNumber ?? ticketNumber;
      const now = new Date().toLocaleTimeString();
      const patientMsg: ChatMessage = {
        id: `chat-p-${Date.now()}`,
        from: 'patient',
        text,
        time: now,
        ticketNumber: ticket,
      };

      const history = [...chatMessagesRef.current, patientMsg]
        .filter((m) => m.from === 'patient' || m.from === 'ai' || m.from === 'system')
        .slice(-10)
        .map((m) => ({
          role: (m.from === 'patient' ? 'user' : 'assistant') as 'user' | 'assistant',
          text: m.text,
        }));

      setChatMessages((prev) => [...prev, patientMsg]);
      setIsSmsReplying(true);

      try {
        const res = await fetch('/api/ai/sms-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history,
            ticketNumber: ticket,
            patientContext: patient
              ? {
                  ticketNumber: patient.ticketNumber,
                  name: patient.name,
                  status: patient.status,
                  queuePosition: patient.queuePosition,
                  estimatedWaitMin: Math.max(1, Math.round(patient.estimatedWait / 60)),
                  serviceType: patient.serviceType,
                }
              : undefined,
            queueStats: { totalWaiting: metrics.waitingPatients },
          }),
        });

        const data = (await res.json().catch(() => ({}))) as { reply?: string };
        const reply =
          data.reply?.trim() ??
          'QFlow: Thanks for your message. Dial *285*70# for queue help.';

        setChatMessages((prev) => [
          ...prev,
          {
            id: `chat-ai-${Date.now()}`,
            from: 'ai',
            text: reply,
            time: new Date().toLocaleTimeString(),
            ticketNumber: ticket,
          },
        ]);
      } finally {
        setIsSmsReplying(false);
      }
    },
    [resolvePatientForSms, metrics.waitingPatients]
  );

  const handleAdminChatSend = useCallback((text: string, ticketNumber?: string) => {
    if (validateSmsMessage(text)) return;
    setChatMessages((prev) => [
      ...prev,
      { id: `chat-admin-${Date.now()}`, from: 'admin', text, time: new Date().toLocaleTimeString(), ticketNumber },
    ]);
  }, []);

  if (isLoading || (trainingMode && !training.ready)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white text-lg mx-auto mb-3 animate-pulse">
            Q
          </div>
          <p className="text-white font-medium">Connecting to live queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <LiveHeader
        connectionStatus={connectionStatus}
        trainingMode={trainingMode}
        onTrainingModeChange={setTrainingMode}
        simTime={training.simTime}
        isRunning={training.isRunning}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex max-w-[1920px] mx-auto">
        <aside className="w-80 min-w-[280px] hidden lg:block h-[calc(100vh-60px)]">
          <QueueSidebar
            metrics={metrics}
            trainingMode={trainingMode}
            onAddPatient={() => setShowAddModal(true)}
          >
            <SimulationControls
              isRunning={training.isRunning}
              speed={training.config.speed}
              config={training.config}
              onToggleRun={() => {
                const sim = training.getSim();
                if (!sim) return;
                if (training.isRunning) sim.pause();
                else sim.start();
              }}
              onReset={() => training.getSim()?.reset()}
              onSpeedChange={(s) => training.getSim()?.setSpeed(s)}
              onConfigChange={(p) => training.getSim()?.setConfig(p)}
              onAddPatient={(input) => {
                if (input) training.getSim()?.addPatient({
                  name: input.name,
                  phone: input.telephone,
                  telephone: input.telephone,
                  visitReason: input.visitReason,
                  serviceType: input.serviceType,
                  priority: input.priority,
                  priorityReason: input.priorityReason,
                  channel: input.channel,
                });
              }}
              onLoadScenario={(s) => {
                const map: Record<string, string> = {
                  normal: 'normal-day',
                  'monday-rush': 'monday-rush',
                  vaccination: 'vaccination-day',
                  'staff-shortage': 'staff-shortage',
                };
                training.getSim()?.reset((map[s] ?? 'normal-day') as 'normal-day');
                training.getSim()?.start();
              }}
            />
          </QueueSidebar>
        </aside>

        <main className="flex-1 h-[calc(100vh-60px)] overflow-y-auto">
          <div className="lg:hidden flex gap-2 p-3 border-b border-gray-200 bg-white">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white"
            >
              + Patient
            </button>
            <a
              href="/display"
              target="_blank"
              className="flex-1 py-2 rounded-lg text-center text-sm font-medium bg-slate-800 text-white"
            >
              Display
            </a>
          </div>

          {activeTab === 'dashboard' ? (
            <AdminDashboard
              patients={patients}
              servicePoints={servicePoints}
              metrics={metrics}
              metricsHistory={[]}
              events={events}
              onCallNext={handleCallNext}
              onToggleServicePoint={handleToggleServicePoint}
              onMarkNoShow={handleMarkNoShow}
              onCompleteService={handleCompleteService}
              chatMessages={chatMessages}
              onAdminChatSend={handleAdminChatSend}
              liveMode={!trainingMode}
              recentPatientIds={recentPatientIds}
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

      {showAddModal && !trainingMode && (
        <WalkInModal onClose={() => setShowAddModal(false)} onSubmit={handleAddPatientLive} />
      )}
      {showAddModal && trainingMode && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 max-w-md w-full">
            <p className="text-sm text-gray-600 mb-2">Use Training sidebar or Phone tab in training mode.</p>
            <button onClick={() => setShowAddModal(false)} className="px-3 py-2 bg-gray-100 rounded text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function WalkInModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: ManualPatientInput) => Promise<void>;
}) {
  const [form, setForm] = useState<ManualPatientInput>({
    name: '',
    telephone: DEFAULT_SIMULATOR_PHONE,
    visitReason: '',
    serviceType: 'opd-triage',
    priority: 'normal',
    channel: 'walk-in',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const { validatePatientJoinInput, normalizeUgandaPhone } = await import('../lib/validation');
    const tel = normalizeUgandaPhone(form.telephone);
    const v = validatePatientJoinInput({ ...form, telephone: tel });
    if (!v.valid) { setErrors(v.errors); return; }
    setSaving(true);
    try {
      await onSubmit({ ...form, telephone: tel });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border shadow-xl p-4">
        <h3 className="font-semibold mb-3">Add Walk-in Patient</h3>
        <div className="space-y-2">
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Name" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          <UgandaPhoneInput
            value={form.telephone}
            onChange={(telephone) => setForm((f) => ({ ...f, telephone }))}
            error={errors.telephone}
          />
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Visit reason" value={form.visitReason}
            onChange={(e) => setForm((f) => ({ ...f, visitReason: e.target.value }))} />
          <select className="w-full border rounded px-3 py-2 text-sm" value={form.serviceType}
            onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value as ManualPatientInput['serviceType'] }))}>
            <option value="opd-triage">OPD Triage</option>
            <option value="consultation">Consultation</option>
            <option value="pharmacy">Pharmacy</option>
            <option value="laboratory">Laboratory</option>
            <option value="cashier">Cashier</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 text-sm bg-gray-100 rounded">Cancel</button>
          <button onClick={() => void submit()} disabled={saving} className="px-3 py-2 text-sm bg-emerald-600 text-white rounded font-semibold">
            {saving ? 'Adding...' : 'Add Patient'}
          </button>
        </div>
      </div>
    </div>
  );
}
