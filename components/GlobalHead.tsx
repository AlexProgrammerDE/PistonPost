import Head from "next/head";

export function GlobalHead({
  title = "PistonPost",
  description = "Post like a pro."
}) {
  const url = "https://post.pistonmaster.net";
  const color = "#FCFDF2";
  const twitter = "@AlexProgrammer3";
  return (
    <Head>
      <meta charSet="utf-8" />

      <title>{title}</title>

      <meta name="format-detection" content="telephone=no" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />

      <meta name="application-name" content={title} />
      <meta name="description" content={description} />
      <meta name="format-detection" content="telephone=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="msapplication-TileColor" content={color} />
      <meta name="msapplication-tap-highlight" content="no" />
      <meta name="theme-color" content={color} />

      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content={title} />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-57x57.png"
        sizes="57x57"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-60x60.png"
        sizes="60x60"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-72x72.png"
        sizes="72x72"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-76x76.png"
        sizes="76x76"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-114x114.png"
        sizes="114x114"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-120x120.png"
        sizes="120x120"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-128x128.png"
        sizes="128x128"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-144x144.png"
        sizes="144x144"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-152x152.png"
        sizes="152x152"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-180x180.png"
        sizes="180x180"
      />
      <link
        rel="apple-touch-icon"
        href="/icons/apple-touch-icon-precomposed.png"
      />
      <meta
        name="msapplication-TileImage"
        content="/_icons/win8-tile-144x144.png"
      />
      <meta name="msapplication-TileColor" content={color} />
      <meta name="msapplication-navbutton-color" content={color} />
      <meta name="application-name" content={title} />
      <meta name="msapplication-tooltip" content={title} />
      <meta name="apple-mobile-web-app-title" content={title} />
      <meta
        name="msapplication-square70x70logo"
        content="/icons/win8-tile-70x70.png"
      />
      <meta
        name="msapplication-square144x144logo"
        content="/icons/win8-tile-144x144.png"
      />
      <meta
        name="msapplication-square150x150logo"
        content="/icons/win8-tile-150x150.png"
      />
      <meta
        name="msapplication-wide310x150logo"
        content="/icons/win8-tile-310x150.png"
      />
      <meta
        name="msapplication-square310x310logo"
        content="/icons/win8-tile-310x310.png"
      />

      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/icons/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/icons/favicon-16x16.png"
      />
      <link rel="manifest" href="/manifest.json" />
      <link rel="shortcut icon" href="/favicon.ico" />

      <meta name="twitter:card" content="summary" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content="/icons/android-chrome-192x192.png" />
      <meta name="twitter:creator" content={twitter} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={title} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content="/icons/apple-touch-icon.png" />
    </Head>
  );
}
