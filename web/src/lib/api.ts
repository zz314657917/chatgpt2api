import { httpRequest } from "@/lib/request";
import type { LoginPageImageMode } from "@/lib/login-page-image-layout";
export {
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  isImageOutputFormat,
  isImageQuality,
  supportsImageOutputCompression,
  type ImageOutputFormat,
  type ImageQuality,
} from "@/lib/image-parameters";
import { normalizePixelIconSizeAlias } from "@/lib/image-parameters";
import type { ImageOutputFormat, ImageQuality } from "@/lib/image-parameters";

export type AccountType = "Free" | "Plus" | "ProLite" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用" | "刷新中" | "过期待刷新";
export const IMAGE_MODEL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "gpt-image-2", label: "gpt-image-2" },
  { value: "gpt-image-2-official", label: "gpt-image-2-official" },
  { value: "gpt-5-mini", label: "gpt-5-mini" },
  { value: "gpt-5-3-mini", label: "gpt-5-3-mini" },
  { value: "gpt-5", label: "gpt-5" },
  { value: "gpt-5-1", label: "gpt-5-1" },
  { value: "gpt-5-2", label: "gpt-5-2" },
  { value: "gpt-5-3", label: "gpt-5-3" },
  { value: "gpt-5.4", label: "gpt-5.4" },
  { value: "gpt-5.5", label: "gpt-5.5" },
] as const;
export type ImageModel = string;
export const DEFAULT_IMAGE_MODEL: ImageModel = "gpt-image-2";
export const DEFAULT_CHAT_MODEL: ImageModel = "auto";
export const CODEX_IMAGE_MODEL: ImageModel = "codex-gpt-image-2";
export const OFFICIAL_IMAGE_MODEL: ImageModel = "gpt-image-2-official";
const IMAGE_MODEL_VALUES = new Set<string>(IMAGE_MODEL_OPTIONS.map((option) => option.value));
const IMAGE_TASK_MODEL_VALUES = new Set<string>(["gpt-image-2", "gpt-image-2-official"]);
const CHAT_MODEL_VALUES = new Set<string>([
  "auto",
  "gpt-5-mini",
  "gpt-5-3-mini",
  "gpt-5",
  "gpt-5-1",
  "gpt-5-2",
  "gpt-5-3",
  "gpt-5.4",
  "gpt-5.5",
]);
export const IMAGE_TASK_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) => IMAGE_TASK_MODEL_VALUES.has(option.value));
export const IMAGE_CREATION_MODEL_OPTIONS = IMAGE_TASK_MODEL_OPTIONS;
export const CHAT_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) => CHAT_MODEL_VALUES.has(option.value));
const IMAGE_PRICE_ESTIMATE_MULTIPLIER = 1.2;
const IMAGE_PRICE_ESTIMATE_USD_CNY_RATE = 7;
const IMAGE_BILLING_UNIT_SCALE = 1000;
const GPT_IMAGE_2_BASE_PRICE_USD = {
  default: 0.006,
  "1K": 0.006,
  "2K": 0.012,
  "4K": 0.018,
} as const;

const GPT_IMAGE_2_OFFICIAL_BASE_PRICE_USD: Record<string, number> = {
  default: 0.16872,
  "1024x1024@auto": 0.00488,
  "1024x1024@high": 0.16872,
  "1024x1024@low": 0.00488,
  "1024x1024@medium": 0.04232,
  "1024x1280@auto": 0.00432,
  "1024x1280@high": 0.14696,
  "1024x1280@low": 0.00432,
  "1024x1280@medium": 0.0364,
  "1024x1536@auto": 0.00392,
  "1024x1536@high": 0.13184,
  "1024x1536@low": 0.00392,
  "1024x1536@medium": 0.03304,
  "1024x2048@auto": 0.00328,
  "1024x2048@high": 0.11344,
  "1024x2048@low": 0.00328,
  "1024x2048@medium": 0.02848,
  "1024x3072@auto": 0.00256,
  "1024x3072@high": 0.09496,
  "1024x3072@low": 0.00256,
  "1024x3072@medium": 0.02384,
  "1024x768@auto": 0.00336,
  "1024x768@high": 0.11568,
  "1024x768@low": 0.00336,
  "1024x768@medium": 0.02904,
  "1152x2048@auto": 0.00392,
  "1152x2048@high": 0.13576,
  "1152x2048@low": 0.00392,
  "1152x2048@medium": 0.03408,
  "1152x2688@auto": 0.0036,
  "1152x2688@high": 0.12056,
  "1152x2688@low": 0.0036,
  "1152x2688@medium": 0.03096,
  "1280x1024@auto": 0.00432,
  "1280x1024@high": 0.14696,
  "1280x1024@low": 0.00432,
  "1280x1024@medium": 0.0364,
  "1280x3840@auto": 0.00344,
  "1280x3840@high": 0.1276,
  "1280x3840@low": 0.00344,
  "1280x3840@medium": 0.032,
  "1344x2688@auto": 0.00448,
  "1344x2688@high": 0.15536,
  "1344x2688@low": 0.00448,
  "1344x2688@medium": 0.03896,
  "1360x2048@auto": 0.0052,
  "1360x2048@high": 0.17656,
  "1360x2048@low": 0.0052,
  "1360x2048@medium": 0.04424,
  "1536x1024@auto": 0.00392,
  "1536x1024@high": 0.13184,
  "1536x1024@low": 0.00392,
  "1536x1024@medium": 0.03304,
  "1536x2048@auto": 0.00608,
  "1536x2048@high": 0.21352,
  "1536x2048@low": 0.00608,
  "1536x2048@medium": 0.05352,
  "1536x512@auto": 0.01296,
  "1536x512@high": 0.05144,
  "1536x512@low": 0.00144,
  "1536x512@medium": 0.01296,
  "1536x864@auto": 0.00304,
  "1536x864@high": 0.1036,
  "1536x864@low": 0.00304,
  "1536x864@medium": 0.026,
  "1648x3840@auto": 0.00576,
  "1648x3840@high": 0.19688,
  "1648x3840@low": 0.00576,
  "1648x3840@medium": 0.05048,
  "1920x3840@auto": 0.00736,
  "1920x3840@high": 0.25928,
  "1920x3840@low": 0.00736,
  "1920x3840@medium": 0.06496,
  "2016x864@auto": 0.00264,
  "2016x864@high": 0.08848,
  "2016x864@low": 0.00264,
  "2016x864@medium": 0.0228,
  "2048x1024@auto": 0.00328,
  "2048x1024@high": 0.11344,
  "2048x1024@low": 0.00328,
  "2048x1024@medium": 0.02848,
  "2048x1152@auto": 0.00392,
  "2048x1152@high": 0.13576,
  "2048x1152@low": 0.00392,
  "2048x1152@medium": 0.03408,
  "2048x1360@auto": 0.0052,
  "2048x1360@high": 0.17656,
  "2048x1360@low": 0.0052,
  "2048x1360@medium": 0.04424,
  "2048x1536@auto": 0.00608,
  "2048x1536@high": 0.21352,
  "2048x1536@low": 0.00608,
  "2048x1536@medium": 0.05352,
  "2048x2048@auto": 0.00968,
  "2048x2048@high": 0.34264,
  "2048x2048@low": 0.00968,
  "2048x2048@medium": 0.08576,
  "2048x2560@auto": 0.0092,
  "2048x2560@high": 0.32136,
  "2048x2560@low": 0.0092,
  "2048x2560@medium": 0.07944,
  "2160x3840@auto": 0.00904,
  "2160x3840@high": 0.32032,
  "2160x3840@low": 0.00904,
  "2160x3840@medium": 0.08024,
  "2336x3520@auto": 0.01088,
  "2336x3520@high": 0.37696,
  "2336x3520@low": 0.01088,
  "2336x3520@medium": 0.09432,
  "2480x3312@auto": 0.01192,
  "2480x3312@high": 0.42368,
  "2480x3312@low": 0.01192,
  "2480x3312@medium": 0.106,
  "2560x2048@auto": 0.0092,
  "2560x2048@high": 0.32136,
  "2560x2048@low": 0.0092,
  "2560x2048@medium": 0.07944,
  "2576x3216@auto": 0.01296,
  "2576x3216@high": 0.45624,
  "2576x3216@low": 0.01296,
  "2576x3216@medium": 0.11264,
  "2688x1152@auto": 0.0036,
  "2688x1152@high": 0.12056,
  "2688x1152@low": 0.0036,
  "2688x1152@medium": 0.03096,
  "2688x1344@auto": 0.00448,
  "2688x1344@high": 0.15536,
  "2688x1344@low": 0.00448,
  "2688x1344@medium": 0.03896,
  "2880x2880@auto": 0.01592,
  "2880x2880@high": 0.56936,
  "2880x2880@low": 0.01592,
  "2880x2880@medium": 0.1424,
  "3072x1024@auto": 0.00256,
  "3072x1024@high": 0.09496,
  "3072x1024@low": 0.00256,
  "3072x1024@medium": 0.02384,
  "3216x2576@auto": 0.01296,
  "3216x2576@high": 0.45624,
  "3216x2576@low": 0.01296,
  "3216x2576@medium": 0.11264,
  "3312x2480@auto": 0.01192,
  "3312x2480@high": 0.42368,
  "3312x2480@low": 0.01192,
  "3312x2480@medium": 0.106,
  "3520x2336@auto": 0.01088,
  "3520x2336@high": 0.37696,
  "3520x2336@low": 0.01088,
  "3520x2336@medium": 0.09432,
  "3840x1280@auto": 0.00344,
  "3840x1280@high": 0.1276,
  "3840x1280@low": 0.00344,
  "3840x1280@medium": 0.032,
  "3840x1648@auto": 0.00576,
  "3840x1648@high": 0.19688,
  "3840x1648@low": 0.00576,
  "3840x1648@medium": 0.05048,
  "3840x1920@auto": 0.00736,
  "3840x1920@high": 0.25928,
  "3840x1920@low": 0.00736,
  "3840x1920@medium": 0.06496,
  "3840x2160@auto": 0.00904,
  "3840x2160@high": 0.32032,
  "3840x2160@low": 0.00904,
  "3840x2160@medium": 0.08024,
  "512x1536@auto": 0.00144,
  "512x1536@high": 0.05144,
  "512x1536@low": 0.00144,
  "512x1536@medium": 0.01296,
  "768x1024@auto": 0.00336,
  "768x1024@high": 0.11568,
  "768x1024@low": 0.00336,
  "768x1024@medium": 0.02904,
  "864x1536@auto": 0.00304,
  "864x1536@high": 0.1036,
  "864x1536@low": 0.00304,
  "864x1536@medium": 0.026,
  "864x2016@auto": 0.00264,
  "864x2016@high": 0.08848,
  "864x2016@low": 0.00264,
  "864x2016@medium": 0.0228,
};

