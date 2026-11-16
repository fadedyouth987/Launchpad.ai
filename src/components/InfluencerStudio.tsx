import React from 'react';
import { UserCheck, Volume2, Sliders, RadioTower } from 'lucide-react';
import { useInfluencerStudio, type InfluencerStudioProps } from './influencers/useInfluencerStudio';
import { IdentityPanel } from './influencers/IdentityPanel';
import { VoicePanel } from './influencers/VoicePanel';
import { Campaigns3DPanel } from './influencers/Campaigns3DPanel';
import { RosterPanel } from './influencers/RosterPanel';
import { QuickPostModal } from './influencers/QuickPostModal';

/** AI Influencer Studio: persona identity, voice profile, 3D campaign showcase and saved roster. */
export const InfluencerStudio: React.FC<InfluencerStudioProps> = (props) => {
  const s = useInfluencerStudio(props);
  const { showQuickPublishModal, selectedInfluencerForPublish, workspaceInfluencers, activeSubTab, setActiveSubTab } =
    s;

  return (
    <div className="space-y-8 w-full">
      {/* Header Bar - Clean & Spacious Layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-2xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  ComfyUI Zero-Drift Lock
                </span>
              </div>
              <p className="text-sm text-ink-muted">
                Design custom brand avatars, synthesize voice models from reference files, and broadcast moving 3D
                marketing campaigns.
              </p>
            </div>
          </div>
        </div>

        {/* Spacious, Clear Sub-Tab Navigation */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl text-xs shrink-0">
          <button
            onClick={() => setActiveSubTab('constructor')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'constructor'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Identity & Face</span>
          </button>

          <button
            onClick={() => setActiveSubTab('voice')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'voice'
                ? 'bg-emerald-700 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Voice Profile</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>

          <button
            onClick={() => setActiveSubTab('campaigns3d')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'campaigns3d'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <RadioTower className="w-4 h-4 text-purple-300" />
            <span>3D Live Campaigns</span>
          </button>

          <button
            onClick={() => setActiveSubTab('roster')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'roster'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Saved Roster ({workspaceInfluencers.length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'constructor' && <IdentityPanel s={s} />}
      {activeSubTab === 'voice' && <VoicePanel s={s} />}
      {activeSubTab === 'campaigns3d' && <Campaigns3DPanel s={s} />}
      {activeSubTab === 'roster' && <RosterPanel s={s} />}
      {showQuickPublishModal && selectedInfluencerForPublish && <QuickPostModal s={s} />}
    </div>
  );
};
