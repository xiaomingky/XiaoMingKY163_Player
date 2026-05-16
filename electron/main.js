import { app, BrowserWindow, shell, ipcMain, dialog, protocol, Tray, Menu, nativeImage, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import * as mm from 'music-metadata'
import axios from 'axios'
import { exec, execFile } from 'node:child_process'
import { autoUpdater } from 'electron-updater'

// --- Win7 鍏煎鎬у垵濮嬪寲 ---
if (process.platform === 'win32') {
    // 寮哄埗浣跨敤杞欢娓叉煋鎴栫壒瀹氱殑娓叉煋闄愬埗浼氬鑷翠弗閲嶅崱椤裤€?
    // 鎴戜滑閲囧彇鈥滅ǔ鍋ユā寮忊€濓細闄愬埗楂樿礋杞?GL 鐗规€э紝浣嗕繚鐣欏熀鏈‖浠跺姞閫熴€?
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    // 濡傛灉鍦ㄦ瀬鏃х殑 Win7 涓婂穿婧冿紝鍙互灏濊瘯鍙栨秷娉ㄩ噴涓嬮潰杩欒杩涜褰诲簳闄嶇骇
    // app.disableHardwareAcceleration(); 
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

// 璁剧疆姝ｅ紡鍚嶇О锛岀‘淇濆璇濇鏍囬姝ｇ‘
app.name = '鑼楅煹鏃跺厜'

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win
let tray = null

function createTray() {
    const iconPath = VITE_DEV_SERVER_URL
        ? path.join(process.env.APP_ROOT, 'build', 'icon.png')
        : path.join(RENDERER_DIST, 'icon.png')

    try {
        const icon = nativeImage.createFromPath(iconPath)
        tray = new Tray(icon.resize({ width: 16, height: 16 }))
    } catch (e) {
        tray = new Tray(nativeImage.createEmpty())
    }

    const contextMenu = Menu.buildFromTemplate([
        { label: '鏄剧ず涓荤獥鍙?, click: () => { win.show(); win.focus() } },
        { type: 'separator' },
        { label: '涓婁竴棣?, click: () => win.webContents.send('player-command', 'prev') },
        { label: '鎾斁/鏆傚仠', click: () => win.webContents.send('player-command', 'togglePlay') },
        { label: '涓嬩竴棣?, click: () => win.webContents.send('player-command', 'next') },
        { type: 'separator' },
        { label: '閫€鍑?, click: () => { tray.destroy(); tray = null; app.quit() } }
    ])

    tray.setToolTip('鑼楅煹鏃跺厜')
    tray.setContextMenu(contextMenu)

    tray.on('double-click', () => {
        win.show()
        win.focus()
    })
}

// Register protocols (Privileged 淇濇寔涓嶅彉)
protocol.registerSchemesAsPrivileged([
    { scheme: 'local-file', privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    { scheme: 'song-cover', privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

function createWindow() {
    const preloadPath = VITE_DEV_SERVER_URL
        ? path.join(process.env.APP_ROOT, 'electron', 'preload.cjs')
        : path.join(__dirname, 'preload.js')

    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1022,
        minHeight: 720,
        frame: false,
        backgroundColor: '#ffffff', // Win7 涓嬮槻姝㈤€忔槑绐楀彛闂儊
        icon: path.join(process.env.VITE_PUBLIC, 'icon.png'), // 璁剧疆鍥炬爣
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false // 鍏佽璺ㄥ煙
        },
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
            } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) shell.openExternal(url)
        return { action: 'deny' }
    })

    win.on('maximize', () => {
        win.webContents.send('window-maximize-status', true)
    })

    win.on('unmaximize', () => {
        win.webContents.send('window-maximize-status', false)
    })

    win.on('close', (e) => {
        if (tray) {
            e.preventDefault()
            win.hide()
        }
    })

    win.webContents.on('before-input-event', (event, input) => {
        if (input.key.toLowerCase() === 'f12' && input.type === 'keyDown') {
                        event.preventDefault()
        }
    })
}
let lyricWin = null
let unlockWin = null

function createUnlockWindow() {
    if (unlockWin) return
    unlockWin = new BrowserWindow({
        width: 90, height: 32,
        frame: false, transparent: true, alwaysOnTop: true,
        skipTaskbar: true, resizable: false, focusable: true,
        backgroundColor: '#00000000',
        webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    })

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh;}
        .btn{display:flex;align-items:center;gap:4px;padding:5px 12px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:14px;color:#fff;font-size:12px;cursor:pointer;font-family:-apple-system,sans-serif;backdrop-filter:blur(6px);transition:all 0.2s;}
        .btn:hover{background:rgba(0,0,0,0.7);border-color:rgba(255,255,255,0.4);}
    </style></head><body>
        <button class="btn" onclick="unlock()">馃敁瑙ｉ攣</button>
        <script>const {ipcRenderer}=require('electron');function unlock(){ipcRenderer.send('unlock-lyric-window')}</script>
    </body></html>`

    unlockWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    unlockWin.on('closed', () => { unlockWin = null })
}

function placeUnlockWindow() {
    if (!unlockWin || !lyricWin) return
    const b = lyricWin.getBounds()
    unlockWin.setBounds({
        x: Math.round(b.x + (b.width - 90) / 2),
        y: Math.round(b.y + b.height - 42),
        width: 90, height: 32
    })
    unlockWin.setAlwaysOnTop(true, 'screen-saver')
}

function createLyricWindow() {
    if (lyricWin) return;

    const preloadPath = VITE_DEV_SERVER_URL
        ? path.join(process.env.APP_ROOT, 'electron', 'preload.cjs')
        : path.join(__dirname, 'preload.js')

    lyricWin = new BrowserWindow({
        width: 1100,
        height: 250,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false
        },
    })

    if (VITE_DEV_SERVER_URL) {
        lyricWin.loadURL(`${VITE_DEV_SERVER_URL}#/desktop-lyrics`)
    } else {
        lyricWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'desktop-lyrics' })
    }

    lyricWin.on('closed', () => {
        lyricWin = null
        if (unlockWin) { unlockWin.close(); unlockWin = null }
    })

    lyricWin.on('move', () => placeUnlockWindow())
    lyricWin.on('resize', () => placeUnlockWindow())

    // 纭繚绐楀彛鍑嗗濂藉悗绔嬪嵆鍚屾涓€娆＄姸鎬?
    lyricWin.webContents.on('did-finish-load', () => {
        win.webContents.send('request-lyric-sync')
    })
}

// Global IPC handlers (淇濇寔涓嶅彉)
ipcMain.on('window-minimize', () => {
    const currentWin = BrowserWindow.getFocusedWindow() || win
    currentWin?.minimize()
})

ipcMain.on('window-maximize', () => {
    const currentWin = BrowserWindow.getFocusedWindow() || win
    if (currentWin?.isMaximized()) {
        currentWin?.unmaximize()
    } else {
        currentWin?.maximize()
    }
})

ipcMain.on('window-close', () => {
    const currentWin = BrowserWindow.getFocusedWindow() || win
    currentWin?.close()
})

ipcMain.on('toggle-desktop-lyrics', (_, show) => {
    if (show) {
        if (!lyricWin) createLyricWindow()
        else {
            lyricWin.show()
            lyricWin.setAlwaysOnTop(true, 'screen-saver')
        }
    } else {
        lyricWin?.hide()
        if (unlockWin) unlockWin.hide()
    }
})

// 鎵弿瀛椾綋鐩綍
ipcMain.handle('scan-fonts', async () => {
    // 鎵撳寘鍚庢斁缃湪 resources/font锛屽紑鍙戞椂鍦ㄩ」鐩牴鐩綍 /font
    const fontDir = app.isPackaged
        ? path.join(process.resourcesPath, 'font')
        : path.join(process.env.APP_ROOT, 'font')

    if (!fs.existsSync(fontDir)) return []

    const results = []
    const scanDir = (dir) => {
        try {
            const files = fs.readdirSync(dir)
            files.forEach(file => {
                const fullPath = path.join(dir, file)
                if (fs.statSync(fullPath).isDirectory()) {
                    scanDir(fullPath)
                } else if (/\.(ttf|otf|ttc|woff|woff2)$/i.test(file)) {
                    results.push({
                        name: path.basename(file, path.extname(file)),
                        path: fullPath,
                        url: `local-file://${fullPath.replace(/\\/g, '/')}`
                    })
                }
            })
        } catch (e) { }
    }
    scanDir(fontDir)
    return results
})

ipcMain.on('update-lyric-state', (_, data) => {
    lyricWin?.webContents.send('lyric-state-change', data)
})

ipcMain.on('lyric-window-command', (_, cmd) => {
    win?.webContents.send('player-command', cmd)
})

ipcMain.on('lyric-window-lock', (_, { locked }) => {
    if (!lyricWin) return
    if (locked) {
        lyricWin.setIgnoreMouseEvents(true, { forward: true })
        lyricWin.setMovable(false)
        if (!unlockWin) createUnlockWindow()
        placeUnlockWindow()
        unlockWin.show()
        unlockWin.setAlwaysOnTop(true, 'screen-saver')
    } else {
        lyricWin.setIgnoreMouseEvents(false)
        lyricWin.setMovable(true)
        if (unlockWin) unlockWin.hide()
    }
})

ipcMain.on('unlock-lyric-window', () => {
    if (lyricWin) {
        lyricWin.setIgnoreMouseEvents(false)
        lyricWin.setMovable(true)
    }
    if (unlockWin) unlockWin.hide()
    // 閫氱煡姝岃瘝绐楀彛鏇存柊UI
    lyricWin?.webContents.send('lyric-lock-state-changed', false)
})

// 鏍稿績閫掑綊鎵弿鍑芥暟
async function scanAudioFiles(filePath) {
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) {
        const files = fs.readdirSync(filePath)
        let results = []
        for (const file of files) {
            results = results.concat(await scanAudioFiles(path.join(filePath, file)))
        }
        return results
    }

    const extensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a']
    if (extensions.includes(path.extname(filePath).toLowerCase())) {
        try {
            const metadata = await mm.parseFile(filePath)
            const name = metadata.common.title || path.basename(filePath, path.extname(filePath))
            const artist = metadata.common.artist || '鏈煡姝屾墜'

            const album = metadata.common.album || '鏈湴纾佺洏'
            const duration = (metadata.format.duration || 0) * 1000
            const formattedPath = filePath.replace(/\\/g, '/')
            const encodedPath = encodeURI(formattedPath)
            return [{
                id: 'local-' + Date.now() + Math.random(),
                name, artist, ar: [{ name: artist }],
                path: filePath,
                url: `local-file:///${encodedPath}`,
                size: stats.size,
                dt: duration,
                duration: duration / 1000,
                al: { name: album, picUrl: `song-cover:///${encodedPath}` }
            }]
        } catch (err) {
            const formattedPath = filePath.replace(/\\/g, '/')
            const encodedPath = encodeURI(formattedPath)
            return [{
                id: 'local-' + Date.now() + Math.random(),
                name: path.basename(filePath, path.extname(filePath)),
                artist: '鏈湴闊充箰', ar: [{ name: '鏈湴闊充箰' }],
                path: filePath,
                url: `local-file:///${encodedPath}`,
                size: stats.size, dt: 0, duration: 0,
                al: { name: '鏈湴纾佺洏', picUrl: '' }
            }]
        }
    }
    return []
}

ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] }]
    })
    if (canceled) return []
    let allSongs = []
    for (const fp of filePaths) {
        allSongs = allSongs.concat(await scanAudioFiles(fp))
    }
    return allSongs
})