export const IMAGE_MODEL_ROUTE_DETAILS: Partial<Record<
  ImageModel,
  {
    routeLabel: string;
    description: string;
    badge?: string;
  }
>> = {
  "gpt-image-2": {
    routeLabel: "常规",
    description: "常规图片线路，比例只作为构图偏好，实际像素以上游返回为准。",
  },
  "gpt-image-2-official": {
    routeLabel: "官方",
    description: "官方图片线路，画幅只作偏好，不保证固定像素。",
  },
};

export function isImageModel(value: unknown): value is ImageModel {
  return typeof value === "string" && value.trim().length > 0;
}

export function isImageTaskModel(value: unknown): value is ImageModel {
  return isImageModel(value) && (IMAGE_TASK_MODEL_VALUES.has(value) || modelIDLooksImageCapable(value));
}

export function isImageCreationModel(value: unknown): value is ImageModel {
  return isImageTaskModel(value);
}

export function isChatModel(value: unknown): value is ImageModel {
  return isImageModel(value) && (CHAT_MODEL_VALUES.has(value) || !modelIDLooksImageCapable(value));
}

export function canvasModelHasCapability(model: CanvasModelOption, capability: "chat" | "image" | "video") {
  return Array.isArray(model.capabilities) && model.capabilities.includes(capability);
}

export function modelIDLooksImageCapable(model: string) {
  const lower = model.trim().toLowerCase();
  return [
    "image",
    "imagen",
    "flux",
    "stable-diffusion",
    "sdxl",
    "dall-e",
    "midjourney",
    "kolors",
    "ideogram",
    "recraft",
  ].some((hint) => lower.includes(hint));
}

export function usesOfficialImageRoute(model: ImageModel) {
  return model === "auto" || model === "gpt-image-2" || model === OFFICIAL_IMAGE_MODEL;
}

export function usesCodexImageRoute(model: ImageModel) {
  return model === CODEX_IMAGE_MODEL;
}

export function supportsStructuredImageParameters(model: ImageModel) {
  return usesCodexImageRoute(model);
}

export function supportsImageResolutionPresets(model: ImageModel) {
  return isImageModel(model);
}

export function supportsImageOutputControls(model: ImageModel) {
  return usesOfficialImageRoute(model) || usesCodexImageRoute(model);
}

export function supportsImageQuality(_model: ImageModel) {
  return false;
}

export function estimateImageDisplayPriceUSD(model: ImageModel, count: number, sizeOrResolution: string, quality = "auto") {
  const normalizedCount = Math.max(1, Math.floor(Number(count) || 1));
  let basePrice: number | null = null;
  if (model === "auto" || model === "gpt-image-2") {
    const normalizedResolution =
      sizeOrResolution === "2K" || sizeOrResolution === "4K" || sizeOrResolution === "1K" ? sizeOrResolution : "default";
    basePrice = GPT_IMAGE_2_BASE_PRICE_USD[normalizedResolution];
  } else if (model === "gpt-image-2-official") {
    const normalizedSize = sizeOrResolution.trim();
    const normalizedQuality = quality === "low" || quality === "medium" || quality === "high" ? quality : "auto";
    basePrice =
      GPT_IMAGE_2_OFFICIAL_BASE_PRICE_USD[`${normalizedSize}@${normalizedQuality}`] ??
      GPT_IMAGE_2_OFFICIAL_BASE_PRICE_USD[`${normalizedSize}@auto`] ??
      GPT_IMAGE_2_OFFICIAL_BASE_PRICE_USD.default;
  }

  return basePrice === null ? null : basePrice * IMAGE_PRICE_ESTIMATE_MULTIPLIER * normalizedCount;
}

export function estimateImageBillingUnits(model: ImageModel, count: number, sizeOrResolution: string, quality = "auto") {
  const price = estimateImageDisplayPriceUSD(model, count, sizeOrResolution, quality);
  if (price === null || !Number.isFinite(price)) {
    return Math.max(1, Math.floor(Number(count) || 1));
  }
  return Math.ceil(price * IMAGE_PRICE_ESTIMATE_USD_CNY_RATE * IMAGE_BILLING_UNIT_SCALE);
}

export function formatImageDisplayPriceUSD(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }
  return `$${value.toFixed(4)}`;
}

export function formatImageDisplayPriceCNY(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }
  const cny = value * IMAGE_PRICE_ESTIMATE_USD_CNY_RATE;
  return `约 ¥${cny.toFixed(3)}`;
}

export type ImageVisibility = "private" | "public";

export type AuthRole = "admin" | "user";
export type AnnouncementTarget = "login" | "image";
export type LogView = "all" | "meaningful" | "business";
export type AccountScheduleMode = "load_balance" | "fill_first";

export type PermissionMenu = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  order?: number;
  children?: PermissionMenu[];
};

export type ApiPermission = {
  key: string;
  method: string;
  path: string;
  label: string;
  group: string;
  subtree?: boolean;
};

export type Account = {
  id: string;
  access_token?: string;
  token_preview?: string;
  type: AccountType;
  status: AccountStatus;
  enabled: boolean;
  quota: number;
  imageQuotaUnknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restoreAt?: string | null;
  success: number;
  fail: number;
  lastUsedAt: string | null;
};

type AccountListResponse = {
  items: Account[];
};

type AccountTokensResponse = {
  tokens: string[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  updated?: number;
  removed?: number;
  refreshed?: number;
  session_refreshed?: number;
  session_failed?: number;
  errors?: Array<{ access_token?: string; account_id?: string; error: string }>;
  results?: AccountRefreshResult[];
  total?: number;
  failed?: number;
  duration_ms?: number;
};

export type AccountRefreshResult = {
  account_id: string;
  access_token?: string;
  token_preview?: string;
  success: boolean;
  status: "success" | "error" | string;
  message?: string;
  error?: string;
  duration_ms?: number;
  account_status?: AccountStatus;
  email?: string | null;
  type?: AccountType;
  quota?: number;
  image_quota_unknown?: boolean;
  restore_at?: string | null;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token?: string; account_id?: string; error: string }>;
  results: AccountRefreshResult[];
  total?: number;
  failed?: number;
  duration_ms?: number;
};

export type UpstreamAccountActionOptions = {
  disable_memory?: boolean;
  hide_conversations?: boolean;
  delete_files?: boolean;
  file_page_limit?: number;
};

export type UpstreamAccountActionResult = {
  account_id: string;
  access_token?: string;
  token_preview?: string;
  success: boolean;
  status: string;
  message?: string;
  error?: string;
  duration_ms?: number;
  actions?: Record<string, unknown>;
};

