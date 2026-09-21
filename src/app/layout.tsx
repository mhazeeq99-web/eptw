import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ePTW — Permit to Work",
    template: "%s | ePTW",
  },

  description:
    "Electronic Permit to Work system for streamlined safety management",

  keywords: [
    "permit to work",
    "ePTW",
    "safety",
    "work permit",
    "LOTO",
    "JHA",
    "HIRARC",
  ],

  authors: [{ name: "ePTW System" }],
  creator: "ePTW",
  publisher: "ePTW",

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },

  manifest: "/manifest.json",

  openGraph: {
    type: "website",
    locale: "en_MY",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "ePTW",
    title: "ePTW — Electronic Permit to Work",
    description:
      "Streamlined safety management for permit to work systems",
  },

  twitter: {
    card: "summary_large_image",
    title: "ePTW — Electronic Permit to Work",
    description:
      "Streamlined safety management for permit to work systems",
  },

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,

  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#ffffff",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#0a0a0a",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var storageKey = "eptw-theme";
                  var theme = localStorage.getItem(storageKey);

                  if (!theme) {
                    theme = window.matchMedia(
                      "(prefers-color-scheme: dark)"
                    ).matches
                      ? "dark"
                      : "light";
                  }

                  document.documentElement.classList.toggle(
                    "dark",
                    theme === "dark"
                  );

                  document.documentElement.style.colorScheme = theme;

                  document.documentElement.setAttribute(
                    "data-theme",
                    theme
                  );
                } catch (e) {
                  try {
                    var dark = window.matchMedia(
                      "(prefers-color-scheme: dark)"
                    ).matches;

                    document.documentElement.classList.toggle(
                      "dark",
                      dark
                    );

                    document.documentElement.style.colorScheme =
                      dark ? "dark" : "light";

                    document.documentElement.setAttribute(
                      "data-theme",
                      dark ? "dark" : "light"
                    );
                  } catch (_) {}
                }
              })();
            `,
          }}
        />
      </head>

      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}