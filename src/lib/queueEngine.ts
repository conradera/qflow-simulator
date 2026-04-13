// =============================================================================
// QFlow Smart Virtual Queue Management System - Queue Simulation Engine
// Mukono Health Centre IV, Uganda
// =============================================================================

// -----------------------------------------------------------------------------
// Types & Interfaces
// -----------------------------------------------------------------------------

export type ServiceType =
  | 'opd-triage'
  | 'consultation'
  | 'pharmacy'
  | 'laboratory'
  | 'cashier';

export type PatientPriority = 'normal' | 'high' | 'urgent';
export type PatientStatus = 'waiting' | 'serving' | 'completed' | 'no-show';
export type PatientChannel = 'ussd' | 'sms' | 'app' | 'walk-in';
export type PriorityReason = 'elderly' | 'pregnant' | 'pwd' | 'child';
export type ServicePointStatus = 'active' | 'inactive' | 'break';

export interface Patient {
  id: string;
  name: string;
  phone: string;
  visitReason?: string;
  ticketNumber: string;
  priority: PatientPriority;
  priorityReason?: PriorityReason;
  status: PatientStatus;
  serviceType: ServiceType;
  joinedAt: number;
  servedAt?: number;
  completedAt?: number;
  estimatedWait: number;
  queuePosition: number;
  channel: PatientChannel;
}

export interface ServicePoint {
  id: string;
  name: string;
  type: ServiceType;
  status: ServicePointStatus;
  currentPatient?: Patient;
  staffName: string;
  patientsServed: number;
  avgServiceTime: number; // in seconds
}

export interface QueueMetrics {
  totalPatients: number;
  waitingPatients: number;
  servingPatients: number;
  completedPatients: number;
  noShowPatients: number;
  avgWaitTime: number;
  avgServiceTime: number;
  throughputPerHour: number;
  longestWait: number;
  queuesByService: Record<ServiceType, number>;
}

export interface SimulationConfig {
  speed: number; // 1x, 2x, 5x, 10x
  autoGenerate: boolean;
  patientsPerMinute: number;
  avgServiceTime: number; // seconds
  priorityRatio: number; // 0-1, what % are priority
  failureRate: number; // 0-1
}

export interface MetricsSnapshot {
  timestamp: number;
  metrics: QueueMetrics;
}

export type USSDMenuState =
  | 'welcome'
  | 'select-service'
  | 'confirm-details'
  | 'ticket-issued'
  | 'check-status'
  | 'cancel';

export interface USSDSession {
  sessionId: string;
  phone: string;
  state: USSDMenuState;
  selectedService?: ServiceType;
  createdAt: number;
  lastInput?: string;
}

export type ScenarioName =
  | 'normal-day'
  | 'monday-rush'
  | 'vaccination-day'
  | 'staff-shortage';

export interface Scenario {
  name: ScenarioName;
  label: string;
  description: string;
  config: Partial<SimulationConfig>;
  servicePoints: ServicePoint[];
}

export interface QueueState {
  patients: Patient[];
  servicePoints: ServicePoint[];
  metrics: QueueMetrics;
  metricsHistory: MetricsSnapshot[];
  config: SimulationConfig;
  isRunning: boolean;
  simulationTime: number;
  activeScenario: ScenarioName;
  ussdSessions: Map<string, USSDSession>;
}

export type UpdateCallback = (state: QueueState) => void;

// -----------------------------------------------------------------------------
// Service & queue constants
// -----------------------------------------------------------------------------

const SERVICE_NAMES: Record<ServiceType, string> = {
  'opd-triage': 'OPD Triage',
  'consultation': 'Doctor Consultation',
  'pharmacy': 'Pharmacy',
  'laboratory': 'Laboratory',
  'cashier': 'Cashier',
};

const DEFAULT_SERVICE_TIMES: Record<ServiceType, number> = {
  'opd-triage': 180, // 3 min
  'consultation': 600, // 10 min
  'pharmacy': 120, // 2 min
  'laboratory': 300, // 5 min
  'cashier': 90, // 1.5 min
};