export type UpstreamAccountActionResponse = {
  total: number;
  succeeded: number;
  failed: number;
  duration_ms?: number;
  errors: Array<{ access_token?: string; account_id?: string; error: string }>;
  results: UpstreamAccountActionResult[];
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export type SettingsConfig = {
  proxy: string;
  base_url?: string;
  registration_enabled?: boolean;
  refresh_account_interval_minute?: number | string;
  image_task_timeout_seconds?: number | string;
  user_default_concurrent_limit?: number | string;
  user_default_rpm_limit?: number | string;
  default_billing_type?: BillingType;
  default_standard_balance?: number | string;
  default_subscription_quota?: number | string;
  default_subscription_period?: BillingPeriod;
  image_retention_days?: number | string;
  image_storage_limit_mb?: number | string;
  image_max_saved_per_user?: number | string;
  log_retention_days?: number | string;
  default_log_view?: LogView | string;
  auto_remove_invalid_accounts?: boolean;
  auto_remove_rate_limited_accounts?: boolean;
  text_account_schedule_mode?: AccountScheduleMode | string;
  image_account_schedule_mode?: AccountScheduleMode | string;
  log_levels?: string[];
  linuxdo_enabled?: boolean;
  linuxdo_client_id?: string;
  linuxdo_client_secret?: string;
  linuxdo_client_secret_configured?: boolean;
  linuxdo_redirect_url?: string;
  linuxdo_frontend_redirect_url?: string;
  update_repo?: string;
  update_github_token?: string;
  update_github_token_configured?: boolean;
  login_page_image_url?: string;
  login_page_image_mode?: LoginPageImageMode | string;
  login_page_image_zoom?: number | string;
  login_page_image_position_x?: number | string;
  login_page_image_position_y?: number | string;
  [key: string]: unknown;
};

export type LoginPageImageSettings = {
  login_page_image_url: string;
  login_page_image_mode: LoginPageImageMode;
  login_page_image_zoom: number;
  login_page_image_position_x: number;
  login_page_image_position_y: number;
};

export type ManagedImageSummary = {
  name: string;
  path: string;
  owner_name?: string;
  owner_id?: string;
  library_scope?: "personal" | "team" | string;
  team_id?: string;
  team_name?: string;
  moved_by_user_id?: string;
  moved_at?: string;
  visibility: ImageVisibility;
  date: string;
  size: number;
  thumbnail_url?: string;
  preview_url?: string;
  width?: number;
  height?: number;
  resolution?: string;
  aspect_ratio?: string;
  orientation?: string;
  megapixels?: number;
  created_at: string;
  published_at?: string;
  tags?: string[];
};

export type ManagedImageDetail = ManagedImageSummary & {
  prompt?: string;
  model?: ImageModel;
  quality?: ImageQuality;
  url: string;
  resolution_preset?: string;
  requested_size?: string;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  background?: string;
  moderation?: string;
  style?: string;
  partial_images?: number;
  input_image_mask?: string;
  storage_backend?: string;
  object_key?: string;
  object_url?: string;
  reference_image_urls?: string[];
  reference_images?: Array<{
    path: string;
    url?: string;
    filename?: string;
    content_type?: string;
    size?: number;
  }>;
  share_prompt_parameters?: boolean;
  share_reference_images?: boolean;
};

export type ManagedImage = ManagedImageDetail;

export type ManagedImageListScope = "mine" | "team" | "public" | "all";

export type ManagedImageListFilters = {
  start_date?: string;
  end_date?: string;
  scope?: ManagedImageListScope;
  team_id?: string;
  page_size?: number;
  cursor?: string;
  search?: string;
  visibility?: "all" | ImageVisibility;
  format?: string;
  orientation?: string;
  resolution?: string;
  aspect_ratio?: string;
  tags?: string[];
};

export type ManagedImageListResult = {
  items: ManagedImageSummary[];
  groups: Array<{ date: string; items: ManagedImageSummary[] }>;
  next_cursor: string;
  has_more: boolean;
  page_size: number;
  retention_days: number;
  team?: {
    id: string;
    name?: string;
    member_role?: "owner" | "manager" | "member" | string;
    storage_limit_bytes?: number;
  };
  team_storage?: TeamImageStorageSummary;
};

export type SystemLog = {
  time: string;
  summary?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SystemLogFilters = {
  username?: string;
  module?: string;
  summary?: string;
  method?: string;
  status?: string;
  ip_address?: string;
  operation_type?: string;
  log_level?: string;
  view?: LogView | string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  page_size?: number | string;
};

export type LogGovernanceSummary = {
  total: number;
  oldest_time?: string;
  latest_time?: string;
};

export type LogCleanupResult = {
  retention_days: number;
  cutoff_date: string;
  deleted: number;
  remaining: number;
};

export type CreationTaskDiagnosticsItem = {
  id: string;
  owner_id: string;
  status: string;
  mode: string;
  updated_at: string;
  error?: string;
  output_statuses?: string[];
  age_seconds: number;
  stale: boolean;
  dirty_terminal: boolean;
};

export type CreationTaskDiagnosticsSummary = {
  total_tasks: number;
  active_tasks: number;
  queued_tasks: number;
  running_tasks: number;
  terminal_tasks: number;
  stale_active_tasks: number;
  dirty_terminal_tasks: number;
  dirty_terminal_output_statuses: number;
  active_output_statuses: number;
  running_owners: number;
  running_units: number;
  stale_threshold_seconds: number;
  suspicious_tasks?: CreationTaskDiagnosticsItem[];
};

export type CreationTaskRepairResult = {
  repaired_terminal_tasks: number;
  finalized_active_tasks: number;
  skipped_active_tasks: number;
  cancelled_handlers: number;
  before: CreationTaskDiagnosticsSummary;
  after: CreationTaskDiagnosticsSummary;
};

export type ImageStorageGovernanceSummary = {
  total_bytes: number;
  images_bytes: number;
  thumbnails_bytes: number;
  previews_bytes: number;
  metadata_bytes: number;
  reference_bytes: number;
  images_count: number;
  public_images_count: number;
  private_images_count: number;
  thumbnail_files: number;
  previews_files: number;
  metadata_files: number;
  reference_files: number;
  limit_bytes: number;
  over_limit_bytes: number;
  oldest_image_at?: string;
  latest_image_at?: string;
};

export type ImageStorageCleanupResult = {
  retention_days?: number;
  max_bytes?: number;
  max_images_per_user?: number;
  include_public?: boolean;
  deleted_images: number;
  deleted_thumbnails: number;
  deleted_previews?: number;
  deleted_metadata_files: number;
  deleted_reference_files: number;
  deleted_bytes: number;
  remaining_bytes: number;
  over_limit_bytes: number;
  preserved_public_images?: number;
  action?: string;
};

export type ReleaseAsset = {
  name: string;
  download_url: string;
  size: number;
};

export type ReleaseInfo = {
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
};

export type SystemUpdateInfo = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_info?: ReleaseInfo;
  cached: boolean;
  warning?: string;
  build_type: string;
};

export type SystemUpdateResult = {
  message: string;
  need_restart: boolean;
};

export type ImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};

export type CreationTaskData = {
  b64_json?: string;
  url?: string;
  local_url?: string;
  video_url?: string;
  revised_prompt?: string;
  text_response?: string;
  width?: number;
  height?: number;
  resolution?: string;
  output_format?: ImageOutputFormat;
};

export type CreationTask = {
  id: string;
  status: "queued" | "running" | "success" | "error" | "cancelled";
  mode: "generate" | "edit" | "chat" | "video";
  model?: ImageModel;
  size?: string;
  quality?: ImageQuality;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  background?: string;
  moderation?: string;
  style?: string;
  partial_images?: number;
  created_at: string;
  updated_at: string;
  data?: CreationTaskData[];
  output_statuses?: ("queued" | "running" | "success" | "error" | "cancelled")[];
  error?: string;
  output_type?: "text";
  visibility?: ImageVisibility;
};

export type CreationTaskReferenceImage = {
  id: string;
  client_reference_id: string;
  filename: string;
  content_type: string;
  size: number;
  width?: number;
  height?: number;
  created_at?: string;
  expires_at?: string;
};

export type CreationTaskMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type CanvasNodeType = "text" | "image" | "prompt" | "llm" | "loop" | "group" | "image_generation" | "image_edit" | "video_generation" | "result";
export type CanvasRunStatus = "queued" | "running" | "success" | "error" | "cancelled" | "blocked";

export type CanvasImageRef = {
  url?: string;
  local_url?: string;
  path?: string;
  name?: string;
  thumbnail_url?: string;
  preview_url?: string;
  role?: "image" | "mask";
  visibility?: ImageVisibility;
};

export type CanvasVideoRef = {
  url?: string;
  local_url?: string;
  name?: string;
};

export type CanvasNodeOutput = {
  text?: string;
  images?: CanvasImageRef[];
  videos?: CanvasVideoRef[];
  task_id?: string;
  raw?: Record<string, unknown>;
};

export type CanvasNodeData = {
  label?: string;
  text?: string;
  prompt?: string;
  instruction?: string;
  model?: string;
  size?: string;
  size_user_modified?: boolean;
  quality?: string;
  image_resolution?: string;
  image_resolution_user_modified?: boolean;
  n?: number;
  duration?: number;
  aspect_ratio?: string;
  visibility?: ImageVisibility;
  url?: string;
  local_url?: string;
  path?: string;
  images?: CanvasImageRef[];
  videos?: CanvasVideoRef[];
  image_url?: string;
  image_path?: string;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  background?: string;
  moderation?: string;
  style?: string;
  partial_images?: number;
  status?: CreationTask["status"];
  error?: string;
  output?: CanvasNodeOutput;
  task_id?: string;
  input_images?: CanvasImageRef[];
  mention_images?: CanvasImageRef[];
  group_item_ids?: string[];
  loop_mode?: "repeat" | "images";
  loop_count?: number;
  loop_concurrency?: number;
  loop_progress?: {
    total: number;
    completed: number;
    failed: number;
    current: number;
  };
  // Routing secrets are owned by Sub2API / server-side routing, not canvas nodes.
  api_key?: never;
  apiKey?: never;
  base_url?: never;
  baseURL?: never;
  group_id?: never;
  groupId?: never;
  [key: string]: unknown;
};

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  name?: string;
  position?: { x?: number; y?: number; [key: string]: unknown };
  data?: CanvasNodeData;
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
};

export type CanvasRunSummary = {
  run_id?: string;
  status: CanvasRunStatus;
  total_nodes: number;
  success_nodes: number;
  failed_nodes: number;
  blocked_nodes: number;
  text_output?: string;
  image_outputs?: CanvasImageRef[];
  video_outputs?: CanvasVideoRef[];
  started_at?: string;
  completed_at?: string;
};

export type CanvasDocument = {
  id: string;
  owner_id?: string;
  name: string;
  kind?: string;
  schema_version?: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport?: Record<string, unknown>;
  last_run?: CanvasRunSummary;
  created_at?: string;
  updated_at?: string;
};

export type CanvasNodeRunState = {
  id: string;
  type: CanvasNodeType;
  name?: string;
  status: CanvasRunStatus;
  error?: string;
  task_id?: string;
  output?: CanvasNodeOutput;
  started_at?: string;
  completed_at?: string;
};

export type CanvasRun = {
  id: string;
  canvas_id: string;
  canvas_name?: string;
  mode: "canvas" | "nodes";
  selected_node_ids?: string[];
  status: CanvasRunStatus;
  error?: string;
  node_states: Record<string, CanvasNodeRunState>;
  summary: CanvasRunSummary;
  created_at: string;
  updated_at: string;
  completed_at?: string;
};

