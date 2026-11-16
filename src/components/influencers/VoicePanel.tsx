import React from 'react';
import { Volume2, Play, Upload, Mic, FileAudio, Radio } from 'lucide-react';
import { voiceModelOptions } from './influencerData';
import type { InfluencerStudioState } from './useInfluencerStudio';

export function VoicePanel({ s }: { s: InfluencerStudioState }) {
  const {
    name,
    selectedVoiceModel,
    setSelectedVoiceModel,
    voiceTone,
    setVoiceTone,
    pitch,
    setPitch,
    speed,
    setSpeed,
    accent,
    setAccent,
    samplePhrase,
    setSamplePhrase,
    uploadedVoiceFile,
    isPlayingAudio,
    handlePlayVoicePreview,
    handleSimulateVoiceUpload,
  } = s;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT 7 COLS: Voice Model Selection & Audio Upload Reference */}
      <div className="lg:col-span-7 space-y-6">
        {/* Audio Upload Reference File Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>1. Reference Voice Audio Upload & Cloning</span>
            </h3>
            <span className="text-2xs font-mono text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800/60">
              Not built yet
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Upload a 30-second clean audio reference file (.mp3 or .wav) of your desired speaker voice to generate a
            zero-shot custom voice clone model.
          </p>

          {/* Upload Drop Zone */}
          <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-2xl p-8 text-center bg-slate-950 transition-colors relative">
            <input
              type="file"
              accept="audio/*"
              onChange={handleSimulateVoiceUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 rounded-2xl">
                <FileAudio className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">
                  Drag & Drop Audio Sample or <span className="text-emerald-400 underline">Browse Files</span>
                </p>
                <p className="text-2xs text-slate-400 mt-1">
                  Supports MP3, WAV, M4A up to 25MB (Recommended: 30–60s clear speech)
                </p>
              </div>
            </div>
          </div>

          {/* Upload Status */}

          {uploadedVoiceFile && (
            <div role="status" className="p-4 bg-amber-950/40 rounded-xl border border-amber-800/70 text-xs space-y-1">
              <p className="font-bold text-white">
                {uploadedVoiceFile.name} <span className="font-normal text-slate-400">({uploadedVoiceFile.size})</span>
              </p>
              <p className="text-2xs text-amber-200">
                Voice cloning is not connected yet. The file stayed in your browser: it was not uploaded or processed,
                and no custom voice was created.
              </p>
            </div>
          )}
        </div>

        {/* AI Voice Model Selector */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Radio className="w-4 h-4 text-indigo-300" />
            <span>2. Pre-Trained AI Voice Models & Engines</span>
          </h3>

          <div className="space-y-3">
            {voiceModelOptions.map((vm) => {
              const isSelected = selectedVoiceModel === vm.id;
              return (
                <div
                  key={vm.id}
                  onClick={() => setSelectedVoiceModel(vm.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-950/50 border-indigo-500/80 ring-1 ring-indigo-500/50'
                      : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2.5 rounded-xl border ${isSelected ? 'bg-indigo-900 border-indigo-700 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                    >
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-xs font-bold text-white">{vm.name}</h4>
                        <span className="text-2xs font-bold px-2 py-0.2 rounded-full bg-slate-900 text-indigo-300 border border-slate-800">
                          {vm.badge}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-400 mt-0.5">
                        {vm.category} • Tone: <strong className="text-slate-300">{vm.tone}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center">
                    {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT 5 COLS: Voice Customization & Test Synthesis */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 sticky top-20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-white flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>3. Voice Modulation & Synthesis</span>
            </span>
            <span className="text-2xs font-bold text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">
              Live Preview
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Voice Tone & Persona Style</label>
              <input
                aria-label="Voice Tone & Persona Style"
                type="text"
                value={voiceTone}
                onChange={(e) => setVoiceTone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Regional Accent</label>
              <select
                aria-label="Regional Accent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-emerald-500"
              >
                <option value="US West Coast Tech Standard">US West Coast Tech Standard</option>
                <option value="British Editorial Professional">British Editorial Professional</option>
                <option value="Global Neutral English">Global Neutral English</option>
                <option value="Australian Executive">Australian Executive</option>
              </select>
            </div>

            {/* Pitch & Speed Modulators */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Speech Pitch Modifier</span>
                  <span className="font-mono text-emerald-400 font-bold">{pitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.2"
                  step="0.02"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Pacing / Cadence Speed</span>
                  <span className="font-mono text-indigo-300 font-bold">{speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.02"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-900"
                />
              </div>
            </div>

            {/* Test Speech Player */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="text-slate-300 font-bold block">Synthesize Sample Audio Test</label>
              <textarea
                aria-label="Synthesize Sample Audio Test"
                rows={2}
                value={samplePhrase}
                onChange={(e) => setSamplePhrase(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl p-2.5 outline-none focus:border-emerald-500 text-xs resize-none"
              />

              <p className="text-2xs text-slate-400">
                Uses your browser&apos;s built-in speech voice. It does not sound like the selected AI voice model
                (voice synthesis is not connected).
              </p>
              <button
                onClick={handlePlayVoicePreview}
                disabled={isPlayingAudio}
                className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20"
              >
                <Play className={`w-4 h-4 ${isPlayingAudio ? 'animate-spin' : ''}`} />
                <span>{isPlayingAudio ? 'Speaking…' : 'Preview with browser voice'}</span>
              </button>

              {isPlayingAudio && (
                <div className="flex items-center space-x-1 pt-2 justify-center">
                  <span className="w-1.5 h-4 bg-emerald-400 animate-pulse rounded-full"></span>
                  <span className="w-1.5 h-6 bg-emerald-500 animate-pulse delay-75 rounded-full"></span>
                  <span className="w-1.5 h-3 bg-emerald-400 animate-pulse delay-150 rounded-full"></span>
                  <span className="w-1.5 h-7 bg-emerald-300 animate-pulse delay-100 rounded-full"></span>
                  <span className="w-1.5 h-5 bg-emerald-500 animate-pulse rounded-full"></span>
                  <span className="text-2xs text-emerald-400 font-mono ml-2">Playing</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-800/60 text-2xs text-indigo-300">
              <p>
                <strong>Voice Profile Linked:</strong> Voice settings will automatically be attached to{' '}
                <strong className="text-white">{name}</strong> on save.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
