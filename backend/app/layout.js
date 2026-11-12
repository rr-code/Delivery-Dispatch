// STANDALONE ONLY: minimal shell so this project runs by itself. Skip when merging into your own app.
export const metadata = { title: "Delivery Dispatch API" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>{children}</body>
    </html>
  );
}