ipcMain.handle('open-directory-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) return []
    return await scanAudioFiles(filePaths[0])
})

// 鈹€鈹€ 鏈湴瑙嗛鎵弿 鈹€鈹€
async function scanVideoFiles(filePath) {
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) {
        const files = fs.readdirSync(filePath)
        let results = []
        for (const file of files) {
            results = results.concat(await scanVideoFiles(path.join(filePath, file)))
        }
        return results
    }

    const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.ts']
    const ext = path.extname(filePath).toLowerCase()
    if (videoExts.includes(ext)) {
        const formattedPath = filePath.replace(/\\/g, '/')
        const encodedPath = encodeURI(formattedPath)
        // 灏濊瘯鎻愬彇瑙嗛鏃堕暱
        let duration = 0
        try {
            const metadata = await mm.parseFile(filePath, { duration: true })
            duration = (metadata.format.duration || 0) * 1000
        } catch (e) { /* 蹇界暐瑙ｆ瀽閿欒 */ }
        return [{
            id: 'local-video-' + Date.now() + Math.random(),
            name: path.basename(filePath, ext),
            path: filePath,
            url: `local-file:///${encodedPath}`,
            size: stats.size,
            duration: duration,
            format: ext.replace('.', '').toUpperCase()
        }]
    }
    return []
}