export type CanvasModelOption = {
  id: string;
  name: string;
  kind: "text" | "image" | "video" | "both";
  capabilities?: Array<"chat" | "image" | "video">;
  enabled?: boolean;
};

export type SocialPlatform = "xhs";
export type SocialProjectStatus =
  | "draft"
  | "generating_copy"
  | "copy_ready"
  | "generating_cards"
  | "cards_ready"
  | "exported";
export type SocialCardVisualMode = "info" | "ai" | "image";

export type SocialImageRef = {
  url?: string;
  local_url?: string;
  path?: string;
  name?: string;
  thumbnail_url?: string;
};

export type SocialCard = {
  id: string;
  index: number;
  title?: string;
  body?: string;
  layout?: string;
  visual_mode?: SocialCardVisualMode;
  image_prompt?: string;
  image_url?: string;
  local_url?: string;
  path?: string;
  task_id?: string;
  status?: CreationTask["status"];
  accent?: string;
};

export type SocialProject = {
  id: string;
  owner_id?: string;
  platform: SocialPlatform;
  status: SocialProjectStatus;
  topic?: string;
  audience?: string;
  tone?: string;
  source_text?: string;
  source_images?: SocialImageRef[];
  title?: string;
  caption?: string;
  tags?: string[];
  copy_markdown?: string;
  cards?: SocialCard[];
  copy_task_id?: string;
  card_task_ids?: string[];
  last_exported_at?: string;
  exported_file?: string;
  created_at?: string;
  updated_at?: string;
};

export type SocialExportResult = {
  item: SocialProject;
  file_name: string;
  markdown: string;
  card_count: number;
};

export type FallbackReferenceImage = {
  path?: string;
  url?: string;
  b64_json?: string;
  outputFormat?: ImageOutputFormat;
};

export type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type CreationTaskListResponse = {
  items?: CreationTask[] | null;
  missing_ids?: string[] | null;
};

export type LoginResponse = {
  ok: boolean;
  version: string;
  token?: string;
  role: AuthRole;
  role_id?: string;
  role_name?: string;
  subject_id: string;
  name: string;
  provider?: string;
  credential_id?: string;
  credential_name?: string;
  creation_concurrent_limit: number;
  creation_rpm_limit: number;
  billing?: BillingState | null;
  menu_paths?: string[];
  api_permissions?: string[];
  menus?: PermissionMenu[];
  sub2api?: Sub2APIBinding | null;
};

export type Sub2APIBinding = {
  owner_id: string;
  sub2api_user_id: string;
  user_email?: string;
  user_name?: string;
  api_key_id?: string;
  api_key_name?: string;
  api_key_last4?: string;
  group_id?: string;
  group_name?: string;
  group_platform?: string;
  gateway_base_url?: string;
  expires_at?: string;
  updated_at?: string;
  has_bound_api_key?: boolean;
};

export type Sub2APIKeyOption = {
  id: string;
  name: string;
  last4?: string;
  group_id?: string;
  group_name?: string;
  group_platform?: string;
  supports_image_generation?: boolean;
};

export type AuthProviders = {
  linuxdo: {
    enabled: boolean;
  };
  sub2api?: {
    enabled: boolean;
    launch_url?: string;
    brand_name?: string;
    recharge_url?: string;
    usage_url?: string;
  };
  registration?: {
    enabled: boolean;
  };
};

export type Sub2APIWalletSummary = {
  balance?: number | string;
  available?: number | string;
  recharge_url?: string;
  limit_state?: string;
  updated_at?: string;
};

export type WorkspaceScope = {
  type: "personal" | "team";
  team_id?: string;
};

export type TeamMember = {
  user_id: string;
  name: string;
  email?: string;
  role?: "owner" | "manager" | "member" | string;
  daily_limit_amount?: number;
  joined_at?: string | null;
};

export type TeamDailyLimitState = {
  limit_amount: number;
  used_amount: number;
  remaining_amount: number;
  unlimited: boolean;
};

export type TeamImageStorageSummary = {
  team_id: string;
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  images_count: number;
};

export type TeamInvite = {
  id: string;
  team_id: string;
  team_name?: string;
  target_email: string;
  role: "manager" | "member" | string;
  status: "pending" | "accepted" | "revoked" | string;
  invited_by_user_id?: string;
  invited_by_name?: string;
  can_revoke?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
};

