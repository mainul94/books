import './styles/index.css';
import { createApp } from 'vue'
import Desk from './pages/Desk.vue'
import router from './router'
import i18n from './i18n'
// import { session } from "@/data/session"
// import { resourcesPlugin, frappeRequest, setConfig } from 'frappe-ui'

const app = createApp(Desk)

app.use(router)
// setConfig('resourceFetcher', frappeRequest)
// app.use(resourcesPlugin)
// app.provide("$session", session)
app.config.globalProperties.t = (args) => {
    // Implement your translation logic here
    return i18n.global.t(...args);
};

app.mount('#app')
