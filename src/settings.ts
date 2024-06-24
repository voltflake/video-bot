import { readFile, writeFile } from "node:fs/promises";
import type { Interface } from "node:readline/promises";
import type { Settings } from "./types.js";

export async function getSettings(rl: Interface) {
    try {
        const data = await readFile("./settings.json", { encoding: "utf-8" });
        const settings: Settings = JSON.parse(data);
        // TODO: check if existing settings file is valid
        return settings;
    } catch {
        const settings = await startConfigWizard(rl);
        const stringData = JSON.stringify(settings);
        await writeFile("./settings.json", stringData);
        displayLogo();
        console.info("Created settings file.");
        return settings;
    }
}

function displayLogo() {
    console.clear();
    console.info(String.raw` _____  _  _    ___       _    _       `);
    console.info(String.raw`|_   _|(_)| |__| _ ) ___ | |_ (_)__ __ `);
    console.info(String.raw`  | |  | || / /| _ \/ _ \|  _|| |\ \ / `);
    console.info(String.raw`  |_|  |_||_\_\|___/\___/ \__||_|/_\_\ `);
}

async function startConfigWizard(rl: Interface) {
    const settings: Settings = {
        token: "",
        codec: "h264",
        rapidapi_key: "",
        default_mode: "Compromise"
    };

    console.info("settings.json is missing... Starting configuration wizard.");
    await rl.question("[Press Enter to continue]");

    displayLogo();
    console.info("settings.json is missing... Starting configuration wizard.");
    settings.token = (await rl.question("Please paste your Discord bot token: ")).trim();

    displayLogo();
    console.info("Specify codec you want to use when compressing video.");
    console.info("Leave field blank to use H264 software encoder. Warning: may be slow!");
    console.info("Warning: ffmpeg must be installed to enable compression of bigger videos.");
    console.info('Note: If you\'re using this bot on Raspberry Pi 3 (Raspbian buster) choose "omx_h264"');
    settings.codec = (await rl.question("Enter codec name or skip [Enter]: ")).trim() || "h264";

    displayLogo();
    console.info("Enter your RapidAPI key. Required to make TikTok and Instagram links work.");
    console.info("Bot uses modules that depend on theese APIs:");
    console.info("https://rapidapi.com/rocketapi/api/rocketapi-for-instagram");
    console.info("https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7");
    settings.rapidapi_key = (await rl.question("Your Key: ")).trim();

    displayLogo();
    console.info("Which Mode whould you like to use?");
    console.info("1. Low-Traffic Mode");
    console.info("2. Compromise Mode (Default)");
    console.info("3. Beautiful Mode");
    console.info("Visit GitHub page for more info about modes.");
    console.info("https://github.com/voltflake/video-bot");
    const mode = Number.parseInt((await rl.question("Mode number: ")).trim());
    switch (mode) {
        case 1:
            settings.default_mode = "Low Traffic";
            break;
        case 2:
            settings.default_mode = "Compromise";
            break;
        case 3:
            settings.default_mode = "Beautiful";
            break;
        default:
            settings.default_mode = "Beautiful";
            break;
    }

    return settings;
}
