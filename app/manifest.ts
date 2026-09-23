import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SimReal Sync",
    short_name: "SimReal",
    description: "团队在各个 AI 里的对话，变成大家都看得见的共识和任务进度。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#0b0b0f",
    lang: "zh-CN",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "快速记录", url: "/?capture=1" },
      { name: "导入对话", url: "/import" },
      { name: "收件箱", url: "/inbox" },
    ],
    // Android: "Share → SimReal" from the ChatGPT / Claude / DeepSeek apps.
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
