# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores under `/data` only the address of the Pinchflat server
read last, the names and counts of its sources, the ids of the videos already
seen (downloaded, failed), the counter of the day and the titles of the latest
videos. The user name and password of Pinchflat stay in the configuration of
Gladys: they are sent to Pinchflat only, in the `Authorization` header (basic
authentication: prefer HTTPS when Pinchflat is behind a reverse proxy), and
never written to the logs. The integration reads the pages of Pinchflat with
GET requests only, and keeps nothing else of them (paths, settings, tokens). It
only talks to the address configured, over the local network; no cloud service,
no inbound port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Pinchflat itself.
