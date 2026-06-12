'use client';

import { useState, useEffect, useRef } from 'react';
import {
  QueueSimulator,
  createSimulator,
  type Patient,
  type ServicePoint,
  type QueueMetrics,
  type SimulationConfig,
  type ScenarioName,
} from '@/lib/queueEngine';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  loadPatients,
  loadServicePoints,
  loadSimulationConfig,
  loadMaxTicketNumber,
  rowToPatient,
  rowToServicePoint,
  upsertPatient,
  upsertServicePoint,
  saveSimulationConfig,
} from '@/lib/queueSupabaseSync';

export function useTrainingSimulator(enabled: boolean) {
  const simulatorRef = useRef<QueueSimulator | null>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [config, setConfig] = useState<SimulationConfig>({
    speed: 1,
    autoGenerate: false,
    patientsPerMinute: 0,
    avgServiceTime: 180,
    priorityRatio: 0.2,
    failureRate: 0.03,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [simTime, setSimTime] = useState('00:00:00');
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      simulatorRef.current?.destroy();
      simulatorRef.current = null;
      setReady(true);
      return;
    }

    let sim: QueueSimulator;
    const init = async () => {
      if (isSupabaseConfigured()) {
        const [loadedPatients, loadedSP, savedConfig, dbMax] = await Promise.all([
          loadPatients(),
          loadServicePoints(),
          loadSimulationConfig(),
          loadMaxTicketNumber(),
        ]);
        const scenario = (savedConfig?.active_scenario ?? 'normal-day') as ScenarioName;
        sim = createSimulator(scenario);
        if (loadedSP.length > 0) {
          const pts = loadedPatients.map(rowToPatient);
          const byId = new Map(pts.map((p) => [p.id, p]));
          const sps = loadedSP.map((r) =>
            rowToServicePoint(r, r.current_patient_id ? byId.get(r.current_patient_id) : undefined)
          );
          const ticketCounter = Math.max(
            dbMax,
            ...pts.map((p) => {
              const m = p.ticketNumber.match(/QF-(\d+)/);
              return m ? parseInt(m[1], 10) : 0;
            })
          );
          sim.loadPersistedState({
            patients: pts,
            servicePoints: sps,
            simulationTime: savedConfig?.simulation_time_sec ?? 0,
            ticketCounter,
          });
        } else {
          sim.setTicketCounter(dbMax);
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

        if (isSupabaseConfigured()) {
          if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
          persistTimeoutRef.current = setTimeout(async () => {
            for (const p of state.patients) {
              const sp = state.servicePoints.find((s) => s.currentPatient?.id === p.id);
              await upsertPatient(p, sp?.id);
            }
            for (const sp of state.servicePoints) await upsertServicePoint(sp);
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
      setReady(true);
    };

    void init();
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      simulatorRef.current?.destroy();
    };
  }, [enabled]);

  const getSim = () => simulatorRef.current;

  return {
    ready,
    patients,
    servicePoints,
    metrics,
    config,
    isRunning,
    simTime,
    getSim,
    setPatients,
    setServicePoints,
    setMetrics,
    setConfig,
    setIsRunning,
  };
}
