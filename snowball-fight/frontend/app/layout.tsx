import ChakraClientProvider from './components/ChakraClientProvider'

export const metadata = {
  title: 'Snowball Fight',
  description: 'Snowball Fight game',
  // Inline SVG favicon to avoid a 404 for /favicon.ico in dev
  icons: [
    {
      rel: 'icon',
      // simple snowflake emoji as an SVG data URL (percent-encoded)
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='14'%3E%E2%9D%84%EF%B8%8F%3C/text%3E%3C/svg%3E",
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ChakraClientProvider>{children}</ChakraClientProvider>
      </body>
    </html>
  )
}
