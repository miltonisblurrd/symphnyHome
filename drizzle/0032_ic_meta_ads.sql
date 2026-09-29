-- Meta Ads copilot tables for Inspired Closets OS.
-- Read-only against Meta. access_token_ciphertext is server-only.
-- Safe to re-run. Apply in the Supabase SQL editor.

create table if not exists ic_meta_workspaces (
  id uuid primary key default gen_random_uuid() not null,
  name text not null,
  slug text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create unique index if not exists ic_meta_workspaces_slug_uidx
  on ic_meta_workspaces (slug)
  where deleted_at is null;

create table if not exists ic_meta_workspace_members (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  staff_id uuid not null references ic_staff(id) on delete cascade,
  role text not null default 'member',
  created_at timestamp with time zone default now() not null,
  constraint ic_meta_workspace_members_role_chk check (role in ('owner', 'member'))
);

create unique index if not exists ic_meta_workspace_members_uidx
  on ic_meta_workspace_members (workspace_id, staff_id);

create table if not exists ic_meta_connections (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  meta_user_id text,
  status text not null default 'disconnected',
  scopes text,
  access_token_ciphertext text,
  token_expires_at timestamp with time zone,
  last_sync_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ic_meta_connections_status_chk
    check (status in ('disconnected', 'connected', 'expired', 'error'))
);

create index if not exists ic_meta_connections_workspace_idx
  on ic_meta_connections (workspace_id, status);

create table if not exists ic_meta_ad_accounts (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  connection_id uuid references ic_meta_connections(id) on delete set null,
  meta_account_id text not null,
  name text not null,
  currency text not null default 'USD',
  timezone text,
  status text,
  is_demo boolean not null default false,
  selected boolean not null default false,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create unique index if not exists ic_meta_ad_accounts_meta_uidx
  on ic_meta_ad_accounts (workspace_id, meta_account_id);

create index if not exists ic_meta_ad_accounts_selected_idx
  on ic_meta_ad_accounts (workspace_id, selected);

create table if not exists ic_meta_campaigns (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  meta_id text not null,
  name text not null,
  objective text,
  status text,
  effective_status text,
  daily_budget numeric(14, 2),
  lifetime_budget numeric(14, 2),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create unique index if not exists ic_meta_campaigns_meta_uidx
  on ic_meta_campaigns (ad_account_id, meta_id);

create table if not exists ic_meta_ad_sets (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  campaign_id uuid not null references ic_meta_campaigns(id) on delete cascade,
  meta_id text not null,
  name text not null,
  status text,
  effective_status text,
  daily_budget numeric(14, 2),
  lifetime_budget numeric(14, 2),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create unique index if not exists ic_meta_ad_sets_meta_uidx
  on ic_meta_ad_sets (ad_account_id, meta_id);

create index if not exists ic_meta_ad_sets_campaign_idx
  on ic_meta_ad_sets (campaign_id);

create table if not exists ic_meta_ads (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  campaign_id uuid not null references ic_meta_campaigns(id) on delete cascade,
  ad_set_id uuid not null references ic_meta_ad_sets(id) on delete cascade,
  meta_id text not null,
  name text not null,
  status text,
  effective_status text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create unique index if not exists ic_meta_ads_meta_uidx
  on ic_meta_ads (ad_account_id, meta_id);

create index if not exists ic_meta_ads_ad_set_idx
  on ic_meta_ads (ad_set_id);

create table if not exists ic_meta_performance_snapshots (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  date date not null,
  spend numeric(14, 2),
  impressions integer,
  reach integer,
  frequency numeric(10, 4),
  clicks integer,
  link_clicks integer,
  ctr numeric(12, 6),
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  conversions numeric(14, 4),
  conversion_value numeric(14, 2),
  cpl numeric(14, 4),
  cpa numeric(14, 4),
  roas numeric(14, 4),
  created_at timestamp with time zone default now() not null,
  constraint ic_meta_snapshots_entity_chk
    check (entity_type in ('ACCOUNT', 'CAMPAIGN', 'AD_SET', 'AD'))
);

create unique index if not exists ic_meta_snapshots_entity_date_uidx
  on ic_meta_performance_snapshots (ad_account_id, entity_type, entity_id, date);

create index if not exists ic_meta_snapshots_date_idx
  on ic_meta_performance_snapshots (ad_account_id, date desc);

create table if not exists ic_meta_client_goals (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  primary_objective text not null,
  target_cpl numeric(14, 2),
  target_cpa numeric(14, 2),
  target_roas numeric(14, 4),
  ideal_cpl numeric(14, 2),
  ideal_cpa numeric(14, 2),
  ideal_roas numeric(14, 4),
  monthly_budget numeric(14, 2),
  primary_conversion_event text,
  minimum_analysis_days integer not null default 7,
  minimum_conversion_count integer not null default 5,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ic_meta_goals_objective_chk
    check (primary_objective in (
      'LEADS', 'PURCHASES', 'REVENUE', 'APP_INSTALLS', 'AWARENESS', 'OTHER'
    ))
);

create unique index if not exists ic_meta_client_goals_account_uidx
  on ic_meta_client_goals (ad_account_id);

create table if not exists ic_meta_optimization_settings (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  analysis_aggressiveness text not null default 'BALANCED',
  minimum_spend_threshold numeric(14, 2) not null default 100,
  minimum_conversion_threshold integer not null default 5,
  minimum_analysis_period_days integer not null default 7,
  scaling_increment_min numeric(6, 2) not null default 10,
  scaling_increment_max numeric(6, 2) not null default 20,
  frequency_warning_threshold numeric(8, 2),
  ctr_decline_threshold numeric(8, 4),
  cpl_warning_threshold numeric(8, 4),
  cpa_warning_threshold numeric(8, 4),
  roas_warning_threshold numeric(8, 4),
  anomaly_sensitivity text not null default 'BALANCED',
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ic_meta_settings_style_chk
    check (analysis_aggressiveness in ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE')),
  constraint ic_meta_settings_anomaly_chk
    check (anomaly_sensitivity in ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'))
);

create unique index if not exists ic_meta_optimization_settings_account_uidx
  on ic_meta_optimization_settings (ad_account_id);

create table if not exists ic_meta_recommendations (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  severity text not null,
  category text not null,
  title text not null,
  observation text not null,
  recommendation text not null,
  reasoning text not null,
  confidence text not null,
  suggested_budget_change_percent numeric(6, 2),
  metrics_supporting jsonb not null default '[]'::jsonb,
  detected_signals jsonb not null default '[]'::jsonb,
  analysis_period jsonb not null,
  comparison_period jsonb,
  client_goals_snapshot jsonb,
  rule_id text,
  ai_output jsonb,
  ai_model text,
  dedupe_key text not null,
  status text not null default 'ACTIVE',
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ic_meta_recommendations_severity_chk
    check (severity in ('INFO', 'OPPORTUNITY', 'WARNING', 'CRITICAL')),
  constraint ic_meta_recommendations_confidence_chk
    check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  constraint ic_meta_recommendations_status_chk
    check (status in ('ACTIVE', 'ACCEPTED', 'REJECTED', 'IGNORED', 'EXPIRED', 'RESOLVED')),
  constraint ic_meta_recommendations_entity_chk
    check (entity_type in ('ACCOUNT', 'CAMPAIGN', 'AD_SET', 'AD'))
);

create unique index if not exists ic_meta_recommendations_active_dedupe_uidx
  on ic_meta_recommendations (ad_account_id, dedupe_key)
  where status = 'ACTIVE';

create index if not exists ic_meta_recommendations_status_idx
  on ic_meta_recommendations (ad_account_id, status, created_at desc);

create table if not exists ic_meta_recommendation_feedback (
  id uuid primary key default gen_random_uuid() not null,
  recommendation_id uuid not null references ic_meta_recommendations(id) on delete cascade,
  staff_id uuid references ic_staff(id) on delete set null,
  status text not null,
  user_notes text,
  performance_before jsonb,
  performance_after jsonb,
  created_at timestamp with time zone default now() not null,
  constraint ic_meta_feedback_status_chk
    check (status in ('ACCEPTED', 'REJECTED', 'IGNORED'))
);

create index if not exists ic_meta_feedback_recommendation_idx
  on ic_meta_recommendation_feedback (recommendation_id, created_at desc);

create table if not exists ic_meta_signals (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid not null references ic_meta_ad_accounts(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  code text not null,
  analysis_period jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists ic_meta_signals_active_idx
  on ic_meta_signals (ad_account_id, active, code);

create table if not exists ic_meta_sync_jobs (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid references ic_meta_ad_accounts(id) on delete set null,
  kind text not null,
  status text not null default 'queued',
  records_imported integer not null default 0,
  error text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint ic_meta_sync_jobs_status_chk
    check (status in ('queued', 'running', 'completed', 'failed', 'partial'))
);

create index if not exists ic_meta_sync_jobs_workspace_idx
  on ic_meta_sync_jobs (workspace_id, created_at desc);

create table if not exists ic_meta_ai_conversations (
  id uuid primary key default gen_random_uuid() not null,
  workspace_id uuid not null references ic_meta_workspaces(id) on delete cascade,
  ad_account_id uuid references ic_meta_ad_accounts(id) on delete set null,
  staff_id uuid references ic_staff(id) on delete set null,
  title text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists ic_meta_ai_messages (
  id uuid primary key default gen_random_uuid() not null,
  conversation_id uuid not null references ic_meta_ai_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  tool_trace jsonb,
  created_at timestamp with time zone default now() not null,
  constraint ic_meta_ai_messages_role_chk check (role in ('user', 'assistant', 'tool'))
);

create index if not exists ic_meta_ai_messages_conversation_idx
  on ic_meta_ai_messages (conversation_id, created_at);

-- Server key only. No public policies, so the browser key cannot read tokens or data.
alter table ic_meta_workspaces enable row level security;
alter table ic_meta_workspace_members enable row level security;
alter table ic_meta_connections enable row level security;
alter table ic_meta_ad_accounts enable row level security;
alter table ic_meta_campaigns enable row level security;
alter table ic_meta_ad_sets enable row level security;
alter table ic_meta_ads enable row level security;
alter table ic_meta_performance_snapshots enable row level security;
alter table ic_meta_client_goals enable row level security;
alter table ic_meta_optimization_settings enable row level security;
alter table ic_meta_recommendations enable row level security;
alter table ic_meta_recommendation_feedback enable row level security;
alter table ic_meta_signals enable row level security;
alter table ic_meta_sync_jobs enable row level security;
alter table ic_meta_ai_conversations enable row level security;
alter table ic_meta_ai_messages enable row level security;

insert into ic_meta_workspaces (name, slug)
select 'Inspired Closets', 'inspired-closets'
where not exists (
  select 1 from ic_meta_workspaces
  where slug = 'inspired-closets' and deleted_at is null
);
