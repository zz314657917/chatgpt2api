import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Upload } from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchManagedImageDetail,
  fetchManagedImages,
  fetchTeamWorkspace,
  uploadManagedImages,
  type BeadAssetReference,
  type ManagedImageSummary,
  type TeamSummary,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";

export type BeadAssetSelection = {
  reference: BeadAssetReference;
  file: File;
  imageUrl: string;
};

type AssetScope = "mine" | "team";

type BeadAssetPickerProps = {
  open: boolean;
  kind: "source" | "reference";
  canUseTeamAssets: boolean;
  canUploadImages: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: BeadAssetSelection) => void;
};

function titleForKind(kind: BeadAssetPickerProps["kind"]) {
  return kind === "source" ? "选择转换原图" : "选择临摹参考图";
}

function referenceFor(
  item: ManagedImageSummary,
  scope: AssetScope,
  team?: TeamSummary | null,
): BeadAssetReference {
  return scope === "team"
    ? { path: item.path, name: item.name || "团队素材", scope, team_id: team?.id }
    : { path: item.path, name: item.name || "个人素材", scope };
}

function isImageFile(file: File) {
  return /^image\/(png|jpeg|jpg|webp)$/i.test(file.type);
}

export function BeadAssetPicker({
  open,
  kind,
  canUseTeamAssets,
  canUploadImages,
  onOpenChange,
  onSelect,
}: BeadAssetPickerProps) {
  const [scope, setScope] = useState<AssetScope>("mine");
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [items, setItems] = useState<ManagedImageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState("");
  const [message, setMessage] = useState("");
  const selectionRequestRef = useRef(0);

  function invalidateSelection() {
    selectionRequestRef.current += 1;
    setSelecting("");
  }

  function closePicker() {
    invalidateSelection();
    onOpenChange(false);
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetchTeamWorkspace()
      .then((workspace) => {
        if (!active) return;
        setTeams(workspace.teams);
        const activeTeam = workspace.scope.type === "team"
          ? workspace.teams.find((item) => item.id === workspace.scope.team_id) ?? null
          : workspace.teams[0] ?? null;
        setTeam(activeTeam);
      })
      .catch(() => {
        if (active) {
          setTeams([]);
          setTeam(null);
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || (scope === "team" && !team?.id)) {
      setItems([]);
      return;
    }
    let active = true;
    setLoading(true);
    setMessage("");
    void fetchManagedImages({
      scope,
      ...(scope === "team" ? { team_id: team?.id } : {}),
      page_size: 48,
    })
      .then((result) => active && setItems(result.items))
      .catch((error) => active && setMessage(error instanceof Error ? error.message : "加载素材失败"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, scope, team?.id]);

  async function selectItem(item: ManagedImageSummary) {
    if (scope === "team" && !team?.id) return;
    const selectedTeam = team;
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    const isCurrentRequest = () => requestId === selectionRequestRef.current;
    setSelecting(item.path);
    setMessage("");
    try {
      const filters = scope === "team" && selectedTeam
        ? { scope, team_id: selectedTeam.id }
        : { scope };
      const detail = await fetchManagedImageDetail(item.path, filters);
      const imageUrl = detail.url || detail.preview_url || detail.thumbnail_url || "";
      if (!imageUrl) throw new Error("素材原图不可用");
      const blob = await fetchAuthenticatedImageBlob(imageUrl);
      const file = new File([blob], detail.name || item.name || "bead-source.png", {
        type: blob.type || "image/png",
      });
      if (!isCurrentRequest()) return;
      onSelect({ reference: referenceFor(item, scope, selectedTeam), file, imageUrl });
      closePicker();
    } catch (error) {
      if (isCurrentRequest()) {
        setMessage(error instanceof Error ? error.message : "读取素材失败");
      }
    } finally {
      if (isCurrentRequest()) setSelecting("");
    }
  }

  async function uploadFile(file: File) {
    if (!isImageFile(file)) {
      setMessage("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    const isCurrentRequest = () => requestId === selectionRequestRef.current;
    setSelecting("upload");
    setMessage("");
    try {
      const uploaded = await uploadManagedImages([file], "private");
      const item = uploaded[0];
      if (!item) throw new Error("上传图片失败");
      if (!isCurrentRequest()) return;
      onSelect({
        reference: { path: item.path, name: item.name || file.name, scope: "mine" },
        file,
        imageUrl: item.url || item.preview_url || item.thumbnail_url || URL.createObjectURL(file),
      });
      closePicker();
    } catch (error) {
      if (isCurrentRequest()) {
        setMessage(error instanceof Error ? error.message : "上传图片失败");
      }
    } finally {
      if (isCurrentRequest()) setSelecting("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) invalidateSelection();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[86dvh] max-w-3xl overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>{titleForKind(kind)}</DialogTitle>
          <DialogDescription>素材以鉴权方式读取，工程仅保存素材库引用。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={scope === "mine" ? "default" : "outline"} size="sm" onClick={() => setScope("mine")}>个人素材</Button>
          {canUseTeamAssets && teams.length > 0 ? (
            <Button variant={scope === "team" ? "default" : "outline"} size="sm" onClick={() => setScope("team")}>团队素材</Button>
          ) : null}
          {scope === "team" && teams.length > 1 ? (
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={team?.id || ""}
              aria-label="选择团队素材库"
              onChange={(event) => setTeam(teams.find((item) => item.id === event.target.value) ?? null)}
            >
              {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : null}
          {canUploadImages ? (
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Upload className="size-4" /> 上传个人图片
              <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadFile(file);
                event.currentTarget.value = "";
              }} />
            </label>
          ) : null}
        </div>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        {loading ? (
          <div className="grid min-h-48 place-items-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />正在加载素材</div>
        ) : items.length === 0 ? (
          <div className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground"><ImagePlus className="mb-2 size-5" />此范围暂无图片素材</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.path}
                type="button"
                className="overflow-hidden rounded-md border border-border text-left transition-colors hover:border-primary disabled:opacity-60"
                disabled={Boolean(selecting)}
                onClick={() => void selectItem(item)}
              >
                <AuthenticatedImage src={item.thumbnail_url || item.preview_url || ""} alt={item.name || "素材图片"} className="aspect-square w-full object-cover" />
                <span className="block truncate px-2 py-1.5 text-xs">{selecting === item.path ? "正在读取" : item.name || "未命名图片"}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
