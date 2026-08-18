import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

const vueConfig = defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      // ⬇️ Matikan aturan multi-word name
      'vue/multi-word-component-names': 'off',
    },
  },
)

export default [
  {
    ignores: ['eslint.config.ts'], // <-- Aturan untuk mengabaikan file ini
  },
  ...vueConfig, // <-- Sebarkan sisa konfigurasi Anda dari helper Vue
]
