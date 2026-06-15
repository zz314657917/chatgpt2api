"use client";

import { Badge } from "@/components/ui/badge";
import { splitOfficialBatch } from "@/lib/pro-studio";

export function BatchJobPreview({ total }: { total: number }) {
  const plan = splitOfficialBatch(total);
  return (
    <div className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
      <div className="mb-1 font-bold text-foreground">将创建 {plan.length} 个任务，共 {Math.max(1, Math.floor(total))} 张图</div>
      <div className="flex flex-wrap gap-1">
        {plan.map((count, index) => (
          <Badge key={`${index}-${count}`} variant="secondary" className="rounded-md px-1.5 py-0 text-[10px]">
            任务 {index + 1}: {count} 张
          </Badge>
        ))}
      </div>
    </div>
  );
}
