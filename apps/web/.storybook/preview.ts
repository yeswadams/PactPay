import type { Preview } from "@storybook/react-vite";
import "../src/app/globals.css";
const preview:Preview={parameters:{layout:"padded",a11y:{test:"error"},backgrounds:{options:{light:{name:"Light",value:"#f6f7f9"}}}},initialGlobals:{backgrounds:{value:"light"}}};
export default preview;