ipcMain.handle('open-video-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'ts'] }]
    })
    if (canceled) return []
    let allVideos = []
    for (const fp of filePaths) {
        allVideos = allVideos.concat(await scanVideoFiles(fp))
    }
    return allVideos
})

ipcMain.handle('open-video-directory-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) return []
    return await scanVideoFiles(filePaths[0])
})

ipcMain.handle('save-lyric', async (_, { songPath, lyricContent }) => {
    try {
        const lyricPath = songPath.replace(path.extname(songPath), '.lrc')
        fs.writeFileSync(lyricPath, lyricContent, 'utf8')
        return { success: true, path: lyricPath }
    } catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('load-local-lyric', async (_, songPath) => {
    try {
        const lyricPath = songPath.replace(path.extname(songPath), '.lrc')
        if (fs.existsSync(lyricPath)) {
            return { success: true, lyric: fs.readFileSync(lyricPath, 'utf8') }
        }
        return { success: false, error: 'No local lyric file found' }
    } catch (err) { return { success: false, error: err.message } }
})

// 淇濆瓨鑻辨枃瑙ｆ瀽缂撳瓨锛堟湰鍦版瓕鏇叉梺杈瑰瓨 .analysis.json锛?
ipcMain.handle('save-english-analysis', async (_, { songPath, analysis }) => {
    try {
        const cachePath = songPath.replace(path.extname(songPath), '.analysis.json')
        fs.writeFileSync(cachePath, JSON.stringify(analysis, null, 2), 'utf8')
        return { success: true, path: cachePath }
    } catch (err) { return { success: false, error: err.message } }
})

// 鍔犺浇鑻辨枃瑙ｆ瀽缂撳瓨
ipcMain.handle('load-english-analysis', async (_, songPath) => {
    try {
        const cachePath = songPath.replace(path.extname(songPath), '.analysis.json')
        if (fs.existsSync(cachePath)) {
            const data = fs.readFileSync(cachePath, 'utf8')
            return { success: true, analysis: JSON.parse(data), path: cachePath }
        }
        return { success: false, error: 'No cached analysis found' }
    } catch (err) { return { success: false, error: err.message } }
})

// 淇濆瓨鍦ㄧ嚎姝屾洸姝岃瘝鍒版湰鍦扮紦瀛橈紙鏀寔绂荤嚎浣跨敤锛?
ipcMain.handle('save-online-lyric', async (_, { songId, songName, artist, lrc, tlrc }) => {
    try {
        // 浣跨敤 app.getPath('userData') 鑾峰彇鐢ㄦ埛鏁版嵁鐩綍
        const lyricsDir = path.join(app.getPath('userData'), 'lyrics_cache')
        if (!fs.existsSync(lyricsDir)) {
            fs.mkdirSync(lyricsDir, { recursive: true })
        }
        
        // 鏂囦欢鍚嶆牸寮忥細{songId}_{songName}.lrc
        const safeName = songName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50)
        const fileName = `${songId}_${safeName}.lrc`
        const filePath = path.join(lyricsDir, fileName)
        
        // 淇濆瓨姝岃瘝锛堝寘鍚師鏂囧拰缈昏瘧锛?
        let content = lrc || ''
        if (tlrc) {
            content += '\n---trans---\n' + tlrc
        }
        
        // 娣诲姞鍏冩暟鎹ご閮?
        const meta = [
            `[ti:${songName}]`,
            `[ar:${artist}]`,
            `[id:${songId}]`,
            `[saved:${new Date().toISOString()}]`,
            ''
        ].join('\n')
        
        fs.writeFileSync(filePath, meta + content, 'utf8')
        console.log(`[LyricCache] 宸蹭繚瀛樻瓕璇? ${fileName}`)
        return { success: true, path: filePath }
    } catch (err) { 
        console.error('[LyricCache] 淇濆瓨澶辫触:', err)
        return { success: false, error: err.message } 
    }
})

// 鍔犺浇鏈湴缂撳瓨鐨勫湪绾挎瓕璇?
ipcMain.handle('load-online-lyric-cache', async (_, songId) => {
    try {
        const lyricsDir = path.join(app.getPath('userData'), 'lyrics_cache')
        
        if (!fs.existsSync(lyricsDir)) {
            return { success: false, error: 'No cache directory' }
        }
        
        // 鏌ユ壘鍖归厤鐨勬枃浠?
        const files = fs.readdirSync(lyricsDir).filter(f => f.startsWith(songId + '_') && f.endsWith('.lrc'))
        
        if (files.length === 0) {
            return { success: false, error: 'No cached lyric found' }
        }
        
        const filePath = path.join(lyricsDir, files[0])
        const content = fs.readFileSync(filePath, 'utf8')
        
        return { success: true, lyric: content, path: filePath }
    } catch (err) { 
        return { success: false, error: err.message } 
    }
})

// 淇濆瓨鍦ㄧ嚎姝屾洸鑻辨枃瑙ｆ瀽鍒版湰鍦帮紙鏀寔绂荤嚎浣跨敤锛?
ipcMain.handle('save-online-english-analysis', async (_, { songId, songName, artist, analysis }) => {
    try {
        const analysisDir = path.join(app.getPath('userData'), 'analysis_cache')
        if (!fs.existsSync(analysisDir)) {
            fs.mkdirSync(analysisDir, { recursive: true })
        }
        
        const safeName = songName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50)
        const fileName = `${songId}_${safeName}.analysis.json`
        const filePath = path.join(analysisDir, fileName)
        
        fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), 'utf8')
        console.log(`[AnalysisCache] 宸蹭繚瀛樿В鏋? ${fileName}`)
        return { success: true, path: filePath }
    } catch (err) { 
        console.error('[AnalysisCache] 淇濆瓨澶辫触:', err)
        return { success: false, error: err.message } 
    }
})

