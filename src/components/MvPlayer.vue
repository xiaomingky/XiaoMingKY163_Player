<script setup>
import { usePlayerStore } from '../store/player'
import { X, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-vue-next'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const playerStore = usePlayerStore()
const videoRef = ref(null)
const containerRef = ref(null)
const isPlaying = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(100)
const isMuted = ref(false)
const showControls = ref(true)
const isFullscreen = ref(false)
const isMaximized = ref(false)
const showSizeMenu = ref(false)
const isDragging = ref(false)
const playbackRate = ref(1)

let hideControlsTimer = null

const progress = computed(() => {
    if (!duration.value) return 0
    return (currentTime.value / duration.value) * 100
})

const volumeProgress = computed(() => volume.value)

const formatTime = (s) => {
    if (!s || isNaN(s)) return '00:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const close = () => {
    if (isFullscreen.value) {
        document.exitFullscreen().catch(() => {})
        isFullscreen.value = false
    }
    playerStore.showMvPlayer = false
    playerStore.currentMvUrl = ''
    playerStore.currentMvId = null
}

const togglePlay = () => {
    const v = videoRef.value
    if (!v) return
    if (v.paused) {
        v.play()
        isPlaying.value = true
    } else {
        v.pause()
        isPlaying.value = false
    }
}

const seek = (e) => {
    const v = videoRef.value
    if (!v || !duration.value) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    v.currentTime = pct * duration.value
}

const startDrag = (e) => {
    isDragging.value = true
    seek(e)
    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', stopDrag)
}

const onDrag = (e) => {
    if (!isDragging.value) return
    const bar = document.querySelector('.mv-progress-bar')
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = videoRef.value
    if (v && duration.value) v.currentTime = pct * duration.value
}

const stopDrag = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
}

const setVolume = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    volume.value = Math.round(pct * 100)
    const v = videoRef.value
    if (v) {
        v.volume = pct
        isMuted.value = v.volume === 0
    }
}

const toggleMute = () => {
    const v = videoRef.value
    if (!v) return
    if (isMuted.value) {
        v.volume = volume.value / 100 || 1
        isMuted.value = false
    } else {
        v.volume = 0
        isMuted.value = true
    }
}

// 程序全屏（在窗口内最大化，不覆盖任务栏）
const enterAppFullscreen = () => {
    isMaximized.value = true
    isFullscreen.value = false
    showSizeMenu.value = false
}

// 屏幕全屏（Electron 窗口全屏，覆盖整个显示器）
const enterScreenFullscreen = async () => {
    const bridge = window.bridge || window.__ELECTRON_BRIDGE__
    if (bridge?.setWindowFullscreen) {
        await bridge.setWindowFullscreen()
    }
    isFullscreen.value = true
    isMaximized.value = false
    showSizeMenu.value = false
}

// 退出全屏/最大化
const exitFullscreen = async () => {
    if (isFullscreen.value) {
        const bridge = window.bridge || window.__ELECTRON_BRIDGE__
        if (bridge?.exitWindowFullscreen) {
            await bridge.exitWindowFullscreen()
        }
        isFullscreen.value = false
    }
    isMaximized.value = false
    showSizeMenu.value = false
}

// 点击放大按钮：显示选择菜单（如果已在全屏模式则退出）
const onSizeBtnClick = () => {
    if (isFullscreen.value || isMaximized.value) {
        exitFullscreen()
    } else {
        showSizeMenu.value = !showSizeMenu.value
    }
}

const skipBack = () => {
    const v = videoRef.value
    if (v) v.currentTime = Math.max(0, v.currentTime - 10)
}

const skipForward = () => {
    const v = videoRef.value
    if (v) v.currentTime = Math.min(v.duration, v.currentTime + 10)
}

const changeSpeed = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
    const idx = rates.indexOf(playbackRate.value)
    playbackRate.value = rates[(idx + 1) % rates.length]
    if (videoRef.value) videoRef.value.playbackRate = playbackRate.value
}

const showControlsTemp = () => {
    showControls.value = true
    clearTimeout(hideControlsTimer)
    if (isPlaying.value) {
        hideControlsTimer = setTimeout(() => {
            showControls.value = false
        }, 3000)
    }
}

const closeSizeMenu = () => {
    showSizeMenu.value = false
}

// 点击容器其他区域时关闭菜单
const onContainerClick = (e) => {
    const wrap = e.currentTarget.querySelector('.size-toggle-wrap')
    if (wrap && wrap.contains(e.target)) return
    if (showSizeMenu.value) showSizeMenu.value = false
}

const onTimeUpdate = () => {
    if (!isDragging.value) {
        currentTime.value = videoRef.value?.currentTime || 0
    }
}

const onLoadedMetadata = () => {
    duration.value = videoRef.value?.duration || 0
}

