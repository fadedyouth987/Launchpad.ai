import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  BarChart3,
  Calendar,
  CheckCircle2,
  CreditCard,
  Globe,
  Home,
  MessageSquare,
  Palette,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Workflow,
} from 'lucide-react';

export type TabId =
  | 'overview'
  | 'studio'
  | 'influencers'
  | 'brand_library'
  | 'campaign_os'
  | 'approvals'
  | 'scheduler'
  | 'publisher'
  | 'engagement'
  | 'analytics'
  | 'billing'
  | 'presence'
  | 'webhooks'
  | 'audit_inspector'
  | 'ai_settings';

/** What a page needs from the backend; used to show a "not connected" notice instead of failing silently. */
export type Requirement = 'ai' | 'payments' | 'channels';

export interface PageAction {
  label: string;
  /** Navigate to another page… */
  to?: TabId;
  /** …or run a dashboard command. */
  command?: 'topUp' | 'plans';
}

export interface NavItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
  /** One line under the page title. */
  description: string;
  /** Shown once to first-time visitors of the page, until dismissed. */
  hint?: string;
  primaryAction?: PageAction;
  secondaryAction?: PageAction;
  requires?: Requirement[];
  badge?: string;
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'start',
    title: 'Start',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: Home,
        description: 'Your workspace at a glance: next steps, recent work and what is connected.',
        primaryAction: { label: 'Create an asset', to: 'studio' },
        secondaryAction: { label: 'Check system status', to: 'audit_inspector' },
      },
    ],
  },
  {
    id: 'create',
    title: 'Create',
    items: [
      {
        id: 'studio',
        label: 'AI Asset Studio',
        icon: Sparkles,
        description: 'Write a brief and generate on-brand copy, hashtags and visual directions.',
        hint: 'Fill in the brief, pick channels and press "Generate Campaign Asset". Then submit the result to the Approvals Queue.',
        primaryAction: { label: 'Go to Approvals Queue', to: 'approvals' },
        requires: ['ai'],
      },
      {
        id: 'influencers',
        label: 'AI Influencer Studio',
        icon: UserCheck,
        description: 'Design consistent AI personas, their voice, and preview 3D campaign assets.',
        hint: 'Use the tabs below the title to move between Identity, Voice, 3D campaigns and your saved Roster.',
        primaryAction: { label: 'Schedule a post', to: 'scheduler' },
      },
      {
        id: 'brand_library',
        label: 'Brand Kit & Rules',
        icon: Palette,
        description: 'Colours, fonts, logos and voice rules that generated assets should follow.',
        primaryAction: { label: 'Create an asset', to: 'studio' },
      },
    ],
  },
  {
    id: 'campaigns',
    title: 'Campaigns',
    items: [
      {
        id: 'campaign_os',
        label: 'Campaign OS',
        icon: Workflow,
        description: 'Plan a campaign as editable steps, assign owners and track progress.',
        hint: 'Changes save automatically to this workspace. The save status is shown under the title.',
        badge: 'New',
      },
      {
        id: 'approvals',
        label: 'Approvals Queue',
        icon: CheckCircle2,
        description: 'Review, comment on and approve assets before they are scheduled.',
        hint: 'Open an asset to read comments and approve or request changes. Approved assets appear in the Scheduler.',
        primaryAction: { label: 'Open Social Scheduler', to: 'scheduler' },
      },
    ],
  },
  {
    id: 'publish',
    title: 'Publish',
    items: [
      {
        id: 'scheduler',
        label: 'Social Scheduler',
        icon: Calendar,
        description: 'Drag posts onto the calendar, or add a post to any day with the + button.',
        hint: 'Drag a post to another day to reschedule it. Use the filters above the calendar to focus on one channel.',
        primaryAction: { label: 'Open Social Publisher', to: 'publisher' },
      },
      {
        id: 'publisher',
        label: 'Social Publisher',
        icon: Globe,
        description: 'Publish approved assets to each channel.',
        requires: ['channels'],
        primaryAction: { label: 'Open Social Scheduler', to: 'scheduler' },
      },
      {
        id: 'engagement',
        label: 'Smart Engagement',
        icon: MessageSquare,
        description: 'Read comments on published posts and draft replies with AI.',
        requires: ['ai'],
      },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    items: [
      {
        id: 'analytics',
        label: 'Campaign Analytics',
        icon: BarChart3,
        description: 'Reach, engagement and conversion trends for your campaigns.',
      },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace & Billing',
    items: [
      {
        id: 'billing',
        label: 'Ledger & Billing',
        icon: CreditCard,
        description: 'Your credit balance, usage trend and every ledger transaction.',
        primaryAction: { label: 'Top up credits', command: 'topUp' },
        secondaryAction: { label: 'Compare plans', command: 'plans' },
        requires: ['payments'],
      },
      {
        id: 'presence',
        label: 'Team Presence',
        icon: Users,
        description: 'Who is in this workspace and what each person is allowed to do.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    items: [
      {
        id: 'ai_settings',
        label: 'AI Providers',
        icon: Bot,
        description:
          'Pick the AI provider and model (Claude, GPT, Gemini, Grok, Neon AI Gateway or your own endpoint) and see which ones are connected.',
        hint: 'Every provider is listed with the exact env var it needs. Owners and admins can pick one and save a workspace key.',
      },
      {
        id: 'webhooks',
        label: 'Security & Webhooks',
        icon: ShieldCheck,
        description: 'Webhook receivers, the audit log, data export and data erasure.',
      },
      {
        id: 'audit_inspector',
        label: 'System Status',
        icon: Activity,
        description: 'Which services are connected and responding right now.',
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function findNavItem(id: string): { item: NavItem; section: NavSection } {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => i.id === id);
    if (item) return { item, section };
  }
  return { item: NAV_SECTIONS[0].items[0], section: NAV_SECTIONS[0] };
}

export function isTabId(id: string): id is TabId {
  return NAV_ITEMS.some((i) => i.id === id);
}
