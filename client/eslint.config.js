import vue from 'eslint-plugin-vue';

export default [
  ...vue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'vue/multi-word-component-names': 'off' }
  }
];