// 鍔犺浇鏈湴缂撳瓨鐨勫湪绾挎瓕鏇茶嫳鏂囪В鏋?
ipcMain.handle('load-online-english-analysis', async (_, songId) => {
    try {
        const analysisDir = path.join(app.getPath('userData'), 'analysis_cache')
        
        if (!fs.existsSync(analysisDir)) {
            return { success: false, error: 'No cache directory' }
        }
        
        const files = fs.readdirSync(analysisDir).filter(f => f.startsWith(songId + '_') && f.endsWith('.analysis.json'))
        
        if (files.length === 0) {
            return { success: false, error: 'No cached analysis found' }
        }
        
        const filePath = path.join(analysisDir, files[0])
        const data = fs.readFileSync(filePath, 'utf8')
        
        return { success: true, analysis: JSON.parse(data), path: filePath }
    } catch (err) { 
        return { success: false, error: err.message } 
    }
})

// 绐楀彛鍏ㄥ睆鎺у埗
ipcMain.handle('set-window-fullscreen', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
        win.setFullScreen(true)
        return { success: true }
    }
    return { success: false, error: 'No focused window' }
})

ipcMain.handle('exit-window-fullscreen', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
        win.setFullScreen(false)
        return { success: true }
    }
    return { success: false, error: 'No focused window' }
})

