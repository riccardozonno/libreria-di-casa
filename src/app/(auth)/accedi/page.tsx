import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/actor";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accedi" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { passo } = await searchParams;
  return <LoginForm initialStep={passo === "2fa" ? "totp" : "password"} />;
}
