import { OFFICIAL_IMAGE_LIMITS } from "./official-image-capabilities";

export function splitOfficialBatch(totalOutputs: number, maxPerTask = OFFICIAL_IMAGE_LIMITS.maxN) {
  const tasks: number[] = [];
  let remaining = Math.max(1, Math.floor(totalOutputs));
  const limit = Math.max(1, Math.floor(maxPerTask));
  while (remaining > 0) {
    const n = Math.min(limit, remaining);
    tasks.push(n);
    remaining -= n;
  }
  return tasks;
}
