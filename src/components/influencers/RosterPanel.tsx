import React from 'react';
import { EmptyState } from '../ui/States';
import { SafeImg } from '../ui/SafeImg';
import { Sparkles, Lock, Unlock, Plus } from 'lucide-react';
import type { InfluencerStudioState } from './useInfluencerStudio';

export function RosterPanel({ s }: { s: InfluencerStudioState }) {
  const { onToggleLock, workspaceInfluencers, setActiveSubTab, handleOpenQuickPost } = s;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-white">Workspace AI Influencers ({workspaceInfluencers.length})</h2>
          <p className="text-xs text-slate-400">Locked digital personalities ready for instant campaign generation.</p>
        </div>

        <button
          onClick={() => setActiveSubTab('constructor')}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Create New AI Influencer</span>
        </button>
      </div>

      {workspaceInfluencers.length === 0 && (
        <EmptyState
          title="No saved influencers yet"
          description="Design a persona on the Identity & Face tab and press “Save to influencer roster”. It will appear here."
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaceInfluencers.map((inf) => (
          <div
            key={inf.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-indigo-500/50 transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <SafeImg
                  src={inf.avatarUrl}
                  alt={inf.name}
                  className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white truncate">{inf.name}</h3>
                    <button
                      onClick={() => onToggleLock(inf.id)}
                      className={`p-1 rounded-lg border text-2xs font-bold flex items-center space-x-1 ${
                        inf.locked
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}
                      title={inf.locked ? 'Click to Unlock' : 'Click to Lock'}
                    >
                      {inf.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      <span>{inf.locked ? 'Locked' : 'Draft'}</span>
                    </button>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-300 block">{inf.handle}</span>
                  <span className="text-2xs text-slate-400 font-medium block truncate">{inf.archetype}</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{inf.bio}</p>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1 text-2xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Embedding Token:</span>
                  <span className="font-mono text-slate-200 font-bold truncate max-w-[140px]">
                    {inf.faceEmbeddingHash}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fixed Seed:</span>
                  <span className="font-mono text-indigo-300 font-bold">#{inf.seed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Voice Tone:</span>
                  <span className="text-slate-300 font-medium truncate max-w-[140px]">{inf.voiceProfile.tone}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <button
                onClick={() => handleOpenQuickPost(inf)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-md shadow-indigo-600/20"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Generate Content with {inf.name.split(' ')[0]}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
