import React, { useState, useEffect } from 'react';
import { SafeImg } from './ui/SafeImg';
import { Workspace, CampaignAsset, Platform } from '../types';
import {
  Sparkles,
  CheckCircle2,
  Edit3,
  Send,
  RefreshCw,
  ThumbsUp,
  HelpCircle,
  AlertCircle,
  Linkedin,
  Instagram,
  Twitter,
  Facebook,
  Video,
  Bot,
  Settings2,
  Check,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import { apiErrorMessage, apiJson } from '../lib/api';

export interface PostComment {
  id: string;
  assetId: string;
  postTitle: string;
  platform: Platform;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  commentText: string;
  createdAt: string;
  sentiment: 'positive' | 'question' | 'constructive' | 'neutral';
  status: 'pending' | 'replied' | 'dismissed';
  repliedText?: string;
  repliedAt?: string;
}

interface SmartEngagementProps {
  currentWorkspace: Workspace;
  assets: CampaignAsset[];
  onReplyAdded?: (assetId: string, commentId: string, replyText: string) => void;
}

export const SmartEngagement: React.FC<SmartEngagementProps> = ({ currentWorkspace, onReplyAdded }) => {
  // Mock Inbound User Comments on Published Posts
  const [comments, setComments] = useState<PostComment[]>([
    {
      id: 'cmt-101',
      assetId: 'asset-pub-1',
      postTitle: 'Autonomous AI Agents Keynote & Multi-Agent Orchestration',
      platform: 'linkedin',
      authorName: 'Sarah Jenkins',
      authorHandle: '@sarahj_tech',
      authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      commentText:
        'This multi-agent orchestration setup looks insane! Does this integrate with existing Webhooks or Slack alerts for real-time approvals?',
      createdAt: '12 minutes ago',
      sentiment: 'question',
      status: 'pending',
    },
    {
      id: 'cmt-102',
      assetId: 'asset-pub-2',
      postTitle: '3D WebGL Product Preview Teaser',
      platform: 'instagram',
      authorName: 'Marcus Vance',
      authorHandle: '@marcusv_design',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      commentText: 'The lighting model on that 3D canvas is super crisp! Amazing visual work team 🔥',
      createdAt: '45 minutes ago',
      sentiment: 'positive',
      status: 'pending',
    },
    {
      id: 'cmt-103',
      assetId: 'asset-pub-3',
      postTitle: 'B2B Video Shorts Strategy Case Study',
      platform: 'tiktok',
      authorName: 'Elena Rostova',
      authorHandle: '@elena_marketing',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      commentText: 'Would love to see the specific conversion metrics from your TikTok campaign vs LinkedIn page!',
      createdAt: '2 hours ago',
      sentiment: 'question',
      status: 'pending',
    },
    {
      id: 'cmt-104',
      assetId: 'asset-pub-4',
      postTitle: 'Enterprise Brand Guidelines & AI Governance',
      platform: 'twitter',
      authorName: 'David K. Miller',
      authorHandle: '@davekmiller',
      authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      commentText:
        'Great writeup on AI governance. Curious how you handle human-in-the-loop overrides for legal holds.',
      createdAt: '3 hours ago',
      sentiment: 'constructive',
      status: 'pending',
    },
  ]);

  const [selectedCommentId, setSelectedCommentId] = useState<string>('cmt-101');
  const [selectedBrandTone, setSelectedBrandTone] = useState<string>('Professional & Helpful');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // AI Suggestions State
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySource, setReplySource] = useState<string>('');
  const [selectedReplyIndex, setSelectedReplyIndex] = useState<number>(0);
  const [customEditingText, setCustomEditingText] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Auto-Pilot Toggle
  const [autoPilotEnabled, setAutoPilotEnabled] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const selectedComment = comments.find((c) => c.id === selectedCommentId) || comments[0];

  // Fetch or generate AI Suggested Replies whenever selected comment or tone changes
  const handleGenerateReplies = async (comment: PostComment, tone: string) => {
    setIsGenerating(true);
    setIsEditing(false);
    setReplyError(null);
    const r = await apiJson<{ suggestedReplies?: string[]; source?: string }>('/api/engagement/suggest-reply', {
      headers: { 'x-workspace-id': currentWorkspace.id },
      json: {
        commentText: comment.commentText,
        postCaption: comment.postTitle,
        platform: comment.platform,
        brandTone: tone,
      },
    });
    setIsGenerating(false);
    if (r.ok && Array.isArray(r.data.suggestedReplies) && r.data.suggestedReplies.length > 0) {
      setSuggestedReplies(r.data.suggestedReplies);
      setReplySource(r.data.source || '');
      setSelectedReplyIndex(0);
      setCustomEditingText(r.data.suggestedReplies[0]);
    } else {
      // No canned replies on failure: show the error instead.
      setSuggestedReplies([]);
      setCustomEditingText('');
      setReplyError(apiErrorMessage(r, 'Could not generate suggested replies.'));
    }
  };

  useEffect(() => {
    if (selectedComment) {
      handleGenerateReplies(selectedComment, selectedBrandTone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- regenerate only when the comment or tone changes
  }, [selectedCommentId, selectedBrandTone]);

  // Handle Select Variation
  const handleSelectReplyOption = (idx: number) => {
    setSelectedReplyIndex(idx);
    setCustomEditingText(suggestedReplies[idx] || '');
  };

  // Handle Approve & Dispatch
  const handleApproveAndSend = () => {
    const textToSend = isEditing ? customEditingText : suggestedReplies[selectedReplyIndex] || customEditingText;

    if (!textToSend.trim()) return;

    setComments((prev) =>
      prev.map((c) =>
        c.id === selectedCommentId
          ? {
              ...c,
              status: 'replied',
              repliedText: textToSend,
              repliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : c,
      ),
    );

    if (onReplyAdded && selectedComment) {
      onReplyAdded(selectedComment.assetId, selectedComment.id, textToSend);
    }

    setNotification(`Auto-reply successfully dispatched to ${selectedComment.authorName}'s comment!`);
    setTimeout(() => setNotification(null), 3500);

    // Auto-advance to next pending comment
    const nextPending = comments.find((c) => c.status === 'pending' && c.id !== selectedCommentId);
    if (nextPending) {
      setSelectedCommentId(nextPending.id);
    }
  };

  // Helper: Platform Icon
  const renderPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case 'linkedin':
        return <Linkedin className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />;
      case 'instagram':
        return <Instagram className="w-3.5 h-3.5 text-pink-700 dark:text-pink-400" />;
      case 'tiktok':
        return <Video className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />;
      case 'twitter':
        return <Twitter className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />;
      case 'facebook':
        return <Facebook className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />;
      default:
        return <MessageCircle className="w-3.5 h-3.5 text-ink-subtle" />;
    }
  };

  // Helper: Sentiment Badge
  const renderSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return (
          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
            <ThumbsUp className="w-2.5 h-2.5 mr-1" /> Praise & Positive
          </span>
        );
      case 'question':
        return (
          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center space-x-1">
            <HelpCircle className="w-2.5 h-2.5 mr-1" /> Product Question
          </span>
        );
      case 'constructive':
        return (
          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center space-x-1">
            <AlertCircle className="w-2.5 h-2.5 mr-1" /> Constructive Feedback
          </span>
        );
      default:
        return (
          <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-surface text-ink-muted border border-line">
            Neutral
          </span>
        );
    }
  };

  const pendingCount = comments.filter((c) => c.status === 'pending').length;
  const repliedCount = comments.filter((c) => c.status === 'replied').length;

  return (
    <div className="bg-surface border border-line rounded-3xl p-6 space-y-6 shadow-2xl relative overflow-hidden">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line/80 pb-5">
        <div className="flex items-center space-x-3.5">
          <span className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-xl shadow-indigo-600/20">
            <Bot className="w-6 h-6" />
          </span>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-ink tracking-tight">Smart Engagement Assistant</h2>
              <span className="text-2xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                Human-in-the-Loop Auto-Replies
              </span>
            </div>
            <p className="text-ink-subtle text-xs mt-0.5">
              Review and approve AI-generated response suggestions for incoming social media comments across active
              channels.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          {/* Auto-Pilot Mode Switcher */}
          <button
            onClick={() => {
              setAutoPilotEnabled(!autoPilotEnabled);
              setNotification(
                !autoPilotEnabled
                  ? 'Auto-Pilot Mode ON: Simple compliments will receive automated AI replies.'
                  : 'Auto-Pilot Mode OFF: Manual approval required for all comments.',
              );
              setTimeout(() => setNotification(null), 3500);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center space-x-2 ${
              autoPilotEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-lg shadow-emerald-900/30'
                : 'bg-canvas border-line text-ink-subtle hover:text-ink'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Auto-Pilot Mode: {autoPilotEnabled ? 'ACTIVE' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/90 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 rounded-2xl text-xs flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
            <span className="font-bold">{notification}</span>
          </div>
          <span className="text-2xs font-mono text-indigo-700 dark:text-indigo-300">Live Feedback</span>
        </div>
      )}

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="bg-canvas border border-line/80 p-3.5 rounded-2xl space-y-1">
          <span className="text-2xs font-bold text-ink-subtle uppercase tracking-wider">Pending Inbox</span>
          <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 font-mono">
            {pendingCount} <span className="text-xs font-normal text-ink-subtle">comments</span>
          </p>
        </div>

        <div className="bg-canvas border border-line/80 p-3.5 rounded-2xl space-y-1">
          <span className="text-2xs font-bold text-ink-subtle uppercase tracking-wider">Approved Replies</span>
          <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
            {repliedCount} <span className="text-xs font-normal text-ink-subtle">sent</span>
          </p>
        </div>

        <div className="bg-canvas border border-line/80 p-3.5 rounded-2xl space-y-1">
          <span className="text-2xs font-bold text-ink-subtle uppercase tracking-wider">Avg AI Response Speed</span>
          <p className="text-xl font-extrabold text-purple-700 dark:text-purple-400 font-mono">&lt; 1.8 seconds</p>
        </div>

        <div className="bg-canvas border border-line/80 p-3.5 rounded-2xl space-y-1">
          <span className="text-2xs font-bold text-ink-subtle uppercase tracking-wider">Community Time Saved</span>
          <p className="text-xl font-extrabold text-sky-700 dark:text-sky-400 font-mono">18.4 hrs / week</p>
        </div>
      </div>

      {/* Main Grid: Left = Comments Feed | Right = AI Suggestion Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Comments List (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-ink-subtle font-bold px-1">
            <span>Inbound User Comments</span>
            <span>{comments.length} items</span>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Inbound comments"
            className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1"
          >
            {comments.length === 0 && (
              <p className="rounded-xl bg-canvas p-4 text-sm text-ink-muted">
                No comments yet. Comments on published posts appear here so you can draft replies.
              </p>
            )}
            {comments.map((cmt) => {
              const isSelected = cmt.id === selectedCommentId;
              const isReplied = cmt.status === 'replied';

              return (
                <div
                  key={cmt.id}
                  onClick={() => setSelectedCommentId(cmt.id)}
                  className={`p-4 rounded-2xl border transition-all space-y-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-canvas border-purple-500/80 shadow-lg shadow-purple-950/20 ring-1 ring-purple-500/40'
                      : isReplied
                        ? 'bg-canvas border-line/60 opacity-70'
                        : 'bg-canvas border-line hover:border-line-strong'
                  }`}
                >
                  {/* Top Bar: Author + Platform */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <SafeImg
                        src={cmt.authorAvatar}
                        alt={cmt.authorName}
                        className="w-7 h-7 rounded-full object-cover ring-2 ring-line"
                      />
                      <div>
                        <h3 className="text-xs font-extrabold text-ink leading-none">{cmt.authorName}</h3>
                        <span className="text-2xs text-ink-subtle font-mono">{cmt.authorHandle}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {renderPlatformIcon(cmt.platform)}
                      <span className="text-2xs text-ink-subtle">{cmt.createdAt}</span>
                    </div>
                  </div>

                  {/* Post Context Title */}
                  <div className="text-2xs text-ink-subtle truncate bg-surface px-2.5 py-1 rounded-lg border border-line">
                    On post: <strong className="text-ink">{cmt.postTitle}</strong>
                  </div>

                  {/* Comment Text */}
                  <p className="text-xs text-ink leading-relaxed font-medium line-clamp-2">"{cmt.commentText}"</p>

                  {/* Footer Badge */}
                  <div className="flex items-center justify-between pt-1 border-t border-line/60 text-2xs">
                    {renderSentimentBadge(cmt.sentiment)}

                    {isReplied ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Replied</span>
                      </span>
                    ) : (
                      <span className="text-purple-700 dark:text-purple-400 font-bold">
                        Review AI Suggestion &rarr;
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: AI Suggestion & Editing Canvas (7 Cols) */}
        <div className="lg:col-span-7 bg-canvas border border-line rounded-2xl p-5 space-y-5 flex flex-col justify-between">
          {selectedComment ? (
            <div className="space-y-5">
              {/* Active Comment Detail Header */}
              <div className="bg-surface border border-line p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <SafeImg
                      src={selectedComment.authorAvatar}
                      alt={selectedComment.authorName}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-purple-500/50"
                    />
                    <div>
                      <h3 className="text-sm font-extrabold text-ink">{selectedComment.authorName}</h3>
                      <span className="text-xs text-ink-subtle font-mono">{selectedComment.authorHandle}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {renderPlatformIcon(selectedComment.platform)}
                    {renderSentimentBadge(selectedComment.sentiment)}
                  </div>
                </div>

                <div className="p-3 bg-canvas rounded-xl border border-line text-xs text-ink italic">
                  "{selectedComment.commentText}"
                </div>
              </div>

              {/* Brand Tone Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-ink-subtle font-bold flex items-center space-x-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                  <span>Target Brand Tone:</span>
                </span>

                <div className="flex flex-wrap gap-1.5">
                  {['Professional & Helpful', 'Friendly & Enthusiastic', 'Witty & Modern', 'Tech Expert & Direct'].map(
                    (tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedBrandTone(tone)}
                        className={`px-3 py-1 rounded-lg font-bold text-2xs transition-all ${
                          selectedBrandTone === tone
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                            : 'bg-surface text-ink-subtle hover:text-ink border border-line'
                        }`}
                      >
                        {tone}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* AI Suggested Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-ink flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-purple-700 dark:text-purple-400" />
                    <span>AI Generated Auto-Reply Suggestions</span>
                  </span>

                  <button
                    onClick={() => handleGenerateReplies(selectedComment, selectedBrandTone)}
                    disabled={isGenerating}
                    className="text-xs font-bold text-purple-700 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center space-x-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </button>
                </div>

                {isGenerating ? (
                  <div className="p-8 text-center bg-surface rounded-2xl border border-line space-y-2">
                    <RefreshCw className="w-6 h-6 text-purple-700 dark:text-purple-400 animate-spin mx-auto" />
                    <p className="text-xs text-ink-subtle font-medium">
                      Crafting tailored auto-replies matching brand tone...
                    </p>
                  </div>
                ) : replyError ? (
                  <div
                    data-testid="reply-error"
                    className="p-4 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-xs text-rose-800 dark:text-rose-200"
                  >
                    {replyError}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {replySource.startsWith('Demo') && (
                      <p className="text-2xs font-semibold text-amber-700 dark:text-amber-300">
                        {replySource}: template replies, not AI-generated.
                      </p>
                    )}
                    {suggestedReplies.map((replyText, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectReplyOption(idx)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                          selectedReplyIndex === idx && !isEditing
                            ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-ink shadow-md ring-1 ring-purple-500/50'
                            : 'bg-surface border-line text-ink-muted hover:border-line-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between text-2xs text-ink-subtle font-bold">
                          <span>Option {idx + 1}</span>
                          {selectedReplyIndex === idx && !isEditing && (
                            <span className="text-purple-700 dark:text-purple-400 flex items-center space-x-1">
                              <Check className="w-3 h-3" />
                              <span>Selected</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed font-medium">{replyText}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Editable Textarea if user chooses to edit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-ink-muted flex items-center space-x-1">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
                    <span>Response Editor Preview</span>
                  </span>

                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs text-indigo-700 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold"
                  >
                    {isEditing ? 'Use Preset Variation' : 'Edit Text Directly'}
                  </button>
                </div>

                {isEditing ? (
                  <textarea
                    rows={4}
                    value={customEditingText}
                    onChange={(e) => setCustomEditingText(e.target.value)}
                    className="w-full bg-surface border border-purple-500/80 rounded-2xl p-3.5 text-xs text-ink outline-none focus:ring-2 focus:ring-purple-500 resize-none font-medium leading-relaxed"
                  />
                ) : (
                  <div className="p-3.5 bg-surface border border-line rounded-2xl text-xs text-ink font-medium leading-relaxed">
                    {customEditingText}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-ink-subtle text-xs">
              Select a user comment from the inbox to review AI suggestions.
            </div>
          )}

          {/* Action Footer */}
          {selectedComment && selectedComment.status !== 'replied' && (
            <div className="pt-4 border-t border-line flex items-center justify-between gap-3">
              <span className="text-2xs text-ink-subtle font-medium">
                Will post as <strong className="text-ink-muted">Acme Community Bot</strong>
              </span>

              <button
                onClick={handleApproveAndSend}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-extrabold px-6 py-3 rounded-xl text-xs flex items-center space-x-2 shadow-xl shadow-purple-600/30 transition-all"
              >
                <Send className="w-4 h-4" />
                <span>APPROVE & DISPATCH AUTO-REPLY</span>
              </button>
            </div>
          )}

          {selectedComment && selectedComment.status === 'replied' && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>
                Response dispatched on {selectedComment.platform.toUpperCase()} at {selectedComment.repliedAt}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
