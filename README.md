# Discord bot which replies with video to TikTok link
### Current status: ✅ Works out of the box
![Bot in action](preview.gif)
### Features✨
- [X] Lets everyone view the video directly in Discord
- [X] Sends videos as reply to original message
- [X] Supports multiple links in one message
- [X] No TikTok watermark on videos
- [X] Can be hosted on Raspberry Pi  
### NEW Update (September 2022)✨✨✨
- [X] **Fast Mode™** for weak computers
- [X] Changed video provider service
- [X] Added `config.json` for easy configuration
- [X] Added setting to use ffmpeg provided in system `PATH`
- [X] Added setting to use **Fast Mode™** instead of compressing manually  
(Useful for computers which don't support proper h264 hardware encoding)
### ⚠️🤝 If you encountered a problem or want some help feel free to sumbit an issue. Feedback is appriciated!
## Installation 
1. Make sure recent version of node.js and npm is installed on your system
2. Place your bot token in `config.json` file
3. Run these commands
```
cd ~
git clone https://github.com/danyildiabin/tiktok-to-discord
cd tiktok-to-discord
npm install
npx tsc
```
Now you can start this bot
```
node index.js
```
## Configuration 
- `bot_token` - Discord bot token to use.
- `fast_mode` - always send videos using URL message in Discord, may have not cleanest look but works 🔥**Blazingly Fast**🔥.
Give it a try and see if you like it or not. 
- `use_ffmpeg_from_PATH` - uses custom ffmpeg/ffprobe executables for compression of big videos (>8MB) located in your PATH enviroment variable.
If set to `false` uses binaries shipped with this project.
- `use_fast_mode_instead_of_copression` - Do not use compression at all, if downloaded video is bigger than 8MB sends it in **Fast Mode™**.
This setting does not require `fast_mode` to be `true`, it only uses it for large videos.
I reccomend using this setting if you host this bot on Raspberry PI.
