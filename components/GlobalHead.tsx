import Head from "next/head";
import {
  color,
  description as brandDescription,
  title as brandTitle,
  url
} from "../lib/branding";

export function GlobalHead({
  overrideTitle,
  overrideDescription
}: {
  overrideTitle?: string;
  overrideDescription?: string;
}) {
  const title = overrideTitle || brandTitle;
  const description = overrideDescription || brandDescription;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />

      <meta name="application-name" content={brandTitle} />
      <meta property="og:site_name" content={brandTitle} />
      <meta name="apple-mobile-web-app-title" content={brandTitle} />
      <meta name="msapplication-tooltip" content={brandTitle} />
      <meta name="apple-mobile-web-app-title" content={brandTitle} />

      <meta name="msapplication-TileColor" content={color} />
      <meta name="theme-color" content={color} />
      <meta name="msapplication-navbutton-color" content={color} />

      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
    </Head>
  );
}
