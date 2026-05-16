<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { SkipBack, SkipForward, Play, Pause, X, Music, Lock, Unlock } from 'lucide-vue-next'

const currentLyric = ref('茗韵时光')
const currentTlyric = ref('')
const nextLyric = ref('')
const nextTlyric = ref('')
const prevLyric = ref('')
const songName = ref('')
const artist = ref('')
const isPlaying = ref(false)
const currentFont = ref('')
const currentColor = ref('#00E5FF')
const showInfo = ref(true)
const isLocked = ref(false)

const getBridge = () => {
  return window.__ELECTRON_BRIDGE__ || window.bridge || window.ipcHandler || window.ipcRenderer || window.electron
}

let removeListener = null
let infoTimer = null

const registerFonts = async () => {
    const b = getBridge()
    if (b && b.invoke) {
        const fonts = await b.invoke('scan-fonts')
        fonts.forEach(async (f) => {
            const safeUrl = f.url.split('://')[0] + '://' + encodeURI(f.url.split('://')[1])
            try {
                const font = new FontFace(f.name, `url("${safeUrl}")`)
                await font.load()
                document.fonts.add(font)
            } catch (e) {
                const fontId = `font-face-${f.name.replace(/\s+/g, '-')}`
                if (!document.getElementById(fontId)) {
                    const style = document.createElement('style')
                    style.id = fontId
                    style.textContent = `@font-face { font-family: "${f.name}"; src: url("${safeUrl}"); }`
                    document.head.appendChild(style)
                }
            }
        })
    }
}

const handleStateChange = (_, data) => {
    prevLyric.value = data.prevLyric || ''
    currentLyric.value = data.lyric || '茗韵时光'
    currentTlyric.value = data.tlyric || ''
    nextLyric.value = data.nextLyric || ''
    nextTlyric.value = data.nextTlyric || ''
    isPlaying.value = data.isPlaying
    songName.value = data.songName || ''
    artist.value = data.artist || ''
    currentFont.value = data.font || ''
    currentColor.value = data.color || '#00E5FF'
}

const hasCurrent = computed(() => currentLyric.value && currentLyric.value !== '茗韵时光')
const hasNext = computed(() => !!nextLyric.value)
const hasSongInfo = computed(() => !!songName.value)

const showInfoPanel = () => {
    showInfo.value = true
    clearTimeout(infoTimer)
    infoTimer = setTimeout(() => {
        showInfo.value = false
    }, 4000)
}

onMounted(() => {
    registerFonts()
    const b = getBridge()
    if (b && b.on) {
        removeListener = b.on('lyric-state-change', handleStateChange)
        b.on('lyric-lock-state-changed', (_, locked) => {
            isLocked.value = locked
        })
    }
    showInfoPanel()
})

onUnmounted(() => {
    if (removeListener) removeListener()
    clearTimeout(infoTimer)
})

const sendCommand = (cmd) => {
    const b = getBridge()
    if (b && b.send) {
        b.send('lyric-window-command', cmd)
    }
}

const toggleLock = () => {
    isLocked.value = !isLocked.value
    const b = getBridge()
    if (b && b.send) {
        b.send('lyric-window-lock', { locked: isLocked.value })
    }
}

const close = () => {
    const b = getBridge()
    if (b && b.send) {
        b.send('toggle-desktop-lyrics', false)
    }
}
</script>