const onEnded = () => {
    isPlaying.value = false
}

const onVideoClick = () => {
    togglePlay()
}

const onFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement
    if (!document.fullscreenElement) {
        isMaximized.value = false
    }
}

const onKeyDown = (e) => {
    if (!playerStore.showMvPlayer) return
    if (e.key === 'Escape') close()
    else if (e.key === ' ') { e.preventDefault(); togglePlay() }
    else if (e.key === 'f' || e.key === 'F') {
        if (isFullscreen.value || isMaximized.value) exitFullscreen()
        else showSizeMenu.value = !showSizeMenu.value
    }
    else if (e.key === 'ArrowLeft') skipBack()
    else if (e.key === 'ArrowRight') skipForward()
}

onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    document.removeEventListener('keydown', onKeyDown)
    clearTimeout(hideControlsTimer)
})

watch(() => playerStore.showMvPlayer, (val) => {
    if (val) {
        isPlaying.value = true
        showControls.value = true
        playbackRate.value = 1
        isMaximized.value = false
        isFullscreen.value = false
        clearTimeout(hideControlsTimer)
        hideControlsTimer = setTimeout(() => {
            if (isPlaying.value) showControls.value = false
        }, 3000)
    }
})
</script>

<template>
  <div v-if="playerStore.showMvPlayer" class="mv-player-overlay">
    <div class="mv-container" :class="{ maximized: isMaximized, 'screen-full': isFullscreen }" ref="containerRef" @mousemove="showControlsTemp" @click="onContainerClick">

      <!-- Top bar -->
      <div class="mv-top-bar" :class="{ hidden: !showControls }" style="-webkit-app-region: drag;">
        <span class="mv-title" style="-webkit-app-region: no-drag;">MV - {{ playerStore.currentSong.name }}</span>
        <div class="top-right-btns" style="-webkit-app-region: no-drag;">
          <span class="size-hint" v-if="isMaximized && !isFullscreen">已放大</span>
          <X class="close-btn" @click="close" :size="24" title="关闭 (Esc)" />
        </div>
      </div>

      <!-- Video -->
      <div class="video-wrapper" @click="onVideoClick">
        <video
            ref="videoRef"
            :src="playerStore.currentMvUrl"
            class="mv-video"
            autoplay
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @ended="onEnded"
            @play="isPlaying = true"
            @pause="isPlaying = false"
        ></video>

        <div v-if="!isPlaying" class="center-play-btn" @click.stop="togglePlay">
            <Play :size="48" fill="white" color="white" />
        </div>
      </div>

      <!-- Custom control bar -->
      <div class="mv-control-bar" :class="{ hidden: !showControls }">
        <!-- Progress -->
        <div class="mv-progress-bar" @mousedown="startDrag" @click="seek">
            <div class="mv-progress-track">
                <div class="mv-progress-fill" :style="{ width: progress + '%' }">
                    <div class="mv-progress-dot" :class="{ visible: showControls }"></div>
                </div>
            </div>
        </div>

        <div class="mv-controls-row">
          <div class="controls-left">
            <SkipBack :size="16" class="ctrl-btn" @click.stop="skipBack" title="后退10秒" />
            <div class="ctrl-btn play-btn" @click.stop="togglePlay">
              <Play v-if="!isPlaying" :size="20" fill="white" />
              <Pause v-else :size="20" fill="white" />
            </div>
            <SkipForward :size="16" class="ctrl-btn" @click.stop="skipForward" title="前进10秒" />
            <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          </div>

          <div class="controls-right">
            <span class="speed-btn" @click.stop="changeSpeed" title="倍速">{{ playbackRate }}x</span>

            <div class="volume-group">
              <div class="ctrl-btn" @click.stop="toggleMute" title="静音">
                <VolumeX v-if="isMuted || volume === 0" :size="16" />
                <Volume2 v-else :size="16" />
              </div>
              <div class="mv-volume-slider" @mousedown="setVolume" @click="setVolume">
                <div class="mv-volume-track">
                  <div class="mv-volume-fill" :style="{ width: (isMuted ? 0 : volumeProgress) + '%' }"></div>
                </div>
              </div>
            </div>

            <div class="size-toggle-wrap">
              <div class="ctrl-btn size-toggle" @click.stop="onSizeBtnClick" :title="isFullscreen || isMaximized ? '退出全屏' : '放大 (F)'">
                <Minimize v-if="isMaximized && !isFullscreen" :size="16" />
                <Maximize v-else :size="16" />
              </div>
              <!-- 放大模式选择菜单 -->
              <div v-if="showSizeMenu && !isFullscreen && !isMaximized" class="size-menu" @click.stop>
                <div class="size-menu-item" @click.stop="enterAppFullscreen">
                  <Maximize :size="14" />
                  <span>程序全屏</span>
                  <small>在窗口内最大化</small>
                </div>
                <div class="size-menu-item" @click.stop="enterScreenFullscreen">
                  <Maximize :size="14" />
                  <span>屏幕全屏</span>
                  <small>覆盖整个屏幕</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.mv-player-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.9);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.mv-container {
  width: 80%;
  max-width: 1000px;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 50px rgba(0,0,0,0.5);
  position: relative;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.mv-container.maximized {
  width: 95%;
  max-width: 95%;
  height: 95vh;
  border-radius: 8px;
}

.mv-container.maximized .video-wrapper {
  flex: 1;
  min-height: 0;
}

/* 屏幕全屏：Electron窗口全屏时，视频容器填满整个窗口 */
.mv-container.screen-full {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  border-radius: 0 !important;
  z-index: 99999 !important;
  margin: 0 !important;
}

.mv-container.screen-full .video-wrapper {
  flex: 1;
  min-height: 0;
}

.mv-top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
  z-index: 10;
  transition: opacity 0.3s;
  pointer-events: none;
}

