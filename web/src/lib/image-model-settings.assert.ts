import assert from "node:assert/strict";

import {
  defaultImageModelSettings,
  imageModelHasSettings,
  imageModelSettingsSummary,
  imageModelSettingsToTaskFields,
  normalizeImageModelSettings,
} from "@/lib/image-model-settings";

const midjourneyDefault = defaultImageModelSettings("midjourney").midjourney;
assert.equal(midjourneyDefault?.version, "8.1");
assert.equal(midjourneyDefault?.speed, "relax");
assert.equal(midjourneyDefault?.stylize, 100);
assert.equal(midjourneyDefault?.stop, undefined);

const midjourneyV61 = normalizeImageModelSettings("midjourney", {
  midjourney: { version: "6.1", stop: 80, stylize: 1200, chaos: -1 },
}).midjourney;
assert.equal(midjourneyV61?.stop, 80);
assert.equal(midjourneyV61?.stylize, 1000);
assert.equal(midjourneyV61?.chaos, 0);

const midjourneyV81Fields = imageModelSettingsToTaskFields("midjourney", {
  midjourney: { version: "8.1", stop: 80, seed: 123, extra: "--foo", repeat: 1, draft: true, hd: true } as unknown as NonNullable<ReturnType<typeof defaultImageModelSettings>["midjourney"]>,
}).extraBody?.midjourney_settings as Record<string, unknown>;
assert.equal(midjourneyV81Fields.version, "8.1");
assert.equal(midjourneyV81Fields.stop, undefined);
assert.equal(midjourneyV81Fields.seed, 123);
assert.equal(midjourneyV81Fields.extra, "--foo");
assert.equal(midjourneyV81Fields.repeat, undefined);
assert.equal(midjourneyV81Fields.draft, true);
assert.equal(midjourneyV81Fields.hd, true);

const midjourneyNijiFields = imageModelSettingsToTaskFields("midjourney", {
  midjourney: { version: "8.1", niji: true, stop: 80 },
}).extraBody?.midjourney_settings as Record<string, unknown>;
assert.equal(midjourneyNijiFields.version, "7");
assert.equal(midjourneyNijiFields.niji, true);
assert.equal(midjourneyNijiFields.stop, undefined);

const geminiFlashFields = imageModelSettingsToTaskFields("gemini-3.1-flash-image-preview", {
  geminiFlash: { google_image_search: true },
}).extraBody as Record<string, unknown>;
assert.equal(geminiFlashFields.google_search, true);
assert.equal(geminiFlashFields.google_image_search, true);

const geminiFlashNoSearch = imageModelSettingsToTaskFields("gemini-3.1-flash-image-preview", {
  geminiFlash: { google_search: false, google_image_search: false },
}).extraBody as Record<string, unknown>;
assert.equal(geminiFlashNoSearch.google_search, false);
assert.equal(geminiFlashNoSearch.google_image_search, false);
assert.equal(imageModelSettingsSummary("gemini-3.1-flash-image-preview", {
  geminiFlash: { google_search: false, google_image_search: false },
}), "关闭搜索");

const officialFields = imageModelSettingsToTaskFields("gpt-image-2-official", {
  officialImage: { background: "transparent", moderation: "low", inputImageMask: "https://cdn.example/mask.png" },
});
assert.equal(officialFields.toolOptions?.background, "transparent");
assert.equal(officialFields.toolOptions?.moderation, "low");
assert.equal(officialFields.toolOptions?.inputImageMask, "https://cdn.example/mask.png");
assert.equal(officialFields.extraBody?.mask_url, "https://cdn.example/mask.png");

const geminiProFields = imageModelSettingsToTaskFields("gemini-3-pro-image-preview", {
  geminiPro: { inputImageMask: "https://cdn.example/pro-mask.png" },
});
assert.equal(geminiProFields.toolOptions?.inputImageMask, "https://cdn.example/pro-mask.png");
assert.equal(geminiProFields.extraBody?.input_image_mask, "https://cdn.example/pro-mask.png");

assert.equal(imageModelHasSettings("grok-imagine-1.5"), false);
assert.equal(imageModelSettingsSummary("gemini-3-pro-image-preview", {}), "可设置遮罩");
