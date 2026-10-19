import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "AirSense",
  description:
    "Tomorrow's PM2.5 air quality for Johannesburg, Cape Town, Durban and Emalahleni.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <a href="/" className="wordmark">AirSense</a>
            <Nav />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="site-footer">
          Values are a regional model estimate on a grid of about 45 km, not a
          reading from a station on your street.
        </footer>
      </body>
    </html>
  );
}