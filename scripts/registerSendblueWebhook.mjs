const url = process.env.SENDBLUE_WEBHOOK_URL; // set this in your shell
const key = process.env.SENDBLUE_API_KEY;
const secret = process.env.SENDBLUE_API_SECRET;
const hookSecret = process.env.SENDBLUE_WEBHOOK_SECRET || "demo-secret";

if (!url || !key || !secret) {
  console.error("Missing env: SENDBLUE_WEBHOOK_URL, SENDBLUE_API_KEY, SENDBLUE_API_SECRET");
  process.exit(1);
}

const resp = await fetch("https://api.sendblue.co/api/account/webhooks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "SB-API-KEY-ID": key,
    "SB-API-SECRET-KEY": secret,
  },
  body: JSON.stringify({
    receive: { url, secret: hookSecret },
  }),
});

const text = await resp.text();
console.log("Status:", resp.status);
console.log(text);
