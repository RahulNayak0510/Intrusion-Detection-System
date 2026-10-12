export type Severity = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface UserInfo {
  id: number;
  username: string;
  display_name?: string | null;
  is_active: boolean;
}

export interface EventSummary {
  id: number;
  dedup_key: string;
  event_type: string;
  timestamp: string;
  src_ip?: string | null;
  dst_ip?: string | null;
  src_port?: number | null;
  dst_port?: number | null;
  protocol?: string | null;
  app_proto?: string | null;
  flow_id?: number | null;
  signature?: string | null;
  signature_category?: string | null;
  severity?: Severity | null;
  anomaly_score?: number | null;
  acknowledged: boolean;
}

export interface AnalystNote {
  id: number;
  event_id: number;
  author_id: number;
  author_username?: string | null;
  note: string;
  created_at: string;
}

export interface EventDetail extends EventSummary {
  ingestion_time: string;
  raw: Record<string, unknown>;
  anomaly_features?: Record<string, unknown> | null;
  allowlisted: boolean;
  asset_labels: string[];
  notes: AnalystNote[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AlertCountPoint {
  bucket: string;
  count: number;
  severity_high: number;
  severity_medium: number;
  severity_low: number;
}

export interface SeverityCount {
  severity: string;
  count: number;
}

export interface IPStat {
  ip: string;
  count: number;
}

export interface EventTypeCount {
  event_type: string;
  count: number;
}

export interface DashboardSummary {
  alert_counts_over_time: AlertCountPoint[];
  severity_counts: SeverityCount[];
  event_type_counts: EventTypeCount[];
  top_source_ips: IPStat[];
  top_destination_ips: IPStat[];
  recent_events: EventSummary[];
  last_24h: {
    total_alerts: number;
    high: number;
    medium: number;
    low: number;
    acknowledged: number;
    flows_scored: number;
  };
}

export interface ReplayResult {
  path: string;
  read: number;
  parsed: number;
  normalized: number;
  inserted: number;
  duplicate: number;
  malformed: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_minutes: number;
}

export interface EventFilters {
  since?: string;
  until?: string;
  severity?: string[];
  event_type?: string[];
  src_ip?: string;
  dst_ip?: string;
  proto?: string;
  acknowledged?: boolean | "";
  search?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}
