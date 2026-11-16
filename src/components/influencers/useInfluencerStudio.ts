import React, { useState } from 'react';
import type { AIInfluencer, Platform, Workspace } from '../../types';
import { newId } from '../../lib/ids';

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

  // ComfyUI / IP-Adapter Technical Seed & LoRA Parameters
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
  const [selectedVoiceModel, setSelectedVoiceModel] = useState('elevenlabs-rachel');
  const [voiceTone, setVoiceTone] = useState('Engaging, articulate, warm tech innovator');
  const [pitch, setPitch] = useState<number>(1.0);
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

  // Reads the sample phrase with the browser's built-in speech synthesis. This is a local preview only:
  // no AI voice model is connected, so it does not sound like the selected voice.
  const handlePlayVoicePreview = () => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || !samplePhrase.trim()) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(samplePhrase);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);
    setIsPlayingAudio(true);
    synth.speak(utterance);
  };

  const handleSimulateVoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedVoiceFile({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        duration: 'not analysed',
      });
      // Voice cloning is not built: the file is only noted in this browser, never uploaded or processed.
    }
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
        pitch,
        speed,
        accent,
        samplePhrase,
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
    handlePlayVoicePreview,
    handleSimulateVoiceUpload,
    handleSaveConstructorDraft,
    handleOpenQuickPost,
    handleExecuteQuickGenerate,
  };
}

export type InfluencerStudioState = ReturnType<typeof useInfluencerStudio>;