// 鏌ユ壘鏈湴 MV 瑙嗛鏂囦欢
ipcMain.handle('find-local-mv', async (_, { songName, songPath, mvDir }) => {
    const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv']
    const searchDirs = []

    // 1. 姝屾洸鎵€鍦ㄧ洰褰?
    if (songPath && fs.existsSync(songPath)) {
        const dir = path.dirname(songPath)
        if (!searchDirs.includes(dir)) searchDirs.push(dir)
    }

    // 2. 鐢ㄦ埛閰嶇疆鐨?MV 鐩綍
    if (mvDir && fs.existsSync(mvDir)) {
        if (!searchDirs.includes(mvDir)) searchDirs.push(mvDir)
    }

    // 3. 姝屾洸鐩綍涓嬬殑 mv 瀛愮洰褰?
    if (songPath) {
        const songDir = path.dirname(songPath)
        const subMvDir = path.join(songDir, 'mv')
        if (fs.existsSync(subMvDir) && !searchDirs.includes(subMvDir)) {
            searchDirs.push(subMvDir)
        }
    }

    // 娓呯悊姝屾洸鍚嶇敤浜庡尮閰嶏細绉婚櫎鎷彿鍐呭銆佺壒娈婂瓧绗?
    const cleanName = (str) => str.replace(/[\\/:*?"<>|]/g, '').trim()

    const targetName = cleanName(songName).toLowerCase()

    for (const dir of searchDirs) {
        try {
            const files = fs.readdirSync(dir)
            for (const file of files) {
                const ext = path.extname(file).toLowerCase()
                if (!videoExts.includes(ext)) continue

                const fileName = cleanName(path.basename(file, ext)).toLowerCase()

                // 绮剧‘鍖归厤鎴栧寘鍚尮閰?
                if (fileName === targetName || fileName.includes(targetName) || targetName.includes(fileName)) {
                    const fullPath = path.join(dir, file)
                    const formattedPath = fullPath.replace(/\\/g, '/')
                    const encodedPath = encodeURI(formattedPath)
                    return {
                        success: true,
                        path: fullPath,
                        url: `local-file:///${encodedPath}`,
                        name: file
                    }
                }
            }
        } catch (e) {
            // 璺宠繃鏃犳硶璁块棶鐨勭洰褰?
        }
    }

    return { success: false, error: '鏈壘鍒板尮閰嶇殑MV瑙嗛鏂囦欢' }
})

// --- 鑷姩鏇存柊 ---
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function checkForUpdates() {
    if (VITE_DEV_SERVER_URL) return
    // 姣忔鍚姩閮藉己鍒舵鏌ワ紝涓嶄娇鐢ㄧ紦瀛?
    autoUpdater.checkForUpdates().catch(() => {})
}

// 娓呴櫎鏇存柊缂撳瓨锛岀‘淇濇瘡娆￠兘鐪熸妫€娴?
try {
    const cacheDir = path.join(app.getPath('userData'), 'Cache')
    if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir)
        for (const f of files) {
            if (f.includes('update') || f.includes('electron-updater') || f.includes('github')) {
                const p = path.join(cacheDir, f)
                try { fs.rmSync(p, { recursive: true }) } catch (_) {}
            }
        }
    }
} catch (_) {}

autoUpdater.on('update-available', (info) => {
    let notes = ''
    if (typeof info.releaseNotes === 'string') {
        notes = info.releaseNotes
    } else if (Array.isArray(info.releaseNotes)) {
        notes = info.releaseNotes.map(n => n.note || '').join('\n')
    }
    win?.webContents.send('update-available', info.version, notes)
})

autoUpdater.on('update-not-available', () => {
    win?.webContents.send('update-not-available')
})

autoUpdater.on('download-progress', (progress) => {
    win?.webContents.send('update-download-progress', progress.percent)
})

