import React from 'react';
import { Volume2, Play, Upload, Mic, FileAudio, Radio, Video, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { InfluencerStudioState } from './useInfluencerStudio';
import { AuthMedia } from '../ui/AuthMedia';

const card = 'bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4';
const input =
  'w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3.5 py-2 outline-none focus:border-emerald-500';

export function VoicePanel({ s }: { s: InfluencerStudioState }) {
  const {
    name,
    avatarUrl,
    voiceTone,
    setVoiceTone,
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
    voices,
    voiceError,
    selectedVoiceId,
    setSelectedVoiceId,
    selectedVoice,
    previewMedia,
    cloneName,
    setCloneName,
    cloneConsent,
    setCloneConsent,
    cloneFile,
    cloning,
    handleCloneVoice,
    handleDeleteClonedVoice,
    videoScript,
    setVideoScript,
    videoBusy,
    videos,
    handleGenerateVideo,
  } = s;
  const voiceOn = Boolean(voices?.enabled.voice);
  const videoOn = Boolean(voices?.enabled.video);
  const costs = voices?.costs ?? { voice: 5, video: 60 };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7 space-y-6">
        {!voiceOn && voices && (
          <p
            role="note"
            className="text-xs text-amber-200 bg-amber-950/40 border border-amber-800/60 rounded-xl px-4 py-3 leading-relaxed"
          >
            AI voices are not set up on this server. The admin needs ELEVENLABS_API_KEY (and DID_API_KEY for talking
            videos). Until then, previews use your browser&apos;s built-in voice.
          </p>
        )}

        {/* 1. Voice picker */}
        <div className={card}>
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Radio className="w-4 h-4 text-indigo-300" />
            <span>1. Choose {name}&apos;s voice</span>
          </h3>
          {voiceOn ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1" role="radiogroup" aria-label="Voice">
              {[...(voices?.cloned ?? []), ...(voices?.standard ?? [])].map((v) => {
                const isSelected = selectedVoiceId === v.id;
                return (
                  // A native radio (one tab stop, arrow keys between voices) with its label; the sample and
                  // delete buttons sit beside it, not inside it.
                  <div
                    key={v.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 focus-within:ring-2 focus-within:ring-indigo-400 ${
                      isSelected
                        ? 'bg-indigo-950/50 border-indigo-500/80 ring-1 ring-indigo-500/50'
                        : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <label className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="radio"
                        name="influencer-voice"
                        value={v.id}
                        checked={isSelected}
                        onChange={() => setSelectedVoiceId(v.id)}
                        className="sr-only"
                      />
                      <Mic className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-300' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-white truncate">{v.name}</h4>
                          {v.category === 'cloned' && (
                            <span className="text-2xs font-bold px-2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                              Cloned
                            </span>
                          )}
                        </div>
                        {v.description && <p className="text-2xs text-slate-400 truncate">{v.description}</p>}
                      </div>
                    </label>
                    <div className="flex items-center space-x-2 shrink-0">
                      {v.previewUrl && (
                        <button
                          type="button"
                          onClick={() => void new Audio(v.previewUrl).play()}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                          aria-label={`Play ${v.name} sample`}
                          title="Free sample from ElevenLabs"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {v.category === 'cloned' && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteClonedVoice(v.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900 text-slate-300"
                          aria-label={`Delete ${v.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Voices appear here once ElevenLabs is connected.</p>
          )}
        </div>

        {/* 2. Clone a voice */}
        <div className={card}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>2. Clone a voice (optional)</span>
            </h3>
            <span className="text-2xs text-slate-400">Owners & admins</span>
          </div>
          <p className="text-xs text-slate-400">
            Upload 30–60 seconds of one person speaking clearly (MP3, WAV or M4A, under 10 MB). Only clone a voice you
            own or have written permission to use.
          </p>
          <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-2xl p-6 text-center bg-slate-950 transition-colors relative">
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
              onChange={handleSimulateVoiceUpload}
              disabled={!voiceOn}
              aria-label="Voice sample"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
            />
            <div className="flex flex-col items-center space-y-2">
              <FileAudio className="w-7 h-7 text-emerald-400" />
              <p className="text-xs font-bold text-slate-200">
                {uploadedVoiceFile ? `${uploadedVoiceFile.name} (${uploadedVoiceFile.size})` : 'Choose an audio sample'}
              </p>
            </div>
          </div>
          {cloneFile && (
            <div className="space-y-3 text-xs">
              <input
                aria-label="Voice name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="Voice name"
                maxLength={100}
                className={input}
              />
              <label className="flex items-start space-x-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={cloneConsent}
                  onChange={(e) => setCloneConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm this is my voice, or I have the speaker&apos;s permission to clone it for this workspace.
                </span>
              </label>
              <button
                onClick={handleCloneVoice}
                disabled={!cloneConsent || !cloneName.trim() || cloning}
                className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl disabled:bg-slate-800 disabled:text-slate-400"
              >
                {cloning ? 'Cloning…' : 'Clone voice'}
              </button>
            </div>
          )}
        </div>

        {/* 3. Talking video */}
        <div className={card}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Video className="w-4 h-4 text-purple-300" />
              <span>3. Talking-head video</span>
            </h3>
            <span className="text-2xs font-mono text-purple-300">{costs.video} credits</span>
          </div>
          <div className="flex gap-4">
            {avatarUrl && <img src={avatarUrl} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />}
            <div className="text-xs text-slate-400 space-y-1">
              <p>
                {name}&apos;s photo speaks this script in{' '}
                <strong className="text-slate-200">{selectedVoice?.name ?? 'the selected voice'}</strong>. Use a clear,
                front-facing photo with one face. Rendering takes about a minute.
              </p>
              {!videoOn && voiceOn && <p className="text-amber-300">Needs DID_API_KEY on the server.</p>}
            </div>
          </div>
          <textarea
            aria-label="Video script"
            rows={3}
            maxLength={2500}
            value={videoScript}
            onChange={(e) => setVideoScript(e.target.value)}
            className={`${input} resize-none text-xs`}
          />
          <button
            onClick={handleGenerateVideo}
            disabled={!videoOn || !selectedVoiceId || !videoScript.trim() || videoBusy}
            className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 rounded-xl text-xs disabled:bg-slate-800 disabled:text-slate-400"
          >
            {videoBusy ? 'Starting…' : `Generate video (${costs.video} credits)`}
          </button>

          {videos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {videos.map((v) => (
                <div key={v.id} className="bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1.5">
                  {v.status === 'ready' && v.url ? (
                    <AuthMedia path={v.url} kind="video" className="w-full rounded-lg" downloadName={`${v.id}.mp4`} />
                  ) : v.status === 'processing' ? (
                    <div className="aspect-video rounded-lg bg-slate-900 flex flex-col items-center justify-center text-2xs text-slate-400 space-y-1">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Rendering with D-ID…</span>
                    </div>
                  ) : (
                    <div className="aspect-video rounded-lg bg-slate-900 flex flex-col items-center justify-center text-2xs text-amber-300 p-3 text-center space-y-1">
                      <AlertTriangle className="w-5 h-5" />
                      <span>{v.error ?? 'Failed'}</span>
                    </div>
                  )}
                  <p className="text-2xs text-slate-400 line-clamp-2">{v.script}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: persona notes + test speech */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 sticky top-20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-white flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>4. Test the voice</span>
            </span>
            {voiceOn && <span className="text-2xs font-mono text-emerald-400">{costs.voice} credits</span>}
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Voice tone & persona notes</label>
              <input
                aria-label="Voice tone & persona notes"
                type="text"
                value={voiceTone}
                onChange={(e) => setVoiceTone(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Accent (note for writers)</label>
              <select aria-label="Accent" value={accent} onChange={(e) => setAccent(e.target.value)} className={input}>
                <option value="US West Coast Tech Standard">US West Coast Tech Standard</option>
                <option value="British Editorial Professional">British Editorial Professional</option>
                <option value="Global Neutral English">Global Neutral English</option>
                <option value="Australian Executive">Australian Executive</option>
              </select>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <div className="flex justify-between font-medium">
                <span className="text-slate-400">Speaking speed</span>
                <span className="font-mono text-indigo-300 font-bold">{speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.2"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                aria-label="Speaking speed"
                className="w-full accent-indigo-500 bg-slate-900"
              />
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <label className="text-slate-300 font-bold block">Sample line</label>
              <textarea
                aria-label="Sample line"
                rows={2}
                maxLength={2500}
                value={samplePhrase}
                onChange={(e) => setSamplePhrase(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl p-2.5 outline-none focus:border-emerald-500 text-xs resize-none"
              />
              {!voiceOn && (
                <p className="text-2xs text-slate-400">Uses your browser&apos;s voice (AI voices not set up).</p>
              )}
              <button
                onClick={handlePlayVoicePreview}
                disabled={isPlayingAudio || (voiceOn && !selectedVoiceId)}
                className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                {isPlayingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>
                  {isPlayingAudio
                    ? voiceOn
                      ? 'Generating…'
                      : 'Speaking…'
                    : voiceOn
                      ? `Speak with ${selectedVoice?.name ?? 'voice'}`
                      : 'Preview with browser voice'}
                </span>
              </button>
              {previewMedia?.url && (
                <AuthMedia
                  key={previewMedia.id}
                  path={previewMedia.url}
                  kind="audio"
                  autoPlay
                  className="w-full"
                  downloadName={`${previewMedia.id}.mp3`}
                />
              )}
            </div>

            {voiceError && (
              <p className="text-sm font-semibold text-rose-300" role="alert">
                {voiceError}
              </p>
            )}

            <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-800/60 text-2xs text-indigo-300">
              <p>
                The selected voice{selectedVoice ? ` (${selectedVoice.name})` : ''} is saved with{' '}
                <strong className="text-white">{name}</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
