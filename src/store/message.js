import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMessageStore = defineStore('message', () => {
    const messages = ref([])

    const show = (text, type = 'info', duration = 3000, profile = null) => {
        const id = Date.now()
        messages.value.push({ id, text, type, profile })
        setTimeout(() => {
            const index = messages.value.findIndex(m => m.id === id)
            if (index !== -1) messages.value.splice(index, 1)
        }, duration)
    }

    const success = (text, duration, profile = null) => show(text, 'success', duration, profile)
    const error = (text, duration) => show(text, 'error', duration)
    const info = (text, duration) => show(text, 'info', duration)
    const warning = (text, duration) => show(text, 'warning', duration)

    const clearAll = () => {
        messages.value = []
    }

    return {
        messages,
        show,
        success,
        error,
        info,
        warning,
        clearAll
    }
})
