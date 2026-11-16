import React from 'react';
import { SafeImg } from '../ui/SafeImg';
import { UserCheck, Sparkles, Lock, Unlock, Cpu, Plus, Dices } from 'lucide-react';
import { avatarPresets } from './influencerData';
import type { InfluencerStudioState } from './useInfluencerStudio';

export function IdentityPanel({ s }: { s: InfluencerStudioState }) {
  const {
    name,
    setName,
    handle,
    setHandle,
    archetype,
    setArchetype,
    niche,
    setNiche,
    bio,
    setBio,
    avatarUrl,
    setAvatarUrl,
    seed,
    setSeed,
    faceConsistency,
    setFaceConsistency,
    styleStrength,
    setStyleStrength,
    lightingModel,
    setLightingModel,
    appearancePrompt,
    setAppearancePrompt,
    isLocked,
    setIsLocked,
    faceEmbeddingHash,
    setFaceEmbeddingHash,
    handleRandomizeSeed,
    handleSaveConstructorDraft,
  } = s;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT 7 COLS: Controls, Prompts, LoRA Weights */}
      <div className="lg:col-span-7 space-y-6">
        {/* Presets Quick-Select */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Preset Archetypes</span>
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {avatarPresets.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setName(p.name.split(' ')[0] + ' ' + p.name.split(' ')[1]);
                  setAvatarUrl(p.url);
                  setArchetype(p.archetype);
                  setSeed(p.seed);
                  setFaceEmbeddingHash(`ip_adapter_v2_${p.seed}_${p.name.split(' ')[0].toLowerCase()}`);
                }}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800/80 rounded-xl flex items-center space-x-2 text-left transition-colors"
              >
                <SafeImg src={p.url} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">{p.name.split(' ')[0]}</p>
                  <p className="text-2xs text-slate-400 truncate">{p.archetype.split('&')[0]}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <UserCheck className="w-4 h-4 text-indigo-300" />
            <span>1. Core Personalization & Social Bio</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Influencer Full Name</label>
              <input
                aria-label="Influencer Full Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500 font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Social Handle</label>
              <input
                aria-label="Social Handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-indigo-300 rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Archetype Title</label>
              <input
                aria-label="Archetype Title"
                type="text"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Target Content Niche</label>
              <input
                aria-label="Target Content Niche"
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Personal Bio & Brand Mission</label>
            <textarea
              aria-label="Personal Bio & Brand Mission"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* ComfyUI LoRA Weights & Seed Matrix */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>2. ComfyUI Generation Seed & LoRA Parameters</span>
            </h3>
            <span className="text-2xs font-mono text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800/60">
              IP-Adapter SDXL v2
            </span>
          </div>

          <div className="space-y-4">
            {/* Seed Anchor */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-slate-200 block">Deterministic Seed Anchor</label>
                <p className="text-2xs text-slate-400">
                  Locking the seed ensures zero-drift facial structure consistency.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-indigo-300 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                  #{seed}
                </span>
                <button
                  onClick={handleRandomizeSeed}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                  title="Randomize Seed"
                >
                  <Dices className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* LoRA Weights Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-300">Face Consistency Weight</span>
                  <span className="font-mono text-emerald-400 font-bold">{(faceConsistency * 100).toFixed(0)}%</span>
                </div>
                <input
                  aria-label="Face consistency weight"
                  type="range"
                  min="0.70"
                  max="1.00"
                  step="0.01"
                  value={faceConsistency}
                  onChange={(e) => setFaceConsistency(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-900"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-300">Style & Lighting Strength</span>
                  <span className="font-mono text-amber-400 font-bold">{(styleStrength * 100).toFixed(0)}%</span>
                </div>
                <input
                  aria-label="Style and lighting strength"
                  type="range"
                  min="0.50"
                  max="1.00"
                  step="0.01"
                  value={styleStrength}
                  onChange={(e) => setStyleStrength(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-900"
                />
              </div>
            </div>

            {/* Studio Lighting Environment */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Studio Lighting Environment</label>
              <select
                aria-label="Studio Lighting Environment"
                value={lightingModel}
                onChange={(e) => setLightingModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
              >
                <option value="Studio Softbox High Key">Studio Softbox High Key (Clean B2B / Executive)</option>
                <option value="Cinematic Golden Hour">Cinematic Golden Hour (Warm Lifestyle / Natural)</option>
                <option value="Cyberpunk Neon Accent">Cyberpunk Neon Accent (Tech / Gaming / Modern)</option>
                <option value="Editorial Natural Light">Editorial Natural Light (Minimalist / Fashion)</option>
              </select>
            </div>

            {/* Appearance Prompt Matrix */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Appearance Prompt Matrix</label>
              <textarea
                aria-label="Appearance Prompt Matrix"
                rows={3}
                value={appearancePrompt}
                onChange={(e) => setAppearancePrompt(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 font-mono resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT 5 COLS: Visual Stage & Identity Lock */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 sticky top-20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-indigo-300" />
              <span>Visual Stage & Lock Preview</span>
            </span>
            <span
              className={`text-2xs font-bold px-2.5 py-0.5 rounded-full border ${
                isLocked
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}
            >
              {isLocked ? 'Identity Locked' : 'Draft Editing'}
            </span>
          </div>

          {/* Portrait Preview Card */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 group">
            <SafeImg
              src={avatarUrl}
              alt={name}
              className="w-full h-80 object-cover object-center group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>

            <div className="absolute bottom-4 left-4 right-4 space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-white">{name}</h2>
                <span className="text-xs font-mono font-bold text-indigo-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {handle}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-300">{archetype}</p>
              <p className="text-2xs text-slate-400 line-clamp-2">{bio}</p>
            </div>
          </div>

          {/* Embed & Lock Specs */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Embedding Hash</span>
              <span className="font-mono text-slate-200 font-bold text-2xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {faceEmbeddingHash}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Fixed Seed</span>
              <span className="font-mono text-indigo-300 font-bold">#{seed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">Identity Lock</span>
              <span className="text-emerald-400 font-bold">{(faceConsistency * 100).toFixed(0)}% Zero-Drift</span>
            </div>
          </div>

          {/* Lock Toggle */}
          <button
            onClick={() => setIsLocked(!isLocked)}
            className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg ${
              isLocked
                ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-emerald-600/20'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
            }`}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            <span>{isLocked ? 'IDENTITY LOCKED & ANCHORED' : 'CLICK TO LOCK IDENTITY'}</span>
          </button>

          <button
            onClick={handleSaveConstructorDraft}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center space-x-2 transition-all shadow-xl shadow-indigo-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>SAVE TO INFLUENCER ROSTER</span>
          </button>
        </div>
      </div>
    </div>
  );
}
