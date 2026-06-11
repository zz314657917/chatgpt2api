import type { SmartCanvasItemType } from "./types";

export const SMART_CANVAS_ONBOARDING_STORAGE_KEY = "smart-canvas-onboarding-dismissed-v1";

export type SmartCanvasHelpTopic =
  | { kind: "node"; id: SmartCanvasItemType }
  | { kind: "flow"; id: SmartCanvasFlowTemplateId };

export type SmartCanvasFlowTemplateId =
  | "basic-text"
  | "image-to-image"
  | "ai-prompt"
  | "loop-repeat"
  | "loop-images"
  | "group-organize";

export type SmartCanvasNodeHelp = {
  id: SmartCanvasItemType;
  title: string;
  summary: string;
  upstream: string;
  downstream: string;
  controls: string[];
  reminders: string[];
};

export type SmartCanvasFlowTemplate = {
  id: SmartCanvasFlowTemplateId;
  title: string;
  summary: string;
  chain: string;
  nodes: SmartCanvasItemType[];
  edges: Array<[number, number]>;
};

export const CANVAS_NODE_HELP: SmartCanvasNodeHelp[] = [
  {
    id: "prompt",
    title: "提示词",
    summary: "写生图提示词、补充要求或文本输入。",
    upstream: "通常不需要上游，也可以由组节点统一管理。",
    downstream: "图片生成、AI 提示词、循环、组。",
    controls: ["文本框用于写主提示词。", "@图片 会把图片引用放进提示词节点，供下游读取。"],
    reminders: ["直接生图时连到 图片生成。", "想先优化提示词时连到 AI 提示词。"],
  },
  {
    id: "image",
    title: "图片",
    summary: "保存参考图、上传图或生成结果图。",
    upstream: "可由上传、粘贴、素材库或 Output 结果创建。",
    downstream: "AI 提示词、图片生成、循环、组。",
    controls: ["点击图片可预览。", "右下角拖拽可调整节点大小。"],
    reminders: ["连到 图片生成 会作为图生图输入。", "连到 AI 提示词 会让模型先看图再产出提示词。"],
  },
  {
    id: "llm",
    title: "AI 提示词",
    summary: "把上游文本和图片整理成更适合生图的最终提示词。",
    upstream: "提示词、图片、组、Output。",
    downstream: "图片生成、循环、Output。",
    controls: ["补充处理要求用于约束提词方式。", "模型选择决定使用哪个文本/多模态模型。", "生成提示词按钮会创建文本任务。"],
    reminders: ["AI 提示词看过的图片不会自动传给 图片生成，界面会提示你点击连线补齐图片。"],
  },
  {
    id: "loop",
    title: "循环",
    summary: "按规则重复提交下游 图片生成。",
    upstream: "提示词、图片、AI 提示词、组、Output。",
    downstream: "必须连接 图片生成，再由 图片生成 连接 Output。",
    controls: ["重复：同一组输入跑 N 轮。", "逐图：上游每张图片单独跑一轮。", "停止按钮可请求停止后续轮次。"],
    reminders: ["循环节点自己不生成图片，点击下游 图片生成 才会运行。", "逐图模式的轮数由图片数量决定。"],
  },
  {
    id: "group",
    title: "组",
    summary: "整理一组节点，并把组内文本和图片作为整体输入传给下游。",
    upstream: "Image、Prompt、AI 提示词、Output。",
    downstream: "图片生成、AI 提示词、循环、Result。",
    controls: ["连接节点到组会成为组成员。", "组节点固定在底层，便于当作容器使用。"],
    reminders: ["组适合整理素材和提示词，不是运行节点。", "组连接到下游时会展开组内图片和文本。"],
  },
  {
    id: "image_generation",
    title: "图片生成",
    summary: "真正提交生图或图生图任务的节点。",
    upstream: "提示词、图片、AI 提示词、循环、组、Output。",
    downstream: "Output，也可以继续连接到其他处理节点。",
    controls: ["补充提示词会追加到上游提示词后。", "模型、比例、可见性和张数控制本次提交参数。", "图片生成按钮提交任务。"],
    reminders: ["按钮灰掉通常表示没有可用提示词。", "如果上游是循环，点击 图片生成 会按循环规则执行。"],
  },
  {
    id: "video_generation",
    title: "视频生成",
    summary: "提交视频生成任务，支持提示词和参考图输入。",
    upstream: "提示词、图片、AI 提示词、组、Output。",
    downstream: "Output，也可以继续连接到其他节点传递结果。",
    controls: ["补充提示词会追加到上游提示词后。", "模型、比例、时长、分辨率和音频开关控制本次提交参数。", "视频生成按钮提交任务。"],
    reminders: ["视频模型来自当前 创作空间绑定的模型目录。", "未绑定 创作权限 时后端会拒绝提交视频任务。"],
  },
  {
    id: "result",
    title: "Output",
    summary: "展示生成结果、运行状态和错误信息。",
    upstream: "图片生成、AI 提示词、循环、Image、组、Output。",
    downstream: "图片生成、AI 提示词、循环、Image、组、Output。",
    controls: ["生成成功后显示图片或文本。", "图片可点击预览，也可继续连到其他节点。"],
    reminders: ["Output 不提交任务，只展示或传递结果。", "图片生成 连接 Output 后结果会自动写入。"],
  },
];

