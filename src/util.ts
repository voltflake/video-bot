import type { Message } from "npm:discordeno";

export type ContentType = "image" | "video" | "audio";
export type SocialMedia = "TikTok" | "Instagram" | "YouTube" | "YouTubeShorts";
export type LogLevel = "INFO" | "FAULT" | "CRITICAL";

export type Item = {
    type: ContentType;
    url: string;
    size: number;
};

export type Task = {
    message: Message;
    url: string;
    type: SocialMedia;
};

// function formatDateTime(date: Date): string {
//     const pad = (num: number): string => String(num).padStart(2, '0');
//     const year = date.getFullYear();
//     const month = pad(date.getMonth() + 1); // Months are zero-based
//     const day = pad(date.getDate());
//     const hours = pad(date.getHours());
//     const minutes = pad(date.getMinutes());
//     const seconds = pad(date.getSeconds());
//     const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
//     return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
// }

// export function log(message: string): void {
//     try {
//         const encoder = new TextEncoder();
//         const data = encoder.encode(`${formatDateTime(new Date())} ${message}\n`);
//         Deno.writeFileSync("diagnostics.txt", data, { append: true });
//     } catch {
//         console.error("Failed to write to diagnostics.txt file.");
//     }
// }

export async function getContentLength(url: string): Promise<number> {
    try {
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok) {
            return extractLength(response.headers);
        }
    } catch {
        console.error("Fault: Failed to extract content-length with HEAD method.");
    }

    try {
        const response = await fetch(url, { method: "GET" });
        if (response.ok) {
            return extractLength(response.headers);
        }
    } catch {
        console.error("Fault: Failed to extract content-length with GET method.");
    }

    throw new Error("Failed to get content-length headers. URL might be broken/unavailable.");
}

function extractLength(headers: Headers): number {
    let header_value = headers.get("content-length");
    if (header_value) {
        return Number.parseInt(header_value);
    }

    header_value = headers.get("Content-Length");
    if (header_value) {
        return Number.parseInt(header_value);
    }

    throw new Error("No content-length headers were found.");
}