const CHANNELS: PatientChannel[] = ['ussd', 'sms', 'app', 'walk-in'];
const CHANNEL_WEIGHTS = [0.35, 0.2, 0.15, 0.3];

const SERVICE_TYPES: ServiceType[] = [
  'opd-triage',
  'consultation',
  'pharmacy',
  'laboratory',
  'cashier',
];

// -----------------------------------------------------------------------------
// Utility Helpers
// -----------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generateUgandanPhone(): string {
  const prefixes = ['70', '71', '72', '74', '75', '76', '77', '78', '79'];
  const prefix = randomChoice(prefixes);
  const number = String(randomInt(1000000, 9999999));
  return `+256${prefix}${number}`;
}

function generateId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function generateSessionId(): string {
  return `ussd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// -----------------------------------------------------------------------------
// USSD Menu Renderer
// -----------------------------------------------------------------------------

function renderUSSDMenu(
  session: USSDSession,
  ticketNumber?: string,
  position?: number,
  estimatedWait?: number
): string {
  switch (session.state) {
    case 'welcome':
      return [
        'Welcome to QFlow',
        'Mukono Health Centre IV',
        '',
        '1. Join Queue',
        '2. Check Queue Status',
        '3. Cancel Queue Ticket',
      ].join('\n');

    case 'select-service':
      return [
        'Select Service:',
        '',
        '1. OPD Triage',
        '2. Doctor Consultation',
        '3. Pharmacy',
        '4. Laboratory',
        '5. Cashier',
        '',
        '0. Back',
      ].join('\n');

    case 'confirm-details':
      return [
        `Service: ${SERVICE_NAMES[session.selectedService!]}`,
        '',
        'Confirm joining queue?',
        '1. Yes',
        '2. No, go back',
      ].join('\n');

    case 'ticket-issued':
      return [
        'Ticket Issued!',
        `Ticket: ${ticketNumber}`,
        `Position: ${position}`,
        `Est. Wait: ${estimatedWait} min`,
        '',
        'You will receive an SMS',
        'when your turn is near.',
        '',
        '0. Done',
      ].join('\n');

    case 'check-status':
      if (ticketNumber) {
        return [
          'Queue Status',
          `Ticket: ${ticketNumber}`,
          `Position: ${position}`,
          `Est. Wait: ${estimatedWait} min`,
          '',
          '0. Back',
        ].join('\n');
      }
      return ['No active ticket found', 'for this number.', '', '0. Back'].join(
        '\n'
      );

    case 'cancel':
      return [
        'Your ticket has been',
        'cancelled successfully.',
        '',
        '0. Done',
      ].join('\n');

    default:
      return 'Invalid state';
  }
}

// -----------------------------------------------------------------------------
// Scenarios
// -----------------------------------------------------------------------------

function buildServicePoints(
  overrides?: Partial<Record<ServiceType, number>>
): ServicePoint[] {
  const counts: Record<ServiceType, number> = {
    'opd-triage': 2,
    'consultation': 3,
    'pharmacy': 2,
    'laboratory': 2,
    'cashier': 1,
    ...overrides,
  };

  const points: ServicePoint[] = [];
  for (const type of SERVICE_TYPES) {
    const count = counts[type];
    for (let i = 0; i < count; i++) {
      points.push({
        id: `sp-${type}-${i + 1}`,
        name: `${SERVICE_NAMES[type]} ${i + 1}`,
        type,
        status: 'active',
        staffName: '',
        patientsServed: 0,
        avgServiceTime: DEFAULT_SERVICE_TIMES[type],
      });
    }
  }
  return points;
}

export const SCENARIOS: Record<ScenarioName, Scenario> = {
  'normal-day': {
    name: 'normal-day',
    label: 'Normal Day',
    description:
      'A typical day at Mukono Health Centre IV with steady patient flow.',
    config: {
      speed: 1,
      autoGenerate: false,
      patientsPerMinute: 0.5,
      avgServiceTime: 300,
      priorityRatio: 0.15,
      failureRate: 0.02,
    },
    servicePoints: buildServicePoints(),
  },

  'monday-rush': {
    name: 'monday-rush',
    label: 'Monday Rush',
    description: 'Monday morning rush - highest patient volume of the week.',
    config: {
      speed: 1,
      autoGenerate: false,
      patientsPerMinute: 2,
      avgServiceTime: 250,
      priorityRatio: 0.2,
      failureRate: 0.05,
    },
    servicePoints: buildServicePoints(),
  },

  'vaccination-day': {
    name: 'vaccination-day',
    label: 'Vaccination Day',
    description:
      'Special vaccination outreach day. High volume of children and mothers.',
    config: {
      speed: 1,
      autoGenerate: false,
      patientsPerMinute: 3,
      avgServiceTime: 180,
      priorityRatio: 0.6,
      failureRate: 0.03,
    },
    servicePoints: buildServicePoints({
      'opd-triage': 3,
      'consultation': 4,
      'pharmacy': 3,
    }),
  },

  'staff-shortage': {
    name: 'staff-shortage',
    label: 'Staff Shortage',
    description: 'Reduced staffing day - longer wait times expected.',
    config: {
      speed: 1,
      autoGenerate: false,
      patientsPerMinute: 0.8,
      avgServiceTime: 400,
      priorityRatio: 0.15,
      failureRate: 0.08,
    },
    servicePoints: buildServicePoints({
      'opd-triage': 1,
      'consultation': 1,
      'pharmacy': 1,
      'laboratory': 1,
      'cashier': 1,
    }),
  },
};

// -----------------------------------------------------------------------------
// QueueSimulator
// -----------------------------------------------------------------------------

export class QueueSimulator {
  private patients: Patient[] = [];
  private servicePoints: ServicePoint[] = [];
  private config: SimulationConfig;
  private isRunning = false;
  private simulationTime = 0; // simulated elapsed seconds
  private ticketCounter = 0;
  private metricsHistory: MetricsSnapshot[] = [];
  private ussdSessions: Map<string, USSDSession> = new Map();
  private activeScenario: ScenarioName = 'normal-day';

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private autoGenAccumulator = 0;

  public onUpdate: UpdateCallback | null = null;

  // ---- lifecycle -----------------------------------------------------------

  constructor(scenario?: ScenarioName) {
    const chosen = scenario ?? 'normal-day';
    const s = SCENARIOS[chosen];
    this.activeScenario = chosen;
    this.config = { ...s.config } as SimulationConfig;
    this.servicePoints = s.servicePoints.map((sp) => ({ ...sp }));
  }

  /** Start or resume the simulation loop. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickInterval = setInterval(() => this.tick(), 1000);
    this.emitUpdate();
  }

  /** Pause the simulation. */
  pause(): void {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.emitUpdate();
  }

  /** Full reset to a given scenario (or current). */
  reset(scenario?: ScenarioName): void {
    this.pause();
    const chosen = scenario ?? this.activeScenario;
    const s = SCENARIOS[chosen];
    this.activeScenario = chosen;
    this.config = { ...s.config } as SimulationConfig;
    this.servicePoints = s.servicePoints.map((sp) => ({
      ...sp,
      currentPatient: undefined,
      patientsServed: 0,
    }));
    this.patients = [];
    // Keep ticketCounter so we never reuse ticket numbers (avoids DB unique constraint)
    this.simulationTime = 0;
    this.metricsHistory = [];
    this.ussdSessions.clear();
    this.autoGenAccumulator = 0;
    this.emitUpdate();
  }

  /**
   * Load state from persisted data (e.g. Supabase).
   * Replaces patients and service points and restores simulation time / ticket counter.
   */
  loadPersistedState(data: {
    patients: Patient[];
    servicePoints: ServicePoint[];
    simulationTime: number;
    ticketCounter: number;
  }): void {
    this.pause();
    this.patients = data.patients.map((p) => ({ ...p }));
    const patientById = new Map(this.patients.map((p) => [p.id, p]));
    this.servicePoints = data.servicePoints.map((sp) => {
      const currentPatient = sp.currentPatient?.id
        ? patientById.get(sp.currentPatient.id)
        : undefined;
      return {
        ...sp,
        currentPatient,
      };
    });
    this.simulationTime = data.simulationTime;
    this.ticketCounter = data.ticketCounter;
    for (const st of SERVICE_TYPES) {
      this.recalculatePositions(st);
    }
    this.emitUpdate();
  }

  /** Destroy the simulator and clean up intervals. */
  destroy(): void {
    this.pause();
    this.onUpdate = null;
  }

  // ---- configuration -------------------------------------------------------

  setConfig(partial: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...partial };
    this.emitUpdate();
  }

  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  setSpeed(speed: number): void {
    this.config.speed = speed;
  }

  /** Set ticket counter (e.g. from DB max) so next ticket is counter+1. */
  setTicketCounter(n: number): void {
    this.ticketCounter = Math.max(0, Math.floor(n));
  }

  // ---- patient management --------------------------------------------------

  /** Manually add a patient to the queue. Returns the created patient. */
  addPatient(overrides?: Partial<Patient>): Patient {
    this.ticketCounter++;
    const ticketNumber = `QF-${String(this.ticketCounter).padStart(3, '0')}`;
    const serviceType: ServiceType =
      overrides?.serviceType ?? randomChoice(SERVICE_TYPES);
    const channel: PatientChannel =
      overrides?.channel ?? weightedChoice(CHANNELS, CHANNEL_WEIGHTS);
    const priority = overrides?.priority ?? this.rollPriority();
    const priorityReason =
      overrides?.priorityReason ??
      (priority !== 'normal' ? this.rollPriorityReason() : undefined);

    const patient: Patient = {
      id: ticketNumber,
      name: overrides?.name ?? ticketNumber,
      phone: overrides?.phone ?? generateUgandanPhone(),
      visitReason: overrides?.visitReason ?? undefined,
      ticketNumber,
      priority,
      priorityReason,
      status: 'waiting',
      serviceType,
      joinedAt: this.simulationTime,
      estimatedWait: 0,
      queuePosition: 0,
      channel,
    };

    this.patients.push(patient);
    this.recalculatePositions(serviceType);
    this.emitUpdate();
    return patient;
  }

  /** Serve the next patient in queue at a given service point. */
  serveNext(servicePointId: string): Patient | null {
    const sp = this.servicePoints.find((s) => s.id === servicePointId);
    if (!sp || sp.status !== 'active' || sp.currentPatient) return null;

    const queue = this.getWaitingQueue(sp.type);
    if (queue.length === 0) return null;

    const patient = queue[0];
    patient.status = 'serving';
    patient.servedAt = this.simulationTime;
    sp.currentPatient = patient;

    this.recalculatePositions(sp.type);
    this.emitUpdate();
    return patient;
  }

  /** Complete service for patient at a given service point. */
  completeService(servicePointId: string): Patient | null {
    const sp = this.servicePoints.find((s) => s.id === servicePointId);
    if (!sp || !sp.currentPatient) return null;

    const patient = sp.currentPatient;
    patient.status = 'completed';
    patient.completedAt = this.simulationTime;
    sp.patientsServed++;

    // Update rolling average service time for this point
    const serviceTime =
      patient.completedAt - (patient.servedAt ?? patient.joinedAt);
    sp.avgServiceTime =
      sp.patientsServed === 1
        ? serviceTime
        : sp.avgServiceTime * 0.8 + serviceTime * 0.2;

    sp.currentPatient = undefined;

    this.recalculatePositions(sp.type);
    this.emitUpdate();
    return patient;
  }

  /** Mark a patient as no-show and remove from queue. */
  markNoShow(patientId: string): Patient | null {
    const patient = this.patients.find((p) => p.id === patientId);
    if (!patient || patient.status !== 'waiting') return null;

    patient.status = 'no-show';
    this.recalculatePositions(patient.serviceType);
    this.emitUpdate();
    return patient;
  }

  /** Set service point status. */
  setServicePointStatus(
    servicePointId: string,
    status: ServicePointStatus
  ): void {
    const sp = this.servicePoints.find((s) => s.id === servicePointId);
    if (!sp) return;
    sp.status = status;
    this.emitUpdate();
  }

  // ---- USSD session management ---------------------------------------------

  /** Start a new USSD session for a phone number. */
  startUSSDSession(phone: string): USSDSession {
    const session: USSDSession = {
      sessionId: generateSessionId(),
      phone,
      state: 'welcome',
      createdAt: this.simulationTime,
    };
    this.ussdSessions.set(phone, session);
    return session;
  }

  /** Process USSD input and return display text. */
  processUSSDInput(phone: string, input: string): string {
    let session = this.ussdSessions.get(phone);
    if (!session) {
      session = this.startUSSDSession(phone);
    }

    session.lastInput = input;

    switch (session.state) {
      case 'welcome': {
        if (input === '1') {
          session.state = 'select-service';
        } else if (input === '2') {
          session.state = 'check-status';
          const ticket = this.patients.find(
            (p) =>
              p.phone === phone &&
              (p.status === 'waiting' || p.status === 'serving')
          );
          if (ticket) {
            return renderUSSDMenu(
              session,
              ticket.ticketNumber,
              ticket.queuePosition,
              Math.round(ticket.estimatedWait / 60)
            );
          }
          return renderUSSDMenu(session);
        } else if (input === '3') {
          const ticket = this.patients.find(
            (p) => p.phone === phone && p.status === 'waiting'
          );
          if (ticket) {
            this.markNoShow(ticket.id);
            session.state = 'cancel';
          } else {
            return renderUSSDMenu(session);
          }
        }
        return renderUSSDMenu(session);
      }

      case 'select-service': {
        const serviceMap: Record<string, ServiceType> = {
          '1': 'opd-triage',
          '2': 'consultation',
          '3': 'pharmacy',
          '4': 'laboratory',
          '5': 'cashier',
        };
        if (input === '0') {
          session.state = 'welcome';
          return renderUSSDMenu(session);
        }
        const service = serviceMap[input];
        if (service) {
          session.selectedService = service;
          session.state = 'confirm-details';
        }
        return renderUSSDMenu(session);
      }

      case 'confirm-details': {
        if (input === '1') {
          const patient = this.addPatient({
            phone,
            serviceType: session.selectedService!,
            channel: 'ussd',
          });
          session.state = 'ticket-issued';
          return renderUSSDMenu(
            session,
            patient.ticketNumber,
            patient.queuePosition,
            Math.round(patient.estimatedWait / 60)
          );
        }
        if (input === '2') {
          session.state = 'select-service';
        }
        return renderUSSDMenu(session);
      }

      case 'ticket-issued':
      case 'check-status':
      case 'cancel': {
        if (input === '0') {
          session.state = 'welcome';
        }
        return renderUSSDMenu(session);
      }

      default:
        session.state = 'welcome';
        return renderUSSDMenu(session);
    }
  }

  /** Get the USSD display for current session state without advancing. */
  getUSSDDisplay(phone: string): string {
    const session = this.ussdSessions.get(phone);
    if (!session) {
      const s = this.startUSSDSession(phone);
      return renderUSSDMenu(s);
    }

    if (
      session.state === 'ticket-issued' ||
      session.state === 'check-status'
    ) {
      const ticket = this.patients.find(
        (p) =>
          p.phone === phone &&
          (p.status === 'waiting' || p.status === 'serving')
      );
      if (ticket) {
        return renderUSSDMenu(
          session,
          ticket.ticketNumber,
          ticket.queuePosition,
          Math.round(ticket.estimatedWait / 60)
        );
      }
    }
    return renderUSSDMenu(session);
  }

  /** End a USSD session. */
  endUSSDSession(phone: string): void {
    this.ussdSessions.delete(phone);
  }

  // ---- query methods -------------------------------------------------------

  getState(): QueueState {
    return {
      patients: [...this.patients],
      servicePoints: this.servicePoints.map((sp) => ({ ...sp })),
      metrics: this.computeMetrics(),
      metricsHistory: [...this.metricsHistory],
      config: { ...this.config },
      isRunning: this.isRunning,
      simulationTime: this.simulationTime,
      activeScenario: this.activeScenario,
      ussdSessions: new Map(this.ussdSessions),
    };
  }

  getPatients(): Patient[] {
    return [...this.patients];
  }

  getServicePoints(): ServicePoint[] {
    return this.servicePoints.map((sp) => ({ ...sp }));
  }

  getMetrics(): QueueMetrics {
    return this.computeMetrics();
  }

  getMetricsHistory(): MetricsSnapshot[] {
    return [...this.metricsHistory];
  }

  /** Get sorted queue for a service type, respecting priority ordering. */
  getWaitingQueue(serviceType: ServiceType): Patient[] {
    return this.patients
      .filter((p) => p.serviceType === serviceType && p.status === 'waiting')
      .sort((a, b) => {
        const priorityOrder: Record<PatientPriority, number> = {
          urgent: 0,
          high: 1,
          normal: 2,
        };
        const pa = priorityOrder[a.priority];
        const pb = priorityOrder[b.priority];
        if (pa !== pb) return pa - pb;
        return a.joinedAt - b.joinedAt; // FIFO within same priority
      });
  }

  getPatientByTicket(ticketNumber: string): Patient | undefined {
    return this.patients.find((p) => p.ticketNumber === ticketNumber);
  }

  getPatientsByPhone(phone: string): Patient[] {
    return this.patients.filter((p) => p.phone === phone);
  }

  getSimulationTime(): number {
    return this.simulationTime;
  }

  formatSimulationTime(): string {
    const hours = Math.floor(this.simulationTime / 3600);
    const minutes = Math.floor((this.simulationTime % 3600) / 60);
    const seconds = this.simulationTime % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0'
    )}:${String(seconds).padStart(2, '0')}`;
  }

  // ---- internal: simulation tick -------------------------------------------

  private tick(): void {
    if (!this.isRunning) return;

    const effectiveTicks = this.config.speed;

    for (let i = 0; i < effectiveTicks; i++) {
      this.simulationTime++;

      // Auto-generate patients
      if (this.config.autoGenerate) {
        this.autoGenAccumulator += this.config.patientsPerMinute / 60;
        while (this.autoGenAccumulator >= 1) {
          this.autoGenAccumulator -= 1;
          this.addPatient();
        }
      }

      // Auto-serve: for each idle active service point, pick up next patient
      for (const sp of this.servicePoints) {
        if (sp.status === 'active' && !sp.currentPatient) {
          this.serveNext(sp.id);
        }
      }

      // Auto-complete: check if serving patient has exceeded service time
      for (const sp of this.servicePoints) {
        if (sp.currentPatient && sp.currentPatient.servedAt !== undefined) {
          const elapsed = this.simulationTime - sp.currentPatient.servedAt;
          // Add some variance around the avg service time
          const targetTime = sp.avgServiceTime * (0.7 + Math.random() * 0.6);
          if (elapsed >= targetTime) {
            // Occasional no-show / failure
            if (Math.random() < this.config.failureRate) {
              const pid = sp.currentPatient.id;
              sp.currentPatient = undefined;
              const pat = this.patients.find((p) => p.id === pid);
              if (pat) pat.status = 'no-show';
            } else {
              this.completeService(sp.id);
            }
          }
        }
      }

      // Recalculate estimated waits for all service types
      for (const st of SERVICE_TYPES) {
        this.recalculatePositions(st);
      }
    }

    // Record metrics snapshot every 10 simulated seconds
    if (this.simulationTime % 10 === 0) {
      this.recordMetricsSnapshot();
    }

    this.emitUpdate();
  }

  // ---- internal: helpers ---------------------------------------------------

  private recalculatePositions(serviceType: ServiceType): void {
    const queue = this.getWaitingQueue(serviceType);

    // Count active service points for this service type
    const activePoints = this.servicePoints.filter(
      (sp) => sp.type === serviceType && sp.status === 'active'
    );
    const numActive = Math.max(activePoints.length, 1);

    // Average service time across active points for this type
    const avgTime =
      activePoints.length > 0
        ? activePoints.reduce((sum, sp) => sum + sp.avgServiceTime, 0) /
          activePoints.length
        : DEFAULT_SERVICE_TIMES[serviceType];

    queue.forEach((patient, index) => {
      patient.queuePosition = index + 1;
      // Estimated wait = (position / parallelism) * avgServiceTime
      patient.estimatedWait = Math.round(((index + 1) / numActive) * avgTime);
    });
  }

  private computeMetrics(): QueueMetrics {
    const waiting = this.patients.filter((p) => p.status === 'waiting');
    const serving = this.patients.filter((p) => p.status === 'serving');
    const completed = this.patients.filter((p) => p.status === 'completed');
    const noShow = this.patients.filter((p) => p.status === 'no-show');

    // Average wait time (for completed patients)
    let avgWaitTime = 0;
    if (completed.length > 0) {
      const totalWait = completed.reduce((sum, p) => {
        return sum + ((p.servedAt ?? p.joinedAt) - p.joinedAt);
      }, 0);
      avgWaitTime = totalWait / completed.length;
    }

    // Average service time (for completed patients)
    let avgServiceTime = 0;
    if (completed.length > 0) {
      const totalService = completed.reduce((sum, p) => {
        return (
          sum +
          ((p.completedAt ?? p.servedAt ?? p.joinedAt) -
            (p.servedAt ?? p.joinedAt))
        );
      }, 0);
      avgServiceTime = totalService / completed.length;
    }

    // Throughput per hour
    const elapsedHours = Math.max(this.simulationTime / 3600, 1 / 3600);
    const throughputPerHour = completed.length / elapsedHours;

    // Longest current wait
    let longestWait = 0;
    for (const p of waiting) {
      const w = this.simulationTime - p.joinedAt;
      if (w > longestWait) longestWait = w;
    }

    // Queues by service
    const queuesByService = {} as Record<ServiceType, number>;
    for (const st of SERVICE_TYPES) {
      queuesByService[st] = this.patients.filter(
        (p) => p.serviceType === st && p.status === 'waiting'
      ).length;
    }

    return {
      totalPatients: this.patients.length,
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

  private recordMetricsSnapshot(): void {
    const snapshot: MetricsSnapshot = {
      timestamp: this.simulationTime,
      metrics: this.computeMetrics(),
    };
    this.metricsHistory.push(snapshot);
    // Keep last 60 data points
    if (this.metricsHistory.length > 60) {
      this.metricsHistory.shift();
    }
  }

  private emitUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.getState());
    }
  }

  private rollPriority(): PatientPriority {
    const r = Math.random();
    if (r < this.config.priorityRatio * 0.3) return 'urgent';
    if (r < this.config.priorityRatio) return 'high';
    return 'normal';
  }

  private rollPriorityReason(): PriorityReason {
    return randomChoice<PriorityReason>([
      'elderly',
      'pregnant',
      'pwd',
      'child',
    ]);
  }
}

// -----------------------------------------------------------------------------
// Factory helper
// -----------------------------------------------------------------------------

export function createSimulator(scenario?: ScenarioName): QueueSimulator {
  return new QueueSimulator(scenario);
}
