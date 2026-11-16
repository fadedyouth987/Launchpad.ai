import React, { useState } from 'react';
import { CampaignAsset, Platform, Workspace } from '../types';
import {
  Sparkles,
  Send,
  Zap,
  CheckCircle2,
  Copy,
  Lock,
  Unlock,
  History,
  Image as ImageIcon,
  AlertCircle,
  Linkedin,
  Instagram,
  Twitter,
  Facebook,
  Video,
  Layers,
} from 'lucide-react';
import { apiErrorMessage, apiJson } from '../lib/api';
import { newId } from '../lib/ids';
import { aiName, useActiveAi } from '../hooks/useActiveAi';
import { AuthImage } from './ui/AuthImage';

interface AssetStudioProps {
  currentWorkspace: Workspace;
  onAddAsset: (asset: CampaignAsset) => void;
  /** Called with the server's new balance after a charged generation or a refund. */
  onCreditsChanged: (newBalance?: number) => void;
  onNavigateToApprovals: () => void;
}

export const AssetStudio: React.FC<AssetStudioProps> = ({
  currentWorkspace,
  onAddAsset,
  onCreditsChanged,
  onNavigateToApprovals,
}) => {
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [stylePreset, setStylePreset] = useState<string>('Tech Minimalist');
  const [promptInput, setPromptInput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Generated Result State
  const [generatedResult, setGeneratedResult] = useState<{
    title: string;
    caption: string;
    hashtags: string[];
    imagePrompt: string;
    visualDirection: string;
    aiEngine: string;
    sample: boolean;
    costCredits: number;
  } | null>(null);

  const activeAi = useActiveAi(currentWorkspace.id);
  const [image, setImage] = useState<{ id: string; url: string; engine: string } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Quick Preset Prompts
  const samplePrompts = [
    'Q3 Enterprise AI product announcement featuring automated social workflows & credit security',
    'Customer Success Case Study: How Acme Corp scaled content creation 5x with zero brand drift',
    'Behind the Scenes Engineering: How we built a zero-double-spend credit ledger on PostgreSQL',
    '3 Growth Automation Hacks for B2B SaaS Founders scaling multi-channel publishing in 2026',
  ];

  const handleGenerate = async () => {
    if (!promptInput.trim()) {
      setErrorMsg('Please enter a prompt or select a quick starter above.');
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setImage(null);
    setImageError(null);

    // Credits are checked, charged and (on failure) refunded by the server.
    const r = await apiJson<{
      sample?: boolean;
      costCredits?: number;
      newBalance?: number;
      refunded?: boolean;
      data?: { caption: string; hashtags: string[]; imagePrompt: string; visualDirection: string; aiEngine?: string };
    }>('/api/generate', {
      json: { workspaceId: currentWorkspace.id, purpose: 'studio', prompt: promptInput, platform, stylePreset },
    });
    setIsGenerating(false);

    if (typeof r.data.newBalance === 'number') onCreditsChanged(r.data.newBalance);
    else if (r.data.refunded) onCreditsChanged();

    if (r.ok && r.data.data) {
      setGeneratedResult({
        title: promptInput.length > 50 ? promptInput.substring(0, 47) + '...' : promptInput,
        caption: r.data.data.caption,
        hashtags: r.data.data.hashtags,
        imagePrompt: r.data.data.imagePrompt,
        visualDirection: r.data.data.visualDirection,
        aiEngine: r.data.data.aiEngine || aiName(activeAi.text),
        sample: Boolean(r.data.sample),
        costCredits: r.data.costCredits ?? 0,
      });
    } else {
      setGeneratedResult(null);
      setErrorMsg(apiErrorMessage(r, 'AI generation failed. Please try again.'));
    }
  };

  const handleGenerateImage = async () => {
    if (!generatedResult) return;
    setImageBusy(true);
    setImageError(null);
    const r = await apiJson<{
      image?: { id: string };
      url?: string;
      engine?: string;
      newBalance?: number;
      refunded?: boolean;
    }>('/api/images/generate', {
      json: { workspaceId: currentWorkspace.id, prompt: generatedResult.imagePrompt || generatedResult.title },
    });
    setImageBusy(false);
    if (typeof r.data.newBalance === 'number') onCreditsChanged(r.data.newBalance);
    else if (r.data.refunded) onCreditsChanged();
    if (r.ok && r.data.image && r.data.url)
      setImage({ id: r.data.image.id, url: r.data.url, engine: r.data.engine || '' });
    else setImageError(apiErrorMessage(r, 'Image generation failed.'));
  };

  const handleSubmitToApproval = () => {
    if (!generatedResult) return;

    const newAsset: CampaignAsset = {
      id: newId('asset'),
      workspaceId: currentWorkspace.id,
      title: generatedResult.title,
      platform: platform,
      status: 'pending_review',
      currentVersion: 1,
      caption: generatedResult.caption,
      hashtags: generatedResult.hashtags,
      imagePrompt: generatedResult.imagePrompt,
      visualDirection: generatedResult.visualDirection,
      ...(image ? { imageId: image.id } : {}),
      approverId: currentWorkspace.members.find((m) => m.role === 'approver' || m.role === 'owner')?.id,
      lockedBy: isLocked ? currentWorkspace.members[0].id : undefined,
      versions: [
        {
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          createdBy: currentWorkspace.members[0].name,
          caption: generatedResult.caption,
          hashtags: generatedResult.hashtags,
          imagePrompt: generatedResult.imagePrompt,
          visualDirection: generatedResult.visualDirection,
          costCredits: generatedResult.costCredits,
        },
      ],
      comments: [
        {
          id: newId('c'),
          authorName: currentWorkspace.members[0].name,
          authorAvatar: currentWorkspace.members[0].avatar,
          text: `Submitted v1 from AI Studio for team review on ${platform.toUpperCase()}.`,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    onAddAsset(newAsset);
    onNavigateToApprovals();
  };

  const handleCopyCaption = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(`${generatedResult.caption}\n\n${generatedResult.hashtags.join(' ')}`);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="space-y-8 w-full">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
              {activeAi.loaded ? `AI: ${aiName(activeAi.text)}` : 'Checking AI provider…'}
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            Generate platform-native social media copy, hashtags, and 3D art directions with credit-safe reservations.
          </p>
        </div>

        {/* Credit Cost Badge */}
        <div className="flex items-center space-x-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-slate-300">Generation Cost:</span>
          <span className="font-mono font-bold text-amber-300 text-sm">{activeAi.costs?.generate ?? 15} Credits</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-400">
            Balance: <strong className="text-slate-200">{currentWorkspace.creditsRemaining}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Config & Generator Controls (5 Cols) */}
        <div className="lg:col-span-5 space-y-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          {/* Platform Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Target Platform</span>
              <span className="text-indigo-300 text-2xs font-normal">Native formatting active</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setPlatform('linkedin')}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                  platform === 'linkedin'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Linkedin className="w-4 h-4" />
                <span className="text-2xs">LinkedIn</span>
              </button>

              <button
                type="button"
                onClick={() => setPlatform('instagram')}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                  platform === 'instagram'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Instagram className="w-4 h-4" />
                <span className="text-2xs">Instagram</span>
              </button>

              <button
                type="button"
                onClick={() => setPlatform('tiktok')}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                  platform === 'tiktok'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Video className="w-4 h-4" />
                <span className="text-2xs">TikTok</span>
              </button>

              <button
                type="button"
                onClick={() => setPlatform('twitter')}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                  platform === 'twitter'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Twitter className="w-4 h-4" />
                <span className="text-2xs">X / Twitter</span>
              </button>

              <button
                type="button"
                onClick={() => setPlatform('facebook')}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                  platform === 'facebook'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Facebook className="w-4 h-4" />
                <span className="text-2xs">Facebook</span>
              </button>
            </div>
          </div>

          {/* Style Preset Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Visual & Tone Style Preset
            </label>
            <select
              aria-label="Visual & Tone Style Preset"
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              <option value="Tech Minimalist">Tech Minimalist — High contrast obsidian & cyan</option>
              <option value="Luxury Editorial">Luxury Editorial — Slate gray & gold serif aesthetics</option>
              <option value="Bold Cyberpunk">Bold Cyberpunk — Electric neon & high energy 9:16 framing</option>
              <option value="Corporate Modern">Corporate Modern — Clean navy & crisp white typographic balance</option>
              <option value="Vibrant Youth">Vibrant Youth — Pastel gradients & punchy conversational tone</option>
            </select>
          </div>

          {/* Prompt Input Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Campaign Brief / Topic</span>
              <span className="text-slate-400 text-2xs">Describe goal or topic</span>
            </label>
            <textarea
              aria-label="Campaign brief or topic"
              rows={4}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="e.g. Announce our new AI social media scheduling feature with emphasis on credit reservation security and multi-channel publishing..."
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl p-3.5 text-xs leading-relaxed focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>

          {/* Quick Starter Prompts */}
          <div className="space-y-2">
            <span className="text-2xs font-semibold text-slate-400">Quick Starters:</span>
            <div className="space-y-1.5">
              {samplePrompts.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPromptInput(sample)}
                  className="w-full text-left bg-slate-950 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700 p-2 rounded-lg text-2xs text-slate-300 transition-colors line-clamp-1"
                >
                  ⚡ {sample}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800/60 text-rose-300 text-xs rounded-xl flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all ${
              isGenerating
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 hover:scale-101'
            }`}
          >
            {isGenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Generating with {activeAi.text ? activeAi.text.label : 'sample engine'}…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>
                  Generate Campaign Asset (
                  {activeAi.text ? `${activeAi.costs?.generate ?? 15} Credits` : 'sample, free'})
                </span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Live Generation Output Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {generatedResult ? (
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
              {/* Header Info */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <span className="p-2 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white">{generatedResult.title}</h3>
                    <p className="text-2xs text-slate-400">
                      Platform: <strong className="text-slate-200 capitalize">{platform}</strong> • AI:{' '}
                      <strong className="text-slate-200">{generatedResult.aiEngine}</strong>
                    </p>
                    {generatedResult.sample && (
                      <p data-testid="sample-output-label" className="text-2xs font-semibold text-amber-300">
                        Demo sample output: no AI key is configured, so this text is a template and no credits were
                        charged.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsLocked(!isLocked)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center space-x-1.5 transition-colors ${
                      isLocked
                        ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    <span>{isLocked ? 'Asset Locked' : 'Unlocked'}</span>
                  </button>

                  <button
                    onClick={handleCopyCaption}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedText ? 'Copied!' : 'Copy Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Generated Social Copy */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Generated Post Caption
                </span>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-200 text-xs leading-relaxed whitespace-pre-line font-normal">
                  {generatedResult.caption}
                </div>
              </div>

              {/* Hashtags */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recommended Hashtags</span>
                <div className="flex flex-wrap gap-2">
                  {generatedResult.hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-2.5 py-1 rounded-lg"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Visual Art Direction & AI Image Prompt */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Image Prompt</span>
                  </div>
                  <p className="text-2xs text-slate-400 leading-relaxed italic">"{generatedResult.imagePrompt}"</p>
                  <div className="pt-2 space-y-2">
                    {image && (
                      <figure className="space-y-1">
                        <AuthImage
                          path={image.url}
                          alt={generatedResult.imagePrompt}
                          className="w-full rounded-lg aspect-square object-cover"
                        />
                        <figcaption className="text-2xs text-slate-400">Generated with {image.engine}</figcaption>
                      </figure>
                    )}
                    <button
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={imageBusy || !activeAi.image}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid="generate-image"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      {imageBusy
                        ? 'Generating image…'
                        : `${image ? 'Regenerate' : 'Generate'} image${activeAi.costs ? ` (${activeAi.costs.image} credits)` : ''}`}
                    </button>
                    {!activeAi.image && activeAi.loaded && (
                      <p className="text-2xs text-amber-300">
                        Image generation is off: no image provider (OpenAI, Gemini or xAI key) is configured. See
                        Settings &gt; AI Providers.
                      </p>
                    )}
                    {imageError && <p className="text-2xs text-rose-300">{imageError}</p>}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>Art Direction</span>
                  </div>
                  <p className="text-2xs text-slate-400 leading-relaxed">{generatedResult.visualDirection}</p>
                </div>
              </div>

              {/* Version Banner & Submit */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <History className="w-4 h-4 text-slate-400" />
                  <span>Version v1.0 • Ready for team review</span>
                </div>

                <button
                  onClick={handleSubmitToApproval}
                  className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit to Approval Queue →</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-12 text-center space-y-4 flex flex-col items-center justify-center min-h-[420px]">
              <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400">
                <Sparkles className="w-8 h-8 text-indigo-500/60 animate-pulse" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-base font-bold text-slate-200">Creative Generation Canvas</h3>
                <p className="text-xs text-slate-400">
                  Configure your brief on the left and click generate. This workspace uses {aiName(activeAi.text)};
                  change it in Settings &gt; AI Providers.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
