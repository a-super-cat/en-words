import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { useApp } from './stores/app';
import { useSpeaking } from './stores/speaking';
import { useVocab } from './stores/vocab';
import { useWords } from './stores/words';
import './style.css';

const vm = createApp(App);
vm.use(createPinia());
vm.use(router);
vm.mount('#app');

const app = useApp();
void app.init();
Promise.all([useSpeaking().load(), useVocab().load(), useWords().load()]).catch(
  (e: unknown) => (app.error = e instanceof Error ? e.message : String(e)),
);
