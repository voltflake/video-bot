export type Item = {
  type: "Video" | "Image" | "Audio";
  size?: number;
  url: string;
};

export type Task = {
  type: "TikTok" | "YouTube" | "Instagram";
  href: string;
};