autoUpdater.on('update-downloaded', () => {
    win?.webContents.send('update-downloaded')
})

ipcMain.handle('check-for-updates', () => {
    return autoUpdater.checkForUpdates().then(r => ({ version: r?.updateInfo?.version })).catch(() => null)
})

ipcMain.on('start-download-update', () => {
    autoUpdater.downloadUpdate().catch(() => {})
})

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall()
})

app.whenReady().then(() => {
    // Grant media permissions for audio device enumeration
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true)
        } else {
            callback(false)
        }
    })

    // --- Electron 22 鍏煎鎬у崗璁敞鍐?(Win7 鏀寔) ---

    // 1. local-file 鍗忚 (鏀寔 Range 璇锋眰)
    protocol.registerStreamProtocol('local-file', (request, callback) => {
        try {
            const urlStr = request.url
            // 鏀硅繘璺緞瑙ｆ瀽锛氳В鍐冲弻鏂滄潬/涓夋枩鏉犺矾寰勫尮閰嶉棶棰?
            let filePath = decodeURIComponent(urlStr.replace('local-file://', ''))
            // 鍏煎鏈変簺绯荤粺浼犲叆鐨勬槸 /C:/... 鏍煎紡
            if (process.platform === 'win32' && filePath.startsWith('/')) {
                filePath = filePath.substring(1)
            }

            // Windows 璺緞瑙勮寖鍖?
            if (process.platform === 'win32') {
                filePath = path.normalize(filePath)
            }

            if (!fs.existsSync(filePath)) {
                return callback({ statusCode: 404, data: 'Not Found' })
            }

            const stats = fs.statSync(filePath)
            const range = request.headers['Range'] || request.headers['range']

            const ext = path.extname(filePath).toLowerCase()
            const mimeMap = {
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.flac': 'audio/flac',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.ttf': 'font/ttf',
                '.otf': 'font/otf',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.mkv': 'video/x-matroska',
                '.webm': 'video/webm',
                '.avi': 'video/x-msvideo',
                '.mov': 'video/quicktime',
                '.flv': 'video/x-flv',
                '.wmv': 'video/x-ms-wmv'
            }
            const contentType = mimeMap[ext] || 'application/octet-stream'

            if (!range) {
                return callback({
                    statusCode: 200,
                    headers: {
                        'Content-Length': stats.size.toString(),
                        'Accept-Ranges': 'bytes',
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*'
                    },
                    data: fs.createReadStream(filePath)
                })
            }

            const parts = range.replace(/bytes=/, "").split("-")
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1
            const chunksize = (end - start) + 1

            callback({
                statusCode: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize.toString(),
                    'Content-Type': contentType,
                    'Access-Control-Allow-Origin': '*'
                },
                data: fs.createReadStream(filePath, { start, end })
            })
        } catch (e) {
            console.error('Local protocol error:', e)
            callback({ statusCode: 500 })
        }
    })

    // 2. song-cover 鍗忚 (甯﹀厹搴曢€昏緫)
    protocol.registerBufferProtocol('song-cover', async (request, callback) => {
        try {
            const urlStr = request.url
            const hasStaticParam = urlStr.includes('?static=1')
            let filePath = decodeURIComponent(urlStr.replace('song-cover:///', '').replace('?static=1', ''))

            if (process.platform === 'win32') {
                filePath = path.normalize(filePath)
            }

            if (!fs.existsSync(filePath)) return callback({ statusCode: 404 })

            // 鎻愬彇鍐呭祵
            try {
                const metadata = await mm.parseFile(filePath)
                if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const pic = metadata.common.picture[0]
                    // 濡傛灉瑕佹眰闈欐€佸浘鐗囦笖鍐呭祵鐨勬槸GIF锛屽垯璺宠繃浣跨敤鍏滃簳鍥?
                    if (hasStaticParam && pic.format === 'image/gif') {
                        // 璺宠繃GIF锛岀户缁煡鎵惧叾浠栧浘鐗?
                    } else {
                        return callback({ mimeType: pic.format, data: pic.data })
                    }
                }
            } catch (e) { }

            // 鎻愬彇鍚岀洰褰曞浘鐗?(gif > png > jpg > webp)
            const dir = path.dirname(filePath)
            const baseName = path.basename(filePath, path.extname(filePath))
            const exts = hasStaticParam ? ['.png', '.jpg', '.jpeg', '.webp'] : ['.gif', '.png', '.jpg', '.jpeg', '.webp']
            for (const ext of exts) {
                const imgPath = path.join(dir, baseName + ext)
                if (fs.existsSync(imgPath)) {
                    const mime = ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
                    return callback({ mimeType: mime, data: fs.readFileSync(imgPath) })
                }
            }

            // 榛樿鍏滃簳鍥?(閫氳繃 axios 璇锋眰)
            const defaultUrl = 'https://p2.music.126.net/6y-U6QnSjd_5419m1B0R_g==/109951165034938831.jpg'
            const response = await axios.get(defaultUrl, { responseType: 'arraybuffer' })
            callback({ mimeType: 'image/jpeg', data: Buffer.from(response.data) })
        } catch (e) {
            callback({ statusCode: 500 })
        }
    })

    createWindow()
    createTray()
    // 鍚姩鍚?5 绉掓娴嬫洿鏂?
    setTimeout(checkForUpdates, 5000)
})

