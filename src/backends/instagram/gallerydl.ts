import { easySpawn, validateAndGetContentLength } from "../../helper_functions.js";
import { BackendResponse } from "../../types.js";

// TODO: implement processing of multiple items from post
// TODO: add handling of images
export default async function gallerydl(instagram_url: string) {
    let links;
    try {
        const process = await easySpawn(`gallery-dl --get-urls --cookies cookies.txt ${instagram_url}`);
        links = process.stdout.split("\n");
        if (links == undefined) throw new Error("(gallerydl) no content links were found");
        links.pop();
    } catch (error) {
        console.error(error);
        throw new Error("(gallerydl) failed to spawn process");
    }

    const result: BackendResponse = { images: [], videos: [] };
    for (const link of links) {
        let match = /(?<extension>[^.]+)\?/gm.exec(link);
        if (match?.groups?.extension == undefined) throw new Error("no extension founded");
        switch (match.groups.extension) {
            case "png":
            case "jpg":
                result.images.push({ url: link, size: (await validateAndGetContentLength(link)) });
                break;
            case "mp4":
                result.videos.push({ url: link, size: (await validateAndGetContentLength(link)) });
                break;
            default:
                throw new Error(`unrecognised file extension, link is ${link}`);
        }
        continue;
    }
    return result;
}
