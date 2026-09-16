import type { Metadata, Viewport } from "next";
import { Inter, Grand_Hotel } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Stands in for Instagram's Billabong wordmark.
const script = Grand_Hotel({
  variable: "--font-script",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Airball",
  description: "Post where you are. See who shows up.",
  appleWebApp: { capable: true, title: "Airball", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${script.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-page text-text">{children}</body>
    </html>
  );
}
