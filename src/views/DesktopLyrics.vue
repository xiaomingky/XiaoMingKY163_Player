<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { SkipBack, SkipForward, Play, Pause, X, Music, Lock, Unlock } from 'lucide-vue-next'

const currentLyric = ref('茗韵时光')
const currentTlyric = ref('')
const nextLyric = ref('')
const nextTlyric = ref('')
const prevLyric = ref('')
const songName = ref('')
const artist = ref('')
const picUrl = ref('')
const isPlaying = ref(false)
const currentFont = ref('')
const currentColor = ref('#ec4141')
const isLocked = ref(false)

// 逐词歌词高频动画插值所用的状态
const currentWords = ref(null)
const localCurrentMs = ref(0)
let lastFrameTime = performance.now()
let animFrameId = null

const getBridge = () => {
  return window.__ELECTRON_BRIDGE__ || window.bridge || window.ipcHandler || window.ipcRenderer || window.electron
}

let removeListener = null

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

// 60fps 逐字插值高亮动画循环（完美对齐 SongDetail 核心逻辑）
const updateYrcProgress = () => {
    if (isPlaying.value && currentWords.value && currentWords.value.length > 0) {
        const now = performance.now()
        const delta = now - lastFrameTime
        lastFrameTime = now
        
        // 增量推进本地高精时间
        localCurrentMs.value += delta
        
        // 渲染 DOM 渐变高亮
        const wordSpans = document.querySelectorAll('.yrc-word')
        wordSpans.forEach(el => {
            const ws = parseFloat(el.dataset.ws)
            const wd = parseFloat(el.dataset.wd)
            if (!isNaN(ws) && !isNaN(wd)) {
                let progress = 0
                if (localCurrentMs.value >= ws + wd) {
                    progress = 1
                } else if (localCurrentMs.value > ws && wd > 0) {
                    progress = (localCurrentMs.value - ws) / wd
                }
                el.style.setProperty('--wp', progress)
            }
        })
    } else {
        lastFrameTime = performance.now()
    }
    animFrameId = requestAnimationFrame(updateYrcProgress)
}

const handleStateChange = (_, data) => {
    prevLyric.value = data.prevLyric || ''
    if (data.songName) {
        currentLyric.value = (data.lyric !== undefined && data.lyric !== null) ? data.lyric : ''
    } else {
        currentLyric.value = data.lyric || '茗韵时光'
    }
    currentTlyric.value = data.tlyric || ''
    nextLyric.value = data.nextLyric || ''
    nextTlyric.value = data.nextTlyric || ''
    isPlaying.value = data.isPlaying
    songName.value = data.songName || ''
    artist.value = data.artist || ''
    picUrl.value = data.picUrl || ''
    currentFont.value = data.font || ''
    
    // 如果没有自定义配色，使用网易云标志红作为缺省高亮色
    currentColor.value = data.color && data.color !== '#00E5FF' ? data.color : '#ec4141'
    
    // 识别并同步逐词歌词数据与基准时间戳
    if (data.words && data.words.length > 0) {
        currentWords.value = data.words
        localCurrentMs.value = data.currentMs || 0
        lastFrameTime = performance.now()
    } else {
        currentWords.value = null
    }
}

const currentLyricRef = ref(null)

const checkMarquee = () => {
    const el = currentLyricRef.value
    if (!el) return
    
    // 清除已有的滚动样式
    el.style.removeProperty('--scroll-amount')
    el.style.removeProperty('--scroll-duration')
    el.classList.remove('marquee-active')
    
    nextTick(() => {
        const container = el.parentElement
        if (!container) return
        
        const containerWidth = container.clientWidth
        const contentWidth = el.scrollWidth
        
        if (contentWidth > containerWidth) {
            const scrollAmount = containerWidth - contentWidth - 30
            el.style.setProperty('--scroll-amount', `${scrollAmount}px`)
            
            // 匀速滚动时间计算（约每秒移动35像素）
            const duration = Math.max(6, Math.min(25, Math.abs(scrollAmount) / 35))
            el.style.setProperty('--scroll-duration', `${duration}s`)
            el.classList.add('marquee-active')
        }
    })
}

watch([currentLyric, currentWords], () => {
    setTimeout(checkMarquee, 150)
}, { deep: true, flush: 'post' })

onMounted(() => {
    registerFonts()
    const b = getBridge()
    if (b && b.on) {
        removeListener = b.on('lyric-state-change', handleStateChange)
        b.on('lyric-lock-state-changed', (_, locked) => {
            isLocked.value = locked
        })
    }
    // 主动向主进程拉取最新播放歌词状态，避免热重载或冷启动时的任何空白与未同步残留
    if (b && b.send) {
        b.send('request-lyric-state')
    }
    // 开启高亮插值轮询
    lastFrameTime = performance.now()
    animFrameId = requestAnimationFrame(updateYrcProgress)
})

