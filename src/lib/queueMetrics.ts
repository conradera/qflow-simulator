import type { Patient, QueueMetrics, ServiceType } from './queueEngine';

const SERVICE_TYPES: ServiceType[] = [
  'opd-triage',
  'consultation',
  'pharmacy',
  'laboratory',
  'cashier',
];

export function computeLiveMetrics(patients: Patient[]): QueueMetrics {
  const waiting = patients.filter((p) => p.status === 'waiting');
  const serving = patients.filter((p) => p.status === 'serving');
  const completed = patients.filter((p) => p.status === 'completed');
  const noShow = patients.filter((p) => p.status === 'no-show');
  const nowSec = Math.floor(Date.now() / 1000);

  let avgWaitTime = 0;
  if (completed.length > 0) {
    const totalWait = completed.reduce((sum, p) => {
      const served = p.servedAt ?? p.joinedAt;
      return sum + Math.max(0, served - p.joinedAt);
    }, 0);
    avgWaitTime = totalWait / completed.length;
  }

  let avgServiceTime = 0;
  if (completed.length > 0) {
    const totalService = completed.reduce((sum, p) => {
      const end = p.completedAt ?? p.servedAt ?? p.joinedAt;
      const start = p.servedAt ?? p.joinedAt;
      return sum + Math.max(0, end - start);
    }, 0);
    avgServiceTime = totalService / completed.length;
  }

  const earliestJoin = completed.length
    ? Math.min(...completed.map((p) => p.joinedAt))
    : nowSec;
  const elapsedHours = Math.max((nowSec - earliestJoin) / 3600, 1 / 3600);
  const throughputPerHour = completed.length / elapsedHours;

  let longestWait = 0;
  for (const p of waiting) {
    const w = nowSec - p.joinedAt;
    if (w > longestWait) longestWait = w;
  }

  const queuesByService = {} as Record<ServiceType, number>;
  for (const st of SERVICE_TYPES) {
    queuesByService[st] = patients.filter(
      (p) => p.serviceType === st && p.status === 'waiting'
    ).length;
  }

  return {
    totalPatients: patients.length,
    waitingPatients: waiting.length,
    servingPatients: serving.length,
    completedPatients: completed.length,
    noShowPatients: noShow.length,
    avgWaitTime: Math.round(avgWaitTime),
    avgServiceTime: Math.round(avgServiceTime),
    throughputPerHour: Math.round(throughputPerHour * 10) / 10,
    longestWait,
    queuesByService,
  };
}
