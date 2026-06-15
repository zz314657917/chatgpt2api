"use client";

import { Badge } from "@/components/ui/badge";
import { proStudioPresetByIntent } from "@/lib/pro-studio";
import type { ProStudioPayloadMeta, ProStudioOfficialSettingsPayload } from "@/lib/pro-studio";

export function ProStudioBadge({
  proStudio,
  officialSettings,
  compact = false,
}: {
  proStudio?: ProStudioPayloadMeta;
  officialSettings?: ProStudioOfficialSettingsPayload;
  compact?: boolean;
}) {
  if (!proStudio?.enabled) {
    return null;
  }
  const preset = proStudioPresetByIntent(proStudio.intent);
  const parts = compact
    ? ["Official", officialSettings?.resolution?.toUpperCase(), preset.label].filter(Boolean)
    : ["Official", officialSettings?.resolution?.toUpperCase(), officialSettings?.quality, officialSettings?.size, preset.label].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {parts.map((part) => (
        <Badge key={part} variant="secondary" className="max-w-full truncate rounded-md px-1.5 py-0 text-[10px] font-black">
          {part}
        </Badge>
      ))}
    </div>
  );
}
