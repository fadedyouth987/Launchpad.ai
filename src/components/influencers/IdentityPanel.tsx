import React from 'react';
import { SafeImg } from '../ui/SafeImg';
import { UserCheck, Sparkles, Lock, Unlock, Plus } from 'lucide-react';
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
    setSeed,
    appearancePrompt,
    setAppearancePrompt,
    isLocked,
    setIsLocked,
    handleSaveConstructorDraft,
  } = s;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT 7 COLS: profile and appearance */}
      <div className="lg:col-span-7 space-y-6">
        {/* Presets Quick-Select */}
        <div className="bg-surface border border-line p-5 rounded-2xl space-y-3">
          <span className="text-xs font-bold text-ink-muted flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>Start from a preset</span>
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
                }}
                className="p-2.5 bg-canvas hover:bg-surface-muted border border-line/80 rounded-xl flex items-center space-x-2 text-left transition-colors"
              >
                <SafeImg src={p.url} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{p.name.split(' ')[0]}</p>
                  <p className="text-2xs text-ink-subtle truncate">{p.archetype.split('&')[0]}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="bg-surface border border-line p-6 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-ink flex items-center space-x-2 border-b border-line pb-3">
            <UserCheck className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
            <span>1. Profile</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-ink-muted block mb-1.5">Name</label>
              <input
                aria-label="Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-canvas border border-line text-xs text-ink rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500 font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-muted block mb-1.5">Handle</label>
              <input
                aria-label="Handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full bg-canvas border border-line text-xs text-indigo-700 dark:text-indigo-300 rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-muted block mb-1.5">Role or title</label>
              <input
                aria-label="Role or title"
                type="text"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                className="w-full bg-canvas border border-line text-xs text-ink rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-muted block mb-1.5">Topics</label>
              <input
                aria-label="Topics"
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full bg-canvas border border-line text-xs text-ink rounded-xl px-3.5 py-2.5 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-muted block mb-1.5">Short bio</label>
            <textarea
              aria-label="Short bio"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-canvas border border-line text-xs text-ink rounded-xl p-3 outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Appearance: the only part of the look that is sent to image generation (as text). */}
        <div className="bg-surface border border-line p-6 rounded-2xl space-y-3">
          <h2 className="text-sm font-bold text-ink flex items-center space-x-2 border-b border-line pb-3">
            <Sparkles className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
            <span>2. Appearance</span>
          </h2>
          <label htmlFor="influencer-appearance" className="text-xs font-semibold text-ink-muted block">
            Describe how this person looks
          </label>
          <textarea
            id="influencer-appearance"
            rows={4}
            value={appearancePrompt}
            onChange={(e) => setAppearancePrompt(e.target.value)}
            className="w-full bg-canvas border border-line text-xs text-ink rounded-xl p-3 outline-none focus:border-indigo-500 resize-none"
          />
          <p className="text-2xs text-ink-subtle">
            Added to every image prompt for this influencer. The same description keeps their look similar across posts,
            but image models cannot guarantee an identical face.
          </p>
        </div>
      </div>

      {/* RIGHT 5 COLS: preview, lock and save */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-surface border border-line p-6 rounded-2xl space-y-5 sticky top-20">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <span className="text-xs font-bold text-ink flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
              <span>Preview</span>
            </span>
            <span
              className={`text-2xs font-bold px-2.5 py-0.5 rounded-full border ${
                isLocked
                  ? 'bg-success-50 text-success-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-warning-50 text-warning-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              {isLocked ? 'Locked' : 'Draft'}
            </span>
          </div>

          {/* Portrait Preview Card (text sits on a dark photo overlay in both themes, so it stays light) */}
          <div className="relative rounded-2xl overflow-hidden border border-line bg-canvas group">
            <SafeImg
              src={avatarUrl}
              alt={name}
              className="w-full h-80 object-cover object-center group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>

            <div className="absolute bottom-4 left-4 right-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-extrabold text-white truncate">{name}</h2>
                <span className="text-xs font-mono font-bold text-indigo-200 bg-slate-950/70 px-2 py-0.5 rounded border border-white/20 shrink-0">
                  {handle}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-200">{archetype}</p>
              <p className="text-2xs text-slate-300 line-clamp-2">{bio}</p>
            </div>
          </div>

          {/* Lock: a locked profile cannot be edited by mistake (see the roster). */}
          <button
            onClick={() => setIsLocked(!isLocked)}
            aria-pressed={isLocked}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-colors border ${
              isLocked
                ? 'bg-success-50 text-success-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                : 'bg-surface text-ink border-line-strong hover:bg-surface-muted'
            }`}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            <span>{isLocked ? 'Profile locked' : 'Lock profile'}</span>
          </button>

          <button
            onClick={handleSaveConstructorDraft}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-xl shadow-indigo-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Save to roster</span>
          </button>
        </div>
      </div>
    </div>
  );
}
