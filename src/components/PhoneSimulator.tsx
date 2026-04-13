"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { Patient } from "../lib/queueEngine";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PhoneSimulatorProps {
  onJoinQueue: (
    serviceType: string,
    priority: string,
    channel: string,
    patientName: string,
    contact: string,
    visitReason: string
  ) => Patient | null;
  onCheckPosition: (ticketNumber: string) => { position: number; estimatedWait: number } | null;
  onCancelBooking: (ticketNumber: string) => boolean;
  notifications: Array<{ id: string; message: string; time: string }>;
  queueStats: { totalWaiting: number };
  smsMessages: Array<{
    id: string;
    from: "patient" | "admin" | "ai" | "system";
    text: string;
    time: string;
    ticketNumber?: string;
  }>;
  isSmsReplying: boolean;
  onSendSms: (text: string, ticketNumber?: string) => Promise<void>;
}

type ScreenMode = "home" | "ussd" | "sms";

type UssdStep =
  | "idle"
  | "dialing"
  | "main-menu"
  | "select-service"
  | "select-priority"
  | "enter-name"
  | "enter-contact"
  | "enter-reason"
  | "confirmation"
  | "check-position-input"
  | "check-position-result"
  | "cancel-input"
  | "cancel-result"
  | "view-services"
  | "error";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SERVICES = [
  { key: "opd-triage", label: "OPD Triage" },
  { key: "doctor-consultation", label: "Doctor Consultation" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "laboratory", label: "Laboratory" },
  { key: "cashier", label: "Cashier" },
];

const PRIORITIES = [
  { key: "normal", label: "Normal" },
  { key: "elderly", label: "Elderly (60+)" },
  { key: "pregnant", label: "Pregnant Mother" },
  { key: "disability", label: "Person with Disability" },
  { key: "child", label: "Child (Under 5)" },
];

const DIALPAD_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

const DIALPAD_LETTERS: Record<string, string> = {
  "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL",
  "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ",
};

/* ------------------------------------------------------------------ */
/*  iPhone 14 Pro Max dimensions (scaled)                              */
/*  Real: 430 x 932 pts. We use ~350 x 720 for display               */
/* ------------------------------------------------------------------ */

