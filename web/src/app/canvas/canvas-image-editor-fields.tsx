import type { ReactNode } from "react";

export function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-500">{title}</div>
      {children}
    </section>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-muted-foreground dark:text-slate-500">{label}</span>
      <input
        className="h-8 w-full rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
