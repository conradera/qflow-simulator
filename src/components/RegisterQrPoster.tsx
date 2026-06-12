'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface RegisterQrPosterProps {
  size?: number;
  showUrl?: boolean;
  className?: string;
}

/** QR code linking patients to the self-registration page. */
export default function RegisterQrPoster({
  size = 160,
  showUrl = true,
  className = '',
}: RegisterQrPosterProps) {
  const [registerUrl, setRegisterUrl] = useState('');

  useEffect(() => {
    setRegisterUrl(`${window.location.origin}/register`);
  }, []);

  if (!registerUrl) {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="bg-gray-100 rounded-lg animate-pulse" style={{ width: size, height: size }} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <QRCodeSVG
        value={registerUrl}
        size={size}
        level="M"
        includeMargin
        bgColor="#ffffff"
        fgColor="#111827"
      />
      <p className="text-xs font-semibold text-gray-800 text-center">Scan to join queue</p>
      {showUrl && (
        <p className="text-[10px] text-gray-500 text-center break-all max-w-[180px]">{registerUrl}</p>
      )}
    </div>
  );
}
