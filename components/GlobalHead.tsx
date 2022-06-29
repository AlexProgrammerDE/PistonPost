import Head from "next/head";
import {
  color,
  description as brandDescription,
  title as brandTitle,
  url
} from "../lib/branding";

export function GlobalHead({
  overrideTitle,
  overrideDescription,
  overrideImage,
  overrideVideo,
  largeSummary
}: {
  overrideTitle?: string;
  overrideDescription?: string;
  overrideImage?: string;
  overrideVideo?: string;
  largeSummary?: boolean;
}) {
  const title = overrideTitle || brandTitle;
  const description = overrideDescription || brandDescription;
  const image = overrideImage || "/logo.webp";
  const pageType = overrideVideo ? "video.other" : "website";

  return (
    <Head>
      <title>{title}</title>
      <meta name="twitter:title" content={title} />
      <meta property="og:title" content={title} />

      <meta name="description" content={description} />
      <meta name="twitter:description" content={description} />
      <meta property="og:description" content={description} />

      <meta name="application-name" content={brandTitle} />
      <meta property="og:site_name" content={brandTitle} />
      <meta name="apple-mobile-web-app-title" content={brandTitle} />
      <meta name="msapplication-tooltip" content={brandTitle} />
      <meta name="apple-mobile-web-app-title" content={brandTitle} />

      <meta name="msapplication-TileColor" content={color} />
      <meta name="theme-color" content={color} />
      <meta name="msapplication-navbutton-color" content={color} />

      <meta name="twitter:url" content={url} />
      <meta property="og:url" content={url} />

      <meta property="og:type" content={pageType} />

      {!overrideVideo && (
        <>
          <meta property="og:image" content={image} />
          <meta name="twitter:image" content={image} />
        </>
      )}
      {overrideVideo && (
        <>
          <meta property="og:video" content={overrideVideo} />
          <meta property="og:video:secure_url" content={overrideVideo} />
          <meta property="og:video:type" content="application/mp4" />
        </>
      )}

      {largeSummary && (
        <meta name="twitter:card" content="summary_large_image" />
      )}
    </Head>
  );
}
