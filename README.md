# Discord bot which replies with video to TikTok link
### Current status: ✅ Works with simple patch
⚠️Dependency broke but easy to fix [(jump to patch)](#-fix-for-proper-video-downloading)
- [X] Lets everyone view the video directly in Discord
- [X] Sends videos as reply to original message
- [X] Supports multiple links in one message
- [X] No TikTok watermark on videos
- [X] Can be hosted on Raspberry Pi

If you encountered a problem or want some help feel free to sumbit an issue

![Bot in action](preview.gif)

Installation 
---
1. Make sure recent version of node.js and npm is installed on your system
2. Place your bot token in main.js
3. Run these commands
```
cd ~
git clone https://github.com/danyildiabin/tiktok-to-discord
cd tiktok-to-discord
npm install
```
Now you can start this bot
```
node main.js
```
### ⚠ Fix for proper video downloading
[One dependency](https://github.com/MRHRTZ/Tiktok-Scraper-Without-Watermark) stopped working because something in API service changed but there is a simple fix for that.  
To do it, after instalation (`npm install`) navigate to `node_modules\tiktok-scraper-without-watermark\src\function`  
Open `index.js` located there and at line 198 change url to `https://ttdownloader.com/query/`  