<template>
  <div class="desktop-lyric-container" :class="{ locked: isLocked }" @dblclick="showInfoPanel">
    <div class="drag-overlay" :class="{ 'no-drag': isLocked }"></div>

    <!-- 居中：当前句 -->
    <div class="lyric-pos pos-current" :style="{ fontFamily: currentFont ? `'${currentFont}', sans-serif` : '' }">
      <div v-if="hasCurrent" class="current-block">
        <span class="current-main" :style="{ color: currentColor }">{{ currentLyric }}</span>
        <span v-if="currentTlyric" class="current-trans" :style="{ color: currentColor }">{{ currentTlyric }}</span>
      </div>
      <div v-else class="current-block">
        <span class="current-main" :style="{ color: currentColor }">茗韵时光</span>
        <span class="current-trans" :style="{ color: currentColor }">等待播放</span>
      </div>
    </div>

    <!-- 右下：下一句 -->
    <div class="lyric-pos pos-next" :style="{ fontFamily: currentFont ? `'${currentFont}', sans-serif` : '' }">
      <span class="next-text" :style="{ color: currentColor }">{{ nextLyric }}</span>
    </div>

    <Transition name="info-fade">
        <div v-if="showInfo && hasSongInfo" class="song-info-panel">
            <Music :size="14" />
            <span class="info-text">{{ songName }}&nbsp;—&nbsp;{{ artist }}</span>
        </div>
    </Transition>

    <!-- 正常控制栏（未锁定时显示） -->
    <div class="controls-bar no-drag" v-if="!isLocked">
        <SkipBack :size="15" class="control-btn" @click="sendCommand('prev')" />
        <div class="play-btn-mini" @click="sendCommand('togglePlay')">
          <Play v-if="!isPlaying" :size="13" fill="currentColor" style="margin-left:1px" />
          <Pause v-else :size="13" fill="currentColor" />
        </div>
        <SkipForward :size="15" class="control-btn" @click="sendCommand('next')" />
        <div class="divider-ctrl"></div>
        <div class="control-btn lock-btn" @click="toggleLock" title="锁定桌面歌词（锁定后鼠标可穿透）">
            <Lock :size="14" />
        </div>
        <X :size="14" class="control-btn close" @click="close" />
    </div>

    <!-- 锁定时：底部悬浮解锁按钮（hover 底部区域出现） -->
    <div class="unlock-area" v-if="isLocked">
        <div class="unlock-btn no-drag" @click.stop="toggleLock" title="点击解锁">
            <Unlock :size="12" />
            <span>解锁</span>
        </div>
    </div>
  </div>
</template>

<style scoped>
:deep(body), :deep(html), .desktop-lyric-container {
  background-color: transparent !important;
  background: transparent !important;
}

.desktop-lyric-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  user-select: none;
  overflow: hidden;
  padding: 20px 30px;
  box-sizing: border-box;
}

.desktop-lyric-container.locked .lyric-pos,
.desktop-lyric-container.locked .drag-overlay,
.desktop-lyric-container.locked .song-info-panel {
  pointer-events: none;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  -webkit-app-region: drag;
  z-index: 1;
}

.drag-overlay.no-drag {
  -webkit-app-region: no-drag;
}

/* 底部解锁悬浮区域 */
.unlock-area {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 8px;
  pointer-events: none;
}

.unlock-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  padding: 5px 14px;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 0.3s;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.unlock-btn:hover {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.unlock-area:hover .unlock-btn {
  opacity: 1;
}

.no-drag {
  -webkit-app-region: no-drag;
}

/* ---- 三句歌词定位 ---- */
.lyric-pos {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 当前句：居中 */
.pos-current {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
  max-width: 90%;
}

.current-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.current-main {
  font-size: 46px;
  font-weight: 900;
  letter-spacing: 0.5px;
  line-height: 1.15;
  word-break: break-word;
  filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.5))
          drop-shadow(0 0 20px rgba(255, 255, 255, 0.12));
}

.current-trans {
  font-size: 22px;
  font-weight: 400;
  opacity: 0.75;
  line-height: 1.3;
  filter: drop-shadow(1px 1px 3px rgba(0, 0, 0, 0.4));
}

/* 下一句：右下 */
.pos-next {
  bottom: 45px;
  right: 20px;
  text-align: right;
  max-width: 50%;
  opacity: 0.4;
}

.next-text {
  font-size: 18px;
  font-weight: 400;
  line-height: 1.3;
  filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.3));
  word-break: break-word;
}

/* ---- 歌曲信息条 ---- */
.song-info-panel {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(6px);
    padding: 6px 18px;
    border-radius: 16px;
    z-index: 10;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    pointer-events: none;
}

.info-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 500px;
}

.info-fade-enter-active,
.info-fade-leave-active {
    transition: opacity 0.5s;
}
.info-fade-enter-from,
.info-fade-leave-to {
    opacity: 0;
}

/* ---- 底部控制栏 ---- */
.controls-bar {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  padding: 6px 16px;
  border-radius: 20px;
  opacity: 0;
  transition: opacity 0.35s;
  z-index: 100;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.desktop-lyric-container:hover .controls-bar {
  opacity: 1;
}

.control-btn {
  color: #fff;
  cursor: pointer;
  opacity: 0.65;
  transition: all 0.2s;
}

.control-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.lock-btn:hover {
  opacity: 1;
  color: #fbbf24;
}

.play-btn-mini {
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.play-btn-mini:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: scale(1.1);
}

.divider-ctrl {
    width: 1px;
    height: 12px;
    background: rgba(255, 255, 255, 0.15);
}

.close:hover {
  color: #ff4d4d;
}
</style>
