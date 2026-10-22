# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Pinchflat in Gladys: one device for the server (online, videos downloaded
  today, pending, in error, sources, videos downloaded in total, last video
  downloaded).
- Scene triggers: a video was downloaded, a download failed (both can be
  filtered on a source, with the title, the source and the link to the video).
- Scene action: read the latest videos (a sentence for a message or a voice
  announcement, and the figures).
- A dashboard widget: downloaded today, pending, in error, and the latest
  videos.
- Configuration: address, user name and password (basic authentication of
  Pinchflat), refresh interval, language of the feature names. Documentation in
  English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-pinchflat/commits/main
