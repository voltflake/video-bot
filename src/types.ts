import type { Message } from "discord.js";

export const enum Mode {
    low_traffic,
    compromise,
    beautiful
}

export type Settings = {
    token: string;
    codec: string;
    rapidapi_key: string;
    mode: Mode;
};

export type Job = {
    href: string;
    discord_message: Message;
    type: "Instagram" | "YouTube" | "TikTok";
    mode: Mode;
    rapidapi_key: string;
};
