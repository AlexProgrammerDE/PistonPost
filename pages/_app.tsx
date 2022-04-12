import '../styles/globals.css'
import '../styles/fonts.css'
import type {AppProps} from 'next/app'
import {SessionProvider} from "next-auth/react";
import {NextComponentType} from "next";
import Auth from '../components/Auth';

type CustomAppProps = AppProps & {
  Component: NextComponentType & { auth?: boolean } // add auth type
}

// noinspection JSUnusedGlobalSymbols
export default function App({Component, pageProps: {session, ...pageProps},}: CustomAppProps) {
  return (
      <SessionProvider session={session}>
        {Component.auth ? (
            <Auth>
              <Component {...pageProps} />
            </Auth>
        ) : (
            <Component {...pageProps} />
        )}
      </SessionProvider>
  )
}