.mv-top-bar > * {
  pointer-events: auto;
}

.mv-top-bar.hidden {
  opacity: 0;
}

.top-right-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mv-title {
  font-size: 15px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.size-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  background: rgba(255,255,255,0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.close-btn {
  cursor: pointer;
  color: white;
  opacity: 0.8;
  transition: opacity 0.2s;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
}

.close-btn:hover {
  opacity: 1;
}

.video-wrapper {
  width: 100%;
  aspect-ratio: 16/9;
  background: #000;
  position: relative;
  cursor: pointer;
}

.mv-video {
  width: 100%;
  height: 100%;
  outline: none;
  display: block;
}

.center-play-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: transform 0.15s;
}

.center-play-btn:hover {
  transform: translate(-50%, -50%) scale(1.08);
}

/* Control bar */
.mv-control-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
  z-index: 10;
  transition: opacity 0.3s;
}

.mv-control-bar.hidden {
  opacity: 0;
  pointer-events: none;
}

/* Progress */
.mv-progress-bar {
  width: 100%;
  height: 20px;
  padding: 8px 0;
  cursor: pointer;
  position: relative;
  z-index: 2;
}

.mv-progress-track {
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.25);
  border-radius: 2px;
  position: relative;
  transition: height 0.15s;
}

.mv-progress-bar:hover .mv-progress-track {
  height: 5px;
}

.mv-progress-fill {
  height: 100%;
  background: var(--primary-color, #EC4141);
  border-radius: 2px;
  position: relative;
  min-width: 0;
}

.mv-progress-dot {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  opacity: 0;
  transition: opacity 0.2s;
}

.mv-progress-dot.visible,
.mv-progress-bar:hover .mv-progress-dot {
  opacity: 1;
}

/* Controls row */
.mv-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px 12px;
  gap: 12px;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-btn {
  color: white;
  opacity: 0.85;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.ctrl-btn:hover {
  opacity: 1;
  background: rgba(255,255,255,0.1);
}

.play-btn {
  opacity: 1;
}

.time-display {
  color: rgba(255,255,255,0.85);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
  user-select: none;
}

.speed-btn {
  color: rgba(255,255,255,0.8);
  font-size: 12px;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 3px;
  user-select: none;
  transition: all 0.15s;
}

.speed-btn:hover {
  color: white;
  background: rgba(255,255,255,0.15);
}

.size-toggle {
  transition: all 0.15s;
}

/* Size menu */
.size-toggle-wrap {
  position: relative;
}

.size-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  background: rgba(30, 30, 30, 0.95);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 160px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  backdrop-filter: blur(10px);
  animation: menuFadeIn 0.15s ease;
}

@keyframes menuFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.size-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  cursor: pointer;
  color: rgba(255,255,255,0.85);
  transition: all 0.12s;
}

.size-menu-item:hover {
  background: rgba(255,255,255,0.1);
  color: white;
}

.size-menu-item span {
  font-size: 13px;
  flex: 1;
}

.size-menu-item small {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
}

/* Volume */
.volume-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mv-volume-slider {
  width: 60px;
  height: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.mv-volume-track {
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.25);
  border-radius: 2px;
  position: relative;
}

.mv-volume-fill {
  height: 100%;
  background: white;
  border-radius: 2px;
}

.mv-volume-slider:hover .mv-volume-track {
  height: 5px;
}

/* Responsive */
@media (max-width: 768px) {
  .mv-container {
    width: 95%;
    border-radius: 0;
  }
  .mv-container.maximized {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .time-display {
    font-size: 10px;
  }
  .mv-volume-slider {
    width: 40px;
  }
}
</style>