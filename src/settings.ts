import { Interface } from "node:readline/promises";
import { writeFile, readFile } from "node:fs/promises";

export type Settings = {
    token: string;
    enable_compression: boolean;
    codec_to_use: string,
    embeded_mode: boolean;
};

export async function getSettings(rl: Interface) {
    try {
        const data = await readFile("./settings.json", { encoding: "utf-8" });
        const settings: Settings = JSON.parse(data);
        // TODO: make sure settings file is good
        return settings;
    } catch {
        const settings = await startConfigWizard(rl);
        const string_data = JSON.stringify(settings);
        await writeFile("./settings.json", string_data);
        console.log("Created settings file.");
        return settings;
    }
}

async function startConfigWizard(rl: Interface) {

    async function queryInput(query: string) {
        const header = ` _____  _  _    ___       _    _
    |_   _|(_)| |__| _ ) ___ | |_ (_)__ __
      | |  | || / /| _ \\/ _ \\|  _|| |\\ \\ /
      |_|  |_||_\\_\\|___/\\___/ \\__||_|/_\\_\\\n`;
        console.clear();
        console.log(header);
        const result = await rl.question(query);
        return result.trim();
    }

    async function confirmSetting(query: string) {
        while (true) {
            const response = await queryInput(query + "\nWrite 'Y' to enable, or 'N' to disable: ")
            if (response == "Y") return true;
            if (response == "N") return false;
        }
    }

    let settings: Settings = {
        token: "",
        embeded_mode: false,
        enable_compression: false,
        codec_to_use: "h264",
    };
    await queryInput("settings.json is missing... Starting configuration wizard.\n[Press Enter to continue]");
    settings.token = await queryInput("Please paste your Discord bot token: ");
    settings.embeded_mode = await confirmSetting("Send all videos as embeded links? (50MB Max)\nThose links may look ugly in chat.\nDo not use this unless your internet is super-slow");
    settings.enable_compression = await confirmSetting("Enable compression for videos bigger than 25MB?\nYou must have ffmpeg and ffprobe in your installed.\nWithout compression videos up to 50MB will be sent as embbeded link");
    if (settings.enable_compression) {
        settings.codec_to_use = (await queryInput("Specify codec you want to use when compressing video\nfor example \"omx_h264\" if you're on raspberrypi \n(Or press Enter to use h264 software encoder. Warning: may be slow!): ")) || "h264";
    }
    return settings;
}
