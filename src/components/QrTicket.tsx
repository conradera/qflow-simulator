'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QrTicketProps {
  ticketNumber: string;
  patientName?: string;
  size?: number;
  className?: string;
}

/** QR code for queue ticket verification at service points. */
export default function QrTicket({
  ticketNumber,
  patientName,
  size = 120,
  className = '',
}: QrTicketProps) {
  const payload = JSON.stringify({
    ticket: ticketNumber.toUpperCase(),
    name: patientName?.trim() || undefined,
    facility: 'Mukono Health Centre IV',
    system: 'QFlow',
  });

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <QRCodeSVG
        value={payload}
        size={size}
        level="M"
        includeMargin
        bgColor="#ffffff"
        fgColor="#111827"
      />
      <p className="text-xs font-mono font-semibold text-gray-700">{ticketNumber}</p>
      {patientName?.trim() && (
        <p className="text-[10px] text-gray-500 text-center max-w-[140px] truncate">
          {patientName.trim()}
        </p>
      )}
    </div>
  );
}
