// Clearly labelled sample data returned when no GEMINI_API_KEY is configured.
export const sampleTrends = (category: string) => [
  {
    id: 'trend-1',
    topic: 'Autonomous AI Agents in Enterprise Workflows',
    hotnessScore: 98,
    category,
    summary:
      'Breakthroughs in multi-agent orchestration are driving viral discussions across LinkedIn and Twitter, as teams replace manual workflows with agentic AI pipelines.',
    suggestedHashtags: ['#AgenticAI', '#Automation', '#EnterpriseAI', '#FutureOfWork', '#AIStudio'],
    suggestedHook:
      'Why manual cross-platform posting is dead: How autonomous AI workflows are saving enterprise teams 20+ hours a week.',
    suggestedPlatform: 'linkedin',
    searchQueries: ['AI agent workflows 2026', 'enterprise automation trends'],
  },
  {
    id: 'trend-2',
    topic: 'Real-time 3D Asset Previews in Social Marketing',
    hotnessScore: 94,
    category,
    summary:
      'Brands leveraging interactive WebGL & 3D canvas teasers are seeing a 3.4x spike in click-through rates compared to static banner images.',
    suggestedHashtags: ['#3DMarketing', '#WebGL', '#InteractiveAds', '#VisualDesign', '#DigitalStrategy'],
    suggestedHook:
      'Static graphics are losing engagement. Here is how interactive 3D product renders doubled our visual conversions.',
    suggestedPlatform: 'instagram',
    searchQueries: ['3D graphics in social media ads', 'WebGL marketing ROI'],
  },
  {
    id: 'trend-3',
    topic: 'Hyper-Personalized B2B Video Shorts',
    hotnessScore: 89,
    category,
    summary:
      'Short-form vertical videos with AI synthetic avatars discussing niche industry data are dominating TikTok and LinkedIn video feeds.',
    suggestedHashtags: ['#B2BShorts', '#AIAvatar', '#VideoMarketing', '#ShortsGrowth', '#ContentCreator'],
    suggestedHook: '3 lessons learned from producing 50 vertical AI influencer videos in 30 days.',
    suggestedPlatform: 'tiktok',
    searchQueries: ['B2B video marketing trends 2026', 'AI avatar engagement rates'],
  },
];

export const sampleReplies = [
  "Thanks so much for sharing! We're thrilled you're finding this helpful. Let us know if you'd like a deep dive!",
  'Spot on point! Appreciate you jumping into the conversation. How is your team approaching this?',
  "Great question! We're continually updating our feature roadmap based on feedback like this. Stay tuned for next week's update!",
];