ipcMain.on('window-minimize-to-tray', () => {
    win?.hide()
})

ipcMain.on('window-quit', () => {
    if (tray) {
        tray.destroy()
        tray = null
    }
    app.quit()
})

ipcMain.handle('download-song', async (_, { url, name, artist, picUrl }) => {
    try {
        const sanitize = (str) => String(str).replace(/[\\/:*?"<>|]/g, '_').trim()
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: '閫夋嫨淇濆瓨浣嶇疆',
            defaultPath: `${sanitize(name)} - ${sanitize(artist)}.mp3`,
            filters: [{ name: 'Audio Files', extensions: ['mp3'] }]
        })
        if (canceled || !filePath) return { success: false, canceled: true }
        const response = await axios.get(url, { responseType: 'arraybuffer' })
        fs.writeFileSync(filePath, Buffer.from(response.data))
        if (picUrl) {
            try {
                const picResponse = await axios.get(picUrl, { responseType: 'arraybuffer' })
                fs.writeFileSync(path.join(path.dirname(filePath), path.basename(filePath, '.mp3') + '.jpg'), Buffer.from(picResponse.data))
            } catch (e) { }
        }
        return { success: true, path: filePath }
    } catch (err) { return { success: false, error: err.message } }
})

ipcMain.on('open-osk', () => {
    // 閽堝 Win7-Win11 鐨勮櫄鎷熼敭鐩?
    exec('osk.exe', (err) => {
        if (err) {
            // 濡傛灉鏅€?exec 澶辫触锛屽皾璇曞叏璺緞
            const fullPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'osk.exe')
            exec(`"${fullPath}"`)
        }
    })
})

ipcMain.on('open-external', (_, url) => {
    if (url && (url.startsWith('https:') || url.startsWith('http:'))) {
        shell.openExternal(url)
    }
})

// 鈹€鈹€ 鍏冩暟鎹紪杈?鈹€鈹€
import NodeID3 from 'node-id3'

async function resizeCover(coverDataUrl) {
    if (!coverDataUrl || !coverDataUrl.startsWith('data:')) return null
    const [mime, b64] = coverDataUrl.split(';base64,')
    let imgBuf = Buffer.from(b64, 'base64')
    if (imgBuf.length > 500 * 1024) {
        try {
            const sharp = require('sharp')
            imgBuf = await sharp(imgBuf).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
        } catch (e) {
            console.warn('[save-metadata] sharp not available, skipping large cover:', e.message)
            return null
        }
    }
    return imgBuf && imgBuf.length > 0 ? imgBuf : null
}

function saveCoverTempFile(coverBuf) {
    if (!coverBuf) return null
    const tmpDir = app.getPath('temp')
    const tmpPath = path.join(tmpDir, 'cover_' + Date.now() + '.jpg')
    fs.writeFileSync(tmpPath, coverBuf)
    return tmpPath
}

// 鐢?ffmpeg 鍐欏叆鍏冩暟鎹紙鏀寔 FLAC/OGG/WAV/M4A 绛夋墍鏈夋牸寮忥級
function saveWithFfmpeg(songPath, metadata, coverBuf) {
    return new Promise((resolve, reject) => {
        const tmpOut = songPath + '.tmp'
        const args = ['-y', '-i', songPath]
        
        const metaFields = [
            ['title', metadata.title], ['artist', metadata.artist],
            ['album', metadata.album], ['date', metadata.year],
            ['genre', metadata.genre], ['track', metadata.track]
        ]
        for (const [key, val] of metaFields) {
            if (val) args.push('-metadata', `${key}=${val}`)
        }
        
        const coverFile = saveCoverTempFile(coverBuf)
        if (coverFile) args.push('-i', coverFile, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v', 'attached_pic')
        else args.push('-c', 'copy')
        
        args.push(tmpOut)
        
        execFile('ffmpeg', args, { timeout: 30000 }, (err, stdout, stderr) => {
            if (coverFile) { try { fs.unlinkSync(coverFile) } catch(e) {} }
            if (err) { 
                try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut) } catch(e) {}
                reject(new Error('ffmpeg鍐欏叆澶辫触: ' + err.message))
                return
            }
            try {
                fs.copyFileSync(tmpOut, songPath)
                fs.unlinkSync(tmpOut)
                resolve()
            } catch (e) {
                reject(new Error('鏇挎崲鏂囦欢澶辫触: ' + e.message))
            }
        })
    })
}

