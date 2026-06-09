import {
  DEFAULT_SMART_VIEWPORT,
  createGeneratorNode,
  createImageItem,
  createLlmNode,
  createLoopNode,
  createOutputNode,
  createPromptNode,
  createSmartEdge,
} from "./canvas-utils";
import {
  SMART_CANVAS_KIND,
  SMART_CANVAS_SCHEMA_VERSION,
  type SmartCanvasDocument,
  type SmartCanvasItemType,
} from "./types";

export type SmartCanvasPresetId =
  | "blank"
  | "text-to-image"
  | "image-to-image"
  | "ai-prompt"
  | "batch-variants"
  | "pixel-icon";

export type SmartCanvasPreset = {
  id: SmartCanvasPresetId;
  title: string;
  summary: string;
  description: string;
  canvasName: string;
  tags: string[];
  nodeTypes: SmartCanvasItemType[];
};

export type SmartCanvasPresetLike = Omit<SmartCanvasPreset, "id"> & {
  id: string;
};

export const SMART_CANVAS_PRESETS: SmartCanvasPreset[] = [
  {
    id: "blank",
    title: "空白画布",
    summary: "不预置节点",
    description: "适合从零搭建自己的节点、连线和图片流程。",
    canvasName: "未命名画布",
    tags: ["自由搭建", "干净开始"],
    nodeTypes: [],
  },
  {
    id: "text-to-image",
    title: "常规文生图画布",
    summary: "Prompt -> 图片生成 -> Output",
    description: "预置提示词、图片生成和结果节点，适合直接写 prompt 出图。",
    canvasName: "文生图画布",
    tags: ["文生图", "基础链路"],
    nodeTypes: ["prompt", "image_generation", "result"],
  },
  {
    id: "image-to-image",
    title: "图生图画布",
    summary: "图片 + Prompt -> 图片生成",
    description: "预置参考图、提示词、生成和输出节点，适合基于图片继续创作。",
    canvasName: "图生图画布",
    tags: ["图生图", "参考图"],
    nodeTypes: ["image", "prompt", "image_generation", "result"],
  },
  {
    id: "ai-prompt",
    title: "AI 提示词画布",
    summary: "想法 -> AI 提示词 -> 图片生成",
    description: "先让 AI 提炼可用提示词，再连接到图片生成节点。",
    canvasName: "AI 提示词画布",
    tags: ["提示词增强", "文生图"],
    nodeTypes: ["prompt", "llm", "image_generation", "result"],
  },
  {
    id: "batch-variants",
    title: "批量变体画布",
    summary: "Prompt -> 循环 -> 图片生成",
    description: "预置循环节点，用于快速生成同一主题的多组变体。",
    canvasName: "批量变体画布",
    tags: ["批量", "变体"],
    nodeTypes: ["prompt", "loop", "image_generation", "result"],
  },
  {
    id: "pixel-icon",
    title: "像素图标生成",
    summary: "图标类型 -> 可选 AI -> 2x2",
    description: "只改图标类型，可先运行 AI 提词增强，也可以直接生成四组像素图标尺寸。",
    canvasName: "像素图标生成画布",
    tags: ["像素图标", "多尺寸", "游戏素材"],
    nodeTypes: ["prompt", "llm", "image_generation", "result"],
  },
];

export function createSmartCanvasFromPreset(presetId: SmartCanvasPresetId): SmartCanvasDocument {
  const preset = SMART_CANVAS_PRESETS.find((item) => item.id === presetId) || SMART_CANVAS_PRESETS[0];
  const layout = createPresetLayout(preset.id);
  return {
    id: "",
    name: preset.canvasName,
    kind: SMART_CANVAS_KIND,
    schema_version: SMART_CANVAS_SCHEMA_VERSION,
    nodes: layout.nodes,
    edges: layout.edges,
    viewport: layout.viewport,
  };
}

