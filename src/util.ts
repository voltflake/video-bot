import type { Message } from "disgroove";

export type FileType = "image" | "video" | "audio";
export type ContentType = "gallery" | "video";

export type Content = {
    type: ContentType;
    items: Item[];
};

export type Item = {
    filepath: string;
    type: FileType;
};

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
