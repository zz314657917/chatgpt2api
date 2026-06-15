"use client";

import { LoaderCircle, MessageSquarePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getImageConversationStats, type ImageConversation } from "@/store/image-conversations";

type ImageSidebarProps = {
  conversations: ImageConversation[];
  isLoadingHistory: boolean;
  selectedConversationId: string | null;
  onCreateDraft: () => void;
  onClearHistory: () => void | Promise<void>;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
  hideActionButtons?: boolean;
};

export function ImageSidebar({
  conversations,
  isLoadingHistory,
  selectedConversationId,
  onCreateDraft,
  onClearHistory,
  onSelectConversation,
  onDeleteConversation,
  formatConversationTime,
  hideActionButtons = false,
}: ImageSidebarProps) {
  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-2 py-1 sm:gap-3 sm:py-2">
        {!hideActionButtons && (
          <div className="flex items-center gap-2">
            <Button className="h-10 flex-1 rounded-full" onClick={onCreateDraft}>
              <MessageSquarePlus className="size-4" />
              新建对话
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-full border-[#e5e7eb] bg-white px-3 text-[#45515e] hover:bg-black/[0.05]"
              onClick={() => void onClearHistory()}
              disabled={conversations.length === 0}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(142,142,147,.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#8e8e93]/45 [&::-webkit-scrollbar-track]:bg-transparent",
            hideActionButtons ? "flex flex-col gap-1 pr-0" : "flex flex-col gap-2 pr-1",
          )}
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-stone-500">
              <LoaderCircle className="size-4 animate-spin" />
              正在读取会话记录
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-3 text-sm leading-6 text-stone-500">还没有图片记录，输入提示词后会在这里显示。</div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === selectedConversationId;
              const stats = getImageConversationStats(conversation);
              const metaLabel = `${conversation.turns.length} 轮 · ${formatConversationTime(conversation.updatedAt)}`;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group relative w-full rounded-lg border text-left transition",
                    hideActionButtons ? "px-3 py-2" : "px-2.5 py-1.5",
                    active
                      ? "border-transparent bg-[#e9ebef] text-[#18181b]"
                      : "border-transparent text-[#45515e] hover:bg-black/[0.04]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={cn(
                      "flex min-h-7 w-full min-w-0 items-center gap-2 text-left",
                      hideActionButtons ? "pr-0" : "pr-8",
                    )}
                    title={`${conversation.title} · ${metaLabel}`}
                    aria-label={`${conversation.title}，${metaLabel}`}
                  >
                    {stats.running > 0 || stats.queued > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 text-[10px]">
                        {stats.running > 0 ? (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-600">运行 {stats.running}</span>
                        ) : null}
                        {stats.queued > 0 ? (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">排队 {stats.queued}</span>
                        ) : null}
                      </span>
                    ) : null}
                    <span className={cn("min-w-0 flex-1 truncate font-medium", hideActionButtons ? "text-sm" : "text-sm")}>
                      {conversation.title}
                    </span>
                  </button>
                  {!hideActionButtons ? (
                    <button
                      type="button"
                      onClick={() => void onDeleteConversation(conversation.id)}
                      className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-rose-500 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label="删除会话"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
