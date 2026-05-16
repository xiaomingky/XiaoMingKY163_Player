import { createRouter, createWebHashHistory } from 'vue-router'
import Discovery from '../views/Discovery.vue'
import PlaylistDetail from '../views/PlaylistDetail.vue'
import Video from '../views/Video.vue'
import Search from '../views/Search.vue'
import LocalMusic from '../views/LocalMusic.vue'
import RecentPlay from '../views/RecentPlay.vue'
import LocalVideo from '../views/LocalVideo.vue'
import AlbumDetail from '../views/AlbumDetail.vue'

const routes = [
    {
        path: '/',
        name: 'Discovery',
        component: Discovery
    },
    {
        path: '/playlist/:id',
        name: 'PlaylistDetail',
        component: PlaylistDetail
    },
    {
        path: '/video',
        name: 'Video',
        component: Video
    },
    {
        path: '/search',
        name: 'Search',
        component: Search
    },
    {
        path: '/local',
        name: 'LocalMusic',
        component: LocalMusic
    },
    {
        path: '/recent',
        name: 'RecentPlay',
        component: RecentPlay
    },
    {
        path: '/local-video',
        name: 'LocalVideo',
        component: LocalVideo
    },
    {
        path: '/album/:id',
        name: 'AlbumDetail',
        component: AlbumDetail
    },
    {
        path: '/desktop-lyrics',
        name: 'DesktopLyrics',
        component: () => import('../views/DesktopLyrics.vue')
    }
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

export default router
