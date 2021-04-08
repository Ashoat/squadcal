// @flow

import html from 'common-tags/lib/html';
import type { $Response, $Request } from 'express';
import fs from 'fs';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import { promisify } from 'util';

import { waitForStream } from '../utils/json-stream';
import { getLandingURLFacts } from '../utils/urls';
import { getMessageForException } from './utils';

async function landingHandler(req: $Request, res: $Response) {
  try {
    await landingResponder(req, res);
  } catch (e) {
    console.warn(e);
    if (!res.headersSent) {
      res.status(500).send(getMessageForException(e));
    }
  }
}

const access = promisify(fs.access);
const googleFontsURL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500&display=swap';
const localFontsURL = 'fonts/local-fonts.css';
async function getFontsURL() {
  try {
    await access(localFontsURL);
    return localFontsURL;
  } catch {
    return googleFontsURL;
  }
}

type AssetInfo = {| +jsURL: string, +fontsURL: string, +cssInclude: string |};
let assetInfo: ?AssetInfo = null;
async function getAssetInfo() {
  if (assetInfo) {
    return assetInfo;
  }
  if (process.env.NODE_ENV === 'dev') {
    const fontsURL = await getFontsURL();
    assetInfo = {
      jsURL: 'http://localhost:8082/dev.build.js',
      fontsURL,
      cssInclude: '',
    };
    return assetInfo;
  }
  // $FlowFixMe landing/dist doesn't always exist
  const { default: assets } = await import('landing/dist/assets');
  assetInfo = {
    jsURL: `compiled/${assets.browser.js}`,
    fontsURL: googleFontsURL,
    cssInclude: html`
      <link
        rel="stylesheet"
        type="text/css"
        href="compiled/${assets.browser.css}"
      />
    `,
  };
  return assetInfo;
}

let webpackCompiledRootComponent: ?React.ComponentType<{||}> = null;
async function getWebpackCompiledRootComponentForSSR() {
  if (webpackCompiledRootComponent) {
    return webpackCompiledRootComponent;
  }
  try {
    // $FlowFixMe landing/dist doesn't always exist
    const webpackBuild = await import('landing/dist/landing.build.cjs');
    webpackCompiledRootComponent = webpackBuild.default.default;
    return webpackCompiledRootComponent;
  } catch {
    throw new Error(
      'Could not load landing.build.cjs. ' +
        'Did you forget to run `yarn dev` in the landing folder?',
    );
  }
}

const { basePath } = getLandingURLFacts();
const { renderToNodeStream } = ReactDOMServer;

async function landingResponder(req: $Request, res: $Response) {
  const [{ jsURL, fontsURL, cssInclude }, Landing] = await Promise.all([
    getAssetInfo(),
    getWebpackCompiledRootComponentForSSR(),
  ]);

  // prettier-ignore
  res.write(html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Comm</title>
        <base href="${basePath}" />
        <link rel="stylesheet" type="text/css" href="${fontsURL}" />
        ${cssInclude}
      </head>
      <body>
        <div id="react-root">
  `);

  const reactStream = renderToNodeStream(<Landing />);
  reactStream.pipe(res, { end: false });
  await waitForStream(reactStream);

  // prettier-ignore
  res.end(html`</div>
        <script src="${jsURL}"></script>
      </body>
    </html>
  `);
}

export default landingHandler;