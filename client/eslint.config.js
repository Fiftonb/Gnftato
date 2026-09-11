import vue from 'eslint-plugin-vue';

export default [
  ...vue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-dupe-keys': 'error',
      'vue/multi-word-component-names': 'off'
    }
  }
];