export type TeamSummary = {
  id: string;
  name: string;
  owner_user_id?: string;
  owner_name?: string;
  member_count?: number;
  member_role?: "owner" | "manager" | "member" | string;
  members?: TeamMember[];
  invites?: TeamInvite[];
  my_daily_limit?: TeamDailyLimitState;
  storage_limit_bytes?: number;
  storage?: TeamImageStorageSummary;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TeamWorkspaceState = {
  scope: WorkspaceScope;
  teams: TeamSummary[];
  pending_invites?: TeamInvite[];
};

export type TeamAuditLog = {
  id: string;
  team_id: string;
  actor_user_id?: string;
  actor_name?: string;
  action?: string;
  summary?: string;
  target_email?: string;
  target_user_id?: string;
  target_role?: string;
  created_at?: string | null;
};

export type TeamUsageTask = {
  id: string;
  status: string;
  mode: string;
  model?: string;
  size?: string;
  count?: number;
  team_id?: string;
  payer_user_id?: string;
  actor_user_id?: string;
  actor_name?: string;
  billing_consumed_amount?: number;
  billing_unit_amount?: number;
  duration_seconds?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  enabled?: boolean;
  show_login: boolean;
  show_image: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserKey = {
  id: string;
  name: string;
  role: AuthRole;
  role_id?: string;
  role_name?: string;
  kind?: "api_key";
  provider?: "local" | "linuxdo" | string;
  owner_id?: string;
  owner_name?: string;
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
  menu_paths?: string[];
  api_permissions?: string[];
};

export type BillingType = "standard" | "subscription";
export type BillingPeriod = "daily" | "weekly" | "monthly";

export type BillingStandardState = {
  balance: number;
  lifetime_consumed: number;
  available_balance?: number;
};

export type BillingSubscriptionState = {
  quota_limit: number;
  quota_used: number;
  manual_delta: number;
  quota_period: BillingPeriod;
  quota_period_started_at?: string;
  quota_period_ends_at?: string;
  remaining_quota?: number;
};

export type BillingState = {
  type: BillingType;
  unit: "image" | "cny_milli";
  unlimited: boolean;
  available: number;
  standard?: BillingStandardState | null;
  subscription?: BillingSubscriptionState | null;
  limit_state?: "ok" | "insufficient" | "unlimited" | string;
  updated_at?: string;
};

export type BillingAdjustment = {
  id: string;
  user_id: string;
  operator_id?: string;
  operator_name?: string;
  billing_type: BillingType;
  type: string;
  amount?: number;
  reason?: string;
  before?: BillingState | Record<string, unknown>;
  after?: BillingState | Record<string, unknown>;
  created_at: string;
};

export type BillingAdjustmentPayload = {
  type: string;
  reason?: string;
  amount?: number;
  balance?: number;
  quota_limit?: number;
  quota_period?: BillingPeriod;
  unlimited?: boolean;
};

export type BulkBillingAdjustmentPayload = {
  scope: "users" | "role";
  user_ids?: string[];
  role_id?: string;
  billing: BillingAdjustmentPayload;
};

export type BulkBillingAdjustmentResult = {
  user_id: string;
  billing?: BillingState | null;
  adjustment?: BillingAdjustment;
  error?: string;
};

export type BulkBillingAdjustmentSummary = {
  total: number;
  succeeded: number;
  failed: number;
};

export type ManagedUser = {
  id: string;
  username?: string;
  name: string;
  role: "user";
  role_id?: string;
  role_name?: string;
  provider: "local" | "linuxdo" | string;
  owner_id?: string;
  owner_name?: string;
  linuxdo_level?: string;
  enabled: boolean;
  has_api_key: boolean;
  has_session: boolean;
  api_key_id?: string;
  api_key_name?: string;
  session_id?: string;
  session_name?: string;
  credential_count: number;
  created_at: string | null;
  last_used_at: string | null;
  updated_at?: string | null;
  call_count?: number;
  success_count?: number;
  failure_count?: number;
  quota_used?: number;
  billing?: BillingState | null;
  usage_curve?: Array<{
    date: string;
    calls: number;
    success: number;
    failure: number;
    quota_used: number;
  }>;
  menu_paths?: string[];
  api_permissions?: string[];
  billing_adjustments?: BillingAdjustment[];
};

export type ManagedUsersQuery = {
  page?: number | string;
  page_size?: number | string;
  search?: string;
  provider?: "all" | "local" | "linuxdo" | string;
  status?: "all" | "enabled" | "disabled" | string;
  sort_by?: string;
  sort_order?: "asc" | "desc" | string;
  signal?: AbortSignal;
};

export type ManagedUsersResponse = {
  items: ManagedUser[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type ManagedRole = {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  user_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
  menu_paths?: string[];
  api_permissions?: string[];
};

export type CreateManagedUserPayload = {
  username: string;
  name?: string;
  password: string;
  role_id?: string;
  enabled?: boolean;
};

export type RegisterConfig = {
  enabled: boolean;
  mail: {
    request_timeout: number;
    wait_timeout: number;
    wait_interval: number;
    providers: Array<Record<string, unknown>>;
  };
  proxy: string;
  total: number;
  threads: number;
  mode: "total" | "quota" | "available";
  target_quota: number;
  target_available: number;
  check_interval: number;
  stats: {
    job_id?: string;
    success: number;
    fail: number;
    done: number;
    running: number;
    threads: number;
    elapsed_seconds?: number;
    avg_seconds?: number;
    success_rate?: number;
    current_quota?: number;
    current_available?: number;
    started_at?: string;
    updated_at?: string;
    finished_at?: string;
  };
  logs?: Array<{
    time: string;
    text: string;
    level: string;
  }>;
};

export async function login(username: string, password: string) {
  return httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password },
    redirectOnUnauthorized: false,
  });
}

export async function registerAccount(username: string, password: string, name?: string) {
  return httpRequest<LoginResponse>("/auth/register", {
    method: "POST",
    body: { username, password, name: name ?? "" },
    redirectOnUnauthorized: false,
  });
}

export async function verifySession(token: string) {
  const authorization = String(token || "").trim();
  return httpRequest<LoginResponse>("/auth/session", {
    method: "GET",
    headers: authorization ? { Authorization: `Bearer ${authorization}` } : undefined,
    redirectOnUnauthorized: false,
    skipStoredAuthorization: !authorization,
  });
}

export async function launchSub2API(token: string) {
  return httpRequest<LoginResponse>("/auth/sub2api/launch", {
    method: "POST",
    body: { token },
    redirectOnUnauthorized: false,
  });
}

export async function fetchSub2APIBinding() {
  return httpRequest<{ binding: Sub2APIBinding | null }>("/api/sub2api/binding");
}

export async function fetchSub2APIKeys() {
  const data = await httpRequest<{ items?: Sub2APIKeyOption[] | null; binding?: Sub2APIBinding | null }>("/api/sub2api/api-keys");
  return {
    items: Array.isArray(data.items) ? data.items : [],
    binding: data.binding ?? null,
  };
}

export async function bindSub2APIKey(apiKeyId: string) {
  return httpRequest<{ binding: Sub2APIBinding }>("/api/sub2api/binding", {
    method: "POST",
    body: { api_key_id: apiKeyId },
  });
}

export async function fetchSub2APIWalletSummary() {
  return httpRequest<Sub2APIWalletSummary>("/api/sub2api/balance", {
    redirectOnUnauthorized: false,
  });
}

export async function fetchTeamWorkspace() {
  const data = await httpRequest<Partial<TeamWorkspaceState>>("/api/teams");
  return {
    scope: data.scope?.type === "team"
      ? { type: "team" as const, team_id: String(data.scope.team_id || "") }
      : { type: "personal" as const },
    teams: Array.isArray(data.teams) ? data.teams : [],
    pending_invites: Array.isArray(data.pending_invites) ? data.pending_invites : [],
  };
}

export async function createTeam(name: string) {
  return httpRequest<{ team: TeamSummary; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>("/api/teams", {
    method: "POST",
    body: { name },
  });
}

export async function createTeamInvite(teamId: string, email: string, role: "manager" | "member") {
  return httpRequest<{ invite: TeamInvite; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>(`/api/teams/${encodeURIComponent(teamId)}/invites`, {
    method: "POST",
    body: { email, role },
  });
}

export async function acceptTeamInvite(inviteId: string) {
  return httpRequest<{ team: TeamSummary; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>(`/api/team-invites/${encodeURIComponent(inviteId)}/accept`, {
    method: "POST",
  });
}

export async function revokeTeamInvite(inviteId: string) {
  return httpRequest<{ invite: TeamInvite; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>(`/api/team-invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
}

export async function updateTeamMemberRole(teamId: string, userId: string, role: "manager" | "member") {
  return httpRequest<{ team: TeamSummary; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { role },
  });
}

export async function updateTeamMemberDailyLimit(teamId: string, userId: string, dailyLimitAmount: number) {
  return httpRequest<{ team: TeamSummary; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { daily_limit_amount: dailyLimitAmount },
  });
}

export async function removeTeamMember(teamId: string, userId: string) {
  return httpRequest<{ team: TeamSummary; teams?: TeamSummary[]; workspace?: TeamWorkspaceState }>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function fetchTeamAuditLogs(teamId: string, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  return httpRequest<{ items: TeamAuditLog[] }>(`/api/teams/${encodeURIComponent(teamId)}/audit-logs?${params.toString()}`);
}

export async function fetchTeamUsage(teamId: string, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  return httpRequest<{ items: TeamUsageTask[] }>(`/api/teams/${encodeURIComponent(teamId)}/usage?${params.toString()}`);
}

export async function switchWorkspace(scope: WorkspaceScope) {
  return httpRequest<TeamWorkspaceState>("/api/teams/current", {
    method: "POST",
    body: scope.type === "team" ? { type: "team", team_id: scope.team_id } : { type: "personal" },
  });
}

export async function fetchProfile() {
  return httpRequest<LoginResponse>("/api/profile");
}

export async function logout() {
  return httpRequest<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    redirectOnUnauthorized: false,
  });
}

export async function fetchAuthProviders() {
  return httpRequest<AuthProviders>("/auth/providers", {
    redirectOnUnauthorized: false,
  });
}

export async function fetchVisibleAnnouncements(target: AnnouncementTarget) {
  const params = new URLSearchParams({ target });
  return httpRequest<{ items: Announcement[] }>(`/api/announcements?${params.toString()}`, {
    redirectOnUnauthorized: false,
  });
}

export async function fetchAdminAnnouncements() {
  return httpRequest<{ items: Announcement[] }>("/api/admin/announcements");
}

export async function createAnnouncement(announcement: {
  title: string;
  content: string;
  enabled: boolean;
  show_login: boolean;
  show_image: boolean;
}) {
  return httpRequest<{ item: Announcement; items: Announcement[] }>("/api/admin/announcements", {
    method: "POST",
    body: announcement,
  });
}

export async function updateAnnouncement(
  announcementId: string,
  updates: Partial<Pick<Announcement, "title" | "content" | "enabled" | "show_login" | "show_image">>,
) {
  return httpRequest<{ item: Announcement; items: Announcement[] }>(`/api/admin/announcements/${announcementId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteAnnouncement(announcementId: string) {
  return httpRequest<{ items: Announcement[] }>(`/api/admin/announcements/${announcementId}`, {
    method: "DELETE",
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function fetchAccountTokens() {
  return httpRequest<AccountTokensResponse>("/api/accounts/tokens");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function createAccountFromSession(sessionJson: string) {
  return httpRequest<AccountMutationResponse>("/api/accounts/session", {
    method: "POST",
    body: { session_json: sessionJson },
  });
}

export async function deleteAccounts(accountIds: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { account_ids: accountIds },
  });
}

export async function refreshAccounts(accountIds: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function toggleAccountsEnabled(accountIds: string[], enabled: boolean) {
  return httpRequest<AccountMutationResponse>("/api/accounts/toggle-enabled", {
    method: "POST",
    body: { account_ids: accountIds, enabled },
  });
}

export async function runUpstreamAccountActions(accountIds: string[], options: UpstreamAccountActionOptions) {
  return httpRequest<UpstreamAccountActionResponse>("/api/accounts/upstream-actions", {
    method: "POST",
    body: { account_ids: accountIds, ...options },
  });
}

export async function updateAccount(
  accountId: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      account_id: accountId,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model?: ImageModel, size?: string, quality?: ImageQuality) {
  const normalizedSize = size ? normalizePixelIconSizeAlias(size) : "";
  return httpRequest<ImageResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        ...(model ? { model } : {}),
        ...(normalizedSize ? { size: normalizedSize } : {}),
        ...(quality ? { quality } : {}),
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function editImage(files: File | File[], prompt: string, model?: ImageModel, size?: string, quality?: ImageQuality) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];
  const normalizedSize = size ? normalizePixelIconSizeAlias(size) : "";

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (normalizedSize) {
    formData.append("size", normalizedSize);
  }
  if (quality) {
    formData.append("quality", quality);
  }
  formData.append("n", "1");

  return httpRequest<ImageResponse>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function createImageGenerationTask(
  clientTaskId: string,
  prompt: string,
  model?: string,
  size?: string,
  quality?: ImageQuality,
  count = 1,
  messages?: CreationTaskMessage[],
  visibility: ImageVisibility = "private",
  imageResolution?: string,
  outputFormat?: ImageOutputFormat,
  outputCompression?: number,
  toolOptions?: {
    background?: string;
    moderation?: string;
    style?: string;
    partialImages?: number;
  },
  frontendConversationId?: string,
  fallbackReferenceImage?: FallbackReferenceImage,
) {
  const normalizedSize = size ? normalizePixelIconSizeAlias(size) : "";
  return httpRequest<CreationTask>("/api/creation-tasks/image-generations", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      ...(model ? { model } : {}),
      ...(normalizedSize ? { size: normalizedSize } : {}),
      ...(imageResolution ? { image_resolution: imageResolution } : {}),
      ...(quality ? { quality } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(typeof outputCompression === "number" ? { output_compression: outputCompression } : {}),
      ...(toolOptions?.background ? { background: toolOptions.background } : {}),
      ...(toolOptions?.moderation ? { moderation: toolOptions.moderation } : {}),
      ...(toolOptions?.style ? { style: toolOptions.style } : {}),
      ...(typeof toolOptions?.partialImages === "number" ? { partial_images: toolOptions.partialImages } : {}),
      ...(messages?.length ? { messages } : {}),
      ...(frontendConversationId ? { frontend_conversation_id: frontendConversationId } : {}),
      ...(fallbackReferenceImage ? { fallback_reference_image: fallbackReferenceImage } : {}),
      visibility,
      n: count,
    },
  });
}

export async function createVideoGenerationTask(
  clientTaskId: string,
  prompt: string,
  model?: string,
  images: CanvasImageRef[] = [],
  duration = 5,
  aspectRatio = "16:9",
  resolution = "",
  visibility: ImageVisibility = "private",
  options: {
    enhancePrompt?: boolean;
    generateAudio?: boolean;
  } = {},
) {
  return httpRequest<CreationTask>("/api/creation-tasks/video-generations", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      ...(model ? { model } : {}),
      images,
      duration,
      aspect_ratio: aspectRatio,
      ...(resolution ? { resolution } : {}),
      enhance_prompt: options.enhancePrompt === true,
      generate_audio: options.generateAudio === true,
      visibility,
    },
  });
}

export async function createImageEditTask(
  clientTaskId: string,
  files: File | File[],
  prompt: string,
  model?: string,
  size?: string,
  quality?: ImageQuality,
  count = 1,
  messages?: CreationTaskMessage[],
  visibility: ImageVisibility = "private",
  imageResolution?: string,
  outputFormat?: ImageOutputFormat,
  outputCompression?: number,
  toolOptions?: {
    background?: string;
    moderation?: string;
    style?: string;
    partialImages?: number;
    inputImageMask?: string;
  },
  frontendConversationId?: string,
  fallbackReferenceImage?: FallbackReferenceImage,
) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];
  const normalizedSize = size ? normalizePixelIconSizeAlias(size) : "";

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("client_task_id", clientTaskId);
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (normalizedSize) {
    formData.append("size", normalizedSize);
  }
  if (imageResolution) {
    formData.append("image_resolution", imageResolution);
  }
  if (quality) {
    formData.append("quality", quality);
  }
  if (outputFormat) {
    formData.append("output_format", outputFormat);
  }
  if (typeof outputCompression === "number") {
    formData.append("output_compression", String(outputCompression));
  }
  if (toolOptions?.background) {
    formData.append("background", toolOptions.background);
  }
  if (toolOptions?.moderation) {
    formData.append("moderation", toolOptions.moderation);
  }
  if (toolOptions?.style) {
    formData.append("style", toolOptions.style);
  }
  if (typeof toolOptions?.partialImages === "number") {
    formData.append("partial_images", String(toolOptions.partialImages));
  }
  if (toolOptions?.inputImageMask) {
    formData.append("input_image_mask", toolOptions.inputImageMask);
  }
  if (messages?.length) {
    formData.append("messages", JSON.stringify(messages));
  }
  if (frontendConversationId) {
    formData.append("frontend_conversation_id", frontendConversationId);
  }
  if (fallbackReferenceImage) {
    formData.append("fallback_reference_image", JSON.stringify(fallbackReferenceImage));
  }
  formData.append("visibility", visibility);
  formData.append("n", String(count));

  return httpRequest<CreationTask>("/api/creation-tasks/image-edits", {
    method: "POST",
    body: formData,
  });
}

export async function uploadCreationTaskReferenceImage(
  file: File,
  clientReferenceId: string,
  options: { conversationId?: string; turnId?: string } = {},
) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("client_reference_id", clientReferenceId);
  if (options.conversationId) {
    formData.append("conversation_id", options.conversationId);
  }
  if (options.turnId) {
    formData.append("turn_id", options.turnId);
  }
  const data = await httpRequest<{ item: CreationTaskReferenceImage }>("/api/creation-tasks/reference-images", {
    method: "POST",
    body: formData,
  });
  return data.item;
}

export async function createImageEditTaskFromReferenceIds(
  clientTaskId: string,
  referenceImageIds: string[],
  prompt: string,
  model?: string,
  size?: string,
  quality?: ImageQuality,
  count = 1,
  messages?: CreationTaskMessage[],
  visibility: ImageVisibility = "private",
  imageResolution?: string,
  outputFormat?: ImageOutputFormat,
  outputCompression?: number,
  toolOptions?: {
    background?: string;
    moderation?: string;
    style?: string;
    partialImages?: number;
    inputImageMask?: string;
  },
  frontendConversationId?: string,
  fallbackReferenceImage?: FallbackReferenceImage,
) {
  const normalizedSize = size ? normalizePixelIconSizeAlias(size) : "";
  return httpRequest<CreationTask>("/api/creation-tasks/image-edits", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      reference_image_ids: referenceImageIds,
      prompt,
      ...(model ? { model } : {}),
      ...(normalizedSize ? { size: normalizedSize } : {}),
      ...(imageResolution ? { image_resolution: imageResolution } : {}),
      ...(quality ? { quality } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(typeof outputCompression === "number" ? { output_compression: outputCompression } : {}),
      ...(toolOptions?.background ? { background: toolOptions.background } : {}),
      ...(toolOptions?.moderation ? { moderation: toolOptions.moderation } : {}),
      ...(toolOptions?.style ? { style: toolOptions.style } : {}),
      ...(typeof toolOptions?.partialImages === "number" ? { partial_images: toolOptions.partialImages } : {}),
      ...(toolOptions?.inputImageMask ? { input_image_mask: toolOptions.inputImageMask } : {}),
      ...(messages?.length ? { messages } : {}),
      ...(frontendConversationId ? { frontend_conversation_id: frontendConversationId } : {}),
      ...(fallbackReferenceImage ? { fallback_reference_image: fallbackReferenceImage } : {}),
      visibility,
      n: count,
    },
  });
}

export async function createChatCompletionTask(
  clientTaskId: string,
  prompt: string,
  model: string,
  messages: CreationTaskMessage[],
  referenceImages?: { name: string; dataUrl: string }[],
) {
  const body: Record<string, unknown> = {
    client_task_id: clientTaskId,
    prompt,
    model,
    messages,
  };

  if (referenceImages && referenceImages.length > 0) {
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: prompt },
      ...referenceImages.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.dataUrl },
      })),
    ];
    body.messages = [
      ...messages,
      { role: "user" as const, content },
    ];
  }

  return httpRequest<CreationTask>("/api/creation-tasks/chat-completions", {
    method: "POST",
    body,
  });
}

