import Head from "next/head";
import {
  color,
  description as brandDescription,
  title as brandTitle,
  twitter,
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

      <meta name="application-name" content={title} />
      <meta property="og:site_name" content={title} />

      <meta name="msapplication-TileColor" content={color} />
      <meta name="theme-color" content={color} />

      <meta name="apple-mobile-web-app-title" content={title} />

      <meta name="msapplication-TileColor" content={color} />
      <meta name="msapplication-navbutton-color" content={color} />
      <meta name="msapplication-tooltip" content={title} />
      <meta name="apple-mobile-web-app-title" content={title} />

      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:creator" content={twitter} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
    </Head>
  );
}
