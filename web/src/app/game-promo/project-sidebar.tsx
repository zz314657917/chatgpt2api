import { useRef, useState } from "react";
import { ChevronLeft, Copy, FolderOpen, PanelLeftOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { canApproveHero, DESIGNS } from "@/lib/game-promo/core";
import { selectedVersion } from "@/lib/game-promo/tasks";
import type { PromoProject } from "@/store/game-promo-projects";

const RAIL_PREFERENCE = "chatgpt2api.game-promo.project-rail-collapsed";

type ProjectSidebarProps = {
  projects: PromoProject[];
  selected: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCopy: (project: PromoProject) => void;
  onDelete: (project: PromoProject) => void;
  onRename: (id: string, title: string) => void;
};

function ProjectList({ projects, selected, busy, onSelect, onCreate, onCopy, onDelete, onRename }: ProjectSidebarProps) {
  const [editing, setEditing] = useState("");
  const [title, setTitle] = useState("");
  function commitRename() {
    if (!editing) return;
    onRename(editing, title.trim() || "未命名游戏推广");
    setEditing("");
  }
  return <>
    <Button className="mx-1 mb-4" disabled={busy} onClick={onCreate}><Plus className="size-4" />新建项目</Button>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-3" aria-label="游戏推广项目列表">
      {projects.map((project) => {
        const completed = DESIGNS.filter((design) => canApproveHero(selectedVersion(project, design.id))).length;
        return <article key={project.id} className={cn("rounded-2xl border p-3 transition-colors", selected === project.id ? "border-border bg-background shadow-sm" : "border-transparent hover:border-border/70 hover:bg-background/70")}>
          {editing === project.id ? <Input
            aria-label="项目名称"
            autoFocus
            className="mb-2 h-8 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); commitRename(); }
              if (event.key === "Escape") { event.preventDefault(); setEditing(""); }
            }}
          /> : <button
            type="button"
            disabled={busy}
            className="block w-full min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-current={selected === project.id ? "true" : undefined}
            onClick={() => onSelect(project.id)}
          >
            <span className="block truncate text-sm font-semibold" title={project.title}>{project.title || "未命名游戏推广"}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{completed}/9 设计 · {project.references.length} 张参考图</span>
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">{project.copyConfirmed ? "文案已确认" : "文案待确认"} · {new Date(project.updatedAt).toLocaleDateString()}</span>
          </button>}
          <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
            <Button size="sm" variant="ghost" disabled={busy} aria-label={`重命名 ${project.title}`} title="重命名" onClick={() => { setTitle(project.title); setEditing(project.id); }}><Pencil className="size-3.5" /><span className="text-xs">重命名</span></Button>
            <Button size="icon" variant="ghost" className="ml-auto size-8" disabled={busy} aria-label={`复制 ${project.title}`} title="复制项目" onClick={() => onCopy(project)}><Copy className="size-3.5" /></Button>
            <Button size="icon" variant="ghost" className="size-8 hover:bg-destructive/10 hover:text-destructive" disabled={busy} aria-label={`删除 ${project.title}`} title="删除项目" onClick={() => onDelete(project)}><Trash2 className="size-3.5" /></Button>
          </div>
        </article>;
      })}
    </div>
  </>;
}

export function ProjectSidebar(props: ProjectSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(RAIL_PREFERENCE) !== "false"; }
    catch { return true; }
  });
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const pointerInside = useRef(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const expanded = !collapsed || hoverExpanded;
  function rememberCollapsed(next: boolean) {
    setCollapsed(next);
    setHoverExpanded(false);
    try { localStorage.setItem(RAIL_PREFERENCE, String(next)); }
    catch { /* Storage may be unavailable; keep the current session preference. */ }
    if (next) requestAnimationFrame(() => expandButton.current?.focus());
  }
  return <aside
    aria-label="项目导航"
    data-project-rail=""
    data-expanded={expanded}
    className={cn("hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-card/70 py-5 transition-[width] duration-300 lg:flex", expanded ? "w-[276px] px-3" : "w-[68px] px-2")}
    onMouseEnter={() => { pointerInside.current = true; if (collapsed) setHoverExpanded(true); }}
    onMouseLeave={(event) => {
      pointerInside.current = false;
      if (!event.currentTarget.contains(document.activeElement)) setHoverExpanded(false);
    }}
    onBlur={(event) => {
      if (!pointerInside.current && !event.currentTarget.contains(event.relatedTarget)) setHoverExpanded(false);
    }}
  >
    <div className={cn("mb-5 flex items-center gap-2", expanded ? "px-1" : "justify-center")}>
      <Button
        ref={expandButton}
        size="icon"
        variant="ghost"
        className="size-10 shrink-0 rounded-2xl bg-primary/10 text-primary"
        aria-label={collapsed ? "固定展开项目列表" : "项目列表已固定展开"}
        aria-expanded={expanded}
        title={collapsed ? "固定展开项目列表" : "游戏推广项目"}
        onClick={() => rememberCollapsed(false)}
      ><FolderOpen className="size-5" /></Button>
      {expanded ? <>
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">推广项目</h2><p className="text-xs text-muted-foreground">{props.projects.length} 个项目</p></div>
        <Button size="icon" variant="ghost" className="size-8" aria-label="收起项目列表" title="收起项目列表" onClick={() => rememberCollapsed(true)}><ChevronLeft className="size-4" /></Button>
      </> : null}
    </div>
    {expanded ? <ProjectList {...props} /> : <div className="flex flex-col items-center gap-4">
      <Button size="icon" variant="ghost" disabled={props.busy} aria-label="新建项目" title="新建项目" onClick={props.onCreate}><Plus className="size-5" /></Button>
      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground" title={`${props.projects.length} 个项目`}>{props.projects.length}</span>
    </div>}
  </aside>;
}

export function MobileProjectDrawer(props: ProjectSidebarProps) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="lg:hidden"><PanelLeftOpen className="size-4" />项目 ({props.projects.length})</Button></DialogTrigger>
    <DialogContent className="inset-y-0 left-0 flex h-dvh w-[min(88vw,320px)] translate-x-0 translate-y-0 flex-col gap-0 rounded-l-none rounded-r-2xl p-4">
      <div className="mb-5 pr-6"><DialogTitle className="text-base">推广项目</DialogTitle><DialogDescription className="mt-1">{props.projects.length} 个项目 · 选择项目开始编辑</DialogDescription></div>
      <ProjectList {...props} onSelect={(id) => { props.onSelect(id); setOpen(false); }} onCreate={() => { props.onCreate(); setOpen(false); }} onCopy={(project) => { props.onCopy(project); setOpen(false); }} />
    </DialogContent>
  </Dialog>;
}