const PHONE_W = 350;
const PHONE_H = 720;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PhoneSimulator({
  onJoinQueue,
  onCheckPosition,
  onCancelBooking,
  notifications,
  queueStats,
  smsMessages,
  isSmsReplying,
  onSendSms,
}: PhoneSimulatorProps) {
  const [mode, setMode] = useState<ScreenMode>("home");
  const [dialInput, setDialInput] = useState("");
  const [ussdStep, setUssdStep] = useState<UssdStep>("idle");
  const [ussdInput, setUssdInput] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("");
  const [patientName, setPatientName] = useState("");
  const [contact, setContact] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [confirmationData, setConfirmationData] = useState<Patient | null>(null);
  const [positionData, setPositionData] = useState<{
    position: number;
    estimatedWait: number;
  } | null>(null);
  const [cancelResult, setCancelResult] = useState<boolean | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [ussdAnimating, setUssdAnimating] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [smsInput, setSmsInput] = useState("");
  const smsEndRef = useRef<HTMLDivElement>(null);

  // Update clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll SMS
  useEffect(() => {
    smsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [smsMessages, isSmsReplying]);

  const handleSendSms = useCallback(async () => {
    const text = smsInput.trim();
    if (!text || isSmsReplying) return;
    setSmsInput("");
    await onSendSms(text);
  }, [smsInput, isSmsReplying, onSendSms]);

  /* ---------- helpers ---------- */

  const resetUssd = useCallback(() => {
    setUssdStep("idle");
    setUssdInput("");
    setSelectedService("");
    setSelectedPriority("");
    setPatientName("");
    setContact("");
    setVisitReason("");
    setConfirmationData(null);
    setPositionData(null);
    setCancelResult(null);
    setTicketInput("");
  }, []);

  const showUssd = useCallback((step: UssdStep) => {
    setUssdAnimating(true);
    setTimeout(() => {
      setUssdStep(step);
      setUssdAnimating(false);
    }, 300);
  }, []);

  const handleDial = useCallback(() => {
    if (dialInput === "*285*70#" || dialInput === "*285*70") {
      setUssdStep("dialing");
      setTimeout(() => showUssd("main-menu"), 800);
    }
  }, [dialInput, showUssd]);

  const handleUssdOption = useCallback(
    (option: string) => {
      switch (ussdStep) {
        case "main-menu":
          if (option === "1") showUssd("select-service");
          else if (option === "2") showUssd("check-position-input");
          else if (option === "3") showUssd("cancel-input");
          else if (option === "4") showUssd("view-services");
          break;
        case "select-service": {
          const idx = parseInt(option) - 1;
          if (idx >= 0 && idx < SERVICES.length) {
            setSelectedService(SERVICES[idx].key);
            showUssd("select-priority");
          }
          break;
        }
        case "select-priority": {
          const idx = parseInt(option) - 1;
          if (idx >= 0 && idx < PRIORITIES.length) {
            setSelectedPriority(PRIORITIES[idx].key);
            showUssd("enter-name");
          }
          break;
        }
        case "enter-name": {
          if (!option.trim()) break;
          setPatientName(option.trim());
          showUssd("enter-contact");
          break;
        }
        case "enter-contact": {
          if (!option.trim()) break;
          setContact(option.trim());
          showUssd("enter-reason");
          break;
        }
        case "enter-reason": {
          if (!option.trim()) break;
          setVisitReason(option.trim());
          const patient = onJoinQueue(
            selectedService,
            selectedPriority,
            "USSD",
            patientName || "Unknown",
            contact || "N/A",
            option.trim()
          );
          if (patient) {
            setConfirmationData(patient);
            showUssd("confirmation");
          } else {
            showUssd("error");
          }
          break;
        }
        case "check-position-input": {
          const result = onCheckPosition(option.toUpperCase());
          setPositionData(result);
          setTicketInput(option.toUpperCase());
          showUssd("check-position-result");
          break;
        }
        case "cancel-input": {
          const success = onCancelBooking(option.toUpperCase());
          setCancelResult(success);
          setTicketInput(option.toUpperCase());
          showUssd("cancel-result");
          break;
        }
        default:
          break;
      }
      setUssdInput("");
    },
    [ussdStep, onJoinQueue, onCheckPosition, onCancelBooking, selectedService, selectedPriority, patientName, contact, showUssd]
  );

  /* ---------- USSD content ---------- */

  const getUssdContent = (): { title: string; body: string; hasInput: boolean; inputPlaceholder: string } => {
    switch (ussdStep) {
      case "dialing":
        return { title: "USSD", body: "Connecting...", hasInput: false, inputPlaceholder: "" };
      case "main-menu":
        return {
          title: "USSD Service",
          body: "Welcome to QFlow - Mukono Health Centre IV\n\n1. Join Queue\n2. Check Position\n3. Cancel Booking\n4. View Services",
          hasInput: true,
          inputPlaceholder: "Enter option",
        };
      case "select-service":
        return {
          title: "USSD Service",
          body: "Select Service:\n\n1. OPD Triage\n2. Doctor Consultation\n3. Pharmacy\n4. Laboratory\n5. Cashier",
          hasInput: true,
          inputPlaceholder: "Enter option",
        };
      case "select-priority":
        return {
          title: "USSD Service",
          body: "Select Priority:\n\n1. Normal\n2. Elderly (60+)\n3. Pregnant Mother\n4. Person with Disability\n5. Child (Under 5)",
          hasInput: true,
          inputPlaceholder: "Enter option",
        };
      case "enter-name":
        return {
          title: "USSD Service",
          body: "Enter patient full name:",
          hasInput: true,
          inputPlaceholder: "Full name",
        };
      case "enter-contact":
        return {
          title: "USSD Service",
          body: "Enter patient contact (phone number):",
          hasInput: true,
          inputPlaceholder: "+2567XXXXXXXX",
        };
      case "enter-reason":
        return {
          title: "USSD Service",
          body: "Enter reason for visit:",
          hasInput: true,
          inputPlaceholder: "Reason",
        };
      case "confirmation": {
        const svc = SERVICES.find((s) => s.key === selectedService);
        const pri = PRIORITIES.find((p) => p.key === (confirmationData?.priority || selectedPriority));
        return {
          title: "USSD Service",
          body: `\u2713 You have been added to the queue!\n\nTicket: ${confirmationData?.ticketNumber || "QF-000"}\nService: ${svc?.label || selectedService}\nPriority: ${pri?.label || "Normal"}\nPosition: ${confirmationData?.queuePosition ?? "N/A"}\nEst. Wait: ${confirmationData ? Math.max(1, Math.round(confirmationData.estimatedWait / 60)) : "N/A"} min\n\nYou will receive an SMS when your turn is near.`,
          hasInput: false,
          inputPlaceholder: "",
        };
      }
      case "check-position-input":
        return {
          title: "USSD Service",
          body: "Enter your ticket number:\n(e.g. QF-001)",
          hasInput: true,
          inputPlaceholder: "Ticket number",
        };
      case "check-position-result":
        if (positionData) {
          return {
            title: "USSD Service",
            body: `Ticket: ${ticketInput}\nPosition: #${positionData.position}\nEst. Wait: ${positionData.estimatedWait} min`,
            hasInput: false,
            inputPlaceholder: "",
          };
        }
        return {
          title: "USSD Service",
          body: `Ticket ${ticketInput} not found.\nPlease check your ticket number and try again.`,
          hasInput: false,
          inputPlaceholder: "",
        };
      case "cancel-input":
        return {
          title: "USSD Service",
          body: "Enter ticket number to cancel:\n(e.g. QF-001)",
          hasInput: true,
          inputPlaceholder: "Ticket number",
        };
      case "cancel-result":
        return {
          title: "USSD Service",
          body: cancelResult
            ? `\u2713 Booking ${ticketInput} has been cancelled successfully.`
            : `\u2717 Could not cancel ${ticketInput}.\nTicket not found or already completed.`,
          hasInput: false,
          inputPlaceholder: "",
        };
      case "view-services":
        return {
          title: "USSD Service",
          body: `Mukono Health Centre IV Services:\n\n\u2022 OPD Triage\n\u2022 Doctor Consultation\n\u2022 Pharmacy\n\u2022 Laboratory\n\u2022 Cashier\n\nCurrently ${queueStats.totalWaiting} patient(s) waiting.`,
          hasInput: false,
          inputPlaceholder: "",
        };
      case "error":
        return {
          title: "USSD Service",
          body: "An error occurred. Please try again.",
          hasInput: false,
          inputPlaceholder: "",
        };
      default:
        return { title: "", body: "", hasInput: false, inputPlaceholder: "" };
    }
  };

  /* ---------- iOS Status Bar ---------- */

  const renderStatusBar = () => (
    <div className="flex items-center justify-between px-6 h-[22px] text-white select-none">
      {/* Time - left side (iOS style) */}
      <span className="text-[14px] font-semibold tracking-tight w-[60px]">{currentTime}</span>
      {/* Dynamic Island is in the center - gap handled by notch */}
      <div className="flex-1" />
      {/* Right icons */}
      <div className="flex items-center gap-[5px] w-[60px] justify-end">
        {/* Cellular signal */}
        <div className="flex items-end gap-[1px]">
          <div className="w-[3px] h-[4px] bg-white rounded-[0.5px]" />
          <div className="w-[3px] h-[6px] bg-white rounded-[0.5px]" />
          <div className="w-[3px] h-[8px] bg-white rounded-[0.5px]" />
          <div className="w-[3px] h-[10px] bg-white/40 rounded-[0.5px]" />
        </div>
        {/* WiFi */}
        <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="white">
          <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />
        </svg>
        {/* Battery */}
        <div className="flex items-center">
          <div className="w-[22px] h-[11px] border-[1.5px] border-white rounded-[3px] p-[1.5px] relative">
            <div className="w-[65%] h-full bg-white rounded-[1px]" />
          </div>
          <div className="w-[1.5px] h-[5px] bg-white rounded-r-[1px] ml-[0.5px]" />
        </div>
      </div>
    </div>
  );

  /* ---------- Dynamic Island ---------- */

  const renderDynamicIsland = () => (
    <div className="absolute top-[10px] left-1/2 -translate-x-1/2 z-20">
      <div
        className="bg-black rounded-[20px] flex items-center justify-center"
        style={{ width: 120, height: 34 }}
      >
        {/* Front camera */}
        <div className="w-[10px] h-[10px] rounded-full bg-[#1a1a2e] border-[1.5px] border-[#0a0a15] relative">
          <div className="absolute inset-[2px] rounded-full bg-[#0d0d1a]">
            <div className="absolute top-[1px] left-[1px] w-[2px] h-[2px] rounded-full bg-[#2a2a4a]" />
          </div>
        </div>
      </div>
    </div>
  );

  /* ---------- Home Screen (iOS style) ---------- */

  const renderHomeScreen = () => {
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return (
      <div
        className="flex flex-col items-center h-full px-6 text-center"
        style={{
          background: "linear-gradient(160deg, #0f766e 0%, #0e7490 30%, #1e40af 60%, #6d28d9 100%)",
        }}
      >
        {/* Lock screen style */}
        <div className="mt-10">
          <p className="text-white/60 text-xs tracking-[0.15em] uppercase">{dateStr}</p>
          <h1 className="text-[64px] font-thin text-white leading-none mt-1" style={{ fontFamily: "-apple-system, 'SF Pro Display', system-ui" }}>
            {currentTime}
          </h1>
        </div>

        {/* QFlow Widget */}
        <div className="mt-8 w-full max-w-[280px]">
          <div className="bg-white/15 backdrop-blur-xl rounded-[22px] border border-white/20 p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md">
                <span className="text-white text-lg font-bold">Q</span>
              </div>
              <div className="text-left">
                <h2 className="text-white text-sm font-semibold">QFlow</h2>
                <p className="text-white/50 text-[10px]">Mukono Health Centre IV</p>
              </div>
            </div>
            <div className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-2.5">
              <span className="text-white/60 text-xs">Patients in queue</span>
              <span className="text-white text-lg font-bold">{queueStats.totalWaiting}</span>
            </div>
          </div>
        </div>

        <p className="text-white/30 text-[11px] mt-6 tracking-wide">Dial *285*70# to join queue</p>

        {/* Bottom swipe indicator (iOS style) */}
        <div className="mt-auto mb-2">
          <div className="w-[120px] h-[4px] bg-white/20 rounded-full mx-auto" />
        </div>
      </div>
    );
  };

  /* ---------- Dial Pad (iOS Phone app style) ---------- */

  const renderDialpad = () => (
    <div className="flex flex-col h-full bg-[#1c1c1e]">
      {/* dial input */}
      <div className="flex-shrink-0 flex items-center justify-center h-20 pt-2">
        <p className="text-white text-[26px] font-light tracking-[0.08em] min-h-[32px]"
           style={{ fontFamily: "-apple-system, 'SF Pro Display', system-ui" }}>
          {dialInput || <span className="text-white/25">Enter USSD code</span>}
        </p>
      </div>

      {/* iOS-style keypad */}
      <div className="flex-1 flex flex-col justify-center px-8 pb-2 gap-[10px]">
        {DIALPAD_KEYS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-[14px]">
            {row.map((key) => (
              <button
                key={key}
                onClick={() => setDialInput((prev) => prev + key)}
                className="w-[72px] h-[72px] rounded-full bg-[#333336] hover:bg-[#444448] active:bg-[#555558] text-white transition-all duration-75 flex flex-col items-center justify-center"
              >
                <span className="text-[26px] font-light leading-none">{key}</span>
                {DIALPAD_LETTERS[key] && (
                  <span className="text-[9px] tracking-[0.15em] text-white/50 mt-[1px] font-medium">
                    {DIALPAD_LETTERS[key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}

        {/* Bottom row: clear, call, backspace */}
        <div className="flex justify-center gap-[14px] mt-1">
          <button
            onClick={() => setDialInput("")}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white/40 text-xs font-medium"
          >
            Clear
          </button>
          <button
            onClick={handleDial}
            className="w-[72px] h-[72px] rounded-full bg-[#34C759] hover:bg-[#30B350] active:bg-[#2AA048] flex items-center justify-center shadow-lg"
          >
            <svg className="w-[30px] h-[30px] text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.01-.24c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
          <button
            onClick={() => setDialInput((prev) => prev.slice(0, -1))}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white/50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.37-6.37a1.5 1.5 0 010-2.12l6.37-6.37a1.5 1.5 0 011.06-.44H18a3 3 0 013 3v9a3 3 0 01-3 3h-8.32a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </button>
        </div>
      </div>

      {/* hint */}
      <div className="flex-shrink-0 text-center pb-1">
        <p className="text-white/20 text-[10px]">Dial *285*70# for QFlow</p>
      </div>
    </div>
  );

  /* ---------- SMS Screen (iOS Messages style) ---------- */

  const renderSmsScreen = () => (
    <div className="flex flex-col h-full bg-[#000000]">
      {/* iOS Messages header */}
      <div className="flex-shrink-0 px-4 py-3 bg-[#1c1c1e]/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">Q</span>
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold">QFlow</h3>
            <p className="text-white/40 text-[10px]">Notifications</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {smsMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/25 text-xs">
            <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="font-medium">No messages yet</p>
            <p className="text-[10px] mt-1 text-white/15">Join a queue or send a message below</p>
          </div>
        ) : (
          smsMessages.map((msg) => (
            <div key={msg.id} className={`flex flex-col animate-fadeIn ${msg.from === "patient" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[82%] px-3.5 py-2.5 rounded-[18px] ${
                  msg.from === "patient"
                    ? "bg-[#34C759] text-black rounded-br-[4px]"
                    : "bg-[#2c2c2e] text-white rounded-bl-[4px]"
                }`}
              >
                <p className="text-[13px] leading-[1.35]">{msg.text}</p>
              </div>
              <span className="text-white/20 text-[9px] mt-1 mx-2">{msg.time}</span>
            </div>
          ))
        )}
        {isSmsReplying && (
          <div className="flex flex-col animate-fadeIn items-start">
            <div className="max-w-[82%] self-start bg-[#2c2c2e] rounded-[18px] rounded-bl-[4px] px-3.5 py-2.5">
              <p className="text-white/70 text-[13px] leading-[1.35]">Typing...</p>
            </div>
          </div>
        )}
        <div ref={smsEndRef} />
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 px-3 py-2 bg-[#1c1c1e]/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={smsInput}
            onChange={(e) => setSmsInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSendSms();
            }}
            placeholder="Type message..."
            className="flex-1 bg-[#2c2c2e] border border-white/10 rounded-full px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#34C759]/50"
          />
          <button
            onClick={() => void handleSendSms()}
            disabled={!smsInput.trim() || isSmsReplying}
            className="px-3 py-2 rounded-full bg-[#34C759] text-black text-xs font-semibold disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );

  /* ---------- USSD Dialog (iOS alert style) ---------- */

  const renderUssdDialog = () => {
    if (ussdStep === "idle") return null;
    const content = getUssdContent();
    const isTerminal = !content.hasInput;
    const isConnecting = ussdStep === "dialing";

    return (
      <div
        className={`absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-200 ${
          ussdAnimating ? "opacity-0" : "opacity-100"
        }`}
        style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
      >
        <div
          className="w-[80%] bg-[#2c2c2e]/95 backdrop-blur-2xl rounded-[14px] shadow-2xl overflow-hidden"
          style={{ maxHeight: "75%" }}
        >
          {/* iOS Alert title */}
          <div className="px-5 pt-5 pb-1 text-center">
            <p className="text-white text-[15px] font-semibold">{content.title}</p>
          </div>

          {/* Body */}
          <div className="px-5 py-3 max-h-[260px] overflow-y-auto">
            {isConnecting ? (
              <div className="flex items-center justify-center gap-3 py-6">
                <div className="w-5 h-5 border-2 border-[#34C759] border-t-transparent rounded-full animate-spin" />
                <p className="text-white/60 text-sm">Connecting...</p>
              </div>
            ) : (
              <pre className="text-white/80 text-[13px] leading-[1.55] font-sans whitespace-pre-wrap text-center">
                {content.body}
              </pre>
            )}
          </div>

          {/* Input + buttons */}
          {!isConnecting && (
            <div>
              {content.hasInput && (
                <div className="px-5 pb-3">
                  <input
                    type="text"
                    value={ussdInput}
                    onChange={(e) => setUssdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && ussdInput.trim()) {
                        handleUssdOption(ussdInput.trim());
                      }
                    }}
                    placeholder={content.inputPlaceholder}
                    className="w-full bg-[#1c1c1e] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#34C759]/50 focus:ring-1 focus:ring-[#34C759]/30"
                    autoFocus
                  />
                </div>
              )}

              {/* iOS-style separator + buttons */}
              <div className="border-t border-white/10">
                <div className="flex divide-x divide-white/10">
                  <button
                    onClick={() => {
                      resetUssd();
                      setDialInput("");
                    }}
                    className="flex-1 py-3 text-[16px] font-normal text-[#0A84FF] hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    {isTerminal ? "OK" : "Cancel"}
                  </button>
                  {content.hasInput && (
                    <button
                      onClick={() => {
                        if (ussdInput.trim()) handleUssdOption(ussdInput.trim());
                      }}
                      className="flex-1 py-3 text-[16px] font-semibold text-[#0A84FF] hover:bg-white/5 active:bg-white/10 transition-colors"
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------- Bottom Tab Bar (iOS style) ---------- */

  const renderBottomNav = () => (
    <div className="flex-shrink-0 bg-[#1c1c1e]/95 backdrop-blur-xl border-t border-white/10">
      <div className="flex items-center justify-around h-[50px]">
        <button
          onClick={() => { setMode("ussd"); resetUssd(); }}
          className={`flex flex-col items-center gap-[2px] transition-colors ${
            mode === "ussd" ? "text-[#34C759]" : "text-white/30"
          }`}
        >
          <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.01-.24c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02l-2.2 2.2z" />
          </svg>
          <span className="text-[10px]">USSD</span>
        </button>

        <button
          onClick={() => setMode("home")}
          className={`flex flex-col items-center gap-[2px] transition-colors ${
            mode === "home" ? "text-[#34C759]" : "text-white/30"
          }`}
        >
          <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
          <span className="text-[10px]">Home</span>
        </button>

        <button
          onClick={() => setMode("sms")}
          className={`relative flex flex-col items-center gap-[2px] transition-colors ${
            mode === "sms" ? "text-[#34C759]" : "text-white/30"
          }`}
        >
          <svg className="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
            <path d="M7 9h2v2H7zM11 9h2v2h-2zM15 9h2v2h-2z" />
          </svg>
          <span className="text-[10px]">SMS</span>
          {notifications.length > 0 && (
            <span className="absolute -top-1 right-0 min-w-[16px] h-[16px] bg-[#FF3B30] rounded-full text-[9px] text-white flex items-center justify-center font-bold px-1">
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </button>
      </div>
      {/* Home indicator */}
      <div className="flex justify-center pb-2 pt-1">
        <div className="w-[120px] h-[4px] bg-white/15 rounded-full" />
      </div>
    </div>
  );

  /* ---------- Main Render: iPhone 14 Pro Max ---------- */

  return (
    <div className="flex flex-col items-center">
      {/* iPhone 14 Pro Max frame */}
      <div
        className="relative"
        style={{
          width: PHONE_W + 16,
          height: PHONE_H + 16,
          borderRadius: 50,
          background: "linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 30%, #0a0a0a 70%, #1a1a1a 100%)",
          padding: 8,
          boxShadow: [
            "0 0 0 1px rgba(255,255,255,0.08)",
            "0 2px 0 0 rgba(255,255,255,0.03)",
            "0 30px 60px -15px rgba(0,0,0,0.7)",
            "0 10px 20px -5px rgba(0,0,0,0.5)",
            "inset 0 1px 0 rgba(255,255,255,0.06)",
          ].join(", "),
        }}
      >
        {/* Side buttons */}
        {/* Left: Silent switch + Volume */}
        <div className="absolute -left-[2.5px] top-[90px] w-[3px] h-[24px] bg-[#2a2a2a] rounded-l-[2px]"
             style={{ boxShadow: "inset 1px 0 0 rgba(255,255,255,0.05)" }} />
        <div className="absolute -left-[2.5px] top-[130px] w-[3px] h-[44px] bg-[#2a2a2a] rounded-l-[2px]"
             style={{ boxShadow: "inset 1px 0 0 rgba(255,255,255,0.05)" }} />
        <div className="absolute -left-[2.5px] top-[186px] w-[3px] h-[44px] bg-[#2a2a2a] rounded-l-[2px]"
             style={{ boxShadow: "inset 1px 0 0 rgba(255,255,255,0.05)" }} />
        {/* Right: Power button */}
        <div className="absolute -right-[2.5px] top-[145px] w-[3px] h-[64px] bg-[#2a2a2a] rounded-r-[2px]"
             style={{ boxShadow: "inset -1px 0 0 rgba(255,255,255,0.05)" }} />

        {/* Screen */}
        <div
          className="relative w-full h-full overflow-hidden bg-black flex flex-col"
          style={{ borderRadius: 42 }}
        >
          {/* Dynamic Island */}
          {renderDynamicIsland()}

          {/* Status bar area */}
          <div className="flex-shrink-0 pt-[46px]">
            {renderStatusBar()}
          </div>

          {/* Screen content */}
          <div className="relative flex-1 overflow-hidden">
            {mode === "home" && renderHomeScreen()}
            {mode === "ussd" && renderDialpad()}
            {mode === "sms" && renderSmsScreen()}
            {mode === "ussd" && renderUssdDialog()}
          </div>

          {/* Bottom tab bar */}
          {renderBottomNav()}
        </div>
      </div>

      {/* Label */}
      <div className="mt-5 text-center">
        <p className="text-sm text-gray-600 font-medium">iPhone 14 Pro Max</p>
        <p className="text-xs text-gray-400 mt-0.5">Dial *285*70# to access QFlow</p>
      </div>
    </div>
  );
}
