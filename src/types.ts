import type { Message } from "discord.js";

export type Mode = "Low Traffic" | "Compromise" | "Beautiful";
export type urlType = "Instagram" | "YouTube" | "TikTok";

export type Settings = {
    token: string;
    codec: string;
    rapidapi_key: string;
    default_mode: Mode;
};

export type Job = {
    href: string;
    discord_message: Message;
    type: urlType;
    mode?: Mode;
    rapidapi_key?: string;
};
