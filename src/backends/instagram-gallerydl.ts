import { spawnSync } from "node:child_process";

function spawnSyncWrapper(command: string) {
    const argument_tokens = command.split(" ");
    const application = argument_tokens.shift();
    if (application == undefined) throw new Error("Bad command passed to spawnSyncWrapper()");
    return spawnSync(application, argument_tokens);
}

export default async function galleryDL(instagram_url: string) {
    const gallety_dl = spawnSyncWrapper(`gallery-dl --get-urls --cookies cookies.txt ${instagram_url}`);
    if (gallety_dl.status != 0) throw "gallery-dl exited with bad code, check if cookies.txt exists";
    const links = new TextDecoder("utf-8").decode(gallety_dl.stdout).split("\n");
    if (links == undefined) throw "gallery-dl couldn't find any links";
    // TODO implement more than first video from post
    // TODO add handling of images
    return links[0];
}
