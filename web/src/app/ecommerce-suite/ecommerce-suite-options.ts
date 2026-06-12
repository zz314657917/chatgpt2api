export type CommerceSuitePlatform = "amazon" | "tiktok_shop" | "independent_site" | "general";
export type CommerceSuiteMarket = "us" | "eu" | "jp" | "sea" | "global";
export type CommerceSuiteLanguage = "zh" | "en" | "ja" | "de" | "es";

export type CommerceSuiteTemplate = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  prompt: string;
};

export const COMMERCE_SUITE_PLATFORMS = [
  { value: "amazon", label: "Amazon" },
  { value: "tiktok_shop", label: "TikTok Shop" },
  { value: "independent_site", label: "独立站" },
  { value: "general", label: "通用电商" },
] as const;

export const COMMERCE_SUITE_MARKETS = [
  { value: "us", label: "美国" },
  { value: "eu", label: "欧洲" },
  { value: "jp", label: "日本" },
  { value: "sea", label: "东南亚" },
  { value: "global", label: "全球通用" },
] as const;

export const COMMERCE_SUITE_LANGUAGES = [
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "de", label: "德文" },
  { value: "es", label: "西班牙文" },
] as const;

export const COMMERCE_SUITE_TEMPLATES: CommerceSuiteTemplate[] = [
  {
    id: "main-white",
    title: "商业白底主图",
    shortTitle: "白底",
    description: "标准棚拍白底，主体清晰。",
    prompt: "制作商业白底主图，使用标准白底或极浅灰背景，商品主体完整清晰，光线干净，适合电商主图展示，不添加复杂场景。",
  },
  {
    id: "main-selling-focus",
    title: "卖点聚焦图",
    shortTitle: "聚焦",
    description: "核心卖点与层次信息。",
    prompt: "制作卖点聚焦图，围绕商品最重要的 1 到 3 个卖点组织画面，用简洁文字、图标或局部强调表达价值，避免信息过载。",
  },
  {
    id: "main-lifestyle",
    title: "场景生活图",
    shortTitle: "生活",
    description: "生活化或使用情境。",
    prompt: "制作场景生活图，把商品放入目标用户熟悉的生活化或使用情境，突出真实使用价值和情绪吸引力，商品仍然保持清晰可识别。",
  },
  {
    id: "main-comparison-effect",
    title: "对比/效果图",
    shortTitle: "效果",
    description: "前后对比或效果示意。",
    prompt: "制作对比或效果图，使用前后对比、普通方案与本商品对比或效果示意来突出差异，表达合规克制，不做无法证实的夸张承诺。",
  },
  {
    id: "main-detail",
    title: "产品细节图",
    shortTitle: "细节",
    description: "材质、做工或局部特写。",
    prompt: "制作产品细节图，突出商品材质、做工、纹理、接口或关键局部，使用局部放大和质感光影，让用户看清品质细节。",
  },
  {
    id: "main-atmosphere",
    title: "氛围创意图",
    shortTitle: "氛围",
    description: "氛围延展，主体仍清晰。",
    prompt: "制作氛围创意图，在保持商品主体清晰的前提下加入品牌感、季节感或情绪氛围，画面有吸引力但不喧宾夺主。",
  },
  {
    id: "hero",
    title: "首屏主视觉图",
    shortTitle: "主视觉",
    description: "适合作为商品详情首屏或主推图。",
    prompt: "制作首屏主视觉图，突出商品完整外观、核心利益点和干净高级的电商构图，主体清晰，背景简洁，保留足够文案空间。",
  },
  {
    id: "selling-points",
    title: "核心卖点图",
    shortTitle: "卖点",
    description: "集中表达 3-5 个关键购买理由。",
    prompt: "制作核心卖点图，提炼 3 到 5 个主要卖点，用清晰的信息层级和图标化视觉表达，避免堆字，商品保持识别度。",
  },
  {
    id: "structure",
    title: "结构/功能说明图",
    shortTitle: "功能",
    description: "解释结构、功能、部件或使用逻辑。",
    prompt: "制作结构或功能说明图，用分区、指示线或局部放大表达商品结构和功能逻辑，画面专业、易读、适合详情页中段。",
  },
  {
    id: "details",
    title: "材质/细节特写图",
    shortTitle: "细节",
    description: "突出材质、工艺、纹理和细节价值。",
    prompt: "制作材质与细节特写图，突出商品材质、纹理、工艺或关键细节，使用局部特写和质感光影，保持真实可信。",
  },
  {
    id: "scenario",
    title: "使用场景图",
    shortTitle: "场景",
    description: "展示商品在真实场景中的使用价值。",
    prompt: "制作使用场景图，把商品放入目标人群会认可的真实生活或工作场景，强调使用后的体验和情绪价值，避免过度杂乱。",
  },
  {
    id: "comparison",
    title: "痛点对比图",
    shortTitle: "对比",
    description: "展示使用前后、普通方案和本商品差异。",
    prompt: "制作痛点对比图，用左右对比或前后对比说明用户痛点与商品解决方案，表达清楚但不过度夸张。",
  },
  {
    id: "specs",
    title: "规格/尺寸图",
    shortTitle: "规格",
    description: "展示尺寸、规格、容量或包装信息。",
    prompt: "制作规格与尺寸图，清晰展示商品尺寸、规格、容量或包装信息，使用干净的标注线和比例关系，适合购买决策。",
  },
  {
    id: "summary",
    title: "收尾总结图",
    shortTitle: "总结",
    description: "总结卖点并形成详情页收尾转化。",
    prompt: "制作收尾总结图，整合核心价值、适用人群和购买理由，形成详情页最后一屏的转化型视觉，语气克制可信。",
  },
];

export const MAIN_IMAGE_TEMPLATE_IDS = [
  "main-white",
  "main-selling-focus",
  "main-lifestyle",
  "main-comparison-effect",
  "main-detail",
  "main-atmosphere",
] as const;

export const APLUS_TEMPLATE_IDS = [
  "hero",
  "selling-points",
  "structure",
  "details",
  "scenario",
  "comparison",
  "specs",
  "summary",
] as const;

export const DEFAULT_COMMERCE_SUITE_TEMPLATE_IDS = [] as const;

export function commerceSuiteOptionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label || value;
}