onUnmounted(() => {
    if (removeListener) removeListener()
    if (animFrameId) cancelAnimationFrame(animFrameId)
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
  <div class="desktop-lyric-container" :class="{ locked: isLocked }">
    <div class="widget-card" :class="{ 'card-locked': isLocked }">
      <!-- 拖拽底层限缩在卡片物理内部，当未锁定时，卡片内空白处可拖动，框外不响应拖拽 -->
      <div class="drag-overlay" :class="{ 'no-drag': isLocked }"></div>
      
      <!-- 左侧：封面与控制器 -->
      <div class="left-panel no-drag">
        <div class="cover-wrapper" :class="{ playing: isPlaying }">
          <img v-if="picUrl" :src="picUrl" class="cover-img" />
          <div v-else class="cover-fallback">
            <Music :size="32" class="music-icon" />
          </div>
        </div>
        
        <!-- 封面下方的播放控制器 -->
        <div class="compact-controls">
          <button class="icon-btn" @click="sendCommand('prev')" title="上一首">
            <SkipBack :size="14" fill="currentColor" />
          </button>
          <button class="play-btn-circle" @click="sendCommand('togglePlay')" :title="isPlaying ? '暂停' : '播放'">
            <Play v-if="!isPlaying" :size="12" fill="currentColor" style="margin-left: 1px;" />
            <Pause v-else :size="12" fill="currentColor" />
          </button>
          <button class="icon-btn" @click="sendCommand('next')" title="下一首">
            <SkipForward :size="14" fill="currentColor" />
          </button>
        </div>
      </div>

      <!-- 右侧：歌曲信息与歌词 -->
      <div class="right-panel">
        <!-- 顶部歌曲元数据 -->
        <div class="song-header">
          <span class="song-title" :title="songName">{{ songName || '茗韵时光' }}</span>
          <span class="song-artist" :title="artist">{{ artist || '享受音乐' }}</span>
        </div>

        <!-- 歌词展示区域 -->
        <div class="lyric-content-area" :style="{ fontFamily: currentFont ? `'${currentFont}', sans-serif` : '' }">
          <!-- 当前句 -->
          <div class="lyric-line-current">
            <!-- 逐词歌词模式 -->
            <div 
              v-if="currentWords && currentWords.length > 0" 
              ref="currentLyricRef"
              class="lyric-text-current yrc-text" 
              :style="{ color: currentColor }"
            >
              <span 
                  v-for="(word, wi) in currentWords" 
                  :key="wi"
                  class="yrc-word"
                  :data-ws="word.startTime"
                  :data-wd="word.duration"
                  style="--wp: 0"
              >{{ word.text }}</span>
            </div>
            <!-- 普通歌词模式 -->
            <span 
              v-else 
              ref="currentLyricRef"
              class="lyric-text-current" 
              :style="{ color: currentColor }"
            >{{ currentLyric }}</span>
            
            <span v-if="currentTlyric" class="lyric-trans-current" :style="{ color: currentColor }">{{ currentTlyric }}</span>
          </div>
          <!-- 下一句 -->
          <div class="lyric-line-next" v-if="nextLyric">
            <span class="lyric-text-next">{{ nextLyric }}</span>
          </div>
        </div>
      </div>

      <!-- 右上角悬浮控制按钮（仅在未锁定时且鼠标悬停时显示） -->
      <div class="floating-actions no-drag" v-if="!isLocked">
        <button class="action-btn-mini lock-btn" @click="toggleLock" title="锁定桌面歌词（锁定后鼠标可穿透）">
          <Lock :size="13" />
        </button>
        <button class="action-btn-mini close-btn" @click="close" title="关闭">
          <X :size="13" />
        </button>
      </div>
    </div>

    <!-- 锁定时的底部半透明悬浮解锁按钮 -->
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
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 锁定状态下，整体容器不可交互，允许鼠标穿透 */
.desktop-lyric-container.locked {
  pointer-events: none;
}

/* 拖拽底层覆盖整个窗口 */
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
  pointer-events: none;
}

.no-drag {
  -webkit-app-region: no-drag;
}

/* 网易云经典红白配色长方形小卡片 */
.widget-card {
  position: relative;
  z-index: 10;
  width: 860px;
  height: 176px;
  display: flex;
  align-items: center;
  background: #ffffff; /* 未锁定状态下纯白背景 */
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  padding: 18px 24px;
  box-sizing: border-box;
  box-shadow: 
    0 16px 40px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

/* 锁定状态：毛玻璃半透明风格，优雅融入桌面壁纸，增加阴影立体感与文字描边 */
.widget-card.card-locked {
  background: rgba(255, 255, 255, 0.22) !important;
  backdrop-filter: blur(14px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(14px) saturate(140%) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15) !important;
}

/* 左侧：封面与控制器 */
.left-panel {
  width: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-right: 24px;
  z-index: 2;
}

/* 封面封套 */
.cover-wrapper {
  position: relative;
  width: 90px;
  height: 90px;
  border-radius: 18px;
  overflow: hidden;
  background: #f5f5f5;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.cover-wrapper.playing {
  box-shadow: 0 8px 20px rgba(236, 65, 65, 0.25);
  transform: scale(1.03);
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.cover-wrapper:hover .cover-img {
  transform: scale(1.1);
}

.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ec4141; /* 网易红 fallback */
  background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%);
}

.music-icon {
  animation: pulse-icon 2s infinite ease-in-out;
}

@keyframes pulse-icon {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.08); opacity: 0.8; }
}

