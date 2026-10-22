# Pinchflat

Bring your [Pinchflat](https://github.com/kieraneglin/pinchflat) server (the
self-hosted downloader of YouTube channels and playlists, based on yt-dlp) into
Gladys, over your local network: the videos downloaded today, the queue, the
failed downloads, the latest videos on a dashboard, and scenes that react when a
new video arrives or when a download fails.

The integration was tested against a real Pinchflat 2025.9.26 (the official
Docker image, downloading a real video), not yet in a real Gladys installation:
feedback is welcome on the [Gladys forum](https://community.gladysassistant.com)
or in the [issues](https://github.com/guim31/gladys-pinchflat/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **Pinchflat** server, reachable from Gladys (same network), on the port of
  its web interface (`8945` by default).
- When the interface asks for a password (`BASIC_AUTH_USERNAME` and
  `BASIC_AUTH_PASSWORD` of Pinchflat), that user name and password.

## Set up

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Address** of Pinchflat (for example
   `192.168.1.2:8945`; without a port, `8945` is used) and, if the interface is
   protected, the **User name** and **Password**.
3. Save, then click **Test the connection**: the message under the button gives
   the version of Pinchflat, the sources, the pending videos and the errors.
4. Open the **Discover** tab: one device for the server. Click **Add**, pick a
   room and save.

Options:

- **Refresh interval**: 1 to 10 minutes (2 minutes by default).
- **Language of the feature names**: the names given to the features when the
  device is added (French by default), and the language of the sentence of the
  scene action.

Pinchflat has no API: the integration reads the pages of its web interface (the
list of sources, and the page of a source), exactly like a browser. It never
submits a form and never changes anything in Pinchflat.

## The device

One device, **Pinchflat** followed by the address of the server:

| Feature               | What it gives                                           |
| --------------------- | ------------------------------------------------------- |
| Online                | 1 when Pinchflat answers, 0 otherwise                   |
| Downloaded today      | videos downloaded since midnight (local time of Gladys) |
| Pending videos        | videos waiting to be downloaded, all sources together   |
| Videos in error       | pending videos whose last download failed               |
| Sources               | channels and playlists followed                         |
| Downloaded videos     | videos on disk, all sources together                    |
| Last video downloaded | its title and its source, as text                       |

The figures move at each reading. **Videos in error** counts the errors shown
in the first page of the pending videos of each source (its 10 most recent
uploads).

## Dashboard

The **Pinchflat videos** widget shows three tiles (downloaded today, pending, in
error) and the list of the latest videos downloaded: title, source and date.
Add it from the dashboard editor; it needs no setting, and it works before the
device is added.

## Scenes

### Triggers

- **Pinchflat video downloaded**: a new video of a source has just been
  downloaded. Filter: **Source** (the name of the channel or playlist exactly as
  Pinchflat shows it; empty: any). Information passed on to the actions: the
  source, the title of the video, its upload date on YouTube, the page of the
  video in Pinchflat, and the number of videos downloaded today.
- **Pinchflat download failed**: the download of a pending video failed (video
  unavailable, members only, blocked, yt-dlp error). Same filter. Information:
  the source, the title, the error message and the page of the video.

Each video is announced once, even after a restart of the integration. What
Pinchflat already had when the integration started (or when a source is added)
is not announced.

### Actions

- **Read the latest Pinchflat videos**: reads Pinchflat now and gives a sentence
  for a message or a voice announcement, such as “Pinchflat: 2 videos downloaded
  today; latest: “…” (…), “…” (…). 4 pending, 1 in error.”, with the figures
  separately (downloaded today, pending, in error, title and source of the last
  video). Option: the number of videos named in the sentence (3 by default).

### Scene ideas

- When a video of your favorite channel is downloaded, send yourself a message:
  “New on the media server: {title} ({source})”.
- At 7 pm, read the latest Pinchflat videos and announce the sentence on the
  living room speaker.
- When a download fails, send the error message, so you can update the cookies
  of yt-dlp or check the video.

## Troubleshooting

- **“Pinchflat does not answer”**: check the address and the port (`8945`), and
  that Gladys can reach the server (same network, firewall).
- **“User name or password refused or missing”**: the interface is protected;
  enter the `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` of Pinchflat.
- **“The address redirects”**: a reverse proxy sends to a login page or to
  HTTPS; enter the direct address of Pinchflat on your network.
- **“No Pinchflat at this address”**: another service answers on this port.
- No event for a video: Pinchflat lists the downloaded videos by upload date;
  an old video downloaded late (the backfill of a new source) is counted in
  “Downloaded today”, without a scene event.
- More details: set the `LOG_LEVEL` of the integration to `debug` and open its
  logs.

## Limits

- Read only: the integration cannot add a source, start a download or retry
  one (Pinchflat has no API for that).
- A failed download is seen at the next reading of its source: within 15
  minutes. Only the 10 most recent pending videos of each source are checked
  for errors.
- At most 10 source pages are read per refresh: with many sources, the first
  readings take a few refreshes, and a burst of downloads is announced 10 at a
  time.
- The integration reads the web pages of Pinchflat 2025.9.26: a future version
  that changes them may need an update of the integration.
- Not affiliated with Pinchflat, YouTube or Google.