function createPresetLayout(presetId: SmartCanvasPresetId): Pick<SmartCanvasDocument, "nodes" | "edges" | "viewport"> {
  if (presetId === "blank") {
    return {
      nodes: [],
      edges: [],
      viewport: DEFAULT_SMART_VIEWPORT,
    };
  }

  if (presetId === "image-to-image") {
    const image = {
      ...createImageItem([], { x: 260, y: 260 }),
      name: "参考图",
    };
    const prompt = {
      ...createPromptNode({ x: 260, y: 560 }, "描述你希望基于参考图调整的主体、风格、构图和细节。"),
      name: "编辑要求",
    };
    const generator = createGeneratorNode({ x: 700, y: 360 });
    const output = createOutputNode({ x: 1150, y: 360 });
    return {
      nodes: [image, prompt, generator, output],
      edges: [
        createSmartEdge(image.id, generator.id),
        createSmartEdge(prompt.id, generator.id),
        createSmartEdge(generator.id, output.id),
      ],
      viewport: { x: -80, y: -120, zoom: 0.92 },
    };
  }

  if (presetId === "ai-prompt") {
    const prompt = {
      ...createPromptNode({ x: 180, y: 380 }, "写下主题、画面气质、主体对象和限制条件。"),
      name: "原始想法",
    };
    const llm = createLlmNode({ x: 570, y: 290 });
    const generator = createGeneratorNode({ x: 1010, y: 320 });
    const output = createOutputNode({ x: 1460, y: 340 });
    return {
      nodes: [prompt, llm, generator, output],
      edges: [
        createSmartEdge(prompt.id, llm.id),
        createSmartEdge(llm.id, generator.id),
        createSmartEdge(generator.id, output.id),
      ],
      viewport: { x: -120, y: -100, zoom: 0.82 },
    };
  }

  if (presetId === "batch-variants") {
    const prompt = {
      ...createPromptNode({ x: 220, y: 390 }, "生成同一主题的多种风格变体，保持主体一致，变化配色、光照和构图。"),
      name: "变体主题",
    };
    const loop = createLoopNode({ x: 620, y: 360 });
    const generator = createGeneratorNode({ x: 1030, y: 320 });
    generator.data = { ...generator.data, n: 2 };
    const output = createOutputNode({ x: 1480, y: 340 });
    return {
      nodes: [prompt, loop, generator, output],
      edges: [
        createSmartEdge(prompt.id, loop.id),
        createSmartEdge(loop.id, generator.id),
        createSmartEdge(generator.id, output.id),
      ],
      viewport: { x: -140, y: -120, zoom: 0.82 },
    };
  }

  if (presetId === "pixel-icon") {
    const prompt = {
      ...createPromptNode({ x: 80, y: 420 }, "红色药水瓶"),
      name: "图标类型",
    };
    const llm = {
      ...createLlmNode({ x: 430, y: 300 }),
      name: "可选 AI 提词",
    };
    const sizes = [
      { value: "16x16", x: 930, y: 80 },
      { value: "32x32", x: 1880, y: 80 },
      { value: "64x64", x: 930, y: 560 },
      { value: "128x128", x: 1880, y: 560 },
    ];
    const nodes: SmartCanvasDocument["nodes"] = [prompt, llm];
    const edges: SmartCanvasDocument["edges"] = [createSmartEdge(prompt.id, llm.id)];
    sizes.forEach((size) => {
      const generator = createPixelIconGeneratorNode(size.value, { x: size.x, y: size.y });
      const output = {
        ...createOutputNode({ x: size.x + 440, y: size.y + 40 }),
        name: `${size.value} 结果`,
      };
      nodes.push(generator, output);
      edges.push(createSmartEdge(prompt.id, generator.id), createSmartEdge(llm.id, generator.id), createSmartEdge(generator.id, output.id));
    });
    return {
      nodes,
      edges,
      viewport: { x: -20, y: 70, zoom: 0.34 },
    };
  }

  const prompt = createPromptNode({ x: 360, y: 430 }, "生成一张高质量图片，主体清晰，构图稳定，光影精致。");
  const generator = createGeneratorNode({ x: 760, y: 300 });
  const output = createOutputNode({ x: 1190, y: 300 });
  return {
    nodes: [prompt, generator, output],
    edges: [createSmartEdge(prompt.id, generator.id), createSmartEdge(generator.id, output.id)],
    viewport: { x: -120, y: -120, zoom: 1 },
  };
}

function createPixelIconGeneratorNode(size: string, position: { x: number; y: number }) {
  const generator = createGeneratorNode(position);
  return {
    ...generator,
    name: `${size} 像素图标`,
    data: {
      ...generator.data,
      prompt: [
        `生成单个像素风图标，目标尺寸：${size}。`,
        "主体居中，硬边像素块，有限调色板，高可读剪影，适合游戏物品栏或素材库。",
        "不要文字、水印、图标集合、复杂背景、写实摄影、3D 渲染或柔焦渐变。",
      ].join("\n"),
      size,
      size_user_modified: true,
      image_resolution: "",
      image_resolution_user_modified: true,
      quality: "high",
      n: 1,
    },
  };
}
