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
import PhoneSimulator from '../components/PhoneSimulator';
import AdminDashboard from '../components/AdminDashboard';
import SimulationControls from '../components/SimulationControls';

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
    autoGenerate: true,
    patientsPerMinute: 5,
    avgServiceTime: 180,
    priorityRatio: 0.2,
    failureRate: 0.03,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [simTime, setSimTime] = useState('00:00:00');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'phone'>('dashboard');

  const prevPatientsRef = useRef<Patient[]>([]);

  // Initialize simulator
  useEffect(() => {
    const sim = createSimulator('normal-day');
    simulatorRef.current = sim;

    sim.onUpdate = (state) => {
      setPatients(state.patients);
      setServicePoints(state.servicePoints);
      setMetrics(state.metrics);
      setConfig(state.config);
      setIsRunning(state.isRunning);
      setSimTime(sim.formatSimulationTime());

      // Convert metrics history
      const history = state.metricsHistory.map((snap: MetricsSnapshot) => ({
        time: formatTime(snap.timestamp),
        waiting: snap.metrics.waitingPatients,
        avgWait: Math.round(snap.metrics.avgWaitTime / 60),
        throughput: snap.metrics.throughputPerHour,
      }));
      setMetricsHistory(history);

      // Generate events from patient state changes
      generateEvents(state.patients);
    };

    return () => {
      sim.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateEvents = useCallback((currentPatients: Patient[]) => {
    const prev = prevPatientsRef.current;
    const newEvents: EventLog[] = [];

    for (const p of currentPatients) {
      const old = prev.find((op) => op.id === p.id);
      if (!old) {
        newEvents.push({
          id: `evt-${p.id}-join`,
          message: `Patient ${p.ticketNumber} (${p.name}) joined ${formatServiceType(p.serviceType)} queue via ${p.channel}`,
          type: 'join',
          time: simTime,
        });

        // Add notification
        setNotifications((n) => [
          {
            id: `notif-${p.id}-join`,
            message: `QFlow: You are #${p.queuePosition} in line for ${formatServiceType(p.serviceType)}. Est. wait: ${Math.max(1, Math.round(p.estimatedWait / 60))} min.`,
            time: new Date().toLocaleTimeString(),
          },
          ...n,
        ]);
      } else if (old.status === 'waiting' && p.status === 'serving') {
        newEvents.push({
          id: `evt-${p.id}-serve`,
          message: `Patient ${p.ticketNumber} called to ${formatServiceType(p.serviceType)} service point`,
          type: 'serve',
          time: simTime,
        });
        setNotifications((n) => [
          {
            id: `notif-${p.id}-serve`,
            message: `QFlow: Your turn is next! Please proceed to the ${formatServiceType(p.serviceType)} service point.`,
            time: new Date().toLocaleTimeString(),
          },
          ...n,
        ]);
      } else if (old.status === 'serving' && p.status === 'completed') {
        newEvents.push({
          id: `evt-${p.id}-complete`,
          message: `Patient ${p.ticketNumber} completed service at ${formatServiceType(p.serviceType)}`,
          type: 'complete',
          time: simTime,
        });
        setNotifications((n) => [
          {
            id: `notif-${p.id}-complete`,
            message: `QFlow: Thank you for visiting Mukono Health Centre IV. Have a healthy day!`,
            time: new Date().toLocaleTimeString(),
          },
          ...n,
        ]);
      } else if (old.status !== 'no-show' && p.status === 'no-show') {
        newEvents.push({
          id: `evt-${p.id}-noshow`,
          message: `Patient ${p.ticketNumber} marked as no-show`,
          type: 'alert',
          time: simTime,
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((e) => [...newEvents, ...e].slice(0, 100));
    }

    prevPatientsRef.current = currentPatients;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTime]);

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

  const handleAddPatient = useCallback(() => {
    const sim = simulatorRef.current;
    if (!sim) return;
    sim.addPatient();
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

  // Phone simulator handlers
  const handleJoinQueue = useCallback(
    (serviceType: string, priority: string, channel: string): Patient | null => {
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

      const patient = sim.addPatient({
        serviceType: mappedService as ServiceType,
        priority: prio.priority as PatientPriority,
        priorityReason: prio.reason as PriorityReason,
        channel: channel as PatientChannel,
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
                QFlow Simulator
              </h1>
              <p className="text-xs text-gray-500">
                Smart Virtual Queue Management System &mdash; Mukono Health Centre IV
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
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
                onClick={handleAddPatient}
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
            />
          ) : (
            <div className="flex items-center justify-center p-8 min-h-[calc(100vh-120px)] bg-gray-50">
              <PhoneSimulator
                onJoinQueue={handleJoinQueue}
                onCheckPosition={handleCheckPosition}
                onCancelBooking={handleCancelBooking}
                notifications={notifications}
                queueStats={{ totalWaiting: metrics.waitingPatients }}
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
