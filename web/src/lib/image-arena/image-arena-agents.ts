import type { GeminiFlashSettingsPayload, ImageModel, MidjourneySettingsPayload } from "@/lib/api";
import { compactImageModelSettings, type ImageModelSettingsState } from "@/lib/image-model-settings";
import type { ImageTaskToolOptions } from "@/lib/image-task-request";

export type ImageArenaAgentMode = "chat" | "image";

export type ImageArenaAgentOption = {
  value: ImageModel;
  label: string;
  familyId: string;
};

export type ImageArenaAgentSlotDraft = {
  id: string;
  model: ImageModel;
  modelLabel: string;
  familyId: string;
  imageModelSettings?: ImageModelSettingsState;
  midjourneySettings?: MidjourneySettingsPayload;
  geminiFlashSettings?: GeminiFlashSettingsPayload;
  officialImageSettings?: ImageTaskToolOptions;
  geminiProSettings?: ImageTaskToolOptions;
};

export const IMAGE_ARENA_MAX_AGENT_SLOTS = 4;
export const IMAGE_ARENA_AGENT_SELECTION_STORAGE_KEY = "chatgpt2api:image_arena_agent_slots";

const IMAGE_MODEL_FAMILIES: Record<string, string> = {
  "gpt-image-2": "image:gpt-image-2",
  "gpt-image-2-official": "image:gpt-image-2",
  "gemini-3.1-flash-image-preview": "image:gemini-3.1-flash",
  "gemini-3.1-flash-image-preview-official": "image:gemini-3.1-flash",
  "gemini-3-pro-image-preview": "image:gemini-3-pro",
  "gemini-3-pro-image-preview-official": "image:gemini-3-pro",
};

const CHAT_MODEL_FAMILIES: Record<string, string> = {
  "gpt-5.5": "chat:gpt-5.5",
  "gpt-5.4": "chat:gpt-5.4",
  "gpt-5.4-mini": "chat:gpt-5.4",
};

const DEFAULT_CHAT_MODEL_ORDER: ImageModel[] = ["gpt-5.4", "gpt-5.5", "gpt-5.4-mini"];
const DEFAULT_IMAGE_MODEL_ORDER: ImageModel[] = ["gpt-image-2-official", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gpt-image-2"];

export function imageArenaModelFamily(mode: ImageArenaAgentMode, model: ImageModel | string) {
  const key = String(model || "");
  return mode === "image" ? IMAGE_MODEL_FAMILIES[key] || `image:${key}` : CHAT_MODEL_FAMILIES[key] || `chat:${key}`;
}

export function imageArenaAgentOptions(
  mode: ImageArenaAgentMode,
  options: Array<{ value: ImageModel; label: string }>,
): ImageArenaAgentOption[] {
  return options.map((option) => ({
    ...option,
    familyId: imageArenaModelFamily(mode, option.value),
  }));
}

function uniqueByFamily(options: ImageArenaAgentOption[]) {
  const seen = new Set<string>();
  const selected: ImageArenaAgentOption[] = [];
  for (const option of options) {
    if (seen.has(option.familyId)) {
      continue;
    }
    seen.add(option.familyId);
    selected.push(option);
  }
  return selected;
}

function preferredOptions(mode: ImageArenaAgentMode, options: ImageArenaAgentOption[]) {
  const order = mode === "image" ? DEFAULT_IMAGE_MODEL_ORDER : DEFAULT_CHAT_MODEL_ORDER;
  const ordered = order.flatMap((model) => options.find((option) => option.value === model) || []);
  const remaining = options.filter((option) => !ordered.some((item) => item.value === option.value));
  return [...ordered, ...remaining];
}

function createSlot(option: ImageArenaAgentOption, index: number): ImageArenaAgentSlotDraft {
  return {
    id: `arena-slot-${index + 1}`,
    model: option.value,
    modelLabel: option.label,
    familyId: option.familyId,
  };
}

export function defaultImageArenaAgentSlots(
  mode: ImageArenaAgentMode,
  options: Array<{ value: ImageModel; label: string }>,
): ImageArenaAgentSlotDraft[] {
  return uniqueByFamily(preferredOptions(mode, imageArenaAgentOptions(mode, options)))
    .slice(0, 2)
    .map(createSlot);
}

export function sanitizeImageArenaAgentSlots(input: {
  mode: ImageArenaAgentMode;
  slots: Array<Partial<ImageArenaAgentSlotDraft> | null | undefined>;
  options: Array<{ value: ImageModel; label: string }>;
}): ImageArenaAgentSlotDraft[] {
  const optionMap = new Map(imageArenaAgentOptions(input.mode, input.options).map((option) => [option.value, option]));
  const seenFamilies = new Set<string>();
  const slots: ImageArenaAgentSlotDraft[] = [];
  for (const slot of input.slots) {
    if (!slot || !slot.model || slots.length >= IMAGE_ARENA_MAX_AGENT_SLOTS) {
      continue;
    }
    const option = optionMap.get(slot.model);
    if (!option || seenFamilies.has(option.familyId)) {
      continue;
    }
    seenFamilies.add(option.familyId);
    const imageModelSettings = compactImageModelSettings({
      midjourney: slot.imageModelSettings?.midjourney || slot.midjourneySettings,
      geminiFlash: slot.imageModelSettings?.geminiFlash || slot.geminiFlashSettings,
      officialImage: slot.imageModelSettings?.officialImage || slot.officialImageSettings,
      geminiPro: slot.imageModelSettings?.geminiPro || slot.geminiProSettings,
    });
    slots.push({
      id: slot.id || `arena-slot-${slots.length + 1}`,
      model: option.value,
      modelLabel: option.label,
      familyId: option.familyId,
      imageModelSettings,
      midjourneySettings: imageModelSettings?.midjourney || slot.midjourneySettings,
      geminiFlashSettings: imageModelSettings?.geminiFlash || slot.geminiFlashSettings,
      officialImageSettings: imageModelSettings?.officialImage || slot.officialImageSettings,
      geminiProSettings: imageModelSettings?.geminiPro || slot.geminiProSettings,
    });
  }
  return slots.length > 0 ? slots : defaultImageArenaAgentSlots(input.mode, input.options).slice(0, 1);
}

export function hasImageArenaFamilyConflict(slots: Array<{ familyId: string }>) {
  const families = slots.map((slot) => slot.familyId).filter(Boolean);
  return new Set(families).size !== families.length;
}