export const CANVAS_FLOW_TEMPLATES: SmartCanvasFlowTemplate[] = [
  {
    id: "basic-text",
    title: "基础文生图",
    summary: "最简单的生成链路，适合理解画布的节点和连线。",
    chain: "Prompt -> 图片生成 -> Output",
    nodes: ["prompt", "image_generation", "result"],
    edges: [[0, 1], [1, 2]],
  },
  {
    id: "image-to-image",
    title: "图生图",
    summary: "用一张参考图和一段提示词生成新图。",
    chain: "Prompt + Image -> 图片生成 -> Output",
    nodes: ["prompt", "image", "image_generation", "result"],
    edges: [[0, 2], [1, 2], [2, 3]],
  },
  {
    id: "ai-prompt",
    title: "AI 提词生图",
    summary: "先让 AI 根据文本和图片整理提示词，再提交生成。",
    chain: "Prompt + Image -> AI提示词 -> 图片生成 -> Output",
    nodes: ["prompt", "image", "llm", "image_generation", "result"],
    edges: [[0, 2], [1, 2], [2, 3], [1, 3], [3, 4]],
  },
  {
    id: "loop-repeat",
    title: "循环重复生成",
    summary: "用同一组输入重复生成多版结果。",
    chain: "Prompt/Image -> 循环 -> 图片生成 -> Output",
    nodes: ["prompt", "image", "loop", "image_generation", "result"],
    edges: [[0, 2], [1, 2], [2, 3], [3, 4]],
  },
  {
    id: "loop-images",
    title: "逐图批量处理",
    summary: "多张上游图片逐张提交到 图片生成。",
    chain: "多张 Image + Prompt -> 循环(逐图) -> 图片生成 -> Output",
    nodes: ["prompt", "image", "image", "loop", "image_generation", "result"],
    edges: [[0, 3], [1, 3], [2, 3], [3, 4], [4, 5]],
  },
  {
    id: "group-organize",
    title: "组节点整理输入",
    summary: "先把素材和提示词收进组，再把组作为整体传给下游。",
    chain: "Prompt + Image -> 组 -> 图片生成 -> Output",
    nodes: ["prompt", "image", "group", "image_generation", "result"],
    edges: [[0, 2], [1, 2], [2, 3], [3, 4]],
  },
];

export function canvasNodeHelpById(id: SmartCanvasItemType) {
  return CANVAS_NODE_HELP.find((item) => item.id === id) || CANVAS_NODE_HELP[0];
}

export function canvasFlowTemplateById(id: SmartCanvasFlowTemplateId) {
  return CANVAS_FLOW_TEMPLATES.find((item) => item.id === id) || CANVAS_FLOW_TEMPLATES[0];
}
