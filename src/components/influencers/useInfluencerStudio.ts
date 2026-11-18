import React, { useCallback, useEffect, useState } from 'react';
import type { AIInfluencer, Platform, Workspace } from '../../types';
import { newId } from '../../lib/ids';
import {
  cloneVoice,
  createSpeech,
  createVideo,
  deleteClonedVoice,
  fetchMediaItem,
  fetchMediaList,
  fetchVoices,
  type MediaItem,
  type VoicesResponse,
} from '../../lib/mediaApi';

export interface InfluencerStudioProps {
  currentWorkspace: Workspace;
  influencers: AIInfluencer[];
  onSaveInfluencer: (influencer: AIInfluencer) => void;
  onToggleLock: (id: string) => void;
  /** Resolves to an error message, or null on success. Credits are handled by the server. */
  onGenerateContentForInfluencer: (
    influencer: AIInfluencer,
    prompt: string,
    platform: Platform,
  ) => Promise<string | null>;
}

/** All state and actions of the AI Influencer Studio (draft persona, voice, quick-post modal). */
export function useInfluencerStudio({
  currentWorkspace,
  influencers,
  onSaveInfluencer,
  onToggleLock,
  onGenerateContentForInfluencer,
}: InfluencerStudioProps) {
  const workspaceInfluencers = influencers.filter((inf) => inf.workspaceId === currentWorkspace.id);

  // Sub-tabs: 'constructor' | 'voice' | 'campaigns3d' | 'roster'
  const [activeSubTab, setActiveSubTab] = useState<'constructor' | 'voice' | 'campaigns3d' | 'roster'>('constructor');

  // Active Draft Constructor State
  const [name, setName] = useState('Sophia Chen');
  const [handle, setHandle] = useState('@sophia.tech.ai');
  const [archetype, setArchetype] = useState('SaaS Product & AI Researcher');
  const [niche, setNiche] = useState('Developer Tools & Enterprise AI');
  const [bio, setBio] = useState(
    'Virtual AI product researcher showcasing developer productivity tools, code generation benchmarks, and modern stack architecture.',
  );
  const [avatarUrl, setAvatarUrl] = useState(
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80',
  );

  // Stored with each profile (part of the saved format); not used for generation.
  const [seed, setSeed] = useState<number>(482019382);
  const [faceConsistency, setFaceConsistency] = useState<number>(0.95);
  const [styleStrength, setStyleStrength] = useState<number>(0.85);
  const [lightingModel, setLightingModel] = useState<string>('Studio Softbox High Key');
  const [appearancePrompt, setAppearancePrompt] = useState(
    'Hyper-realistic 28-year-old female tech presenter, sharp bone structure, deep brown almond eyes, sleek shoulder-length dark hair, wearing a minimalist slate turtleneck sweater, modern glass office background, soft natural studio lighting, 8k raw photography, crisp skin texture.',
  );
  const [negativePrompt, setNegativePrompt] = useState(
    'deformed eyes, extra limbs, cartoonish, low resolution, glossy plastic skin, blurry faces, oversaturated',
  );

  // Voice Profile Dedicated State
  const [voiceTone, setVoiceTone] = useState('Engaging, articulate, warm tech innovator');
  const [speed, setSpeed] = useState<number>(1.0);
  const [accent, setAccent] = useState('US West Coast Tech Standard');
  const [samplePhrase, setSamplePhrase] = useState(
    'Hey everyone! Today we are testing real-time agent orchestration with 99% zero-drift accuracy.',
  );
  const [uploadedVoiceFile, setUploadedVoiceFile] = useState<{ name: string; size: string; duration: string } | null>(
    null,
  );
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Lock State for the constructor draft
  const [isLocked, setIsLocked] = useState(true);
  const [faceEmbeddingHash, setFaceEmbeddingHash] = useState('ip_adapter_v2_f89012a9_sophia');

  // Quick Post Generator Modal State
  const [quickPostPrompt, setQuickPostPrompt] = useState(
    'Announcing our new multi-modal workflow editor for engineering leads',
  );
  const [quickPlatform, setQuickPlatform] = useState<Platform>('linkedin');
  const [quickGenerating, setQuickGenerating] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [showQuickPublishModal, setShowQuickPublishModal] = useState(false);
  const [selectedInfluencerForPublish, setSelectedInfluencerForPublish] = useState<AIInfluencer | null>(null);

  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 900000000) + 100000000;
    setSeed(newSeed);
    setFaceEmbeddingHash(
      `ip_adapter_v2_${Math.random().toString(36).substring(2, 10)}_${name.toLowerCase().replace(/\s+/g, '')}`,
    );
  };

  // ---- AI voice (ElevenLabs) and talking video (D-ID) ----
  const wsId = currentWorkspace.id;
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneConsent, setCloneConsent] = useState(false);
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloning, setCloning] = useState(false);
  const [videoScript, setVideoScript] = useState(
    'Hi, I am Sophia. In thirty seconds I will show you how our agents ship code reviews while you sleep.',
  );
  const [videoBusy, setVideoBusy] = useState(false);
  const [videos, setVideos] = useState<MediaItem[]>([]);

  const allVoices = voices ? [...voices.cloned, ...voices.standard] : [];
  const selectedVoice = allVoices.find((v) => v.id === selectedVoiceId) ?? null;

  const loadVoices = useCallback(async () => {
    const r = await fetchVoices(wsId);
    if (typeof r === 'string') return setVoiceError(r);
    setVoices(r);
    setSelectedVoiceId((cur) => cur || r.cloned[0]?.id || r.standard[0]?.id || '');
  }, [wsId]);

  const loadVideos = useCallback(async () => {
    const r = await fetchMediaList(wsId);
    if (typeof r !== 'string') setVideos(r.filter((m) => m.kind === 'video').slice(0, 6));
  }, [wsId]);

  useEffect(() => {
    void loadVoices();
    void loadVideos();
  }, [loadVoices, loadVideos]);

  // Poll videos that are still rendering (D-ID usually takes under a minute).
  useEffect(() => {
    const pending = videos.filter((v) => v.status === 'processing');
    if (!pending.length) return;
    const t = window.setTimeout(async () => {
      const updated = await Promise.all(pending.map((v) => fetchMediaItem(wsId, v.id)));
      setVideos((prev) =>
        prev.map((v) => updated.find((u): u is MediaItem => typeof u !== 'string' && u.id === v.id) ?? v),
      );
    }, 5000);
    return () => window.clearTimeout(t);
  }, [videos, wsId]);

  // Speaks the sample phrase with the selected ElevenLabs voice (charged), or with the browser's own
  // voice when AI voices are not set up on the server (free, does not sound like the persona).
  const handlePlayVoicePreview = async () => {
    if (!samplePhrase.trim()) return;
    if (voices?.enabled.voice && selectedVoiceId) {
      setIsPlayingAudio(true);
      setVoiceError(null);
      const r = await createSpeech(wsId, { voiceId: selectedVoiceId, text: samplePhrase, speed });
      setIsPlayingAudio(false);
      if (typeof r === 'string') return setVoiceError(r);
      setPreviewMedia(r.media);
      return;
    }
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(samplePhrase);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);
    setIsPlayingAudio(true);
    synth.speak(utterance);
  };

  const handleSimulateVoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCloneFile(file);
    setUploadedVoiceFile({ name: file.name, size: (file.size / (1024 * 1024)).toFixed(2) + ' MB', duration: '' });
    if (!cloneName) setCloneName(`${name} voice`);
  };

  const handleCloneVoice = async () => {
    if (!cloneFile || !cloneConsent || !cloneName.trim()) return;
    if (cloneFile.size > 10 * 1024 * 1024) return setVoiceError('The sample must be under 10 MB.');
    setCloning(true);
    setVoiceError(null);
    const r = await cloneVoice(wsId, cloneName.trim(), cloneFile);
    setCloning(false);
    if (typeof r === 'string') return setVoiceError(r);
    setCloneFile(null);
    setUploadedVoiceFile(null);
    setCloneConsent(false);
    await loadVoices();
    setSelectedVoiceId(r.id);
  };

  const handleDeleteClonedVoice = async (voiceId: string) => {
    if (!window.confirm('Delete this cloned voice? Influencers using it will need a new voice.')) return;
    const err = await deleteClonedVoice(wsId, voiceId);
    if (err) return setVoiceError(err);
    if (selectedVoiceId === voiceId) setSelectedVoiceId('');
    await loadVoices();
  };

  const handleGenerateVideo = async () => {
    if (!selectedVoiceId || !videoScript.trim() || videoBusy) return;
    setVideoBusy(true);
    setVoiceError(null);
    const r = await createVideo(wsId, { voiceId: selectedVoiceId, text: videoScript, speed, imageUrl: avatarUrl });
    setVideoBusy(false);
    if (typeof r === 'string') return setVoiceError(r);
    setVideos((prev) => [r.media, ...prev].slice(0, 6));
  };

  const handleSaveConstructorDraft = () => {
    const newInf: AIInfluencer = {
      id: newId('inf'),
      workspaceId: currentWorkspace.id,
      name,
      handle,
      archetype,
      niche,
      bio,
      avatarUrl,
      locked: isLocked,
      faceEmbeddingHash,
      seed,
      loraWeights: {
        faceConsistency,
        styleStrength,
        lightingModel,
      },
      appearancePrompt,
      negativePrompt,
      voiceProfile: {
        tone: voiceTone,
        pitch: 1, // ElevenLabs voices have no pitch setting; kept for the stored profile format.
        speed,
        accent,
        samplePhrase,
        ...(selectedVoice ? { voiceId: selectedVoice.id, voiceName: selectedVoice.name } : {}),
      },
      postsGeneratedCount: 0,
      avgEngagementRate: '5.8%',
      createdAt: new Date().toISOString(),
    };

    onSaveInfluencer(newInf);
    setActiveSubTab('roster');
  };

  const handleOpenQuickPost = (inf: AIInfluencer) => {
    setSelectedInfluencerForPublish(inf);
    setShowQuickPublishModal(true);
  };

  const handleExecuteQuickGenerate = async () => {
    if (!selectedInfluencerForPublish || !quickPostPrompt.trim() || quickGenerating) return;
    setQuickGenerating(true);
    setQuickError(null);
    const error = await onGenerateContentForInfluencer(selectedInfluencerForPublish, quickPostPrompt, quickPlatform);
    setQuickGenerating(false);
    if (error) {
      setQuickError(error); // keep the modal open so the user sees why nothing was created
      return;
    }
    setShowQuickPublishModal(false);
    setQuickPostPrompt('');
  };

  return {
    currentWorkspace,
    onToggleLock,
    workspaceInfluencers,
    activeSubTab,
    setActiveSubTab,
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
    negativePrompt,
    setNegativePrompt,
    voiceTone,
    setVoiceTone,
    speed,
    setSpeed,
    accent,
    setAccent,
    samplePhrase,
    setSamplePhrase,
    uploadedVoiceFile,
    setUploadedVoiceFile,
    isPlayingAudio,
    setIsPlayingAudio,
    isLocked,
    setIsLocked,
    faceEmbeddingHash,
    setFaceEmbeddingHash,
    quickPostPrompt,
    setQuickPostPrompt,
    quickPlatform,
    setQuickPlatform,
    quickGenerating,
    setQuickGenerating,
    quickError,
    setQuickError,
    showQuickPublishModal,
    setShowQuickPublishModal,
    selectedInfluencerForPublish,
    setSelectedInfluencerForPublish,
    handleRandomizeSeed,
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
    handlePlayVoicePreview,
    handleSimulateVoiceUpload,
    handleSaveConstructorDraft,
    handleOpenQuickPost,
    handleExecuteQuickGenerate,
  };
}

export type InfluencerStudioState = ReturnType<typeof useInfluencerStudio>;
