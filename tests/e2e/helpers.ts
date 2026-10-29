import { expect, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./seed-data";

let ipCounter = 0;

/**
 * Ogni test simula un client diverso (come farebbe cloudflared con CF-Connecting-IP):
 * altrimenti tutti i login condividono il limite di 10 al minuto per IP.
 */
export async function setDistinctClientIp(page: Page): Promise<void> {
  ipCounter += 1;
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": `198.18.${Math.floor(ipCounter / 250)}.${ipCounter % 250}` });
}

export async function login(page: Page, who: keyof typeof E2E_USERS): Promise<void> {
  await setDistinctClientIp(page);
  await page.goto("/accedi");
  await page.getByLabel("Email").fill(E2E_USERS[who].email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Catalogo", level: 1 })).toBeVisible();
}
