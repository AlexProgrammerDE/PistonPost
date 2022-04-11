import '../styles/globals.css'
import '../styles/fonts.css'
import type { AppProps } from 'next/app'
import {SessionProvider} from "next-auth/react";

// noinspection JSUnusedGlobalSymbols
export default function App({ Component, pageProps: { session, ...pageProps }, }: AppProps) {
  return (
      <SessionProvider session={session}>
        <Component {...pageProps} />
      </SessionProvider>
  )
}
