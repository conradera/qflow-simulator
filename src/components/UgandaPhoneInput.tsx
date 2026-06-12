'use client';

import {
  UGANDA_COUNTRY_CODE,
  sanitizePhoneInput,
  normalizeUgandaPhone,
} from '@/lib/validation';

interface UgandaPhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
  id?: string;
}

function localDigits(value: string): string {
  const normalized = normalizeUgandaPhone(value);
  if (!normalized || normalized === UGANDA_COUNTRY_CODE) return '';
  return normalized.startsWith(UGANDA_COUNTRY_CODE)
    ? normalized.slice(UGANDA_COUNTRY_CODE.length)
    : normalized.replace(/^\+?256/, '');
}

export default function UgandaPhoneInput({
  value,
  onChange,
  error,
  className = '',
  id,
}: UgandaPhoneInputProps) {
  const handleChange = (raw: string) => {
    const digits = sanitizePhoneInput(raw).replace(/^\+?256/, '').replace(/^0+/, '');
    onChange(digits ? `${UGANDA_COUNTRY_CODE}${digits}` : UGANDA_COUNTRY_CODE);
  };

  return (
    <div className={className}>
      <div className="flex">
        <span className="inline-flex items-center px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm font-medium text-gray-600">
          {UGANDA_COUNTRY_CODE}
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={localDigits(value)}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="7XXXXXXXX"
          className={`flex-1 min-w-0 px-3 py-2 rounded-r-lg border text-sm ${
            error ? 'border-red-400' : 'border-gray-300'
          }`}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