/* 紧凑控制器布局（网易云经典红配色） */
.compact-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #555555; /* 深灰 */
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  border-radius: 50%;
}

.icon-btn:hover {
  color: #ec4141; /* 网易红 */
  transform: scale(1.15);
}

.play-btn-circle {
  width: 26px;
  height: 26px;
  background: #ec4141; /* 经典网易红 */
  border: none;
  border-radius: 50%;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 10px rgba(236, 65, 65, 0.3);
}

.play-btn-circle:hover {
  background: #d32f2f;
  transform: scale(1.12);
  box-shadow: 0 4px 12px rgba(236, 65, 65, 0.4);
}

/* 右侧：歌曲信息与歌词 */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  min-width: 0;
  z-index: 2;
  padding: 4px 0;
}

/* 顶部歌曲元数据 */
.song-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  padding-bottom: 6px;
  transition: all 0.3s ease;
}

.card-locked .song-header {
  border-bottom-color: rgba(255, 255, 255, 0.15);
}

.song-title {
  font-size: 16px;
  font-weight: 700;
  color: #333333;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.card-locked .song-title {
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.song-artist {
  font-size: 12px;
  color: #666666;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-locked .song-artist {
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

/* 歌词展示区域 */
.lyric-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  margin-top: 6px;
}

/* 当前句样式 */
.lyric-line-current {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.lyric-text-current {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.25;
  white-space: nowrap;
  display: inline-block;
  width: max-content;
  max-width: 100%;
  transition: color 0.3s ease;
  color: #111111;
  text-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.card-locked .lyric-text-current {
  color: #ffffff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.marquee-active {
  max-width: none !important;
  animation: marquee-scroll var(--scroll-duration, 10s) linear infinite alternate;
}

@keyframes marquee-scroll {
  0%, 15% {
    transform: translateX(0);
  }
  85%, 100% {
    transform: translateX(var(--scroll-amount));
  }
}

.lyric-trans-current {
  font-size: 15px;
  font-weight: 400;
  opacity: 0.85;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #555555;
  text-shadow: 0 1px 1px rgba(0,0,0,0.05);
}

.card-locked .lyric-trans-current {
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

/* 逐词歌词渐变渲染系统 */
.yrc-text {
  display: inline-block !important;
  white-space: nowrap !important;
}

.yrc-word {
  display: inline-block;
  white-space: pre;
  /* 未唱到时的底色：偏灰黑 */
  background: linear-gradient(to right, currentColor calc(var(--wp, 0) * 100%), rgba(0, 0, 0, 0.32) calc(var(--wp, 0) * 100%));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  will-change: background;
  transition: background 0.05s linear;
}

/* 锁定状态下的逐词歌词底色 */
.card-locked .yrc-word {
  /* 未唱到时的底色：淡白色 */
  background: linear-gradient(to right, currentColor calc(var(--wp, 0) * 100%), rgba(255, 255, 255, 0.36) calc(var(--wp, 0) * 100%));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* 下一句样式 */
.lyric-line-next {
  min-width: 0;
  margin-top: 2px;
}

.lyric-text-next {
  font-size: 14px;
  font-weight: 400;
  color: #888888;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.3s ease;
}

.card-locked .lyric-text-next {
  color: rgba(255, 255, 255, 0.5);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 右上角悬浮控制 */
.floating-actions {
  position: absolute;
  top: 14px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transform: translateY(-5px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
}

.widget-card:hover .floating-actions {
  opacity: 1;
  transform: translateY(0);
}

.action-btn-mini {
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  color: #555555;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-locked .action-btn-mini {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
}

.action-btn-mini:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #111;
  transform: scale(1.08);
}

.card-locked .action-btn-mini:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.lock-btn:hover {
  color: #ec4141 !important;
  background: rgba(236, 65, 65, 0.1) !important;
  border-color: rgba(236, 65, 65, 0.15) !important;
}

.close-btn:hover {
  color: #ff4d4d !important;
  background: rgba(255, 77, 77, 0.1) !important;
  border-color: rgba(255, 77, 77, 0.15) !important;
}

/* 解锁悬浮按钮 */
.unlock-area {
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 200;
}

.unlock-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 5px 15px;
  border-radius: 16px;
  color: #333333;
  font-size: 11px;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: all 0.2s ease;
}

.unlock-btn:hover {
  background: #ec4141;
  color: #fff;
  border-color: #ec4141;
  transform: translateY(-1px);
}
</style>
