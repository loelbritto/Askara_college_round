import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import "./experience.css";
import "./product.css";
import "./onboarding.css";
import "./landing.css";
import "./review-workflow.css";
import { WorkspaceProvider } from "@/components/workspace-memory";
const inter = localFont({src:"../../public/fonts/inter-latin-variable.woff2",variable:"--font-inter",weight:"400 700",display:"swap"});
export const metadata: Metadata = {title:"Second Opinion — Evidence before confidence",description:"An evidence-first workbench for checking AI answers against your business policies.",icons:{icon:"/icon.svg"},robots:{index:false,follow:false}};
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  await headers();
  return <html lang="en" className={inter.variable} data-scroll-behavior="smooth"><body><WorkspaceProvider>{children}</WorkspaceProvider></body></html>;
}
