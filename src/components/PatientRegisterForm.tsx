'use client';

import { useState } from 'react';
import type { Patient } from '@/lib/queueEngine';
import {
  validatePatientJoinInput,
  normalizeUgandaPhone,
  UGANDA_COUNTRY_CODE,
} from '@/lib/validation';
import UgandaPhoneInput from '@/components/UgandaPhoneInput';

const SERVICES = [
  { value: 'opd-triage', label: 'OPD Triage' },
  { value: 'consultation', label: 'Doctor Consultation' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'cashier', label: 'Cashier' },
] as const;

const PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'elderly', label: 'Elderly (60+)' },
  { value: 'pregnant', label: 'Pregnant Mother' },
  { value: 'disability', label: 'Person with Disability' },
  { value: 'child', label: 'Child (Under 5)' },
  { value: 'emergency', label: 'Emergency / Critical' },
] as const;

interface PatientRegisterFormProps {
  onSuccess: (patient: Patient) => void;
}

export default function PatientRegisterForm({ onSuccess }: PatientRegisterFormProps) {
  const [name, setName] = useState('');
  const [telephone, setTelephone] = useState(UGANDA_COUNTRY_CODE);
  const [visitReason, setVisitReason] = useState('');
  const [serviceType, setServiceType] = useState<string>('opd-triage');
  const [priorityCategory, setPriorityCategory] = useState('normal');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const tel = normalizeUgandaPhone(telephone);
    const priorityReason =
      priorityCategory === 'normal'
        ? undefined
        : priorityCategory === 'disability'
          ? 'pwd'
          : priorityCategory;

    const validation = validatePatientJoinInput({
      name,
      telephone: tel,
      visitReason,
      serviceType,
      priorityReason,
      channel: 'app',
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch('/api/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          telephone: tel,
          visitReason: visitReason.trim(),
          serviceType,
          priorityReason,
          channel: 'app',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError((data as { error?: string }).error ?? 'Registration failed. Please try again.');
        return;
      }

      onSuccess((data as { patient: Patient }).patient);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          className={`w-full px-3 py-2.5 rounded-lg border text-sm ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
        />
        {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
        <UgandaPhoneInput
          value={telephone}
          onChange={setTelephone}
          error={errors.telephone}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Service needed</label>
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white"
        >
          {SERVICES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {errors.serviceType && <p className="text-xs text-red-600 mt-1">{errors.serviceType}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Priority category</label>
        <select
          value={priorityCategory}
          onChange={(e) => setPriorityCategory(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for visit</label>
        <textarea
          value={visitReason}
          onChange={(e) => setVisitReason(e.target.value)}
          placeholder="Briefly describe why you are visiting"
          rows={3}
          className={`w-full px-3 py-2.5 rounded-lg border text-sm resize-none ${errors.visitReason ? 'border-red-400' : 'border-gray-300'}`}
        />
        {errors.visitReason && <p className="text-xs text-red-600 mt-1">{errors.visitReason}</p>}
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
      >
        {submitting ? 'Joining queue...' : 'Join Queue'}
      </button>
    </form>
  );
}
