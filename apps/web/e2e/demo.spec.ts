import { test,expect,type Browser,type Page } from "@playwright/test";
import { createPublicClient,createWalletClient,http,type Address } from "viem";
import { anvil } from "viem/chains";
import { readFile } from "node:fs/promises";
import { financingAbi } from "@pactpay/blockchain";
const rpc=process.env.RPC_URL??"http://127.0.0.1:8545";
const wallet=createWalletClient({chain:anvil,transport:http(rpc)});const client=createPublicClient({chain:anvil,transport:http(rpc)});
async function newWalletPage(browser:Browser,index:number,options:{rejectSignature?:boolean;chainId?:string}={}){
 const accounts=await wallet.getAddresses();const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:"UTC"});
 await context.addInitScript(({account,rpc,options})=>{let active:string=account;let chain=options.chainId??"0x7a69";const listeners:Record<string,Set<(...args:unknown[])=>void>>={};const control={rejectSignature:options.rejectSignature??false,rejectTransaction:false,setAccount(value:string){active=value;for(const callback of listeners.accountsChanged??[])callback([active]);}};
 const provider={isMetaMask:true,on(event:string,callback:(...args:unknown[])=>void){(listeners[event]??=new Set()).add(callback);},removeListener(event:string,callback:(...args:unknown[])=>void){listeners[event]?.delete(callback);},async request({method,params=[]}:{method:string;params:unknown[]}){if(method==="eth_requestAccounts"||method==="eth_accounts")return[active];if(method==="eth_chainId")return chain;if(method==="wallet_switchEthereumChain"){chain=(params[0] as {chainId:string}).chainId;for(const callback of listeners.chainChanged??[])callback(chain);return null;}if(method==="wallet_requestPermissions")return[{parentCapability:"eth_accounts"}];if(method==="wallet_getPermissions")return[{parentCapability:"eth_accounts"}];if(method==="personal_sign"&&control.rejectSignature||method==="eth_sendTransaction"&&control.rejectTransaction)throw Object.assign(new Error("User rejected the wallet request"),{code:4001});const response=await fetch(rpc,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:Date.now(),method,params})});const json=await response.json();if(json.error)throw Object.assign(new Error(json.error.message),{code:json.error.code});return json.result;}};
 Object.defineProperty(window,"ethereum",{value:provider,configurable:true});Object.defineProperty(window,"__pactpayWallet",{value:control});
 },{account:accounts[index],rpc,options});const page=await context.newPage();return{context,page,address:accounts[index]};
}
async function signIn(page:Page,origin=""){await page.goto(`${origin}/login`);await page.getByRole("button",{name:/^Connect (wallet|MetaMask)$/}).click();await page.getByRole("button",{name:"Sign in securely"}).click();await expect(page).toHaveURL(/\/app|\/onboarding/);}
for (const origin of ["http://localhost:3001", "http://127.0.0.1:3001"]) {
 test(`real wallet login reaches dashboard at ${origin}`,async({browser})=>{
  const {page,context,address}=await newWalletPage(browser,6);
  const hydrationErrors:string[]=[];page.on("pageerror",error=>{if(/hydration|server rendered HTML/i.test(error.message))hydrationErrors.push(error.message);});
  const challengeResponse=page.waitForResponse(response=>response.url().endsWith("/auth/challenge")&&response.request().method()==="POST");
  await signIn(page,origin);
  const challenge=await challengeResponse;expect(challenge.status()).toBe(200);
  const body=await challenge.json();expect(body.data.message).toContain(`${new URL(origin).host} wants you to sign in`);expect(body.data.message).toContain(`URI: ${origin}/login`);
  await expect(page).toHaveURL(`${origin}/app`);
  await expect(page.getByRole("heading",{level:1})).toBeVisible();
  const session=await(await page.request.get(`${origin}/api/v1/auth/session`)).json();expect(session.data.user.walletAddress.toLowerCase()).toBe(address.toLowerCase());
  await page.reload();await expect(page.getByRole("heading",{level:1})).toBeVisible();expect(hydrationErrors).toEqual([]);
  await context.close();
 });
}
async function continueToWallet(page:Page){await page.getByRole("button",{name:"Continue to wallet",exact:true}).click();}
for (const operator of [{index:1,scope:"verifier",route:"verification",heading:"Verification queue"},{index:2,scope:"lister",route:"approvals",heading:"Financing approvals"}]) {
 test(`operator ${operator.scope} bypasses organization onboarding`,async({browser})=>{
  const {page,context}=await newWalletPage(browser,operator.index);await signIn(page);
  await expect(page).toHaveURL(/\/app$/);
  const session=await(await page.request.get("/api/v1/auth/session")).json();expect(session.data.scopes).toContain(operator.scope);
  await page.goto(`/app/admin/${operator.route}`);await expect(page.getByRole("heading",{name:operator.heading,exact:true})).toBeVisible();
  await page.goto("/onboarding");await expect(page).toHaveURL(/\/app$/);
  await context.close();
 });
}
test("wallet sign-in, real contribution, mobile navigation and account invalidation",async({browser})=>{
 const {page,context,address}=await newWalletPage(browser,6);await signIn(page);await page.goto("/app/marketplace");await expect(page.getByRole("heading",{name:"Financing marketplace"})).toBeVisible();await expect(page.getByRole("link",{name:"Verification queue",exact:true})).toHaveCount(0);
 const catalog=await(await page.request.get("/api/v1/listings")).json();const offer=catalog.data.items.find((row:{state:number})=>row.state===2);expect(offer).toBeTruthy();await page.goto(`/app/marketplace/${offer.id}`);await page.getByLabel("Contribution (MOCK)").fill("1");
 await page.evaluate(()=>{(window as unknown as {__pactpayWallet:{rejectTransaction:boolean}}).__pactpayWallet.rejectTransaction=true;});await page.getByRole("button",{name:"Approve exact amount",exact:true}).click();await continueToWallet(page);await expect(page.getByRole("alert").filter({hasText:/wallet|request|rejected|couldn’t/i}).first()).toBeVisible();
 await page.evaluate(()=>{(window as unknown as {__pactpayWallet:{rejectTransaction:boolean}}).__pactpayWallet.rejectTransaction=false;});await page.getByRole("button",{name:"Approve exact amount",exact:true}).click();await continueToWallet(page);await expect(page.getByRole("button",{name:"Fund this invoice",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Fund this invoice",exact:true}).click();await continueToWallet(page);await expect(page.getByRole("status")).toContainText("Confirmed and synchronized");
 const deployment=JSON.parse(await readFile(new URL("../../../packages/blockchain/deployments/31337.json",import.meta.url),"utf8"));const position=await client.readContract({address:deployment.financing,abi:financingAbi,functionName:"positions",args:[offer.commitment,address]});expect(position[0]).toBe(1000000n);
 await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"Open navigation menu"}).click();await page.getByRole("link",{name:"Transactions",exact:true}).click();await expect(page.getByRole("heading",{name:"Transactions",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await page.screenshot({path:"/tmp/pactpay-mobile-demo.png",fullPage:true});
 const accounts=await wallet.getAddresses();await page.evaluate(account=>{(window as unknown as {__pactpayWallet:{setAccount:(account:string)=>void}}).__pactpayWallet.setAccount(account);},accounts[7]);await expect(page).toHaveURL(/\/login/);await context.close();
});
test("SME onboarding and private document submission through the browser",async({browser})=>{
 const {page,context}=await newWalletPage(browser,9);await signIn(page);await page.goto("/onboarding");const suffix=Date.now().toString();await page.getByLabel("Full name",{exact:true}).fill("Demo presenter");await page.getByLabel("Contact email",{exact:true}).fill(`presenter-${suffix}@example.invalid`);await page.getByLabel("Registered business name").fill(`Browser demo SME ${suffix}`);await page.getByLabel("Registration reference").fill("DEMO-REG-PRESENTER");await page.getByRole("button",{name:"Create workspace"}).click();await expect(page).toHaveURL(/\/app$/);await page.goto("/app/invoices/new");
 await page.getByLabel("Invoice reference",{exact:true}).fill(`BROWSER-${suffix}`);await page.getByLabel("Invoice face value (KES)").fill("500000.00");await page.getByLabel("Goods or services supplied").fill("Explicit browser demonstration invoice for sample produce delivery.");await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByLabel("Customer business name").fill("Private browser demo customer");await page.getByLabel("Customer email",{exact:true}).fill("private-browser@example.invalid");await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByLabel("Requested early advance (KES)").fill("450000");await page.getByLabel("Customer payment due date").fill(new Date(Date.now()+60*86400000).toISOString().slice(0,10));await page.getByRole("button",{name:"Continue",exact:true}).click();await page.locator('input[type="file"]').setInputFiles({name:"browser-demo.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")});await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Submit for verification",exact:true}).click();await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+$/);await expect(page.getByRole("link",{name:"Download",exact:true})).toBeVisible();await expect(page.getByText("In review",{exact:true})).toBeVisible();await page.screenshot({path:"/tmp/pactpay-sme-demo.png",fullPage:true});await context.close();
});
test("unsupported network and rejected SIWE signature do not create a session",async({browser})=>{const {page,context}=await newWalletPage(browser,6,{chainId:"0x1",rejectSignature:true});await page.goto("/login");await page.getByRole("button",{name:/^Connect (wallet|MetaMask)$/}).click();await page.getByRole("button",{name:"Switch to supported network"}).click();await page.getByRole("button",{name:"Sign in securely"}).click();await expect(page.getByRole("alert").filter({hasText:/wallet|request|rejected|couldn’t/i}).first()).toBeVisible();const session=await(await page.request.get("/api/v1/auth/session")).json();expect(session.data).toBeNull();await context.close();});