export async function createChatCompletion(model: ImageModel, messages: CreationTaskMessage[]) {
  return httpRequest<ChatCompletionResponse>("/v1/chat/completions", {
    method: "POST",
    body: {
      model,
      messages,
      stream: false,
    },
  });
}

export async function fetchCreationTasks(ids: string[]) {
  const params = new URLSearchParams();
  if (ids.length > 0) {
    params.set("ids", ids.join(","));
  }
  const data = await httpRequest<CreationTaskListResponse>(`/api/creation-tasks${params.toString() ? `?${params.toString()}` : ""}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return {
    items: Array.isArray(data.items) ? data.items : [],
    missing_ids: Array.isArray(data.missing_ids) ? data.missing_ids : [],
  };
}

export async function cancelCreationTask(clientTaskId: string) {
  return httpRequest<CreationTask>(`/api/creation-tasks/${encodeURIComponent(clientTaskId)}/cancel`, {
    method: "POST",
    body: {},
  });
}

export async function fetchSocialProjects() {
  const data = await httpRequest<{ items?: SocialProject[] }>("/api/social-projects", {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function createSocialProject(project: Partial<SocialProject>) {
  const data = await httpRequest<{ item: SocialProject }>("/api/social-projects", {
    method: "POST",
    body: project,
  });
  return data.item;
}

export async function fetchSocialProject(projectId: string) {
  const data = await httpRequest<{ item: SocialProject }>(`/api/social-projects/${encodeURIComponent(projectId)}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return data.item;
}

export async function saveSocialProject(project: SocialProject) {
  const data = await httpRequest<{ item: SocialProject }>(`/api/social-projects/${encodeURIComponent(project.id)}`, {
    method: "POST",
    body: project,
  });
  return data.item;
}

export async function deleteSocialProject(projectId: string) {
  return httpRequest<{ ok: boolean }>(`/api/social-projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
}

export async function generateSocialProjectCopy(projectId: string, model: string, clientTaskId?: string) {
  return httpRequest<{ item: SocialProject; task: CreationTask }>(`/api/social-projects/${encodeURIComponent(projectId)}/generate-copy`, {
    method: "POST",
    body: {
      model,
      ...(clientTaskId ? { client_task_id: clientTaskId } : {}),
    },
  });
}

export async function generateSocialProjectCards(projectId: string, model: string) {
  const data = await httpRequest<{ item: SocialProject; tasks?: CreationTask[] }>(`/api/social-projects/${encodeURIComponent(projectId)}/generate-cards`, {
    method: "POST",
    body: { model },
  });
  return {
    item: data.item,
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
  };
}

export async function exportSocialProject(projectId: string, fileName?: string) {
  return httpRequest<SocialExportResult>(`/api/social-projects/${encodeURIComponent(projectId)}/export`, {
    method: "POST",
    body: fileName ? { file_name: fileName } : {},
  });
}

export async function fetchCanvasModels() {
  const data = await httpRequest<{ items?: CanvasModelOption[] }>("/api/canvas/models", {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchCanvases() {
  const data = await httpRequest<{ items?: CanvasDocument[] }>("/api/canvases", {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function createCanvas(canvas: Partial<CanvasDocument>) {
  const data = await httpRequest<{ item: CanvasDocument }>("/api/canvases", {
    method: "POST",
    body: canvas,
  });
  return data.item;
}

export async function fetchCanvas(canvasId: string) {
  const data = await httpRequest<{ item: CanvasDocument }>(`/api/canvases/${encodeURIComponent(canvasId)}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return data.item;
}

export async function saveCanvas(canvas: CanvasDocument) {
  const data = await httpRequest<{ item: CanvasDocument }>(`/api/canvases/${encodeURIComponent(canvas.id)}`, {
    method: "POST",
    body: canvas,
  });
  return data.item;
}

export async function deleteCanvas(canvasId: string) {
  return httpRequest<{ ok: boolean }>(`/api/canvases/${encodeURIComponent(canvasId)}`, {
    method: "DELETE",
  });
}

export async function startCanvasRun(canvasId: string, nodeIds: string[] = []) {
  const data = await httpRequest<{ item: CanvasRun }>(`/api/canvases/${encodeURIComponent(canvasId)}/runs`, {
    method: "POST",
    body: nodeIds.length ? { node_ids: nodeIds } : {},
  });
  return data.item;
}

export async function fetchCanvasRuns(canvasId: string) {
  const data = await httpRequest<{ items?: CanvasRun[] }>(`/api/canvases/${encodeURIComponent(canvasId)}/runs`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchCanvasRun(runId: string) {
  const data = await httpRequest<{ item: CanvasRun }>(`/api/canvas-runs/${encodeURIComponent(runId)}`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return data.item;
}

export async function cancelCanvasRun(runId: string) {
  const data = await httpRequest<{ item: CanvasRun }>(`/api/canvas-runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: {},
  });
  return data.item;
}

export async function fetchSettingsConfig() {
  return httpRequest<{ config: SettingsConfig }>("/api/settings");
}

export async function updateSettingsConfig(settings: SettingsConfig) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function updateLoginPageImageSettings(
  settings: LoginPageImageSettings,
  options: { action: "keep" | "replace" | "remove"; file?: File | null },
) {
  const formData = new FormData();
  formData.append("login_page_image_url", settings.login_page_image_url);
  formData.append("login_page_image_mode", settings.login_page_image_mode);
  formData.append("login_page_image_zoom", String(settings.login_page_image_zoom));
  formData.append("login_page_image_position_x", String(settings.login_page_image_position_x));
  formData.append("login_page_image_position_y", String(settings.login_page_image_position_y));
  formData.append("login_page_image_action", options.action);
  if (options.file) {
    formData.append("login_page_image_file", options.file);
  }
  return httpRequest<{ config: SettingsConfig }>("/api/settings/login-page-image", {
    method: "POST",
    body: formData,
  });
}

export async function fetchManagedImages(
  filters: ManagedImageListFilters,
  options: { signal?: AbortSignal } = {},
): Promise<ManagedImageListResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || (key !== "scope" && value === "all")) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== "") params.append(key, String(item));
      });
      continue;
    }
    params.set(key, String(value));
  }
  const data = await httpRequest<{
    items?: ManagedImageSummary[] | null;
    groups?: Array<{ date: string; items: ManagedImageSummary[] }> | null;
    next_cursor?: string | null;
    has_more?: boolean | null;
    page_size?: number | null;
    retention_days?: number | string | null;
    team?: ManagedImageListResult["team"] | null;
    team_storage?: TeamImageStorageSummary | null;
  }>(
    `/api/images${params.toString() ? `?${params.toString()}` : ""}`,
    { signal: options.signal },
  );
  return {
    items: Array.isArray(data.items) ? data.items : [],
    groups: Array.isArray(data.groups) ? data.groups : [],
    next_cursor: typeof data.next_cursor === "string" ? data.next_cursor : "",
    has_more: data.has_more === true,
    page_size: Number(data.page_size ?? filters.page_size ?? 50) || 50,
    retention_days: Math.max(1, Number(data.retention_days) || 7),
    team: data.team || undefined,
    team_storage: data.team_storage || undefined,
  };
}

export async function fetchManagedImageDetail(
  path: string,
  filters: { scope?: ManagedImageListScope; team_id?: string } = {},
  options: { signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams({ path });
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.team_id) params.set("team_id", filters.team_id);
  const data = await httpRequest<{ item: ManagedImageDetail }>(
    `/api/images/detail?${params.toString()}`,
    { signal: options.signal },
  );
  return data.item;
}

export async function uploadManagedImages(
  files: File[],
  visibility: ImageVisibility = "private",
  options: { onUploadProgress?: (progress: { loaded: number; total?: number; progress?: number }) => void } = {},
) {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("image[]", file);
  });
  formData.append("visibility", visibility);
  const data = await httpRequest<{ items?: ManagedImageDetail[] | null }>("/api/images/uploads", {
    method: "POST",
    body: formData,
    onUploadProgress: options.onUploadProgress,
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function updateManagedImageVisibility(
  path: string,
  visibility: ImageVisibility,
  options: { sharePromptParameters?: boolean; shareReferenceImages?: boolean; scope?: ManagedImageListScope; team_id?: string } = {},
) {
  return httpRequest<{ item: Partial<ManagedImageDetail> & { path: string; visibility: ImageVisibility } }>(
    "/api/images/visibility",
    {
      method: "PATCH",
      body: {
        path,
        visibility,
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.team_id ? { team_id: options.team_id } : {}),
        ...(visibility === "public" && options.sharePromptParameters ? { share_prompt_parameters: true } : {}),
        ...(visibility === "public" && options.sharePromptParameters && options.shareReferenceImages ? { share_reference_images: true } : {}),
      },
    },
  );
}

export async function fetchManagedImageTags(filters: { scope?: ManagedImageListScope; team_id?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.team_id) params.set("team_id", filters.team_id);
  const data = await httpRequest<{ tags?: string[] | null }>(
    `/api/images/tags${params.toString() ? `?${params.toString()}` : ""}`,
  );
  return Array.isArray(data.tags) ? data.tags : [];
}

export async function updateManagedImageTags(path: string, tags: string[], options: { scope?: ManagedImageListScope; team_id?: string } = {}) {
  return httpRequest<{ item: Partial<ManagedImageDetail> & { path: string; tags?: string[] }; tags?: string[] | null }>(
    "/api/images/tags",
    {
      method: "PATCH",
      body: { path, tags, ...(options.scope ? { scope: options.scope } : {}), ...(options.team_id ? { team_id: options.team_id } : {}) },
    },
  );
}

export async function deleteManagedImageTag(tag: string, options: { scope?: ManagedImageListScope; team_id?: string } = {}) {
  return httpRequest<{ deleted: number; tag: string; paths: string[] }>("/api/images/tags", {
    method: "DELETE",
    body: { tag, ...(options.scope ? { scope: options.scope } : {}), ...(options.team_id ? { team_id: options.team_id } : {}) },
  });
}

export async function deleteManagedImages(paths: string[], options: { scope?: ManagedImageListScope; team_id?: string } = {}) {
  return httpRequest<{ deleted: number; missing: number; paths: string[]; team_storage?: TeamImageStorageSummary }>("/api/images", {
    method: "DELETE",
    body: { paths, ...(options.scope ? { scope: options.scope } : {}), ...(options.team_id ? { team_id: options.team_id } : {}) },
  });
}

export async function moveManagedImagesToTeamLibrary(paths: string[], teamId: string) {
  return httpRequest<{
    moved: number;
    paths: string[];
    team_id: string;
    required_bytes: number;
    storage?: TeamImageStorageSummary;
  }>("/api/images/library-scope", {
    method: "PATCH",
    body: { paths, target_scope: "team", team_id: teamId },
  });
}

export async function fetchSystemLogs(filters: SystemLogFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || (key !== "view" && value === "all")) {
      continue;
    }
    params.set(key, String(value));
  }
  return httpRequest<{ items: SystemLog[]; view?: LogView | string }>(`/api/logs${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function fetchLogGovernance() {
  return httpRequest<{ governance: LogGovernanceSummary }>("/api/logs/governance");
}

export async function cleanupLogs(retentionDays: number) {
  return httpRequest<{ cleanup: LogCleanupResult; governance: LogGovernanceSummary }>("/api/logs/governance", {
    method: "POST",
    body: { retention_days: retentionDays },
  });
}

export async function fetchCreationTaskDiagnostics(staleSeconds = 600) {
  const params = new URLSearchParams();
  if (staleSeconds > 0) params.set("stale_seconds", String(staleSeconds));
  return httpRequest<{ diagnostics: CreationTaskDiagnosticsSummary }>(
    `/api/admin/creation-tasks/diagnostics${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export async function repairCreationTaskDiagnostics(finalizeActive = false, staleSeconds = 600) {
  return httpRequest<{ repair: CreationTaskRepairResult; diagnostics: CreationTaskDiagnosticsSummary }>(
    "/api/admin/creation-tasks/diagnostics",
    {
      method: "POST",
      body: { finalize_active: finalizeActive, stale_seconds: staleSeconds },
    },
  );
}

export async function fetchImageStorageGovernance() {
  return httpRequest<{ governance: ImageStorageGovernanceSummary }>("/api/images/storage-governance");
}

export async function cleanupImageStorage(body: {
  action: "retention" | "quota" | "thumbnails" | "all";
  retention_days?: number;
  max_mb?: number;
  include_public?: boolean;
  clear_thumbnails?: boolean;
}) {
  return httpRequest<{ cleanup: ImageStorageCleanupResult; governance: ImageStorageGovernanceSummary }>(
    "/api/images/storage-governance",
    {
      method: "POST",
      body,
    },
  );
}

export async function checkSystemUpdates(force = false) {
  const params = new URLSearchParams();
  if (force) {
    params.set("force", "true");
  }
  return httpRequest<SystemUpdateInfo>(`/api/admin/system/check-updates${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function performSystemUpdate() {
  return httpRequest<SystemUpdateResult>("/api/admin/system/update", {
    method: "POST",
    body: {},
  });
}

export async function rollbackSystemUpdate() {
  return httpRequest<SystemUpdateResult>("/api/admin/system/rollback", {
    method: "POST",
    body: {},
  });
}

export async function restartSystemService() {
  return httpRequest<{ message: string }>("/api/admin/system/restart", {
    method: "POST",
    body: {},
  });
}

export async function fetchUserKeys() {
  return httpRequest<{ items: UserKey[] }>("/api/auth/users");
}

export async function createUserKey(name: string) {
  return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/auth/users", {
    method: "POST",
    body: { name },
  });
}

export async function revealUserKey(keyId: string) {
  return httpRequest<{ key: string }>(`/api/auth/users/${keyId}/key`);
}

export async function updateUserKey(keyId: string, updates: { enabled?: boolean; name?: string }) {
  return httpRequest<{ item: UserKey; items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteUserKey(keyId: string) {
  return httpRequest<{ items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "DELETE",
  });
}

function profileAPIKeyPath(keyId: string) {
  return `/api/profile/api-key/${encodeURIComponent(keyId)}`;
}

export async function fetchProfileAPIKey() {
  return httpRequest<{ items: UserKey[] }>("/api/profile/api-key");
}

export async function upsertProfileAPIKey(name: string) {
  return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/profile/api-key", {
    method: "POST",
    body: { name },
  });
}

export async function revealProfileAPIKey(keyId: string) {
  return httpRequest<{ key: string }>(`${profileAPIKeyPath(keyId)}/key`);
}

export async function updateProfileAPIKey(keyId: string, updates: { enabled?: boolean; name?: string }) {
  return httpRequest<{ item: UserKey; items: UserKey[] }>(profileAPIKeyPath(keyId), {
    method: "POST",
    body: updates,
  });
}

export async function deleteProfileAPIKey(keyId: string) {
  return httpRequest<{ items: UserKey[] }>(profileAPIKeyPath(keyId), {
    method: "DELETE",
  });
}

export async function updateProfileName(name: string) {
  return httpRequest<LoginResponse>("/api/profile", {
    method: "POST",
    body: { name },
  });
}

export async function changeProfilePassword(currentPassword: string, newPassword: string) {
  return httpRequest<{ ok: boolean }>("/api/profile/password", {
    method: "POST",
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
}

function managedUserPath(userId: string) {
  return `/api/admin/users/${encodeURIComponent(userId)}`;
}

export async function fetchManagedUsers(query: ManagedUsersQuery = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.provider && query.provider !== "all") params.set("provider", query.provider);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.sort_by) params.set("sort_by", query.sort_by);
  if (query.sort_order) params.set("sort_order", query.sort_order);
  const data = await httpRequest<Partial<ManagedUsersResponse>>(
    `/api/admin/users${params.toString() ? `?${params.toString()}` : ""}`,
    { signal: query.signal },
  );
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: Number(data.total ?? data.items?.length ?? 0),
    page: Number(data.page ?? query.page ?? 1),
    page_size: Number(data.page_size ?? query.page_size ?? 20),
    total_pages: Number(data.total_pages ?? 1),
  };
}

export async function fetchManagedUser(userId: string) {
  return httpRequest<{ item: ManagedUser }>(managedUserPath(userId));
}

export async function fetchPermissionCatalog() {
  return httpRequest<{ menus: PermissionMenu[]; apis: ApiPermission[] }>("/api/admin/permissions");
}

function managedRolePath(roleId: string) {
  return `/api/admin/roles/${encodeURIComponent(roleId)}`;
}

export async function fetchManagedRoles() {
  return httpRequest<{ items: ManagedRole[] }>("/api/admin/roles");
}

export async function createManagedRole(updates: {
  name: string;
  description?: string;
  menu_paths?: string[];
  api_permissions?: string[];
}) {
  return httpRequest<{ item: ManagedRole; items: ManagedRole[] }>("/api/admin/roles", {
    method: "POST",
    body: updates,
  });
}

export async function updateManagedRole(
  roleId: string,
  updates: { name?: string; description?: string; menu_paths?: string[]; api_permissions?: string[] },
) {
  return httpRequest<{ item: ManagedRole; items: ManagedRole[] }>(managedRolePath(roleId), {
    method: "POST",
    body: updates,
  });
}

export async function deleteManagedRole(roleId: string) {
  return httpRequest<{ items: ManagedRole[] }>(managedRolePath(roleId), {
    method: "DELETE",
  });
}

export async function createManagedUser(payload: CreateManagedUserPayload) {
  return httpRequest<{ item: ManagedUser; items?: ManagedUser[] } & Partial<ManagedUsersResponse>>("/api/admin/users", {
    method: "POST",
    body: payload,
  });
}

export async function updateManagedUser(
  userId: string,
  updates: { enabled?: boolean; name?: string; role_id?: string; billing?: BillingAdjustmentPayload },
) {
  return httpRequest<{ item: ManagedUser; items?: ManagedUser[] } & Partial<ManagedUsersResponse>>(managedUserPath(userId), {
    method: "POST",
    body: updates,
  });
}

export async function fetchBillingAdjustments(userId: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return httpRequest<{ items: BillingAdjustment[] }>(`${managedUserPath(userId)}/billing-adjustments?${params.toString()}`);
}

export async function createBillingAdjustment(userId: string, payload: BillingAdjustmentPayload) {
  return httpRequest<
    { item?: ManagedUser; billing?: BillingState; adjustment?: BillingAdjustment; items?: ManagedUser[] } & Partial<ManagedUsersResponse>
  >(`${managedUserPath(userId)}/billing-adjustments`, {
    method: "POST",
    body: payload,
  });
}

export async function createBulkBillingAdjustment(payload: BulkBillingAdjustmentPayload) {
  return httpRequest<
    {
      results?: BulkBillingAdjustmentResult[];
      summary?: BulkBillingAdjustmentSummary;
      items?: ManagedUser[];
    } & Partial<ManagedUsersResponse>
  >("/api/admin/users/billing-adjustments/bulk", {
    method: "POST",
    body: payload,
  });
}

export async function revealManagedUserKey(userId: string) {
  return httpRequest<{ key: string }>(`${managedUserPath(userId)}/key`);
}

export async function resetManagedUserKey(userId: string, name?: string) {
  return httpRequest<{ item: ManagedUser; api_key: UserKey; key: string; items?: ManagedUser[] } & Partial<ManagedUsersResponse>>(
    `${managedUserPath(userId)}/reset-key`,
    {
      method: "POST",
      body: { name: name ?? "" },
    },
  );
}

export async function deleteManagedUser(userId: string) {
  return httpRequest<{ items?: ManagedUser[] } & Partial<ManagedUsersResponse>>(managedUserPath(userId), {
    method: "DELETE",
  });
}

export async function fetchRegisterConfig() {
  return httpRequest<{ register: RegisterConfig }>("/api/register");
}

export async function updateRegisterConfig(updates: Partial<RegisterConfig>) {
  return httpRequest<{ register: RegisterConfig }>("/api/register", {
    method: "POST",
    body: updates,
  });
}

export async function startRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/start", { method: "POST" });
}

export async function stopRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/stop", { method: "POST" });
}

export async function resetRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/reset", { method: "POST" });
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools() {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools");
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

export async function fetchCPAPoolImportJob(poolId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`);
}

// ── Sub2API ────────────────────────────────────────────────────────

export type Sub2APIServer = {
  id: string;
  name: string;
  base_url: string;
  email: string;
  has_api_key: boolean;
  group_id: string;
  import_job?: CPAImportJob | null;
};

export type Sub2APIRemoteAccount = {
  id: string;
  name: string;
  email: string;
  plan_type: string;
  status: string;
  expires_at: string;
  has_refresh_token: boolean;
};

export type Sub2APIRemoteGroup = {
  id: string;
  name: string;
  description: string;
  platform: string;
  status: string;
  account_count: number;
  active_account_count: number;
};

export async function fetchSub2APIServers() {
  const data = await httpRequest<{ servers?: Sub2APIServer[] | null }>("/api/sub2api/servers");
  return {
    servers: Array.isArray(data.servers) ? data.servers : [],
  };
}

export async function createSub2APIServer(server: {
  name: string;
  base_url: string;
  email: string;
  password: string;
  api_key: string;
  group_id: string;
}) {
  const data = await httpRequest<{ server: Sub2APIServer; servers?: Sub2APIServer[] | null }>("/api/sub2api/servers", {
    method: "POST",
    body: server,
  });
  return {
    server: data.server,
    servers: Array.isArray(data.servers) ? data.servers : [],
  };
}

export async function updateSub2APIServer(
  serverId: string,
  updates: {
    name?: string;
    base_url?: string;
    email?: string;
    password?: string;
    api_key?: string;
    group_id?: string;
  },
) {
  const data = await httpRequest<{ server: Sub2APIServer; servers?: Sub2APIServer[] | null }>(`/api/sub2api/servers/${serverId}`, {
    method: "POST",
    body: updates,
  });
  return {
    server: data.server,
    servers: Array.isArray(data.servers) ? data.servers : [],
  };
}

export async function fetchSub2APIServerGroups(serverId: string) {
  const data = await httpRequest<{ server_id: string; groups?: Sub2APIRemoteGroup[] | null }>(
    `/api/sub2api/servers/${serverId}/groups`,
  );
  return {
    server_id: data.server_id,
    groups: Array.isArray(data.groups) ? data.groups : [],
  };
}

export async function deleteSub2APIServer(serverId: string) {
  const data = await httpRequest<{ servers?: Sub2APIServer[] | null }>(`/api/sub2api/servers/${serverId}`, {
    method: "DELETE",
  });
  return {
    servers: Array.isArray(data.servers) ? data.servers : [],
  };
}

export async function fetchSub2APIServerAccounts(serverId: string) {
  const data = await httpRequest<{ server_id: string; accounts?: Sub2APIRemoteAccount[] | null }>(
    `/api/sub2api/servers/${serverId}/accounts`,
  );
  return {
    server_id: data.server_id,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
  };
}

export async function startSub2APIImport(serverId: string, accountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`, {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function fetchSub2APIImportJob(serverId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`);
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function fetchProxy() {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy");
}

export async function updateProxy(updates: { enabled?: boolean; url?: string }) {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy", {
    method: "POST",
    body: updates,
  });
}

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}
