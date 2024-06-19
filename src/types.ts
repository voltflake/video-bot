import type { Message } from "discord.js";

export type Mode = "Low Traffic" | "Compromise" | "Beautiful";
export type URL_Type = "Instagram" | "YouTube" | "TikTok";

export type Settings = {
    token: string;
    codec: string;
    rapidapi_key: string;
    mode: Mode;
};

export type Job = {
    href: string;
    discord_message: Message;
    type: URL_Type;
    mode: Mode;
    rapidapi_key: string;
};
