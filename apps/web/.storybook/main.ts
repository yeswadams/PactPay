import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "node:url";
const config:StorybookConfig={stories:["../src/**/*.stories.tsx"],addons:["@storybook/addon-a11y"],framework:"@storybook/react-vite",viteFinal:async config=>({...config,resolve:{...config.resolve,alias:{...config.resolve?.alias,"@":fileURLToPath(new URL("../src",import.meta.url))}}})};
export default config;
