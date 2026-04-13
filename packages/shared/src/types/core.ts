// ── Core enums ──────────────────────────────────────────────

import type {
  SecurityFinding,
  SecurityPermissionsSummary,
  SecurityScanStatus,
} from "./security.js";

export type ComponentType =
  | "skill"
  | "plugin"
  | "agent"
  | "hook"
  | "script"
  | "knowledge"
  | "rules";

export type TrustTier = "official" | "verified" | "community";

// ── Core entities ───────────────────────────────────────────

export interface Author {
  name: string;
  url?: string;
}

export interface Component {
  id: string;
  slug: string;
  name: string;
  type: ComponentType;
  description: string;
  trust_tier: TrustTier;
  version: string;
  author: Author;
  license: string;
  skill_md: string | null;
  readme_md: string | null;
  repo_url: string | null;
  install_count: number;
  average_rating?: number;
  review_count?: number;
  created_at: string;
  updated_at: string;
  security_scan_status?: SecurityScanStatus;
  security_scan_date?: string | null;
  security_findings?: SecurityFinding[];
  security_permissions?: SecurityPermissionsSummary;
}

export interface Profile {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: Author;
  trust_tier: TrustTier;
  harness_yaml_template: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

export interface Tag {
  id: string;
  slug: string;
}

// ── Organization entities ───────────────────────────────────

export type OrgRole = "admin" | "member";

export interface Organization {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface OrgComponent {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  type: ComponentType;
  description: string;
  version: string;
  author: Author;
  license: string;
  skill_md: string | null;
  readme_md: string | null;
  repo_url: string | null;
  install_count: number;
  created_at: string;
  updated_at: string;
}

export type OrgPluginApprovalStatus = "approved" | "denied" | "pending";

export interface OrgPluginApproval {
  id: string;
  org_id: string;
  component_id: string;
  status: OrgPluginApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Join tables ─────────────────────────────────────────────

export interface ComponentCategory {
  component_id: string;
  category_id: string;
}

export interface ComponentTag {
  component_id: string;
  tag_id: string;
}

export interface ProfileComponent {
  profile_id: string;
  component_id: string;
  pinned_version: string;
}

export interface ProfileCategory {
  profile_id: string;
  category_id: string;
}

export interface ProfileTag {
  profile_id: string;
  tag_id: string;
}

export interface OrgComponentCategory {
  org_component_id: string;
  category_id: string;
}

export interface OrgComponentTag {
  org_component_id: string;
  tag_id: string;
}
