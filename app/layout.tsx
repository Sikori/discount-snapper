import "./globals.css";

export const metadata = { title: "Discount Snapper", description: "Angebote in deiner Nähe finden" };
export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
