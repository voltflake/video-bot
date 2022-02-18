# Discord bot which replies with video to tiktok url
To build it you need node.js and npm (or other node.js package manager) installed on your system  
Works fine on arm64 under **RasbianOS** and x86_64 under **Windows 11**  
Tested with node.js `16.14.0` and `17.5.0`

# Installation 
Don't forget to place your bot token in main.js
```
cd ~
git clone https://github.com/danyildiabin/tiktok-to-discord
cd tiktok-to-discord
npm install
node main.js
```
# Autorun on linux
If you're on linux you can also set crontab to run this bot at startup
```
crontab -e
```
And write this line in that file, replacing `danyil` with your username
```
@reboot cd /home/danyil/tiktok-to-discord/ ; node main.js
```
