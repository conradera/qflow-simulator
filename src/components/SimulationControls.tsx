"use client";

import React, { useCallback } from "react";

export interface SimulationConfig {
  autoGenerate: boolean;
  patientsPerMinute: number;
  avgServiceTime: number;
  priorityRatio: number;
  failureRate: number;
  speed: number;
}

export interface SimulationControlsProps {
  isRunning: boolean;
  speed: number;
  config: SimulationConfig;
  onToggleRun: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onConfigChange: (config: Partial<SimulationConfig>) => void;
  onAddPatient: () => void;
  onLoadScenario: (scenario: string) => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

const SCENARIOS = [
  { id: "normal", label: "Normal Day", description: "5 pts/min, 3% failure" },
  { id: "monday-rush", label: "Monday Rush", description: "15 pts/min, 5% failure" },
  { id: "vaccination", label: "Vaccination Day", description: "20 pts/min, 1% fail, mostly OPD" },
  { id: "staff-shortage", label: "Staff Shortage", description: "5 pts/min, 10% fail, fewer points" },
  { id: "network-outage", label: "Network Outage", description: "SMS/USSD failures" },
] as const;

export default function SimulationControls({
  isRunning,
  speed,
  config,
  onToggleRun,
  onReset,
  onSpeedChange,
  onConfigChange,
  onAddPatient,
  onLoadScenario,
}: SimulationControlsProps) {
  const handleSliderChange = useCallback(
    (field: keyof SimulationConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onConfigChange({ [field]: parseFloat(e.target.value) });
    },
    [onConfigChange]
  );

  return (
    <div className="w-[300px] bg-gray-50 text-gray-800 p-4 flex flex-col gap-4 overflow-y-auto h-full text-sm">
      {/* Simulation Status */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              isRunning
                ? "bg-green-500 animate-pulse"
                : "bg-yellow-500 animate-pulse"
            }`}
          />
          <span className="font-semibold text-base text-gray-900">
            {isRunning ? "Running" : "Paused"}
          </span>
          <span className="ml-auto text-gray-500 text-xs">{speed}x speed</span>
        </div>
      </div>

      {/* Play / Pause / Reset */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Playback
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onToggleRun}
            className={`flex-1 py-2 rounded-md font-semibold text-sm transition-colors ${
              isRunning
                ? "bg-yellow-500 hover:bg-yellow-400 text-white"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            {isRunning ? "Pause" : "Play"}
          </button>
          <button
            onClick={onReset}
            className="flex-1 py-2 rounded-md font-semibold text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Speed Control */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Speed
        </h3>
        <div className="flex gap-1">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                speed === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-600"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Generate Toggle + Patients Per Minute */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Patient Generation
        </h3>

        {/* Toggle */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-700">Auto-Generate</span>
          <button
            onClick={() => onConfigChange({ autoGenerate: !config.autoGenerate })}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              config.autoGenerate ? "bg-blue-600" : "bg-gray-300"
            }`}
            role="switch"
            aria-checked={config.autoGenerate}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                config.autoGenerate ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Patients Per Minute */}
        <label className="block">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Patients / min</span>
            <span className="text-gray-800 font-semibold">
              {config.patientsPerMinute}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={config.patientsPerMinute}
            onChange={handleSliderChange("patientsPerMinute")}
            disabled={!config.autoGenerate}
            className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-500 disabled:opacity-40"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>1</span>
            <span>20</span>
          </div>
        </label>

        {/* Manual Add */}
        <button
          onClick={onAddPatient}
          className="mt-2 w-full py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          + Add Patient Manually
        </button>
      </div>

      {/* Failure Rate */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Failure Rate
        </h3>
        <label className="block">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>SMS / USSD Failure</span>
            <span className="text-gray-800 font-semibold">
              {config.failureRate}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={config.failureRate}
            onChange={handleSliderChange("failureRate")}
            className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-red-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0%</span>
            <span>20%</span>
          </div>
        </label>
      </div>

      {/* Service Time */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Avg Service Time
        </h3>
        <label className="block">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Minutes per patient</span>
            <span className="text-gray-800 font-semibold">
              {config.avgServiceTime} min
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={config.avgServiceTime}
            onChange={handleSliderChange("avgServiceTime")}
            className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-purple-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>1 min</span>
            <span>15 min</span>
          </div>
        </label>
      </div>

      {/* Preset Scenarios */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Preset Scenarios
        </h3>
        <div className="flex flex-col gap-1.5">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => onLoadScenario(scenario.id)}
              className="w-full text-left px-3 py-2 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors group"
            >
              <div className="text-xs font-semibold text-gray-700 group-hover:text-gray-900">
                {scenario.label}
              </div>
              <div className="text-[10px] text-gray-400 group-hover:text-gray-500">
                {scenario.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