// MP3 鍐欏叆 (NodeID3锛屼笉闇€瑕?ffmpeg)
function saveMP3Metadata(songPath, metadata, coverBuf) {
    const tags = {
        title: metadata.title || '', artist: metadata.artist || '',
        album: metadata.album || '', year: metadata.year || '',
        genre: metadata.genre || '', trackNumber: metadata.track || ''
    }
    if (coverBuf) tags.image = { mime: 'image/jpeg', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: coverBuf }
    const success = NodeID3.write(tags, songPath)
    if (!success) throw new Error('ID3鍐欏叆澶辫触')
}

ipcMain.handle('read-song-metadata', async (_, songPath) => {
    try {
        const metadata = await mm.parseFile(songPath)
        const ext = path.extname(songPath).toLowerCase()
        const result = {
            title: metadata.common.title || '',
            artist: metadata.common.artist || '',
            album: metadata.common.album || '',
            year: metadata.common.year || '',
            genre: metadata.common.genre?.[0] || '',
            track: metadata.common.track?.no || '',
            hasCover: !!(metadata.common.picture?.length),
            format: ext.replace('.', '').toUpperCase()
        }
        // 鎻愬彇灏侀潰 base64
        if (metadata.common.picture?.length) {
            const pic = metadata.common.picture[0]
            const base64 = Buffer.from(pic.data).toString('base64')
            result.coverData = `data:${pic.format};base64,${base64}`
        }
        return { success: true, metadata: result }
    } catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('save-song-metadata', async (_, { songPath, metadata, coverDataUrl }) => {
    try {
        const ext = path.extname(songPath).toLowerCase()
        const isMP3 = ext === '.mp3'
        if (!isMP3 && !['.flac', '.ogg', '.oga', '.wav', '.m4a', '.mp4', '.aac', '.wma'].includes(ext)) {
            return { success: false, error: `鏆備笉鏀寔 ${ext} 鏍煎紡鐨勫厓鏁版嵁鍐欏叆锛堟敮鎸?MP3/FLAC/OGG/WAV/M4A 绛夛級` }
        }

        // 澶囦唤鍘熸枃浠?
        const backupPath = songPath + '.bak'
        fs.copyFileSync(songPath, backupPath)

        try {
            const coverBuf = await resizeCover(coverDataUrl)
            if (isMP3) {
                saveMP3Metadata(songPath, metadata, coverBuf)
            } else {
                await saveWithFfmpeg(songPath, metadata, coverBuf)
            }

            // 楠岃瘉鍐欏叆鍚庢枃浠舵槸鍚﹀彲璇?
            const stat = fs.statSync(songPath)
            if (stat.size < 1024) throw new Error('鍐欏叆鍚庢枃浠跺紓甯稿皬锛屽彲鑳藉凡鎹熷潖')

            fs.unlinkSync(backupPath)
            return { success: true }
        } catch (writeErr) {
            if (fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, songPath)
                fs.unlinkSync(backupPath)
            }
            throw writeErr
        }
    } catch (err) { return { success: false, error: err.message } }
})

// 涓嬭浇灏侀潰鍥剧墖鍒版湰鍦版瓕鏇插悓鐩綍
ipcMain.handle('download-cover-for-song', async (_, { songPath, coverUrl }) => {
    try {
        if (!coverUrl || !songPath) return { success: false, error: '鍙傛暟涓嶅叏' }
        const response = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
        const songDir = path.dirname(songPath)
        const songBase = path.basename(songPath, path.extname(songPath))
        const coverPath = path.join(songDir, songBase + '.jpg')
        fs.writeFileSync(coverPath, Buffer.from(response.data))
        console.log('[Cover] 灏侀潰宸蹭繚瀛?', coverPath)
        return { success: true, coverPath }
    } catch (err) {
        console.error('[Cover] 涓嬭浇灏侀潰澶辫触:', err.message)
        return { success: false, error: err.message }
    }
})

// 鎵撳紑鏂囦欢鎵€鍦ㄦ枃浠跺す
ipcMain.handle('show-item-in-folder', async (_, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            shell.showItemInFolder(filePath)
            return { success: true }
        } else {
            // 濡傛灉鏂囦欢涓嶅瓨鍦紝灏濊瘯鎵撳紑鐖舵枃浠跺す
            const dir = path.dirname(filePath)
            if (fs.existsSync(dir)) {
                shell.openPath(dir)
                return { success: true }
            }
            return { success: false, error: '璺緞涓嶅瓨鍦? }
        }
    } catch (err) {
        return { success: false, error: err.message }
    }
})

app.on('window-all-closed', () => {
    // Don't quit on window close if tray icon exists
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else win?.show()
})

