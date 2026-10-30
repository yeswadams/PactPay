import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e",timeout:120000,expect:{timeout:20000},fullyParallel:false,workers:1,retries:0,reporter:"list",use:{baseURL:process.env.DEMO_WEB_URL??"http://127.0.0.1:3001",headless:true,trace:"retain-on-failure",screenshot:"only-on-failure",viewport:{width:1440,height:1000},timezoneId:"UTC"}});
