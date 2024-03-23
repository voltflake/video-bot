import { Message } from "discord.js";

export type Settings = {
    token: string;
    codec: string;
};

export type Job = {
    href: string
    discord_message: Message
    type: "Instagram" | "YouTube" | "TikTok"
    mode: "Low-Traffic" | "Compromise" | "Beautiful"
};